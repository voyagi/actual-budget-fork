import { getAccountDb } from '../account-db.js';

export const PRODUCTION_TRUST_CONDITIONS = [
  'access',
  'persistence',
  'multi_device_sync',
  'bank_sync',
] as const;

export type ProductionTrustCondition =
  (typeof PRODUCTION_TRUST_CONDITIONS)[number];

type ProductionTrustStatus = 'trusted' | 'untrusted';
type ProductionTrustRecoverySource = 'automated' | 'manual';

type DbProductionTrustRow = {
  condition: string;
  status: ProductionTrustStatus;
  reason: string | null;
  message: string | null;
  last_checked_at: string;
  last_verified_at: string | null;
  recovery_source: ProductionTrustRecoverySource | null;
  evidence: string | null;
};

export type ProductionTrustRow = {
  condition: ProductionTrustCondition;
  status: ProductionTrustStatus;
  reason: string | null;
  message: string | null;
  lastCheckedAt: string;
  lastVerifiedAt: string | null;
  recoverySource: ProductionTrustRecoverySource | null;
  evidence: unknown;
};

export type ProductionTrustState = {
  isTrusted: boolean;
  activeConditions: ProductionTrustRow[];
  conditions: ProductionTrustRow[];
  lastCheckedAt: string | null;
  canRunAutomatedCheck: boolean;
};

const conditionLabels: Record<ProductionTrustCondition, string> = {
  access: 'Production access',
  persistence: 'Data persistence',
  multi_device_sync: 'Multi-device sync',
  bank_sync: 'Bank sync',
};

const DEFAULT_BANK_SYNC_FRESHNESS_MS = 7 * 60 * 60 * 1000;
const MAX_EVIDENCE_LENGTH = 2000;

function nowIso(): string {
  return new Date().toISOString();
}

export function isProductionTrustCondition(
  value: unknown,
): value is ProductionTrustCondition {
  return (
    typeof value === 'string' &&
    PRODUCTION_TRUST_CONDITIONS.includes(value as ProductionTrustCondition)
  );
}

function redactEvidence(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactEvidence(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /authorization|password|private|secret|token|key/i.test(key)
          ? '[redacted]'
          : redactEvidence(entry),
      ]),
    );
  }

  return value;
}

function serializeEvidence(evidence: unknown): string | null {
  if (evidence == null) {
    return null;
  }

  const value =
    typeof evidence === 'string'
      ? evidence
      : JSON.stringify(redactEvidence(evidence));

  return value.slice(0, MAX_EVIDENCE_LENGTH);
}

function parseEvidence(evidence: string | null): unknown {
  if (!evidence) {
    return null;
  }

  try {
    return JSON.parse(evidence);
  } catch {
    return evidence;
  }
}

function defaultMessage(condition: ProductionTrustCondition): string {
  return `${conditionLabels[condition]} has not been verified for production.`;
}

export function ensureProductionTrustTable(): void {
  const db = getAccountDb();
  db.mutate(`
    CREATE TABLE IF NOT EXISTS production_trust_state (
      condition TEXT PRIMARY KEY,
      status TEXT NOT NULL CHECK (status IN ('trusted', 'untrusted')),
      reason TEXT,
      message TEXT,
      last_checked_at TEXT NOT NULL,
      last_verified_at TEXT,
      recovery_source TEXT,
      evidence TEXT
    )
  `);

  const timestamp = nowIso();
  for (const condition of PRODUCTION_TRUST_CONDITIONS) {
    db.mutate(
      `INSERT OR IGNORE INTO production_trust_state
        (condition, status, reason, message, last_checked_at)
       VALUES (?, 'untrusted', 'unverified', ?, ?)`,
      [condition, defaultMessage(condition), timestamp],
    );
  }
}

function normalizeRow(row: DbProductionTrustRow): ProductionTrustRow {
  return {
    condition: row.condition as ProductionTrustCondition,
    status: row.status,
    reason: row.reason,
    message: row.message,
    lastCheckedAt: row.last_checked_at,
    lastVerifiedAt: row.last_verified_at,
    recoverySource: row.recovery_source,
    evidence: parseEvidence(row.evidence),
  };
}

export function getProductionTrustState(): ProductionTrustState {
  ensureProductionTrustTable();

  const rows = getAccountDb()
    .all(
      `SELECT condition, status, reason, message, last_checked_at,
              last_verified_at, recovery_source, evidence
       FROM production_trust_state
       ORDER BY condition`,
    )
    .map(row => normalizeRow(row as DbProductionTrustRow));

  const activeConditions = rows.filter(row => row.status === 'untrusted');
  const lastCheckedAt =
    rows
      .map(row => row.lastCheckedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    isTrusted: activeConditions.length === 0,
    activeConditions,
    conditions: rows,
    lastCheckedAt,
    canRunAutomatedCheck: rows.some(row => row.condition === 'bank_sync'),
  };
}

