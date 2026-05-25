// [eb] Tests for syncOneAccount and runScheduledSync – the DB-dependent
// orchestration logic. The existing scheduler.test.ts covers the exported
// retry helpers (syncAccountWithRetry, applyJitter).
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- vi.hoisted: variables available inside hoisted vi.mock factories ---

const {
  mutateMock,
  firstMock,
  allMock,
  getTransactionsMock,
  getBalancesMock,
  triggerAlertMock,
  loggerMock,
  recordSyncRunMock,
} = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  firstMock: vi.fn(),
  allMock: vi.fn(),
  getTransactionsMock: vi.fn(),
  getBalancesMock: vi.fn(),
  triggerAlertMock: vi.fn().mockResolvedValue(undefined),
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  recordSyncRunMock: vi.fn(),
}));

// --- Mocks ---

vi.mock('./account-db.js', () => ({
  getAccountDb: () => ({
    mutate: mutateMock,
    first: firstMock,
    all: allMock,
  }),
}));

vi.mock('./app-enablebanking/enablebanking-service.js', () => ({
  getTransactions: getTransactionsMock,
  getBalances: getBalancesMock,
}));

vi.mock('./app-enablebanking/utils.js', () => ({
  normalizeTransaction: vi.fn((t: unknown) => ({
    ...(t as object),
    normalized: true,
  })),
}));

vi.mock('./util/alerter.js', () => ({
  triggerAlert: triggerAlertMock,
}));

vi.mock('./util/backup.js', () => ({
  runBackup: vi.fn(),
}));

vi.mock('./util/logger.js', () => ({
  default: loggerMock,
}));

vi.mock('./util/metrics.js', () => ({
  recordSyncRun: recordSyncRunMock,
  recordBackupRun: vi.fn(),
}));

vi.mock('node-cron', () => ({
  default: { schedule: vi.fn() },
}));

// Keep real error classes for instanceof checks
vi.mock('./app-enablebanking/errors.js', async () =>
  vi.importActual('./app-enablebanking/errors.js'),
);

// --- Imports (after mocks) ---

import {
  RateLimitError,
  SessionExpiredError,
} from './app-enablebanking/errors.js';
import type { AccountRow } from './scheduler.js';
import { runScheduledSync, syncOneAccount } from './scheduler.js';

// --- Helpers ---

function makeAccount(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    actual_account_id: 'acct-1',
    eb_account_uid: 'uid-1',
    session_id: 'sess-1',
    valid_until: '2099-12-31',
    aspsp_name: 'TestBank',
    ...overrides,
  };
}

// --- syncOneAccount ---

describe('syncOneAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getTransactionsMock.mockResolvedValue({ booked: [], pending: [] });
    getBalancesMock.mockResolvedValue({});
  });

  it('derives sinceDate from last sync log epoch', async () => {
    // epoch 1700000000 = 2023-11-14T22:13:20Z
    firstMock.mockReturnValue({ synced_at: '1700000000' });

    await syncOneAccount(makeAccount());

    expect(getTransactionsMock).toHaveBeenCalledWith('uid-1', '2023-11-14');
  });

  it('falls back to 90-day window when no sync log exists', async () => {
    firstMock.mockReturnValue(null);

    const expected = new Date(Date.now() - 90 * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0];

    await syncOneAccount(makeAccount());

    expect(getTransactionsMock).toHaveBeenCalledWith('uid-1', expected);
  });

  it('falls back to 90-day window when synced_at is null', async () => {
    firstMock.mockReturnValue({ synced_at: null });

    await syncOneAccount(makeAccount());

    const actualSinceDate = getTransactionsMock.mock.calls[0][1] as string;
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000)
      .toISOString()
      .split('T')[0];
    expect(actualSinceDate).toBe(ninetyDaysAgo);
  });

  it('calls getBalances for the account', async () => {
    firstMock.mockReturnValue(null);

    await syncOneAccount(makeAccount());

    expect(getBalancesMock).toHaveBeenCalledWith('uid-1');
  });

  it('normalizes booked and pending transactions and logs count', async () => {
    firstMock.mockReturnValue(null);
    getTransactionsMock.mockResolvedValue({
      booked: [{ id: 'b1' }, { id: 'b2' }],
      pending: [{ id: 'p1' }],
    });

    await syncOneAccount(makeAccount());

    // 3 transactions total -> sync log records 3
    const insertCall = mutateMock.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('eb_sync_log'),
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe('acct-1');
    expect(params[1]).toBe('uid-1');
    expect(params[2]).toBe(3);
  });

  it('writes success status to eb_sync_log', async () => {
    firstMock.mockReturnValue(null);

    await syncOneAccount(makeAccount());

    expect(mutateMock).toHaveBeenCalledWith(
      expect.stringContaining("'ok'"),
      expect.arrayContaining(['acct-1', 'uid-1']),
    );
  });

  it('logs sync result with transaction count', async () => {
    firstMock.mockReturnValue(null);
    getTransactionsMock.mockResolvedValue({
      booked: [{ id: 'b1' }],
      pending: [],
    });

    await syncOneAccount(makeAccount());

    expect(loggerMock.info).toHaveBeenCalledWith(
      'Synced account',
      expect.objectContaining({
        accountId: 'acct-1',
        transactions: 1,
      }),
    );
  });
});

// --- runScheduledSync ---

