# Phase 7: Observability and Monitoring - Research

**Researched:** 2026-03-18
**Domain:** Node.js structured logging, audit logging (SQLite), in-memory metrics, webhook alerting
**Confidence:** HIGH

## Summary

Phase 7 adds four observability layers to the sync-server: structured file logging (obs-1), a webhook-based alerting mechanism (obs-2), an audit log table for auth operations (obs-3), and in-memory request/sync metrics enriching the existing `/metrics` endpoint (obs-4).

The project already has Winston configured with a console-only transport (`util/logger.ts`), express-winston request middleware (`util/middlewares.ts`), and an established SQLite migration pattern (`app-enablebanking/migrations.js`). All four requirements extend existing infrastructure rather than introducing new architectural layers. The only new package is `winston-daily-rotate-file` for log rotation.

Everything lives in `packages/sync-server/`. No frontend changes are required. The audit log table follows the exact same `CREATE TABLE IF NOT EXISTS` / `getAccountDb()` pattern as `eb_sync_log`. Webhook calls are fire-and-forget with a 5s timeout. In-memory metrics use a fixed-size circular array (last 1000 requests) to bound memory usage, resetting on process restart.

**Primary recommendation:** Implement in four focused tasks: (1) file log transport + console.log migration, (2) audit log migration + write helpers, (3) webhook alerter module, (4) metrics middleware + `/metrics` enrichment. Tasks are independent after task 1 (logger) and can be planned as two waves.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Error Tracking (obs-1)**
- Use structured Winston file logging instead of a cloud service (Sentry). Single-user self-hosted app does not justify external service dependency or SaaS cost.
- Add a file transport to the existing Winston logger with JSON format for machine parseability
- Daily log rotation via `winston-daily-rotate-file` with 30-day retention to prevent disk fill
- Enrich error context with: request URL, user session presence (boolean, not user ID), error class name, stack trace. No PII in logs.
- Keep existing console transport for development; file transport for production (both active, controlled by env)
- Replace scattered `console.log`/`console.error` calls in fork code (scheduler.ts, app-enablebanking/) with the Winston logger instance

**Alerting Mechanism (obs-2)**
- Extend the existing in-app Notifications system (from Phase 6 migration) for user-visible alerts
- Add optional webhook alerting via configurable `ALERT_WEBHOOK_URL` env var for external integrations (Discord, Slack, ntfy, generic HTTP endpoint)
- Webhook payload: simple JSON POST with `{ event_type, message, timestamp, severity }` - compatible with common webhook receivers
- Alert-triggering events: sync failures after all retries exhausted, consent expiry warnings (within 14 days), repeated authentication failures (3+ in 5 minutes)
- Cooldown period of 1 hour per event type to prevent alert fatigue (in-memory tracking, resets on restart)
- Webhook failures are logged but never block the triggering operation (fire-and-forget with timeout)

**Audit Logging (obs-3)**
- Create a dedicated `audit_log` table in the account database (consistent with existing `eb_sync_log` pattern)
- Audit these operations: login (success and failure with reason), password change, bootstrap, OpenID authorization flow, Enable Banking consent authorization, consent expiry/renewal, account linking
- Table schema: `id` (autoincrement), `timestamp` (epoch), `event_type` (string enum), `actor` (session token hash or 'system'), `ip_address` (request IP), `outcome` ('success' or 'fail'), `details` (JSON string for event-specific data)
- No automatic purge - keep indefinitely (personal use, small data volume, GDPR: user owns their own audit trail)
- Audit log writes are best-effort: failures logged via Winston but never block the audited operation

