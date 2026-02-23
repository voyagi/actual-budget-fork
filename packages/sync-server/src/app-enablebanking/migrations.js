import { getAccountDb } from '../account-db.js';

// [eb] Idempotent migrations for Enable Banking tables.
// Called once at server startup before routes are registered.
export function runMigrations() {
  const db = getAccountDb();

  // OAuth session created during the bank-link flow. accounts is stored as a
  // JSON string because SQLite has no native array type.
  db.mutate(`
    CREATE TABLE IF NOT EXISTS eb_sessions (
      id TEXT PRIMARY KEY,
      state TEXT UNIQUE NOT NULL,
      aspsp_name TEXT,
      aspsp_country TEXT,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      valid_until TEXT,
      accounts TEXT
    )
  `);

  // Maps Enable Banking account UIDs to Actual Budget account UUIDs.
  // actual_account_id is nullable until the user completes the link flow.
  db.mutate(`
    CREATE TABLE IF NOT EXISTS eb_account_map (
      eb_account_uid TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      actual_account_id TEXT
    )
  `);

  // Append-only sync log. actual_account_id is the Actual Budget UUID - this
  // is what the UI has when querying sync status. eb_account_uid is retained
  // for cross-referencing with the Enable Banking API.
  db.mutate(`
    CREATE TABLE IF NOT EXISTS eb_sync_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actual_account_id TEXT NOT NULL,
      eb_account_uid TEXT NOT NULL,
      synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      status TEXT NOT NULL,
      transactions_added INTEGER,
      transactions_updated INTEGER,
      error_message TEXT,
      error_code TEXT
    )
  `);

  // Indexes for frequently queried columns.
  db.mutate(
    'CREATE INDEX IF NOT EXISTS idx_eb_account_map_actual ON eb_account_map (actual_account_id)',
  );
  db.mutate(
    'CREATE INDEX IF NOT EXISTS idx_eb_sync_log_actual ON eb_sync_log (actual_account_id)',
  );
}
