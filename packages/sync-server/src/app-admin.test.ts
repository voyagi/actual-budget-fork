import crypto from 'node:crypto';

import request from 'supertest';

import { getAccountDb } from './account-db';
import { handlers as app } from './app-admin';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const uniqueId = () => crypto.randomBytes(16).toString('hex');

const createUser = (
  userId: string,
  userName: string,
  role: string,
  owner = 0,
  enabled = 1,
) => {
  getAccountDb().mutate(
    'INSERT INTO users (id, user_name, display_name, enabled, owner, role) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, userName, `${userName} display`, enabled, owner, role],
  );
};

const deleteUser = (userId: string) => {
  getAccountDb().mutate('DELETE FROM users WHERE id = ?', [userId]);
};

const createFile = (
  fileId: string,
  owner: string,
  name = 'test-budget',
  deleted = 0,
) => {
  getAccountDb().mutate(
    'INSERT INTO files (id, name, deleted, owner) VALUES (?, ?, ?, ?)',
    [fileId, name, deleted, owner],
  );
};

const deleteFile = (fileId: string) => {
  getAccountDb().mutate('DELETE FROM files WHERE id = ?', [fileId]);
};

const deleteUserAccess = (fileId: string) => {
  getAccountDb().mutate('DELETE FROM user_access WHERE file_id = ?', [fileId]);
};

const addUserAccess = (userId: string, fileId: string) => {
  getAccountDb().mutate(
    'INSERT INTO user_access (user_id, file_id) VALUES (?, ?)',
    [userId, fileId],
  );
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/owner-created/', () => {
  it('returns true when an owner exists', async () => {
    // genericAdmin is an owner (owner=1) from global setup
    const res = await request(app).get('/owner-created/');

    expect(res.statusCode).toEqual(200);
    expect(res.body).toBe(true);
  });
});

describe('/users/', () => {
  it('returns 401 without a session token', async () => {
    const res = await request(app).get('/users/');

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns a list of users for an authenticated user', async () => {
    const res = await request(app)
      .get('/users/')
      .set('x-actual-token', 'valid-token');

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Should include at least genericAdmin and genericUser from global setup
    expect(res.body.length).toBeGreaterThanOrEqual(2);

    const admin = res.body.find(
      (u: { userName: string }) => u.userName === 'admin',
    );
    expect(admin).toBeDefined();
    expect(admin.owner).toBe(true);
    expect(admin.enabled).toBe(true);
  });

  it('returns users when called by a non-admin user', async () => {
    const res = await request(app)
      .get('/users/')
      .set('x-actual-token', 'valid-token-user');

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /users', () => {
  const createdUserIds: string[] = [];

  afterEach(() => {
    for (const id of createdUserIds) {
      getAccountDb().mutate('DELETE FROM users WHERE id = ?', [id]);
    }
    createdUserIds.length = 0;
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .post('/users')
      .send({ userName: 'notoken', role: 'BASIC' });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 403 when a non-admin tries to create a user', async () => {
    const res = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-user')
      .send({ userName: 'forbidden-user', role: 'BASIC' });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'forbidden',
      details: 'permission-not-found',
    });
  });

  it('returns 400 when userName is missing', async () => {
    const res = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ role: 'BASIC' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'user-cant-be-empty',
      details: 'Username cannot be empty',
    });
  });

  it('returns 400 when role is missing', async () => {
    const res = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ userName: 'norole' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'role-cant-be-empty',
      details: 'Role cannot be empty',
    });
  });

  it('returns 400 when role does not exist', async () => {
    const res = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ userName: 'badrole', role: 'SUPERUSER' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'role-does-not-exists',
      details: 'Selected role does not exist',
    });
  });

  it('creates a new user successfully', async () => {
    const userName = `testuser-${uniqueId()}`;

    const res = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ userName, role: 'BASIC', displayName: 'Test User', enabled: true });

    expect(res.statusCode).toEqual(200);
    expect(res.body.status).toEqual('ok');
    expect(res.body.data.id).toBeDefined();
    createdUserIds.push(res.body.data.id);

    // Verify user exists in the database
    const row = getAccountDb().first(
      'SELECT user_name, display_name, enabled FROM users WHERE id = ?',
      [res.body.data.id],
    ) as { user_name: string; display_name: string; enabled: number } | null;
    expect(row).not.toBeNull();
    expect(row!.user_name).toEqual(userName);
    expect(row!.display_name).toEqual('Test User');
    expect(row!.enabled).toEqual(1);
  });

  it('creates a disabled user when enabled is false', async () => {
    const userName = `disabled-${uniqueId()}`;

    const res = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ userName, role: 'BASIC', enabled: false });

    expect(res.statusCode).toEqual(200);
    createdUserIds.push(res.body.data.id);

    const row = getAccountDb().first(
      'SELECT enabled FROM users WHERE id = ?',
      [res.body.data.id],
    ) as { enabled: number } | null;
    expect(row!.enabled).toEqual(0);
  });

  it('returns 400 when creating a duplicate username', async () => {
    const userName = `dup-${uniqueId()}`;

    const first = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ userName, role: 'BASIC' });
    expect(first.statusCode).toEqual(200);
    createdUserIds.push(first.body.data.id);

    const second = await request(app)
      .post('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ userName, role: 'BASIC' });

    expect(second.statusCode).toEqual(400);
    expect(second.body).toEqual({
      status: 'error',
      reason: 'user-already-exists',
      details: `User ${userName} already exists`,
    });
  });
});

