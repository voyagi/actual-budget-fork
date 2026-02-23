import type { AccountEntity, TransactionEntity } from '../../types/models';
import * as db from '../db';
import { BankSyncError, PostError } from '../errors';

export type SyncResponse = {
  newTransactions: Array<TransactionEntity['id']>;
  matchedTransactions: Array<TransactionEntity['id']>;
  updatedAccounts: Array<AccountEntity['id']>;
};

export async function handleSyncResponse(
  res: {
    added: Array<TransactionEntity['id']>;
    updated: Array<TransactionEntity['id']>;
  },
  acct: db.DbAccount,
): Promise<SyncResponse> {
  const { added, updated } = res;
  const newTransactions: Array<TransactionEntity['id']> = [];
  const matchedTransactions: Array<TransactionEntity['id']> = [];
  const updatedAccounts: Array<AccountEntity['id']> = [];

  newTransactions.push(...added);
  matchedTransactions.push(...updated);

  if (added.length > 0) {
    updatedAccounts.push(acct.id);
  }

  const ts = new Date().getTime().toString();
  await db.update('accounts', { id: acct.id, last_sync: ts });

  return {
    newTransactions,
    matchedTransactions,
    updatedAccounts,
  };
}

export type SyncError =
  | {
      type: 'SyncError';
      accountId: AccountEntity['id'];
      message: string;
      category: string;
      code: string;
    }
  | {
      accountId: AccountEntity['id'];
      message: string;
      internal?: string;
    };

/**
 * Type guard to check if an error is a BankSyncError.
 * Handles both class instances and plain objects with the BankSyncError shape.
 */
export function isBankSyncError(err: unknown): err is BankSyncError {
  return (
    err instanceof BankSyncError ||
    (typeof err === 'object' &&
      err !== null &&
      'type' in err &&
      err.type === 'BankSyncError')
  );
}

/**
 * Converts a sync error into a standardized SyncError response object.
 */
export function handleSyncError(
  err: Error | PostError | BankSyncError,
  acct: db.DbAccount,
): SyncError {
  if (isBankSyncError(err)) {
    const syncError = {
      type: 'SyncError' as const,
      accountId: acct.id,
      message: 'Failed syncing account "' + acct.name + '."',
      category: err.category,
      code: err.code,
    };

    if (err.category === 'RATE_LIMIT_EXCEEDED') {
      return {
        ...syncError,
        message: `Failed syncing account ${acct.name}. Rate limit exceeded. Please try again later.`,
      };
    }

    return syncError;
  }

  if (err instanceof PostError && err.reason !== 'internal') {
    return {
      accountId: acct.id,
      message: err.reason
        ? err.reason
        : `Account "${acct.name}" is not linked properly. Please link it again.`,
    };
  }

  return {
    accountId: acct.id,
    message:
      'There was an internal error. Please get in touch https://actualbudget.org/contact for support.',
    internal: err.stack,
  };
}

export type SyncResponseWithErrors = SyncResponse & {
  errors: SyncError[];
};