**Metrics (obs-4)**
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| obs-1 | Structured file logging via Winston file transport with daily rotation, JSON format, no PII, 30-day retention; migrate console.log calls in fork code | Winston 3.x `add()` transport API + `winston-daily-rotate-file` 5.0.0; existing `logger.ts` is the extension point |
| obs-2 | Webhook alerting via `ALERT_WEBHOOK_URL` env var; in-memory cooldown per event type; fire-and-forget with timeout; events: sync failure, consent expiry, repeated auth failures | Node.js built-in `fetch()` (Node 22 - no extra dep); in-memory `Map<eventType, lastFiredAt>` for cooldown |
| obs-3 | `audit_log` SQLite table with `id/timestamp/event_type/actor/ip_address/outcome/details`; idempotent migration; best-effort writes at auth operation callsites | `getAccountDb()` + `CREATE TABLE IF NOT EXISTS` pattern from `migrations.js`; callsites in `app-account.ts` and `app-enablebanking.ts` |
| obs-4 | Enhance `/metrics` with p50/p95/p99 latency (in-memory fixed-size array), sync run stats, EB session counts; latency middleware mounted before route handlers | Express `res.on('finish')` timing pattern; no external deps; `/metrics` handler at `app.ts` lines 143-148 |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| winston | ^3.19.0 | Structured logging | Already installed; multi-transport, metadata-aware |
| winston-daily-rotate-file | 5.0.0 | Log file rotation | Official Winston transport; 30-day retention, gzip compression |
| better-sqlite3 | ^12.6.2 | Audit log persistence | Already installed; used for all DB ops in sync-server |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Node.js fetch (built-in) | Node 22 | Webhook HTTP POST | No extra dep; available since Node 18; sync-server runs Node 22 |
| convict | ^6.2.4 | Config schema for new env vars | Already installed; `ALERT_WEBHOOK_URL` added to schema |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| winston-daily-rotate-file | node-winston-loki, custom fs.createWriteStream | Rotate-file is the canonical Winston solution, zero custom code |
| Node fetch | axios | axios already in deps, but built-in fetch is simpler for fire-and-forget with AbortController timeout |
| Fixed-size array for latency | prom-client histogram | prom-client adds 200KB+ and Prometheus scraping infrastructure; array is sufficient for personal use |

**Installation:**
```bash
yarn workspace @actual-app/sync-server add winston-daily-rotate-file
```

**Version verification:** `winston-daily-rotate-file` is currently at 5.0.0 (verified 2026-03-18 via `npm view winston-daily-rotate-file version`). This is a major version bump from the commonly-cited 4.x. The API is backward-compatible for basic usage.

---

## Architecture Patterns

### Recommended Project Structure

New files this phase adds to `packages/sync-server/src/`:

```
src/
├── util/
│   ├── logger.ts              # MODIFY: add file transport
│   ├── middlewares.ts         # MODIFY: add latency middleware export
│   └── audit.ts              # NEW: writeAuditLog() helper
├── util/metrics.ts            # NEW: MetricsCollector singleton
├── util/alerter.ts            # NEW: triggerAlert() + cooldown logic
├── app-enablebanking/
│   └── migrations.js          # MODIFY: add audit_log table migration
├── app-account.ts             # MODIFY: add audit log calls
├── app-enablebanking/
│   └── app-enablebanking.ts   # MODIFY: add audit log calls
├── app.ts                     # MODIFY: mount latency middleware, enrich /metrics
└── scheduler.ts               # MODIFY: replace console.log, add sync metrics
```

### Pattern 1: Adding Winston File Transport

**What:** `logger.add()` at startup to attach a `DailyRotateFile` transport alongside the existing console transport.

**When to use:** Called once in `logger.ts` when `NODE_ENV !== 'test'` and optionally gated by `LOG_FILE_PATH` env presence.

**Example:**
```typescript
// Source: winston-daily-rotate-file README + Winston 3.x docs
import 'winston-daily-rotate-file';

const fileTransport = new winston.transports.DailyRotateFile({
  dirname: process.env.LOG_DIR ?? '/data/logs',
  filename: 'actual-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxFiles: '30d',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json(),   // machine-parseable, no colorize
  ),
});

if (process.env.NODE_ENV !== 'test') {
  logger.add(fileTransport);
}
```

**Key detail:** `winston-daily-rotate-file` registers itself as `winston.transports.DailyRotateFile` via a side-effect import. The import must occur before `new winston.transports.DailyRotateFile(...)` is called. Place the import in `logger.ts`.

### Pattern 2: Audit Log Table (Migration)

**What:** Idempotent `CREATE TABLE IF NOT EXISTS` in the existing `migrations.js` alongside `eb_sync_log`.

**When to use:** The table is created at server startup (same `runMigrations()` call pattern).