describe('PATCH /users', () => {
  let testUserId: string;
  let testUserName: string;

  beforeEach(() => {
    testUserId = uniqueId();
    testUserName = `patchuser-${testUserId.slice(0, 8)}`;
    createUser(testUserId, testUserName, 'BASIC');
  });

  afterEach(() => {
    deleteUser(testUserId);
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .patch('/users')
      .send({ id: testUserId, userName: testUserName, role: 'BASIC' });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 403 when a non-admin tries to update a user', async () => {
    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-user')
      .send({ id: testUserId, userName: testUserName, role: 'BASIC' });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'forbidden',
      details: 'permission-not-found',
    });
  });

  it('returns 400 when userName is missing', async () => {
    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ id: testUserId, role: 'BASIC' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'user-cant-be-empty',
      details: 'Username cannot be empty',
    });
  });

  it('returns 400 when role is missing', async () => {
    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ id: testUserId, userName: testUserName });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'role-cant-be-empty',
      details: 'Role cannot be empty',
    });
  });

  it('returns 400 when role does not exist', async () => {
    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ id: testUserId, userName: testUserName, role: 'SUPERUSER' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'role-does-not-exists',
      details: 'Selected role does not exist',
    });
  });

  it('returns 400 when user id does not exist', async () => {
    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ id: 'nonexistent-id', userName: 'ghost', role: 'BASIC' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'cannot-find-user-to-update',
      details: 'Cannot find user ghost to update',
    });
  });

  it('updates user successfully', async () => {
    const newName = `updated-${uniqueId().slice(0, 8)}`;

    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({
        id: testUserId,
        userName: newName,
        role: 'ADMIN',
        displayName: 'Updated Display',
        enabled: true,
      });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: { id: testUserId } });

    // Verify changes in the database
    const row = getAccountDb().first(
      'SELECT user_name, display_name, enabled, role FROM users WHERE id = ?',
      [testUserId],
    ) as {
      user_name: string;
      display_name: string;
      enabled: number;
      role: string;
    } | null;
    expect(row).not.toBeNull();
    expect(row!.user_name).toEqual(newName);
    expect(row!.display_name).toEqual('Updated Display');
    expect(row!.enabled).toEqual(1);
    expect(row!.role).toEqual('ADMIN');
  });

  it('disables a user by setting enabled to false', async () => {
    const res = await request(app)
      .patch('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({
        id: testUserId,
        userName: testUserName,
        role: 'BASIC',
        enabled: false,
      });

    expect(res.statusCode).toEqual(200);

    const row = getAccountDb().first(
      'SELECT enabled FROM users WHERE id = ?',
      [testUserId],
    ) as { enabled: number } | null;
    expect(row!.enabled).toEqual(0);
  });
});

