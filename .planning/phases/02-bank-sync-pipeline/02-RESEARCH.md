# Phase 2: Bank Sync Pipeline - Research

**Researched:** 2026-02-18
**Domain:** Enable Banking OAuth flow, bank sync pipeline, loot-core sync extension, React UI for bank linking, transaction deduplication, categorization rules, sync logging
**Confidence:** HIGH

## Summary

Phase 2 wires Enable Banking end-to-end: OAuth bank authorization, account linking, transaction import with deduplication, balance updates, pending/booked visual status, multi-session support, sync logging, and EU merchant categorization rules.

The architecture is clear because Actual Budget already implements three other bank sync providers (GoCardless, SimpleFin, PluggyAI). Enable Banking follows the exact same structural pattern at every layer. The key insight is that the data pipeline - `normalizeBankSyncTransactions()` -> `reconcileTransactions()` -> `batchUpdateTransactions()` - is already written and shared. Phase 2 adds one new provider branch to `syncAccount()` in `sync.ts`, one new sync-server route module filling in the remaining routes, one new UI flow mirroring the GoCardless modal chain, and a scheduler.

Enable Banking uses snake_case field names (`transaction_amount`, `booking_date`, `credit_debit_indicator`) while `normalizeBankSyncTransactions()` expects camelCase GoCardless-style fields (`transactionAmount.amount`, `bookingDate`, `booked: boolean`). The normalizer in `utils.js` of the new `app-enablebanking/` module is the translation layer. Getting this mapping exactly right is the highest-risk task in the phase.

The deduplication requirement is already largely handled by `reconcileTransactions()` which matches on `imported_id` first, then fuzzy-matches by amount+date within a 7-day window. The Enable Banking normalizer must populate `transactionId` (from `entry_reference`) as the stable dedup key across pending-to-booked transitions.

**Primary recommendation:** Follow the GoCardless adapter pattern exactly at every layer. Do not invent new patterns. The existing infrastructure handles 95% of the work.

## Phase Foundation: What Phase 1 Built

Phase 1 delivered the following already in the codebase (verified from direct file inspection):

| File                                                                  | Status       | What It Contains                                                                                          |
| --------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------- |
| `packages/sync-server/src/app-enablebanking/app-enablebanking.js`     | EXISTS       | Express scaffold: `GET /test-auth` (unauthenticated), `POST /status` (session-auth). No other routes yet. |
| `packages/sync-server/src/app-enablebanking/enablebanking-service.js` | EXISTS       | `loadPrivateKey()`, `generateJWT()`, `ebRequest()`, `testAuth()`. The core JWT/RSA auth layer.            |
| `packages/sync-server/src/app-enablebanking/util/handle-error.js`     | EXISTS       | Copied from GoCardless pattern.                                                                           |
| `packages/sync-server/src/app.ts`                                     | MODIFIED     | Mounts `enableBankingApp.handlers` at `/enablebanking`. Already committed.                                |
| `packages/loot-core/src/types/models/account.ts`                      | NOT MODIFIED | `AccountSyncSource = 'simpleFin'                                                                          | 'goCardless' | 'pluggyai'`-`'enableBanking'` not yet added. |
| `packages/loot-core/src/server/accounts/sync.ts`                      | NOT MODIFIED | `syncAccount()` has no `'enableBanking'` branch.                                                          |
| `packages/loot-core/src/server/server-config.ts`                      | NOT MODIFIED | No `ENABLEBANKING_SERVER` key.                                                                            |
| `packages/desktop-client`                                             | NOT MODIFIED | No Enable Banking UI components.                                                                          |

Phase 2 fills everything that Phase 1 left as scaffold.

<phase_requirements>

## Phase Requirements

