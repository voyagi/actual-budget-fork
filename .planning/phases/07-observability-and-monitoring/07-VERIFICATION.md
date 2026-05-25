---
phase: 07-observability-and-monitoring
verified: 2026-03-18T00:00:00Z
status: passed
score: 14/14 must-haves verified
re_verification: false
---

# Phase 7: Observability and Monitoring Verification Report

**Phase Goal:** Structured error tracking via Winston file logs, webhook alerting for operational events, audit logging for auth and EB operations, request latency and sync duration metrics, in-app notification of operational alerts.
**Verified:** 2026-03-18
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Winston logger writes JSON-formatted log entries to daily-rotated files | VERIFIED | `logger.ts` has `DailyRotateFile` transport with `winston.format.json()`, `maxFiles: '30d'`, `/data/logs` default, guarded by `NODE_ENV !== 'test'` |
| 2 | `audit_log` table exists in account database with correct schema | VERIFIED | `audit-migrations.ts` has `CREATE TABLE IF NOT EXISTS audit_log` with 7 columns and `CHECK(outcome IN ('success','fail'))` constraint |
| 3 | `writeAuditLog()` inserts a row and never throws on DB errors | VERIFIED | `audit.ts` wraps INSERT in `try/catch`, logs error via `logger.error`, never re-throws |
| 4 | `triggerAlert()` sends webhook POST, respects 1-hour cooldown, stores alerts in-memory | VERIFIED | `alerter.ts`: cooldown Map keyed by `event_type`, `COOLDOWN_MS = 60 * 60 * 1000`, `recentAlerts` array (max 50), `fetch()` with `AbortController` 5s timeout |
| 5 | `recordLatency()` tracks request times; `getLatencyPercentiles()` returns p50/p95/p99 | VERIFIED | `metrics.ts`: fixed 1000-sample window, sorted array percentile math, returns `{p50, p95, p99}` or `null` |
| 6 | Scheduler uses `logger.info/warn/error` with no `console.log`/`console.error` | VERIFIED | `scheduler.ts`: zero `console.*` calls; all 11 statements replaced with structured Winston calls with metadata objects |
| 7 | Login, bootstrap, password change, OpenID auth, EB consent, and EB account link operations recorded in `audit_log` | VERIFIED | `app-account.ts`: `login_success`, `login_failure` (3 paths), `bootstrap`, `password_change` (success+fail). `openid.js`: `openid_auth` (success+fail). `app-enablebanking.ts`: `eb_consent_auth`, `eb_account_link`, `eb_consent_renewal` |
| 8 | Webhook alert fires on sync failure, consent expiry within 14 days, and 3+ auth failures in 5 minutes | VERIFIED | `scheduler.ts`: `event_type: 'sync_failure'` and `event_type: 'consent_expiry'` with `daysUntilExpiry <= 14` check. `app-account.ts`: `event_type: 'auth_failure_burst'` on `AUTH_FAILURE_THRESHOLD = 3` in `AUTH_FAILURE_WINDOW_MS = 5 * 60 * 1000` |
| 9 | `/metrics` endpoint returns latency percentiles, sync stats, and EB session counts | VERIFIED | `app.ts`: handler calls `getLatencyPercentiles()`, `getSyncStats()`, and queries `eb_sessions` for `active` and `expiringWithin14Days` counts |
| 10 | Latency middleware records request processing time for every HTTP request | VERIFIED | `middlewares.ts`: `latencyMiddleware` uses `res.on('finish', () => recordLatency(Date.now() - start))`. `app.ts`: `app.use(latencyMiddleware)` after `express.json()` |
| 11 | Error middleware enriches Winston logs with url, hasSession boolean, errorClass, stack | VERIFIED | `middlewares.ts` `errorMiddleware`: logs `{ url: req.url, hasSession: !!req.headers['x-actual-token'], errorClass: err.constructor.name, stack: err.stack }` |
| 12 | Sync-server exposes GET /alerts and POST /alerts/acknowledge | VERIFIED | `app.ts`: `app.get('/alerts', ...)` calling `getRecentAlerts()` and `app.post('/alerts/acknowledge', ...)` calling `acknowledgeAlert()` |
| 13 | Desktop client polls /alerts every 60 seconds, surfaces alerts as in-app notifications | VERIFIED | `useEnableBankingStatus.ts`: `useOperationalAlerts()` hook with `setInterval(poll, 60_000)`, dispatches sticky notifications via `addNotification` Redux action |
| 14 | Acknowledging a notification calls POST /alerts/acknowledge to prevent re-display | VERIFIED | `useEnableBankingStatus.ts`: `onClose` callback calls `send('operational-alerts-acknowledge', { alertId })` |

