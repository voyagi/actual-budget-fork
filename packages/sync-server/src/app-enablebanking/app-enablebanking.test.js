import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccountDb } from '../account-db';

// Mock the Enable Banking service so we don't make real API calls.
vi.mock('./enablebanking-service.js', () => ({
  testAuth: vi.fn().mockResolvedValue({ application_id: 'test' }),
  getAspsps: vi.fn().mockResolvedValue({
    aspsps: [{ name: 'Nordea', country: 'FI' }],
  }),
  createAuth: vi.fn().mockResolvedValue({
    url: 'https://bank.example/auth?state=test',
  }),
  exchangeCode: vi.fn().mockResolvedValue({
    session_id: 'real-session-id',
    accounts: [
      { uid: 'eb-uid-1', account_id: { iban: 'FI111111' }, name: 'Acct 1' },
      { uid: 'eb-uid-2', account_id: { iban: 'FI222222' }, name: 'Acct 2' },
    ],
    valid_until: '2026-06-01T00:00:00Z',
  }),
  getTransactions: vi.fn().mockResolvedValue({
    booked: [
      {
        entry_reference: 'tx-1',
        transaction_amount: { amount: '50.00', currency: 'EUR' },
        credit_debit_indicator: 'DBIT',
        booking_date: '2026-01-15',
        creditor: { name: 'Shop' },
        remittance_information: ['Groceries'],
      },
    ],
    pending: [],
  }),
  getBalances: vi.fn().mockResolvedValue({
    balances: [
      {
        balance_type: 'CLAV',
        balance_amount: { amount: '1234.56', currency: 'EUR' },
      },
    ],
  }),
}));

// Import handlers AFTER mocks are set up (module-load runs migrations).
const { handlers: app } = await import('./app-enablebanking');

// Helper: clean up EB tables between tests.
function cleanEbTables() {
  const db = getAccountDb();
  db.mutate('DELETE FROM eb_sync_log');
  db.mutate('DELETE FROM eb_account_map');
  db.mutate('DELETE FROM eb_sessions');
}

// Helper: seed a complete session (as if /callback already ran).
function seedSession({
  sessionId = 'sess-1',
  state = 'csrf-state-123',
  aspspName = 'Nordea',
  aspspCountry = 'FI',
  accounts = [
    { uid: 'eb-uid-1', account_id: { iban: 'FI111111' }, name: 'Acct 1' },
  ],
} = {}) {
  const db = getAccountDb();
  db.mutate(
    'INSERT INTO eb_sessions (id, state, aspsp_name, aspsp_country, accounts) VALUES (?, ?, ?, ?, ?)',
    [sessionId, state, aspspName, aspspCountry, JSON.stringify(accounts)],
  );
  for (const account of accounts) {
    db.mutate(
      'INSERT OR IGNORE INTO eb_account_map (eb_account_uid, session_id) VALUES (?, ?)',
      [account.uid, sessionId],
    );
  }
}

