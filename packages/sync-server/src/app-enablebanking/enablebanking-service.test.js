import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionExpiredError, RateLimitError } from './errors';

// Mock axios at module level before importing the service.
vi.mock('axios', () => ({
  default: vi.fn(),
}));

// Mock jose so we don't need a real RSA key.
// SignJWT must be a real class because the source does `new SignJWT(...)`.
vi.mock('jose', () => {
  class MockSignJWT {
    setProtectedHeader() {
      return this;
    }
    async sign() {
      return 'mock-jwt-token';
    }
  }
  return {
    importPKCS8: vi.fn().mockResolvedValue('mock-private-key'),
    SignJWT: MockSignJWT,
  };
});

// Mock fs.readFileSync for the private key.
vi.mock('fs', () => ({
  readFileSync: vi
    .fn()
    .mockReturnValue(
      '-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----',
    ),
}));

// Now import the module under test (after mocks are set up).
const { default: axios } = await import('axios');
const {
  loadPrivateKey,
  generateJWT,
  ebRequest,
  getTransactions,
  getBalances,
  getAspsps,
  createAuth,
  exchangeCode,
  getSessionAccounts,
  testAuth,
} = await import('./enablebanking-service');

describe('enablebanking-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadPrivateKey', () => {
    it('returns the imported key', async () => {
      const key = await loadPrivateKey();
      expect(key).toBe('mock-private-key');
    });
  });

  describe('generateJWT', () => {
    it('returns a signed JWT string', async () => {
      const jwt = await generateJWT();
      expect(jwt).toBe('mock-jwt-token');
    });
  });

  describe('ebRequest', () => {
    it('makes an authenticated request with Bearer token', async () => {
      axios.mockResolvedValueOnce({ data: { ok: true } });

      const response = await ebRequest('GET', '/test-path');

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          headers: { Authorization: 'Bearer mock-jwt-token' },
        }),
      );
      expect(response.data).toEqual({ ok: true });
    });

    it('passes request body for POST requests', async () => {
      axios.mockResolvedValueOnce({ data: {} });

      await ebRequest('POST', '/auth', { code: '123' });

      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: { code: '123' },
        }),
      );
    });

    it('throws SessionExpiredError on 401 response', async () => {
      const axiosError = new Error('Unauthorized');
      axiosError.response = {
        status: 401,
        data: { message: 'Token expired' },
      };
      axios.mockRejectedValueOnce(axiosError);

      await expect(ebRequest('GET', '/test')).rejects.toThrow(
        SessionExpiredError,
      );
    });

    it('throws SessionExpiredError on 403 response', async () => {
      const axiosError = new Error('Forbidden');
      axiosError.response = { status: 403, data: {} };
      axios.mockRejectedValueOnce(axiosError);

      await expect(ebRequest('GET', '/test')).rejects.toThrow(
        SessionExpiredError,
      );
    });

    it('throws RateLimitError on 429 response', async () => {
      const axiosError = new Error('Too Many Requests');
      axiosError.response = { status: 429, data: {} };
      axios.mockRejectedValueOnce(axiosError);

      await expect(ebRequest('GET', '/test')).rejects.toThrow(RateLimitError);
    });

    it('re-throws other errors as-is', async () => {
      const genericError = new Error('Network failure');
      axios.mockRejectedValueOnce(genericError);

      await expect(ebRequest('GET', '/test')).rejects.toThrow(
        'Network failure',
      );
    });
  });

  describe('testAuth', () => {
    it('calls GET /application and returns data', async () => {
      axios.mockResolvedValueOnce({
        data: { application_id: 'test-app' },
      });

      const result = await testAuth();
      expect(result).toEqual({ application_id: 'test-app' });
    });
  });

  describe('getAspsps', () => {
    it('calls GET /aspsps with country parameter', async () => {
      axios.mockResolvedValueOnce({
        data: { aspsps: [{ name: 'Nordea', country: 'FI' }] },
      });

      const result = await getAspsps('FI');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/aspsps?country=FI'),
        }),
      );
      expect(result.aspsps).toHaveLength(1);
    });
  });

  describe('createAuth', () => {
    it('calls POST /auth with correct payload', async () => {
      // createAuth now calls getAspsps() first (GET /aspsps) then POST /auth.
      // Mock GET /aspsps response (first call - consumed by getAspsps() internally)
      axios.mockResolvedValueOnce({
        data: {
          aspsps: [
            {
              name: 'Nordea',
              country: 'FI',
              maximum_consent_validity: 7776000,
            },
          ],
        },
      });
      // Mock POST /auth response (second call)
      axios.mockResolvedValueOnce({
        data: { url: 'https://bank.example/auth', state: 'test-state' },
      });

      const result = await createAuth({
        aspspName: 'Nordea',
        aspspCountry: 'FI',
        redirectUrl: 'http://localhost/callback',
        state: 'test-state',
      });

      expect(axios).toHaveBeenCalledTimes(2);
      expect(axios.mock.calls[1][0]).toEqual(
        expect.objectContaining({
          method: 'POST',
          data: expect.objectContaining({
            aspsp: { name: 'Nordea', country: 'FI' },
            redirect_url: 'http://localhost/callback',
            state: 'test-state',
            access: { valid_until: expect.any(String) },
          }),
        }),
      );
      expect(result.url).toBe('https://bank.example/auth');
    });

    it('sets valid_until based on ASPSP maximum_consent_validity', async () => {
      const before = Date.now();
      // 7776000 seconds = 90 days
      axios.mockResolvedValueOnce({
        data: {
          aspsps: [
            { name: 'Test', country: 'FI', maximum_consent_validity: 7776000 },
          ],
        },
      });
      axios.mockResolvedValueOnce({ data: {} });

      await createAuth({
        aspspName: 'Test',
        aspspCountry: 'FI',
        redirectUrl: 'http://localhost/callback',
        state: 's',
      });

      const callData = axios.mock.calls[1][0].data;
      const validUntil = new Date(callData.access.valid_until).getTime();
      const ninetyDays = 90 * 24 * 60 * 60 * 1000;
      expect(validUntil).toBeGreaterThanOrEqual(before + ninetyDays - 1000);
      expect(validUntil).toBeLessThanOrEqual(before + ninetyDays + 5000);
    });

    it('falls back to 180-day validity when ASPSP has no maximum_consent_validity', async () => {
      const before = Date.now();
      axios.mockResolvedValueOnce({
        data: { aspsps: [{ name: 'TestBank', country: 'FI' }] },
      });
      axios.mockResolvedValueOnce({ data: {} });

      await createAuth({
        aspspName: 'TestBank',
        aspspCountry: 'FI',
        redirectUrl: 'http://localhost/callback',
        state: 's',
      });

      const callData = axios.mock.calls[1][0].data;
      const validUntil = new Date(callData.access.valid_until).getTime();
      const oneEightyDays = 180 * 24 * 60 * 60 * 1000;
      expect(validUntil).toBeGreaterThanOrEqual(before + oneEightyDays - 5000);
    });

    it('warns when ASPSP name not found in listing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      axios.mockResolvedValueOnce({
        data: { aspsps: [{ name: 'OtherBank', country: 'FI' }] },
      });
      axios.mockResolvedValueOnce({ data: {} });

      await createAuth({
        aspspName: 'Nordea',
        aspspCountry: 'FI',
        redirectUrl: 'http://localhost/callback',
        state: 's',
      });

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('ASPSP "Nordea" not found'),
      );
      warnSpy.mockRestore();
    });
  });

  describe('exchangeCode', () => {
    it('calls POST /sessions with the code', async () => {
      axios.mockResolvedValueOnce({
        data: { session_id: 'sess-1', accounts: [], valid_until: '2026-05-01' },
      });

      const result = await exchangeCode('auth-code-123');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          data: { code: 'auth-code-123' },
        }),
      );
      expect(result.session_id).toBe('sess-1');
    });
  });

  describe('getSessionAccounts', () => {
    it('calls GET /sessions/:id', async () => {
      axios.mockResolvedValueOnce({
        data: { accounts: [{ uid: 'acct-1' }] },
      });

      const result = await getSessionAccounts('sess-1');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/sessions/sess-1'),
        }),
      );
      expect(result.accounts).toHaveLength(1);
    });
  });

  describe('getTransactions', () => {
    it('returns booked and pending transactions from a single page', async () => {
      axios.mockResolvedValueOnce({
        data: {
          booked: [{ entry_reference: 'b1' }],
          pending: [{ entry_reference: 'p1' }],
        },
      });

      const result = await getTransactions('acct-uid', '2026-01-01');
      expect(result.booked).toHaveLength(1);
      expect(result.pending).toHaveLength(1);
    });

    it('follows continuation_key for pagination', async () => {
      axios
        .mockResolvedValueOnce({
          data: {
            booked: [{ entry_reference: 'b1' }],
            pending: [],
            continuation_key: 'page2',
          },
        })
        .mockResolvedValueOnce({
          data: {
            booked: [{ entry_reference: 'b2' }],
            pending: [],
          },
        });

      const result = await getTransactions('acct-uid', '2026-01-01');
      expect(result.booked).toHaveLength(2);
      expect(axios).toHaveBeenCalledTimes(2);
    });

    it('stops at maxPages limit to prevent infinite loops', async () => {
      // Simulate an API that always returns a continuation_key.
      // Queue exactly 100 mocks (the loop consumes exactly 100 before breaking).
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      for (let i = 0; i < 100; i++) {
        axios.mockResolvedValueOnce({
          data: {
            booked: [{ entry_reference: `b${i}` }],
            pending: [],
            continuation_key: `page${i + 1}`,
          },
        });
      }

      const result = await getTransactions('acct-uid', '2026-01-01');
      // Should stop at 100 pages (maxPages), not loop forever.
      expect(axios).toHaveBeenCalledTimes(100);
      expect(result.booked).toHaveLength(100);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('hit maxPages limit'),
      );
      warnSpy.mockRestore();
    });

    it('handles pages with no booked or pending arrays', async () => {
      axios.mockResolvedValueOnce({
        data: { continuation_key: null },
      });

      const result = await getTransactions('acct-uid', '2026-01-01');
      expect(result.booked).toHaveLength(0);
      expect(result.pending).toHaveLength(0);
    });

    it('passes startDate as date_from query parameter', async () => {
      axios.mockResolvedValueOnce({ data: { booked: [], pending: [] } });

      await getTransactions('acct-uid', '2026-02-15');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('date_from=2026-02-15'),
        }),
      );
    });

    it('passes initial continuationKey if provided', async () => {
      axios.mockResolvedValueOnce({ data: { booked: [], pending: [] } });

      await getTransactions('acct-uid', '2026-01-01', 'existing-key');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('continuation_key=existing-key'),
        }),
      );
    });
  });

  describe('getBalances', () => {
    it('calls GET /accounts/:uid/balances and returns data', async () => {
      axios.mockResolvedValueOnce({
        data: {
          balances: [
            {
              balance_type: 'CLAV',
              balance_amount: { amount: '100.00', currency: 'EUR' },
            },
          ],
        },
      });

      const result = await getBalances('acct-uid');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/accounts/acct-uid/balances'),
        }),
      );
      expect(result.balances).toHaveLength(1);
    });
  });
});
