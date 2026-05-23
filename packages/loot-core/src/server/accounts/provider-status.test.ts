// @ts-strict-ignore
// [eb] Tests for fork-added provider-status functions.
// All fork functions share the same auth-guard pattern: check user-token,
// get server config, call post()/get(). These tests verify the guard and
// the correct server endpoint for each function.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, getMock, getItemMock, getServerMock } = vi.hoisted(() => ({
  postMock: vi.fn().mockResolvedValue({ status: 'ok' }),
  getMock: vi.fn().mockResolvedValue('{"status":"ok"}'),
  getItemMock: vi.fn(),
  getServerMock: vi.fn(),
}));

vi.mock('../post', () => ({
  post: postMock,
  get: getMock,
  PostError: class PostError extends Error {
    reason: string;
    constructor(reason: string) {
      super(reason);
      this.reason = reason;
    }
  },
}));

vi.mock('../server-config', () => ({
  getServer: getServerMock,
}));

vi.mock('../../platform/server/asyncStorage', () => ({
  getItem: getItemMock,
}));

vi.mock('../../platform/server/log', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('../../shared/environment', () => ({
  isNonProductionEnvironment: () => false,
}));

import {
  acknowledgeOperationalAlert,
  enableBankingCreateAuth,
  enableBankingGetBanks,
  enableBankingPollSession,
  enableBankingReauthComplete,
  enableBankingStatus,
  enableBankingSyncStatus,
  fetchOperationalAlerts,
  fetchProductionTrustStatus,
  recordProductionTrustUntrusted,
  runProductionTrustCheck,
  verifyProductionTrustManually,
} from './provider-status';

const MOCK_SERVER = {
  BASE_SERVER: 'https://server.test',
  ENABLEBANKING_SERVER: 'https://server.test/enablebanking',
  GOCARDLESS_SERVER: 'https://server.test/gocardless',
  SIMPLEFIN_SERVER: 'https://server.test/simplefin',
  PLUGGYAI_SERVER: 'https://server.test/pluggyai',
};

beforeEach(() => {
  vi.clearAllMocks();
  getServerMock.mockReturnValue(MOCK_SERVER);
  postMock.mockResolvedValue({ status: 'ok' });
  getMock.mockResolvedValue('{"status":"ok"}');
});

// --- Auth guard (shared pattern) ---

describe('auth guard', () => {
  const forkFunctions = [
    {
      name: 'enableBankingStatus',
      fn: () => enableBankingStatus(),
    },
    {
      name: 'enableBankingGetBanks',
      fn: () => enableBankingGetBanks({ country: 'NL' }),
    },
    {
      name: 'enableBankingCreateAuth',
      fn: () =>
        enableBankingCreateAuth({ aspspName: 'ING', aspspCountry: 'NL' }),
    },
    {
      name: 'enableBankingPollSession',
      fn: () => enableBankingPollSession({ state: 'abc' }),
    },
    {
      name: 'enableBankingSyncStatus',
      fn: () => enableBankingSyncStatus({ accountIds: ['a1'] }),
    },
    {
      name: 'enableBankingReauthComplete',
      fn: () =>
        enableBankingReauthComplete({
          newSessionId: 'new',
          oldSessionId: 'old',
        }),
    },
    {
      name: 'fetchOperationalAlerts',
      fn: () => fetchOperationalAlerts(),
    },
    {
      name: 'acknowledgeOperationalAlert',
      fn: () => acknowledgeOperationalAlert({ alertId: 'a1' }),
    },
    {
      name: 'fetchProductionTrustStatus',
      fn: () => fetchProductionTrustStatus(),
    },
    {
      name: 'recordProductionTrustUntrusted',
      fn: () =>
        recordProductionTrustUntrusted({ condition: 'test', reason: 'test' }),
    },
    {
      name: 'runProductionTrustCheck',
      fn: () => runProductionTrustCheck({}),
    },
    {
      name: 'verifyProductionTrustManually',
      fn: () => verifyProductionTrustManually({ condition: 'test' }),
    },
  ];

  for (const { name, fn } of forkFunctions) {
    it(`${name} returns unauthorized when no user token`, async () => {
      getItemMock.mockResolvedValue(null);
      const result = await fn();
      expect(result).toEqual({ error: 'unauthorized' });
      expect(postMock).not.toHaveBeenCalled();
    });
  }

  for (const { name, fn } of forkFunctions) {
    it(`${name} throws when server config is missing`, async () => {
      getItemMock.mockResolvedValue('valid-token');
      getServerMock.mockReturnValue(null);
      await expect(fn()).rejects.toThrow('Failed to get server config');
    });
  }
});

// --- Enable Banking endpoint routing ---

describe('enableBanking functions call correct endpoints', () => {
  beforeEach(() => {
    getItemMock.mockResolvedValue('valid-token');
  });

  it('enableBankingStatus calls /status', async () => {
    await enableBankingStatus();
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/enablebanking/status',
      {},
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('enableBankingGetBanks calls /get-banks with country', async () => {
    await enableBankingGetBanks({ country: 'NL' });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/enablebanking/get-banks',
      { country: 'NL' },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('enableBankingCreateAuth calls /create-auth', async () => {
    await enableBankingCreateAuth({ aspspName: 'ING', aspspCountry: 'NL' });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/enablebanking/create-auth',
      { aspspName: 'ING', aspspCountry: 'NL' },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('enableBankingPollSession calls /get-accounts', async () => {
    await enableBankingPollSession({ state: 'xyz' });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/enablebanking/get-accounts',
      { state: 'xyz' },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('enableBankingSyncStatus calls /sync-status', async () => {
    await enableBankingSyncStatus({ accountIds: ['a1', 'a2'] });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/enablebanking/sync-status',
      { accountIds: ['a1', 'a2'] },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('enableBankingReauthComplete calls /reauth-complete', async () => {
    await enableBankingReauthComplete({
      newSessionId: 'new-1',
      oldSessionId: 'old-1',
    });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/enablebanking/reauth-complete',
      { newSessionId: 'new-1', oldSessionId: 'old-1' },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });
});

// --- Operational alerts ---

describe('operational alerts', () => {
  beforeEach(() => {
    getItemMock.mockResolvedValue('valid-token');
  });

  it('fetchOperationalAlerts calls GET /alerts', async () => {
    getMock.mockResolvedValue(JSON.stringify({ alerts: [{ id: '1' }] }));
    const result = await fetchOperationalAlerts();
    expect(getMock).toHaveBeenCalledWith(
      'https://server.test/alerts',
      expect.objectContaining({
        headers: { 'X-ACTUAL-TOKEN': 'valid-token' },
      }),
    );
    expect(result).toEqual({ alerts: [{ id: '1' }] });
  });

  it('fetchOperationalAlerts returns parse-error on invalid JSON', async () => {
    getMock.mockResolvedValue('not-json');
    const result = await fetchOperationalAlerts();
    expect(result).toEqual({ error: 'parse-error' });
  });

  it('acknowledgeOperationalAlert posts to /alerts/acknowledge', async () => {
    await acknowledgeOperationalAlert({ alertId: 'alert-42' });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/alerts/acknowledge',
      { alertId: 'alert-42' },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });
});

// --- Production trust ---

describe('production trust', () => {
  beforeEach(() => {
    getItemMock.mockResolvedValue('valid-token');
  });

  it('fetchProductionTrustStatus parses ok response', async () => {
    getMock.mockResolvedValue(
      JSON.stringify({ status: 'ok', data: { score: 95 } }),
    );
    const result = await fetchProductionTrustStatus();
    expect(result).toEqual({ score: 95 });
  });

  it('fetchProductionTrustStatus returns error on non-ok status', async () => {
    getMock.mockResolvedValue(
      JSON.stringify({ status: 'error', reason: 'db-down' }),
    );
    const result = await fetchProductionTrustStatus();
    expect(result).toEqual({ error: 'db-down' });
  });

  it('fetchProductionTrustStatus returns parse-error on invalid JSON', async () => {
    getMock.mockResolvedValue('broken');
    const result = await fetchProductionTrustStatus();
    expect(result).toEqual({ error: 'parse-error' });
  });

  it('recordProductionTrustUntrusted posts to /production-trust/record', async () => {
    await recordProductionTrustUntrusted({
      condition: 'stale-sync',
      reason: 'last sync >24h ago',
      message: 'check scheduler',
    });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/production-trust/record',
      expect.objectContaining({
        condition: 'stale-sync',
        reason: 'last sync >24h ago',
      }),
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('runProductionTrustCheck posts to /production-trust/check', async () => {
    await runProductionTrustCheck({
      condition: 'sync-health',
      maxAgeMs: 60000,
    });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/production-trust/check',
      { condition: 'sync-health', maxAgeMs: 60000 },
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });

  it('verifyProductionTrustManually posts to /production-trust/manual-verify', async () => {
    await verifyProductionTrustManually({
      condition: 'data-integrity',
      message: 'verified by admin',
    });
    expect(postMock).toHaveBeenCalledWith(
      'https://server.test/production-trust/manual-verify',
      expect.objectContaining({
        condition: 'data-integrity',
        message: 'verified by admin',
      }),
      expect.objectContaining({ 'X-ACTUAL-TOKEN': 'valid-token' }),
    );
  });
});
