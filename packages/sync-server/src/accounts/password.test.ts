import * as bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountDb } from '../account-db';

import {
  bootstrapPassword,
  changePassword,
  loginWithPassword,
} from './password';

vi.mock('../account-db', () => {
  let authRows: { method: string; extra_data: string; active: number }[] = [];
  let sessionRows: { token: string; user_id: string; auth_method: string }[] =
    [];
  let userRows: { id: string; user_name: string }[] = [];

  const db = {
    transaction: vi.fn((fn: () => void) => fn()),
    mutate: vi.fn((sql: string, params: unknown[] = []) => {
      const s = sql.trim().toUpperCase();

      if (s.startsWith('DELETE FROM AUTH WHERE METHOD')) {
        authRows = authRows.filter(row => row.method !== params[0]);
      } else if (s.startsWith('UPDATE AUTH SET ACTIVE')) {
        authRows = authRows.map(row => ({ ...row, active: 0 }));
      } else if (s.startsWith('INSERT INTO AUTH')) {
        authRows.push({
          method: 'password',
          extra_data: params[0] as string,
          active: 1,
        });
      } else if (s.startsWith('UPDATE AUTH SET EXTRA_DATA')) {
        authRows = authRows.map(row =>
          row.method === 'password'
            ? { ...row, extra_data: params[0] as string }
            : row,
        );
      } else if (s.startsWith('INSERT INTO USERS')) {
        userRows.push({
          id: params[0] as string,
          user_name: params[1] as string,
        });
      } else if (s.startsWith('INSERT INTO SESSIONS')) {
        sessionRows.push({
          token: params[0] as string,
          user_id: params[2] as string,
          auth_method: params[3] as string,
        });
      } else if (s.startsWith('UPDATE SESSIONS')) {
        sessionRows = sessionRows.map(row =>
          row.token === params[2]
            ? { ...row, user_id: params[0] as string }
            : row,
        );
      }
    }),
    first: vi.fn((sql: string, params: unknown[] = []) => {
      const s = sql.trim().toUpperCase();

      if (s.startsWith('SELECT EXTRA_DATA FROM AUTH WHERE METHOD')) {
        return authRows.find(row => row.method === params[0]) ?? null;
      }

      if (s.startsWith('SELECT * FROM SESSIONS WHERE AUTH_METHOD')) {
        return sessionRows.find(row => row.auth_method === params[0]) ?? null;
      }

      if (s.startsWith('SELECT COUNT(*) AS TOTALOFUSERS FROM USERS')) {
        return { totalOfUsers: userRows.length };
      }

      if (s.startsWith('SELECT ID FROM USERS WHERE USER_NAME')) {
        return userRows.find(row => row.user_name === params[0]) ?? null;
      }

      return null;
    }),
    _reset: () => {
      authRows = [];
      sessionRows = [];
      userRows = [{ id: 'default-user', user_name: '' }];
    },
    _seedPasswordHash: (passwordHash: string) => {
      authRows = [{ method: 'password', extra_data: passwordHash, active: 1 }];
    },
    _getPasswordHash: () =>
      authRows.find(row => row.method === 'password')?.extra_data,
  };

  return {
    clearExpiredSessions: vi.fn(),
    getAccountDb: () => db,
  };
});

vi.mock('../load-config', () => ({
  config: {
    get: vi.fn((key: string) => (key === 'token_expiration' ? 'never' : null)),
  },
}));

function getMockDb() {
  return getAccountDb() as unknown as {
    _reset: () => void;
    _seedPasswordHash: (passwordHash: string) => void;
    _getPasswordHash: () => string | undefined;
  };
}

describe('password strength checks', () => {
  beforeEach(() => {
    getMockDb()._reset();
  });

  it('rejects bootstrap passwords shorter than 8 characters', () => {
    expect(bootstrapPassword('short')).toEqual({
      error: 'password-too-short',
    });
  });

  it('accepts bootstrap passwords with at least 8 characters', () => {
    expect(bootstrapPassword('long-enough')).toEqual({});
    expect(getMockDb()._getPasswordHash()).toBeDefined();
  });

  it('rejects password changes shorter than 8 characters', () => {
    expect(changePassword('short')).toEqual({
      error: 'password-too-short',
    });
  });

  it('accepts password changes with at least 8 characters', () => {
    getMockDb()._seedPasswordHash(bcrypt.hashSync('old-password', 4));

    expect(changePassword('new-password')).toEqual({});

    const passwordHash = getMockDb()._getPasswordHash();
    expect(passwordHash).toBeDefined();
    if (passwordHash == null) {
      throw new Error('Password hash was not stored');
    }
    expect(bcrypt.compareSync('new-password', passwordHash)).toBe(true);
  });

  it('allows login with an existing short password hash', () => {
    getMockDb()._seedPasswordHash(bcrypt.hashSync('short', 4));

    const result = loginWithPassword('short');

    expect(result.error).toBeUndefined();
    expect(result.token).toBeDefined();
  });
});
