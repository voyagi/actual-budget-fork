# Phase 7: Observability and Monitoring - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Integrate structured error tracking, add an alerting mechanism for operational events, implement audit logging for authentication and security operations, and add request latency and sync duration metrics. Addresses audit findings obs-1, obs-2, obs-3, obs-4.

</domain>

<decisions>
## Implementation Decisions

### Error Tracking (obs-1)
- Use structured Winston file logging instead of a cloud service (Sentry). Single-user self-hosted app does not justify external service dependency or SaaS cost.
- Add a file transport to the existing Winston logger with JSON format for machine parseability
- Daily log rotation via `winston-daily-rotate-file` with 30-day retention to prevent disk fill
- Enrich error context with: request URL, user session presence (boolean, not user ID), error class name, stack trace. No PII in logs.
- Keep existing console transport for development; file transport for production (both active, controlled by env)
- Replace scattered `console.log`/`console.error` calls in fork code (scheduler.ts, app-enablebanking/) with the Winston logger instance

### Alerting Mechanism (obs-2)
- Extend the existing in-app Notifications system (from Phase 6 migration) for user-visible alerts
- Add optional webhook alerting via configurable `ALERT_WEBHOOK_URL` env var for external integrations (Discord, Slack, ntfy, generic HTTP endpoint)
- Webhook payload: simple JSON POST with `{ event_type, message, timestamp, severity }` - compatible with common webhook receivers
- Alert-triggering events: sync failures after all retries exhausted, consent expiry warnings (within 14 days), repeated authentication failures (3+ in 5 minutes)
- Cooldown period of 1 hour per event type to prevent alert fatigue (in-memory tracking, resets on restart)
- Webhook failures are logged but never block the triggering operation (fire-and-forget with timeout)

### Audit Logging (obs-3)
- Create a dedicated `audit_log` table in the account database (consistent with existing `eb_sync_log` pattern)
- Audit these operations: login (success and failure with reason), password change, bootstrap, OpenID authorization flow, Enable Banking consent authorization, consent expiry/renewal, account linking
- Table schema: `id` (autoincrement), `timestamp` (epoch), `event_type` (string enum), `actor` (session token hash or 'system'), `ip_address` (request IP), `outcome` ('success' or 'fail'), `details` (JSON string for event-specific data)
- No automatic purge - keep indefinitely (personal use, small data volume, GDPR: user owns their own audit trail)
- Audit log writes are best-effort: failures logged via Winston but never block the audited operation

### Metrics (obs-4)
- Enhance the existing `/metrics` endpoint (currently returns only `mem` and `uptime`) with operational metrics
- Add request latency tracking: p50, p95, p99 percentiles via Express middleware with in-memory histogram (no Prometheus dependency)
- Add sync metrics: duration per sync run, success/failure counts, last sync timestamp, accounts synced per run
- Add session metrics: active Enable Banking sessions count, sessions expiring within 14 days
- Metrics accumulate during server uptime and reset on restart (no persistence needed for personal use)
- Use a lightweight in-memory metrics collector (simple array-based with fixed-size window, e.g., last 1000 requests)

### Claude's Discretion
- Exact histogram bucket boundaries for latency percentiles
- Whether to use a rolling window or fixed-size array for metrics collection
- Log file naming convention and directory path within the Docker data volume
- Exact audit log event_type string enum values
- Whether webhook timeout should be 5s or 10s
- Migration script placement (alongside existing EB migrations or separate)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Logging infrastructure
- `packages/sync-server/src/util/logger.ts` -- Existing Winston logger (console-only transport, JSON metadata support)
- `packages/sync-server/src/util/middlewares.ts` -- express-winston request logger, error middleware with Winston integration
- `packages/sync-server/src/scheduler.ts` -- Fork sync code using console.log/error (to be migrated to Winston)

### Health and metrics endpoints
- `packages/sync-server/src/app.ts` lines 139-148 -- Existing /health and /metrics endpoints
- `packages/sync-server/src/scripts/health-check.js` -- Docker health check script using /health

### Auth operations (audit targets)
- `packages/sync-server/src/app-account.ts` -- Login, bootstrap, password change, session validation endpoints
- `packages/sync-server/src/accounts/openid.js` -- OpenID authorization flow, redirect validation
- `packages/sync-server/src/accounts/password.ts` -- Password validation and change logic

### Enable Banking operations (audit + metrics targets)
- `packages/sync-server/src/app-enablebanking/app-enablebanking.ts` -- EB routes: /authorize, /callback, /sync-status, /link, /sync
- `packages/sync-server/src/app-enablebanking/errors.js` -- RateLimitError, SessionExpiredError classes
- `packages/sync-server/src/app-enablebanking/migrations.js` -- EB database migrations (pattern to follow for audit_log table)

### Prior phase context
- `.planning/phases/06-design-refinement/06-CONTEXT.md` -- Alert surfaces consolidated into Notifications system (Phase 6)
- `.planning/phases/05.2-security-hardening/05.2-CONTEXT.md` -- Password strength, OpenID redirect restriction already hardened

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `logger` (util/logger.ts): Winston logger instance with timestamp + colorize + printf format. Adding file transport extends this directly.
- `requestLoggerMiddleware` (util/middlewares.ts): express-winston middleware already logs HTTP method, status, URL. Can be extended for latency.
- `errorMiddleware` (util/middlewares.ts): Catches unhandled errors, logs via Winston. Integration point for error alerting.
- `eb_sync_log` table: Existing append-only log pattern in account DB. Audit log follows same convention.
- `notificationsSlice` (desktop-client): Redux slice for in-app notifications with addNotification/removeNotification. Phase 6 already routes EB alerts through this.
- `getAccountDb()`: Account database accessor used throughout sync-server. Audit log table lives here.

### Established Patterns
- Winston structured logging with metadata objects (`logger.error('msg', { key: value })`)
- SQLite tables created via migration scripts in `app-enablebanking/migrations.js`
- Environment variable configuration via convict-based `load-config.ts`
- Express middleware chain in `app.ts` (request logger -> session validation -> route handlers -> error middleware)
- console.log prefixed with `[scheduler]` tag in fork code (to be replaced with logger.info)

### Integration Points
- `app.ts`: Mount latency middleware before route handlers, after request logger
- `app.ts /metrics`: Extend response object with latency histogram and sync metrics
- `app-account.ts`: Add audit log writes after login/bootstrap/password-change operations
- `app-enablebanking.ts`: Add audit log writes after /authorize, /callback, /link operations
- `scheduler.ts`: Replace console.log/error with logger, add sync duration timing, trigger alerts on failure
- `migrations.js`: Add audit_log table creation migration

</code_context>

<specifics>
## Specific Ideas

- The audit explicitly noted: "Production errors are only visible in container logs. A single-user fork needs proactive error visibility."
- Webhook alerting should work with ntfy.sh (simple POST) since it's self-hostable and free - matches the project's self-hosted philosophy
- Sync duration metrics should be visible alongside existing sync status in the UI (via enhanced /sync-status response or /metrics)
- Log files should be written to the Docker data volume (/data/logs/) so they persist across container restarts

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 07-observability-and-monitoring*
*Context gathered: 2026-03-18*
