# Phase 9: Feature Expansion - Research

**Researched:** 2026-03-19
**Domain:** TOTP/2FA authentication + server-side SQLite backup automation
**Confidence:** HIGH

## Summary

Phase 9 implements two independent server-side features: optional TOTP-based 2FA for password login, and automated daily backup of the /data directory. Both features integrate with established Phase 7 infrastructure (audit logging, alerter, metrics) and the existing node-cron scheduler pattern in scheduler.ts.

The TOTP feature requires one new npm dependency (`otpauth` 9.5.0) and a QR code renderer on the desktop client (the `qrcode` library is the standard choice, version 1.5.4). The backup feature requires no new dependencies — better-sqlite3 (already present at ^12.6.2) provides the `.backup()` API, and Node.js built-in `node:fs`, `node:path`, and `node:zlib` handle archive creation without needing `node-tar`. The `fs.createReadStream`/`zlib.createGzip`/`fs.createWriteStream` pipeline is idiomatic Node.js for tar.gz creation.

The TOTP enrollment and verification flow intercepts the existing `loginWithPassword()` path in `password.ts`. After a successful password check, the server returns an intermediate state (`{ needsTotp: true, totpToken: <short-lived-nonce> }`) instead of a session token. The client presents a TOTP challenge screen, submits the code to a new `/totp/verify` endpoint, and receives the real session token on success. All TOTP metadata is stored in a new `totp` table keyed to the user, separate from the `auth` table which stores the password hash.

**Primary recommendation:** Implement TOTP using `otpauth` for secret generation and verification. Use `qrcode` for QR rendering on the client. Extend `scheduler.ts` with a second `cron.schedule()` call for backup. Store TOTP secrets AES-256-GCM encrypted using a server-derived key (PBKDF2 from server secret). Archive backups with Node.js built-in streams.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**TOTP Enrollment (fc-1)**
- 2FA is optional, user-enabled via Settings page (single-user app, no mandatory enforcement needed)
- Enrollment flow: QR code + manual secret display in Settings, compatible with Google Authenticator/Authy/1Password
- Generate 8 one-time recovery codes at enrollment time (essential safety net if authenticator device is lost)
- Store TOTP secret encrypted in `auth` table with method='totp', recovery codes hashed in separate table or JSON field
- Use `otpauth` npm library (modern, ESM-native, zero-dependency, well-maintained)
- Audit log enrollment and disable events via existing Phase 7 audit system