describe('DELETE /users', () => {
  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .delete('/users')
      .send({ ids: ['some-id'] });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 403 when a non-admin tries to delete users', async () => {
    const res = await request(app)
      .delete('/users')
      .set('x-actual-token', 'valid-token-user')
      .send({ ids: ['some-id'] });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'forbidden',
      details: 'permission-not-found',
    });
  });

  it('deletes a non-owner user successfully', async () => {
    const userId = uniqueId();
    createUser(userId, `delme-${userId.slice(0, 8)}`, 'BASIC');

    const res = await request(app)
      .delete('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ ids: [userId] });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: { someDeletionsFailed: false },
    });

    // Verify user no longer exists
    const row = getAccountDb().first('SELECT id FROM users WHERE id = ?', [
      userId,
    ]);
    expect(row).toBeNull();
  });

  it('refuses to delete the owner user', async () => {
    // genericAdmin is the owner. Attempting to delete should be skipped,
    // resulting in a "not-all-deleted" error since 0 out of 1 were deleted.
    const res = await request(app)
      .delete('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ ids: ['genericAdmin'] });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'not-all-deleted',
      details: '',
    });

    // Verify owner still exists
    const row = getAccountDb().first(
      'SELECT id FROM users WHERE id = ?',
      ['genericAdmin'],
    );
    expect(row).not.toBeNull();
  });

  it('deletes multiple users at once', async () => {
    const userId1 = uniqueId();
    const userId2 = uniqueId();
    createUser(userId1, `multi1-${userId1.slice(0, 8)}`, 'BASIC');
    createUser(userId2, `multi2-${userId2.slice(0, 8)}`, 'BASIC');

    const res = await request(app)
      .delete('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ ids: [userId1, userId2] });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: { someDeletionsFailed: false },
    });

    const row1 = getAccountDb().first('SELECT id FROM users WHERE id = ?', [
      userId1,
    ]);
    const row2 = getAccountDb().first('SELECT id FROM users WHERE id = ?', [
      userId2,
    ]);
    expect(row1).toBeNull();
    expect(row2).toBeNull();
  });

  it('reports partial failure when deleting a mix of owner and non-owner', async () => {
    const userId = uniqueId();
    createUser(userId, `partial-${userId.slice(0, 8)}`, 'BASIC');

    // Try to delete both the owner (genericAdmin) and a regular user
    const res = await request(app)
      .delete('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ ids: ['genericAdmin', userId] });

    // Only 1 of 2 deleted, so the route returns 400
    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'not-all-deleted',
      details: '',
    });

    // The non-owner user should still have been deleted
    const row = getAccountDb().first('SELECT id FROM users WHERE id = ?', [
      userId,
    ]);
    expect(row).toBeNull();
  });

  it('cleans up user access when deleting a user', async () => {
    const userId = uniqueId();
    const fileId = uniqueId();
    createUser(userId, `accesscleanup-${userId.slice(0, 8)}`, 'BASIC');
    createFile(fileId, 'genericAdmin');

    addUserAccess(userId, fileId);

    // Verify access exists before deletion
    const before = getAccountDb().first(
      'SELECT * FROM user_access WHERE user_id = ? AND file_id = ?',
      [userId, fileId],
    );
    expect(before).not.toBeNull();

    const res = await request(app)
      .delete('/users')
      .set('x-actual-token', 'valid-token-admin')
      .send({ ids: [userId] });

    expect(res.statusCode).toEqual(200);

    // Verify user_access row was cleaned up
    const after = getAccountDb().first(
      'SELECT * FROM user_access WHERE user_id = ? AND file_id = ?',
      [userId, fileId],
    );
    expect(after).toBeNull();

    deleteFile(fileId);
  });
});

