import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';

import { clearExpiredSessions, getAccountDb } from '../account-db';
import { config } from '../load-config';
import { TOKEN_EXPIRATION_NEVER } from '../util/validate-user';

function isValidPassword(password: unknown): password is string {
  return password != null && password !== '';
}

function validatePasswordStrength(password: string): { error?: string } {
  if (password.length < 8) {
    return { error: 'password-too-short' };
  }
  return {};
}

function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 12);
}

interface PasswordResult {
  error?: string;
  token?: string;
}

export function bootstrapPassword(password: string): PasswordResult {
  if (!isValidPassword(password)) {
    return { error: 'invalid-password' };
  }

  const strengthCheck = validatePasswordStrength(password);
  if (strengthCheck.error) {
    return strengthCheck;
  }

  const hashed = hashPassword(password);
  const accountDb = getAccountDb();
  accountDb.transaction(() => {
    accountDb.mutate('DELETE FROM auth WHERE method = ?', ['password']);
    accountDb.mutate('UPDATE auth SET active = 0');
    accountDb.mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('password', 'Password', ?, 1)",
      [hashed],
    );
  });

  return {};
}

export function loginWithPassword(password: string): PasswordResult {
  if (!isValidPassword(password)) {
    return { error: 'invalid-password' };
  }

  const accountDb = getAccountDb();
  const authRow = accountDb.first(
    'SELECT extra_data FROM auth WHERE method = ?',
    ['password'],
  );
  const passwordHash = (authRow as { extra_data?: string } | null)?.extra_data;

  if (!passwordHash) {
    return { error: 'invalid-password' };
  }

  const confirmed = bcrypt.compareSync(password, passwordHash);

  if (!confirmed) {
    return { error: 'invalid-password' };
  }

  const sessionRow = accountDb.first(
    'SELECT * FROM sessions WHERE auth_method = ?',
    ['password'],
  ) as { token?: string } | null;

  const token = sessionRow ? sessionRow.token! : uuidv4();

  const countRow = accountDb.first(
    'SELECT count(*) as totalOfUsers FROM users',
  ) as { totalOfUsers: number };
  let userId: string | null = null;
  if (countRow.totalOfUsers === 0) {
    userId = uuidv4();
    accountDb.mutate(
      'INSERT INTO users (id, user_name, display_name, enabled, owner, role) VALUES (?, ?, ?, 1, 1, ?)',
      [userId, '', '', 'ADMIN'],
    );
  } else {
    const userRow = accountDb.first(
      'SELECT id FROM users WHERE user_name = ?',
      [''],
    ) as { id?: string } | null;

    userId = userRow?.id ?? null;

    if (!userId) {
      return { error: 'user-not-found' };
    }
  }

  let expiration: number = TOKEN_EXPIRATION_NEVER;
  const tokenExp = config.get('token_expiration');
  if (
    tokenExp !== 'never' &&
    tokenExp !== 'openid-provider' &&
    typeof tokenExp === 'number'
  ) {
    expiration = Math.floor(Date.now() / 1000) + tokenExp * 60;
  }

  if (!sessionRow) {
    accountDb.mutate(
      'INSERT INTO sessions (token, expires_at, user_id, auth_method) VALUES (?, ?, ?, ?)',
      [token, expiration, userId, 'password'],
    );
  } else {
    accountDb.mutate(
      'UPDATE sessions SET user_id = ?, expires_at = ? WHERE token = ?',
      [userId, expiration, token],
    );
  }

  clearExpiredSessions();

  return { token };
}

export function changePassword(newPassword: string): { error?: string } {
  const accountDb = getAccountDb();

  if (!isValidPassword(newPassword)) {
    return { error: 'invalid-password' };
  }

  const strengthCheck = validatePasswordStrength(newPassword);
  if (strengthCheck.error) {
    return strengthCheck;
  }

  const hashed = hashPassword(newPassword);
  accountDb.mutate("UPDATE auth SET extra_data = ? WHERE method = 'password'", [
    hashed,
  ]);
  return {};
}

export function checkPassword(password: string): boolean {
  if (!isValidPassword(password)) {
    return false;
  }

  const accountDb = getAccountDb();
  const authRow = accountDb.first(
    'SELECT extra_data FROM auth WHERE method = ?',
    ['password'],
  );
  const passwordHash = (authRow as { extra_data?: string } | null)?.extra_data;

  if (!passwordHash) {
    return false;
  }

  const confirmed = bcrypt.compareSync(password, passwordHash);

  if (!confirmed) {
    return false;
  }

  return true;
}
