---
phase: 09-feature-expansion
plan: "03"
subsystem: auth
tags: [totp, 2fa, backup, react, ipc, settings, loot-core]

requires:
  - phase: 09-01-feature-expansion
    provides: TOTP server-side REST endpoints (/totp/setup, /totp/challenge, /totp/status, /totp/disable)
  - phase: 09-02-feature-expansion
    provides: Backup server-side REST endpoints (/backup/status, /backup/trigger)

provides:
  - loot-core IPC handlers for all TOTP and backup operations (7 new methods)
  - Modified signIn flow that handles TOTP intermediate state (needsTotp + totpNonce)
  - Login.tsx TOTP challenge screen with code input, Back button, error messages
  - TwoFactorSettings component: enroll with QR + manual secret, verify, disable, recovery codes
  - BackupStatus component: last backup info, size, count, manual Backup Now trigger

affects: [10-pwa-completion, login-flow, settings-page]

tech-stack:
  added: []
  patterns:
    - "loot-core IPC handler pattern: get user-token from asyncStorage, pass as X-ACTUAL-TOKEN header to post()"
    - "get() returns raw text in loot-core — must JSON.parse() for status endpoints"
    - "verifyTotp does NOT pass X-ACTUAL-TOKEN (pre-auth nonce flow)"
    - "Settings component pattern: useSyncServerStatus() guard, return null for no-server, warn for offline"

key-files:
  created:
    - packages/desktop-client/src/components/settings/TwoFactorSettings.tsx
    - packages/desktop-client/src/components/settings/BackupStatus.tsx
  modified:
    - packages/loot-core/src/server/auth/app.ts
    - packages/desktop-client/src/components/manager/subscribe/Login.tsx
    - packages/desktop-client/src/components/settings/index.tsx

key-decisions:
  - "verifyTotp sends no X-ACTUAL-TOKEN: user is pre-auth, only totpNonce authenticates the challenge exchange"
  - "totpStatus and backupStatus use get() + JSON.parse() because loot-core get() returns raw text (not parsed)"
  - "TOTP management handlers (setup/disable/status) pass X-ACTUAL-TOKEN from asyncStorage — same pattern as enableOpenId"
  - "TwoFactorSettings manages its own multi-step state (idle / setup-flow / disable-flow) rather than modals to keep implementation self-contained"
  - "BackupStatus is placed after EncryptionSettings, before BudgetTypeSettings — distinct from Electron-only Backups component"

patterns-established:
  - "Settings components return null when serverStatus === 'no-server' and show offline warning when 'offline'"
  - "Multi-step UI state in settings (idle/setup/disable) managed with local useState, no modal dispatch needed for simple flows"

requirements-completed: [fc-1, fc-2]

duration: 25min
completed: 2026-03-19
---

# Phase 09 Plan 03: Client Integration Summary

**TOTP challenge screen in login flow + TwoFactorSettings and BackupStatus components wired into the Settings page via 7 new loot-core IPC handlers**

## Performance

- **Duration:** 25 min
- **Started:** 2026-03-19T00:30:00Z
- **Completed:** 2026-03-19T00:55:00Z
- **Tasks:** 3 (+ 1 auto-approved checkpoint)
- **Files modified:** 5

## Accomplishments

- Modified `signIn` in loot-core to return `{ needsTotp, totpNonce }` intermediate state when server returns TOTP challenge
- Added 7 new IPC handlers to `auth/app.ts`: `verify-totp`, `totp-setup`, `totp-verify-setup`, `totp-disable`, `totp-status`, `backup-status`, `backup-trigger`
- Login.tsx now renders a TOTP challenge screen (code input + Verify/Back buttons) after successful password entry when 2FA is enrolled
- TwoFactorSettings: full enrollment flow (QR code display, manual secret, recovery codes with copy, code verification), disable flow (password confirmation), status display
- BackupStatus: last backup time/status/size, backup count, Backup Now button with result feedback
- TypeScript typecheck passes with 0 errors across 1376 strict files

## Task Commits

1. **Task 1: loot-core TOTP and backup IPC handlers** - `1ee6f93d4` (feat)
2. **Task 2: Login.tsx TOTP challenge screen** - `c414ef33c` (feat)
3. **Task 3: TwoFactorSettings and BackupStatus Settings components** - `be4bbd987` (feat)
4. **Task 4: Checkpoint** - auto-approved (auto mode)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `packages/loot-core/src/server/auth/app.ts` - Added 7 IPC handlers + modified signIn for TOTP intermediate state
- `packages/desktop-client/src/components/manager/subscribe/Login.tsx` - TOTP challenge screen in PasswordLogin
- `packages/desktop-client/src/components/settings/TwoFactorSettings.tsx` - Created: 2FA management UI
- `packages/desktop-client/src/components/settings/BackupStatus.tsx` - Created: server backup status and trigger UI
- `packages/desktop-client/src/components/settings/index.tsx` - Wired in TwoFactorSettings and BackupStatus

## Decisions Made

- `verifyTotp` sends no `X-ACTUAL-TOKEN`: the user is pre-authenticated at this point, only `totpNonce` authenticates the challenge exchange. This matches the server's `/totp/challenge` endpoint which accepts unauthenticated requests.
- `totpStatus` and `backupStatus` use `get()` + `JSON.parse()` because loot-core's `get()` returns raw text (unlike `post()` which returns parsed `responseData.data`).
- TOTP management handlers pass `X-ACTUAL-TOKEN` from asyncStorage using the same pattern as `enableOpenId`.
- TwoFactorSettings manages multi-step state locally (idle / setup-flow / disable-flow) rather than dispatching modals — keeps the component self-contained for a simple 2-screen flow.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- Yarn not on system PATH; found bundled Yarn 4 at `.yarn/releases/yarn-4.10.3.cjs` and used `node .yarn/releases/yarn-4.10.3.cjs` for all workspace commands.
- loot-core workspace name is `loot-core` (not `@actual-app/loot-core`) and has no `typecheck` script; ran root-level `typecheck` instead which covers all packages.

## User Setup Required

None — no external service configuration required. The 2FA and backup features activate automatically once the server-side endpoints (Plans 01 and 02) are deployed.

## Next Phase Readiness

- Phase 09 complete: TOTP + backup fully integrated end-to-end (server + client)
- Ready for Phase 10: PWA Completion (service worker, iOS Safari)
- The Settings page now has TwoFactorSettings and BackupStatus sections visible when a sync server is online

---
*Phase: 09-feature-expansion*
*Completed: 2026-03-19*
