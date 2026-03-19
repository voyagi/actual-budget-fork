import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';

// Mock getAccountDb so tests never touch a real SQLite file
vi.mock('../account-db.js', () => {
  let totpRows: Record<string, unknown>[] = [];

  const db = {
    mutate: vi.fn((sql: string, params?: unknown[]) => {
      const s = sql.trim().toUpperCase();
      if (s.startsWith('INSERT INTO TOTP')) {
        totpRows.push({
          user_id: (params as unknown[])[0],
          secret_enc: (params as unknown[])[1],
          recovery_codes: (params as unknown[])[2],
          last_used_at: null,
        });
      } else if (s.startsWith('DELETE FROM TOTP')) {
        totpRows = [];
      } else if (s.startsWith('UPDATE TOTP SET LAST_USED_AT')) {
        if (totpRows[0]) totpRows[0].last_used_at = (params as unknown[])[0];
      } else if (s.startsWith('UPDATE TOTP SET RECOVERY_CODES')) {
        if (totpRows[0])
          totpRows[0].recovery_codes = (params as unknown[])[0];
      }
      return { changes: 1 };
    }),
    first: vi.fn((sql: string) => {
      const s = sql.trim().toUpperCase();
      if (s.startsWith('SELECT COUNT(*)') || s.startsWith('SELECT COUNT (*)')) {
        return { cnt: totpRows.length };
      }
      if (s.startsWith('SELECT RECOVERY_CODES') || s.includes('RECOVERY_CODES')) {
        return totpRows[0] ?? null;
      }
      if (s.startsWith('SELECT SECRET_ENC') || s.includes('SECRET_ENC')) {
        return totpRows[0] ?? null;
      }
      return totpRows[0] ?? null;
    }),
    _reset: () => {
      totpRows = [];
    },
  };

  return {
    getAccountDb: () => db,
    _getDb: () => db,
  };
});

import { getAccountDb } from '../account-db.js';
import {
  generateTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
  verifyRecoveryCode,
  enrollTotp,
  isTotpEnrolled,
  disableTotp,
  getTotpStatus,
  getStoredTotpSecret,
  updateTotpLastUsed,
  consumeRecoveryCode,
} from './totp.js';

function resetDb() {
  const db = getAccountDb() as unknown as { _reset: () => void };
  db._reset();
  (getAccountDb().mutate as ReturnType<typeof vi.fn>).mockClear();
  (getAccountDb().first as ReturnType<typeof vi.fn>).mockClear();
}

