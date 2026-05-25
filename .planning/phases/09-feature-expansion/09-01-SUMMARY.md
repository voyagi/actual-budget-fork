---
phase: 09-feature-expansion
plan: 01
subsystem: auth
tags: [totp, 2fa, otpauth, bcrypt, aes-256-gcm, sqlite, audit]

requires:
  - phase: 07-observability-and-monitoring
    provides: writeAuditLog(), AuditEventType, trackAuthFailure(), audit_log table

provides:
  - TOTP/2FA server module (totp.ts) with secret generation, code verification, replay prevention, recovery codes
  - totp table migration in account.sqlite
  - AuditEventType extended with 5 totp_* event types
  - Login flow TOTP intercept in app-account.ts (needsTotp intermediate state)
  - Five TOTP REST endpoints: /totp/challenge, /totp/setup, /totp/verify-setup, /totp/disable, /totp/status

affects:
  - 09-03-client-integration (Phase 9 Plan 3: TwoFactorSettings.tsx, Login.tsx TOTP screen)

tech-stack:
  added:
    - otpauth@^9.5.0 (TOTP secret generation + RFC 6238 code verification)
    - qrcode@^1.5.4 (server-side QR data URI generation)
    - "@types/qrcode@^1.5.6" (TypeScript types)
  patterns:
    - Two-step login with in-memory nonce store (Map<nonce, {expiresAt, token}>)
    - AES-256-GCM TOTP secret encryption with PBKDF2 key from SECRET_KEY env var
    - Recovery codes: 8x XXXX-XXXX-XXXX format, bcrypt-hashed (cost 10), single-use

key-files:
  created:
    - packages/sync-server/src/accounts/totp.ts
    - packages/sync-server/src/accounts/totp.test.ts
  modified:
    - packages/sync-server/src/util/audit.ts
    - packages/sync-server/src/util/audit-migrations.ts
    - packages/sync-server/src/app-account.ts
    - packages/sync-server/package.json
    - yarn.lock

key-decisions:
  - "Separate totp table (not auth table) to avoid needsBootstrap() false-positive when TOTP row would make SELECT * FROM auth return non-empty rows"
  - "TOTP secret encrypted AES-256-GCM with PBKDF2 key derived from SECRET_KEY + fixed salt 'totp-secret-encryption' (no new env var needed)"
  - "Recovery codes hash the formatted XXXX-XXXX-XXXX string (not raw hex) for consistent comparison on both sides"
  - "QR code generated server-side on sync-server using qrcode library (returns data URI to client, simpler client integration)"
  - "Nonce store is in-memory Map (no DB overhead, 5-min TTL sufficient, no persistence needed for ephemeral login state)"
  - "totp/challenge reads recovery_codes directly from DB to avoid circular dependency with getTotpStatus()"

patterns-established:
  - "Two-step login pattern: loginWithPassword() -> nonce -> /totp/challenge -> real token"
  - "TOTP replay prevention: store periodTs (floor(now/30) + delta) in last_used_at, reject same value"
  - "Nonce cleanup: iterate Map on each /totp/challenge request, delete expired entries (no background timer needed)"

requirements-completed: [fc-1]

duration: 45min
completed: 2026-03-19
---

# Phase 09 Plan 01: TOTP/2FA Server-Side Implementation Summary

**Server-side TOTP/2FA using otpauth with AES-256-GCM encrypted secret storage, bcrypt recovery codes, two-step login intercept via in-memory nonce map, and five REST endpoints integrated with Phase 7 audit logging**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-03-19T01:10:00Z
- **Completed:** 2026-03-19T01:25:00Z
- **Tasks:** 2 (Task 1 TDD: RED + GREEN; Task 2: login intercept + endpoints)
- **Files modified:** 6

## Accomplishments

