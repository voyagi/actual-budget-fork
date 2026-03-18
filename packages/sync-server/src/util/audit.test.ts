import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock getAccountDb so tests never touch a real SQLite file
vi.mock('../account-db.js', () => {
  const mutateMock = vi.fn();
  return {
    getAccountDb: () => ({ mutate: mutateMock }),
  };
});

// Mock logger to suppress output during tests
vi.mock('./logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

import { getAccountDb } from '../account-db.js';
import { runAuditMigrations } from './audit-migrations.js';
import { writeAuditLog } from './audit.js';

function getMutateMock() {
  const db = getAccountDb();
  return db.mutate as ReturnType<typeof vi.fn>;
}

describe('runAuditMigrations', () => {
  beforeEach(() => {
    getMutateMock().mockReset();
  });

  it('creates audit_log table with correct columns', () => {
    runAuditMigrations();
    const calls = getMutateMock().mock.calls.map((c: unknown[]) => c[0] as string);
    const createCall = calls.find((sql: string) =>
      sql.includes('CREATE TABLE IF NOT EXISTS audit_log'),
    );
    expect(createCall).toBeDefined();
    expect(createCall).toContain('id');
    expect(createCall).toContain('timestamp');
    expect(createCall).toContain('event_type');
    expect(createCall).toContain('actor');
    expect(createCall).toContain('ip_address');
    expect(createCall).toContain('outcome');
    expect(createCall).toContain('details');
  });

  it('creates idx_audit_log_event index on (event_type, timestamp)', () => {
    runAuditMigrations();
    const calls = getMutateMock().mock.calls.map((c: unknown[]) => c[0] as string);
    const indexCall = calls.find((sql: string) =>
      sql.includes('CREATE INDEX IF NOT EXISTS idx_audit_log_event'),
    );
    expect(indexCall).toBeDefined();
    expect(indexCall).toContain('event_type, timestamp');
  });

  it('is idempotent - calling twice does not throw', () => {
    expect(() => {
      runAuditMigrations();
      runAuditMigrations();
    }).not.toThrow();
  });
});

describe('writeAuditLog', () => {
  beforeEach(() => {
    getMutateMock().mockReset();
  });

  it('inserts a row with correct values', () => {
    writeAuditLog({
      event_type: 'login_success',
      actor: 'mytoken123',
      ip_address: '1.2.3.4',
      outcome: 'success',
      details: { method: 'password' },
    });
    expect(getMutateMock()).toHaveBeenCalledOnce();
    const [sql, params] = getMutateMock().mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO audit_log');
    expect(params[0]).toBe('login_success');
    expect(params[2]).toBe('1.2.3.4');
    expect(params[3]).toBe('success');
    expect(params[4]).toBe(JSON.stringify({ method: 'password' }));
  });

  it('does not throw when DB insert fails (best-effort)', () => {
    getMutateMock().mockImplementation(() => {
      throw new Error('disk full');
    });
    expect(() =>
      writeAuditLog({
        event_type: 'login_failure',
        actor: 'sometoken',
        outcome: 'fail',
      }),
    ).not.toThrow();
  });

  it('hashes the actor token (stores first 8 hex chars of sha256, not raw token)', () => {
    const rawToken = 'supersecrettoken';
    writeAuditLog({
      event_type: 'login_success',
      actor: rawToken,
      outcome: 'success',
    });
    const [, params] = getMutateMock().mock.calls[0] as [string, unknown[]];
    const storedActor = params[1] as string;
    // Must not store the raw token
    expect(storedActor).not.toBe(rawToken);
    // Must be exactly 8 hex characters
    expect(storedActor).toMatch(/^[0-9a-f]{8}$/);
  });

  it('stores "system" actor as-is (no hashing)', () => {
    writeAuditLog({
      event_type: 'bootstrap',
      actor: 'system',
      outcome: 'success',
    });
    const [, params] = getMutateMock().mock.calls[0] as [string, unknown[]];
    expect(params[1]).toBe('system');
  });
});