**TOTP Verification (fc-1)**
- Two-step login: password verification first, then TOTP challenge on a separate screen (doesn't leak password correctness to unenrolled users)
- TOTP required only for password login, not OpenID (OpenID providers handle their own MFA)
- 1-step time window tolerance (30 seconds before/after current period) to handle clock drift
- Track last used TOTP timestamp to prevent replay attacks within the tolerance window
- Recovery codes accepted as TOTP alternative, each code single-use, mark as consumed after use
- Failed TOTP attempts logged to audit log, count toward existing auth failure burst alert (Phase 7)

**Backup Automation (fc-2)**
- Server-side cron job in scheduler.ts (extends existing node-cron pattern, runs without browser open)
- Daily backup at 2 AM via node-cron (5-field format: `0 2 * * *`)
- Back up full /data directory: account.sqlite + all budget SQLite files
- Use SQLite `.backup()` API for atomic database copy (prevents corruption from concurrent access)
- Archive budget directories into tar.gz for space efficiency
- Store backups in /data/backups/ within Docker volume (persists across restarts, no cloud dependency)

**Backup Retention (fc-2)**
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

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| fc-1 | 2FA/TOTP authentication for password-based login | `otpauth` 9.5.0 for secret gen/verify; two-step login flow intercepts existing `loginWithPassword()`; new `totp` table in account.sqlite; `qrcode` 1.5.4 for QR rendering; recovery codes hashed with bcrypt (already present); audit via existing `writeAuditLog()` |
| fc-2 | Automated server-side database backup | Second `cron.schedule()` in scheduler.ts; `db.backup()` from better-sqlite3 (already present ^12.6.2); Node.js built-in streams for tar.gz archive; `triggerAlert({ event_type: 'backup_failure' })` via existing alerter; backup metrics exposed on `/metrics` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| otpauth | 9.5.0 | TOTP secret generation, QR URI, code verification | ESM-native, zero-dependency, RFC 6238 compliant, active maintenance (verified npm 2026-03-19) |
| qrcode | 1.5.4 | QR code generation (server-side data URI or client-side canvas) | Standard library for QR generation in Node.js/browser. `@types/qrcode` 1.5.6 for TS types (verified npm 2026-03-19) |
| better-sqlite3 | ^12.6.2 (already installed) | SQLite `.backup()` API for atomic database copy | Already present in sync-server. `.backup(destPath)` is the canonical approach for hot backups |
| node-cron | 4.2.1 (already installed) | Scheduling daily backup at 2 AM | Already used for 6-hour sync schedule in scheduler.ts |
| node:crypto | built-in | AES-256-GCM for TOTP secret encryption, PBKDF2 key derivation, recovery code generation | No new dependency; same module used in Phase 5.2 PBKDF2 work |
| node:fs + node:zlib | built-in | tar.gz creation for budget directory archives | No new dependency; `createReadStream`/`createGzip`/`createWriteStream` pipeline |

### Not Needed (common over-reach)
| Skip | Why |
|------|-----|
| node-tar | Built-in Node.js streams handle tar.gz without it |
| speakeasy | Superseded by otpauth — do not use |
| notp | Unmaintained — do not use |

**Installation (new deps only):**
```bash
# sync-server
yarn workspace @actual-app/sync-server add otpauth
# desktop-client
yarn workspace @actual-app/desktop-client add qrcode
yarn workspace @actual-app/desktop-client add -D @types/qrcode
```

**Version verification (confirmed against npm registry 2026-03-19):**
- `otpauth`: 9.5.0
- `qrcode`: 1.5.4
- `@types/qrcode`: 1.5.6

---

## Architecture Patterns

### Recommended File Structure

```
packages/sync-server/src/
├── accounts/
│   ├── password.ts               # EXISTING — add TOTP check after password success
│   └── totp.ts                   # NEW — enrollTotp(), verifyTotpCode(), disableTotp(),
│                                 #        verifyRecoveryCode(), generateRecoveryCodes()
├── util/
│   ├── audit.ts                  # EXISTING — add totp_* event types to AuditEventType
│   ├── audit-migrations.ts       # EXISTING — add totp table migration here (idempotent)
│   └── backup.ts                 # NEW — runBackup(), cleanOldBackups(), getBackupStatus()
├── app-account.ts                # EXISTING — add /totp/setup, /totp/verify-setup,
│                                 #            /totp/challenge, /totp/disable, /totp/status
└── scheduler.ts                  # EXISTING — add second cron.schedule() for backup

packages/desktop-client/src/components/settings/
├── TwoFactorSettings.tsx         # NEW — enroll/disable TOTP, show QR, copy recovery codes
└── BackupStatus.tsx              # NEW — last backup time, status, optional "Backup Now" button
```

### Pattern 1: Intermediate TOTP Challenge State

The login endpoint cannot return a session token when TOTP is enrolled; it must return a short-lived nonce the client uses to complete the TOTP challenge.

**What:** After `loginWithPassword()` succeeds, check if TOTP is enrolled. If yes, generate a short-lived nonce (UUID, expires in 5 minutes, stored in-memory Map), return `{ needsTotp: true, totpNonce: <nonce> }` instead of `{ token }`. Client calls `/totp/challenge` with `{ totpNonce, code }` to redeem the nonce for a real session token.

**When to use:** Only on the `default` (password) branch of the `/login` switch in `app-account.ts`. OpenID and header branches are unaffected.

**Example (server-side login modification):**
```typescript
// In app-account.ts /login — after tokenRes = loginWithPassword(password)
if (!tokenRes.error && isTotpEnrolled()) {
  const nonce = uuidv4();
  totpNonces.set(nonce, { expiresAt: Date.now() + 5 * 60 * 1000 });
  res.send({ status: 'ok', data: { needsTotp: true, totpNonce: nonce } });
  return;
}
```

### Pattern 2: TOTP Secret Storage (Encrypted)

**What:** Store TOTP secret AES-256-GCM encrypted. Key derived from `process.env.SECRET_KEY` (already used in Phase 5.2) + a fixed salt using PBKDF2 (100K iterations, same as existing password key derivation pattern). Store `{ iv, authTag, ciphertext }` as JSON in a new `totp` table.

**Schema (added to `runAuditMigrations()` pattern — new idempotent migration helper):**
```sql
CREATE TABLE IF NOT EXISTS totp (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT    NOT NULL UNIQUE,
  secret_enc   TEXT    NOT NULL,  -- JSON: { iv, authTag, ciphertext } base64-encoded
  enrolled_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_used_at INTEGER,           -- epoch seconds, for replay prevention
  recovery_codes TEXT NOT NULL    -- JSON array of bcrypt hashes
);
```

Note: CONTEXT.md says "Store TOTP secret encrypted in `auth` table with method='totp'". However, the `auth` table's `extra_data` column stores only a single text blob (currently the bcrypt password hash). Storing a structured JSON blob in `extra_data` would work functionally but mixes concerns. The clean approach — and what the planner should verify — is a separate `totp` table. Both approaches are viable; the planner should pick one consistently. **Recommendation: separate `totp` table for clarity and replay-prevention (`last_used_at` column).**

### Pattern 3: Backup Cron Extension

**What:** Add a second `cron.schedule()` call in `startScheduler()`, guarded by `ENABLE_AUTO_BACKUP !== 'false'` (opt-out, enabled by default — matches the decision that backup is a safety feature).

**Example:**
```typescript
// scheduler.ts — inside startScheduler(), after existing sync cron
const backupSchedule = process.env.BACKUP_CRON_SCHEDULE ?? '0 2 * * *';
cron.schedule(backupSchedule, () => {
  runBackup().catch(err => {
    logger.error('Backup failed', { error: err.message });
    triggerAlert({
      event_type: 'backup_failure',
      message: `Daily backup failed: ${err.message}`,
      severity: 'error',
    }).catch(() => {});
  });
});
logger.info('Auto-backup scheduled', { schedule: backupSchedule });
```

### Pattern 4: SQLite Hot Backup via better-sqlite3

**What:** `better-sqlite3`'s `.backup(destPath)` API performs an online backup (safe while the DB is open and being written to). It returns a Promise. Used in `exportDatabase()` in `index.electron.ts` — the same pattern applies in sync-server.

**Source:** Confirmed in `packages/loot-core/src/platform/server/sqlite/index.electron.ts` line 128: `await db.backup(name)`.

The sync-server uses `WrappedDatabase` (db.ts) which wraps `better-sqlite3`. The underlying database is accessible; the backup function must open a raw `better-sqlite3` instance pointed at `account.sqlite`, call `.backup(destPath)`, then close it.

**Example:**
```typescript
import Database from 'better-sqlite3';

// Backup account.sqlite atomically
const src = new Database(srcPath, { readonly: true });
await src.backup(destPath);
src.close();
```

### Pattern 5: Recovery Code Generation and Verification

**What:** Generate 8 codes of format `XXXX-XXXX-XXXX` (12 alphanumeric chars in 3 groups of 4). Use `crypto.randomBytes(6).toString('hex').toUpperCase()` per code, split into groups. Hash each with bcrypt (cost 10 — lower than password's 12 since recovery codes are long random strings). Store as JSON array in `totp.recovery_codes`.

On verification: iterate hashes, `bcrypt.compareSync(submitted, hash)`. On match, remove that hash from the array and save (mark consumed). Return `{ valid: true, remaining: N }`.

### Anti-Patterns to Avoid

- **Using `auth` table `extra_data` for structured TOTP data**: The column is a single text blob currently used for the bcrypt password hash. Overloading it requires JSON parsing everywhere and makes `extra_data` semantics ambiguous.
- **Calling `loginWithPassword()` to check enrollment**: TOTP enrollment check must happen outside `loginWithPassword()` (which returns a token) — check after the call returns success.
- **Synchronous file operations for backup**: Backup involves large file copies; use async Node.js fs promises (`fs.promises.copyFile`, etc.) or the async `db.backup()` to avoid blocking the event loop.
- **Storing TOTP nonces in SQLite**: The intermediate nonces (5-min TTL) are ephemeral — an in-memory Map is correct (no persistence needed, no DB overhead).
- **Using node-tar for archive creation**: Unnecessary dependency. Node.js built-in `tar` via pipe (`fs.createReadStream | zlib.createGzip | fs.createWriteStream`) handles the archive.
- **Not scoping tar.gz to relative paths**: Archive budget directories with relative paths (not absolute) so the archive can be extracted anywhere. Use `path.relative(dataDir, filePath)` as entry name.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOTP secret generation + verification | Custom HMAC-based OTP | `otpauth` | RFC 6238 compliance, time-window handling, QR URI generation |
| QR code rendering | SVG/canvas from scratch | `qrcode` library | Correct QR error correction levels, supports both server-side data URI and client-side canvas rendering |
| SQLite hot backup | File copy while DB open | `db.backup(destPath)` from better-sqlite3 | Atomic, WAL-aware, prevents corruption during concurrent writes |
| TOTP QR URI format | Custom URI string | `otpauth.TOTP.toString()` | Generates correct `otpauth://` URI that authenticator apps parse |

**Key insight:** The TOTP protocol has subtle edge cases (time window, replay prevention, base32 encoding) that `otpauth` handles correctly. The backup API has OS-level file locking concerns that `better-sqlite3`'s `.backup()` resolves. Do not implement either from scratch.

---

## Common Pitfalls

### Pitfall 1: TOTP Replay Attack Within Tolerance Window
**What goes wrong:** The 1-step tolerance window allows codes valid 30 seconds before/after the current period. If the same code is accepted twice within this window, an attacker who intercepts the code can reuse it.
**Why it happens:** Naive implementations only check if the code is valid, not if it was already used.
**How to avoid:** Store `last_used_at` as the epoch timestamp of the TOTP period (floor to 30s boundary) in the `totp` table. Reject any code whose period timestamp equals `last_used_at`. Update `last_used_at` on successful verification.
**Warning signs:** No `last_used_at` column in the TOTP schema.

### Pitfall 2: Intermediate Nonce Leaking Password Correctness
**What goes wrong:** If the server returns `{ needsTotp: true }` only after a valid password, an attacker can use the response to enumerate whether the password was correct.
**Why it happens:** The two-step flow inherently leaks this.
**How to avoid:** This is a known, accepted tradeoff for single-user apps (CONTEXT.md decision). For the implementation, ensure that failed TOTP attempts after a correct password still hit `trackAuthFailure()` and `writeAuditLog()` so the burst alerter fires on TOTP brute-force.
**Warning signs:** TOTP failures not calling `trackAuthFailure(req.ip)`.

### Pitfall 3: `auth` Table Method Collision
**What goes wrong:** CONTEXT.md says store TOTP secret in `auth` table with `method='totp'`. The `auth` table currently has `extra_data TEXT` which stores a bcrypt hash for `method='password'`. Inserting a TOTP row with a JSON blob in `extra_data` works but the `needsBootstrap()` function checks `rows.length === 0` — a TOTP row would make the app think it's bootstrapped even with no password.
**Why it happens:** `needsBootstrap()` does `SELECT * FROM auth` and returns `rows.length === 0`. Adding a `method='totp'` row would always return false.
**How to avoid:** Use a separate `totp` table (not `auth` table). If the planner decides to follow the CONTEXT.md suggestion of `auth` table, `needsBootstrap()` must be updated to check `WHERE method = 'password' OR method = 'openid'`.
**Warning signs:** `needsBootstrap()` returning false on a fresh install after TOTP migration runs.

### Pitfall 4: Backup Running While SQLite is Being Written
**What goes wrong:** If backup starts at 2 AM during an active sync (unlikely but possible), a naive file copy produces a corrupt backup.
**Why it happens:** SQLite WAL mode allows concurrent readers but a raw `cp` skips WAL coordination.
**How to avoid:** Always use `db.backup(destPath)` from better-sqlite3, which coordinates with the WAL and produces a consistent snapshot. Never use `fs.copyFile` directly on a live SQLite database.
**Warning signs:** Using `fs.promises.copyFile` on `.sqlite` files instead of `db.backup()`.

### Pitfall 5: Budget File Discovery
**What goes wrong:** The backup needs to find all budget SQLite files under `/data`. The directory structure is `{ACTUAL_DATA_DIR}/{budget-uuid}/db.sqlite`. A hardcoded path will miss budgets or include unexpected files.
**Why it happens:** Budget directories are UUID-named subdirectories; there's no registry of them outside the filesystem.
**How to avoid:** Scan `ACTUAL_DATA_DIR` for subdirectories containing `db.sqlite`. Exclude the `backups/` directory itself from scanning to avoid recursive backup attempts.
**Warning signs:** Hardcoded paths, not scanning for `db.sqlite` dynamically.

### Pitfall 6: Recovery Codes Shown Once
**What goes wrong:** If recovery codes are regenerated or re-shown after enrollment, users may assume the old codes are still valid.
**Why it happens:** Poor state management of the enrollment flow.
**How to avoid:** The server never returns plaintext recovery codes after the initial enrollment response. The `/totp/setup` endpoint returns codes once; subsequent `/totp/status` calls return only `{ enrolled: true, recoveryCodesRemaining: N }`. The client must make this clear with "Download / Copy now — these will not be shown again" UI.
**Warning signs:** `/totp/status` returning plaintext codes.

---

## Code Examples

### TOTP Secret Generation and QR URI (otpauth 9.5.0)

```typescript
// Source: otpauth npm package docs (verified 2026-03-19)
import { TOTP } from 'otpauth';

// Generate a new TOTP secret for enrollment
export function generateTotpSecret(issuer: string, accountName: string) {
  const totp = new TOTP({
    issuer,
    label: accountName,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  // totp.secret is the base32-encoded secret
  // totp.toString() produces the otpauth:// URI for QR codes
  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

// Verify a TOTP code with 1-step window tolerance
export function verifyTotpCode(
  secret: string,
  code: string,
  lastUsedAt: number | null,
): { valid: boolean; usedAt: number } {
  const totp = new TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token: code, window: 1 });
  if (delta === null) return { valid: false, usedAt: lastUsedAt ?? 0 };

  // The period timestamp for replay prevention
  const periodTs = Math.floor(Date.now() / 1000 / 30) + delta;
  if (lastUsedAt !== null && periodTs === lastUsedAt) {
    return { valid: false, usedAt: lastUsedAt }; // replay
  }
  return { valid: true, usedAt: periodTs };
}
```

### QR Code Rendering (qrcode 1.5.4, server-side data URI)

```typescript
// Source: qrcode npm package (verified 2026-03-19)
import QRCode from 'qrcode';

// Called in /totp/setup endpoint — returns data URI for the client to render as <img>
export async function generateQrDataUri(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, { errorCorrectionLevel: 'M' });
}
```

### Backup Cron Registration in scheduler.ts

```typescript
// Extends existing startScheduler() — second cron.schedule() call
const backupSchedule = process.env.BACKUP_CRON_SCHEDULE ?? '0 2 * * *';
if (process.env.ENABLE_AUTO_BACKUP !== 'false') {
  cron.schedule(backupSchedule, () => {
    runBackup().catch(err => {
      logger.error('Backup cron failed', { error: err instanceof Error ? err.message : String(err) });
      triggerAlert({
        event_type: 'backup_failure',
        message: `Daily backup failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error',
      }).catch(() => {});
    });
  });
  logger.info('Auto-backup scheduled', { schedule: backupSchedule });
}
```

### SQLite Hot Backup via better-sqlite3

```typescript
// Source: better-sqlite3 docs + confirmed usage in index.electron.ts line 128
import Database from 'better-sqlite3';
import { promises as fsp } from 'node:fs';
import path from 'node:path';

