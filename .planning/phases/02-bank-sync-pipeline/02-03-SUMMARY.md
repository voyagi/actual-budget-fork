---
phase: 02-bank-sync-pipeline
plan: 03
subsystem: api
tags: [enablebanking, express, ipc, oauth, sqlite, sync-server, loot-core]

# Dependency graph
requires:
  - phase: 02-bank-sync-pipeline
    provides: "02-01: runMigrations, normalizeTransaction, normalizeAccount, extractBalance, getAspsps, createAuth, exchangeCode, getTransactions, getBalances, eb_sessions/eb_account_map/eb_sync_log tables"
  - phase: 02-bank-sync-pipeline
    provides: "02-02: ENABLEBANKING_SERVER in getServer(), downloadEnableBankingTransactions, SyncServerEnableBankingAccount type, enableBanking in AccountSyncSource"

provides:
  - "11 HTTP routes in app-enablebanking.js: test-auth, callback, link (unauthenticated) + status, get-banks, create-auth, get-accounts, transactions, remove-session, sync-status, update-account-map (authenticated)"
  - "OAuth CSRF protection via UUID state stored in eb_sessions and validated in /callback"
  - "/callback derives eb_account_uid as account.account_id || account.uid matching normalizeAccount() derivation"
  - "/get-accounts enriches accounts with aspsp_name from session row before normalizeAccount() call"
  - "/transactions null guard returns ACCOUNT_NOT_MAPPED in status:ok wrapper (loot-core post() unwrappable)"
  - "/transactions logs actual_account_id from map row (not req.body) for /sync-status compatibility"
  - "/update-account-map populates eb_account_map.actual_account_id at link time"
  - "6 IPC handlers in loot-core app.ts: enablebanking-status, -get-banks, -create-auth, -poll-session, -accounts-link, -sync-status"
  - "enablebanking-accounts-link creates Actual account, calls /update-account-map, throws on failure, triggers initial sync"
  - "All 6 handlers registered in AccountHandlers type map for TypeScript type safety"

affects:
  - 02-04-PLAN (scheduler calls syncAccount() which calls downloadEnableBankingTransactions via the /transactions route built here)
  - desktop-client bank sync modal uses enablebanking-get-banks, enablebanking-create-auth, enablebanking-poll-session, enablebanking-accounts-link IPC handlers

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "OAuth callback route is unauthenticated (before export { app as handlers }) - same as GoCardless GET /link pattern"
    - "ACCOUNT_NOT_MAPPED error uses status:ok wrapper so loot-core post() unwraps it and download function sees error_code"
    - "eb_account_uid in eb_account_map uses account.account_id || account.uid matching normalizeAccount() - consistency constraint"
    - "linkEnableBankingAccount calls POST /update-account-map after account creation and throws if it fails - link aborts on mapping failure"
    - "findOrCreateBank expects { name: institution_string } object, not bare string"

key-files:
  created: []
  modified:
    - packages/sync-server/src/app-enablebanking/app-enablebanking.js
    - packages/loot-core/src/server/accounts/app.ts

key-decisions:
  - "GET /callback placed before export { app as handlers } so bank redirect (unauthenticated browser request) reaches it without Actual session middleware"
  - "Pending eb_sessions row uses state as temporary id placeholder until /callback sets id = real session_id - SQLite TEXT PRIMARY KEY allows this and state is already unique"
  - "linkEnableBankingAccount aborts link on /update-account-map failure - partial link (account without mapping) would cause silent sync log failures and broken /sync-status"
  - "findOrCreateBank receives { name: account.institution } object (not bare string) - matches SimpleFin/PluggyAi pattern, needed because link.ts reads institution.name"

patterns-established:
  - "Enable Banking route ordering: unauthenticated (callback, link) before export, authenticated POST routes after validateSessionMiddleware"
  - "Sync log uses mapRow.actual_account_id || accountId fallback - handles cases where sync call passes EB UID before mapping is complete"

requirements-completed: [SYNC-01, SYNC-06, SYNC-07, SYNC-08]

# Metrics
duration: 30min
completed: 2026-02-19
---

# Phase 2 Plan 03: Enable Banking Routes and IPC Handlers Summary