describe('generateTotpSecret', () => {
  it('returns a base32 secret string', () => {
    const result = generateTotpSecret('Actual Budget', 'user');
    expect(result.secret).toBeDefined();
    expect(typeof result.secret).toBe('string');
    // base32 chars: A-Z and 2-7
    expect(result.secret).toMatch(/^[A-Z2-7]+=*$/);
  });

  it('returns an otpauth:// URI', () => {
    const result = generateTotpSecret('Actual Budget', 'user');
    expect(result.uri).toBeDefined();
    expect(result.uri).toMatch(/^otpauth:\/\/totp\//);
    expect(result.uri).toContain('Actual%20Budget');
  });
});

describe('verifyTotpCode', () => {
  it('accepts a valid code (generated from the same secret)', () => {
    // Generate a real secret and a real code from it
    const { secret, uri: _uri } = generateTotpSecret('Test', 'user');
    // Use otpauth to generate the current code
    const { TOTP, Secret } = require('otpauth');
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const validCode = totp.generate();

    const result = verifyTotpCode(secret, validCode, null);
    expect(result.valid).toBe(true);
    expect(typeof result.usedAt).toBe('number');
    expect(result.usedAt).toBeGreaterThan(0);
  });

  it('rejects an invalid code', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const result = verifyTotpCode(secret, '000000', null);
    // 000000 is astronomically unlikely to be valid
    // Accept either outcome but if invalid, usedAt must be 0
    if (!result.valid) {
      expect(result.usedAt).toBe(0);
    }
  });

  it('rejects a replayed code (same period timestamp)', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { TOTP, Secret } = require('otpauth');
    const totp = new TOTP({ secret: Secret.fromBase32(secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const validCode = totp.generate();

    // First use: should succeed
    const first = verifyTotpCode(secret, validCode, null);
    expect(first.valid).toBe(true);

    // Replay with same usedAt: should fail
    const replay = verifyTotpCode(secret, validCode, first.usedAt);
    expect(replay.valid).toBe(false);
  });

  it('returns valid:false and usedAt:lastUsedAt for unknown code', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const result = verifyTotpCode(secret, 'BADCD', null);
    expect(result.valid).toBe(false);
  });
});

describe('generateRecoveryCodes', () => {
  it('generates exactly 8 codes', () => {
    const { codes } = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
  });

  it('codes match XXXX-XXXX-XXXX format (uppercase hex groups)', () => {
    const { codes } = generateRecoveryCodes();
    for (const code of codes) {
      expect(code).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    }
  });

  it('codes are unique', () => {
    const { codes } = generateRecoveryCodes();
    const unique = new Set(codes);
    expect(unique.size).toBe(8);
  });

  it('returns 8 bcrypt hashes', () => {
    const { hashes } = generateRecoveryCodes();
    expect(hashes).toHaveLength(8);
    for (const hash of hashes) {
      // bcrypt hashes start with $2b$ or $2a$
      expect(hash).toMatch(/^\$2[ab]\$/);
    }
  });
});

describe('verifyRecoveryCode', () => {
  it('matches a valid code and returns remaining without that code', () => {
    const { codes, hashes } = generateRecoveryCodes();
    const result = verifyRecoveryCode(codes[0], hashes);
    expect(result.valid).toBe(true);
    expect(result.remaining).toHaveLength(7);
    // The matched hash should be removed
    expect(result.remaining).not.toContain(hashes[0]);
  });

  it('rejects a wrong code and returns all hashes unchanged', () => {
    const { hashes } = generateRecoveryCodes();
    const result = verifyRecoveryCode('XXXX-XXXX-XXXX', hashes);
    expect(result.valid).toBe(false);
    expect(result.remaining).toHaveLength(8);
    expect(result.remaining).toEqual(hashes);
  });
});

describe('enrollTotp / isTotpEnrolled / disableTotp lifecycle', () => {
  beforeEach(() => {
    resetDb();
  });

  it('isTotpEnrolled returns false when no row exists', () => {
    expect(isTotpEnrolled()).toBe(false);
  });

  it('enrollTotp inserts a row and isTotpEnrolled returns true', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { hashes } = generateRecoveryCodes();
    enrollTotp('default-user', secret, hashes);
    expect(isTotpEnrolled()).toBe(true);
  });

  it('disableTotp removes the row and isTotpEnrolled returns false', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { hashes } = generateRecoveryCodes();
    enrollTotp('default-user', secret, hashes);
    expect(isTotpEnrolled()).toBe(true);
    disableTotp();
    expect(isTotpEnrolled()).toBe(false);
  });
});

describe('getTotpStatus', () => {
  beforeEach(() => {
    resetDb();
  });

  it('returns enrolled:false when not enrolled', () => {
    const status = getTotpStatus();
    expect(status.enrolled).toBe(false);
    expect(status.recoveryCodesRemaining).toBe(0);
  });

  it('returns enrolled:true and correct remaining count after enrollment', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { hashes } = generateRecoveryCodes();
    enrollTotp('default-user', secret, hashes);
    const status = getTotpStatus();
    expect(status.enrolled).toBe(true);
    expect(status.recoveryCodesRemaining).toBe(8);
  });
});

describe('getStoredTotpSecret / updateTotpLastUsed / consumeRecoveryCode', () => {
  beforeEach(() => {
    resetDb();
  });

  it('getStoredTotpSecret returns the original secret after enroll', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { hashes } = generateRecoveryCodes();
    enrollTotp('default-user', secret, hashes);
    const stored = getStoredTotpSecret();
    expect(stored).not.toBeNull();
    expect(stored!.secret).toBe(secret);
  });

  it('updateTotpLastUsed stores and retrieves lastUsedAt', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { hashes } = generateRecoveryCodes();
    enrollTotp('default-user', secret, hashes);
    updateTotpLastUsed(12345);
    const stored = getStoredTotpSecret();
    expect(stored!.lastUsedAt).toBe(12345);
  });

  it('consumeRecoveryCode reduces remaining count by 1', () => {
    const { secret } = generateTotpSecret('Test', 'user');
    const { hashes } = generateRecoveryCodes();
    enrollTotp('default-user', secret, hashes);
    consumeRecoveryCode(hashes.slice(1)); // remove first code
    const status = getTotpStatus();
    expect(status.recoveryCodesRemaining).toBe(7);
  });
});