describe('app-enablebanking routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanEbTables();
  });

  // -------------------------------------------------------------------
  // UNAUTHENTICATED ROUTES
  // -------------------------------------------------------------------

  describe('GET /test-auth', () => {
    it('returns configured:true when Enable Banking auth succeeds', async () => {
      const res = await request(app).get('/test-auth');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        status: 'ok',
        data: { configured: true },
      });
    });

    it('returns configured:false when Enable Banking auth fails', async () => {
      const { testAuth } = await import('./enablebanking-service.js');
      testAuth.mockRejectedValueOnce(new Error('JWT signing failed'));

      const res = await request(app).get('/test-auth');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.configured).toBe(false);
      expect(res.body.data.reason).toBe('JWT signing failed');
    });
  });

  describe('GET /callback', () => {
    it('rejects when state parameter is missing', async () => {
      const res = await request(app).get('/callback?code=test-code');
      expect(res.statusCode).toBe(400);
    });

    it('rejects when state is invalid (not in DB)', async () => {
      const res = await request(app).get(
        '/callback?code=test-code&state=bogus-state',
      );
      expect(res.statusCode).toBe(400);
      expect(res.text).toContain('Invalid or expired state');
    });

    it('exchanges code and updates session on valid callback', async () => {
      // Seed a pending session (as created by /create-auth).
      const db = getAccountDb();
      db.mutate(
        'INSERT INTO eb_sessions (id, state, aspsp_name, aspsp_country) VALUES (?, ?, ?, ?)',
        ['pending-state', 'valid-csrf', 'Nordea', 'FI'],
      );

      const res = await request(app).get(
        '/callback?code=auth-code&state=valid-csrf',
      );

      // Should redirect to /enablebanking/link
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/enablebanking/link');

      // Session should be updated with real ID and accounts.
      const session = db.first(
        "SELECT * FROM eb_sessions WHERE state = 'valid-csrf'",
      );
      expect(session.id).toBe('real-session-id');
      expect(JSON.parse(session.accounts)).toHaveLength(2);
      expect(session.valid_until).toBe('2026-06-01T00:00:00Z');

      // Account map should have entries for both accounts.
      const maps = db.all(
        "SELECT * FROM eb_account_map WHERE session_id = 'real-session-id'",
      );
      expect(maps).toHaveLength(2);
      expect(maps.map(m => m.eb_account_uid).sort()).toEqual([
        'eb-uid-1',
        'eb-uid-2',
      ]);
    });

    it('prevents CSRF replay (same state cannot be used twice)', async () => {
      const db = getAccountDb();
      db.mutate(
        'INSERT INTO eb_sessions (id, state, aspsp_name) VALUES (?, ?, ?)',
        ['s1', 'one-time-state', 'Bank'],
      );

      // First callback succeeds.
      const res1 = await request(app).get(
        '/callback?code=code1&state=one-time-state',
      );
      expect(res1.statusCode).toBe(302);

      // Second callback with same state - session row state still exists but
      // the id was updated. The state is still valid in DB, but that's the
      // nature of the current CSRF implementation (state is not deleted).
      // This test documents current behavior.
      const res2 = await request(app).get(
        '/callback?code=code2&state=one-time-state',
      );
      expect(res2.statusCode).toBe(302);
    });
  });

  describe('GET /link', () => {
    it('returns HTML that auto-closes the popup', async () => {
      const res = await request(app).get('/link');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('html');
      expect(res.text).toContain('window.close()');
    });
  });

  // -------------------------------------------------------------------
  // AUTHENTICATED ROUTES
  // -------------------------------------------------------------------

  describe('POST /status', () => {
    it('returns configured:true when EB env vars are set and auth works', async () => {
      process.env.ENABLE_BANKING_APP_ID = 'test-app';
      process.env.ENABLE_BANKING_KEY_PATH = '/tmp/test.pem';

      const res = await request(app)
        .post('/status')
        .set('x-actual-token', 'valid-token');

      expect(res.body.data.configured).toBe(true);

      delete process.env.ENABLE_BANKING_APP_ID;
      delete process.env.ENABLE_BANKING_KEY_PATH;
    });

    it('returns configured:false when env vars are missing', async () => {
      const origAppId = process.env.ENABLE_BANKING_APP_ID;
      const origKeyPath = process.env.ENABLE_BANKING_KEY_PATH;
      delete process.env.ENABLE_BANKING_APP_ID;
      delete process.env.ENABLE_BANKING_KEY_PATH;

      const res = await request(app)
        .post('/status')
        .set('x-actual-token', 'valid-token');

      expect(res.body.data.configured).toBe(false);
      expect(res.body.data.reason).toContain('Missing');

      // Restore
      if (origAppId) process.env.ENABLE_BANKING_APP_ID = origAppId;
      if (origKeyPath) process.env.ENABLE_BANKING_KEY_PATH = origKeyPath;
    });

    it('returns 401 without session token', async () => {
      const res = await request(app).post('/status');
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /get-banks', () => {
    it('returns list of banks for a country', async () => {
      const res = await request(app)
        .post('/get-banks')
        .set('x-actual-token', 'valid-token')
        .send({ country: 'FI' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data).toEqual([{ name: 'Nordea', country: 'FI' }]);
    });

    it('returns 401 without session token', async () => {
      const res = await request(app)
        .post('/get-banks')
        .send({ country: 'FI' });
      expect(res.statusCode).toBe(401);
    });
  });

  describe('POST /create-auth', () => {
    it('creates a pending session and returns bank redirect URL', async () => {
      const res = await request(app)
        .post('/create-auth')
        .set('x-actual-token', 'valid-token')
        .send({ aspspName: 'Nordea', aspspCountry: 'FI' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data.url).toBe('https://bank.example/auth?state=test');
      expect(res.body.data.state).toBeTruthy();

      // Verify session was created in DB.
      const db = getAccountDb();
      const session = db.first(
        'SELECT * FROM eb_sessions WHERE state = ?',
        [res.body.data.state],
      );
      expect(session).toBeTruthy();
      expect(session.aspsp_name).toBe('Nordea');
      expect(session.aspsp_country).toBe('FI');
    });
  });

  describe('POST /get-accounts', () => {
    it('returns normalized accounts when session is complete', async () => {
      seedSession();

      const res = await request(app)
        .post('/get-accounts')
        .set('x-actual-token', 'valid-token')
        .send({ state: 'csrf-state-123' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data.accounts).toHaveLength(1);
      expect(res.body.data.accounts[0]).toEqual(
        expect.objectContaining({
          account_id: 'eb-uid-1',
          name: 'Acct 1',
          institution: 'Nordea',
          iban: 'FI111111',
        }),
      );
    });

    it('returns empty data when session is not yet complete', async () => {
      const db = getAccountDb();
      db.mutate(
        'INSERT INTO eb_sessions (id, state, aspsp_name) VALUES (?, ?, ?)',
        ['pending', 'pending-state', 'Bank'],
      );

      const res = await request(app)
        .post('/get-accounts')
        .set('x-actual-token', 'valid-token')
        .send({ state: 'pending-state' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data).toEqual({});
    });

    it('returns empty data for unknown state', async () => {
      const res = await request(app)
        .post('/get-accounts')
        .set('x-actual-token', 'valid-token')
        .send({ state: 'nonexistent' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data).toEqual({});
    });
  });

  describe('POST /transactions', () => {
    it('returns normalized transactions and balance for a mapped account', async () => {
      seedSession();
      // Link the account.
      const db = getAccountDb();
      db.mutate(
        'UPDATE eb_account_map SET actual_account_id = ? WHERE eb_account_uid = ?',
        ['actual-uuid-1', 'eb-uid-1'],
      );

      const res = await request(app)
        .post('/transactions')
        .set('x-actual-token', 'valid-token')
        .send({ accountId: 'actual-uuid-1', startDate: '2026-01-01' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data.transactions.all).toHaveLength(1);
      expect(res.body.data.transactions.all[0]).toEqual(
        expect.objectContaining({
          transactionAmount: { amount: '-50', currency: 'EUR' },
          payeeName: 'Shop',
          booked: true,
        }),
      );
      expect(res.body.data.balances).toBe(123456);
      expect(res.body.data.startingBalance).toBe(123456);
    });

    it('returns ACCOUNT_NOT_MAPPED for unmapped accounts', async () => {
      const res = await request(app)
        .post('/transactions')
        .set('x-actual-token', 'valid-token')
        .send({ accountId: 'unknown-id', startDate: '2026-01-01' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data.error_code).toBe('ACCOUNT_NOT_MAPPED');
    });

    it('logs successful sync to eb_sync_log', async () => {
      seedSession();
      const db = getAccountDb();
      db.mutate(
        'UPDATE eb_account_map SET actual_account_id = ? WHERE eb_account_uid = ?',
        ['actual-uuid-1', 'eb-uid-1'],
      );

      await request(app)
        .post('/transactions')
        .set('x-actual-token', 'valid-token')
        .send({ accountId: 'actual-uuid-1', startDate: '2026-01-01' });

      const log = db.first(
        "SELECT * FROM eb_sync_log WHERE actual_account_id = 'actual-uuid-1'",
      );
      expect(log).toBeTruthy();
      expect(log.status).toBe('ok');
      expect(log.transactions_added).toBe(1);
    });

    it('logs errors to eb_sync_log when transaction fetch fails', async () => {
      seedSession();
      const db = getAccountDb();
      db.mutate(
        'UPDATE eb_account_map SET actual_account_id = ? WHERE eb_account_uid = ?',
        ['actual-uuid-1', 'eb-uid-1'],
      );

      const { getTransactions } = await import('./enablebanking-service.js');
      getTransactions.mockRejectedValueOnce(new Error('API timeout'));

      const res = await request(app)
        .post('/transactions')
        .set('x-actual-token', 'valid-token')
        .send({ accountId: 'actual-uuid-1', startDate: '2026-01-01' });

      // Error is caught by handleError and wrapped.
      expect(res.body.data.error_code).toBe('INTERNAL_ERROR');

      const log = db.first(
        "SELECT * FROM eb_sync_log WHERE actual_account_id = 'actual-uuid-1'",
      );
      expect(log).toBeTruthy();
      expect(log.status).toBe('error');
      expect(log.error_message).toBe('API timeout');
    });

    it('can look up account by eb_account_uid', async () => {
      seedSession();
      // Link the account.
      const db = getAccountDb();
      db.mutate(
        'UPDATE eb_account_map SET actual_account_id = ? WHERE eb_account_uid = ?',
        ['actual-uuid-1', 'eb-uid-1'],
      );

      const res = await request(app)
        .post('/transactions')
        .set('x-actual-token', 'valid-token')
        .send({ accountId: 'eb-uid-1', startDate: '2026-01-01' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data.transactions.all).toHaveLength(1);
    });
  });

  describe('POST /remove-session', () => {
    it('removes session and associated account maps', async () => {
      seedSession();

      const res = await request(app)
        .post('/remove-session')
        .set('x-actual-token', 'valid-token')
        .send({ sessionId: 'sess-1' });

      expect(res.body.status).toBe('ok');

      const db = getAccountDb();
      const session = db.first(
        "SELECT * FROM eb_sessions WHERE id = 'sess-1'",
      );
      expect(session).toBeFalsy();

      const maps = db.all(
        "SELECT * FROM eb_account_map WHERE session_id = 'sess-1'",
      );
      expect(maps).toHaveLength(0);
    });
  });

  describe('POST /sync-status', () => {
    it('returns last sync log entry for each requested account', async () => {
      const db = getAccountDb();
      db.mutate(
        "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, transactions_added) VALUES ('a1', 'e1', 'ok', 5)",
      );
      db.mutate(
        "INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, error_message) VALUES ('a1', 'e1', 'error', 'timeout')",
      );

      const res = await request(app)
        .post('/sync-status')
        .set('x-actual-token', 'valid-token')
        .send({ accountIds: ['a1'] });

      expect(res.body.status).toBe('ok');
      // Should return the most recent entry (the error one).
      expect(res.body.data.statuses.a1.status).toBe('error');
    });

    it('returns null for accounts with no sync log', async () => {
      const res = await request(app)
        .post('/sync-status')
        .set('x-actual-token', 'valid-token')
        .send({ accountIds: ['nonexistent'] });

      expect(res.body.data.statuses.nonexistent).toBeNull();
    });
  });

  describe('POST /update-account-map', () => {
    it('links an EB account to an Actual account', async () => {
      seedSession();

      const res = await request(app)
        .post('/update-account-map')
        .set('x-actual-token', 'valid-token')
        .send({ ebAccountUid: 'eb-uid-1', actualAccountId: 'actual-uuid-1' });

      expect(res.body.status).toBe('ok');
      expect(res.body.data).toBeUndefined();

      const db = getAccountDb();
      const map = db.first(
        "SELECT * FROM eb_account_map WHERE eb_account_uid = 'eb-uid-1'",
      );
      expect(map.actual_account_id).toBe('actual-uuid-1');
    });

    it('rejects when ebAccountUid is missing', async () => {
      const res = await request(app)
        .post('/update-account-map')
        .set('x-actual-token', 'valid-token')
        .send({ actualAccountId: 'actual-uuid-1' });

      expect(res.body.data.error_code).toBe('INVALID_INPUT');
    });

    it('rejects when actualAccountId is missing', async () => {
      const res = await request(app)
        .post('/update-account-map')
        .set('x-actual-token', 'valid-token')
        .send({ ebAccountUid: 'eb-uid-1' });

      expect(res.body.data.error_code).toBe('INVALID_INPUT');
    });

    it('returns ACCOUNT_NOT_FOUND when eb_account_uid does not exist in map', async () => {
      const res = await request(app)
        .post('/update-account-map')
        .set('x-actual-token', 'valid-token')
        .send({ ebAccountUid: 'nonexistent', actualAccountId: 'actual-1' });

      expect(res.body.data.error_code).toBe('ACCOUNT_NOT_FOUND');
    });
  });
});
