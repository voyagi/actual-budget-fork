import { v4 as uuidv4 } from 'uuid';

import { captureException } from '../../platform/exceptions';
import * as asyncStorage from '../../platform/server/asyncStorage';
import * as connection from '../../platform/server/connection';
import { logger } from '../../platform/server/log';
import { dayFromDate } from '../../shared/months';
import * as monthUtils from '../../shared/months';
import { amountToInteger } from '../../shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  ImportTransactionEntity,
  TransactionEntity,
} from '../../types/models';
import { createApp } from '../app';
import * as db from '../db';
import { APIError, BankSyncError, TransactionError } from '../errors';
import { app as mainApp } from '../main-app';
import { mutator } from '../mutators';
import { batchMessages } from '../sync';
import { undoable, withUndo } from '../undo';

import {
  linkEnableBankingAccount,
  linkGoCardlessAccount,
  linkPluggyAiAccount,
  linkSimpleFinAccount,
  unlinkAccount,
} from './link-accounts';
import { getStartingBalancePayee } from './payees';
import {
  checkSecret,
  createGoCardlessWebToken,
  enableBankingCreateAuth,
  enableBankingGetBanks,
  enableBankingPollSession,
  enableBankingReauthComplete,
  enableBankingStatus,
  enableBankingSyncStatus,
  getGoCardlessBanks,
  goCardlessStatus,
  pluggyAiAccounts,
  pluggyAiStatus,
  pollGoCardlessWebToken,
  setSecret,
  simpleFinAccounts,
  simpleFinStatus,
  stopGoCardlessWebTokenPolling,
} from './provider-status';
import * as bankSync from './sync';
import {
  handleSyncError,
  handleSyncResponse,
  type SyncResponseWithErrors,
} from './sync-helpers';

export type { SyncResponseWithErrors } from './sync-helpers';

export type AccountHandlers = {
  'account-update': typeof updateAccount;
  'accounts-get': typeof getAccounts;
  'account-balance': typeof getAccountBalance;
  'account-properties': typeof getAccountProperties;
  'gocardless-accounts-link': typeof linkGoCardlessAccount;
  'simplefin-accounts-link': typeof linkSimpleFinAccount;
  'pluggyai-accounts-link': typeof linkPluggyAiAccount;
  'account-create': typeof createAccount;
  'account-close': typeof closeAccount;
  'account-reopen': typeof reopenAccount;
  'account-move': typeof moveAccount;
  'secret-set': typeof setSecret;
  'secret-check': typeof checkSecret;
  'gocardless-poll-web-token': typeof pollGoCardlessWebToken;
  'gocardless-poll-web-token-stop': typeof stopGoCardlessWebTokenPolling;
  'gocardless-status': typeof goCardlessStatus;
  'simplefin-status': typeof simpleFinStatus;
  'pluggyai-status': typeof pluggyAiStatus;
  'simplefin-accounts': typeof simpleFinAccounts;
  'pluggyai-accounts': typeof pluggyAiAccounts;
  'gocardless-get-banks': typeof getGoCardlessBanks;
  'gocardless-create-web-token': typeof createGoCardlessWebToken;
  'accounts-bank-sync': typeof accountsBankSync;
  'simplefin-batch-sync': typeof simpleFinBatchSync;
  'transactions-import': typeof importTransactions;
  'account-unlink': typeof unlinkAccount;
  'enablebanking-status': typeof enableBankingStatus;
  'enablebanking-get-banks': typeof enableBankingGetBanks;
  'enablebanking-create-auth': typeof enableBankingCreateAuth;
  'enablebanking-poll-session': typeof enableBankingPollSession;
  'enablebanking-accounts-link': typeof linkEnableBankingAccount;
  'enablebanking-sync-status': typeof enableBankingSyncStatus;
  'enablebanking-reauth-complete': typeof enableBankingReauthComplete;
};

async function updateAccount({
  id,
  name,
  last_reconciled,
}: Pick<AccountEntity, 'id' | 'name'> &
  Partial<Pick<AccountEntity, 'last_reconciled'>>) {
  await db.update('accounts', {
    id,
    name,
    ...(last_reconciled && { last_reconciled }),
  });
  return {};
}

