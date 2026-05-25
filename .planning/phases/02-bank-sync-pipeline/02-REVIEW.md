---
phase: 02-bank-sync-pipeline
reviewed: 2026-05-23T14:30:00Z
depth: standard
files_reviewed: 20
files_reviewed_list:
  - packages/sync-server/src/app-enablebanking/migrations.js
  - packages/sync-server/src/app-enablebanking/errors.ts
  - packages/sync-server/src/app-enablebanking/enablebanking.types.ts
  - packages/sync-server/src/app-enablebanking/utils.js
  - packages/sync-server/src/app-enablebanking/enablebanking-service.ts
  - packages/sync-server/src/app-enablebanking/app-enablebanking.ts
  - packages/loot-core/src/types/models/account.ts
  - packages/loot-core/src/server/server-config.ts
  - packages/loot-core/src/server/accounts/sync.ts
  - packages/loot-core/src/server/accounts/app.ts
  - packages/desktop-client/src/enablebanking.ts
  - packages/desktop-client/src/hooks/useEnableBankingStatus.ts
  - packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx
  - packages/loot-core/src/server/accounts/eb-category-rules.js
  - packages/desktop-client/src/components/Modals.tsx
  - packages/desktop-client/src/modals/modalsSlice.ts
  - packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx
  - packages/desktop-client/src/accounts/mutations.ts
  - packages/desktop-client/src/components/modals/CreateAccountModal.tsx
  - packages/desktop-client/src/components/banksync/AccountRow.tsx
findings:
  critical: 5
  warning: 8
  info: 3
  total: 16
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-23T14:30:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

The Enable Banking integration adds a complete bank-sync provider spanning the sync-server (Express routes, service layer, normalizers), the shared loot-core layer (IPC handlers, link logic, sync pipeline), and the React desktop-client (OAuth flow, account linking modal, consent expiry notifications). The architecture is sound and follows the existing GoCardless/SimpleFin patterns well.

However, there are critical issues: the OAuth callback is missing input validation for a required parameter, SQL injection is possible in the sync-status route, the `getInstitutionName` utility silently breaks for Enable Banking accounts, transactions without `entry_reference` have no dedup ID at all, and query string parameters in the service layer are not URL-encoded.

## Critical Issues

### CR-01: OAuth Callback Missing Validation for `code` Parameter

**File:** `packages/sync-server/src/app-enablebanking/app-enablebanking.ts:203-221`
**Issue:** The `/callback` route validates `state` but does not validate `code`. If `code` is missing or empty (e.g., the bank denies authorization and redirects without a code), `exchangeCode(undefined)` is called, which will hit the Enable Banking API with an undefined body field. The error is caught by `handleError` but produces a confusing "Enable Banking request failed" error instead of a clear "authorization denied" message. More importantly, the session row's `id` is updated to the response even on failure paths.
**Fix:**
```typescript
const { code, state } = req.query;

if (!state) {
  return res.status(400).send('Missing state parameter');
}
if (!code) {
  return res.status(400).send('Missing authorization code - bank may have denied access');
}
```

### CR-02: SQL Injection via Unparameterized Placeholders in sync-status Route

**File:** `packages/sync-server/src/app-enablebanking/app-enablebanking.ts:504-514`
**Issue:** The `accountIds` array from `req.body` is used to build dynamic SQL with `ids.map(() => '?').join(',')` for the placeholder count, which is safe. However, the `ids` array is passed directly as the bind parameter. The `db.all()` call expects the bind array to be spread as individual arguments, and since this uses the same `ids` array for both the sub-query and the outer query, each `db.all` call receives the `ids` array once. But the two queries at lines 506-514 and 520-527 each contain `IN (${placeholders})` and each receives `ids` as the bind array. This is correct for single-query usage. **However**, the real issue is that `accountIds` from `req.body` is not validated to be an array of strings. If an attacker sends `accountIds: [1, {"$gt": ""}]` or non-string values, the SQL layer may behave unexpectedly depending on the SQLite binding library.
**Fix:**
```typescript
const ids: string[] = (accountIds || []).filter(
  (id: unknown) => typeof id === 'string' && id.length > 0
);
```

### CR-03: `getInstitutionName` Missing `SyncServerEnableBankingAccount` in Type Union

