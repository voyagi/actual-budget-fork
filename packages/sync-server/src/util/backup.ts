// [eb] Server-side automated database backup.
// Atomic SQLite copies via better-sqlite3 .backup() API, tar.gz archiving,
// 7-day retention policy, and backup status tracking.
import Database from 'better-sqlite3';
import { createReadStream, createWriteStream, readdirSync, statSync } from 'node:fs';
import { mkdir, rm, stat, readdir, copyFile, readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import logger from './logger.js';

export type BackupResult =
  | { success: true; archivePath: string; filesCount: number; sizeBytes: number }
  | { success: false; error: string };

const backupStatus = {
  lastBackupAt: null as number | null,
  lastBackupSize: 0,
  lastBackupStatus: 'never' as 'success' | 'failure' | 'never',
  backupCount: 0,
};

/**
 * Creates an atomic copy of a SQLite database at destPath using better-sqlite3
 * .backup() API. Creates parent directories if they don't exist.
 */
export async function backupSqliteFile(
  srcPath: string,
  destPath: string,
): Promise<void> {
  await mkdir(path.dirname(destPath), { recursive: true });
  const db = new Database(srcPath, { readonly: true });
  try {
    await db.backup(destPath);
  } finally {
    db.close();
  }
}

/**
 * Discovers budget directories in dataDir by scanning for subdirectories
 * that contain a db.sqlite file. Excludes the 'backups' directory.
 * Returns empty array if dataDir does not exist.
 */
export function discoverBudgetDirs(
  dataDir: string,
): Array<{ id: string; dbPath: string }> {
  let entries;
  try {
    entries = readdirSync(dataDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: Array<{ id: string; dbPath: string }> = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'backups') continue;

    const dbPath = path.join(dataDir, entry.name, 'db.sqlite');
    try {
      statSync(dbPath);
      results.push({ id: entry.name, dbPath });
    } catch {
      // No db.sqlite in this directory — skip
    }
  }
  return results;
}

/**
 * Archives sourceDir into a .tar.gz file at outputPath using Node.js built-in
 * modules (no node-tar dependency). Walks the source directory recursively,
 * creates a POSIX tar stream, and pipes through gzip.
 */
async function createTarGz(
  sourceDir: string,
  outputPath: string,
): Promise<void> {
  const files: Array<{ relativePath: string; absolutePath: string; size: number }> = [];

  async function collectFiles(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await collectFiles(absPath, relPath);
      } else if (entry.isFile()) {
        const fileStat = await stat(absPath);
        files.push({ relativePath: relPath, absolutePath: absPath, size: fileStat.size });
      }
    }
  }
  await collectFiles(sourceDir, '');

  const tarStream = new Readable({ read() {} });

  for (const file of files) {
    // Build 512-byte POSIX ustar header
    const header = Buffer.alloc(512);

    // Name (100 bytes at offset 0)
    header.write(file.relativePath.slice(0, 100), 0, 100, 'utf8');
    // Mode (8 bytes at offset 100): regular file 0644
    header.write('0000644\0', 100, 8, 'utf8');
    // UID (8 bytes at offset 108)
    header.write('0001000\0', 108, 8, 'utf8');
    // GID (8 bytes at offset 116)
    header.write('0001000\0', 116, 8, 'utf8');
    // Size (12 bytes at offset 124, octal, null-terminated)
    header.write(file.size.toString(8).padStart(11, '0') + '\0', 124, 12, 'utf8');
    // Mtime (12 bytes at offset 136, octal, null-terminated)
    header.write(
      Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0',
      136,
      12,
      'utf8',
    );
    // Type flag (1 byte at offset 156): '0' = regular file
    header.write('0', 156, 1, 'utf8');
    // Checksum field (8 bytes at offset 148): spaces as initial value per POSIX
    header.write('        ', 148, 8, 'utf8');
    // Compute checksum as sum of all bytes (checksum field treated as spaces)
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += header[i];
    // Write checksum: 6 octal digits + null + space (POSIX format)
    header.write(checksum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'utf8');

    tarStream.push(header);

    // File content
    const content = await readFile(file.absolutePath);
    tarStream.push(content);

    // Pad content to 512-byte boundary
    const remainder = content.length % 512;
    if (remainder > 0) {
      tarStream.push(Buffer.alloc(512 - remainder));
    }
  }

  // End-of-archive: two consecutive 512-byte zero blocks
  tarStream.push(Buffer.alloc(1024));
  tarStream.push(null);

  const gzip = createGzip();
  const output = createWriteStream(outputPath);
  await pipeline(tarStream, gzip, output);
}

