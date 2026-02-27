// @ts-strict-ignore
import { readFileSync } from 'fs';

import axios from 'axios';
import { SignJWT, importPKCS8 } from 'jose';

import { SessionExpiredError, RateLimitError } from './errors.js';

const baseUrl =
  process.env.ENABLE_BANKING_BASE_URL ?? 'https://api.enablebanking.com';
const appId = process.env.ENABLE_BANKING_APP_ID;
const keyPath =
  process.env.ENABLE_BANKING_KEY_PATH ?? '/run/secrets/eb_private.pem';

// Module-level cache so the key is imported once per process lifetime.
let cachedPrivateKey = null;

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

export async function ebRequest(method, path, data?) {
  const jwt = await generateJWT();

  try {
    const response = await axios({
      method,
      url: `${baseUrl}${path}`,
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      data,
    });

    return response;
  } catch (err) {
    if (err.response) {
      const status = err.response.status;
      if (status === 401 || status === 403) {
        throw new SessionExpiredError(
          `Enable Banking auth failed (${status}): ${err.response.data?.message ?? err.message}`,
        );
      }
      if (status === 429) {
        throw new RateLimitError(
          `Enable Banking rate limit hit: ${err.response.data?.message ?? err.message}`,
        );
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
export async function getAspsps(country) {
  const response = await ebRequest('GET', '/aspsps?country=' + country);
  return response.data;
}

// [eb] Initiates an OAuth authorization flow for the given bank.
// Returns { url, state } where url is the bank's redirect URL and state is an
// opaque token stored in eb_sessions for CSRF protection.
export async function createAuth({
  aspspName,
  aspspCountry,
  redirectUrl,
  state,
}) {
  const validUntil = new Date(
    Date.now() + 90 * 24 * 60 * 60 * 1000,
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
export async function exchangeCode(code) {
  const response = await ebRequest('POST', '/sessions', { code });
  return response.data;
}

// [eb] Retrieves account list and session details for an existing session.
export async function getSessionAccounts(sessionId) {
  const response = await ebRequest('GET', '/sessions/' + sessionId);
  return response.data;
}

// [eb] Fetches all transactions for an account from startDate onward.
// Handles continuation_key pagination automatically.
// SAFEGUARD: maxPages=100 prevents infinite loops if the API misbehaves.
export async function getTransactions(accountUid, startDate, continuationKey?) {
  const booked = [];
  const pending = [];
  const maxPages = 100;
  let pageCount = 0;
  let nextKey = continuationKey ?? null;

  do {
    const qs =
      '?date_from=' +
      startDate +
      (nextKey ? '&continuation_key=' + nextKey : '');

    const response = await ebRequest(
      'GET',
      '/accounts/' + accountUid + '/transactions' + qs,
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
export async function getBalances(accountUid) {
  const response = await ebRequest(
    'GET',
    '/accounts/' + accountUid + '/balances',
  );
  return response.data;
}
