import { describe, expect, it } from 'vitest';

import { getAccountDb } from '../account-db';

import { runMigrations } from './migrations';

describe('runMigrations', () => {
  // Migrations already run by globalSetup via app-enablebanking module load.
  // These tests verify the schema is correct and idempotent.

  it('is idempotent (can be called multiple times without error)', () => {
    expect(() => runMigrations()).not.toThrow();
    expect(() => runMigrations()).not.toThrow();
  });

  it('creates eb_sessions table with correct columns', () => {
    const db = getAccountDb();
    const cols = db.all("PRAGMA table_info('eb_sessions')");
    const colNames = cols.map(c => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('state');
    expect(colNames).toContain('aspsp_name');
    expect(colNames).toContain('aspsp_country');
    expect(colNames).toContain('created_at');
    expect(colNames).toContain('valid_until');
    expect(colNames).toContain('accounts');
  });

  it('enforces UNIQUE constraint on eb_sessions.state', () => {
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO eb_sessions (id, state) VALUES ('a', 'unique-state')",
    );

    expect(() =>
      db.mutate(
        "INSERT INTO eb_sessions (id, state) VALUES ('b', 'unique-state')",
      ),
    ).toThrow();

    db.mutate("DELETE FROM eb_sessions WHERE state = 'unique-state'");
  });

  it('creates eb_account_map table with correct columns', () => {
    const db = getAccountDb();
    const cols = db.all("PRAGMA table_info('eb_account_map')");
    const colNames = cols.map(c => c.name);

    expect(colNames).toContain('eb_account_uid');
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('actual_account_id');
  });

  it('eb_account_map.actual_account_id is nullable', () => {
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO eb_sessions (id, state) VALUES ('test-sess', 'test-state-nullable')",
    );
    db.mutate(
      "INSERT INTO eb_account_map (eb_account_uid, session_id) VALUES ('uid-nullable', 'test-sess')",
    );

    const row = db.first(
      "SELECT * FROM eb_account_map WHERE eb_account_uid = 'uid-nullable'",
    );
    expect(row.actual_account_id).toBeNull();

    db.mutate(
      "DELETE FROM eb_account_map WHERE eb_account_uid = 'uid-nullable'",
    );
    db.mutate("DELETE FROM eb_sessions WHERE id = 'test-sess'");
  });

  it('creates eb_sync_log table with auto-increment id', () => {
    const db = getAccountDb();
    const cols = db.all("PRAGMA table_info('eb_sync_log')");
    const colNames = cols.map(c => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('actual_account_id');
    expect(colNames).toContain('eb_account_uid');
    expect(colNames).toContain('synced_at');
    expect(colNames).toContain('status');
    expect(colNames).toContain('transactions_added');
    expect(colNames).toContain('transactions_updated');
    expect(colNames).toContain('error_message');
    expect(colNames).toContain('error_code');
  });

  it('eb_sync_log auto-increments id', () => {
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status) VALUES ('a1', 'e1', 'ok')",
    );
    db.mutate(
      "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status) VALUES ('a2', 'e2', 'ok')",
    );

    const rows = db.all(
      "SELECT id FROM eb_sync_log WHERE actual_account_id IN ('a1', 'a2') ORDER BY id",
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].id).toBeGreaterThan(rows[0].id);

    db.mutate(
      "DELETE FROM eb_sync_log WHERE actual_account_id IN ('a1', 'a2')",
    );
  });

  it('creates index on eb_account_map.actual_account_id', () => {
    const db = getAccountDb();
    const indexes = db.all(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='eb_account_map'",
    );
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_eb_account_map_actual');
  });

  it('creates index on eb_sync_log.actual_account_id', () => {
    const db = getAccountDb();
    const indexes = db.all(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='eb_sync_log'",
    );
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_eb_sync_log_actual');
  });
});