async function getAccounts(): Promise<AccountEntity[]> {
  const dbAccounts = await db.getAccounts();
  return dbAccounts.map(
    dbAccount =>
      ({
        id: dbAccount.id,
        name: dbAccount.name,
        offbudget: dbAccount.offbudget,
        closed: dbAccount.closed,
        sort_order: dbAccount.sort_order,
        last_reconciled: dbAccount.last_reconciled ?? null,
        tombstone: dbAccount.tombstone,
        account_id: dbAccount.account_id ?? null,
        bank: dbAccount.bank ?? null,
        bankName: dbAccount.bankName ?? null,
        bankId: dbAccount.bankId ?? null,
        mask: dbAccount.mask ?? null,
        official_name: dbAccount.official_name ?? null,
        balance_current: dbAccount.balance_current ?? null,
        balance_available: dbAccount.balance_available ?? null,
        balance_limit: dbAccount.balance_limit ?? null,
        account_sync_source: dbAccount.account_sync_source ?? null,
        last_sync: dbAccount.last_sync ?? null,
      }) as AccountEntity,
  );
}

async function getAccountBalance({
  id,
  cutoff,
}: {
  id: string;
  cutoff: string | Date;
}) {
  const result = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0 AND date <= ?',
    [id, db.toDateRepr(dayFromDate(cutoff))],
  );
  return result?.balance ? result.balance : 0;
}

async function getAccountProperties({ id }: { id: AccountEntity['id'] }) {
  const balanceResult = await db.first<{ balance: number }>(
    'SELECT sum(amount) as balance FROM transactions WHERE acct = ? AND isParent = 0 AND tombstone = 0',
    [id],
  );
  const countResult = await db.first<{ count: number }>(
    'SELECT count(id) as count FROM transactions WHERE acct = ? AND tombstone = 0',
    [id],
  );

  return {
    balance: balanceResult?.balance || 0,
    numTransactions: countResult?.count || 0,
  };
}

async function createAccount({
  name,
  balance = 0,
  offBudget = false,
  closed = false,
}: {
  name: string;
  balance?: number | undefined;
  offBudget?: boolean | undefined;
  closed?: boolean | undefined;
}) {
  const id: AccountEntity['id'] = await db.insertAccount({
    name,
    offbudget: offBudget ? 1 : 0,
    closed: closed ? 1 : 0,
  });

  await db.insertPayee({
    name: '',
    transfer_acct: id,
  });

  if (balance != null && balance !== 0) {
    const payee = await getStartingBalancePayee();

    await db.insertTransaction({
      account: id,
      amount: amountToInteger(balance),
      category: offBudget ? null : payee.category,
      payee: payee.id,
      date: monthUtils.currentDay(),
      cleared: true,
      starting_balance_flag: true,
    });
  }

  return id;
}

async function closeAccount({
  id,
  transferAccountId,
  categoryId,
  forced = false,
}: {
  id: AccountEntity['id'];
  transferAccountId?: AccountEntity['id'] | undefined;
  categoryId?: CategoryEntity['id'] | undefined;
  forced?: boolean | undefined;
}) {
  await unlinkAccount({ id });

  return withUndo(async () => {
    const account = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ? AND tombstone = 0',
      [id],
    );

    if (!account || account.closed === 1) {
      return;
    }

    const { balance, numTransactions } = await getAccountProperties({ id });

    if (numTransactions === 0) {
      await db.deleteAccount({ id });
    } else if (forced) {
      const rows = await db.runQuery<
        Pick<db.DbViewTransaction, 'id' | 'transfer_id'>
      >(
        'SELECT id, transfer_id FROM v_transactions WHERE account = ?',
        [id],
        true,
      );

      const transferPayee = await db.first<Pick<db.DbPayee, 'id'>>(
        'SELECT id FROM payees WHERE transfer_acct = ?',
        [id],
      );

      if (!transferPayee) {
        throw new Error(`Transfer payee with account ID ${id} not found.`);
      }

      await batchMessages(async () => {
        rows.forEach(row => {
          if (row.transfer_id) {
            db.updateTransaction({
              id: row.transfer_id,
              payee: null,
              transfer_id: null,
            });
          }

          db.deleteTransaction({ id: row.id });
        });

        db.deleteAccount({ id });
        db.deleteTransferPayee({ id: transferPayee.id });
      });
    } else {
      if (balance !== 0 && transferAccountId == null) {
        throw APIError('balance is non-zero: transferAccountId is required');
      }

      if (id === transferAccountId) {
        throw APIError('transfer account can not be the account being closed');
      }

      await db.update('accounts', { id, closed: 1 });

      if (balance !== 0 && transferAccountId) {
        const transferPayee = await db.first<Pick<db.DbPayee, 'id'>>(
          'SELECT id FROM payees WHERE transfer_acct = ?',
          [transferAccountId],
        );

        if (!transferPayee) {
          throw new Error(
            `Transfer payee with account ID ${transferAccountId} not found.`,
          );
        }

        await mainApp.handlers['transaction-add']({
          id: uuidv4(),
          payee: transferPayee.id,
          amount: -balance,
          account: id,
          date: monthUtils.currentDay(),
          notes: 'Closing account',
          category: categoryId,
        });
      }
    }
  });
}

