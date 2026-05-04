// @ts-strict-ignore
import * as asyncStorage from '../../platform/server/asyncStorage';
import { logger } from '../../platform/server/log';
import { isNonProductionEnvironment } from '../../shared/environment';
import type { GoCardlessToken } from '../../types/models';
import { PostError } from '../errors';
import { get, post } from '../post';
import { getServer } from '../server-config';

let stopPolling = false;

export async function pollGoCardlessWebToken({
  requisitionId,
}: {
  requisitionId: string;
}) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unknown' };

  const startTime = Date.now();
  stopPolling = false;

  async function getData(
    cb: (
      data:
        | { status: 'timeout' }
        | { status: 'unknown'; message?: string }
        | { status: 'success'; data: GoCardlessToken },
    ) => void,
  ) {
    if (stopPolling) {
      return;
    }

    if (Date.now() - startTime >= 1000 * 60 * 10) {
      cb({ status: 'timeout' });
      return;
    }

    const serverConfig = getServer();
    if (!serverConfig) {
      throw new Error('Failed to get server config.');
    }

    const data = await post(
      serverConfig.GOCARDLESS_SERVER + '/get-accounts',
      {
        requisitionId,
      },
      {
        'X-ACTUAL-TOKEN': userToken,
      },
    );

    if (data) {
      if (data.error_code) {
        logger.error('Failed linking gocardless account:', data);
        cb({ status: 'unknown', message: data.error_type });
      } else {
        cb({ status: 'success', data });
      }
    } else {
      setTimeout(() => getData(cb), 3000);
    }
  }

  return new Promise(resolve => {
    getData(data => {
      if (data.status === 'success') {
        resolve({ data: data.data });
        return;
      }

      if (data.status === 'timeout') {
        resolve({ error: data.status });
        return;
      }

      resolve({
        error: data.status,
        message: data.message,
      });
    });
  });
}

export async function stopGoCardlessWebTokenPolling() {
  stopPolling = true;
  return 'ok';
}

export async function goCardlessStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.GOCARDLESS_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function simpleFinStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.SIMPLEFIN_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function pluggyAiStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.PLUGGYAI_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function simpleFinAccounts() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.SIMPLEFIN_SERVER + '/accounts',
      {},
      {
        'X-ACTUAL-TOKEN': userToken,
      },
      60000,
    );
  } catch {
    return { error_code: 'TIMED_OUT' };
  }
}

export async function pluggyAiAccounts() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.PLUGGYAI_SERVER + '/accounts',
      {},
      {
        'X-ACTUAL-TOKEN': userToken,
      },
      60000,
    );
  } catch {
    return { error_code: 'TIMED_OUT' };
  }
}

export async function getGoCardlessBanks(country: string) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.GOCARDLESS_SERVER + '/get-banks',
    { country, showDemo: isNonProductionEnvironment() },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function createGoCardlessWebToken({
  institutionId,
  accessValidForDays,
}: {
  institutionId: string;
  accessValidForDays: number;
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.GOCARDLESS_SERVER + '/create-web-token',
      {
        institutionId,
        accessValidForDays,
      },
      {
        'X-ACTUAL-TOKEN': userToken,
      },
    );
  } catch (error) {
    logger.error(error);
    return { error: 'failed' };
  }
}

export async function setSecret({
  name,
  value,
}: {
  name: string;
  value: string | null;
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await post(
      serverConfig.BASE_SERVER + '/secret',
      {
        name,
        value,
      },
      {
        'X-ACTUAL-TOKEN': userToken,
      },
    );
  } catch (error) {
    return {
      error: 'failed',
      reason: error instanceof PostError ? error.reason : undefined,
    };
  }
}

export async function checkSecret(name: string) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  try {
    return await get(serverConfig.BASE_SERVER + '/secret/' + name, {
      'X-ACTUAL-TOKEN': userToken,
    });
  } catch (error) {
    logger.error(error);
    return { error: 'failed' };
  }
}

