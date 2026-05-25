// @ts-strict-ignore
import request from 'supertest';

import { getAccountDb } from './account-db';
import { handlers as app } from './app-account';

describe('/needs-bootstrap', () => {
  it('returns bootstrapped false when auth table is empty', async () => {
    // Global setup creates users and sessions but does NOT insert into
    // the auth table, so needsBootstrap() returns true and bootstrapped
    // is false.
    const res = await request(app).get('/needs-bootstrap');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data.bootstrapped).toBe(false);
    expect(res.body.data).toHaveProperty('loginMethod');
    expect(res.body.data).toHaveProperty('availableLoginMethods');
    expect(res.body.data).toHaveProperty('multiuser');
  });

  it('returns bootstrapped true after auth has been configured', async () => {
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('password', 'Password', 'hash', 1)",
    );

    try {
      const res = await request(app).get('/needs-bootstrap');

      expect(res.statusCode).toEqual(200);
      expect(res.body.data.bootstrapped).toBe(true);
      expect(Array.isArray(res.body.data.availableLoginMethods)).toBe(true);
      expect(res.body.data.availableLoginMethods.length).toBeGreaterThan(0);
      expect(res.body.data.availableLoginMethods[0]).toHaveProperty('method');
    } finally {
      db.mutate('DELETE FROM auth');
    }
  });

  it('does not require authentication', async () => {
    // No token header — should still succeed
    const res = await request(app).get('/needs-bootstrap');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });
});

describe('/bootstrap', () => {
  it('returns error when server is already bootstrapped', async () => {
    // Insert an auth row so needsBootstrap() returns false
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('password', 'Password', 'hash', 1)",
    );

    try {
      const res = await request(app)
        .post('/bootstrap')
        .send({ password: 'some-password' });

      expect(res.statusCode).toEqual(400);
      expect(res.body).toEqual({
        status: 'error',
        reason: 'already-bootstrapped',
      });
    } finally {
      db.mutate('DELETE FROM auth');
    }
  });

  it('returns error when no login settings are provided', async () => {
    const res = await request(app).post('/bootstrap').send(null);

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-login-settings',
    });
  });

  it('returns error when password is empty during bootstrap', async () => {
    const res = await request(app)
      .post('/bootstrap')
      .send({ password: '' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('returns error when no auth method is selected', async () => {
    const res = await request(app).post('/bootstrap').send({});

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'no-auth-method-selected',
    });
  });

  it('succeeds with a valid password when not yet bootstrapped', async () => {
    // Auth table is empty from global setup, so bootstrap should succeed
    const res = await request(app)
      .post('/bootstrap')
      .send({ password: 'bootstrap-test-password' });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data).toHaveProperty('token');

    // Clean up: remove the auth row so subsequent tests start clean
    getAccountDb().mutate('DELETE FROM auth');
  });
});

describe('/login-methods', () => {
  it('returns an empty array when no auth methods are configured', async () => {
    // Auth table is empty from global setup
    const res = await request(app).get('/login-methods');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(Array.isArray(res.body.methods)).toBe(true);
    expect(res.body.methods.length).toEqual(0);
  });

  it('returns configured login methods', async () => {
    const db = getAccountDb();
    db.mutate(
      "INSERT INTO auth (method, display_name, extra_data, active) VALUES ('password', 'Password', 'hash', 1)",
    );

    try {
      const res = await request(app).get('/login-methods');

      expect(res.statusCode).toEqual(200);
      expect(res.body.status).toEqual('ok');
      expect(res.body.methods.length).toBeGreaterThan(0);
      expect(res.body.methods[0]).toHaveProperty('method');
      expect(res.body.methods[0]).toHaveProperty('active');
      expect(res.body.methods[0]).toHaveProperty('displayName');
      expect(res.body.methods[0].method).toEqual('password');
    } finally {
      db.mutate('DELETE FROM auth');
    }
  });

  it('does not require authentication', async () => {
    const res = await request(app).get('/login-methods');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
  });
});

