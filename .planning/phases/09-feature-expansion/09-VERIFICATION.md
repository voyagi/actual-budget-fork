---
phase: 09-feature-expansion
verified: 2026-03-19T00:00:00Z
status: human_needed
score: 14/14 must-haves verified
re_verification: false
human_verification:
  - test: "Login TOTP challenge flow end-to-end"
    expected: "After entering correct password, TOTP challenge screen appears. Entering valid 6-digit code from authenticator app completes login. Entering wrong code shows error. Back button returns to password screen."
    why_human: "Requires a running server with TOTP enrolled, a real authenticator app, and browser interaction to confirm screen transitions."
  - test: "Recovery code login path"
    expected: "On the TOTP challenge screen, entering a valid XXXX-XXXX-XXXX recovery code completes login. The code is consumed (cannot be reused). Recovery count decreases by 1 on the Settings page."
    why_human: "Requires runtime state across two requests and cannot be traced statically."
  - test: "TwoFactorSettings enrollment flow"
    expected: "Settings page shows 'Two-Factor Authentication' section. Clicking 'Enable 2FA' renders a QR code image and plaintext secret. Entering the 6-digit code confirms setup. Section then shows 'enabled' status and recovery codes remaining count."
    why_human: "Visual rendering, QR code legibility, and multi-step state machine transitions require browser interaction."
  - test: "TwoFactorSettings disable flow"
    expected: "Clicking 'Disable 2FA' prompts for current password. Entering correct password disables 2FA. Logging out and back in goes directly to budget (no TOTP challenge)."
    why_human: "Cross-request state and visual confirmation require a running environment."
  - test: "BackupStatus section on Settings page"
    expected: "'Server Backup' section is visible on Settings page. 'Backup Now' button triggers a backup and shows success/failure result. Last backup time and size update after a successful run."
    why_human: "Requires a live sync server with the backup endpoint responding. UI state update after async trigger cannot be statically verified."
  - test: "Backup cron fires and creates archive"
    expected: "After server runs at 2 AM (or with BACKUP_CRON_SCHEDULE overridden to a near-future time), a .tar.gz file appears in /data/backups/. Archive contains account.sqlite and at least one budget db.sqlite."
    why_human: "Cron scheduling and runtime archiving require a live environment with file system access."
---

# Phase 9: Feature Expansion Verification Report

**Phase Goal:** Implement 2FA/TOTP authentication and automated database backup trigger.
**Verified:** 2026-03-19
**Status:** human_needed — all automated checks pass, 6 runtime behaviors need human confirmation
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | TOTP secret can be generated and produces a valid otpauth:// URI | VERIFIED | `generateTotpSecret` exported from `totp.ts` line 16; uses `otpauth` library (confirmed in package.json line 51) |
| 2 | TOTP codes are verified with 1-step window tolerance and replay prevention | VERIFIED | `verifyTotpCode` at line 37; logic reads `lastUsedAt` from DB and compares `periodTs` before accepting |
| 3 | 8 recovery codes generated, hashed with bcrypt, single-use | VERIFIED | `generateRecoveryCodes` line 72, `verifyRecoveryCode` line 91, `consumeRecoveryCode` line 225 |
| 4 | Login endpoint returns intermediate TOTP challenge state when TOTP is enrolled | VERIFIED | `app-account.ts` line 185: `res.send({ status: 'ok', data: { needsTotp: true, totpNonce: nonce } })` |
| 5 | TOTP enrollment and verification events are audit-logged | VERIFIED | `audit.ts` lines 16-19: `totp_enrolled`, `totp_disabled`, `totp_verify_success`, `totp_verify_failure`, `totp_recovery_used` |
| 6 | Failed TOTP attempts trigger auth failure tracking | VERIFIED | `app-account.ts` lines 309 and 369: `trackAuthFailure(req.ip ?? 'unknown')` in challenge failure paths |
| 7 | SQLite databases are backed up atomically using better-sqlite3 .backup() API | VERIFIED | `backup.ts` lines 34-36: `new Database(srcPath, { readonly: true })` then `await db.backup(destPath)` |
| 8 | Budget directories are discovered dynamically by scanning for db.sqlite files | VERIFIED | `discoverBudgetDirs` line 47; excludes `backups` dir at line 60 |
| 9 | Backup archives into tar.gz for space efficiency | VERIFIED | `backup.ts` line 10: `import { createGzip } from 'node:zlib'`; `archivePath = backupDir + '.tar.gz'` line 199 |
| 10 | Backups older than 7 days are automatically cleaned up | VERIFIED | `cleanOldBackups` line 245; removes `.tar.gz` files older than cutoff by mtime |
| 11 | Backup failure triggers a webhook alert | VERIFIED | `scheduler.ts` lines 295 and 306: `triggerAlert({ event_type: 'backup_failure', ... })` on failure |
| 12 | Backup cron runs daily at 2 AM by default, configurable via env var | VERIFIED | `scheduler.ts` line 279: `process.env.BACKUP_CRON_SCHEDULE ?? '0 2 * * *'` |
| 13 | Backup is enabled by default, disabled via ENABLE_AUTO_BACKUP=false | VERIFIED | `scheduler.ts` line 278: `if (process.env.ENABLE_AUTO_BACKUP !== 'false')` |
| 14 | Last backup status is queryable via an API endpoint | VERIFIED | `app-account.ts` line 469: `app.get('/backup/status', ...)` returns `getBackupStatus()` |

