// @ts-strict-ignore
import express from 'express';

import { getAccountDb } from '../account-db.js';
import {
  requestLoggerMiddleware,
  validateSessionMiddleware,
} from '../util/middlewares.js';

import {
  createAuth,
  exchangeCode,
  getAspsps,
  getBalances,
  getTransactions,
  testAuth,
} from './enablebanking-service.js';
import { runMigrations } from './migrations.js';
import { handleError } from './util/handle-error.js';
import {
  extractBalance,
  normalizeAccount,
  normalizeTransaction,
} from './utils.js';

// Run migrations at module load time so tables are ready before any route fires.
runMigrations();

const app = express();
app.use(requestLoggerMiddleware);

// ---------------------------------------------------------------------------
// UNAUTHENTICATED ROUTES (placed before export so browser redirects from the
// bank work without an Actual user session in the cookie)
// ---------------------------------------------------------------------------

// Health-check route to verify JWT auth against Enable Banking during development.
// Placed before session middleware intentionally - no Actual session required.
app.get('/test-auth', async (req, res) => {
  try {
    await testAuth();
    res.send({ status: 'ok', data: { configured: true } });
  } catch (err) {
    res.send({
      status: 'ok',
      data: { configured: false, reason: err.message },
    });
  }
});

// OAuth callback from the bank's redirect. The bank appends ?code=...&state=...
// to the redirect URL. We validate the state against eb_sessions (CSRF guard),
// exchange the code for a real session, persist accounts, then redirect to /link.
app.get(
  '/callback',
  handleError(async (req, res) => {
    const { code, state } = req.query;

    if (!state) {
      return res.status(400).send('Missing state parameter');
    }

    const db = getAccountDb();

    // CSRF guard: state must exist in eb_sessions (inserted at create-auth time).
    const sessionRow = db.first('SELECT * FROM eb_sessions WHERE state = ?', [
      state,
    ]);

    if (!sessionRow) {
      return res.status(400).send('Invalid or expired state parameter');
    }

    // Exchange the authorization code for a real Enable Banking session.
    const { session_id, accounts, valid_until } = await exchangeCode(code);

    // Update the session row with the real session ID and account list.
    db.mutate(
      'UPDATE eb_sessions SET id = ?, accounts = ?, valid_until = ? WHERE state = ?',
      [session_id, JSON.stringify(accounts), valid_until ?? null, state],
    );

    // Pre-populate eb_account_map for each account returned by the session.
    // actual_account_id is left NULL here - it is filled in at link time by
    // the enablebanking-accounts-link IPC handler via POST /update-account-map.
    //
    // CRITICAL: Uses account.uid (UUID string from Enable Banking), NOT
    // account.account_id (which is an object like { iban: "..." }).
    // This MUST match normalizeAccount() in utils.js so the UID stored here
    // equals the account_id field that SelectLinkedAccountsModal receives.
    for (const account of accounts) {
      const ebAccountUid = account.uid;
      db.mutate(
        'INSERT OR IGNORE INTO eb_account_map (eb_account_uid, session_id) VALUES (?, ?)',
        [ebAccountUid, session_id],
      );
    }

    // Redirect to the link page which auto-closes the popup.
    res.redirect('/enablebanking/link?state=' + encodeURIComponent(state));
  }),
);

