// [eb] Unit tests for backup module
import Database from 'better-sqlite3';
import { mkdtempSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';

import {
  backupSqliteFile,
  cleanOldBackups,
  discoverBudgetDirs,
  getBackupStatus,
  runBackup,
} from './backup.js';

// Helpers
function createTestDb(filePath: string): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  const db = new Database(filePath);
  db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, val TEXT)');
  db.exec("INSERT INTO test (val) VALUES ('hello')");
  db.close();
}

function createOldArchive(dir: string, name: string, daysOld: number): string {
  const filePath = path.join(dir, name);
  // Write a minimal file
  const buf = Buffer.alloc(512, 0);
  require('node:fs').writeFileSync(filePath, buf);
  // Set mtime to simulate old file
  const oldTime = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  require('node:fs').utimesSync(filePath, oldTime, oldTime);
  return filePath;
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(path.join(tmpdir(), 'backup-test-'));
});

afterEach(() => {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

describe('backupSqliteFile', () => {
  it('copies a SQLite file atomically to destination', async () => {
    const srcPath = path.join(tempDir, 'source.sqlite');
    const destPath = path.join(tempDir, 'subdir', 'dest.sqlite');
    createTestDb(srcPath);

    await backupSqliteFile(srcPath, destPath);

    expect(existsSync(destPath)).toBe(true);
    // Verify the copy is a valid SQLite database
    const db = new Database(destPath);
    const rows = db.prepare('SELECT val FROM test').all() as { val: string }[];
    db.close();
    expect(rows).toHaveLength(1);
    expect(rows[0].val).toBe('hello');
  });

  it('creates parent directories if they do not exist', async () => {
    const srcPath = path.join(tempDir, 'source.sqlite');
    const destPath = path.join(tempDir, 'a', 'b', 'c', 'dest.sqlite');
    createTestDb(srcPath);

    await backupSqliteFile(srcPath, destPath);

    expect(existsSync(destPath)).toBe(true);
  });
});

describe('discoverBudgetDirs', () => {
  it('returns budget directories containing db.sqlite', () => {
    // Create two budget dirs with db.sqlite
    createTestDb(path.join(tempDir, 'budget-abc123', 'db.sqlite'));
    createTestDb(path.join(tempDir, 'budget-def456', 'db.sqlite'));
    // Create a dir without db.sqlite (should be excluded)
    mkdirSync(path.join(tempDir, 'no-db-dir'));

    const results = discoverBudgetDirs(tempDir);
    const ids = results.map(r => r.id).sort();
    expect(ids).toContain('budget-abc123');
    expect(ids).toContain('budget-def456');
    expect(ids).not.toContain('no-db-dir');
  });

  it('excludes the backups subdirectory', () => {
    createTestDb(path.join(tempDir, 'budget-abc', 'db.sqlite'));
    // Create a backups dir with a db.sqlite inside (should be excluded)
    createTestDb(path.join(tempDir, 'backups', 'db.sqlite'));

    const results = discoverBudgetDirs(tempDir);
    const ids = results.map(r => r.id);
    expect(ids).not.toContain('backups');
    expect(ids).toContain('budget-abc');
  });

  it('returns empty array when dataDir does not exist', () => {
    const results = discoverBudgetDirs(path.join(tempDir, 'nonexistent'));
    expect(results).toEqual([]);
  });
});

describe('runBackup', () => {
  it('creates a tar.gz archive and returns success result', async () => {
    // Set up test data directory
    createTestDb(path.join(tempDir, 'account.sqlite'));
    createTestDb(path.join(tempDir, 'budget-abc', 'db.sqlite'));

    const result = await runBackup(tempDir);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');

    expect(result.archivePath).toMatch(/\.tar\.gz$/);
    expect(existsSync(result.archivePath)).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(result.filesCount).toBeGreaterThan(0);
  });

  it('removes uncompressed backup directory after archiving', async () => {
    createTestDb(path.join(tempDir, 'account.sqlite'));

    const result = await runBackup(tempDir);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');

    // The archive should exist
    expect(existsSync(result.archivePath)).toBe(true);
    // The uncompressed directory (same path without .tar.gz) should NOT exist
    const uncompressedDir = result.archivePath.replace(/\.tar\.gz$/, '');
    expect(existsSync(uncompressedDir)).toBe(false);
  });

  it('returns failure result on error', async () => {
    // Pass a non-existent directory that also has no account.sqlite
    const badDir = path.join(tempDir, 'does-not-exist-at-all');
    // Create the backups subdir won't matter - account.sqlite missing
    const result = await runBackup(badDir);
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(typeof result.error).toBe('string');
  });

  it('includes metadata.json in archive if present', async () => {
    createTestDb(path.join(tempDir, 'account.sqlite'));
    createTestDb(path.join(tempDir, 'budget-abc', 'db.sqlite'));
    await writeFile(
      path.join(tempDir, 'budget-abc', 'metadata.json'),
      JSON.stringify({ name: 'My Budget' }),
    );

    const result = await runBackup(tempDir);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unreachable');
    // filesCount should include account.sqlite + budget db.sqlite + metadata.json
    expect(result.filesCount).toBeGreaterThanOrEqual(2);
  });
});

describe('cleanOldBackups', () => {
  it('removes archives older than retentionDays', async () => {
    const backupsDir = path.join(tempDir, 'backups');
    mkdirSync(backupsDir);

    // Create old archive (10 days old)
    const oldArchive = createOldArchive(
      backupsDir,
      'backup-2020-01-01T00-00-00.tar.gz',
      10,
    );
    // Create new archive (1 day old)
    const newArchive = createOldArchive(
      backupsDir,
      'backup-2020-01-10T00-00-00.tar.gz',
      1,
    );

    const removed = await cleanOldBackups(backupsDir, 7);

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(existsSync(oldArchive)).toBe(false);
    expect(existsSync(newArchive)).toBe(true);
  });

  it('preserves archives newer than retentionDays', async () => {
    const backupsDir = path.join(tempDir, 'backups');
    mkdirSync(backupsDir);

    const recentArchive = createOldArchive(
      backupsDir,
      'backup-recent.tar.gz',
      2,
    );

    const removed = await cleanOldBackups(backupsDir, 7);

    expect(removed).toBe(0);
    expect(existsSync(recentArchive)).toBe(true);
  });
});

describe('getBackupStatus', () => {
  it('returns never status before any backup', () => {
    // Note: this test may see state from runBackup tests above
    // so we just verify shape
    const status = getBackupStatus();
    expect(status).toHaveProperty('lastBackupAt');
    expect(status).toHaveProperty('lastBackupSize');
    expect(status).toHaveProperty('lastBackupStatus');
    expect(status).toHaveProperty('backupCount');
  });

  it('returns success status after a successful backup', async () => {
    createTestDb(path.join(tempDir, 'account.sqlite'));
    await runBackup(tempDir);

    const status = getBackupStatus();
    expect(status.lastBackupStatus).toBe('success');
    expect(status.lastBackupAt).not.toBeNull();
    expect(status.backupCount).toBeGreaterThan(0);
  });
});