**Score:** 14/14 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/sync-server/src/util/logger.ts` | Winston logger with DailyRotateFile transport | VERIFIED | Has `import 'winston-daily-rotate-file'`, `DailyRotateFile` transport, JSON format, 30d retention, LOG_DIR env var, NODE_ENV guard |
| `packages/sync-server/src/util/audit-migrations.ts` | `audit_log` table creation migration | VERIFIED | `CREATE TABLE IF NOT EXISTS audit_log` with 7 columns, CHECK constraint, composite index |
| `packages/sync-server/src/util/audit.ts` | `writeAuditLog` helper and `AuditEventType` union | VERIFIED | Exports both; SHA-256 actor hashing (8-char hex), `system` actor verbatim, swallows DB errors |
| `packages/sync-server/src/util/metrics.ts` | In-memory metrics collector singleton | VERIFIED | Exports `recordLatency`, `getLatencyPercentiles`, `recordSyncRun`, `getSyncStats`, `MAX_SAMPLES = 1000` |
| `packages/sync-server/src/util/alerter.ts` | Webhook alerter with cooldown and in-memory alert store | VERIFIED | Exports `triggerAlert`, `getRecentAlerts`, `acknowledgeAlert`, `StoredAlert`; `MAX_ALERTS = 50`, `COOLDOWN_MS` |
| `packages/sync-server/src/util/middlewares.ts` | `latencyMiddleware` export, enriched `errorMiddleware` | VERIFIED | Both present with correct implementations |
| `packages/sync-server/src/app.ts` | Enriched `/metrics`, `/alerts`, `/alerts/acknowledge`, latency middleware, audit migration | VERIFIED | All five integrations confirmed |
| `packages/sync-server/src/scheduler.ts` | Winston logger, `recordSyncRun`, `triggerAlert` on failure and consent expiry | VERIFIED | Zero `console.*` calls; all three integrations present |
| `packages/sync-server/src/app-account.ts` | Audit log writes for login/bootstrap/password-change, auth failure alerting | VERIFIED | 7+ `writeAuditLog` callsites; `trackAuthFailure` on all 3 login failure paths |
| `packages/sync-server/src/accounts/openid.js` | Audit log write for OpenID auth success and failure | VERIFIED | 2 `writeAuditLog` calls: success (after `clearExpiredSessions()`) and failure (catch block) |
| `packages/sync-server/src/app-enablebanking/app-enablebanking.ts` | Audit log writes for consent auth, account link, consent renewal | VERIFIED | `eb_consent_auth`, `eb_account_link`, `eb_consent_renewal` all present; `logger.info` replaces prior `console.log` |
| `packages/sync-server/src/load-config.ts` | `ALERT_WEBHOOK_URL` config entry | VERIFIED | `alertWebhookUrl` entry with `env: 'ALERT_WEBHOOK_URL'` in convict schema |
| `packages/loot-core/src/server/accounts/provider-status.ts` | `fetchOperationalAlerts` and `acknowledgeOperationalAlert` IPC implementations | VERIFIED | Both exported; `fetchOperationalAlerts` uses `get()` with `BASE_SERVER + '/alerts'`; `acknowledgeOperationalAlert` uses `post()` with `BASE_SERVER + '/alerts/acknowledge'` |
| `packages/loot-core/src/server/accounts/app.ts` | IPC method registrations for `operational-alerts` and `operational-alerts-acknowledge` | VERIFIED | Both in `BankSyncHandlers` type and registered via `app.method()` |
| `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` | `useOperationalAlerts()` hook that polls and dispatches notifications | VERIFIED | Hook exported; polls via `send('operational-alerts')`; dispatches sticky notifications with `onClose` acknowledgment |
| `packages/desktop-client/src/components/FinancesApp.tsx` | `useOperationalAlerts()` call in FinancesApp | VERIFIED | Imported and called after `useBankSyncNotification()` on line 328 |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `audit.ts` | `account-db.ts` | `getAccountDb()` for INSERT | WIRED | `getAccountDb()` called inside `writeAuditLog()` before `db.mutate(INSERT ...)` |
| `logger.ts` | `winston-daily-rotate-file` | side-effect import | WIRED | `import 'winston-daily-rotate-file'` at top of file; `DailyRotateFile` transport registered |
| `scheduler.ts` | `alerter.ts` | `triggerAlert()` on sync failure and consent expiry | WIRED | `triggerAlert({ event_type: 'sync_failure', ... })` and `triggerAlert({ event_type: 'consent_expiry', ... })` both present with `.catch(() => {})` |
| `app-account.ts` | `alerter.ts` | `triggerAlert()` on repeated auth failures | WIRED | `triggerAlert({ event_type: 'auth_failure_burst', ... })` inside `trackAuthFailure()` when `entry.count >= AUTH_FAILURE_THRESHOLD` |
| `scheduler.ts` | `metrics.ts` | `recordSyncRun()` at end of `runScheduledSync()` | WIRED | `recordSyncRun(totalSynced, totalErrors)` on line 255, after final `logger.info('Sync run complete', ...)` |
| `app.ts` | `metrics.ts` | `getLatencyPercentiles()` and `getSyncStats()` in `/metrics` handler | WIRED | Both called in `/metrics` handler; results in response JSON as `latency` and `sync` keys |
| `app-account.ts` | `audit.ts` | `writeAuditLog()` after login/bootstrap/password-change | WIRED | 7+ callsites confirmed |
| `openid.js` | `audit.ts` | `writeAuditLog()` after OpenID authorization code grant | WIRED | 2 callsites confirmed (success path line ~409, failure catch block line ~420) |
| `middlewares.ts` | `metrics.ts` | `recordLatency()` in `res.on('finish')` callback | WIRED | `latencyMiddleware`: `res.on('finish', () => recordLatency(Date.now() - start))` |
| `useEnableBankingStatus.ts` | `provider-status.ts` | `send('operational-alerts')` IPC call | WIRED | `await send('operational-alerts')` inside `poll()` function |
| `provider-status.ts` | `app.ts` | GET to `BASE_SERVER + '/alerts'` | WIRED | `get(serverConfig.BASE_SERVER + '/alerts', { headers: { 'X-ACTUAL-TOKEN': userToken } })` |
| `app.ts` | `alerter.ts` | `getRecentAlerts()` and `acknowledgeAlert()` calls | WIRED | Both imported and used in `/alerts` GET and `/alerts/acknowledge` POST handlers |

---

### Requirements Coverage

The phase requirement IDs obs-1 through obs-4 are audit finding identifiers defined in `.planning/phases/07-observability-and-monitoring/07-CONTEXT.md`, not entries in `REQUIREMENTS.md`. `REQUIREMENTS.md` does not track these IDs — this is expected. The ROADMAP.md notes "Requirements: Audit findings obs-1, obs-2, obs-3, obs-4" which correctly scopes them as phase-internal findings rather than product requirements.

| Requirement | Description | Plans | Status | Evidence |
|-------------|-------------|-------|--------|----------|
| obs-1 | Structured Winston file logging with enriched error context | 07-01, 07-02 | SATISFIED | DailyRotateFile JSON transport; errorMiddleware with url/hasSession/errorClass/stack |
| obs-2 | Webhook alerting + in-app notification of operational alerts | 07-01, 07-02, 07-03 | SATISFIED | `triggerAlert()` with webhook + in-memory store; `useOperationalAlerts()` polling hook; FinancesApp wired |
| obs-3 | Audit logging for auth and EB operations | 07-01, 07-02 | SATISFIED | `audit_log` table; `writeAuditLog()` at 11+ callsites covering all specified event types |
| obs-4 | Request latency and sync duration metrics | 07-01, 07-02 | SATISFIED | `latencyMiddleware` on all routes; `recordSyncRun()` at end of each sync run; `/metrics` returns p50/p95/p99 + sync stats |

No orphaned requirements: REQUIREMENTS.md traceability table does not map any IDs to Phase 7 (obs-1 through obs-4 are not product requirements — they are internal audit findings).

---

### Anti-Patterns Found

No blockers or stubs detected in the new/modified files.

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `metrics.ts` line 14 | `return null` | Info | Intentional: documented correct behavior when no latency samples recorded yet |
| `app.ts` line 163 | Empty catch block `catch { }` | Info | Intentional: DB not bootstrapped yet on first startup; comment explains rationale |

No TODO/FIXME/PLACEHOLDER comments found in any of the new utility files or callsite modifications.

---

### Human Verification Required

#### 1. Webhook Alert Delivery

**Test:** Set `ALERT_WEBHOOK_URL` to a local HTTP endpoint (e.g. `httpbin.org/post` or a local listener), trigger a sync failure, and confirm the webhook receives a POST with `{ event_type, message, timestamp, severity }`.
**Expected:** Within 5 seconds of the failure, the webhook endpoint receives a JSON POST body with the correct shape.
**Why human:** Cannot verify live HTTP delivery programmatically without running the server.

#### 2. In-App Alert Notification Display

**Test:** With the app running, trigger a sync failure (e.g. revoke API credentials), wait up to 60 seconds for the poll interval, and confirm a sticky red notification appears in the UI with title "Sync failed".
**Expected:** Notification appears, is sticky (does not auto-dismiss), shows the failure message, and disappears after clicking the close button.
**Why human:** Cannot verify React rendering, Redux dispatch result, or notification display without a browser.

#### 3. Log File Creation

**Test:** Start the sync-server with `NODE_ENV` not set to `test`, and confirm a log file appears at `/data/logs/actual-YYYY-MM-DD.log` (or `LOG_DIR` if overridden) with JSON-formatted entries.
**Expected:** File created with JSON objects containing `timestamp`, `level`, `message` fields.
**Why human:** Cannot verify filesystem side effects of the DailyRotateFile transport without running the server.

---

### Gaps Summary

No gaps. All 14 observable truths are verified against the actual codebase. All 16 required artifacts exist, are substantive (not stubs), and are correctly wired. All 12 key links are confirmed present in the source files.

Notable deviation from plan that was correctly handled: The plan specified modifying `app-account.ts` to pass `req.ip` to `loginWithOpenIdFinalize`, but the actual callsite is in `app-openid.ts`. The executor correctly identified and fixed this during Plan 02 execution — `app-openid.ts` now passes `{ ...req.query, ip_address: req.ip }` to `loginWithOpenIdFinalize`.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
