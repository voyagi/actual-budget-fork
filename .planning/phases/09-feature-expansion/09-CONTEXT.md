# Phase 9: Feature Expansion - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement two independent features: (1) optional 2FA/TOTP authentication for password-based login, and (2) automated server-side database backup with daily scheduling. Addresses audit findings fc-1 (2FA/TOTP) and fc-2 (backup automation).

</domain>

<decisions>
## Implementation Decisions

### TOTP Enrollment (fc-1)
- 2FA is optional, user-enabled via Settings page (single-user app, no mandatory enforcement needed)
- Enrollment flow: QR code + manual secret display in Settings, compatible with Google Authenticator/Authy/1Password
- Generate 8 one-time recovery codes at enrollment time (essential safety net if authenticator device is lost)
- Store TOTP secret encrypted in `auth` table with method='totp', recovery codes hashed in separate table or JSON field
- Use `otpauth` npm library (modern, ESM-native, zero-dependency, well-maintained)
- Audit log enrollment and disable events via existing Phase 7 audit system

### TOTP Verification (fc-1)
- Two-step login: password verification first, then TOTP challenge on a separate screen (doesn't leak password correctness to unenrolled users)
- TOTP required only for password login, not OpenID (OpenID providers handle their own MFA)
- 1-step time window tolerance (30 seconds before/after current period) to handle clock drift
- Track last used TOTP timestamp to prevent replay attacks within the tolerance window
- Recovery codes accepted as TOTP alternative, each code single-use, mark as consumed after use
- Failed TOTP attempts logged to audit log, count toward existing auth failure burst alert (Phase 7)

### Backup Automation (fc-2)
- Server-side cron job in scheduler.ts (extends existing node-cron pattern, runs without browser open)
- Daily backup at 2 AM via node-cron (5-field format: `0 2 * * *`)
- Back up full /data directory: account.sqlite + all budget SQLite files
- Use SQLite `.backup()` API for atomic database copy (prevents corruption from concurrent access)
- Archive budget directories into tar.gz for space efficiency
- Store backups in /data/backups/ within Docker volume (persists across restarts, no cloud dependency)

### Backup Retention (fc-2)
- Keep last 7 daily backups (one week of snapshots, sufficient for personal use)
- Automatic cleanup of backups older than 7 days after each successful backup run
- Backup failure triggers alert via existing Phase 7 webhook alerter (new event_type: 'backup_failure')
- Show last backup time and status on Settings page (matches sync status visibility pattern)

### Claude's Discretion
- TOTP QR code rendering approach (inline SVG, canvas, or library like `qrcode`)
- Exact recovery code format (alphanumeric groups, length)
- TOTP secret encryption key derivation (reuse existing PBKDF2 infrastructure or separate)
- Backup archive naming convention and directory structure within /data/backups/
- Whether to add a manual "Backup Now" button alongside the automated schedule
- Settings page layout for 2FA and backup sections

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Authentication system
- `packages/sync-server/src/accounts/password.ts` -- Password login, bootstrap, change, strength validation (bcrypt + sessions)
- `packages/sync-server/src/account-db.ts` -- Account database accessor, auth table schema, session management
- `packages/sync-server/src/app-account.ts` -- Login/bootstrap/password-change endpoints with audit logging

### Audit and alerting (Phase 7)
- `packages/sync-server/src/util/audit.ts` -- writeAuditLog() helper for auth event logging
- `packages/sync-server/src/util/alerter.ts` -- triggerAlert() for webhook notifications with cooldown

### Existing backup system
- `packages/loot-core/src/server/budgetfiles/backups.ts` -- Client-side backup: makeBackup(), retention policy, 15-min interval service
- `packages/loot-core/src/platform/server/sqlite/index.electron.ts` -- SQLite .backup() API usage for export

### Scheduler
- `packages/sync-server/src/scheduler.ts` -- Existing node-cron scheduler for auto-sync (pattern to extend for backup cron)

### Prior phase context
- `.planning/phases/05.2-security-hardening/05.2-CONTEXT.md` -- Password strength (min 8 chars), PBKDF2 100K iterations
- `.planning/phases/07-observability-and-monitoring/07-CONTEXT.md` -- Audit logging schema, webhook alerter, metrics collector

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `auth` table: Stores auth methods with `method`, `display_name`, `extra_data`, `active` columns. TOTP secret can follow same pattern (method='totp').
- `sessions` table: Token-based sessions with `expires_at`. TOTP verification integrates between password check and session creation.
- `writeAuditLog()`: Ready to log TOTP enrollment, verification, and recovery code usage events.
- `triggerAlert()`: Ready for backup_failure event type (same pattern as sync_failure, consent_expiry).
- `scheduler.ts`: node-cron already running for auto-sync. Backup cron job is a second `cron.schedule()` call.
- `backups.ts` (loot-core): Client-side backup logic with retention. Server-side backup is independent but can reference the retention pattern.

### Established Patterns
- Auth methods stored in `auth` table with method discriminator (currently 'password', 'openid')
- Login flow in `app-account.ts` switches on `loginMethod` -- TOTP adds a verification step after password success
- node-cron uses 5-field format (`0 0,6,12,18 * * *` for sync, `0 2 * * *` for backup)
- Audit events follow `{ event_type, actor, ip_address, outcome, details }` schema
- Alert events follow `{ event_type, message, timestamp, severity }` schema

### Integration Points
- `app-account.ts /login`: After password verification succeeds, check if TOTP is enrolled; if yes, return intermediate state requiring TOTP code
- `app-account.ts`: New endpoints: POST /totp/setup, POST /totp/verify, POST /totp/disable, POST /totp/recovery
- `scheduler.ts`: Add second cron.schedule() for daily backup at 2 AM
- `app.ts /metrics`: Add backup metrics (last_backup_time, backup_size, backup_status)
- Desktop client Settings page: New sections for 2FA management and backup status display

</code_context>

<specifics>
## Specific Ideas

- TOTP enrollment should show both QR code and text secret (for manual entry in authenticator apps that don't support QR scanning)
- Recovery codes should be shown ONCE at enrollment, with a "Download" or "Copy" option, then never shown again
- Backup cron should be configurable via env var `BACKUP_CRON_SCHEDULE` (default: `0 2 * * *`) for flexibility
- Backup should be skippable via `ENABLE_AUTO_BACKUP=true` env var (matches `ENABLE_AUTO_SYNC` pattern)

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 09-feature-expansion*
*Context gathered: 2026-03-19*
