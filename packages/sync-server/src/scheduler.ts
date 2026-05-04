// @ts-strict-ignore
// [eb] Scheduled auto-sync: runs every 6 hours when ENABLE_AUTO_SYNC=true.
// Calls Enable Banking service functions directly (no internal HTTP) so no
// auth headers are needed. Per-session grouping ensures consent expiry is
// checked once per bank connection and one user's failure doesn't block others.
import cron from 'node-cron';

import { getAccountDb } from './account-db.js';
import {
  getBalances,
  getTransactions,
} from './app-enablebanking/enablebanking-service.js';
import {
  RateLimitError,
  SessionExpiredError,
} from './app-enablebanking/errors.js';
import { normalizeTransaction } from './app-enablebanking/utils.js';
import { triggerAlert } from './util/alerter.js';
import { runBackup } from './util/backup.js';
import logger from './util/logger.js';
import { recordBackupRun, recordSyncRun } from './util/metrics.js';

type AccountRow = {
  actual_account_id: string;
  eb_account_uid: string;
  session_id: string;
  valid_until: string | null;
  aspsp_name: string | null;
};

async function syncOneAccount(account: AccountRow): Promise<void> {
  const db = getAccountDb();

  // Derive sinceDate from last successful sync (epoch integer -> YYYY-MM-DD).
  const row = db.first(
    'SELECT synced_at FROM eb_sync_log WHERE actual_account_id = ? ORDER BY id DESC LIMIT 1',
    [account.actual_account_id],
  );
  const sinceDate = row?.synced_at
    ? new Date(Number(row.synced_at) * 1000).toISOString().split('T')[0]
    : new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const { booked, pending } = await getTransactions(
    account.eb_account_uid,
    sinceDate,
  );
  await getBalances(account.eb_account_uid);

  const allNormalized = [
    ...booked.map(t => normalizeTransaction(t, true)),
    ...pending.map(t => normalizeTransaction(t, false)),
  ];

  db.mutate(
    `INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, transactions_added)
     VALUES (?, ?, 'ok', ?)`,
    [account.actual_account_id, account.eb_account_uid, allNormalized.length],
  );

  logger.info('Synced account', {
    accountId: account.actual_account_id,
    transactions: allNormalized.length,
  });
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export type RetryPolicy = {
  maxRetries: number;
  initialDelay: number;
  multiplier: number;
  maxDelay: number;
  jitterFraction: number;
};

export function applyJitter(delay: number, jitterFraction: number): number {
  // jitter range: [-fraction, +fraction] of the delay
  const jitter = (Math.random() * 2 - 1) * jitterFraction;
  return Math.round(delay * (1 + jitter));
}

export async function syncAccountWithRetry(
  syncFn: () => Promise<void>,
  sleepFn: (ms: number) => Promise<void>,
  policy: RetryPolicy,
  accountLabel: string,
): Promise<void> {
  let delay = policy.initialDelay;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      await syncFn();
      return; // success
    } catch (err) {
      // RateLimitError and SessionExpiredError bypass retry - propagate immediately
      if (err instanceof RateLimitError || err instanceof SessionExpiredError) {
        throw err;
      }
      if (attempt === policy.maxRetries) {
        // Final attempt exhausted - propagate to caller for eb_sync_log write
        throw err;
      }
      // Cap base delay before applying jitter so jitter may slightly exceed maxDelay
      const cappedDelay = Math.min(delay, policy.maxDelay);
      const jitteredDelay = applyJitter(cappedDelay, policy.jitterFraction);
      logger.info('Retrying sync', {
        attempt: attempt + 1,
        maxRetries: policy.maxRetries,
        accountLabel,
        delayMs: jitteredDelay,
      });
      await sleepFn(jitteredDelay);
      delay = Math.min(delay * policy.multiplier, policy.maxDelay);
    }
  }
}

const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 3,
  initialDelay: 5000,
  multiplier: 2,
  maxDelay: 60000,
  jitterFraction: 0.2,
};

