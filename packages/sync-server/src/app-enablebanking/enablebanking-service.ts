import { readFileSync } from 'fs';

import axios, { isAxiosError } from 'axios';
import { SignJWT, importPKCS8 } from 'jose';

import { SessionExpiredError, RateLimitError } from './errors.js';

const baseUrl =
  process.env.ENABLE_BANKING_BASE_URL ?? 'https://api.enablebanking.com';
const appId = process.env.ENABLE_BANKING_APP_ID;
const keyPath =
  process.env.ENABLE_BANKING_KEY_PATH ?? '/run/secrets/eb_private.pem';

let cachedPrivateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;

export function clearKeyCache() {
  cachedPrivateKey = null;
}

export async function loadPrivateKey() {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  const pem = readFileSync(keyPath, 'utf-8');
  cachedPrivateKey = await importPKCS8(pem, 'RS256');
  return cachedPrivateKey;
}

export async function generateJWT() {
  const privateKey = await loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: appId })
    .sign(privateKey);

  return jwt;
}

export async function ebRequest(
  method: string,
  path: string,
  data?: unknown,
  params?: Record<string, string>,
) {
  const jwt = await generateJWT();

  try {
    const response = await axios({
      method,
      url: `${baseUrl}${path}`,
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      data,
      params,
    });

    return response;
  } catch (err: unknown) {
    if (isAxiosError(err) && err.response) {
      const status = err.response.status;
      const respData = err.response.data as Record<string, unknown> | undefined;
      const message =
        (respData?.message as string) ??
        (respData?.error as string) ??
        (respData?.detail as string) ??
        err.message;
      if (status === 401 || status === 403) {
        throw new SessionExpiredError(
          `Enable Banking auth failed (${status}): ${message}`,
        );
      }
      if (status === 429) {
        throw new RateLimitError(`Enable Banking rate limit hit: ${message}`);
      }
    }
    throw err;
  }
}

export async function testAuth() {
  const response = await ebRequest('GET', '/application');
  return response.data;
}

// [eb] Returns list of supported ASPSPs (banks) for a given country code.
export async function getAspsps(country: string) {
  const response = await ebRequest('GET', '/aspsps', undefined, { country });
  return response.data;
}

// [eb] Initiates an OAuth authorization flow for the given bank.
// Returns { url, state } where url is the bank's redirect URL and state is an
// opaque token stored in eb_sessions for CSRF protection.
//
// Consent validity is read from the bank's maximum_consent_validity field
// (returned by GET /aspsps) so each bank gets the longest allowed duration.
// Falls back to 180 days when the field is absent or the ASPSP is not found.
export async function createAuth({
  aspspName,
  aspspCountry,
  redirectUrl,
  state,
}: {
  aspspName: string;
  aspspCountry: string;
  redirectUrl: string;
  state: string;
}) {
  const aspspsBody = await getAspsps(aspspCountry);
  const aspsps = aspspsBody.aspsps || [];
  const aspsp = aspsps.find(
    (a: { name: string; maximum_consent_validity?: number }) =>
      a.name === aspspName,
  );
  if (!aspsp) {
    console.warn(
      `[createAuth] ASPSP "${aspspName}" not found in ${aspspCountry} listing (${aspsps.length} entries). Falling back to 180-day consent validity.`,
    );
  }
  const maxValiditySeconds = aspsp?.maximum_consent_validity ?? 180 * 24 * 3600;
  const validUntil = new Date(
    Date.now() + maxValiditySeconds * 1000,
  ).toISOString();

  const response = await ebRequest('POST', '/auth', {
    aspsp: { name: aspspName, country: aspspCountry },
    redirect_url: redirectUrl,
    state,
    access: { valid_until: validUntil },
  });

  return response.data;
}

// [eb] Exchanges the OAuth authorization code for a session.
// Returns { session_id, accounts, valid_until }.
export async function exchangeCode(code: string) {
  const response = await ebRequest('POST', '/sessions', { code });
  return response.data;
}

// [eb] Retrieves account list and session details for an existing session.
export async function getSessionAccounts(sessionId: string) {
  const response = await ebRequest('GET', `/sessions/${sessionId}`);
  return response.data;
}

// [eb] Fetches all transactions for an account from startDate onward.
// Handles continuation_key pagination automatically.
// SAFEGUARD: maxPages=100 prevents infinite loops if the API misbehaves.
export async function getTransactions(
  accountUid: string,
  startDate: string,
  continuationKey?: string,
) {
  const booked: unknown[] = [];
  const pending: unknown[] = [];
  const maxPages = 100;
  let pageCount = 0;
  let nextKey: string | null = continuationKey ?? null;

  do {
    const params: Record<string, string> = { date_from: startDate };
    if (nextKey) {
      params.continuation_key = nextKey;
    }

    const response = await ebRequest(
      'GET',
      `/accounts/${accountUid}/transactions`,
      undefined,
      params,
    );

    const data = response.data;

    if (Array.isArray(data.booked)) {
      booked.push(...data.booked);
    }
    if (Array.isArray(data.pending)) {
      pending.push(...data.pending);
    }

    nextKey = data.continuation_key ?? null;
    pageCount++;

    if (pageCount >= maxPages && nextKey) {
      console.warn(
        'getTransactions: hit maxPages limit (100) for account ' + accountUid,
      );
      break;
    }
  } while (nextKey);

  return { booked, pending };
}

// [eb] Returns balance information for an account.
export async function getBalances(accountUid: string) {
  const response = await ebRequest('GET', `/accounts/${accountUid}/balances`);
  return response.data;
}
