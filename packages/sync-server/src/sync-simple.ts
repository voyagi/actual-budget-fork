import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { merkle, SyncProtoBuf, Timestamp } from '@actual-app/crdt';

import type { WrappedDatabase } from './db';
import { openDatabase } from './db';
import { sqlDir } from './load-config';
import { getPathForGroupFile } from './util/paths';

function getGroupDb(groupId: string): WrappedDatabase {
  const path = getPathForGroupFile(groupId);
  const needsInit = !existsSync(path);

  const db = openDatabase(path);

  if (needsInit) {
    const sql = readFileSync(join(sqlDir, 'messages.sql'), 'utf8');
    db.exec(sql);
  }

  return db;
}

interface MessageEnvelope {
  getTimestamp(): string;
  getIsencrypted(): boolean;
  getContent(): Uint8Array;
  setTimestamp(timestamp: string): void;
  setIsencrypted(isEncrypted: boolean): void;
  setContent(content: Buffer | Uint8Array): void;
}

function addMessages(db: WrappedDatabase, messages: MessageEnvelope[]): Record<string, unknown> | undefined {
  let returnValue: Record<string, unknown> | undefined;
  db.transaction(() => {
    let trie = getMerkle(db);

    if (messages.length > 0) {
      for (const msg of messages) {
        const info = db.mutate(
          `INSERT OR IGNORE INTO messages_binary (timestamp, is_encrypted, content)
             VALUES (?, ?, ?)`,
          [
            msg.getTimestamp(),
            msg.getIsencrypted() ? 1 : 0,
            Buffer.from(msg.getContent()),
          ],
        );

        if (info.changes > 0) {
          trie = merkle.insert(trie, Timestamp.parse(msg.getTimestamp()));
        }
      }
    }

    trie = merkle.prune(trie);

    db.mutate(
      'INSERT INTO messages_merkles (id, merkle) VALUES (1, ?) ON CONFLICT (id) DO UPDATE SET merkle = ?',
      [JSON.stringify(trie), JSON.stringify(trie)],
    );

    returnValue = trie;
  });

  return returnValue;
}

function getMerkle(db: WrappedDatabase): Record<string, unknown> {
  const rows = db.all('SELECT * FROM messages_merkles');

  if (rows.length > 0) {
    return JSON.parse(rows[0].merkle as string);
  } else {
    // No merkle trie exists yet (first sync of the app), so create a
    // default one.
    return {};
  }
}

interface SyncResult {
  trie: Record<string, unknown> | undefined;
  newMessages: MessageEnvelope[];
}

export function sync(
  messages: MessageEnvelope[],
  since: string,
  groupId: string,
): SyncResult {
  const db = getGroupDb(groupId);
  const newMessages = db.all(
    `SELECT * FROM messages_binary
         WHERE timestamp > ?
         ORDER BY timestamp`,
    [since],
  );

  const trie = addMessages(db, messages);

  db.close();

  return {
    trie,
    newMessages: newMessages.map(msg => {
      const envelopePb = new SyncProtoBuf.MessageEnvelope();
      envelopePb.setTimestamp(msg.timestamp as string);
      envelopePb.setIsencrypted(msg.is_encrypted as boolean);
      envelopePb.setContent(msg.content as Buffer);
      return envelopePb as unknown as MessageEnvelope;
    }),
  };
}