**Example:**
```javascript
// Source: existing migrations.js pattern (eb_sync_log)
db.mutate(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    event_type TEXT    NOT NULL,
    actor      TEXT    NOT NULL,
    ip_address TEXT,
    outcome    TEXT    NOT NULL CHECK(outcome IN ('success', 'fail')),
    details    TEXT
  )
`);
db.mutate(
  'CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log (event_type, timestamp)'
);
```

**Placement decision (Claude's discretion):** Add to the existing `app-enablebanking/migrations.js` since it already runs at startup via `runMigrations()` at `app-enablebanking.ts` line 27. This avoids a second migration bootstrap call. However, since `audit_log` is general (not EB-specific), an alternative is a new `src/util/audit-migrations.js` called from `app.ts` startup. Recommendation: create `src/util/audit-migrations.ts` and call it from `app.ts` alongside other startup logic to avoid coupling a general table to the EB module.

### Pattern 3: Best-Effort Audit Write Helper

**What:** A `writeAuditLog()` function that wraps the DB insert in try/catch and logs failures via Winston but never throws.

**Example:**
```typescript
// src/util/audit.ts
import logger from './logger.js';
import { getAccountDb } from '../account-db.js';

export type AuditEventType =
  | 'login_success' | 'login_failure'
  | 'bootstrap' | 'password_change'
  | 'openid_auth' | 'eb_consent_auth'
  | 'eb_consent_expiry' | 'eb_consent_renewal'
  | 'eb_account_link';

export function writeAuditLog(opts: {
  event_type: AuditEventType;
  actor: string;        // session token hash (sha256 prefix) or 'system'
  ip_address?: string;
  outcome: 'success' | 'fail';
  details?: Record<string, unknown>;
}): void {
  try {
    const db = getAccountDb();
    db.mutate(
      `INSERT INTO audit_log (event_type, actor, ip_address, outcome, details)
       VALUES (?, ?, ?, ?, ?)`,
      [
        opts.event_type,
        opts.actor,
        opts.ip_address ?? null,
        opts.outcome,
        opts.details ? JSON.stringify(opts.details) : null,
      ],
    );
  } catch (err) {
    logger.error('audit log write failed', { error: String(err), event_type: opts.event_type });
  }
}
```

### Pattern 4: In-Memory Metrics Collector (Singleton)

**What:** Module-level singleton with a fixed-size circular array for latency samples. Exported functions update state; `/metrics` handler reads state.

**Example:**
```typescript
// src/util/metrics.ts
const MAX_SAMPLES = 1000;
const latencySamples: number[] = [];

export function recordLatency(ms: number): void {
  if (latencySamples.length >= MAX_SAMPLES) latencySamples.shift();
  latencySamples.push(ms);
}

export function getLatencyPercentiles(): { p50: number; p95: number; p99: number } | null {
  if (latencySamples.length === 0) return null;
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.floor(sorted.length * pct / 100)];
  return { p50: p(50), p95: p(95), p99: p(99) };
}

// Sync run metrics
let syncStats = { totalRuns: 0, successRuns: 0, lastRunAt: null as number | null, lastRunAccounts: 0, lastRunErrors: 0 };
export function recordSyncRun(accounts: number, errors: number): void {
  syncStats = { totalRuns: syncStats.totalRuns + 1, successRuns: syncStats.successRuns + (errors === 0 ? 1 : 0), lastRunAt: Date.now(), lastRunAccounts: accounts, lastRunErrors: errors };
}
export function getSyncStats() { return { ...syncStats }; }
```

**Latency middleware:**
```typescript
// In middlewares.ts
import { recordLatency } from './metrics.js';

export function latencyMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => recordLatency(Date.now() - start));
  next();
}
```

**Mount in app.ts** after `app.use(express.json(...))` and before route handlers.

### Pattern 5: Fire-and-Forget Webhook

**What:** `triggerAlert()` uses `AbortController` + `fetch()` with a 5s timeout. Failures are logged, never thrown.

**Example:**
```typescript
// src/util/alerter.ts
import logger from './logger.js';