| ID      | Description                                                                                                                                         | Research Support                                                                                                                                                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SYNC-01 | User can initiate Enable Banking OAuth flow and authorize bank access via redirect to their bank's login page                                       | POST /auth to Enable Banking API returns a `url` field. Open it with `window.Actual.openURLInBrowser(url)`. Sync-server handles the callback at `GET /enablebanking/callback`, exchanges the code via POST /sessions, stores session in account.sqlite.                   |
| SYNC-02 | User can link bank accounts to Actual accounts after OAuth authorization completes                                                                  | Mirrors GoCardless `select-linked-accounts` modal. Requires new `enablebanking-accounts-link` IPC handler in `app.ts`, new `SelectLinkedAccountsModalProps` union variant for `enableBanking`.                                                                            |
| SYNC-03 | User can trigger a manual sync that imports transactions from linked bank accounts with deduplication (handles pending-to-booked state transitions) | `syncAccount()` calls `downloadEnableBankingTransactions()` which POSTs to `/enablebanking/transactions`. Enable Banking normalizer maps `entry_reference` to `transactionId` (dedup key). `reconcileTransactions()` handles the rest.                                    |
| SYNC-04 | Account balances update automatically with each sync                                                                                                | `processBankSyncDownload()` calls `updateAccountBalance()` if `currentBalance != null`. The Enable Banking `/balances` response provides this. Normalizer must map `balance_amount.amount` to integer in minor units, applying CRDT/DBIT sign.                            |
| SYNC-05 | User can see pending vs booked status on imported transactions (visual indicator for PDNG vs BOOK)                                                  | `normalizeBankSyncTransactions()` sets `cleared = Boolean(trans.booked)`. Actual Budget renders cleared transactions differently (checkmark). Pending transactions have `cleared: false`. No UI code change needed - the data layer handles this automatically.           |
| SYNC-06 | User can link multiple banks under separate Enable Banking sessions                                                                                 | Enable Banking supports multiple concurrent sessions. Each session has a `session_id` stored in `eb_sessions` table in `account.sqlite`. Each linked account stores its `session_id`. Sync uses the per-account `session_id`.                                             |
| SYNC-07 | User can see last sync status and error message per account in the UI                                                                               | `account.sqlite` needs an `eb_sync_log` table. After each sync, write `account_id`, `synced_at`, `status`, `error_message`. UI reads this via new sync-server endpoint `POST /enablebanking/sync-status`.                                                                 |
| SYNC-08 | Sync runs are logged to an append-only history for debugging                                                                                        | Same `eb_sync_log` table as SYNC-07, treated as append-only (INSERT only, never UPDATE). Most recent row per account is the current status.                                                                                                                               |
| SYNC-09 | App ships with pre-populated categorization rules for common EU merchants and payees that auto-assign categories on import                          | Actual Budget's transaction rules system (`transaction-rules.ts`) supports payee-name rules stored in the SQLite `rules` table, applied by `runRules()` inside `reconcileTransactions()`. A seed function inserts rules at first link time, gated by a `preferences` key. |

</phase_requirements>

## Standard Stack

### Core (already installed - verified from Phase 1)

| Library          | Version  | Package Location       | Purpose                                                    |
| ---------------- | -------- | ---------------------- | ---------------------------------------------------------- |
| `jose`           | `6.1.3`  | `packages/sync-server` | JWT RS256 signing for Enable Banking API auth              |
| `axios`          | `1.13.5` | `packages/sync-server` | HTTP client for Enable Banking API                         |
| `node-cron`      | `4.2.1`  | `packages/sync-server` | 4x/day scheduled sync                                      |
| `better-sqlite3` | `12.5.0` | `packages/sync-server` | SQLite for `account.sqlite` DB (session storage, sync log) |
| `express`        | `5.2.1`  | `packages/sync-server` | Route framework (already mounted)                          |

**No new npm packages are needed for Phase 2.** All required libraries were installed in Phase 1.

### Supporting (already in codebase - no install needed)

| Library                                                        | Location                                | Purpose                                             |
| -------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- |
| `useMutation` from `@tanstack/react-query`                     | desktop-client                          | UI mutations for link/unlink account                |
| `send`/`sendCatch` from `loot-core/platform/client/connection` | desktop-client                          | IPC from React to loot-core handlers                |
| `pushModal` from `modalsSlice`                                 | desktop-client                          | Modal chain triggering                              |
| `reconcileTransactions`                                        | `loot-core/src/server/accounts/sync.ts` | Shared dedup + insert/update pipeline               |
| `processBankSyncDownload`                                      | same file                               | Shared initial vs incremental sync + balance update |

## Architecture Patterns

### Confirmed Exact Call Chain (from direct code inspection)

```
desktop-client UI
  -> send('enablebanking-get-banks', { country }) [new IPC]
  -> loot-core app.ts: getEnableBankingBanks()
  -> POST sync-server /enablebanking/get-banks [new route]
  -> ebRequest('GET', '/aspsps?country=XX')
  -> return { aspsps: [...] }

User selects bank:
  -> send('enablebanking-create-auth', { aspspName, aspspCountry }) [new IPC]
  -> loot-core app.ts: createEnableBankingAuth()
  -> POST sync-server /enablebanking/create-auth [new route]
  -> ebRequest('POST', '/auth', { aspsp, redirect_url, state, access.valid_until })
  -> return { url: 'https://...', state: '<uuid>' }
  -> desktop-client: window.Actual.openURLInBrowser(url)

User completes bank auth:
  -> bank redirects to http://localhost:5006/enablebanking/callback?code=...&state=...
  -> sync-server GET /enablebanking/callback [new route, UNAUTHENTICATED]:
     - validate state in eb_sessions
     - ebRequest('POST', '/sessions', { code })
     - receive { session_id, accounts: [...] }
     - store session in account.sqlite eb_sessions table
     - redirect to /enablebanking/link?state=...
  -> GET /enablebanking/link serves link.html (window.close())

Desktop-client polling (mirrors GoCardless):
  -> send('enablebanking-poll-session', { state }) [new IPC, 3s polling]
  -> loot-core: POST sync-server /enablebanking/get-accounts { state }
  -> if session stored: return { accounts: [...] }
  -> if not yet: return {} (triggers retry)
  -> dispatch select-linked-accounts modal (syncSource: 'enableBanking')

User maps account to Actual account:
  -> SelectLinkedAccountsModal (extended with 'enableBanking' case)
  -> send('enablebanking-accounts-link', { sessionId, account, upgradingId, offBudget, startingDate, startingBalance })
  -> loot-core app.ts: linkEnableBankingAccount()
     - findOrCreateBank(account.institution, sessionId)
     - db.insertWithUUID('accounts', { ..., account_sync_source: 'enableBanking' })
     - bankSync.syncAccount(...)
     - seed category rules if not already seeded

Manual sync:
  -> send('accounts-bank-sync', { ids: [accountId] }) [EXISTING IPC - no change]
  -> loot-core: accountsBankSync() [EXISTING]
     - bankSync.syncAccount() [EXISTING]
     - syncAccount() reads acctRow.account_sync_source === 'enableBanking' [NEW BRANCH]
     - downloadEnableBankingTransactions() [NEW]
     - POST sync-server /enablebanking/transactions [new route]
     - processBankSyncDownload() [EXISTING, unchanged]
     - reconcileTransactions() [EXISTING, unchanged]
```