- TOTP module (`totp.ts`) with full enrollment/verification/recovery lifecycle, AES-256-GCM encrypted storage, and DB operations against the new `totp` table
- Login flow in `app-account.ts` intercepts successful password authentication when TOTP is enrolled, returning a short-lived nonce instead of the real session token
- Five TOTP endpoints operational: `/totp/challenge` (unauthenticated nonce redemption), `/totp/setup`, `/totp/verify-setup`, `/totp/disable`, `/totp/status` (all authenticated except challenge)
- 20 unit tests cover all TOTP behaviors; full suite of 551 tests passes

## Task Commits

1. **Task 1 RED: add failing TOTP unit tests** - `e17e68f` (test)
2. **Task 1 GREEN: implement TOTP module** - `93e5f9d` (feat)
3. **Task 2: login intercept + REST endpoints** - `ce8164a` (feat)

## Files Created/Modified

- `packages/sync-server/src/accounts/totp.ts` - TOTP module: generateTotpSecret, verifyTotpCode (replay prevention), generateRecoveryCodes, verifyRecoveryCode, encryptTotpSecret (AES-256-GCM), DB operations (enrollTotp, isTotpEnrolled, disableTotp, getTotpStatus, getStoredTotpSecret, updateTotpLastUsed, consumeRecoveryCode)
- `packages/sync-server/src/accounts/totp.test.ts` - 20 unit tests covering all exported functions
- `packages/sync-server/src/util/audit.ts` - AuditEventType extended with totp_enrolled, totp_disabled, totp_verify_success, totp_verify_failure, totp_recovery_used
- `packages/sync-server/src/util/audit-migrations.ts` - Added CREATE TABLE IF NOT EXISTS totp migration (idempotent)
- `packages/sync-server/src/app-account.ts` - totpNonces Map, login intercept in default branch, five TOTP endpoints
- `packages/sync-server/package.json` + `yarn.lock` - otpauth, qrcode, @types/qrcode added

## Decisions Made

- Used separate `totp` table (not `auth` table): the `auth` table is queried by `needsBootstrap()` via `SELECT * FROM auth`. A TOTP row with `method='totp'` would make `needsBootstrap()` return false on a fresh install.
- TOTP secret encrypted with AES-256-GCM, key derived via PBKDF2 from `SECRET_KEY` env var + fixed salt `'totp-secret-encryption'`. No new env var required for existing deployments.
- Recovery codes hash the formatted `XXXX-XXXX-XXXX` string (not raw hex) so comparison is consistent: both the stored hash and the submitted code use the same formatted form.
- QR code generated server-side (qrcode library on sync-server), returns data URI to client. Simpler than requiring the client to have a QR renderer for the settings page.

## Deviations from Plan

None - plan executed exactly as written. The only discovery was that `app-account.ts` already had backup endpoints (from a parallel plan authored alongside 09-01), which did not conflict with the TOTP additions.

## Issues Encountered

- `yarn workspace` unavailable directly on MSYS; invoked bundled yarn via `node .yarn/releases/yarn-4.10.3.cjs workspace ...` from PowerShell
- Test command `--run` flag conflicted with the workspace test script's own `--run`; resolved by passing the test file pattern as a positional argument instead of using `--run` again

## Next Phase Readiness

- TOTP server module is complete and tested. Phase 09 Plan 03 (client integration) can now implement:
  - `TwoFactorSettings.tsx` — calls `/totp/setup`, `/totp/disable`, `/totp/status`
  - `Login.tsx` TOTP challenge screen — calls `/totp/challenge` with nonce from login response
  - The `needsTotp` + `totpNonce` fields in the login response are the interface contract

## Self-Check: PASSED

- FOUND: `packages/sync-server/src/accounts/totp.ts`
- FOUND: `packages/sync-server/src/accounts/totp.test.ts`
- FOUND: `.planning/phases/09-feature-expansion/09-01-SUMMARY.md`
- FOUND commit `e17e68f`: test(09-01): add failing TOTP unit tests (RED)
- FOUND commit `93e5f9d`: feat(09-01): implement TOTP module
- FOUND commit `ce8164a`: feat(09-01): add TOTP login intercept and REST endpoints

---
*Phase: 09-feature-expansion*
*Completed: 2026-03-19*