**Score:** 14/14 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/sync-server/src/accounts/totp.ts` | TOTP enrollment, verification, recovery code logic | VERIFIED | All 11 exports present (generateTotpSecret, verifyTotpCode, generateRecoveryCodes, verifyRecoveryCode, enrollTotp, isTotpEnrolled, disableTotp, getTotpStatus, getStoredTotpSecret, updateTotpLastUsed, consumeRecoveryCode) |
| `packages/sync-server/src/accounts/totp.test.ts` | Unit tests for TOTP module | VERIFIED | File exists; uses vitest with mocked DB; RED/GREEN commits documented |
| `packages/sync-server/src/util/audit-migrations.ts` | totp table schema migration | VERIFIED | `CREATE TABLE IF NOT EXISTS totp` at line 25 |
| `packages/sync-server/src/util/audit.ts` | Extended AuditEventType with totp_* events | VERIFIED | totp_enrolled, totp_disabled, totp_verify_success, totp_verify_failure, totp_recovery_used at lines 16-19 |
| `packages/sync-server/src/app-account.ts` | TOTP endpoints and login flow intercept | VERIFIED | totpNonces Map, needsTotp response, 5 TOTP routes (/totp/challenge, /totp/setup, /totp/verify-setup, /totp/disable, /totp/status) |
| `packages/sync-server/src/util/backup.ts` | Backup logic: atomic SQLite copy, budget discovery, tar.gz archiving, retention cleanup | VERIFIED | All 5 exports (runBackup, cleanOldBackups, getBackupStatus, backupSqliteFile, discoverBudgetDirs); better-sqlite3 readonly + .backup(); createGzip; .tar.gz construction |
| `packages/sync-server/src/util/backup.test.ts` | Unit tests for backup module | VERIFIED | File exists; uses vitest with real better-sqlite3 and temp dirs; 13 tests per SUMMARY |
| `packages/sync-server/src/scheduler.ts` | Second cron.schedule() for daily backup | VERIFIED | BACKUP_CRON_SCHEDULE, ENABLE_AUTO_BACKUP, backup_failure alert all present |
| `packages/sync-server/src/util/metrics.ts` | Backup metrics (last time, size, status) | VERIFIED | recordBackupRun and getBackupStats exported; backupStats reset in _resetMetrics() |
| `packages/loot-core/src/server/auth/app.ts` | TOTP IPC handlers and modified signIn flow | VERIFIED | 7 methods registered (verify-totp, totp-setup, totp-verify-setup, totp-disable, totp-status, backup-status, backup-trigger); needsTotp handling in signIn at line 289 |
| `packages/desktop-client/src/components/manager/subscribe/Login.tsx` | TOTP challenge form in login flow | VERIFIED | totpNonce state, verify-totp send call, Authentication code aria-label, invalid-totp-code and invalid-totp-nonce error cases |
| `packages/desktop-client/src/components/settings/TwoFactorSettings.tsx` | 2FA enrollment and management UI | VERIFIED | totp-status, totp-setup, totp-disable send calls; QR img tag at line 124 |
| `packages/desktop-client/src/components/settings/BackupStatus.tsx` | Backup status display and manual trigger | VERIFIED | backup-status and backup-trigger send calls; status display logic |
| `packages/desktop-client/src/components/settings/index.tsx` | Settings page with TwoFactorSettings and BackupStatus | VERIFIED | Both imported and rendered at lines 334 and 336 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app-account.ts` | `accounts/totp.ts` | `import ... from './accounts/totp.js'` | WIRED | Line 30: named imports for isTotpEnrolled, enrollTotp, verifyTotpCode, etc. |
| `app-account.ts` | `util/audit.ts` | `writeAuditLog` with totp_* event types | WIRED | Lines contain totp_enrolled, totp_disabled, totp_verify_success/failure |
| `scheduler.ts` | `util/backup.ts` | `import { runBackup } from './util/backup.js'` | WIRED | Line 12 import; called inside cron callback |
| `scheduler.ts` | `util/alerter.ts` | `triggerAlert` on backup failure | WIRED | Lines 295 and 306: backup_failure event_type |
| `app-account.ts` | `util/backup.ts` | `import { getBackupStatus, runBackup }` | WIRED | Line 31 import; used in /backup/status and /backup/trigger routes |
| `Login.tsx` | `loot-core/src/server/auth/app.ts` | `send('verify-totp')` with needsTotp check | WIRED | totpNonce state set from result.needsTotp; verify-totp called with nonce |
| `TwoFactorSettings.tsx` | `loot-core/src/server/auth/app.ts` | `send('totp-setup')`, `send('totp-status')`, `send('totp-disable')` | WIRED | All three send calls confirmed at lines 41, 62, 91 |
| `BackupStatus.tsx` | `loot-core/src/server/auth/app.ts` | `send('backup-status')`, `send('backup-trigger')` | WIRED | Both send calls confirmed at lines 49 and 72 |

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|--------------|-------------|--------|----------|
| fc-1 | 09-01, 09-03 | 2FA/TOTP authentication (audit finding) | SATISFIED | totp.ts module, login intercept, 5 REST endpoints, loot-core IPC handlers, Login.tsx challenge screen, TwoFactorSettings component |
| fc-2 | 09-02, 09-03 | Automated database backup trigger (audit finding) | SATISFIED | backup.ts module, scheduler cron, metrics, /backup/status + /backup/trigger endpoints, BackupStatus component |

