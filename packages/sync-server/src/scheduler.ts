// @ts-strict-ignore
// [eb] Scheduled auto-sync: runs every 6 hours when ENABLE_AUTO_SYNC=true.
// Calls Enable Banking service functions directly (no internal HTTP) so no
// auth headers are needed. Per-session grouping ensures consent expiry is
// checked once per bank connection and one user's failure doesn't block others.
import cron from 'node-cron';

import { getAccountDb } from './account-db.js';
import {
  getBalances,
  getTransactions,
} from './app-enablebanking/enablebanking-service.js';
import { normalizeTransaction } from './app-enablebanking/utils.js';
import { RateLimitError, SessionExpiredError } from './app-enablebanking/errors.js';

type AccountRow = {
  actual_account_id: string;
  eb_account_uid: string;
  session_id: string;
  valid_until: string | null;
  aspsp_name: string | null;
};

async function syncOneAccount(account: AccountRow): Promise<void> {
  const db = getAccountDb();

  // Derive sinceDate from last successful sync (epoch integer -> YYYY-MM-DD).
  const row = db.first(
    'SELECT synced_at FROM eb_sync_log WHERE actual_account_id = ? ORDER BY id DESC LIMIT 1',
    [account.actual_account_id],
  );
  const sinceDate = row?.synced_at
    ? new Date(Number(row.synced_at) * 1000).toISOString().split('T')[0]
    : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const { booked, pending } = await getTransactions(
    account.eb_account_uid,
    sinceDate,
  );
  await getBalances(account.eb_account_uid);

  const allNormalized = [
    ...booked.map(t => normalizeTransaction(t, true)),
    ...pending.map(t => normalizeTransaction(t, false)),
  ];

  db.mutate(
    `INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, transactions_added)
     VALUES (?, ?, 'ok', ?)`,
    [account.actual_account_id, account.eb_account_uid, allNormalized.length],
  );

  console.log(
    `[scheduler] Synced ${account.actual_account_id}: ${allNormalized.length} transactions`,
  );
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScheduledSync(): Promise<void> {
  console.log('[scheduler] Starting scheduled sync run');

  const db = getAccountDb();

  const rows = db.all(
    `SELECT m.actual_account_id, m.eb_account_uid, m.session_id,
            s.valid_until, s.aspsp_name
     FROM eb_account_map m
     JOIN eb_sessions s ON s.id = m.session_id
     WHERE m.actual_account_id IS NOT NULL
     ORDER BY m.session_id`,
    [],
  ) as unknown as AccountRow[];

  // Group accounts by session so consent expiry is checked once per bank
  // connection and one session's failure doesn't block other users.
  const sessionGroups = new Map<string, AccountRow[]>();
  for (const row of rows) {
    const group = sessionGroups.get(row.session_id) ?? [];
    group.push(row);
    sessionGroups.set(row.session_id, group);
  }

  let totalSessions = 0;
  let totalSynced = 0;
  let totalErrors = 0;

  for (const [sessionId, accounts] of sessionGroups) {
    totalSessions++;
    const aspspName = accounts[0]?.aspsp_name ?? 'unknown';
    const validUntil = accounts[0]?.valid_until;

    // Check consent expiry once per session group.
    if (validUntil && new Date(validUntil) < new Date()) {
      console.log(
        `[scheduler] Skipping session ${sessionId} (${aspspName}): consent expired (${accounts.length} accounts)`,
      );
      continue;
    }

    let successCount = 0;

    for (const account of accounts) {
      try {
        await syncOneAccount(account);
        successCount++;
        totalSynced++;
      } catch (err) {
        if (err instanceof RateLimitError) {
          // A 429 applies to the entire API connection - don't sleep or retry.
          console.log(
            `[scheduler] Rate limited on session ${sessionId} (${aspspName}), skipping remaining accounts in session`,
          );
          break;
        }
        if (err instanceof SessionExpiredError) {
          console.log(
            `[scheduler] Session ${sessionId} expired mid-sync, skipping remaining accounts`,
          );
          break;
        }
        // Transient error (network, 5xx): wait 30s and retry once.
        await sleep(30000);
        try {
          await syncOneAccount(account);
          successCount++;
          totalSynced++;
        } catch (retryErr) {
          console.error(
            `[scheduler] Failed to sync ${account.actual_account_id} after retry:`,
            retryErr,
          );
          const retryDb = getAccountDb();
          retryDb.mutate(
            `INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, error_message)
             VALUES (?, ?, 'error', ?)`,
            [
              account.actual_account_id,
              account.eb_account_uid,
              retryErr instanceof Error ? retryErr.message : String(retryErr),
            ],
          );
          totalErrors++;
        }
      }
    }

    console.log(
      `[scheduler] Session ${sessionId} (${aspspName}): synced ${successCount}/${accounts.length} accounts`,
    );
  }

  console.log(
    `[scheduler] Sync run complete. ${totalSessions} sessions, ${totalSynced} accounts synced, ${totalErrors} errors.`,
  );
}

// [eb] Registers the 6-hour cron job. No-op when ENABLE_AUTO_SYNC is not 'true'.
export function startScheduler(): void {
  if (process.env.ENABLE_AUTO_SYNC !== 'true') {
    console.log(
      '[scheduler] Auto-sync disabled (ENABLE_AUTO_SYNC not set to true)',
    );
    return;
  }

  // 5-field cron: at minute 0, hours 0/6/12/18 every day
  cron.schedule('0 0,6,12,18 * * *', () => {
    runScheduledSync().catch(err => {
      console.error('[scheduler] Unhandled error in sync run:', err);
    });
  });

  console.log('[scheduler] Auto-sync scheduled (every 6 hours)');
}