### Recommended Project Structure (Phase 2 additions)

```
packages/sync-server/src/
  app-enablebanking/
    app-enablebanking.js        EXTEND: /get-banks, /create-auth, /callback,
                                        /link, /get-accounts, /transactions,
                                        /remove-session, /sync-status
    enablebanking-service.js    EXTEND: getAspsps(), createAuth(), exchangeCode(),
                                        getSessionAccounts(), getTransactions(),
                                        getBalances()
    utils.js                    NEW: normalizeTransaction(), normalizeAccount(),
                                     extractBalance()
    enablebanking.types.ts      NEW: TypeScript types for EB data shapes
    errors.js                   NEW: EnableBankingError, SessionExpiredError,
                                     RateLimitError
    migrations.js               NEW: CREATE TABLE IF NOT EXISTS statements
    link.html                   NEW: window.close() - mirrors GoCardless link.html
    util/
      handle-error.js           EXISTS (Phase 1)
  scheduler.js                  NEW: node-cron 4x/day + consent expiry check

packages/loot-core/src/
  types/models/account.ts       MODIFY: add 'enableBanking' to AccountSyncSource,
                                        add SyncServerEnableBankingAccount type
  server/
    server-config.ts            MODIFY: add ENABLEBANKING_SERVER key
    accounts/
      sync.ts                   MODIFY: add downloadEnableBankingTransactions(),
                                        add 'enableBanking' branch in syncAccount()
      app.ts                    MODIFY: add IPC handlers + method registrations
      eb-category-rules.js      NEW: EU merchant rule seed data + seedCategoryRules()

packages/desktop-client/src/
  enablebanking.ts              NEW: authorizeEnableBank() - mirrors gocardless.ts
  hooks/
    useEnableBankingStatus.ts   NEW: mirrors useGoCardlessStatus.ts
  components/
    modals/
      EnableBankingExternalMsgModal.tsx  NEW: mirrors GoCardlessExternalMsgModal
    Modals.tsx                  MODIFY: register new modal
  modals/
    modalsSlice.ts              MODIFY: add 'enablebanking-external-msg' union,
                                        extend 'select-linked-accounts' union
  accounts/
    mutations.ts                MODIFY: add useLinkAccountEnableBankingMutation()
```

### Pattern 1: Enable Banking Transaction Normalization

The critical translation layer. `normalizeBankSyncTransactions()` in loot-core expects this exact shape in the `all` array:

```javascript
{
  transactionId: string,          // from entry_reference - the primary dedup key
  internalTransactionId: string,  // same - fallback for pending without stable ID
  transactionAmount: {
    amount: string,               // signed decimal string (negative = debit)
  },
  booked: boolean,                // true if Enable Banking status === 'BOOK'
  bookingDate: string,            // from booking_date (YYYY-MM-DD format)
  valueDate: string,              // from value_date
  payeeName: string,              // creditor.name (DBIT) or debtor.name (CRDT)
  remittanceInformationUnstructured: string, // from remittance_information[0]
}
```

**Sign convention - critical:** Enable Banking `credit_debit_indicator` is `'CRDT'` (money coming in) or `'DBIT'` (money going out). The `transaction_amount.amount` field is ALWAYS POSITIVE in the Enable Banking API. The sign must be applied in the normalizer:

```javascript
const sign = credit_debit_indicator === 'CRDT' ? 1 : -1;
const signedAmount = sign * parseFloat(transaction_amount.amount);
```

**Full normalizeTransaction function in utils.js:**

```javascript
// packages/sync-server/src/app-enablebanking/utils.js
export function normalizeTransaction(ebTransaction, isBooked) {
  const {
    credit_debit_indicator,
    transaction_amount,
    entry_reference,
    booking_date,
    value_date,
    creditor,
    debtor,
    remittance_information,
  } = ebTransaction;

  const sign = credit_debit_indicator === 'CRDT' ? 1 : -1;
  const signedAmount = sign * parseFloat(transaction_amount.amount);

  // Payee: creditor is who you paid (DBIT), debtor is who paid you (CRDT)
  const payeeName =
    (credit_debit_indicator === 'DBIT' ? creditor?.name : debtor?.name) ??
    remittance_information?.[0] ??
    'Unknown';

  return {
    transactionId: entry_reference || null,
    internalTransactionId: entry_reference || null,
    transactionAmount: { amount: String(signedAmount) },
    booked: isBooked,
    bookingDate: booking_date || null,
    valueDate: value_date || null,
    payeeName,
    remittanceInformationUnstructured: remittance_information?.[0] || null,
  };
}
```

