---
phase: 09-feature-expansion
reviewed: 2026-05-23T12:30:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - packages/sync-server/src/accounts/totp.ts
  - packages/sync-server/src/accounts/totp.test.ts
  - packages/sync-server/src/util/audit.ts
  - packages/sync-server/src/util/audit-migrations.ts
  - packages/sync-server/src/app-account.ts
  - packages/sync-server/src/util/backup.ts
  - packages/sync-server/src/util/backup.test.ts
  - packages/sync-server/src/scheduler.ts
  - packages/sync-server/src/util/metrics.ts
  - packages/desktop-client/src/components/settings/TwoFactorSettings.tsx
  - packages/desktop-client/src/components/settings/BackupStatus.tsx
  - packages/loot-core/src/server/auth/app.ts
  - packages/desktop-client/src/components/manager/subscribe/Login.tsx
  - packages/desktop-client/src/components/settings/index.tsx
findings:
  critical: 4
  warning: 7
  info: 3
  total: 14
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-05-23T12:30:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

This review covers the feature expansion phase which adds two-factor authentication (TOTP/2FA), server-side automated backups, scheduled sync with retry logic, audit logging, and metrics collection. The implementation includes server-side endpoints, client-side UI components, and a client-server bridge layer.

The most severe issue found is a **complete break in the TOTP enrollment flow**: the client never sends the `setupToken` that the server requires to finalize enrollment, meaning 2FA setup will always fail at the verification step. Additional blockers include unbounded in-memory maps that can be exploited for denial of service and silent data corruption in backup archives for long file paths.

## Critical Issues

### CR-01: TOTP Enrollment Always Fails -- Client Omits setupToken

**File:** `packages/loot-core/src/server/auth/app.ts:509-511`
**Issue:** The `totpVerifySetup` function sends only `{ code }` to the server's `/totp/verify-setup` endpoint. However, the server at `packages/sync-server/src/app-account.ts:450` destructures `{ code, setupToken }` from `req.body` and uses `setupToken` to look up the pending enrollment from `pendingTotpSetup` Map. Since `setupToken` is always `undefined` on the client side, the server always returns `no-pending-totp-setup`. The `TwoFactorSettings.tsx` component at line 76 also only sends `{ code: verifyCode }` and its `SetupData` type (lines 21-25) does not even include `setupToken`, despite the server returning it in the `/totp/setup` response (line 439). This means **TOTP enrollment is completely broken** -- users can start setup but can never confirm it.

**Fix:**

In `packages/desktop-client/src/components/settings/TwoFactorSettings.tsx`, add `setupToken` to the `SetupData` type and pass it through:

```typescript
type SetupData = {
  qrCodeUri: string;
  secret: string;
  recoveryCodes: string[];
  setupToken: string;  // Add this
};

// In onVerifySetup (line 76):
const res = await send('totp-verify-setup', {
  code: verifyCode,
  setupToken: setupData.setupToken,  // Add this
});
```

In `packages/loot-core/src/server/auth/app.ts`, update the function signature and POST body:

```typescript
async function totpVerifySetup({ code, setupToken }: { code: string; setupToken: string }) {
  // ...
  await post(
    serverConfig.SIGNUP_SERVER + '/totp/verify-setup',
    { code, setupToken },  // Add setupToken
    { 'X-ACTUAL-TOKEN': userToken },
  );
  // ...
}
```

### CR-02: pendingTotpSetup Map Has No TTL -- Memory Leak and Stale Entry Abuse

**File:** `packages/sync-server/src/app-account.ts:399-402`
**Issue:** The `pendingTotpSetup` Map stores TOTP secrets and recovery code hashes in memory with no expiry mechanism. Unlike the `totpNonces` map which has expired-nonce cleanup on each `/totp/challenge` access (lines 326-329), `pendingTotpSetup` entries are never cleaned up unless `/totp/verify-setup` is successfully called. An attacker who can authenticate can repeatedly call `POST /totp/setup` to fill this map. While `MAX_NONCES` (100) limits `totpNonces`, there is **no equivalent limit** on `pendingTotpSetup`. Each entry stores the raw TOTP secret and 8 bcrypt recovery code hashes -- sensitive material that persists indefinitely in server memory.