type Severity = 'info' | 'warning' | 'error';
const cooldowns = new Map<string, number>(); // eventType -> lastFiredAt ms
const COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export async function triggerAlert(opts: {
  event_type: string;
  message: string;
  severity: Severity;
}): Promise<void> {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  const lastFired = cooldowns.get(opts.event_type) ?? 0;
  if (Date.now() - lastFired < COOLDOWN_MS) return; // still in cooldown
  cooldowns.set(opts.event_type, Date.now());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: opts.event_type,
        message: opts.message,
        timestamp: new Date().toISOString(),
        severity: opts.severity,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    logger.warn('webhook alert failed', { event_type: opts.event_type, error: String(err) });
  } finally {
    clearTimeout(timeout);
  }
}
```

### Anti-Patterns to Avoid

- **Throwing from `writeAuditLog()`:** Audit writes must never block the audited operation. Always catch and log.
- **Storing PII in logs:** Request IP in audit_log is acceptable (user owns their own data, GDPR applies). Session token must be hashed before logging, not stored raw.
- **Storing colorize format in file transport:** The console transport uses colorize; the file transport must use `json()` format only. Colorize ANSI codes make JSON files unreadable.
- **Calling `triggerAlert()` with `await` in a request handler without catch:** Always fire-and-forget from non-async context or let failures log silently.
- **Module-level `logger.add(fileTransport)` in test env:** The `NODE_ENV=test` guard prevents log files being created during `vitest --run`.
- **Registering latency middleware after route handlers:** `app.use(latencyMiddleware)` must come before `app.use('/sync', ...)` etc., or it won't wrap route handler latency correctly. `res.on('finish')` fires when headers flush - correct for capturing total request time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Log file rotation with size/age limits | Custom `fs.createWriteStream` + `setInterval` | `winston-daily-rotate-file` | Handles atomic rotation, gzip, maxFiles, maxSize, concurrent writes |
| Percentile calculation | Manual bucket counting | Sorted-array slice (O(n log n) acceptable at 1000 samples) | Sufficient for < 1000 samples; no Prometheus complexity needed |
| HTTP webhook with timeout | `setTimeout` + `clearTimeout` + manual abort | `AbortController` + `fetch` | Built into Node 22; cleaner than axios for fire-and-forget |

**Key insight:** All four requirements are extensions of existing infrastructure. The heaviest new dependency is `winston-daily-rotate-file` at ~15KB. The metrics and alerter are pure logic modules with no runtime dependencies beyond Node built-ins.

---

## Common Pitfalls

### Pitfall 1: winston-daily-rotate-file Side-Effect Import
**What goes wrong:** `new winston.transports.DailyRotateFile(...)` throws `TypeError: winston.transports.DailyRotateFile is not a constructor`.
**Why it happens:** The package registers `DailyRotateFile` on the `winston.transports` namespace via a side-effect. If the import is omitted, the namespace entry doesn't exist.
**How to avoid:** Always `import 'winston-daily-rotate-file'` (side-effect import) before constructing `DailyRotateFile`. Place it at the top of `logger.ts`.
**Warning signs:** Runtime crash at server startup when `LOG_DIR` is configured.

### Pitfall 2: `getAccountDb()` Called Before Bootstrap
**What goes wrong:** `writeAuditLog()` is called in the bootstrap endpoint handler itself. `getAccountDb()` may throw if the DB hasn't been initialized yet.
**Why it happens:** `bootstrap` is the first operation that creates the account DB. The audit write for the bootstrap event happens after `bootstrap()` returns successfully - DB is available by then. But if `writeAuditLog()` is called before `await bootstrap(req.body)` returns, it will fail.
**How to avoid:** Always call `writeAuditLog()` after the primary operation completes, not before. For `bootstrap`, write after the success path only.
**Warning signs:** `SQLITE_ERROR: no such table: audit_log` on first bootstrap call.

### Pitfall 3: Cooldown Map Not Reset After Alerter Module Reload
**What goes wrong:** In development (`nodemon` restarts), the cooldown map resets on each restart, causing alert storm if errors persist across restarts.
**Why it happens:** The cooldown is in-memory (intentional per CONTEXT.md decision). This is acceptable - cooldowns reset on restart by design.
**How to avoid:** Document this behavior in comments. Don't attempt to persist cooldowns to SQLite (scope creep).
**Warning signs:** N/A - acceptable behavior, document it.

### Pitfall 4: `res.on('finish')` vs `res.on('close')` for Latency
**What goes wrong:** Using `res.on('close')` captures time until client disconnects, not server processing time. Aborted requests skew the histogram.
**Why it happens:** `close` fires on connection drop too. `finish` fires when the last byte of the response is flushed to the OS socket buffer.
**How to avoid:** Always use `res.on('finish', ...)` for request latency measurement in Express middleware.
**Warning signs:** Occasional very high latency samples not correlated with actual slow requests.

### Pitfall 5: TypeScript Import of `winston-daily-rotate-file`
**What goes wrong:** TypeScript compile error: `Could not find a declaration file for module 'winston-daily-rotate-file'`.
**Why it happens:** The package ships its own types in `winston-daily-rotate-file/index.d.ts`. With `"moduleResolution": "bundler"` or ESM settings, the type might not auto-resolve.
**How to avoid:** After installing, verify `tsc --noEmit` passes. If types fail, add `"types": ["winston-daily-rotate-file"]` to `tsconfig.json` or use `/// <reference types="winston-daily-rotate-file" />`.
**Warning signs:** TypeScript compile errors mentioning `DailyRotateFile` constructor.

