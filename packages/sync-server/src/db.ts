import Database from 'better-sqlite3';

export interface MutateResult {
  changes: number;
  insertId: number | bigint;
}

export class WrappedDatabase {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  all(sql: string, params: unknown[] = []): Record<string, unknown>[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as Record<string, unknown>[];
  }

  first(sql: string, params: unknown[] = []): Record<string, unknown> | null {
    const rows = this.all(sql, params);
    return rows.length === 0 ? null : rows[0];
  }

  exec(sql: string): Database.Database {
    return this.db.exec(sql);
  }

  mutate(sql: string, params: unknown[] = []): MutateResult {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes, insertId: info.lastInsertRowid };
  }

  transaction(fn: () => void): void {
    this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}

export function openDatabase(filename: string): WrappedDatabase {
  return new WrappedDatabase(new Database(filename));
}
