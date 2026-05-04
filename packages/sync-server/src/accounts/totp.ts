// [eb] TOTP/2FA module for two-factor authentication.
// Provides secret generation, code verification with replay prevention,
// recovery codes, AES-256-GCM encrypted storage, and database operations.

import * as crypto from 'node:crypto';

import * as bcrypt from 'bcrypt';
import { TOTP, Secret } from 'otpauth';

import { getAccountDb } from '../account-db.js';

// ---------------------------------------------------------------------------
// TOTP Secret Generation
// ---------------------------------------------------------------------------

export function generateTotpSecret(
  issuer: string,
  label: string,
): { secret: string; uri: string } {
  const totp = new TOTP({
    issuer,
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

// ---------------------------------------------------------------------------
// TOTP Code Verification (with replay prevention)
// ---------------------------------------------------------------------------

export function verifyTotpCode(
  secretBase32: string,
  code: string,
  lastUsedAt: number | null,
): { valid: boolean; usedAt: number } {
  const totp = new TOTP({
    secret: Secret.fromBase32(secretBase32),
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });

  const delta = totp.validate({ token: code, window: 1 });

  if (delta === null) {
    return { valid: false, usedAt: lastUsedAt ?? 0 };
  }

  // Compute the period timestamp for replay prevention.
  // Floor of (now in seconds / 30) gives the current period index,
  // delta adjusts for the ±1 window.
  const periodTs = Math.floor(Date.now() / 1000 / 30) + delta;

  if (lastUsedAt !== null && periodTs === lastUsedAt) {
    // Replay attack: same TOTP period already used
    return { valid: false, usedAt: lastUsedAt };
  }

  return { valid: true, usedAt: periodTs };
}

// ---------------------------------------------------------------------------
// Recovery Code Generation and Verification
// ---------------------------------------------------------------------------

export function generateRecoveryCodes(): {
  codes: string[];
  hashes: string[];
} {
  const codes: string[] = [];
  const hashes: string[] = [];

  for (let i = 0; i < 8; i++) {
    // 6 random bytes = 12 hex chars, formatted as XXXX-XXXX-XXXX
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    codes.push(code);
    // Hash the formatted code (with dashes) for consistent comparison
    hashes.push(bcrypt.hashSync(code, 10));
  }

  return { codes, hashes };
}

export function verifyRecoveryCode(
  submitted: string,
  hashedCodes: string[],
): { valid: boolean; remaining: string[] } {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (bcrypt.compareSync(submitted, hashedCodes[i])) {
      return {
        valid: true,
        remaining: hashedCodes.filter((_, idx) => idx !== i),
      };
    }
  }
  return { valid: false, remaining: hashedCodes };
}

// ---------------------------------------------------------------------------
// TOTP Secret Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

function deriveEncryptionKey(): Buffer {
  const keyMaterial =
    process.env.ACTUAL_SERVER_ENCRYPTION_KEY ??
    process.env.SECRET_KEY ??
    'actual-totp-default-key';
  const salt = 'totp-secret-encryption';
  return crypto.pbkdf2Sync(keyMaterial, salt, 100000, 32, 'sha256');
}

function encryptTotpSecret(secret: string): string {
  const key = deriveEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: 16,
  });
  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  });
}

function decryptTotpSecret(encrypted: string): string {
  const key = deriveEncryptionKey();
  const { iv, authTag, ciphertext } = JSON.parse(encrypted) as {
    iv: string;
    authTag: string;
    ciphertext: string;
  };
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(iv, 'base64'),
    { authTagLength: 16 },
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return (
    decipher.update(Buffer.from(ciphertext, 'base64')).toString('utf8') +
    decipher.final('utf8')
  );
}

// ---------------------------------------------------------------------------
// Database Operations
// ---------------------------------------------------------------------------

export function enrollTotp(
  userId: string,
  secretBase32: string,
  recoveryCodeHashes: string[],
): void {
  const db = getAccountDb();
  const secretEnc = encryptTotpSecret(secretBase32);
  db.mutate(
    'INSERT INTO totp (user_id, secret_enc, recovery_codes) VALUES (?, ?, ?)',
    [userId, secretEnc, JSON.stringify(recoveryCodeHashes)],
  );
}

export function isTotpEnrolled(): boolean {
  const db = getAccountDb();
  const row = db.first('SELECT count(*) as cnt FROM totp') as {
    cnt: number;
  } | null;
  return (row?.cnt ?? 0) > 0;
}

export function disableTotp(): void {
  const db = getAccountDb();
  db.mutate('DELETE FROM totp');
}

export function getTotpStatus(): {
  enrolled: boolean;
  recoveryCodesRemaining: number;
} {
  const db = getAccountDb();
  const row = db.first('SELECT recovery_codes FROM totp LIMIT 1') as {
    recovery_codes: string;
  } | null;

  if (!row) {
    return { enrolled: false, recoveryCodesRemaining: 0 };
  }

  const parsed = JSON.parse(row.recovery_codes) as string[];
  return { enrolled: true, recoveryCodesRemaining: parsed.length };
}

export function getStoredTotpSecret(): {
  secret: string;
  lastUsedAt: number | null;
} | null {
  const db = getAccountDb();
  const row = db.first(
    'SELECT secret_enc, last_used_at FROM totp LIMIT 1',
  ) as { secret_enc: string; last_used_at: number | null } | null;

  if (!row) {
    return null;
  }

  return {
    secret: decryptTotpSecret(row.secret_enc),
    lastUsedAt: row.last_used_at,
  };
}

export function updateTotpLastUsed(usedAt: number): void {
  const db = getAccountDb();
  db.mutate('UPDATE totp SET last_used_at = ?', [usedAt]);
}

export function consumeRecoveryCode(remaining: string[]): void {
  const db = getAccountDb();
  db.mutate('UPDATE totp SET recovery_codes = ?', [JSON.stringify(remaining)]);
}