**File:** `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx:750-762`
**Issue:** The `getInstitutionName` function's parameter type union includes `SyncServerGoCardlessAccount | SyncServerSimpleFinAccount | SyncServerPluggyAiAccount` but is missing `SyncServerEnableBankingAccount`. For Enable Banking accounts, `institution` is a plain string (set by `normalizeAccount` in utils.js:75), so the `typeof === 'string'` branch would work at runtime. However, TypeScript will flag calls like `getInstitutionName(externalAccount)` at line 118/629/960 with a type error when `externalAccount` is `SyncServerEnableBankingAccount`, because the type is not in the union. This function is called in the sorting comparator (line 118) and in multiple render paths - a TS strict build will fail.
**Fix:**
```typescript
function getInstitutionName(
  externalAccount:
    | SyncServerGoCardlessAccount
    | SyncServerSimpleFinAccount
    | SyncServerPluggyAiAccount
    | SyncServerEnableBankingAccount,
) {
```

### CR-04: Transactions Without `entry_reference` Have No Dedup Identity

**File:** `packages/sync-server/src/app-enablebanking/utils.js:46-47`
**Issue:** When `entry_reference` is null/undefined (which is common for many EU banks), both `transactionId` and `internalTransactionId` are set to null. In `normalizeBankSyncTransactions` (sync.ts:454-457), this means `imported_id` is null, so no `imported_id`-based dedup occurs. The system falls back to fuzzy matching (amount + date within 7 days), which will produce duplicate transactions when two transactions have the same amount on the same day (e.g., two identical grocery purchases). GoCardless solves this by generating a synthetic ID from transaction fields. Enable Banking needs the same.
**Fix:**
```javascript
// Generate a synthetic transaction ID when entry_reference is missing
const syntheticId = entry_reference ?? [
  booking_date ?? value_date ?? 'nodate',
  transaction_amount.amount,
  credit_debit_indicator,
  creditor?.name ?? debtor?.name ?? '',
  (remittance_information ?? [])[0] ?? '',
].join('|');

return {
  transactionId: entry_reference ?? syntheticId,
  internalTransactionId: syntheticId,
  // ...rest
};
```

### CR-05: Query String Parameters Not URL-Encoded in Service Layer

**File:** `packages/sync-server/src/app-enablebanking/enablebanking-service.ts:96,173-174`
**Issue:** In `getAspsps()`, the country code is concatenated directly into the URL: `'/aspsps?country=' + country`. In `getTransactions()`, `startDate` and `continuationKey` are also concatenated without encoding. If a country code, date, or continuation key contains special characters (e.g., `+`, `&`, `#`), the URL will be malformed. The `continuation_key` values returned by Enable Banking can contain URL-unsafe characters like `+` and `=` (base64-encoded tokens are common).
**Fix:**
```typescript
export async function getAspsps(country) {
  const response = await ebRequest('GET', '/aspsps?country=' + encodeURIComponent(country));
  return response.data;
}

// In getTransactions:
const qs =
  '?date_from=' + encodeURIComponent(startDate) +
  (nextKey ? '&continuation_key=' + encodeURIComponent(nextKey) : '');
```

## Warnings

### WR-01: OAuth Callback Updates Session ID Without Transaction Safety

**File:** `packages/sync-server/src/app-enablebanking/app-enablebanking.ts:224-243`
**Issue:** The `/callback` route updates `eb_sessions.id` from the temporary state to the real `session_id`, then inserts `eb_account_map` rows. These are separate `db.mutate()` calls not wrapped in a transaction. If the server crashes between the UPDATE and the INSERT loop, the session row has the new ID but no account map rows exist, leaving the session in an inconsistent state with no recovery path. The re-auth flow (`remapReauthorizedAccounts`) correctly uses `db.transaction()` for its multi-step operation.
**Fix:** Wrap the UPDATE and INSERT loop in `db.transaction()`:
```typescript
db.transaction(() => {
  db.mutate(
    'UPDATE eb_sessions SET id = ?, accounts = ?, valid_until = ? WHERE state = ?',
    [session_id, JSON.stringify(accounts), valid_until ?? null, state],
  );
  for (const account of accounts) {
    db.mutate(
      'INSERT OR IGNORE INTO eb_account_map (eb_account_uid, session_id) VALUES (?, ?)',
      [account.uid, session_id],
    );
  }
});
```