// Static page that auto-closes the OAuth popup after the callback completes.
// Inlined to avoid path issues between src/ and build/ directories.
app.get('/link', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Actual</title></head>
<body><script>window.close();</script>
<p>Please wait...</p>
<p>The window should close automatically. If nothing happened you can close this window or tab.</p>
</body></html>`);
});

export { app as handlers };
app.use(express.json());
app.use(validateSessionMiddleware);

// ---------------------------------------------------------------------------
// AUTHENTICATED ROUTES (behind session middleware)
// ---------------------------------------------------------------------------

// Production health check - verifies Enable Banking configuration and JWT signing.
app.post(
  '/status',
  handleError(async (req, res) => {
    const keyPath = process.env.ENABLE_BANKING_KEY_PATH;
    const bankingAppId = process.env.ENABLE_BANKING_APP_ID;

    if (!bankingAppId || !keyPath) {
      return res.send({
        status: 'ok',
        data: {
          configured: false,
          reason: 'Missing ENABLE_BANKING_APP_ID or ENABLE_BANKING_KEY_PATH',
        },
      });
    }

    try {
      await testAuth();
      res.send({ status: 'ok', data: { configured: true } });
    } catch (err) {
      res.send({
        status: 'ok',
        data: { configured: false, reason: err.message },
      });
    }
  }),
);

// Returns list of supported banks (ASPSPs) for a given ISO country code.
app.post(
  '/get-banks',
  handleError(async (req, res) => {
    const { country } = req.body || {};
    const result = await getAspsps(country);
    res.send({ status: 'ok', data: result.aspsps || [] });
  }),
);

// Initiates an OAuth bank-link flow. Generates a UUID state for CSRF protection,
// stores a pending session row, calls Enable Banking POST /auth, and returns the
// bank's redirect URL plus the state token for the client to poll with.
app.post(
  '/create-auth',
  handleError(async (req, res) => {
    const { aspspName, aspspCountry } = req.body || {};

    // UUID state for CSRF protection - validated in /callback.
    const state = crypto.randomUUID();

    const db = getAccountDb();

    // Insert a pending session. id = state is a temporary placeholder until
    // /callback exchanges the code and sets id = real session_id.
    db.mutate(
      'INSERT INTO eb_sessions (id, state, aspsp_name, aspsp_country) VALUES (?, ?, ?, ?)',
      [state, state, aspspName ?? null, aspspCountry ?? null],
    );

    const redirectUrl =
      process.env.ENABLE_BANKING_REDIRECT_URL ||
      'http://localhost:5006/enablebanking/callback';

    const result = await createAuth({
      aspspName,
      aspspCountry,
      redirectUrl,
      state,
    });

    res.send({ status: 'ok', data: { url: result.url, state } });
  }),
);

// Polls for session completion after the OAuth callback. Returns normalized
// accounts when the session is ready (accounts column populated), otherwise
// returns an empty data object for the client to retry.
//
// CRITICAL: Raw EB account objects do NOT carry aspsp_name - it lives only at
// the session level (stored in eb_sessions.aspsp_name at create-auth time).
// We enrich each account before passing to normalizeAccount() so the institution
// field is populated and SelectLinkedAccountsModal shows the bank name.
app.post(
  '/get-accounts',
  handleError(async (req, res) => {
    const { state } = req.body || {};

    const db = getAccountDb();
    const sessionRow = db.first('SELECT * FROM eb_sessions WHERE state = ?', [
      state,
    ]);

    if (!sessionRow || !sessionRow.accounts) {
      // Session not yet complete - client should retry.
      return res.send({ status: 'ok', data: {} });
    }

    const parsedAccounts = JSON.parse(sessionRow.accounts as string);
    const accounts = parsedAccounts.map(account =>
      normalizeAccount(
        { ...account, aspsp_name: sessionRow.aspsp_name },
        sessionRow.id,
      ),
    );

    res.send({ status: 'ok', data: { accounts } });
  }),
);

// Fetches and normalizes transactions for an account from startDate onward.
// Looks up the account in eb_account_map by actual_account_id OR eb_account_uid
// (syncAccount() may pass either depending on call context).
//
// NULL GUARD: If the account has not been mapped (link flow not completed),
// returns ACCOUNT_NOT_MAPPED error in status:ok wrapper so loot-core's post()
// helper unwraps it and downloadEnableBankingTransactions() can check error_code.
// This matches the GoCardless error pattern (app-gocardless.js:213-222).
app.post(
  '/transactions',
  handleError(async (req, res) => {
    const { accountId, startDate } = req.body || {};

    const db = getAccountDb();

    const mapRow = db.first(
      'SELECT * FROM eb_account_map WHERE actual_account_id = ? OR eb_account_uid = ?',
      [accountId, accountId],
    );

    if (!mapRow) {
      return res.send({
        status: 'ok',
        data: { error_code: 'ACCOUNT_NOT_MAPPED', error_type: 'SYNC_ERROR' },
      });
    }

    const ebAccountUid = mapRow.eb_account_uid;

    // actual_account_id from the map row is the Actual Budget UUID (populated
    // at link time by /update-account-map). We use it for the sync log so that
    // /sync-status queries by Actual UUID succeed. accountId in req.body may be
    // an EB UID when called from the scheduler, so we never use it for logging.
    const logActualId = mapRow.actual_account_id || accountId;
    const logEbUid = mapRow.eb_account_uid;

    try {
      const { booked, pending } = await getTransactions(
        ebAccountUid,
        startDate,
      );
      const normalizedBooked = booked.map(t => normalizeTransaction(t, true));
      const normalizedPending = pending.map(t =>
        normalizeTransaction(t, false),
      );

      const balancesData = await getBalances(ebAccountUid);
      const extractedBalance = extractBalance(
        balancesData.balances ?? balancesData,
      );

      db.mutate(
        `INSERT INTO eb_sync_log
          (actual_account_id, eb_account_uid, status, transactions_added)
          VALUES (?, ?, 'ok', ?)`,
        [
          logActualId,
          logEbUid,
          normalizedBooked.length + normalizedPending.length,
        ],
      );

      res.send({
        status: 'ok',
        data: {
          transactions: { all: [...normalizedBooked, ...normalizedPending] },
          balances: extractedBalance,
          startingBalance: extractedBalance,
        },
      });
    } catch (err) {
      db.mutate(
        `INSERT INTO eb_sync_log
          (actual_account_id, eb_account_uid, status, error_message)
          VALUES (?, ?, 'error', ?)`,
        [logActualId, logEbUid, err.message ?? String(err)],
      );
      throw err;
    }
  }),
);

// Removes all data associated with an Enable Banking session (account map rows
// and the session itself). Called when the user unlinks a bank.
app.post(
  '/remove-session',
  handleError(async (req, res) => {
    const { sessionId } = req.body || {};
    const db = getAccountDb();
    db.mutate('DELETE FROM eb_account_map WHERE session_id = ?', [sessionId]);
    db.mutate('DELETE FROM eb_sessions WHERE id = ?', [sessionId]);
    res.send({ status: 'ok' });
  }),
);

// Returns the last sync log entry per requested account (by Actual UUID),
// extended with consent expiry and session identity from eb_sessions so
// the client can display banner warnings and the per-account consent column.
//
// Never-synced accounts (null lastEntry) receive explicit defaults so the
// client always sees all expected fields rather than undefined.
//
// Note: synced_at is stored as a Unix epoch INTEGER in eb_sync_log.
// It is converted to an ISO string here so the client receives a consistent
// format regardless of how the value was written.
app.post(
  '/sync-status',
  handleError(async (req, res) => {
    const { accountIds } = req.body || {};
    const db = getAccountDb();
    const statuses = {};

    for (const accountId of accountIds || []) {
      const lastEntry = db.first(
        'SELECT * FROM eb_sync_log WHERE actual_account_id = ? ORDER BY id DESC LIMIT 1',
        [accountId],
      );

      const mapRow = db.first(
        'SELECT session_id FROM eb_account_map WHERE actual_account_id = ?',
        [accountId],
      );
      const session = mapRow
        ? db.first(
            'SELECT valid_until, aspsp_name, aspsp_country FROM eb_sessions WHERE id = ?',
            [mapRow.session_id],
          )
        : null;

      // Null-guard: when lastEntry is null (account linked but never synced),
      // provide explicit defaults so the client always sees all expected fields.
      const defaultEntry = {
        synced_at: null,
        status: null,
        error_message: null,
        transactions_added: 0,
        transactions_updated: 0,
        error_code: null,
      };

      statuses[accountId] = {
        ...(lastEntry ?? defaultEntry),
        // Convert synced_at from Unix epoch integer to ISO string for the client.
        synced_at: lastEntry?.synced_at
          ? new Date(Number(lastEntry.synced_at) * 1000).toISOString()
          : null,
        consent_valid_until: session?.valid_until ?? null,
        session_id: mapRow?.session_id ?? null,
        aspsp_name: session?.aspsp_name ?? null,
        aspsp_country: session?.aspsp_country ?? null,
      };
    }

    res.send({ status: 'ok', data: { statuses } });
  }),
);

// Updates eb_account_map to point all accounts from an old session to the new
// one after a re-authorization flow. Called by the client modal once the OAuth
// callback has completed and a new session_id is available.
app.post(
  '/reauth-complete',
  handleError(async (req, res) => {
    const { newSessionId, oldSessionId } = req.body || {};
    if (!newSessionId || !oldSessionId) {
      return res.send({ status: 'ok', data: { error_code: 'INVALID_INPUT' } });
    }
    const db = getAccountDb();

    // Update all account map rows from old session to new session
    db.mutate('UPDATE eb_account_map SET session_id = ? WHERE session_id = ?', [
      newSessionId,
      oldSessionId,
    ]);

    console.log(
      `[eb] Re-auth complete: session ${oldSessionId} -> ${newSessionId}`,
    );

    res.send({ status: 'ok', data: {} });
  }),
);

// Populates actual_account_id in eb_account_map at account link time.
// Called by the enablebanking-accounts-link IPC handler (loot-core app.ts)
// immediately after the Actual account is created or upgraded.
// This is what makes /sync-status work: without actual_account_id in the map,
// /transactions cannot log by Actual UUID and status queries return no results.
app.post(
  '/update-account-map',
  handleError(async (req, res) => {
    const { ebAccountUid, actualAccountId } = req.body || {};

    if (!ebAccountUid || !actualAccountId) {
      return res.send({
        status: 'ok',
        data: {
          error_code: 'INVALID_INPUT',
          error_type: 'validation-error',
        },
      });
    }

    const db = getAccountDb();

    // Verify the EB account UID exists in the map before updating.
    const existing = db.first(
      'SELECT eb_account_uid FROM eb_account_map WHERE eb_account_uid = ?',
      [ebAccountUid],
    );

    if (!existing) {
      return res.send({
        status: 'ok',
        data: {
          error_code: 'ACCOUNT_NOT_FOUND',
          error_type: 'validation-error',
        },
      });
    }

    db.mutate(
      'UPDATE eb_account_map SET actual_account_id = ? WHERE eb_account_uid = ?',
      [actualAccountId, ebAccountUid],
    );
    res.send({ status: 'ok' });
  }),
);