**extractBalance function in utils.js:**

```javascript
// Prefer CLAV (closing available) > ITAV > ITBD > CLBD
export function extractBalance(balances) {
  const priority = ['CLAV', 'ITAV', 'ITBD', 'CLBD'];
  for (const balType of priority) {
    const bal = balances.find(b => b.balance_type === balType);
    if (bal) {
      return Math.round(parseFloat(bal.balance_amount.amount) * 100);
    }
  }
  return null;
}
```

### Pattern 2: downloadEnableBankingTransactions in sync.ts

Mirrors `downloadGoCardlessTransactions()` exactly. Add after the existing download functions:

```typescript
// packages/loot-core/src/server/accounts/sync.ts
async function downloadEnableBankingTransactions(
  acctId: string,
  since: string,
) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return;

  logger.log('Pulling transactions from Enable Banking');

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('No server config');

  const res = await post(
    serverConfig.ENABLEBANKING_SERVER + '/transactions',
    { accountId: acctId, startDate: since },
    { 'X-ACTUAL-TOKEN': userToken },
    60000,
  );

  if (res.error_code) {
    throw BankSyncError(res.error_type, res.error_code);
  }

  return {
    transactions: res.transactions.all,
    accountBalance: res.balances,
    startingBalance: res.startingBalance,
  };
}
```

Add branch in `syncAccount()`:

```typescript
} else if (acctRow.account_sync_source === 'enableBanking') {
  download = await downloadEnableBankingTransactions(acctId, syncStartDate);
}
```

### Pattern 3: server-config.ts Extension

```typescript
// packages/loot-core/src/server/server-config.ts
type ServerConfig = {
  BASE_SERVER: string;
  SYNC_SERVER: string;
  SIGNUP_SERVER: string;
  GOCARDLESS_SERVER: string;
  SIMPLEFIN_SERVER: string;
  PLUGGYAI_SERVER: string;
  ENABLEBANKING_SERVER: string;  // ADD
};

// In getServer() return object, add:
ENABLEBANKING_SERVER: joinURL(url, '/enablebanking'),
```

### Pattern 4: OAuth Callback - Session Storage + Polling

GoCardless polls for requisition status. Enable Banking session creation is synchronous in the callback.

**`eb_sessions` DB schema (in migrations.js):**

```sql
CREATE TABLE IF NOT EXISTS eb_sessions (
  id TEXT PRIMARY KEY,
  state TEXT UNIQUE NOT NULL,
  aspsp_name TEXT,
  aspsp_country TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  valid_until TEXT,
  accounts TEXT
);

CREATE TABLE IF NOT EXISTS eb_account_map (
  eb_account_uid TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  actual_account_id TEXT
);
```

**Callback flow (sync-server routes):**

1. `POST /enablebanking/create-auth`: generate UUID as `state`, store pending row in `eb_sessions`, call EB `POST /auth` with `state`, return `{ url, state }`
2. `GET /enablebanking/callback?code=...&state=...` (UNAUTHENTICATED - before session middleware):
   - Validate `state` in `eb_sessions` (reject 400 if not found - CSRF protection)
   - Call EB `POST /sessions` with the code
   - Update `eb_sessions` row with `session_id`, `accounts`, `valid_until`
   - Redirect to `GET /enablebanking/link?state=...`
3. `GET /enablebanking/link`: serve `link.html` (window.close() - closes popup)
4. loot-core polls `POST /enablebanking/get-accounts { state }` every 3 seconds:
   - If session ready (accounts populated): return `{ accounts: [...] }`
   - If not yet: return `{}` (triggers 3-second retry)

**link.html content (identical to GoCardless):**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Actual</title>
  </head>
  <body>
    <script>
      window.close();
    </script>
    <p>Please wait...</p>
    <p>The window should close automatically.</p>
  </body>
</html>
```

### Pattern 5: eb_sync_log Table

```sql
CREATE TABLE IF NOT EXISTS eb_sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  eb_account_uid TEXT NOT NULL,
  synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  status TEXT NOT NULL,
  transactions_added INTEGER,
  transactions_updated INTEGER,
  error_message TEXT,
  error_code TEXT
);
```

Query last sync per account: `SELECT * FROM eb_sync_log WHERE account_id = ? ORDER BY synced_at DESC LIMIT 1`

New route: `POST /enablebanking/sync-status { accountIds: [...] }` returns last sync status per account for the UI (SYNC-07).

### Pattern 6: DB Migrations Module

```javascript
// packages/sync-server/src/app-enablebanking/migrations.js
// Uses db.mutate() - the WrappedDatabase API for DDL statements
import { getAccountDb } from '../account-db.js';

