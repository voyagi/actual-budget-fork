---
phase: 09-feature-expansion
plan: 02
subsystem: sync-server
tags: [backup, sqlite, tar, cron, metrics, api]
dependency_graph:
  requires: []
  provides: [backup-automation, backup-api]
  affects: [scheduler, metrics, app-account]
tech_stack:
  added: []
  patterns: [better-sqlite3-backup-api, node-streams-tar, cron-opt-out]
key_files:
  created:
    - packages/sync-server/src/util/backup.ts
    - packages/sync-server/src/util/backup.test.ts
  modified:
    - packages/sync-server/src/scheduler.ts
    - packages/sync-server/src/util/metrics.ts
    - packages/sync-server/src/app-account.ts
decisions:
  - "better-sqlite3 .backup() in readonly mode for atomic SQLite copies"
  - "Node.js built-in streams only for tar.gz (no node-tar dependency)"
  - "Backup cron independent of sync: restructured startScheduler() early-return to conditional block"
  - "Backup enabled by default (opt-out via ENABLE_AUTO_BACKUP=false)"
  - "cleanOldBackups uses mtime (not filename timestamp) to determine age"
metrics:
  duration: 5min
  completed_date: "2026-03-19"
  tasks_completed: 2
  files_changed: 5
---

# Phase 9 Plan 02: Backup Automation Summary

**One-liner:** Daily automated SQLite backup with atomic better-sqlite3 copy, Node.js tar.gz archiving, 7-day retention, cron scheduling, failure alerting, and admin-only manual trigger.

## What Was Built

### backup.ts (new)
- `backupSqliteFile(src, dest)` — opens DB readonly, calls `db.backup(dest)`, ensures parent dirs exist
- `discoverBudgetDirs(dataDir)` — scans for `*/db.sqlite` subdirs, excludes `backups/`
- `createTarGz(sourceDir, outputPath)` — walks dir tree, writes POSIX tar headers + gzip pipeline using only Node.js built-ins (`node:stream`, `node:zlib`)
- `runBackup(dataDir?)` — orchestrates: backup account.sqlite, all budget DBs, optional metadata.json, archive to tar.gz, remove uncompressed dir, clean old backups, update status
- `cleanOldBackups(dir, retentionDays=7)` — removes `.tar.gz` files and leftover `backup-*` dirs older than cutoff by mtime
- `getBackupStatus()` — returns snapshot of `{lastBackupAt, lastBackupSize, lastBackupStatus, backupCount}`

### scheduler.ts (modified)
- Restructured `startScheduler()`: replaced early-return ENABLE_AUTO_SYNC guard with conditional block so backup cron always registers
- Backup cron: `BACKUP_CRON_SCHEDULE ?? '0 2 * * *'`, guarded by `ENABLE_AUTO_BACKUP !== 'false'`
- On backup failure: calls `recordBackupRun(0, false)` and fires `backup_failure` webhook alert

### metrics.ts (modified)
- Added `backupStats` module-level object
- Added `recordBackupRun(sizeBytes, success)` and `getBackupStats()` exports
- `_resetMetrics()` now also resets `backupStats`

### app-account.ts (modified)
- `GET /backup/status` — session required, returns `getBackupStatus()`
- `POST /backup/trigger` — session + admin required, calls `runBackup()`, returns archive info or 500 on failure

## Deviations from Plan

None — plan executed exactly as written. The linter auto-added a `uuidv4` import and TOTP imports to `app-account.ts` on commit (already present from Plan 09-01, linter reorganized the import block).

## Test Results

- Task 1 (TDD): 13 tests written and passing (`backup.test.ts`)
- Task 2: Full suite 551 tests passing (47 test files)

## Commits

| Task | Hash | Description |
|------|------|-------------|
| 1 | 1303073fa | feat(09-02): implement backup module with atomic SQLite copy, tar.gz archiving, retention |
| 2 | 6e9cfda3e | feat(09-02): add backup cron, metrics, and manual trigger endpoint |

## Self-Check: PASSED

- backup.ts: FOUND
- backup.test.ts: FOUND
- Commit 1303073fa: FOUND
- Commit 6e9cfda3e: FOUND