export function recordProductionTrustUntrusted({
  condition,
  reason,
  message,
  evidence,
}: {
  condition: ProductionTrustCondition;
  reason: string;
  message?: string | null;
  evidence?: unknown;
}): ProductionTrustState {
  ensureProductionTrustTable();

  getAccountDb().mutate(
    `UPDATE production_trust_state
     SET status = 'untrusted',
         reason = ?,
         message = ?,
         last_checked_at = ?,
         last_verified_at = NULL,
         recovery_source = NULL,
         evidence = ?
     WHERE condition = ?`,
    [
      reason,
      message ?? defaultMessage(condition),
      nowIso(),
      serializeEvidence(evidence),
      condition,
    ],
  );

  return getProductionTrustState();
}

export function verifyProductionTrustCondition({
  condition,
  source,
  reason,
  message,
  evidence,
}: {
  condition: ProductionTrustCondition;
  source: ProductionTrustRecoverySource;
  reason?: string;
  message?: string | null;
  evidence?: unknown;
}): ProductionTrustState {
  ensureProductionTrustTable();

  const timestamp = nowIso();
  getAccountDb().mutate(
    `UPDATE production_trust_state
     SET status = 'trusted',
         reason = ?,
         message = ?,
         last_checked_at = ?,
         last_verified_at = ?,
         recovery_source = ?,
         evidence = ?
     WHERE condition = ?`,
    [
      reason ?? `${source}_verified`,
      message ?? `${conditionLabels[condition]} has been verified.`,
      timestamp,
      timestamp,
      source,
      serializeEvidence(evidence),
      condition,
    ],
  );

  return getProductionTrustState();
}

type BankSyncRow = {
  id: number;
  actual_account_id: string;
  eb_account_uid: string;
  synced_at: number | string;
  status: string;
  error_message: string | null;
  error_code: string | null;
};

function bankSyncTimestamp(row: BankSyncRow): number {
  return typeof row.synced_at === 'number'
    ? row.synced_at
    : parseInt(row.synced_at, 10);
}

export function runBankSyncProductionTrustCheck({
  maxAgeMs = DEFAULT_BANK_SYNC_FRESHNESS_MS,
}: {
  maxAgeMs?: number;
} = {}): ProductionTrustState {
  ensureProductionTrustTable();

  let row: BankSyncRow | null = null;
  try {
    row = getAccountDb().first(
      `SELECT id, actual_account_id, eb_account_uid, synced_at, status,
              error_message, error_code
       FROM eb_sync_log
       WHERE actual_account_id IS NOT NULL
       ORDER BY id DESC
       LIMIT 1`,
    ) as BankSyncRow | null;
  } catch (error) {
    return recordProductionTrustUntrusted({
      condition: 'bank_sync',
      reason: 'bank_sync_unavailable',
      message: 'Production bank sync status could not be checked.',
      evidence: { error: String(error) },
    });
  }

  if (!row) {
    return recordProductionTrustUntrusted({
      condition: 'bank_sync',
      reason: 'bank_sync_missing',
      message: 'No production bank sync result has been recorded.',
    });
  }

  if (row.status !== 'ok') {
    return recordProductionTrustUntrusted({
      condition: 'bank_sync',
      reason: 'bank_sync_failed',
      message: 'The latest production bank sync failed.',
      evidence: {
        accountId: row.actual_account_id,
        syncLogId: row.id,
        errorCode: row.error_code,
        errorMessage: row.error_message,
      },
    });
  }

  const syncedAt = bankSyncTimestamp(row);
  const ageMs = Date.now() - syncedAt * 1000;
  if (!Number.isFinite(syncedAt) || ageMs > maxAgeMs) {
    return recordProductionTrustUntrusted({
      condition: 'bank_sync',
      reason: 'bank_sync_stale',
      message: 'The latest production bank sync result is stale.',
      evidence: {
        accountId: row.actual_account_id,
        syncLogId: row.id,
        syncedAt,
      },
    });
  }

  return verifyProductionTrustCondition({
    condition: 'bank_sync',
    source: 'automated',
    reason: 'bank_sync_recent_ok',
    message: 'Production bank sync has a recent successful result.',
    evidence: {
      accountId: row.actual_account_id,
      syncLogId: row.id,
      syncedAt,
    },
  });
}

export function runProductionTrustAutomatedCheck({
  condition,
  maxAgeMs,
}: {
  condition?: ProductionTrustCondition;
  maxAgeMs?: number;
} = {}): ProductionTrustState {
  ensureProductionTrustTable();

  if (!condition || condition === 'bank_sync') {
    return runBankSyncProductionTrustCheck({ maxAgeMs });
  }

  return getProductionTrustState();
}