export function runMigrations() {
  const db = getAccountDb();

  db.mutate(`CREATE TABLE IF NOT EXISTS eb_sessions (
    id TEXT PRIMARY KEY,
    state TEXT UNIQUE NOT NULL,
    aspsp_name TEXT,
    aspsp_country TEXT,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    valid_until TEXT,
    accounts TEXT
  )`);

  db.mutate(`CREATE TABLE IF NOT EXISTS eb_account_map (
    eb_account_uid TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    actual_account_id TEXT
  )`);

  db.mutate(`CREATE TABLE IF NOT EXISTS eb_sync_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id TEXT NOT NULL,
    eb_account_uid TEXT NOT NULL,
    synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    status TEXT NOT NULL,
    transactions_added INTEGER,
    transactions_updated INTEGER,
    error_message TEXT,
    error_code TEXT
  )`);
}
```

Call `runMigrations()` at the top of `app-enablebanking.js` (module load time). `CREATE TABLE IF NOT EXISTS` is idempotent - safe to call every startup.

Note: `db.mutate()` is the correct method for `WrappedDatabase` - it calls `this.db.prepare(sql).run()`. This works for both DML and DDL statements.

### Pattern 7: select-linked-accounts Modal Extension

The existing `SelectLinkedAccountsModal` uses a discriminated union on `syncSource`. Adding Enable Banking requires changes at 4 locations:

1. `packages/loot-core/src/types/models/account.ts` - add `SyncServerEnableBankingAccount` type
2. `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx` - add union variant and switch case
3. `packages/desktop-client/src/modals/modalsSlice.ts` - add `'enableBanking'` to the `select-linked-accounts` modal options union
4. `packages/desktop-client/src/accounts/mutations.ts` - add `useLinkAccountEnableBankingMutation()` that calls `'enablebanking-accounts-link'`

`SyncServerEnableBankingAccount` type:

```typescript
export type SyncServerEnableBankingAccount = {
  account_id: string; // Enable Banking UID (used as Actual account_id)
  name: string;
  institution: string;
  mask: string;
  official_name: string | null;
  balance: number | null;
  iban: string | null;
  session_id: string; // Which EB session this account belongs to
};
```

### Pattern 8: Scheduler Note - Phase 2 Scope

The scheduler (node-cron 4x/day auto-sync) requires access to per-budget SQLite files to know which accounts to sync. These files live in `/data/` and are managed by loot-core, not sync-server. The scheduler in sync-server cannot enumerate budget files without a coordination mechanism.

**For Phase 2:** Manual sync only, via the existing `accounts-bank-sync` IPC. The success criteria for SYNC-03 say "trigger a manual sync" - auto-scheduled sync is NOT required for Phase 2 success. The scheduler (`scheduler.js`) can be scaffolded in Phase 2 with the cron setup but the auto-sync logic deferred to Phase 3.

### Pattern 9: EU Merchant Categorization Rules (SYNC-09)

Rules system: `rules` table in per-budget SQLite, applied by `runRules()` inside `reconcileTransactions()`. Rules added via `db.insertWithUUID('rules', rule)`.

**Seed function - key insight:** Category UUIDs are budget-specific. Look up categories by NAME at seed time.

```javascript
// packages/loot-core/src/server/accounts/eb-category-rules.js

export const EU_MERCHANT_PATTERNS = [
  // Grocery chains (EU-wide)
  { payeePattern: 'LIDL', categoryName: 'Groceries' },
  { payeePattern: 'ALDI', categoryName: 'Groceries' },
  { payeePattern: 'CARREFOUR', categoryName: 'Groceries' },
  { payeePattern: 'REWE', categoryName: 'Groceries' },
  { payeePattern: 'TESCO', categoryName: 'Groceries' },
  { payeePattern: 'SAINSBURY', categoryName: 'Groceries' },
  { payeePattern: 'KAUFLAND', categoryName: 'Groceries' },
  { payeePattern: 'PRISMA', categoryName: 'Groceries' },
  { payeePattern: 'K-MARKET', categoryName: 'Groceries' },
  { payeePattern: 'S-MARKET', categoryName: 'Groceries' },
  // Subscriptions
  { payeePattern: 'NETFLIX', categoryName: 'Entertainment' },
  { payeePattern: 'SPOTIFY', categoryName: 'Entertainment' },
  { payeePattern: 'AMAZON PRIME', categoryName: 'Shopping' },
  // Transport
  { payeePattern: 'HSL', categoryName: 'Transport' },
  { payeePattern: 'VR ', categoryName: 'Transport' },
  { payeePattern: 'MATKAHUOLTO', categoryName: 'Transport' },
  { payeePattern: 'TRANSDEV', categoryName: 'Transport' },
];