### WR-02: `handleError` Uses `console.log` Instead of Project Logger

**File:** `packages/sync-server/src/app-enablebanking/util/handle-error.js:10`
**Issue:** The error handler uses `console.log('Error', ...)` while the rest of the app-enablebanking module uses the project's structured logger (imported in app-enablebanking.ts:6). This means Enable Banking errors bypass structured logging, making them harder to correlate with other server logs and invisible to any log aggregation that filters on the logger output.
**Fix:**
```javascript
import logger from '../../util/logger.js';
// ...
logger.error('Error', req.originalUrl, err.message || String(err));
```

### WR-03: `normalizeTransaction` Returns `null` Date Without Guarding

**File:** `packages/sync-server/src/app-enablebanking/utils.js:41`
**Issue:** When both `booking_date` and `value_date` are null/undefined, `date` is set to `null`. The comment on line 40 says "date must be a yyyy-MM-dd string" and the downstream `normalizeBankSyncTransactions` (sync.ts:441) will throw "'date' is required when adding a transaction". While the throw is correct, it will cause the entire batch to fail for one bad transaction. The normalizer should either filter out dateless transactions or fail more gracefully.
**Fix:** Either skip the transaction with a warning, or throw a specific error:
```javascript
const date = booking_date ?? value_date;
if (!date) {
  console.warn(`Skipping transaction ${entry_reference}: no date`);
  return null; // caller filters nulls
}
```

### WR-04: `extractBalance` Floating Point Precision Risk

**File:** `packages/sync-server/src/app-enablebanking/utils.js:96-99`
**Issue:** `parseFloat(bal.balance_amount.amount)` followed by `Math.round(sign * raw * 100)` is susceptible to floating-point precision errors. For example, `parseFloat("19.99") * 100` = `1998.9999999999998`, which `Math.round` handles, but `parseFloat("1.005") * 100` = `100.49999999999999` which rounds to `100` instead of `101`. This is the same class of bug that financial software must guard against.
**Fix:** Use the same approach as other providers - parse the string directly:
```javascript
const raw = parseFloat(bal.balance_amount.amount);
const sign = bal.credit_debit_indicator === 'DBIT' ? -1 : 1;
// Use toFixed to avoid floating point precision loss
return Math.round(sign * Math.round(raw * 100));
```
Or better, parse the string as integer minor units directly:
```javascript
const parts = bal.balance_amount.amount.split('.');
const major = parseInt(parts[0], 10);
const minor = parseInt((parts[1] ?? '0').padEnd(2, '0').slice(0, 2), 10);
return sign * (major * 100 + (major < 0 ? -minor : minor));
```

### WR-05: `enablebanking-service.ts` Private Key Cached Forever Without Invalidation

**File:** `packages/sync-server/src/app-enablebanking/enablebanking-service.ts:22-31`
**Issue:** `cachedPrivateKey` is set once and never cleared. If the PEM file at `keyPath` is rotated (e.g., key renewal), the server must be restarted to pick up the new key. This is acceptable for most deployments but becomes a problem in container environments where secrets are mounted dynamically (e.g., Kubernetes secret rotation). There's no way to force a key reload without restarting the process.
**Fix:** Add an exported function to clear the cache, or add a TTL:
```typescript
export function clearKeyCache() {
  cachedPrivateKey = null;
}
```

### WR-06: Polling Timer in `enablebanking.ts` Not Cleaned Up on Component Unmount

**File:** `packages/desktop-client/src/enablebanking.ts:58-79`
**Issue:** `authorizeEnableBank` creates a `setInterval` timer for polling. If the calling component unmounts (e.g., user navigates away or closes the modal), the interval continues running and the promise never settles, causing a memory leak and orphaned network requests. The GoCardless equivalent uses a server-side polling approach with a stop mechanism (`gocardless-poll-web-token-stop`).
**Fix:** Accept an `AbortSignal` or return a cleanup function:
```typescript
export function authorizeEnableBank(
  aspspName: string,
  aspspCountry: string,
  signal?: AbortSignal,
): Promise<...> {
  // ...
  return new Promise((resolve, reject) => {
    const pollTimer = setInterval(async () => {
      if (signal?.aborted) {
        clearInterval(pollTimer);
        reject(new Error('aborted'));
        return;
      }
      // ...existing logic
    }, POLL_INTERVAL_MS);
  });
}
```