/**
 * Runs a full backup of account.sqlite and all discovered budget databases.
 * Creates a timestamped .tar.gz archive in {dataDir}/backups/ and removes
 * the uncompressed working directory. Also runs retention cleanup.
 *
 * @param dataDir  Data directory to back up (defaults to ACTUAL_DATA_DIR or /data)
 */
export async function runBackup(dataDir?: string): Promise<BackupResult> {
  const resolvedDataDir =
    dataDir ?? process.env.ACTUAL_DATA_DIR ?? '/data';

  try {
    // Create timestamped backup directory name
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    const backupDir = path.join(resolvedDataDir, 'backups', `backup-${timestamp}`);
    await mkdir(backupDir, { recursive: true });

    let filesCount = 0;

    // Backup account.sqlite
    const accountSrc = path.join(resolvedDataDir, 'account.sqlite');
    await backupSqliteFile(accountSrc, path.join(backupDir, 'account.sqlite'));
    filesCount++;

    // Discover and backup each budget
    const budgets = discoverBudgetDirs(resolvedDataDir);
    for (const budget of budgets) {
      const destDir = path.join(backupDir, budget.id);
      await backupSqliteFile(budget.dbPath, path.join(destDir, 'db.sqlite'));
      filesCount++;

      // Copy metadata.json if present (optional)
      const metaPath = path.join(resolvedDataDir, budget.id, 'metadata.json');
      try {
        await copyFile(metaPath, path.join(destDir, 'metadata.json'));
        filesCount++;
      } catch {
        // metadata.json is optional — absence is not an error
      }
    }

    // Archive into tar.gz
    const archivePath = backupDir + '.tar.gz';
    await createTarGz(backupDir, archivePath);

    // Remove uncompressed working directory after successful archiving
    await rm(backupDir, { recursive: true, force: true });

    // Get archive size
    const archiveStat = await stat(archivePath);

    // Update module-level status
    backupStatus.lastBackupAt = Date.now();
    backupStatus.lastBackupSize = archiveStat.size;
    backupStatus.lastBackupStatus = 'success';
    backupStatus.backupCount++;

    // Clean up archives older than 7 days
    await cleanOldBackups(path.join(resolvedDataDir, 'backups'));

    logger.info('Backup completed', {
      archivePath,
      filesCount,
      sizeBytes: archiveStat.size,
    });

    return {
      success: true,
      archivePath,
      filesCount,
      sizeBytes: archiveStat.size,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    backupStatus.lastBackupAt = Date.now();
    backupStatus.lastBackupStatus = 'failure';
    logger.error('Backup failed', { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Removes .tar.gz backup archives in backupsDir that are older than
 * retentionDays. Also cleans up any leftover uncompressed backup-* directories
 * from previously failed archive attempts.
 *
 * @returns Number of removed entries
 */
export async function cleanOldBackups(
  backupsDir: string,
  retentionDays = 7,
): Promise<number> {
  let removed = 0;
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let entries;
  try {
    entries = await readdir(backupsDir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const entryPath = path.join(backupsDir, entry.name);

    if (entry.isFile() && entry.name.endsWith('.tar.gz')) {
      try {
        const entryStat = await stat(entryPath);
        if (entryStat.mtimeMs < cutoffMs) {
          await unlink(entryPath);
          removed++;
          logger.info('Removed old backup archive', { path: entryPath });
        }
      } catch {
        // Best-effort cleanup — ignore individual errors
      }
    } else if (entry.isDirectory() && entry.name.startsWith('backup-')) {
      // Leftover uncompressed directory from a failed previous run
      try {
        const entryStat = await stat(entryPath);
        if (entryStat.mtimeMs < cutoffMs) {
          await rm(entryPath, { recursive: true, force: true });
          removed++;
          logger.info('Removed leftover backup directory', { path: entryPath });
        }
      } catch {
        // Best-effort cleanup
      }
    }
  }

  return removed;
}

/**
 * Returns a snapshot of the current backup status for API consumption.
 */
export function getBackupStatus(): {
  lastBackupAt: number | null;
  lastBackupSize: number;
  lastBackupStatus: 'success' | 'failure' | 'never';
  backupCount: number;
} {
  return { ...backupStatus };
}
