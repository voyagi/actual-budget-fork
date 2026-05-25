---
phase: 03-automation-consent-lifecycle
plan: 01
subsystem: sync-server
tags: [scheduler, cron, consent, auto-sync, enable-banking]
dependency_graph:
  requires:
    - 02-05-SUMMARY.md
  provides:
    - scheduler.ts with 6-hour cron and session-grouped sync
    - createAuth fixed with maximum_consent_validity
    - /sync-status extended with consent_valid_until, session_id, aspsp_name
  affects:
    - packages/sync-server/src/scheduler.ts
    - packages/sync-server/src/app-enablebanking/enablebanking-service.ts
    - packages/sync-server/src/app-enablebanking/app-enablebanking.ts
    - packages/sync-server/src/app.ts
    - packages/desktop-client/src/hooks/useEnableBankingStatus.ts
tech_stack:
  added:
    - node-cron@4.2.1 (6-hour interval scheduler, TypeScript-native v4)
  patterns:
    - Session-grouped cron sync (one OAuth session = one bank connection = one group)
    - Differentiated error handling (RateLimitError breaks session, transient errors retry once)
    - Epoch-integer to ISO string conversion for synced_at client responses
    - EBUSY-safe test teardown via closeAccountDb() + graceful catch
key_files:
  created:
    - packages/sync-server/src/scheduler.ts
  modified:
    - packages/sync-server/src/app-enablebanking/enablebanking-service.ts
    - packages/sync-server/src/app-enablebanking/enablebanking-service.test.js
    - packages/sync-server/src/app-enablebanking/app-enablebanking.ts
    - packages/sync-server/src/app-enablebanking/app-enablebanking.test.js
    - packages/sync-server/src/app.ts
    - packages/sync-server/src/account-db.ts
    - packages/sync-server/vitest.globalSetup.js
    - packages/desktop-client/src/hooks/useEnableBankingStatus.ts
    - packages/sync-server/package.json
    - yarn.lock
decisions:
  - "5-field cron (0 0,6,12,18 * * *) preferred over 6-field node-cron v4 format for compatibility clarity"
  - "Session-grouped sync loop: consent expiry checked once per bank connection (not per account)"
  - "RateLimitError breaks session loop immediately (no sleep/retry - applies to entire API connection)"
  - "db.all() cast as unknown as AccountRow[] to satisfy TypeScript strict mode"
  - "EBUSY teardown catch: test results are recorded before teardown; Windows file lock is non-fatal"
metrics:
  duration: 70min
  completed: "2026-03-01"
  tasks: 2
  files_changed: 10
---

# Phase 03 Plan 01: Scheduler, Consent Ceiling Fix, and Sync-Status Extension Summary

**One-liner:** 6-hour cron scheduler with session-grouped sync, maximum_consent_validity from Enable Banking ASPSP listing instead of hardcoded 90 days, and /sync-status extended with consent expiry per account.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create scheduler, fix createAuth consent ceiling, update tests | 93fc2614a, fde8bc77f | scheduler.ts, enablebanking-service.ts, enablebanking-service.test.js, app.ts, package.json, yarn.lock |
| 2 | Extend /sync-status with consent expiry and session identity | aeb486753 | app-enablebanking.ts, app-enablebanking.test.js, useEnableBankingStatus.ts |

## What Was Built

### Task 1: Scheduler + createAuth Fix

**scheduler.ts** - New file implementing the automation backbone:
- `startScheduler()` exported function checks `ENABLE_AUTO_SYNC !== 'true'` gate, registers 5-field cron `'0 0,6,12,18 * * *'` via node-cron v4
- Session-grouped sync loop: all accounts queried with JOIN to eb_sessions, grouped by session_id into a Map so consent expiry is checked once per bank connection
- Expired sessions: `new Date(valid_until) < new Date()` check skips entire session group with descriptive log
- RateLimitError: immediately breaks out of the account loop for the session (no sleep - 429 applies to entire API connection)
- SessionExpiredError: breaks out of the account loop for the session
- Transient errors: waits 30s then retries once, on second failure logs and inserts error into eb_sync_log
- `syncOneAccount()` helper: converts epoch synced_at to YYYY-MM-DD for EB API, calls getTransactions + getBalances directly (no internal HTTP), inserts success entry to eb_sync_log