export async function backupSqliteFile(srcPath: string, destPath: string): Promise<void> {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const db = new Database(srcPath, { readonly: true });
  try {
    await db.backup(destPath);
  } finally {
    db.close();
  }
}
```

### Audit Event Types Extension

```typescript
// audit.ts — add to AuditEventType union
export type AuditEventType =
  | 'login_success'
  | 'login_failure'
  | 'bootstrap'
  | 'password_change'
  | 'openid_auth'
  | 'eb_consent_auth'
  | 'eb_consent_expiry'
  | 'eb_consent_renewal'
  | 'eb_account_link'
  | 'totp_enrolled'       // NEW
  | 'totp_disabled'       // NEW
  | 'totp_verify_success' // NEW
  | 'totp_verify_failure' // NEW
  | 'totp_recovery_used'; // NEW
```

### Settings UI Pattern (mirroring AuthSettings.tsx)

```tsx
// TwoFactorSettings.tsx — follows exact same <Setting> pattern as AuthSettings.tsx
import { Setting } from './UI';
import { Button } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';

export function TwoFactorSettings() {
  // fetch /account/totp/status to get { enrolled, recoveryCodesRemaining }
  // if enrolled: show "Disable 2FA" button
  // if not enrolled: show "Enable 2FA" button that opens enrollment modal
  return (
    <Setting primaryAction={/* buttons */}>
      <Text><strong>Two-Factor Authentication</strong> adds a second verification
      step using an authenticator app.</Text>
    </Setting>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| speakeasy for TOTP | otpauth | ~2022 | otpauth is ESM-native, zero-dependency, actively maintained; speakeasy is unmaintained |
| File copy for SQLite backup | `db.backup()` API | better-sqlite3 v7+ | Atomic, WAL-safe; file copy risks corruption on active DBs |
| node-tar for archives | Node.js built-in streams | Node 18+ stable | No additional dependency for gzip compression |

---

## Open Questions

1. **`auth` table vs separate `totp` table**
   - What we know: CONTEXT.md says "Store TOTP secret encrypted in `auth` table with method='totp'". The `auth` table's structure supports this but `needsBootstrap()` queries the whole table.
   - What's unclear: Whether the planner intends to modify `needsBootstrap()` or use a separate table.
   - Recommendation: Use a separate `totp` table. Flag this to the planner — if `auth` table is chosen, `needsBootstrap()` must filter by `method IN ('password','openid')`.

2. **TOTP secret encryption key source**
   - What we know: Phase 5.2 uses `SECRET_KEY` env var for PBKDF2. The same infrastructure can derive a TOTP encryption key.
   - What's unclear: Whether the planner wants a dedicated `TOTP_ENCRYPTION_KEY` env var or to reuse `SECRET_KEY` with a distinct salt.
   - Recommendation: Reuse `SECRET_KEY` with a fixed domain-separation salt (`totp-secret-key`) to avoid requiring a new env var for existing deployments.

3. **Budget file discovery scope**
   - What we know: Budget files live at `{ACTUAL_DATA_DIR}/{uuid}/db.sqlite`. The `ACTUAL_DATA_DIR` env var is already used in the server.
   - What's unclear: Whether the backup should also archive metadata.json files alongside db.sqlite per budget.
   - Recommendation: Include `metadata.json` in the per-budget archive (needed for full restore). Reference `backups.ts` retention logic for prior art.

4. **Manual "Backup Now" button**
   - What we know: This is Claude's discretion per CONTEXT.md.
   - Recommendation: Include it. A `POST /account/backup/trigger` endpoint (authenticated, admin only) is low-complexity and high-value for users who want an on-demand snapshot before risky operations.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (sync-server); React Testing Library + Vitest (desktop-client) |
| Config file | `packages/sync-server/vitest.config.ts` |
| Quick run command | `yarn workspace @actual-app/sync-server test --run --reporter=verbose` |
| Full suite command | `yarn workspace @actual-app/sync-server test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| fc-1 | TOTP secret generation produces valid base32 + otpauth URI | unit | `yarn workspace @actual-app/sync-server test --run accounts/totp` | Wave 0 |
| fc-1 | `verifyTotpCode()` accepts valid code within 1-step window | unit | same | Wave 0 |
| fc-1 | `verifyTotpCode()` rejects replayed code (same period ts) | unit | same | Wave 0 |
| fc-1 | Recovery code generation produces 8 unique codes | unit | same | Wave 0 |
| fc-1 | Recovery code verification marks code consumed (single-use) | unit | same | Wave 0 |
| fc-1 | `/totp/setup` returns QR data URI + recovery codes | integration | same | Wave 0 |
| fc-1 | `/login` with TOTP enrolled returns `needsTotp: true` | integration | `yarn workspace @actual-app/sync-server test --run app-account` | Wave 0 |
| fc-1 | Failed TOTP calls `trackAuthFailure` | unit | same | Wave 0 |
| fc-1 | TOTP events appear in audit_log | unit | `yarn workspace @actual-app/sync-server test --run util/audit` | Exists |
| fc-2 | `backupSqliteFile()` creates file at dest path | unit | `yarn workspace @actual-app/sync-server test --run util/backup` | Wave 0 |
| fc-2 | `cleanOldBackups()` removes entries beyond 7-day retention | unit | same | Wave 0 |
| fc-2 | Backup failure triggers `backup_failure` alert | unit | same + `util/alerter` | Exists |
| fc-2 | Backup cron registers when `ENABLE_AUTO_BACKUP !== 'false'` | unit | `yarn workspace @actual-app/sync-server test --run scheduler` | Wave 0 |

### Sampling Rate
- **Per task commit:** `yarn workspace @actual-app/sync-server test --run`
- **Per wave merge:** same (full suite is fast — all unit tests, no external deps)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `packages/sync-server/src/accounts/totp.test.ts` — covers fc-1 unit tests
- [ ] `packages/sync-server/src/util/backup.test.ts` — covers fc-2 unit tests
- [ ] `packages/sync-server/src/util/backup-migrations.ts` — `totp` table migration (idempotent, same pattern as `audit-migrations.ts`)

---

## Sources

### Primary (HIGH confidence)
- `packages/sync-server/src/accounts/password.ts` — login flow, bcrypt usage, session creation
- `packages/sync-server/src/account-db.ts` — `auth` table schema, `needsBootstrap()`, session management
- `packages/sync-server/src/app-account.ts` — endpoint patterns, audit log calls, `trackAuthFailure()`
- `packages/sync-server/src/util/audit.ts` — `AuditEventType`, `writeAuditLog()` signature
- `packages/sync-server/src/util/alerter.ts` — `triggerAlert()` signature, `event_type: string`
- `packages/sync-server/src/scheduler.ts` — node-cron pattern, `startScheduler()` structure
- `packages/sync-server/src/db.ts` — `WrappedDatabase` interface, better-sqlite3 wrapper
- `packages/loot-core/src/platform/server/sqlite/index.electron.ts` — `db.backup()` API usage confirmed at line 128
- `packages/loot-core/src/server/budgetfiles/backups.ts` — client-side backup retention pattern
- `packages/desktop-client/src/components/settings/AuthSettings.tsx` — Settings UI pattern to mirror
- npm registry (2026-03-19): `otpauth@9.5.0`, `qrcode@1.5.4`, `@types/qrcode@1.5.6`

### Secondary (MEDIUM confidence)
- otpauth README pattern for `TOTP.validate({ token, window })` — standard library usage
- better-sqlite3 `.backup()` async API — confirmed by working usage in index.electron.ts

### Tertiary (LOW confidence)
- Node.js built-in stream pipeline for tar.gz — standard Node.js, not verified against a specific version; Node 22 (project base image) fully supports it

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against npm registry; existing deps confirmed in package.json
- Architecture: HIGH — derived directly from reading existing source files (password.ts, scheduler.ts, app-account.ts, account-db.ts)
- Pitfalls: HIGH — `needsBootstrap()` collision risk confirmed by reading source; replay attack pattern standard TOTP knowledge; backup corruption risk confirmed by better-sqlite3 docs pattern

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable libraries, no fast-moving ecosystem)
