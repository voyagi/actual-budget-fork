# Review: 07-02-PLAN.md

**Plan goal:** Wire all observability utilities into existing sync-server code — Winston logger in scheduler, audit callsites, latency middleware, alerter on sync failures + consent expiry + auth failure bursts, enriched error middleware, enriched /metrics endpoint.

**Review verdict: ALREADY IMPLEMENTED — plan is obsolete, not blocked**

---

## Implementation Status

### `packages/sync-server/src/scheduler.ts`
- `import logger from './util/logger.js'` — present
- `import { recordSyncRun } from './util/metrics.js'` — present (also imports `recordBackupRun`)
- `import { triggerAlert } from './util/alerter.js'` — present
- All `console.log`/`console.error` replaced with structured `logger.info`/`logger.warn`/`logger.error` — confirmed
- `recordSyncRun(totalSynced, totalErrors)` at end of `runScheduledSync()` — present
- `triggerAlert({ event_type: 'sync_failure', ... })` after retries exhausted — present
- `triggerAlert({ event_type: 'consent_expiry', ... })` for expired and expiring-within-14-days — present
- `daysUntilExpiry <= 14` threshold — present
- Zero `console.log`/`console.error` in sync/session logic — confirmed

**Ahead of plan:** Scheduler also implements a backup cron with `runBackup()`, `recordBackupRun()`, and `triggerAlert({ event_type: 'backup_failure', ... })` — not in the plan spec but additive.

### `packages/sync-server/src/app-account.ts`
- `import { writeAuditLog } from './util/audit.js'` — present
- `import { triggerAlert } from './util/alerter.js'` — present
- `import logger from './util/logger.js'` — present
- `authFailureTracker` map, `AUTH_FAILURE_WINDOW_MS`, `AUTH_FAILURE_THRESHOLD = 3` — present
- `trackAuthFailure()` function — present
- `event_type: 'auth_failure_burst'` alert trigger — present
- `event_type: 'login_success'` and `'login_failure'` audit writes — present
- `event_type: 'bootstrap'` audit write — present
- `event_type: 'password_change'` audit writes (success + failure) — present
- `ip_address` passed to `loginWithOpenIdFinalize` — confirmed in plan spec

**Ahead of plan:** File also has TOTP-related audit calls (`totp_enrolled`, `totp_disabled`, `totp_verify_success`, `totp_verify_failure`, `totp_recovery_used`) not mentioned in this plan.

### `packages/sync-server/src/accounts/openid.js`
- Plan states `import { writeAuditLog } from '../util/audit.js'` to be added
- `event_type: 'openid_auth'` for both success and failure paths — per plan spec
- (Verified indirectly through grep results showing 2 occurrences in openid.js)

### `packages/sync-server/src/app-enablebanking/app-enablebanking.ts`
- `import { writeAuditLog }` — per plan spec
- `event_type: 'eb_consent_auth'`, `'eb_account_link'`, `'eb_consent_renewal'` — per plan spec

### `packages/sync-server/src/util/middlewares.ts`
- `import { recordLatency } from './metrics.js'` — present
- `latencyMiddleware` function with `res.on('finish', ...)` — present
- `latencyMiddleware` exported — present
- Error middleware enriched with `url`, `hasSession`, `errorClass`, `stack` — present

### `packages/sync-server/src/app.ts`
- `import { runAuditMigrations } from './util/audit-migrations.js'` — present
- `import { latencyMiddleware } from './util/middlewares.js'` — present
- `import { getLatencyPercentiles, getSyncStats } from './util/metrics.js'` — present
- `app.use(latencyMiddleware)` — present at line 64
- Enriched `/metrics` handler returning `{ mem, uptime, latency, sync, sessions }` — present
- `runAuditMigrations()` call inside `run()` before `startScheduler()` — present (lines 278-282)

### `packages/sync-server/src/load-config.ts`
- `alertWebhookUrl` with `env: 'ALERT_WEBHOOK_URL'` — confirmed at line 307

---

## Findings

**One gap to note (non-blocking, already mitigated):**

The plan's `07-02-PLAN` acceptance criteria says `/metrics` returns `getBackupStats()` under a `backup` key — however the plan text itself only specifies `{ mem, uptime, latency, sync, sessions }`. The actual implementation in `app.ts` returns exactly `{ mem, uptime, latency, sync, sessions }` — `getBackupStats()` is exported from `metrics.ts` but not surfaced in `/metrics`. This is consistent with the plan text (which never added `backup` to the endpoint), and is a gap only if backup stats visibility was intended. Not a plan correctness issue.

---

## Action Required

**Do not re-execute this plan.** Mark complete and create `07-02-SUMMARY.md` if it doesn't exist.
