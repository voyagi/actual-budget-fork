import { getAccountDb } from '../account-db';

export function getUserByUsername(userName: string): string | null {
  if (!userName || typeof userName !== 'string') {
    return null;
  }
  const row = getAccountDb().first('SELECT id FROM users WHERE user_name = ?', [
    userName,
  ]) as { id?: string } | null;
  return row?.id || null;
}

export function getUserById(userId: string): string | null {
  if (!userId) {
    return null;
  }
  const row = getAccountDb().first('SELECT * FROM users WHERE id = ?', [
    userId,
  ]) as { id?: string } | null;
  return row?.id || null;
}

export function getFileById(fileId: string): string | null {
  if (!fileId) {
    return null;
  }
  const row = getAccountDb().first('SELECT * FROM files WHERE files.id = ?', [
    fileId,
  ]) as { id?: string } | null;
  return row?.id || null;
}

export function validateRole(roleId: string): boolean {
  const possibleRoles = ['BASIC', 'ADMIN'];
  return possibleRoles.some(a => a === roleId);
}

export function getOwnerCount(): number {
  const row = getAccountDb().first(
    `SELECT count(*) as ownerCount FROM users WHERE users.user_name <> '' and users.owner = 1`,
  ) as { ownerCount?: number } | null;
  return row?.ownerCount ?? 0;
}

export function getOwnerId(): string | undefined {
  const row = getAccountDb().first(
    `SELECT users.id FROM users WHERE users.user_name <> '' and users.owner = 1`,
  ) as { id?: string } | null;
  return row?.id;
}

export function getFileOwnerId(fileId: string): string | undefined {
  const row = getAccountDb().first(
    `SELECT files.owner FROM files WHERE files.id = ?`,
    [fileId],
  ) as { owner?: string } | null;
  return row?.owner;
}

interface UserRow {
  id: string;
  userName: string;
  displayName: string;
  enabled: number;
  owner: number;
  role: string;
}

export function getAllUsers(): UserRow[] {
  return getAccountDb().all(
    `SELECT users.id, user_name as userName, display_name as displayName, enabled, ifnull(owner,0) as owner, role
     FROM users
     WHERE users.user_name <> ''`,
  ) as unknown as UserRow[];
}

export function insertUser(
  userId: string,
  userName: string,
  displayName: string | null,
  enabled: number,
  role?: string,
): void {
  getAccountDb().mutate(
    'INSERT INTO users (id, user_name, display_name, enabled, owner, role) VALUES (?, ?, ?, ?, 0, ?)',
    [userId, userName, displayName, enabled, role],
  );
}

export function updateUser(
  userId: string,
  userName: string,
  displayName: string | null,
  enabled: number,
): void {
  if (!userId || !userName) {
    throw new Error('Invalid user parameters');
  }
  try {
    getAccountDb().mutate(
      'UPDATE users SET user_name = ?, display_name = ?, enabled = ? WHERE id = ?',
      [userName, displayName, enabled, userId],
    );
  } catch (error) {
    throw new Error(`Failed to update user: ${(error as Error).message}`);
  }
}

export function updateUserWithRole(
  userId: string,
  userName: string,
  displayName: string | null,
  enabled: number,
  roleId: string,
): void {
  getAccountDb().transaction(() => {
    getAccountDb().mutate(
      'UPDATE users SET user_name = ?, display_name = ?, enabled = ?, role = ? WHERE id = ?',
      [userName, displayName, enabled, roleId, userId],
    );
  });
}

export function deleteUser(userId: string): number {
  return getAccountDb().mutate('DELETE FROM users WHERE id = ? and owner = 0', [
    userId,
  ]).changes;
}

export function deleteUserAccess(userId: string): number {
  try {
    return getAccountDb().mutate('DELETE FROM user_access WHERE user_id = ?', [
      userId,
    ]).changes;
  } catch (error) {
    throw new Error(
      `Failed to delete user access: ${(error as Error).message}`,
    );
  }
}

export function transferAllFilesFromUser(
  ownerId: string,
  oldUserId: string,
): void {
  if (!ownerId || !oldUserId) {
    throw new Error('Invalid user IDs');
  }
  try {
    getAccountDb().transaction(() => {
      const ownerExists = getUserById(ownerId);
      if (!ownerExists) {
        throw new Error('New owner not found');
      }
      getAccountDb().mutate('UPDATE files set owner = ? WHERE owner = ?', [
        ownerId,
        oldUserId,
      ]);
    });
  } catch (error) {
    throw new Error(`Failed to transfer files: ${(error as Error).message}`);
  }
}