### Pitfall 6: IP Address from `req.ip` Behind Proxy
**What goes wrong:** `req.ip` returns `127.0.0.1` (the proxy IP) instead of the real client IP.
**Why it happens:** The server is behind Caddy (`app.set('trust proxy', ...)` is already configured with trusted proxy ranges). The real IP is in `X-Forwarded-For`.
**How to avoid:** Express resolves `req.ip` correctly when `trust proxy` is set. The existing `trustedProxies` convict config and `app.set('trust proxy', config.get('trustedProxies'))` at `app.ts` line 31 already handle this. Use `req.ip` directly - it's correct.
**Warning signs:** All audit log `ip_address` entries showing `::1` or `127.0.0.1`.

---

## Code Examples

### Enrich `/metrics` endpoint

```typescript
// app.ts - replace the existing /metrics handler (lines 143-148)
// Source: pattern derived from existing code + metrics.ts module
import { getLatencyPercentiles, getSyncStats } from './util/metrics.js';
import { getAccountDb } from './account-db.js';

app.get('/metrics', (_req, res) => {
  const db = getAccountDb();
  const sessionCount = (db.first(
    'SELECT COUNT(*) as cnt FROM eb_sessions WHERE valid_until > ?',
    [new Date().toISOString()]
  ) as { cnt: number })?.cnt ?? 0;
  const expiringCount = (db.first(
    `SELECT COUNT(*) as cnt FROM eb_sessions
     WHERE valid_until > ? AND valid_until < ?`,
    [new Date().toISOString(), new Date(Date.now() + 14 * 86400000).toISOString()]
  ) as { cnt: number })?.cnt ?? 0;

  res.status(200).json({
    mem: process.memoryUsage(),
    uptime: process.uptime(),
    latency: getLatencyPercentiles(),
    sync: getSyncStats(),
    sessions: { active: sessionCount, expiringWithin14Days: expiringCount },
  });
});
```

### Actor Hashing (no PII in audit log)

```typescript
// src/util/audit.ts
import { createHash } from 'node:crypto';

function hashActor(token: string): string {
  // Store first 8 chars of sha256 hex - enough for correlation, not reversible
  return createHash('sha256').update(token).digest('hex').slice(0, 8);
}
```

### Audit callsite in app-account.ts (login)