// ---------------------------------------------------------------------------
// Enable Banking provider status handlers
// ---------------------------------------------------------------------------

export async function enableBankingStatus() {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.ENABLEBANKING_SERVER + '/status',
    {},
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function enableBankingGetBanks({ country }: { country: string }) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.ENABLEBANKING_SERVER + '/get-banks',
    { country },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function enableBankingCreateAuth({
  aspspName,
  aspspCountry,
}: {
  aspspName: string;
  aspspCountry: string;
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.ENABLEBANKING_SERVER + '/create-auth',
    { aspspName, aspspCountry },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function enableBankingPollSession({ state }: { state: string }) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.ENABLEBANKING_SERVER + '/get-accounts',
    { state },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function enableBankingSyncStatus({
  accountIds,
}: {
  accountIds: string[];
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.ENABLEBANKING_SERVER + '/sync-status',
    { accountIds },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

export async function enableBankingReauthComplete({
  newSessionId,
  oldSessionId,
}: {
  newSessionId: string;
  oldSessionId: string;
}) {
  const userToken = await asyncStorage.getItem('user-token');

  if (!userToken) {
    return { error: 'unauthorized' };
  }

  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  return post(
    serverConfig.ENABLEBANKING_SERVER + '/reauth-complete',
    { newSessionId, oldSessionId },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );
}

// ---------------------------------------------------------------------------
// Operational alerts IPC handlers
// ---------------------------------------------------------------------------

export async function fetchOperationalAlerts() {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('Failed to get server config.');

  const text = await get(serverConfig.BASE_SERVER + '/alerts', {
    headers: { 'X-ACTUAL-TOKEN': userToken },
  });
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'parse-error' };
  }
}

export async function acknowledgeOperationalAlert({
  alertId,
}: {
  alertId: string;
}) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('Failed to get server config.');

  return post(
    serverConfig.BASE_SERVER + '/alerts/acknowledge',
    { alertId },
    { 'X-ACTUAL-TOKEN': userToken },
  );
}

// ---------------------------------------------------------------------------
// Production trust IPC handlers
// ---------------------------------------------------------------------------

export async function fetchProductionTrustStatus() {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('Failed to get server config.');

  const text = await get(serverConfig.BASE_SERVER + '/production-trust', {
    headers: { 'X-ACTUAL-TOKEN': userToken },
  });
  try {
    const response = JSON.parse(text);
    return response.status === 'ok'
      ? response.data
      : { error: response.reason || 'unknown' };
  } catch {
    return { error: 'parse-error' };
  }
}

export async function recordProductionTrustUntrusted({
  condition,
  reason,
  message,
  evidence,
}: {
  condition: string;
  reason: string;
  message?: string;
  evidence?: unknown;
}) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('Failed to get server config.');

  return post(
    serverConfig.BASE_SERVER + '/production-trust/record',
    { condition, reason, message, evidence },
    { 'X-ACTUAL-TOKEN': userToken },
  );
}

export async function runProductionTrustCheck({
  condition,
  maxAgeMs,
}: {
  condition?: string;
  maxAgeMs?: number;
} = {}) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('Failed to get server config.');

  return post(
    serverConfig.BASE_SERVER + '/production-trust/check',
    { condition, maxAgeMs },
    { 'X-ACTUAL-TOKEN': userToken },
  );
}

export async function verifyProductionTrustManually({
  condition,
  message,
  evidence,
}: {
  condition: string;
  message?: string;
  evidence?: unknown;
}) {
  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) return { error: 'unauthorized' };

  const serverConfig = getServer();
  if (!serverConfig) throw new Error('Failed to get server config.');

  return post(
    serverConfig.BASE_SERVER + '/production-trust/manual-verify',
    { condition, message, evidence },
    { 'X-ACTUAL-TOKEN': userToken },
  );
}