**enablebanking-service.ts createAuth fix:**
- Before creating the auth request, calls `getAspsps(aspspCountry)` to fetch bank listing
- Reads `maximum_consent_validity` from the matched ASPSP entry
- Falls back to 180 days if ASPSP not found or field absent
- `console.warn` on ASPSP name mismatch makes silent fallbacks visible in logs
- Removed hardcoded `90 * 24 * 60 * 60 * 1000`

**enablebanking-service.test.js updates:**
- Updated 2 existing createAuth tests to mock two sequential axios calls (GET /aspsps first, then POST /auth)
- Added test "falls back to 180-day validity when ASPSP has no maximum_consent_validity"
- Added test "warns when ASPSP name not found in listing"

**app.ts wiring:** `startScheduler()` imported from `./scheduler.js` and called at the end of `run()` after the https/http listen block.

### Task 2: /sync-status Extension

**app-enablebanking.ts /sync-status handler:**
- For each accountId: looks up session_id from eb_account_map, looks up valid_until and aspsp_name from eb_sessions
- Provides explicit `defaultEntry` object (null synced_at, null status, 0 transactions, null errors) for never-synced accounts instead of returning null
- Converts `synced_at` from Unix epoch integer to ISO string so client receives consistent format
- Adds `consent_valid_until`, `session_id`, `aspsp_name` fields to each status entry

**useEnableBankingStatus.ts type update:**
- Extended `SyncStatusEntry` type with `transactions_added`, `transactions_updated`, `error_code`, `consent_valid_until`, `session_id`, `aspsp_name`
- All new fields nullable; `synced_at` documented as ISO string

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict type error in scheduler.ts**
- **Found during:** Pre-push hook (typecheck)
- **Issue:** `db.all()` returns `Record<string, unknown>[]` but was assigned to `AccountRow[]` directly
- **Fix:** Added `as unknown as AccountRow[]` cast on the db.all() call
- **Files modified:** packages/sync-server/src/scheduler.ts
- **Commit:** fde8bc77f

**2. [Rule 1 - Bug] Existing test expected `null` for never-synced accounts, but plan spec returns explicit defaults**
- **Found during:** Task 2 test run
- **Issue:** Test `'returns null for accounts with no sync log'` expected `.toBeNull()` but new handler returns a defaults object
- **Fix:** Updated test to `'returns explicit defaults for accounts with no sync log'` checking `not.toBeNull()` and verifying null fields
- **Files modified:** packages/sync-server/src/app-enablebanking/app-enablebanking.test.js
- **Commit:** aeb486753

**3. [Rule 1 - Bug] Pre-existing EBUSY on Windows in vitest teardown blocked push**
- **Found during:** First git push attempt (pre-push hook ran lage test)
- **Issue:** vitest.globalSetup.js teardown calls `runMigrations('down')` which tries to `fs.rm()` the test SQLite directory while better-sqlite3 still holds the file open on Windows
- **Fix:** Added `closeAccountDb()` to account-db.ts (closes and resets singleton DB handle). Called it in teardown before migrations down. Wrapped the DOWN migration call in try/catch that ignores EBUSY errors (tests pass before teardown; Windows lock is non-fatal)
- **Files modified:** packages/sync-server/src/account-db.ts, packages/sync-server/vitest.globalSetup.js
- **Commit:** 724cbed89

## Requirements Satisfied

- AUTO-01: Server-side scheduled sync every 6 hours when `ENABLE_AUTO_SYNC=true`
- AUTO-02: createAuth reads `maximum_consent_validity` from Enable Banking ASPSP listing (no hardcoded 90-day cap)
- AUTO-06: /sync-status returns `consent_valid_until` and `session_id` per account for client banner display

## Self-Check: PASSED

- scheduler.ts exists and exports startScheduler: FOUND
- node-cron in package.json: FOUND (4.2.1)
- enablebanking-service.ts contains maximum_consent_validity: FOUND
- app-enablebanking.ts /sync-status contains consent_valid_until: FOUND
- app.ts calls startScheduler(): FOUND
- useEnableBankingStatus.ts type includes consent_valid_until: FOUND
- All 482 tests pass (40 test files), exit code 0: VERIFIED
- Pre-push hook (typecheck + test): PASSED
- Commits 93fc2614a, aeb486753, fde8bc77f, 724cbed89: VERIFIED
