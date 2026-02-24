import createDebug from 'debug';

import { getAccountDb } from '../account-db';
import type { WrappedDatabase, MutateResult } from '../db';

export const SecretName = {
  gocardless_secretId: 'gocardless_secretId',
  gocardless_secretKey: 'gocardless_secretKey',
  simplefin_token: 'simplefin_token',
  simplefin_accessKey: 'simplefin_accessKey',
  pluggyai_clientId: 'pluggyai_clientId',
  pluggyai_clientSecret: 'pluggyai_clientSecret',
  pluggyai_itemIds: 'pluggyai_itemIds',
} as const;

export type SecretNameType = (typeof SecretName)[keyof typeof SecretName];

class SecretsDb {
  private debug: ReturnType<typeof createDebug>;
  private db: WrappedDatabase | null;

  constructor() {
    this.debug = createDebug('actual:secrets-db');
    this.db = null;
  }

  open(): WrappedDatabase {
    return getAccountDb();
  }

  set(name: string, value: string): MutateResult {
    if (!this.db) {
      this.db = this.open();
    }

    this.debug(`setting secret '${name}' to '${value}'`);
    const result = this.db.mutate(
      `INSERT OR REPLACE INTO secrets (name, value) VALUES (?,?)`,
      [name, value],
    );
    return result;
  }

  get(name: string): { value: string } | null {
    if (!this.db) {
      this.db = this.open();
    }

    this.debug(`getting secret '${name}'`);
    const result = this.db.first(`SELECT value FROM secrets WHERE name =?`, [
      name,
    ]);
    return result as { value: string } | null;
  }
}

const secretsDb = new SecretsDb();
const _cachedSecrets = new Map<string, string>();

export const secretsService = {
  get: (name: string): string | null => {
    return _cachedSecrets.get(name) ?? secretsDb.get(name)?.value ?? null;
  },

  set: (name: string, value: string): MutateResult => {
    const result = secretsDb.set(name, value);

    if (result.changes === 1) {
      _cachedSecrets.set(name, value);
    }
    return result;
  },

  exists: (name: string): boolean => {
    return Boolean(secretsService.get(name));
  },
};