describe('GET /access', () => {
  let fileId: string;

  beforeEach(() => {
    fileId = uniqueId();
    createFile(fileId, 'genericAdmin');
  });

  afterEach(() => {
    deleteUserAccess(fileId);
    deleteFile(fileId);
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .get('/access')
      .query({ fileId });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 403 when a non-admin user has no permission on the file', async () => {
    // File is owned by genericAdmin, not genericUser
    const res = await request(app)
      .get('/access')
      .set('x-actual-token', 'valid-token-user')
      .query({ fileId });

    expect(res.statusCode).toEqual(403);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'forbidden',
      details: 'permission-not-found',
    });
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .get('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId: 'nonexistent-file' });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'File not found at server',
    });
  });

  it('returns access list for admin on their own file', async () => {
    const res = await request(app)
      .get('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId });

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('allows admin to access another users file', async () => {
    const otherFileId = uniqueId();
    createFile(otherFileId, 'genericUser');

    const res = await request(app)
      .get('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId: otherFileId });

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);

    deleteFile(otherFileId);
  });
});

describe('POST /access', () => {
  let fileId: string;

  beforeEach(() => {
    fileId = uniqueId();
    createFile(fileId, 'genericAdmin');
  });

  afterEach(() => {
    deleteUserAccess(fileId);
    deleteFile(fileId);
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .post('/access')
      .send({ fileId, userId: 'genericUser' });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 400 when non-admin user has no permission on the file', async () => {
    const res = await request(app)
      .post('/access')
      .set('x-actual-token', 'valid-token-user')
      .send({ fileId, userId: 'genericUser' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'file-denied',
      details: "You don't have permissions over this file",
    });
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .post('/access')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId: 'nonexistent-file', userId: 'genericUser' });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'File not found at server',
    });
  });

  it('returns 400 when userId is missing', async () => {
    const res = await request(app)
      .post('/access')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'user-cant-be-empty',
      details: 'User cannot be empty',
    });
  });

  it('grants access to a user successfully', async () => {
    const res = await request(app)
      .post('/access')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId, userId: 'genericUser' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });

    // Verify access row in the database
    const row = getAccountDb().first(
      'SELECT * FROM user_access WHERE user_id = ? AND file_id = ?',
      ['genericUser', fileId],
    );
    expect(row).not.toBeNull();
  });

  it('returns 400 when user already has access', async () => {
    // Grant access first
    addUserAccess('genericUser', fileId);

    const res = await request(app)
      .post('/access')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId, userId: 'genericUser' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'user-already-have-access',
      details: 'User already have access',
    });
  });

  it('allows admin to grant access on another users file', async () => {
    const otherFileId = uniqueId();
    createFile(otherFileId, 'genericUser');

    const newUserId = uniqueId();
    createUser(newUserId, `access-grant-${newUserId.slice(0, 8)}`, 'BASIC');

    const res = await request(app)
      .post('/access')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId: otherFileId, userId: newUserId });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });

    deleteUserAccess(otherFileId);
    deleteUser(newUserId);
    deleteFile(otherFileId);
  });
});

describe('DELETE /access', () => {
  let fileId: string;

  beforeEach(() => {
    fileId = uniqueId();
    createFile(fileId, 'genericAdmin');
  });

  afterEach(() => {
    deleteUserAccess(fileId);
    deleteFile(fileId);
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .delete('/access')
      .query({ fileId })
      .send({ ids: ['genericUser'] });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 400 when non-admin user has no permission on the file', async () => {
    const res = await request(app)
      .delete('/access')
      .set('x-actual-token', 'valid-token-user')
      .query({ fileId })
      .send({ ids: ['genericUser'] });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'file-denied',
      details: "You don't have permissions over this file",
    });
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .delete('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId: 'nonexistent-file' })
      .send({ ids: ['genericUser'] });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'File not found at server',
    });
  });

  it('revokes user access successfully', async () => {
    addUserAccess('genericUser', fileId);

    const res = await request(app)
      .delete('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId })
      .send({ ids: ['genericUser'] });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: { someDeletionsFailed: false },
    });

    // Verify access was removed
    const row = getAccountDb().first(
      'SELECT * FROM user_access WHERE user_id = ? AND file_id = ?',
      ['genericUser', fileId],
    );
    expect(row).toBeNull();
  });

  it('returns 400 when some deletions fail', async () => {
    // Try to revoke access for a user who does not have access
    const nonAccessUserId = uniqueId();
    createUser(nonAccessUserId, `noaccess-${nonAccessUserId.slice(0, 8)}`, 'BASIC');

    const res = await request(app)
      .delete('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId })
      .send({ ids: [nonAccessUserId] });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'not-all-deleted',
      details: '',
    });

    deleteUser(nonAccessUserId);
  });

  it('revokes access for multiple users', async () => {
    const userId1 = uniqueId();
    const userId2 = uniqueId();
    createUser(userId1, `revoke1-${userId1.slice(0, 8)}`, 'BASIC');
    createUser(userId2, `revoke2-${userId2.slice(0, 8)}`, 'BASIC');
    addUserAccess(userId1, fileId);
    addUserAccess(userId2, fileId);

    const res = await request(app)
      .delete('/access')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId })
      .send({ ids: [userId1, userId2] });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({
      status: 'ok',
      data: { someDeletionsFailed: false },
    });

    deleteUser(userId1);
    deleteUser(userId2);
  });
});