**Fix:**

Add TTL and size bounds to `pendingTotpSetup`, mirroring the pattern used for `totpNonces`:

```typescript
const MAX_PENDING_SETUPS = 50;
const PENDING_SETUP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// In the /totp/setup handler, before creating a new entry:
const now = Date.now();
for (const [k, v] of pendingTotpSetup) {
  if (v.createdAt < now - PENDING_SETUP_TTL_MS) pendingTotpSetup.delete(k);
}
if (pendingTotpSetup.size >= MAX_PENDING_SETUPS) {
  const oldest = pendingTotpSetup.keys().next().value!;
  pendingTotpSetup.delete(oldest);
}

// Add createdAt to stored entries:
pendingTotpSetup.set(setupToken, {
  secret: secret.secret,
  recoveryHashes: recoveryCodes.hashes,
  recoveryCodes: recoveryCodes.codes,
  createdAt: Date.now(),
});
```

### CR-03: Backup Archive Silently Truncates File Paths Over 100 Characters

**File:** `packages/sync-server/src/util/backup.ts:240`
**Issue:** The custom tar header writer truncates the file name field to 100 bytes (POSIX tar limit) via `file.relativePath.slice(0, 100)`. For budget directories with UUID-based names (e.g., `user-files/some-long-budget-uuid-name-that-goes-beyond/db.sqlite`), paths exceeding 100 characters will be silently truncated, producing a corrupted archive where files cannot be extracted to their correct locations. The ustar format supports extended path headers (prefix field at offset 345 for up to 256 total chars), but neither the prefix field nor GNU long-name extensions are implemented. There is no validation or error when truncation occurs, so backups appear successful but may be unrestorable.

**Fix:**

At minimum, throw an error if any path exceeds the 100-char limit so the operator is alerted:

```typescript
if (file.relativePath.length > 100) {
  throw new Error(
    `Backup path exceeds 100 characters (tar limit): ${file.relativePath}. ` +
    `Consider using a tar library (e.g., tar-stream) for long path support.`
  );
}
```

Or better, implement the ustar prefix field (offset 345, 155 bytes) which allows paths up to 256 characters by splitting directory prefix from filename.

### CR-04: TOTP Nonce Not Invalidated on Failed Attempts -- Unlimited Brute-Force Window

**File:** `packages/sync-server/src/app-account.ts:322-395`
**Issue:** When a TOTP challenge fails (both TOTP code and recovery code invalid), the nonce is NOT deleted from the `totpNonces` map (line 394 sends error but the nonce persists). The nonce has a 5-minute TTL (`TOTP_NONCE_TTL_MS = 5 * 60 * 1000`). Within that window, an attacker who has the nonce value can attempt unlimited TOTP codes. The `trackAuthFailure` rate limiter only fires an alert after 3 failures and then resets the counter (line 74: `authFailureTracker.delete(ip)`), providing no actual blocking -- just alerting with a cooldown that resets the counter each time. A 6-digit TOTP code has 1,000,000 possible values; at high request rates over 5 minutes, brute-forcing is feasible.

**Fix:**

Either invalidate the nonce after N failed attempts, or invalidate on first failure:

```typescript
// Option 1: Add attempt counter to nonce entry
// In totpNonces Map value type, add: attempts: number
// After failed verification:
nonceEntry.attempts = (nonceEntry.attempts ?? 0) + 1;
if (nonceEntry.attempts >= 3) {
  totpNonces.delete(totpNonce);
}

// Option 2: Invalidate on first failure (strictest)
totpNonces.delete(totpNonce);
```

## Warnings

### WR-01: BACKUP_CRON_SCHEDULE Environment Variable Not Validated

**File:** `packages/sync-server/src/scheduler.ts:307`
**Issue:** The `BACKUP_CRON_SCHEDULE` environment variable is passed directly to `cron.schedule()` without validation. An invalid cron expression will cause `node-cron` to throw at schedule registration time, potentially crashing the server or silently failing to register the backup schedule depending on error handling upstream. While not a direct security issue, this is a reliability concern since the error would only surface at startup, not at configuration time.

