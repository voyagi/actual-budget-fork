---
phase: 07-observability-and-monitoring
plan: 02
subsystem: observability
tags: [winston, audit-log, metrics, alerter, middleware, express]

# Dependency graph
requires:
  - phase: 07-01
    provides: Winston logger, writeAuditLog, recordLatency/recordSyncRun/getLatencyPercentiles/getSyncStats, triggerAlert utilities

provides:
  - Winston logger wired into scheduler.ts (zero console.* calls)
  - Audit log callsites for login, bootstrap, password-change, OpenID auth, EB consent auth, EB account link, EB consent renewal
  - In-memory auth failure rate counter triggering alert on 3+ failures in 5 min from same IP
  - Latency middleware recording every request processing time
  - Enriched error middleware with url, hasSession bool, errorClass, stack
  - Enriched /metrics endpoint returning latency percentiles, sync stats, EB session counts
  - runAuditMigrations() called at server startup
  - ALERT_WEBHOOK_URL documented in convict config schema

affects: [08-quality-and-test-infrastructure, 09-feature-expansion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fire-and-forget alerts: triggerAlert(...).catch(() => {}) in scheduler and auth handlers"
    - "in-memory rate counter per IP: Map<ip, {count, windowStart}> with sliding window reset"
    - "latency middleware: res.on('finish') callback pattern for accurate end-to-end timing"
    - "try/catch around runAuditMigrations() at startup: DB may not exist before bootstrap"

key-files:
  created: []
  modified:
    - packages/sync-server/src/scheduler.ts
    - packages/sync-server/src/scheduler.test.ts
    - packages/sync-server/src/app-account.ts
    - packages/sync-server/src/app-openid.ts
    - packages/sync-server/src/accounts/openid.js
    - packages/sync-server/src/app-enablebanking/app-enablebanking.ts
    - packages/sync-server/src/util/middlewares.ts
    - packages/sync-server/src/app.ts
    - packages/sync-server/src/load-config.ts

key-decisions:
  - "Modified app-openid.ts (not app-account.ts) to pass req.ip to loginWithOpenIdFinalize: plan had wrong call site, actual caller is app-openid.ts with req.query not req.body"
  - "scheduler.test.ts spy cast to unknown[][]: Winston logger.info TypeScript overloads type mock.calls as single-arg tuple, cast required to index metadata arg"
  - "consent_expiry event_type shared for expired (severity:error) and expiring-soon (severity:warning): 1h cooldown groups them, prevents spam"

patterns-established:
  - "Audit callsite pattern: writeAuditLog({ event_type, actor, ip_address: req.ip, outcome, details }) after each auth operation"
  - "Auth failure tracking: module-level Map with sliding 5-min window, triggerAlert on threshold breach then reset"

requirements-completed: [obs-1, obs-2, obs-3, obs-4]

# Metrics
duration: 35min
completed: 2026-03-18
---

# Phase 7 Plan 02: Observability Callsite Wiring Summary

**All observability utilities (Plan 01) wired into seven sync-server callsite files: structured logging in scheduler, audit log on every auth/EB operation, latency + error middleware enrichment, and webhook alerts on sync failure, consent expiry, and repeated auth failures**

## Performance

- **Duration:** 35 min
- **Started:** 2026-03-18T23:35:00Z
- **Completed:** 2026-03-18T23:55:00Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments

- scheduler.ts: all 11 console.log/error calls replaced with structured logger.info/warn/error; recordSyncRun() at end of each run; triggerAlert() on sync failure after retries exhausted and on consent expiry (error) or expiring within 14 days (warning)
- Auth audit trail complete: writeAuditLog for login_success, login_failure (3 paths), bootstrap, password_change (success+fail), openid_auth (success+fail), eb_consent_auth, eb_account_link, eb_consent_renewal; plus in-memory auth failure rate counter firing auth_failure_burst alert at 3+ failures/5min from same IP
- Observability infrastructure connected: latencyMiddleware mounted on all routes, enriched errorMiddleware with url/hasSession/errorClass/stack, /metrics returns {mem, uptime, latency, sync, sessions}, runAuditMigrations at server start

## Task Commits

1. **Task 1: Replace console.log with Winston logger in scheduler, add sync metrics and alerts** - `dbe94278f` (feat)
2. **Task 2: Add audit log callsites in auth, OpenID, and Enable Banking routes** - `843193f13` (feat)
3. **Task 3: Enrich error middleware, mount latency middleware, enrich /metrics, add ALERT_WEBHOOK_URL config** - `958e1258e` (feat)

## Files Created/Modified

- `packages/sync-server/src/scheduler.ts` - Winston logger replaces all console.*, recordSyncRun, triggerAlert for sync_failure and consent_expiry
- `packages/sync-server/src/scheduler.test.ts` - Updated test to spy on logger.info instead of console.log; fixed Winston TS overload cast
- `packages/sync-server/src/app-account.ts` - writeAuditLog for login/bootstrap/password-change, authFailureTracker with triggerAlert('auth_failure_burst')
- `packages/sync-server/src/app-openid.ts` - Pass req.ip to loginWithOpenIdFinalize for OpenID audit logging
- `packages/sync-server/src/accounts/openid.js` - writeAuditLog for openid_auth success (after session creation) and failure (catch block)
- `packages/sync-server/src/app-enablebanking/app-enablebanking.ts` - writeAuditLog for eb_consent_auth, eb_account_link, eb_consent_renewal; logger.info replaces console.log in reauth-complete
- `packages/sync-server/src/util/middlewares.ts` - latencyMiddleware export, enriched errorMiddleware fields (url, hasSession, errorClass, stack)
- `packages/sync-server/src/app.ts` - mount latencyMiddleware, enrich /metrics, call runAuditMigrations at startup, import new utilities
- `packages/sync-server/src/load-config.ts` - alertWebhookUrl entry documenting ALERT_WEBHOOK_URL env var

## Decisions Made

- **loginWithOpenIdFinalize call site**: Plan specified app-account.ts but actual caller is app-openid.ts (verified via Grep). Modified app-openid.ts to spread `{ ...req.query, ip_address: req.ip }` — same intent, correct file.
- **consent_expiry shared event_type**: Both expired consent (skip, severity:error) and expiring-soon within 14 days (continue syncing, severity:warning) use the same event_type. The 1h cooldown in alerter.ts groups them into one alert stream per hour rather than spamming on every sync cycle.
- **authFailureTracker reset after alert**: Counter deleted after triggerAlert so subsequent failures restart the window. Alerter's 1h cooldown prevents rapid-re-fire.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] loginWithOpenIdFinalize called from app-openid.ts, not app-account.ts**
- **Found during:** Task 2 (audit callsites)
- **Issue:** Plan said to modify `loginWithOpenIdFinalize(req.body)` in app-account.ts, but the actual caller is `app-openid.ts` line 99 with `req.query` (confirmed via Grep)
- **Fix:** Modified app-openid.ts to pass `{ ...req.query, ip_address: req.ip }` instead of app-account.ts
- **Files modified:** packages/sync-server/src/app-openid.ts
- **Verification:** openid.js receives body.ip_address correctly; 518 tests pass
- **Committed in:** 843193f13 (Task 2 commit)

**2. [Rule 1 - Bug] scheduler.test.ts spied on console.log which was replaced by logger.info**
- **Found during:** Task 1 verification (test run)
- **Issue:** Test "logs each retry attempt" used `vi.spyOn(console, 'log')` — after replacing console.log with logger.info, spy captured 0 calls
- **Fix:** Updated test to spy on `logger.info` from `./util/logger.js`; cast `mock.calls` to `unknown[][]` to work around Winston's narrow TypeScript overloads typing calls as single-arg tuples
- **Files modified:** packages/sync-server/src/scheduler.test.ts
- **Verification:** All 9 scheduler tests pass; tsc --noEmit exits 0
- **Committed in:** dbe94278f (Task 1 commit) + 958e1258e (tsc fix)

---

**Total deviations:** 2 auto-fixed (2x Rule 1 - Bug)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered

None beyond the two auto-fixed deviations above.

## User Setup Required

None — no external service configuration required for this plan. ALERT_WEBHOOK_URL is optional; alerts are stored in-memory and available via GET /alerts even without a webhook configured.

## Next Phase Readiness

- All four observability requirements (obs-1 through obs-4) complete
- Phase 07 Plan 03 (if any) can proceed: all callsites wired, utility modules connected
- /metrics endpoint ready for monitoring integration
- Audit log populated on every auth event
- Webhook alerts fire on sync failure, consent expiry (14 days), and auth failure bursts

---
*Phase: 07-observability-and-monitoring*
*Completed: 2026-03-18*