export async function seedCategoryRules(db, aqlQuery, q) {
  // Check if already seeded
  const existing = await aqlQuery(
    q('preferences').filter({ id: 'eb-rules-seeded' }).select('value'),
  );
  if (existing?.data?.[0]?.value === 'true') return;

  for (const rule of EU_MERCHANT_PATTERNS) {
    // Look up category by name (NOT uuid - UUIDs are budget-specific)
    const category = await db.first(
      'SELECT id FROM categories WHERE name = ? AND tombstone = 0',
      [rule.categoryName],
    );
    if (!category) continue; // Skip if this budget has no matching category

    await db.insertWithUUID('rules', {
      stage: null,
      conditionsOp: 'and',
      conditions: JSON.stringify([
        { field: 'imported_payee', op: 'contains', value: rule.payeePattern },
      ]),
      actions: JSON.stringify([
        { field: 'category', op: 'set', value: category.id },
      ]),
      tombstone: 0,
    });
  }

  // Mark as seeded so it does not run again for this budget
  await db.first(
    "INSERT OR IGNORE INTO preferences (id, value) VALUES ('eb-rules-seeded', 'true')",
  );
}
```

Call `seedCategoryRules()` from `linkEnableBankingAccount()` in `app.ts` before returning.

## Anti-Patterns to Avoid

**Anti-Pattern 1: Amount sign from Enable Banking is always positive**

- Wrong: `amount = parseFloat(transaction_amount.amount) * 100`
- Right: `sign = indicator === 'CRDT' ? 1 : -1; amount = sign * parseFloat(transaction_amount.amount)`

**Anti-Pattern 2: Using Enable Banking `status` field as boolean `booked`**

- `status` is `'BOOK'` or `'PDNG'` (string), not `true/false`
- `normalizeBankSyncTransactions` checks `Boolean(trans.booked)` - normalizer must set: `booked: transaction.status === 'BOOK'`

**Anti-Pattern 3: Storing OAuth session in memory only**

- The callback and the loot-core polling happen in different request cycles
- Session MUST be stored in `account.sqlite`, not in a module-level Map

**Anti-Pattern 4: Callback route placed after session middleware**

- `GET /enablebanking/callback` must be placed BEFORE `export { app as handlers }` (unauthenticated)
- The browser redirect from the bank has no Actual user session - placing it after middleware returns 401

**Anti-Pattern 5: Passing Enable Banking raw snake_case data to normalizeBankSyncTransactions**

- Always normalize in sync-server `utils.js` first
- Never pass `transaction_amount`, `booking_date` etc. directly to loot-core

**Anti-Pattern 6: Hardcoding category UUIDs in SYNC-09 rules**

- Category UUIDs are budget-specific, generated at budget creation time
- Always look up category by NAME from the `categories` table at seed time, skip if not found

## Don't Hand-Roll

| Problem                   | Don't Build           | Use Instead                                             | Why                                                                                                                        |
| ------------------------- | --------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Transaction deduplication | Custom upsert logic   | `reconcileTransactions()`                               | Handles `imported_id` exact match + 7-day fuzzy match by amount. Zero changes needed.                                      |
| Pending vs booked display | Custom UI state       | Existing `cleared` field                                | `cleared: false` = pending. Actual Budget already renders pending transactions differently (no checkmark in the register). |
| Payee creation            | Manual INSERT         | `resolvePayee()` inside `normalizeBankSyncTransactions` | Handles dedup of payees by name, creates only if new.                                                                      |
| Balance update            | Custom SQL            | `updateAccountBalance()` in `sync.ts`                   | Already called by `processBankSyncDownload()`.                                                                             |
| Rule application          | Custom payee matching | `runRules()` in `transaction-rules.ts`                  | Applied automatically during `reconcileTransactions()`.                                                                    |
| IPC bridge                | Custom bridge         | `send()` from `loot-core/platform/client/connection`    | Standard IPC pattern used by all existing providers.                                                                       |
| Modal state management    | Custom state          | `pushModal()` / `modalsSlice`                           | Redux modal stack already handles chained modals.                                                                          |

## Common Pitfalls

### Pitfall 1: payeeName null causes normalizeBankSyncTransactions to throw

**What goes wrong:** Enable Banking transactions from some banks have neither `creditor.name` nor `debtor.name`. The function throws `'payeeName' is required`.

**Why it happens:** `formatPayeeName()` in the GoCardless integration-bank.js has multiple fallbacks. Enable Banking has different field names, and some ASPSPs omit creditor/debtor names for certain transaction types.

**How to avoid:** Normalizer must always provide a fallback:
`payeeName = creditor?.name ?? debtor?.name ?? remittance_information?.[0] ?? 'Unknown'`

**Warning signs:** First sync fails with "'payeeName' is required" error.

### Pitfall 2: entry_reference changes between PDNG and BOOK states

**What goes wrong:** Some EU banks do NOT preserve `entry_reference` across state transitions. The pending record has `entry_reference: 'PDNG_12345'`, the booked record gets `entry_reference: 'BOOK_67890'`. The reconciler sees two different transactions.

**Why it happens:** PSD2 spec does not require `entry_reference` stability across state transitions. Bank behavior is inconsistent.

**How to avoid:** The 7-day fuzzy matcher (amount + date within 7 days) provides a safety net for the majority of cases. For Phase 2, rely on the fuzzy matcher and document the limitation. Log `transactions_added` vs `transactions_updated` in `eb_sync_log` to detect when dedup is working.

**Detection:** User reports seeing two transactions for the same purchase (one cleared, one pending, same amount, adjacent dates).

### Pitfall 3: OAuth state parameter not validated in callback

**What goes wrong:** Malicious redirect injects a fraudulent code with any `state` value. The server exchanges it for a session.

**How to avoid:** When calling POST /auth, generate a UUID as `state` and insert a pending row in `eb_sessions`. In the callback, look up `state` in `eb_sessions` - reject with 400 if not found. This is CSRF protection on the OAuth flow.

### Pitfall 4: Callback route returns 401 because it is after session middleware

**What goes wrong:** `GET /enablebanking/callback` placed after `app.use(validateSessionMiddleware)`. The browser redirect from the bank has no Actual session cookie - returns 401.

**How to avoid:** Place `GET /enablebanking/callback` and `GET /enablebanking/link` BEFORE `export { app as handlers }`. Follow the same pattern as `GET /enablebanking/test-auth` from Phase 1.

### Pitfall 5: Scheduler cannot access budget SQLite files

**What goes wrong:** Scheduler in sync-server tries to find Enable Banking accounts but account data lives in per-budget SQLite files that loot-core manages.

**How to avoid:** Do not implement auto-scheduler in Phase 2. Manual sync only. The Phase 2 success criteria require "trigger a manual sync" - auto-schedule is not required for success.

### Pitfall 6: TypeScript discriminated union exhaustiveness in SelectLinkedAccountsModal

**What goes wrong:** `switch (syncSource)` throws `'Unrecognized sync source: enableBanking'` because the new case was added to `modalsSlice.ts` but not to the switch in the component.

**How to avoid:** Search ALL switch statements on `syncSource` in the codebase and update every one. TypeScript will catch this at compile time only if `@ts-strict-ignore` is not at the top of the file. Run `yarn tsc` to verify.

### Pitfall 7: SyncServerEnableBankingAccount type not exported from loot-core types

**What goes wrong:** `mutations.ts` and `SelectLinkedAccountsModal.tsx` fail to import the new type.

**How to avoid:** Add `SyncServerEnableBankingAccount` to `packages/loot-core/src/types/models/`. Grep for `SyncServerGoCardlessAccount` to find all files that need updating.

## State of the Art

| Old Pattern                                                          | Phase 2 Pattern                                                           | Why                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| GoCardless requisition-based auth (polling for bank processing)      | Enable Banking session-based auth (synchronous code exchange)             | Different OAuth model: EB exchanges code immediately, no async wait |
| GoCardless accounts are per-requisition                              | Enable Banking accounts are per-session                                   | `session_id` is the requisition equivalent                          |
| GoCardless transactions split into `booked[]` and `pending[]` arrays | Enable Banking single `transactions[]` with `status: 'BOOK'/'PDNG'` field | Different API shape - merge and tag in normalizer                   |
| GoCardless `transactionId` is generally stable across states         | Enable Banking `entry_reference` may change PDNG->BOOK                    | Fuzzy matcher is the safety net                                     |
| GoCardless consent expires at 90 days by user agreement              | Enable Banking `valid_until` is set per session, bank-dependent           | Store `valid_until` from session response, proactive expiry warning |

## Build Order (Recommended)

Dependencies between components dictate this order:

1. **DB migrations** (`app-enablebanking/migrations.js`) - no dependencies, run first
2. **Sync-server service layer** extensions (`enablebanking-service.js`: getAspsps, createAuth, exchangeCode, getSessionAccounts, getTransactions, getBalances) + `utils.js` (normalizeTransaction, normalizeAccount, extractBalance) + `link.html`
3. **Sync-server routes** - fill remaining routes in `app-enablebanking.js`: `/get-banks`, `/create-auth`, `/callback`, `/link`, `/get-accounts`, `/transactions`, `/remove-session`, `/sync-status`
4. **loot-core type extensions** - `account.ts` add `'enableBanking'` + `SyncServerEnableBankingAccount`, `server-config.ts` add `ENABLEBANKING_SERVER`
5. **loot-core sync extension** - `sync.ts` add `downloadEnableBankingTransactions()` + `'enableBanking'` branch
6. **loot-core IPC handlers** - `app.ts` add handlers + method registrations for link, get-banks, create-auth, poll-session, accounts, status
7. **Desktop-client UI** - `enablebanking.ts`, `useEnableBankingStatus.ts`, `EnableBankingExternalMsgModal.tsx`, `SelectLinkedAccountsModal` extension, `mutations.ts` extension, `modalsSlice.ts` extension, `CreateAccountModal.tsx` extension
8. **Categorization seed** (`eb-category-rules.js`) + integration into `linkEnableBankingAccount()`
9. **Sync logging** - write to `eb_sync_log` from `downloadEnableBankingTransactions` (or sync-server /transactions route) + `/sync-status` route + UI display

## Open Questions

1. **Does Enable Banking /transactions paginate?**
   - What we know: API reference shows `continuation_key` field in response.
   - What's unclear: Whether sandbox returns it for date-bounded requests.
   - Recommendation: Implement pagination loop (while `continuation_key` exists). Start simple, add pagination if sandbox returns truncated results.

2. **Does `entry_reference` survive PDNG->BOOK for the Mock ASPSP?**
   - Unknown until tested. Fuzzy matcher handles mismatches.
   - Recommendation: Test during Phase 2 sandbox verification, document in `eb_sync_log` observations.

3. **What is the exact `valid_until` max value from Enable Banking?**
   - Recommendation: Set `access.valid_until` to 90 days from now in POST /auth. Store the actual `valid_until` from the session response verbatim in `eb_sessions`.

4. **Where exactly to call `seedCategoryRules()`?**
   - Recommendation: In `linkEnableBankingAccount()` in `loot-core/server/accounts/app.ts`, just before returning `'ok'`. Gated by `eb-rules-seeded` preference key.

5. **Does `window.close()` in link.html work in the Actual desktop app?**
   - GoCardless uses the same pattern and it works. Same behavior expected for Enable Banking.
   - Verification: Full OAuth flow sandbox test in Phase 2 verification.

## Sources

### Primary (HIGH confidence - direct code inspection of this codebase)

- `packages/sync-server/src/app-enablebanking/app-enablebanking.js` - Phase 1 scaffold inspected directly
- `packages/sync-server/src/app-enablebanking/enablebanking-service.js` - Phase 1 service inspected directly
- `packages/sync-server/src/app.ts` - `/enablebanking` mount confirmed
- `packages/sync-server/src/app-gocardless/app-gocardless.js` - route pattern reference
- `packages/sync-server/src/app-gocardless/services/gocardless-service.js` - service pattern reference
- `packages/sync-server/src/app-gocardless/banks/integration-bank.js` - normalizeTransaction pattern
- `packages/sync-server/src/app-gocardless/link.html` - window.close() OAuth callback pattern
- `packages/sync-server/src/db.js` - `WrappedDatabase` API (`all`, `first`, `mutate`) confirmed
- `packages/loot-core/src/server/accounts/sync.ts` - `syncAccount()`, `processBankSyncDownload()`, `reconcileTransactions()`, `normalizeBankSyncTransactions()` all inspected in full
- `packages/loot-core/src/server/accounts/app.ts` - IPC handler registration pattern, `linkGoCardlessAccount()` pattern
- `packages/loot-core/src/server/server-config.ts` - `ServerConfig` type confirmed
- `packages/loot-core/src/types/models/account.ts` - `AccountSyncSource` confirmed as `'simpleFin' | 'goCardless' | 'pluggyai'` (no `enableBanking` yet)
- `packages/desktop-client/src/gocardless.ts` - `authorizeBank()` pattern
- `packages/desktop-client/src/components/modals/GoCardlessExternalMsgModal.tsx` - OAuth modal pattern with polling
- `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx` - discriminated union + switch pattern
- `packages/desktop-client/src/modals/modalsSlice.ts` - modal registration pattern
- `packages/desktop-client/src/accounts/mutations.ts` - `useLinkAccountMutation()` pattern
- [Enable Banking API reference](https://enablebanking.com/docs/api/reference/) - POST /auth, POST /sessions, GET /accounts/{id}/transactions, GET /accounts/{id}/balances - field names verified via WebFetch 2026-02-18

### Secondary (MEDIUM confidence)

- `.planning/research/ARCHITECTURE.md` - overall architecture, data flow diagrams (2026-02-18)
- `.planning/research/STACK.md` - stack versions and rationale (2026-02-18)
- `.planning/research/PITFALLS.md` - pitfall catalog (2026-02-18)

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - No new packages needed, all verified in Phase 1
- Architecture/call chain: HIGH - Reconstructed from direct code inspection at every layer
- Enable Banking API field names: HIGH - Verified against official API reference via WebFetch
- Transaction normalization shape: HIGH - `normalizeBankSyncTransactions()` read directly in full
- DB migration pattern: HIGH - `WrappedDatabase.mutate()` API confirmed from `db.js`
- Pitfalls: HIGH for deduplication and CSRF (known PSD2/OAuth behavior), MEDIUM for specific bank behavior (sandbox-dependent)
- UI patterns: HIGH - GoCardless modal chain inspected completely, Enable Banking mirrors it

**Research date:** 2026-02-18
**Valid until:** 2026-04-18

**Key architectural insight:** The biggest difference from GoCardless is the OAuth synchronicity. GoCardless polls for requisition status because the bank processes the user's authentication asynchronously. Enable Banking's code exchange in the callback (`POST /sessions`) is synchronous - if the code is valid, the session is created immediately. The loot-core "polling" in Phase 2 is only checking whether the sync-server callback has been called yet (whether the user has completed the bank auth flow and been redirected back), not waiting for async bank processing. This simplifies the flow compared to GoCardless.