**Note on requirement IDs:** `fc-1` and `fc-2` are audit finding IDs defined in ROADMAP.md Phase 9 requirements field. They do not appear in REQUIREMENTS.md (which tracks v1 product requirements FOUND-*, SYNC-*, AUTO-*, PWA-*, INFRA-*). This is by design — audit findings are a separate tracking track. No orphaned requirements found for Phase 9.

### Anti-Patterns Found

No blockers or warnings found.

- `totp.ts` line 211: `return null` — correct guard clause in `getStoredTotpSecret()` when no TOTP row exists. Not a stub.
- `backup.ts` line 54: `return []` — correct guard clause in `discoverBudgetDirs()` when dataDir does not exist. Not a stub.

No TODO/FIXME/PLACEHOLDER comments found in phase files. No empty handler implementations. No console.log-only stubs.

### Human Verification Required

#### 1. Login TOTP Challenge Flow

**Test:** Start the dev server. Enroll TOTP via Settings. Log out. Enter correct password at the login screen.
**Expected:** TOTP challenge screen appears. Entering the correct 6-digit code from an authenticator app completes login. Entering a wrong code shows "Invalid authentication code" error. The Back button returns to the password screen.
**Why human:** Requires a running server with TOTP enrolled, a real authenticator app, and browser interaction to confirm screen transitions and state machine behavior.

#### 2. Recovery Code Login Path

**Test:** On the TOTP challenge screen, enter a valid XXXX-XXXX-XXXX recovery code instead of a 6-digit TOTP code.
**Expected:** Login completes. The recovery code is consumed (cannot be reused). The recovery codes remaining count in Settings decreases by 1.
**Why human:** Requires runtime state across two HTTP requests and single-use consumption logic that cannot be traced statically.

#### 3. TwoFactorSettings Enrollment Flow

**Test:** Navigate to Settings. Locate the "Two-Factor Authentication" section (should appear after the Authentication section). Click "Enable 2FA".
**Expected:** QR code image renders and is scannable. Manual text secret is shown for users without QR scanner. Recovery codes are displayed once with a copy button. Entering the 6-digit code from the authenticator confirms setup. Section then shows enrolled status and recovery code count.
**Why human:** Visual rendering, QR code legibility, and multi-step state machine transitions require browser interaction.

#### 4. TwoFactorSettings Disable Flow

**Test:** While 2FA is enrolled, click "Disable 2FA". Enter current password to confirm.
**Expected:** 2FA is disabled. Log out and back in — login proceeds directly to the budget with no TOTP challenge.
**Why human:** Cross-request state change and subsequent login flow behavior require a running environment.

#### 5. BackupStatus Section on Settings Page

**Test:** Navigate to Settings. Locate the "Server Backup" section. Click "Backup Now".
**Expected:** Section is visible and distinct from the existing Electron-only Backups component. The button triggers a backup, shows a success or failure result, and the last backup time/size update.
**Why human:** Requires a live sync server with the backup endpoint responding. UI state update after async trigger cannot be statically verified.

#### 6. Backup Cron Creates Archive

**Test:** Override `BACKUP_CRON_SCHEDULE` to a near-future cron time and wait for it to fire, or trigger manually via `POST /backup/trigger`. Then inspect `/data/backups/`.
**Expected:** A timestamped `.tar.gz` file exists in `/data/backups/`. The archive contains `account.sqlite` and at least one budget `db.sqlite`. Archives older than 7 days are removed.
**Why human:** Cron scheduling and runtime archiving require a live server environment with file system access.

## Summary

All 14 observable truths are verified against the actual codebase. Every artifact exists, is substantive (not a stub), and is wired to its consumers. All key links are confirmed. Both audit findings (fc-1, fc-2) are satisfied.

The 6 human verification items cover runtime behaviors that are correct-by-static-analysis but require a live environment to confirm: the full TOTP enrollment/challenge/disable cycle, recovery code consumption, and the backup cron producing valid archives. No blockers were found — the phase is ready for human smoke testing.

---

_Verified: 2026-03-19_
_Verifier: Claude (gsd-verifier)_