**11 Express routes and 6 loot-core IPC handlers wiring the full OAuth flow, transaction fetch pipeline, and account linking from desktop-client through loot-core to sync-server Enable Banking API**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-02-19T00:00:00Z
- **Completed:** 2026-02-19T00:30:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Rewrote `app-enablebanking.js` to add 9 new routes (keeping 2 existing: test-auth, status), with GET /callback and GET /link correctly placed before `export { app as handlers }` so unauthenticated bank redirects reach them
- Implemented CSRF-protected OAuth flow: /create-auth generates UUID state stored in eb_sessions, /callback validates state before exchanging code, derives `eb_account_uid = account.account_id || account.uid` matching `normalizeAccount()` derivation exactly
- /get-accounts enriches raw Enable Banking accounts with `aspsp_name` from the session row before normalization, ensuring the `institution` field is populated for the account linking modal
- /transactions null guard returns `ACCOUNT_NOT_MAPPED` in `status:'ok'` wrapper matching GoCardless error pattern so loot-core `post()` unwraps it correctly
- Added 6 IPC handlers to loot-core `app.ts` including `linkEnableBankingAccount` which creates the Actual account, calls POST /update-account-map (throws on failure), and triggers initial sync

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement all Enable Banking routes in app-enablebanking.js** - `7c393657c` (feat)
2. **Task 2: Add Enable Banking IPC handlers in loot-core app.ts** - `51d6cc357` (feat)

**Plan metadata:** (to be added after docs commit)

## Files Created/Modified

- `packages/sync-server/src/app-enablebanking/app-enablebanking.js` - 11 routes total (test-auth, callback, link unauthenticated; status, get-banks, create-auth, get-accounts, transactions, remove-session, sync-status, update-account-map authenticated); runMigrations() called at module load
- `packages/loot-core/src/server/accounts/app.ts` - 6 new IPC handlers + 6 AccountHandlers type entries + SyncServerEnableBankingAccount import

## Decisions Made

- GET /callback placed before `export { app as handlers }` so the bank's browser redirect (unauthenticated) reaches the route without hitting Actual's session middleware
- Pending `eb_sessions` row uses `state` as the temporary `id` placeholder (SQLite TEXT PRIMARY KEY allows null but we use state since it's unique anyway). The `/callback` route then UPDATEs to `id = session_id`
- `linkEnableBankingAccount` aborts the link if POST /update-account-map fails - a partial link without the actual_account_id mapping would cause silent sync log failures and broken /sync-status queries with no user-visible error
- `findOrCreateBank` receives `{ name: account.institution }` object (not a bare string) - this matches the SimpleFin/PluggyAi pattern and is required because `link.ts` reads `institution.name`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] findOrCreateBank institution argument wrapped in object**
- **Found during:** Task 2 (linkEnableBankingAccount implementation)
- **Issue:** Plan said pass `account.institution` (a string) to `findOrCreateBank`. Reading `link.ts` revealed it expects `institution.name` (an object). Passing a bare string would make `bank.name` undefined in the banks table.
- **Fix:** Changed to `{ name: account.institution }` matching SimpleFin/PluggyAi pattern
- **Files modified:** packages/loot-core/src/server/accounts/app.ts
- **Verification:** Read link.ts - line 19 reads `institution.name`, confirming the object form is required
- **Committed in:** `51d6cc357` (Task 2 commit)

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Fix necessary for correctness - bank name would be undefined in the banks table without it. No scope creep.

## Issues Encountered

None. Bash was available this session.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Full request path is wired from desktop-client IPC to sync-server HTTP to Enable Banking API
- Plan 02-04 (scheduler) can call `syncAccount()` for `'enableBanking'` accounts and the pipeline routes through `downloadEnableBankingTransactions` -> POST /transactions -> getTransactions/getBalances
- Desktop-client can call `send('enablebanking-get-banks', { country })` to list banks, `send('enablebanking-create-auth', ...)` to start OAuth, and `send('enablebanking-poll-session', ...)` to poll for completion
- After user completes OAuth, `send('enablebanking-accounts-link', ...)` creates the Actual account, populates `eb_account_map.actual_account_id`, and triggers initial sync
- `send('enablebanking-sync-status', { accountIds })` returns last sync log entries by Actual UUID

## Self-Check: PASSED

Files verified:
- `packages/sync-server/src/app-enablebanking/app-enablebanking.js` - FOUND (runMigrations at line 25, export at line 112, 11 routes confirmed)
- `packages/loot-core/src/server/accounts/app.ts` - FOUND (all 6 enablebanking-* handlers in type map and app.method registrations confirmed)
- `.planning/phases/02-bank-sync-pipeline/02-03-SUMMARY.md` - FOUND

Commits verified:
- `7c393657c` - Task 1 feat commit (app-enablebanking.js routes) - FOUND
- `51d6cc357` - Task 2 feat commit (app.ts IPC handlers) - FOUND

---
*Phase: 02-bank-sync-pipeline*
*Completed: 2026-02-19*
