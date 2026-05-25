import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountDb } from '../account-db';

import { isValidRedirectUrl } from './openid.js';

vi.mock('../account-db', () => {
  let serverHostname = 'https://budget.example.com';

  const db = {
    first: vi.fn(() => ({
      extra_data: JSON.stringify({ server_hostname: serverHostname }),
    })),
    _setServerHostname: hostname => {
      serverHostname = hostname;
    },
  };

  return {
    clearExpiredSessions: vi.fn(),
    getAccountDb: () => db,
    listLoginMethods: vi.fn(() => []),
  };
});

vi.mock('../load-config', () => ({
  config: {
    get: vi.fn(() => null),
  },
}));

function setServerHostname(serverHostname) {
  getAccountDb()._setServerHostname(serverHostname);
}

describe('isValidRedirectUrl', () => {
  beforeEach(() => {
    setServerHostname('https://budget.example.com');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('blocks localhost redirects when the server hostname is production', () => {
    expect(isValidRedirectUrl('http://localhost:3000/openid-cb')).toBe(false);
  });

  it('allows redirects with the same scheme, hostname, and port', () => {
    setServerHostname('https://budget.example.com:8443');

    expect(
      isValidRedirectUrl('https://budget.example.com:8443/openid-cb'),
    ).toBe(true);
  });

  it('allows localhost redirects when the server hostname is localhost', () => {
    setServerHostname('http://localhost:3000');

    expect(isValidRedirectUrl('http://localhost:3000/openid-cb')).toBe(true);
  });

  it('blocks redirects with a different scheme', () => {
    expect(isValidRedirectUrl('http://budget.example.com/openid-cb')).toBe(
      false,
    );
  });

  it('blocks redirects with a different port', () => {
    setServerHostname('https://budget.example.com:8443');

    expect(isValidRedirectUrl('https://budget.example.com/openid-cb')).toBe(
      false,
    );
  });
});