async function runScheduledSync(): Promise<void> {
  logger.info('Starting scheduled sync run');

  const db = getAccountDb();

  const rows = db.all(
    `SELECT m.actual_account_id, m.eb_account_uid, m.session_id,
            s.valid_until, s.aspsp_name
     FROM eb_account_map m
     JOIN eb_sessions s ON s.id = m.session_id
     WHERE m.actual_account_id IS NOT NULL
     ORDER BY m.session_id`,
    [],
  ) as unknown as AccountRow[];

  // Group accounts by session so consent expiry is checked once per bank
  // connection and one session's failure doesn't block other users.
  const sessionGroups = new Map<string, AccountRow[]>();
  for (const row of rows) {
    const group = sessionGroups.get(row.session_id) ?? [];
    group.push(row);
    sessionGroups.set(row.session_id, group);
  }

  let totalSessions = 0;
  let totalSynced = 0;
  let totalErrors = 0;

  for (const [sessionId, accounts] of sessionGroups) {
    totalSessions++;
    const aspspName = accounts[0]?.aspsp_name ?? 'unknown';
    const validUntil = accounts[0]?.valid_until;

    // Check consent expiry once per session group.
    if (validUntil) {
      const expiryDate = new Date(validUntil);
      const now = new Date();
      const daysUntilExpiry =
        (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

      if (expiryDate < now) {
        // Already expired - skip this session
        logger.warn('Skipping expired session', {
          sessionId,
          aspspName,
          accounts: accounts.length,
        });
        triggerAlert({
          event_type: 'consent_expiry',
          message: `Consent expired for ${aspspName} (session ${sessionId}, ${accounts.length} accounts)`,
          severity: 'error',
        }).catch(() => {});
        continue;
      } else if (daysUntilExpiry <= 14) {
        // Expiring within 14 days - alert but continue syncing
        logger.warn('Consent expiring soon', {
          sessionId,
          aspspName,
          daysUntilExpiry: Math.round(daysUntilExpiry),
        });
        triggerAlert({
          event_type: 'consent_expiry',
          message: `Consent for ${aspspName} expires in ${Math.round(daysUntilExpiry)} days (session ${sessionId})`,
          severity: 'warning',
        }).catch(() => {});
      }
    }

    let successCount = 0;

    for (const account of accounts) {
      try {
        await syncAccountWithRetry(
          () => syncOneAccount(account),
          sleep,
          DEFAULT_RETRY_POLICY,
          account.actual_account_id,
        );
        successCount++;
        totalSynced++;
      } catch (err) {
        if (err instanceof RateLimitError) {
          // A 429 applies to the entire API connection - don't sleep or retry.
          logger.warn('Rate limited, skipping session', {
            sessionId,
            aspspName,
          });
          break;
        }
        if (err instanceof SessionExpiredError) {
          logger.warn('Session expired mid-sync', { sessionId });
          break;
        }
        // All retries exhausted - log error to eb_sync_log
        logger.error('Sync failed after retries exhausted', {
          accountId: account.actual_account_id,
          maxRetries: DEFAULT_RETRY_POLICY.maxRetries,
          error: err instanceof Error ? err.message : String(err),
        });
        triggerAlert({
          event_type: 'sync_failure',
          message: `Sync failed for account ${account.actual_account_id} after ${DEFAULT_RETRY_POLICY.maxRetries} retries: ${err instanceof Error ? err.message : String(err)}`,
          severity: 'error',
        }).catch(() => {});
        const retryDb = getAccountDb();
        retryDb.mutate(
          `INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, error_message)
           VALUES (?, ?, 'error', ?)`,
          [
            account.actual_account_id,
            account.eb_account_uid,
            err instanceof Error ? err.message : String(err),
          ],
        );
        totalErrors++;
      }
    }

    logger.info('Session sync complete', {
      sessionId,
      aspspName,
      synced: successCount,
      total: accounts.length,
    });
  }

  logger.info('Sync run complete', {
    sessions: totalSessions,
    synced: totalSynced,
    errors: totalErrors,
  });
  recordSyncRun(totalSynced, totalErrors);
}

// [eb] Registers the 6-hour sync cron and daily backup cron.
// Sync is opt-in (ENABLE_AUTO_SYNC=true), backup is opt-out (ENABLE_AUTO_BACKUP=false).
export function startScheduler(): void {
  // Sync cron -- opt-in via ENABLE_AUTO_SYNC=true
  if (process.env.ENABLE_AUTO_SYNC === 'true') {
    // 5-field cron: at minute 0, hours 0/6/12/18 every day
    cron.schedule('0 0,6,12,18 * * *', () => {
      runScheduledSync().catch(err => {
        logger.error('Unhandled error in sync run', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    });
    logger.info('Auto-sync scheduled (every 6 hours)');
  } else {
    logger.info('Auto-sync disabled (ENABLE_AUTO_SYNC not set to true)');
  }

  // Backup cron -- opt-out via ENABLE_AUTO_BACKUP=false (enabled by default)
  if (process.env.ENABLE_AUTO_BACKUP !== 'false') {
    const backupSchedule = process.env.BACKUP_CRON_SCHEDULE ?? '0 2 * * *';
    cron.schedule(backupSchedule, () => {
      runBackup()
        .then(result => {
          if (result.success) {
            logger.info('Backup completed', {
              archivePath: result.archivePath,
              files: result.filesCount,
              sizeBytes: result.sizeBytes,
            });
            recordBackupRun(result.sizeBytes, true);
          } else {
            const errMsg = (result as { success: false; error: string }).error;
            logger.error('Backup failed', { error: errMsg });
            recordBackupRun(0, false);
            triggerAlert({
              event_type: 'backup_failure',
              message: `Daily backup failed: ${errMsg}`,
              severity: 'error',
            }).catch(() => {});
          }
        })
        .catch(err => {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error('Backup cron unhandled error', { error: msg });
          recordBackupRun(0, false);
          triggerAlert({
            event_type: 'backup_failure',
            message: `Daily backup failed: ${msg}`,
            severity: 'error',
          }).catch(() => {});
        });
    });
    logger.info('Auto-backup scheduled', { schedule: backupSchedule });
  }
}