describe('/login', () => {
  it('returns error for empty password', async () => {
    const res = await request(app).post('/login').send({ password: '' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('returns error for null password', async () => {
    const res = await request(app).post('/login').send({ password: null });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('returns error for missing password field', async () => {
    const res = await request(app).post('/login').send({});

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('returns error for wrong password', async () => {
    const res = await request(app)
      .post('/login')
      .send({ password: 'definitely-wrong-password' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('does not require authentication header', async () => {
    // Login endpoint should not require x-actual-token
    const res = await request(app)
      .post('/login')
      .send({ password: 'wrong' });

    // Should get invalid-password, not unauthorized
    expect(res.statusCode).toEqual(400);
    expect(res.body.reason).toEqual('invalid-password');
  });
});

describe('/change-password', () => {
  it('returns 401 if the user is not authenticated', async () => {
    const res = await request(app)
      .post('/change-password')
      .send({ password: 'new-password' });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', 'invalid-token')
      .send({ password: 'new-password' });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 400 when new password is empty', async () => {
    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', 'valid-token')
      .send({ password: '' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('returns 400 when new password is null', async () => {
    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', 'valid-token')
      .send({ password: null });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('returns 400 when password field is missing', async () => {
    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', 'valid-token')
      .send({});

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-password',
    });
  });

  it('successfully changes the password with a valid session', async () => {
    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', 'valid-token')
      .send({ password: 'new-secure-password' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });
  });

  it('allows a non-admin user to change password', async () => {
    const res = await request(app)
      .post('/change-password')
      .set('x-actual-token', 'valid-token-user')
      .send({ password: 'user-new-password' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });
  });
});

describe('/server-prefs', () => {
  afterEach(() => {
    // Clean up any server prefs created during tests
    getAccountDb().mutate('DELETE FROM server_prefs');
  });

  it('returns 401 if the user is not authenticated', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .send({ prefs: { theme: 'dark' } });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'invalid-token')
      .send({ prefs: { theme: 'dark' } });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 403 when a non-admin user tries to set server prefs', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'valid-token-user')
      .send({ prefs: { theme: 'dark' } });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'forbidden',
      details: 'permission-not-found',
    });
  });

  it('returns 400 when prefs field is missing', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'valid-token-admin')
      .send({});

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-prefs',
    });
  });

  it('returns 400 when prefs is null', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'valid-token-admin')
      .send({ prefs: null });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-prefs',
    });
  });

  it('returns 400 when prefs is not an object', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'valid-token-admin')
      .send({ prefs: 'not-an-object' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-prefs',
    });
  });

  it('successfully updates server prefs as admin', async () => {
    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'valid-token-admin')
      .send({ prefs: { theme: 'dark', language: 'en' } });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });

    // Verify prefs were persisted
    const rows = getAccountDb().all('SELECT key, value FROM server_prefs');
    const prefsMap: Record<string, string> = {};
    for (const row of rows) {
      prefsMap[row.key as string] = row.value as string;
    }
    expect(prefsMap.theme).toEqual('dark');
    expect(prefsMap.language).toEqual('en');
  });

  it('overwrites existing prefs with new values', async () => {
    // Set initial pref
    getAccountDb().mutate(
      "INSERT INTO server_prefs (key, value) VALUES ('theme', 'light')",
    );

    const res = await request(app)
      .post('/server-prefs')
      .set('x-actual-token', 'valid-token-admin')
      .send({ prefs: { theme: 'dark' } });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });

    const row = getAccountDb().first(
      "SELECT value FROM server_prefs WHERE key = 'theme'",
    );
    expect((row as { value: string }).value).toEqual('dark');
  });
});

describe('/validate', () => {
  it('returns 401 if no token is provided', async () => {
    const res = await request(app).get('/validate');

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 401 with an invalid token', async () => {
    const res = await request(app)
      .get('/validate')
      .set('x-actual-token', 'invalid-token');

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns validated user data for a valid admin token', async () => {
    const res = await request(app)
      .get('/validate')
      .set('x-actual-token', 'valid-token');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data.validated).toBe(true);
    expect(res.body.data.userId).toEqual('genericAdmin');
    expect(res.body.data.permission).toEqual('ADMIN');
    expect(res.body.data).toHaveProperty('userName');
    expect(res.body.data).toHaveProperty('prefs');
  });

  it('returns validated user data for valid-token-admin', async () => {
    const res = await request(app)
      .get('/validate')
      .set('x-actual-token', 'valid-token-admin');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data.validated).toBe(true);
    expect(res.body.data.userId).toEqual('genericAdmin');
    expect(res.body.data.permission).toEqual('ADMIN');
  });

  it('returns validated user data for a basic user token', async () => {
    const res = await request(app)
      .get('/validate')
      .set('x-actual-token', 'valid-token-user');

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data.validated).toBe(true);
    expect(res.body.data.userId).toEqual('genericUser');
    expect(res.body.data.permission).toEqual('BASIC');
  });

  it('returns server prefs in the validation response', async () => {
    // Set a pref so we can verify it appears
    getAccountDb().mutate(
      "INSERT OR REPLACE INTO server_prefs (key, value) VALUES ('testKey', 'testValue')",
    );

    const res = await request(app)
      .get('/validate')
      .set('x-actual-token', 'valid-token');

    expect(res.statusCode).toEqual(200);
    expect(res.body.data.prefs).toBeDefined();
    expect(res.body.data.prefs.testKey).toEqual('testValue');

    // Clean up
    getAccountDb().mutate(
      "DELETE FROM server_prefs WHERE key = 'testKey'",
    );
  });

  it('returns 400 when session points to a deleted user', async () => {
    const db = getAccountDb();

    // Create a temporary user and session
    db.mutate(
      "INSERT INTO users (id, user_name, display_name, enabled, owner, role) VALUES ('ghost-user', 'ghost', 'ghost', 1, 0, 'BASIC')",
    );
    db.mutate(
      "INSERT INTO sessions (token, expires_at, user_id) VALUES ('ghost-token', -1, 'ghost-user')",
    );

    // Verify the session works first
    const validRes = await request(app)
      .get('/validate')
      .set('x-actual-token', 'ghost-token');
    expect(validRes.statusCode).toEqual(200);

    // Delete the user but leave the session
    db.mutate("DELETE FROM users WHERE id = 'ghost-user'");

    const res = await request(app)
      .get('/validate')
      .set('x-actual-token', 'ghost-token');

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'User not found',
    });

    // Clean up session
    db.mutate("DELETE FROM sessions WHERE token = 'ghost-token'");
  });
});