**Fix:**

```typescript
const backupSchedule = process.env.BACKUP_CRON_SCHEDULE ?? '0 2 * * *';
if (!cron.validate(backupSchedule)) {
  logger.error('Invalid BACKUP_CRON_SCHEDULE, falling back to default', {
    provided: backupSchedule,
  });
  backupSchedule = '0 2 * * *';
}
```

### WR-02: Auth Failure Tracker Resets Counter After Alert -- No Actual Rate Limiting

**File:** `packages/sync-server/src/app-account.ts:55-76`
**Issue:** The `trackAuthFailure` function is designed to detect authentication brute-force, but after reaching the threshold (3 failures), it fires an alert and then **deletes the IP entry** (line 74). This means the attacker gets another 3 free attempts immediately, then another alert, then 3 more, etc. The function provides monitoring/alerting but zero rate limiting or lockout. Combined with CR-04 (unlimited TOTP attempts on a valid nonce), this provides no defense against brute-force attacks.

**Fix:**

Instead of deleting, set a lockout timestamp. Return a boolean indicating whether the IP should be blocked:

```typescript
function trackAuthFailure(ip: string): boolean {
  const now = Date.now();
  const entry = authFailureTracker.get(ip);
  if (!entry || now - entry.windowStart > AUTH_FAILURE_WINDOW_MS) {
    // ... create new entry
    return false;
  }
  entry.count++;
  if (entry.count >= AUTH_FAILURE_THRESHOLD) {
    triggerAlert(/* ... */);
    // Don't delete -- keep tracking. Return true to signal blocking.
    return true;
  }
  return false;
}
```

### WR-03: Replay Prevention Uses Equality Check Only -- Allows Past-Period Codes

**File:** `packages/sync-server/src/accounts/totp.ts:64`
**Issue:** The replay prevention check `periodTs === lastUsedAt` only prevents reuse of the exact same TOTP period. With `window: 1` at line 53, codes from the previous 30-second period are also accepted. If a user logs in with a current-period code (`periodTs = P`), `lastUsedAt` is set to `P`. An attacker who captured the code can then attempt it in the next period -- the old code would validate against the previous window (delta = -1), producing `periodTs = P` which equals `lastUsedAt` and is correctly rejected. However, the reverse is not handled: if `lastUsedAt = P` and a code from `P-1` (via window) is submitted, `periodTs = P-1` which does NOT equal `P`, so it passes. This means a previously-valid code from one period earlier can be replayed once.

**Fix:**

Use `<=` instead of `===` to prevent codes from any period at or before the last used one:

```typescript
if (lastUsedAt !== null && periodTs <= lastUsedAt) {
  return { valid: false, usedAt: lastUsedAt };
}
```

### WR-04: Hardcoded Salt for TOTP Key Derivation

**File:** `packages/sync-server/src/accounts/totp.ts:120`
**Issue:** The PBKDF2 salt for TOTP secret encryption is hardcoded as the string `'totp-secret-encryption'`. This means all server instances using the same `ACTUAL_SERVER_ENCRYPTION_KEY` or `SECRET_KEY` will derive the identical encryption key. A better practice is to use a unique, randomly generated salt stored alongside the encrypted data. The current approach weakens the key derivation against precomputation attacks targeting known Actual Budget installations.

**Fix:**

Generate a random salt per encryption, store it with the ciphertext:

```typescript
function encryptTotpSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(keyMaterial, salt, 100000, 32, 'sha256');
  // ... encrypt ...
  return JSON.stringify({
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // ...
  });
}
```

### WR-05: getTotpStatus and getStoredTotpSecret Use LIMIT 1 Without User Filtering

**File:** `packages/sync-server/src/accounts/totp.ts:203,220`
**Issue:** Both `getTotpStatus()` and `getStoredTotpSecret()` query `SELECT ... FROM totp LIMIT 1` without filtering by `user_id`. The `totp` table schema has a `user_id UNIQUE` column suggesting multi-user support. If multiple users enroll TOTP (e.g., in a future multi-user mode), these functions would return the first row (arbitrary in SQLite without ORDER BY), checking the wrong user's TOTP secret. Currently `enrollTotp` hardcodes `'default-user'` at line 466, but the schema supports multiple users.

