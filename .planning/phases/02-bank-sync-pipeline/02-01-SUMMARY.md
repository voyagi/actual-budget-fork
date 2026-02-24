---
phase: 02-bank-sync-pipeline
plan: 01
subsystem: database
tags: [sqlite, enablebanking, normalizer, transactions, migrations]

requires:
  - phase: 01-foundation-and-api-client
    provides: enablebanking-service.js with ebRequest/generateJWT/loadPrivateKey, account-db.js with getAccountDb()

provides:
  - runMigrations() creating eb_sessions, eb_account_map, eb_sync_log tables
  - EnableBankingError, SessionExpiredError, RateLimitError error classes
  - EBTransaction, EBBalance, EBAccount, EBSession TypeScript interfaces
  - link.html OAuth popup auto-close page
  - getAspsps, createAuth, exchangeCode, getSessionAccounts, getTransactions, getBalances service functions
  - normalizeTransaction (CRDT/DBIT sign, date+notes for loot-core defaultMappings)
  - normalizeAccount (account_id || uid derivation)
  - extractBalance (CLAV > ITAV > ITBD > CLBD priority, integer minor units)

affects: [02-03-routes, 02-04-loot-core-integration, 03-automation-and-consent]

tech-stack:
  added: []
  patterns:
    - 'getAccountDb() from account-db.js is the database access pattern for all eb_ tables'
    - 'normalizeTransaction isBooked parameter set from transaction status field (BOOK=true, PDNG=false)'
    - 'account_id derivation: ebAccount.account_id ?? ebAccount.uid - must be consistent between normalizeAccount and /callback route'
    - 'Pagination via continuation_key loop with maxPages=100 safeguard'

key-files:
  created:
    - packages/sync-server/src/app-enablebanking/migrations.js
    - packages/sync-server/src/app-enablebanking/errors.js
    - packages/sync-server/src/app-enablebanking/enablebanking.types.ts
    - packages/sync-server/src/app-enablebanking/link.html
    - packages/sync-server/src/app-enablebanking/utils.js
  modified:
    - packages/sync-server/src/app-enablebanking/enablebanking-service.js

key-decisions:
  - 'eb_sync_log uses actual_account_id (Actual Budget UUID) as primary identifier, not eb_account_uid, because the UI naturally has Actual UUIDs when querying sync status'
  - 'normalizeTransaction returns top-level date and notes fields required by loot-core defaultMappings - without date every transaction throws an error'
  - 'getTransactions maxPages=100 safeguard: logs warning and returns collected results rather than looping indefinitely if Enable Banking API returns unexpected continuation_key chains'
  - 'normalizeAccount account_id derivation (account_id ?? uid) must be replicated exactly in /callback route to maintain eb_account_map consistency'

patterns-established:
  - 'Balance extraction: CLAV > ITAV > ITBD > CLBD priority picks the most current available balance'
  - 'CRDT/DBIT sign convention: CRDT credit = positive amount, DBIT debit = negative amount'

requirements-completed: [SYNC-03, SYNC-04, SYNC-05, SYNC-08]

duration: 25min
completed: 2026-02-19
---

# Phase 2 Plan 01: Data Layer and Transaction Normalizer Summary

**SQLite migrations for three Enable Banking tables, six API service functions with pagination safeguard, and a transaction normalizer that maps snake_case Enable Banking data to the camelCase shape expected by loot-core's defaultMappings**

## Performance

- **Duration:** 25 min
- **Started:** 2026-02-19T00:00:00Z
- **Completed:** 2026-02-19T00:25:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Three idempotent SQLite migrations (eb_sessions, eb_account_map, eb_sync_log) with `actual_account_id` as the primary sync log identifier to match Actual Budget UUID usage in the UI
- Six Enable Banking API service functions added to `enablebanking-service.js` including paginated `getTransactions` with a maxPages=100 infinite-loop safeguard
- `utils.js` normalizer: `normalizeTransaction` correctly maps CRDT/DBIT sign convention and produces the `date` and `notes` top-level fields that loot-core's `normalizeBankSyncTransactions()` requires via `defaultMappings`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create DB migrations, error types, TS types, and link.html** - `3ccd63f1c` (feat)
2. **Task 2: Extend enablebanking-service.js and create utils.js normalizer** - `740889090` (feat)

**Plan metadata:** (to be added after docs commit)

## Files Created/Modified

- `packages/sync-server/src/app-enablebanking/migrations.js` - `runMigrations()` creates eb_sessions, eb_account_map, eb_sync_log via `CREATE TABLE IF NOT EXISTS`
- `packages/sync-server/src/app-enablebanking/errors.js` - EnableBankingError (with errorCode), SessionExpiredError, RateLimitError custom error classes
- `packages/sync-server/src/app-enablebanking/enablebanking.types.ts` - EBTransaction, EBBalance, EBAccount, EBSession TypeScript interfaces matching Enable Banking API snake_case fields
- `packages/sync-server/src/app-enablebanking/link.html` - OAuth popup auto-close page matching GoCardless pattern
- `packages/sync-server/src/app-enablebanking/enablebanking-service.js` - Extended with 6 new API functions (getAspsps, createAuth, exchangeCode, getSessionAccounts, getTransactions, getBalances)
- `packages/sync-server/src/app-enablebanking/utils.js` - normalizeTransaction, normalizeAccount, extractBalance normalizers

## Decisions Made

- `eb_sync_log` uses `actual_account_id` not `account_id` to remove ambiguity - the Actual Budget UUID is what the UI has when querying sync status
- `normalizeTransaction` includes top-level `date` (booking_date preferred, value_date fallback) and `notes` (remittance_information[0]) because loot-core `defaultMappings` reads these fields directly - missing `date` causes a thrown error on every transaction
- `getTransactions` pagination safeguard uses `maxPages=100` with `console.warn` rather than throwing, returning partial results - partial data is better than a crashed sync job
- `normalizeAccount` uses `ebAccount.account_id ?? ebAccount.uid` and this derivation is documented as a constraint that the `/callback` route in Plan 02-03 must replicate exactly

## Deviations from Plan

None - plan executed exactly as written. Minor cleanup: removed unused `firstPage` variable from `getTransactions` (not a deviation, just clean code).

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All data layer prerequisites for Plan 02-03 (routes) are complete
- `runMigrations()` is ready to be called from `app-enablebanking.js` startup
- Service functions cover all Enable Banking API calls needed by the OAuth flow and sync pipeline
- `normalizeTransaction` and `extractBalance` are ready for use in the sync route handlers
- Constraint documented: `/callback` route must use `ebAccount.account_id ?? ebAccount.uid` when inserting into `eb_account_map.eb_account_uid`

---

_Phase: 02-bank-sync-pipeline_
_Completed: 2026-02-19_