```typescript
// After tokenRes is obtained in the /login handler
writeAuditLog({
  event_type: error ? 'login_failure' : 'login_success',
  actor: 'unauthenticated',
  ip_address: req.ip,
  outcome: error ? 'fail' : 'success',
  details: error ? { reason: error } : undefined,
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `console.log` in fork code | Winston structured logger | This phase | Machine-parseable logs, consistent format |
| `/metrics` returns only mem+uptime | Latency percentiles + sync stats + session counts | This phase | Operational visibility without external tooling |
| No auth audit trail | `audit_log` table in account DB | This phase | Tamper-evident record of security operations |

**Deprecated/outdated:**
- `console.log('[scheduler] ...')` calls in `scheduler.ts`: Replace with `logger.info(...)` / `logger.error(...)` with structured metadata objects.
- `console.error('Error while searching for package.json:', error)` in `app.ts`: This is upstream code - do not modify; leave in place to minimize fork diff.

---

## Open Questions

1. **Migration placement for `audit_log` table**
   - What we know: EB migrations run at module load via `runMigrations()` in `app-enablebanking.ts`. The account-level migration infra (`src/scripts/run-migrations.js`) uses `migrate` package for SQL file-based migrations.
   - What's unclear: Whether to add `audit_log` to EB migrations (simpler, one place) or create `src/util/audit-migrations.ts` called from `app.ts` (cleaner separation).
   - Recommendation: Create `src/util/audit-migrations.ts` called once in `app.ts` run() before `startScheduler()`. Keeps audit infra decoupled from EB module.

2. **Authentication failure rate detection for alerting (obs-2)**
   - What we know: The `authRateLimit` middleware in `app.ts` already limits `/account/login` to 5 attempts per 15 minutes. Express-rate-limit fires the 429 response itself.
   - What's unclear: Whether to hook into rate-limit events or track failures in `writeAuditLog` reads.
   - Recommendation: In the `/login` handler, maintain a simple in-memory `Map<ip, { count, windowStart }>` for the 3-failures-in-5-minutes rule. Trigger `triggerAlert()` when threshold is crossed. This is simpler than reading from `audit_log` and doesn't require a DB query on each login.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | none - invoked via package.json test script |
| Quick run command | `yarn workspace @actual-app/sync-server test --run` |
| Full suite command | `yarn workspace @actual-app/sync-server test --run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| obs-1 | File transport added to logger; console.log calls replaced | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap |
| obs-2 | `triggerAlert()` sends webhook payload; respects 1h cooldown; no throw on failure | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap |
| obs-3 | `writeAuditLog()` inserts row; does not throw on DB error | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap |
| obs-4 | `recordLatency()` / `getLatencyPercentiles()` computes correct p50/p95/p99; `latencyMiddleware` calls recorder | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap |

### Sampling Rate
- **Per task commit:** `yarn workspace @actual-app/sync-server test --run`
- **Per wave merge:** `yarn workspace @actual-app/sync-server test --run`
- **Phase gate:** Full suite green + TypeScript compile (`yarn workspace @actual-app/sync-server build`) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/sync-server/src/util/audit.test.ts` -- covers obs-3 (writeAuditLog insert + error swallowing)
- [ ] `packages/sync-server/src/util/alerter.test.ts` -- covers obs-2 (triggerAlert payload, cooldown, no-throw on network error)
- [ ] `packages/sync-server/src/util/metrics.test.ts` -- covers obs-4 (recordLatency, percentile math, fixed-size eviction)
- [ ] `packages/sync-server/src/util/logger.test.ts` -- covers obs-1 (file transport present in non-test env; absent in test env)

All four test files are Wave 0 gaps to create before or alongside implementation. Tests can use `vi.mock` for `getAccountDb()` and `global.fetch` to avoid real DB/network dependencies.

---

## Sources

### Primary (HIGH confidence)
- Existing codebase files read directly: `util/logger.ts`, `util/middlewares.ts`, `app-enablebanking/migrations.js`, `scheduler.ts`, `app-account.ts`, `app.ts`, `load-config.ts`, `package.json`
- `npm view winston-daily-rotate-file version` - verified 5.0.0 on 2026-03-18

### Secondary (MEDIUM confidence)
- [winston-daily-rotate-file README](https://github.com/winstonjs/winston-daily-rotate-file) - transport constructor options, side-effect import pattern
- [Winston 3.x docs](https://github.com/winstonjs/winston) - `logger.add()` API, transport format composition

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all packages already in repo or version-verified from npm
- Architecture: HIGH - patterns derived directly from reading existing code
- Pitfalls: HIGH for TypeScript/import issues (confirmed from winston-daily-rotate-file known behavior), MEDIUM for proxy IP (inferred from existing trust proxy config)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (winston-daily-rotate-file is stable; Node.js fetch API stable in Node 22)