describe('runScheduledSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firstMock.mockReturnValue(null);
    getTransactionsMock.mockResolvedValue({ booked: [], pending: [] });
    getBalancesMock.mockResolvedValue({});
  });

  it('syncs all accounts grouped by session', async () => {
    allMock.mockReturnValue([
      makeAccount({
        actual_account_id: 'a1',
        eb_account_uid: 'u1',
        session_id: 's1',
      }),
      makeAccount({
        actual_account_id: 'a2',
        eb_account_uid: 'u2',
        session_id: 's1',
      }),
      makeAccount({
        actual_account_id: 'a3',
        eb_account_uid: 'u3',
        session_id: 's2',
      }),
    ]);

    await runScheduledSync();

    expect(getTransactionsMock).toHaveBeenCalledTimes(3);
    expect(recordSyncRunMock).toHaveBeenCalledWith(3, 0);
  });

  it('skips expired sessions and triggers alert', async () => {
    allMock.mockReturnValue([
      makeAccount({
        actual_account_id: 'a1',
        session_id: 's-expired',
        valid_until: '2020-01-01',
        aspsp_name: 'ExpiredBank',
      }),
    ]);

    await runScheduledSync();

    expect(getTransactionsMock).not.toHaveBeenCalled();
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Skipping expired session',
      expect.objectContaining({ sessionId: 's-expired' }),
    );
    expect(triggerAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'consent_expiry',
        severity: 'error',
      }),
    );
    expect(recordSyncRunMock).toHaveBeenCalledWith(0, 0);
  });

  it('warns but continues syncing for sessions expiring within 14 days', async () => {
    const nearExpiry = new Date(
      Date.now() + 10 * 24 * 3600 * 1000,
    ).toISOString();
    allMock.mockReturnValue([
      makeAccount({
        actual_account_id: 'a1',
        session_id: 's-soon',
        valid_until: nearExpiry,
        aspsp_name: 'SoonBank',
      }),
    ]);

    await runScheduledSync();

    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Consent expiring soon',
      expect.objectContaining({ sessionId: 's-soon' }),
    );
    expect(triggerAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'consent_expiry',
        severity: 'warning',
      }),
    );
    expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    expect(recordSyncRunMock).toHaveBeenCalledWith(1, 0);
  });

  it('does not warn for sessions expiring in more than 14 days', async () => {
    const farExpiry = new Date(
      Date.now() + 30 * 24 * 3600 * 1000,
    ).toISOString();
    allMock.mockReturnValue([
      makeAccount({ session_id: 's-ok', valid_until: farExpiry }),
    ]);

    await runScheduledSync();

    expect(triggerAlertMock).not.toHaveBeenCalled();
    expect(getTransactionsMock).toHaveBeenCalledTimes(1);
  });

  it('breaks session loop on RateLimitError', async () => {
    allMock.mockReturnValue([
      makeAccount({
        actual_account_id: 'a1',
        eb_account_uid: 'u1',
        session_id: 's1',
      }),
      makeAccount({
        actual_account_id: 'a2',
        eb_account_uid: 'u2',
        session_id: 's1',
      }),
    ]);
    getTransactionsMock.mockRejectedValue(new RateLimitError('429'));

    await runScheduledSync();

    // First account hits rate limit, second should be skipped
    expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Rate limited, skipping session',
      expect.objectContaining({ sessionId: 's1' }),
    );
  });

  it('breaks session loop on SessionExpiredError', async () => {
    allMock.mockReturnValue([
      makeAccount({
        actual_account_id: 'a1',
        eb_account_uid: 'u1',
        session_id: 's1',
      }),
      makeAccount({
        actual_account_id: 'a2',
        eb_account_uid: 'u2',
        session_id: 's1',
      }),
    ]);
    getTransactionsMock.mockRejectedValue(new SessionExpiredError('expired'));

    await runScheduledSync();

    expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    expect(loggerMock.warn).toHaveBeenCalledWith(
      'Session expired mid-sync',
      expect.objectContaining({ sessionId: 's1' }),
    );
  });

  it('logs error and records to sync_log on non-retryable failure', async () => {
    vi.useFakeTimers();
    allMock.mockReturnValue([
      makeAccount({ actual_account_id: 'a1', eb_account_uid: 'u1' }),
    ]);
    getTransactionsMock.mockRejectedValue(new Error('Network down'));

    const syncPromise = runScheduledSync();

    // Advance past all retry delays (3 retries: 5s + 10s + 20s)
    await vi.advanceTimersByTimeAsync(60_000);

    await syncPromise;

    vi.useRealTimers();

    expect(loggerMock.error).toHaveBeenCalledWith(
      'Sync failed after retries exhausted',
      expect.objectContaining({ accountId: 'a1' }),
    );
    // Error written to eb_sync_log
    const errorInsert = mutateMock.mock.calls.find(
      (c: unknown[]) =>
        (c[0] as string).includes('eb_sync_log') &&
        (c[0] as string).includes('error'),
    );
    expect(errorInsert).toBeDefined();
    expect(triggerAlertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'sync_failure',
        severity: 'error',
      }),
    );
    expect(recordSyncRunMock).toHaveBeenCalledWith(0, 1);
  });

  it('processes multiple sessions independently', async () => {
    allMock.mockReturnValue([
      makeAccount({
        actual_account_id: 'a1',
        session_id: 's1',
        valid_until: '2020-01-01',
        aspsp_name: 'Expired',
      }),
      makeAccount({
        actual_account_id: 'a2',
        session_id: 's2',
        valid_until: '2099-12-31',
        aspsp_name: 'Good',
      }),
    ]);

    await runScheduledSync();

    // s1 is expired and skipped, s2 syncs normally
    expect(getTransactionsMock).toHaveBeenCalledTimes(1);
    expect(recordSyncRunMock).toHaveBeenCalledWith(1, 0);
  });

  it('handles empty account list', async () => {
    allMock.mockReturnValue([]);

    await runScheduledSync();

    expect(getTransactionsMock).not.toHaveBeenCalled();
    expect(recordSyncRunMock).toHaveBeenCalledWith(0, 0);
  });
});