export function updateFileOwner(ownerId: string, fileId: string): void {
  if (!ownerId || !fileId) {
    throw new Error('Invalid parameters');
  }
  try {
    const result = getAccountDb().mutate(
      'UPDATE files set owner = ? WHERE id = ?',
      [ownerId, fileId],
    );
    if (result.changes === 0) {
      throw new Error('File not found');
    }
  } catch (error) {
    throw new Error(`Failed to update file owner: ${(error as Error).message}`);
  }
}

interface UserAccessRow {
  userId: string;
  userName: string;
  owner: string;
  displayName: string;
}

export function getUserAccess(
  fileId: string,
  userId: string,
  isAdmin: boolean,
): UserAccessRow[] {
  return getAccountDb().all(
    `SELECT users.id as userId, user_name as userName, files.owner, display_name as displayName
     FROM users
     JOIN user_access ON user_access.user_id = users.id
     JOIN files ON files.id = user_access.file_id
     WHERE files.id = ? and (files.owner = ? OR 1 = ?)`,
    [fileId, userId, isAdmin ? 1 : 0],
  ) as unknown as UserAccessRow[];
}

export function countUserAccess(fileId: string, userId: string): number {
  const row = getAccountDb().first(
    `SELECT COUNT(*) as accessCount
       FROM files
       WHERE files.id = ? AND (files.owner = ? OR EXISTS (
         SELECT 1 FROM user_access
         WHERE user_access.user_id = ? AND user_access.file_id = ?)
       )`,
    [fileId, userId, userId, fileId],
  ) as { accessCount?: number } | null;

  return row?.accessCount ?? 0;
}

export function checkFilePermission(
  fileId: string,
  userId: string,
): { granted: number } {
  return (
    (getAccountDb().first(
      `SELECT 1 as granted
       FROM files
       WHERE files.id = ? and (files.owner = ?)`,
      [fileId, userId],
    ) as { granted: number } | null) || { granted: 0 }
  );
}

export function addUserAccess(userId: string, fileId: string): void {
  if (!userId || !fileId) {
    throw new Error('Invalid parameters');
  }
  try {
    const userExists = getUserById(userId);
    const fileExists = getFileById(fileId);
    if (!userExists || !fileExists) {
      throw new Error('User or file not found');
    }
    getAccountDb().mutate(
      'INSERT INTO user_access (user_id, file_id) VALUES (?, ?)',
      [userId, fileId],
    );
  } catch (error) {
    if ((error as Error).message.includes('UNIQUE constraint')) {
      throw new Error('Access already exists');
    }
    throw new Error(`Failed to add user access: ${(error as Error).message}`);
  }
}

export function deleteUserAccessByFileId(
  userIds: string[],
  fileId: string,
): number {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    throw new Error('The provided userIds must be a non-empty array.');
  }

  const CHUNK_SIZE = 999;
  let totalChanges = 0;

  try {
    getAccountDb().transaction(() => {
      for (let i = 0; i < userIds.length; i += CHUNK_SIZE) {
        const chunk = userIds.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => '?').join(',');

        const sql = `DELETE FROM user_access WHERE user_id IN (${placeholders}) AND file_id = ?`;

        const result = getAccountDb().mutate(sql, [...chunk, fileId]);
        totalChanges += result.changes;
      }
    });
  } catch (error) {
    throw new Error(
      `Failed to delete user access: ${(error as Error).message}`,
    );
  }

  return totalChanges;
}

interface AllUserAccessRow {
  userId: string;
  userName: string;
  displayName: string;
  haveAccess: number;
  owner: number;
}

export function getAllUserAccess(fileId: string): AllUserAccessRow[] {
  //This can't be used here until we can create user invite links:
  //const isLoginMode = config.get('userCreationMode') === 'login';
  const isLoginMode = false;
  const joinType = isLoginMode ? 'JOIN' : 'LEFT JOIN';

  return getAccountDb().all(
    `
      SELECT
        users.id as userId,
        user_name     as userName,
        display_name  as displayName,
        CASE WHEN user_access.file_id IS NULL THEN 0 ELSE 1 END as haveAccess,
        CASE WHEN files.id IS NULL THEN 0 ELSE 1 END as owner
      FROM users
      ${joinType} user_access ON user_access.file_id = ? AND user_access.user_id = users.id
      ${joinType} files       ON files.id = ? AND files.owner = users.id
      WHERE users.enabled = 1
        AND users.user_name <> ''
    `,
    [fileId, fileId],
  ) as unknown as AllUserAccessRow[];
}

export function getOpenIDConfig(): Record<string, unknown> | null {
  return (
    getAccountDb().first(`SELECT * FROM auth WHERE method = ?`, ['openid']) ||
    null
  );
}