describe('GET /access/users', () => {
  let fileId: string;

  beforeEach(() => {
    fileId = uniqueId();
    createFile(fileId, 'genericAdmin');
  });

  afterEach(() => {
    deleteUserAccess(fileId);
    deleteFile(fileId);
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .get('/access/users')
      .query({ fileId });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 400 when non-admin user has no permission on the file', async () => {
    const res = await request(app)
      .get('/access/users')
      .set('x-actual-token', 'valid-token-user')
      .query({ fileId });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'file-denied',
      details: "You don't have permissions over this file",
    });
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .get('/access/users')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId: 'nonexistent-file' });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'File not found at server',
    });
  });

  it('returns all users with their access status for the file', async () => {
    // Grant one user access
    addUserAccess('genericUser', fileId);

    const res = await request(app)
      .get('/access/users')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId });

    expect(res.statusCode).toEqual(200);
    expect(Array.isArray(res.body)).toBe(true);

    // genericUser should have access
    const userWithAccess = res.body.find(
      (u: { userId: string }) => u.userId === 'genericUser',
    );
    expect(userWithAccess).toBeDefined();
    expect(userWithAccess.haveAccess).toEqual(1);
  });

  it('shows owner status for file owner', async () => {
    const res = await request(app)
      .get('/access/users')
      .set('x-actual-token', 'valid-token-admin')
      .query({ fileId });

    expect(res.statusCode).toEqual(200);

    // genericAdmin is the file owner
    const owner = res.body.find(
      (u: { userId: string }) => u.userId === 'genericAdmin',
    );
    expect(owner).toBeDefined();
    expect(owner.owner).toEqual(1);
  });
});

describe('POST /access/transfer-ownership/', () => {
  let fileId: string;

  beforeEach(() => {
    fileId = uniqueId();
    createFile(fileId, 'genericAdmin');
  });

  afterEach(() => {
    deleteUserAccess(fileId);
    deleteFile(fileId);
  });

  it('returns 401 without a session token', async () => {
    const res = await request(app)
      .post('/access/transfer-ownership/')
      .send({ fileId, newUserId: 'genericUser' });

    expect(res.statusCode).toEqual(401);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'unauthorized',
      details: 'token-not-found',
    });
  });

  it('returns 400 when non-admin user has no permission on the file', async () => {
    const res = await request(app)
      .post('/access/transfer-ownership/')
      .set('x-actual-token', 'valid-token-user')
      .send({ fileId, newUserId: 'genericUser' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'file-denied',
      details: "You don't have permissions over this file",
    });
  });

  it('returns 404 when the file does not exist', async () => {
    const res = await request(app)
      .post('/access/transfer-ownership/')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId: 'nonexistent-file', newUserId: 'genericUser' });

    expect(res.statusCode).toEqual(404);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'invalid-file-id',
      details: 'File not found at server',
    });
  });

  it('returns 400 when newUserId is missing', async () => {
    const res = await request(app)
      .post('/access/transfer-ownership/')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'user-cant-be-empty',
      details: 'Username cannot be empty',
    });
  });

  it('returns 400 when the new user does not exist', async () => {
    const res = await request(app)
      .post('/access/transfer-ownership/')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId, newUserId: 'nonexistent-user-id' });

    expect(res.statusCode).toEqual(400);
    expect(res.body).toEqual({
      status: 'error',
      reason: 'new-user-not-found',
      details: 'New user not found',
    });
  });

  it('transfers file ownership successfully', async () => {
    const res = await request(app)
      .post('/access/transfer-ownership/')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId, newUserId: 'genericUser' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });

    // Verify the file owner was updated in the database
    const row = getAccountDb().first(
      'SELECT owner FROM files WHERE id = ?',
      [fileId],
    ) as { owner: string } | null;
    expect(row).not.toBeNull();
    expect(row!.owner).toEqual('genericUser');
  });

  it('allows admin to transfer ownership of another users file', async () => {
    const otherFileId = uniqueId();
    createFile(otherFileId, 'genericUser');

    const res = await request(app)
      .post('/access/transfer-ownership/')
      .set('x-actual-token', 'valid-token-admin')
      .send({ fileId: otherFileId, newUserId: 'genericAdmin' });

    expect(res.statusCode).toEqual(200);
    expect(res.body).toEqual({ status: 'ok', data: {} });

    const row = getAccountDb().first(
      'SELECT owner FROM files WHERE id = ?',
      [otherFileId],
    ) as { owner: string } | null;
    expect(row!.owner).toEqual('genericAdmin');

    deleteFile(otherFileId);
  });
});