async function reopenAccount({ id }: { id: AccountEntity['id'] }) {
  await db.update('accounts', { id, closed: 0 });
}

async function moveAccount({
  id,
  targetId,
}: {
  id: AccountEntity['id'];
  targetId: AccountEntity['id'] | null;
}) {
  await db.moveAccount(id, targetId);
}

async function accountsBankSync({
  ids = [],
}: {
  ids: Array<AccountEntity['id']>;
}): Promise<SyncResponseWithErrors> {
  const { 'user-id': userId, 'user-key': userKey } =
    await asyncStorage.multiGet(['user-id', 'user-key']);

  const accounts = await db.runQuery<
    db.DbAccount & { bankId: db.DbBank['bank_id'] }
  >(
    `
    SELECT a.*, b.bank_id as bankId
    FROM accounts a
    LEFT JOIN banks b ON a.bank = b.id
    WHERE a.tombstone = 0 AND a.closed = 0
      ${ids.length ? `AND a.id IN (${ids.map(() => '?').join(', ')})` : ''}
    ORDER BY a.offbudget, a.sort_order
  `,
    ids,
    true,
  );

  const errors: ReturnType<typeof handleSyncError>[] = [];
  const newTransactions: Array<TransactionEntity['id']> = [];
  const matchedTransactions: Array<TransactionEntity['id']> = [];
  const updatedAccounts: Array<AccountEntity['id']> = [];

  for (const acct of accounts) {
    if (acct.bankId && acct.account_id) {
      try {
        logger.group('Bank Sync operation for account:', acct.name);
        const syncResponse = await bankSync.syncAccount(
          userId as string,
          userKey as string,
          acct.id,
          acct.account_id,
          acct.bankId,
        );

        const syncResponseData = await handleSyncResponse(syncResponse, acct);

        newTransactions.push(...syncResponseData.newTransactions);
        matchedTransactions.push(...syncResponseData.matchedTransactions);
        updatedAccounts.push(...syncResponseData.updatedAccounts);
      } catch (err) {
        const error = err as Error;
        errors.push(handleSyncError(error, acct));
        captureException({
          ...error,
          message: 'Failed syncing account "' + acct.name + '."',
        } as Error);
      } finally {
        logger.groupEnd();
      }
    }
  }

  if (updatedAccounts.length > 0) {
    connection.send('sync-event', {
      type: 'success',
      tables: ['transactions'],
    });
  }

  return { errors, newTransactions, matchedTransactions, updatedAccounts };
}

async function simpleFinBatchSync({
  ids = [],
}: {
  ids: Array<AccountEntity['id']>;
}): Promise<
  Array<{ accountId: AccountEntity['id']; res: SyncResponseWithErrors }>
> {
  const accounts = await db.runQuery<
    db.DbAccount & { bankId: db.DbBank['bank_id'] }
  >(
    `SELECT a.*, b.bank_id as bankId FROM accounts a
         LEFT JOIN banks b ON a.bank = b.id
         WHERE
          a.tombstone = 0
          AND a.closed = 0
          AND a.account_sync_source = 'simpleFin'
          ${ids.length ? `AND a.id IN (${ids.map(() => '?').join(', ')})` : ''}
         ORDER BY a.offbudget, a.sort_order`,
    ids.length ? ids : [],
    true,
  );

  const retVal: Array<{
    accountId: AccountEntity['id'];
    res: {
      errors: ReturnType<typeof handleSyncError>[];
      newTransactions: Array<TransactionEntity['id']>;
      matchedTransactions: Array<TransactionEntity['id']>;
      updatedAccounts: Array<AccountEntity['id']>;
    };
  }> = [];

  logger.group('Bank Sync operation for all SimpleFin accounts');
  try {
    const syncResponses: Array<{
      accountId: AccountEntity['id'];
      res: {
        error_code: string;
        error_type: string;
        added: Array<TransactionEntity['id']>;
        updated: Array<TransactionEntity['id']>;
      };
    }> = await bankSync.simpleFinBatchSync(
      accounts.map(a => ({
        id: a.id,
        account_id: a.account_id || null,
      })),
    );
    for (const syncResponse of syncResponses) {
      const account = accounts.find(a => a.id === syncResponse.accountId);
      if (!account) {
        logger.error(
          `Invalid account ID found in response: ${syncResponse.accountId}. Proceeding to the next account...`,
        );
        continue;
      }

      const errors: ReturnType<typeof handleSyncError>[] = [];
      const newTransactions: Array<TransactionEntity['id']> = [];
      const matchedTransactions: Array<TransactionEntity['id']> = [];
      const updatedAccounts: Array<AccountEntity['id']> = [];

      if (syncResponse.res.error_code) {
        errors.push(
          handleSyncError(
            {
              type: 'BankSyncError',
              reason: 'Failed syncing account "' + account.name + '."',
              category: syncResponse.res.error_type,
              code: syncResponse.res.error_code,
            } as BankSyncError,
            account,
          ),
        );
      } else {
        const syncResponseData = await handleSyncResponse(
          syncResponse.res,
          account,
        );

        newTransactions.push(...syncResponseData.newTransactions);
        matchedTransactions.push(...syncResponseData.matchedTransactions);
        updatedAccounts.push(...syncResponseData.updatedAccounts);
      }

      retVal.push({
        accountId: syncResponse.accountId,
        res: { errors, newTransactions, matchedTransactions, updatedAccounts },
      });
    }
  } catch (err) {
    const errors = [];
    for (const account of accounts) {
      retVal.push({
        accountId: account.id,
        res: {
          errors,
          newTransactions: [],
          matchedTransactions: [],
          updatedAccounts: [],
        },
      });
      const error = err as Error;
      errors.push(handleSyncError(error, account));
    }
  }

  if (retVal.some(a => a.res.updatedAccounts.length > 0)) {
    connection.send('sync-event', {
      type: 'success',
      tables: ['transactions'],
    });
  }

  logger.groupEnd();

  return retVal;
}