**Fix:**

Accept a `userId` parameter and filter by it:

```typescript
export function getStoredTotpSecret(userId = 'default-user') {
  const db = getAccountDb();
  const row = db.first(
    'SELECT secret_enc, last_used_at FROM totp WHERE user_id = ?',
    [userId],
  ) as { ... } | null;
  // ...
}
```

### WR-06: console.debug in Production Code

**File:** `packages/sync-server/src/app-account.ts:137`
**Issue:** `console.debug('HEADER VALUE: ' + obfuscated)` uses `console.debug` instead of the project's structured `logger` module, which is imported and used everywhere else in this file. While the value is obfuscated, `console.debug` bypasses any log level filtering, structured logging, and log routing configured for the application.

**Fix:**

```typescript
logger.debug('Header login attempt', { obfuscated });
```

### WR-07: getLatencyPercentiles Mutates Shared Array via sort()

**File:** `packages/sync-server/src/util/metrics.ts:19-20`
**Issue:** `Array.from(latencySamples.subarray(0, latencyCount))` creates a new array, but `.sort()` on line 20 mutates the `active` array in-place. While this specific instance creates a copy first (so the source Float64Array is safe), there is a subtler issue: if `getLatencyPercentiles` is called concurrently (e.g., two API requests), both calls would be operating on separate copies, which is correct. However, the percentile calculation `sorted[Math.floor((sorted.length * pct) / 100)]` for p99 on small sample sizes (e.g., 1 sample) computes `Math.floor(1 * 99 / 100) = 0`, which is fine. For 100 samples: `Math.floor(100 * 99 / 100) = 99` -- the last index. For 101 samples: `Math.floor(101 * 99 / 100) = 99`. This is acceptable. However, the fallback `?? sorted[sorted.length - 1]` can return `undefined` if `sorted` is empty, because the `latencyCount === 0` check returns early. This is a minor robustness concern for the sort-in-place pattern used without `toSorted()`.

**Fix:**

Use `toSorted` for clarity and immutability (Node 20+):

```typescript
const sorted = active.toSorted((a, b) => a - b);
```

## Info

### IN-01: Recovery Code Uniqueness Not Guaranteed

**File:** `packages/sync-server/src/accounts/totp.ts:83-84`
**Issue:** `generateRecoveryCodes` generates 8 codes using `crypto.randomBytes(6)` (6 bytes = 48 bits of entropy per code). While collisions are astronomically unlikely (2^48 possibilities per code, 8 codes), there is no uniqueness check. The test at line 164 asserts uniqueness via `Set`, which is good.

**Fix:** No code change needed -- the entropy is sufficient. Noting for completeness.

### IN-02: Backup Test getBackupStatus Has Shared Module State Across Tests

**File:** `packages/sync-server/src/util/backup.test.ts:289-293`
**Issue:** The test comment at line 290 acknowledges `"this test may see state from runBackup tests above"` and only verifies shape, not values. The `backupStatus` module-level object in `backup.ts` persists across test cases, making test ordering matter. The test works around this but it is fragile.

**Fix:** Export a `_resetBackupStatus()` function (similar to `_resetMetrics` in metrics.ts) and call it in `beforeEach`.

### IN-03: Unused t() Import in BackupStatus Component

**File:** `packages/desktop-client/src/components/settings/BackupStatus.tsx:2,44`
**Issue:** `useTranslation` is imported and destructured as `const { t } = useTranslation()` at line 44, but `t()` is only used in the `onTriggerBackup` function (line 85) and `formatRelativeTime` uses hardcoded English strings ("just now", "minute", "hour", "day") at lines 31-41 without translation. This is inconsistent with the i18n pattern -- the relative time strings should be wrapped in `t()` or `<Trans>`.

**Fix:**

Wrap relative time strings in `t()` for i18n consistency:

```typescript
function formatRelativeTime(epochMs: number, t: TFunction): string {
  const diffMs = Date.now() - epochMs;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t('just now');
  // ...
}
```

---

_Reviewed: 2026-05-23T12:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
