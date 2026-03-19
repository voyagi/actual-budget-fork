import { getAccountDb } from '../account-db.js';

// [eb] Idempotent migration for audit_log table.
// Called once at server startup, before routes are registered.
export function runAuditMigrations(): void {
  const db = getAccountDb();
  db.mutate(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp  INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      event_type TEXT    NOT NULL,
      actor      TEXT    NOT NULL,
      ip_address TEXT,
      outcome    TEXT    NOT NULL CHECK(outcome IN ('success', 'fail')),
      details    TEXT
    )
  `);
  db.mutate(
    'CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log (event_type, timestamp)',
  );

  // [eb] TOTP table for two-factor authentication.
  // Stores encrypted TOTP secret and hashed recovery codes per user.
  db.mutate(`
    CREATE TABLE IF NOT EXISTS totp (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        TEXT    NOT NULL UNIQUE,
      secret_enc     TEXT    NOT NULL,
      enrolled_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
      last_used_at   INTEGER,
      recovery_codes TEXT    NOT NULL
    )
  `);
}