export type ImportTransactionsResult = bankSync.ReconcileTransactionsResult & {
  errors: Array<{
    message: string;
  }>;
};

async function importTransactions({
  accountId,
  transactions,
  isPreview,
  opts,
}: {
  accountId: AccountEntity['id'];
  transactions: ImportTransactionEntity[];
  isPreview: boolean;
  opts?: {
    defaultCleared?: boolean;
  };
}): Promise<ImportTransactionsResult> {
  if (typeof accountId !== 'string') {
    throw APIError('transactions-import: accountId must be an id');
  }

  try {
    const reconciled = await bankSync.reconcileTransactions(
      accountId,
      transactions,
      false,
      true,
      isPreview,
      opts?.defaultCleared,
    );
    return {
      errors: [],
      added: reconciled.added,
      updated: reconciled.updated,
      updatedPreview: reconciled.updatedPreview,
    };
  } catch (err) {
    if (err instanceof TransactionError) {
      return {
        errors: [{ message: err.message }],
        added: [],
        updated: [],
        updatedPreview: [],
      };
    }

    throw err;
  }
}

export const app = createApp<AccountHandlers>();

app.method('account-update', mutator(undoable(updateAccount)));
app.method('accounts-get', getAccounts);
app.method('account-balance', getAccountBalance);
app.method('account-properties', getAccountProperties);
app.method('gocardless-accounts-link', linkGoCardlessAccount);
app.method('simplefin-accounts-link', linkSimpleFinAccount);
app.method('pluggyai-accounts-link', linkPluggyAiAccount);
app.method('account-create', mutator(undoable(createAccount)));
app.method('account-close', mutator(closeAccount));
app.method('account-reopen', mutator(undoable(reopenAccount)));
app.method('account-move', mutator(undoable(moveAccount)));
app.method('secret-set', setSecret);
app.method('secret-check', checkSecret);
app.method('gocardless-poll-web-token', pollGoCardlessWebToken);
app.method('gocardless-poll-web-token-stop', stopGoCardlessWebTokenPolling);
app.method('gocardless-status', goCardlessStatus);
app.method('simplefin-status', simpleFinStatus);
app.method('pluggyai-status', pluggyAiStatus);
app.method('simplefin-accounts', simpleFinAccounts);
app.method('pluggyai-accounts', pluggyAiAccounts);
app.method('gocardless-get-banks', getGoCardlessBanks);
app.method('gocardless-create-web-token', createGoCardlessWebToken);
app.method('accounts-bank-sync', accountsBankSync);
app.method('simplefin-batch-sync', simpleFinBatchSync);
app.method('transactions-import', mutator(undoable(importTransactions)));
app.method('account-unlink', mutator(unlinkAccount));
app.method('enablebanking-status', enableBankingStatus);
app.method('enablebanking-get-banks', enableBankingGetBanks);
app.method('enablebanking-create-auth', enableBankingCreateAuth);
app.method('enablebanking-poll-session', enableBankingPollSession);
app.method('enablebanking-accounts-link', linkEnableBankingAccount);
app.method('enablebanking-sync-status', enableBankingSyncStatus);
app.method('enablebanking-reauth-complete', enableBankingReauthComplete);
