---
phase: 07-observability-and-monitoring
plan: "01"
subsystem: sync-server
tags: [observability, logging, audit, metrics, alerting, tdd]
dependency_graph:
  requires: []
  provides:
    - packages/sync-server/src/util/logger.ts (DailyRotateFile transport)
    - packages/sync-server/src/util/audit-migrations.ts (audit_log schema)
    - packages/sync-server/src/util/audit.ts (writeAuditLog helper)
    - packages/sync-server/src/util/metrics.ts (in-memory metrics collector)
    - packages/sync-server/src/util/alerter.ts (webhook alerter + in-memory store)
  affects:
    - Plan 07-02 (instruments existing callsites using these modules)
    - Plan 07-03 (client-side notifications via getRecentAlerts)
tech_stack:
  added:
    - winston-daily-rotate-file (already in package.json, side-effect import wired)
  patterns:
    - TDD (RED/GREEN) for all three tasks
    - Module-level singleton state with _reset* test helpers
    - Best-effort error swallowing (audit writes, webhook delivery)
    - SHA-256 token hashing for audit actor anonymization
    - AbortController timeout for fetch (5s)
key_files:
  created:
    - packages/sync-server/src/util/audit-migrations.ts
    - packages/sync-server/src/util/audit.ts
    - packages/sync-server/src/util/audit.test.ts
    - packages/sync-server/src/util/metrics.ts
    - packages/sync-server/src/util/metrics.test.ts
    - packages/sync-server/src/util/alerter.ts
    - packages/sync-server/src/util/alerter.test.ts
  modified:
    - packages/sync-server/src/util/logger.ts
    - packages/sync-server/src/util/logger.test.ts (pre-existing, confirmed passing)
decisions:
  - "winston-daily-rotate-file was already in package.json: no install step needed, only the side-effect import and transport registration"
  - "logger.test.ts was pre-written from a prior session: skipped RED phase, went straight to GREEN"
  - "Actor hashing uses sha256.slice(0,8): 8 hex chars balances privacy with traceability; system actor stored verbatim"
  - "Best-effort audit writes: DB errors logged via logger.error but never propagate to caller - audit must never break auth flows"
  - "Metrics use module-level arrays/objects with _resetMetrics() test helper: simpler than class-based singleton, works cleanly with vitest isolation"
  - "Alerter stores alerts in-memory regardless of webhook config: client polling works even without external webhook configured"
  - "1-hour cooldown keyed by event_type: prevents webhook spam without requiring DB persistence"
metrics:
  duration: "~20 minutes"
  completed_date: "2026-03-18"
  tasks_completed: 3
  files_created: 7
  files_modified: 1
  tests_added: 23
  test_suite_total: 518
---

# Phase 07 Plan 01: Observability Foundation Summary

**One-liner:** Winston DailyRotateFile logger, SHA-256-hashed audit log, in-memory latency/sync metrics, and cooldown-gated webhook alerter with in-memory alert store.

## What Was Built

Four utility modules that Phase 07 Plans 02 and 03 depend on for instrumenting callsites and surfacing alerts to the client.

### Task 1 - Enhanced Winston Logger (commit 99b1ba3e6)

Modified `packages/sync-server/src/util/logger.ts`:
- Added `import 'winston-daily-rotate-file'` side-effect import
- Added `DailyRotateFile` transport guarded by `NODE_ENV !== 'test'`
- File transport uses JSON format, 30-day retention, `LOG_DIR` env var with `/data/logs` default
- Console transport (printf format) unchanged

### Task 2 - Audit Log Migration and Helper (commit 4183ee15f)

Created `packages/sync-server/src/util/audit-migrations.ts`:
- `runAuditMigrations()`: idempotent `CREATE TABLE IF NOT EXISTS audit_log` with 7 columns plus `CHECK(outcome IN ('success','fail'))` constraint and composite index on `(event_type, timestamp)`

Created `packages/sync-server/src/util/audit.ts`:
- `AuditEventType` union covering login, bootstrap, OpenID, and Enable Banking events
- `writeAuditLog()`: hashes actor tokens to 8-char hex (sha256), stores `system` verbatim, swallows DB errors via `logger.error`

### Task 3 - Metrics Collector and Webhook Alerter (commit f7d8ddef3)

Created `packages/sync-server/src/util/metrics.ts`:
- `recordLatency(ms)` / `getLatencyPercentiles()`: fixed 1000-sample window, returns `{p50, p95, p99}` or `null`
- `recordSyncRun(accounts, errors)` / `getSyncStats()`: tracks totals, success/failure counts, last run timestamp and account count

Created `packages/sync-server/src/util/alerter.ts`:
- `triggerAlert()`: 1-hour cooldown per `event_type`, always stores to in-memory array (max 50), sends optional webhook POST with 5s AbortController timeout, never throws
- `getRecentAlerts()` / `acknowledgeAlert(id)`: client polling and dismissal API
- `StoredAlert` type exported for Plan 03 client integration

## Test Results

| File | Tests | Result |
|------|-------|--------|
| src/util/logger.test.ts | 3 | PASS |
| src/util/audit.test.ts | 7 | PASS |
| src/util/metrics.test.ts | 5 | PASS |
| src/util/alerter.test.ts | 8 | PASS |
| Full suite (45 files) | 518 | PASS |

TypeScript: `tsc --noEmit` exit code 0.

## Deviations from Plan

### Pre-existing work (not a deviation - context only)

- `winston-daily-rotate-file` was already in `package.json` from a prior session
- `logger.test.ts` was pre-written; RED phase skipped, went directly to GREEN

No auto-fix deviations. Plan executed as written.

## Self-Check

Files created/modified:
- `packages/sync-server/src/util/logger.ts` - FOUND (modified)
- `packages/sync-server/src/util/audit-migrations.ts` - FOUND (created)
- `packages/sync-server/src/util/audit.ts` - FOUND (created)
- `packages/sync-server/src/util/metrics.ts` - FOUND (created)
- `packages/sync-server/src/util/alerter.ts` - FOUND (created)

Commits:
- 99b1ba3e6 - FOUND (feat(07-01): add DailyRotateFile transport)
- 4183ee15f - FOUND (feat(07-01): create audit log migration)
- f7d8ddef3 - FOUND (feat(07-01): create metrics collector and webhook alerter)

## Self-Check: PASSED