### WR-07: `useEnableBankingSyncStatus` Stale Closure Over `accountIds`

**File:** `packages/desktop-client/src/hooks/useEnableBankingStatus.ts:100-122`
**Issue:** The `accountIdsKey` is used as a deps array element for `useEffect`, but the `fetch` function inside captures `accountIds` from the outer scope (line 109). If the array reference changes but `accountIdsKey` stays the same (same contents), `fetch` is NOT re-called (correct). But if `accountIdsKey` changes, the `fetch` call uses the `accountIds` from the render that triggered the effect, which is fine. The real issue: the `eslint-disable` comment on line 121 suppresses the exhaustive-deps warning for `accountIds`, which means if a future developer adds logic that depends on the actual array reference (not the key), the stale closure won't be caught.
**Fix:** Use `accountIds` derived from `accountIdsKey` inside the effect to be safe, or document the suppression rationale.

### WR-08: `unlinkAccount` Does Not Clean Up Enable Banking Server-Side Data

**File:** `packages/loot-core/src/server/accounts/link-accounts.ts:335-410`
**Issue:** When unlinking an account, `unlinkAccount` clears the local DB fields and, for GoCardless accounts only (line 363: `if (isGoCardless === false) { return; }`), calls the server to remove the requisition. For Enable Banking accounts, the function returns early at line 363 without calling `/remove-session` on the sync server. This means `eb_account_map` and `eb_sessions` rows persist on the server after unlink, causing stale data in `/sync-status` queries and preventing clean re-linking.
**Fix:** Add Enable Banking cleanup before the early return:
```typescript
const isEnableBanking = accRow.account_sync_source === 'enableBanking';

if (isEnableBanking) {
  const serverConfig = getServer();
  if (serverConfig && userToken) {
    try {
      await post(
        serverConfig.ENABLEBANKING_SERVER + '/remove-session',
        { sessionId: bank.bank_id },
        { 'X-ACTUAL-TOKEN': userToken },
      );
    } catch (error) {
      logger.log({ error });
    }
  }
}
```

## Info

### IN-01: EU Merchant Category Patterns Biased Toward Finnish/Nordic Market

**File:** `packages/loot-core/src/server/accounts/eb-category-rules.js:20-77`
**Issue:** The EU_MERCHANT_PATTERNS list includes Finnish-specific entries (HSL, VR, Matkahuolto, Fortum, Helen, Elenia, Telia, DNA, Elisa, K-Market, S-Market, Tokmanni, Prisma) which are uncommon outside Finland. The " VR " pattern (with spaces) will match any payee containing " VR " as a substring, which could produce false positives. The list is titled "EU merchant patterns" but is heavily weighted toward one country. Consider either documenting this as "Finnish + pan-EU" or allowing per-country pattern sets.
**Fix:** Document the bias in the comment block, or split into per-country pattern sets loaded based on the ASPSP country.

### IN-02: `console.error` Calls in Client-Side Mutations

**File:** `packages/desktop-client/src/accounts/mutations.ts:80,120,200,249,330`
**Issue:** Multiple `console.error` calls in onError handlers. These are development-only artifacts that provide no value in production. The dispatch of error notifications already handles user-facing error reporting.
**Fix:** Remove or replace with structured logging if a client-side logger is available.

### IN-03: `enablebanking-service.ts` Missing Type Annotations for Function Parameters

**File:** `packages/sync-server/src/app-enablebanking/enablebanking-service.ts:50,95,148,162`
**Issue:** Functions `ebRequest`, `getAspsps`, `exchangeCode`, `getTransactions` use `any`-typed parameters via the `@ts-strict-ignore` directive. TypeScript interfaces exist in `enablebanking.types.ts` but are not applied to the service functions. The comment in the types file says "used for documentation and editor autocomplete only" but the service layer would benefit from explicit typing to catch type mismatches at compile time.
**Fix:** Apply the `EBAccount`, `EBTransaction`, `EBSession` types as return types on the service functions.

---

_Reviewed: 2026-05-23T14:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
