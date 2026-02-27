// @ts-strict-ignore
import { t } from 'i18next';
import { v4 as uuidv4 } from 'uuid';

import * as asyncStorage from '../../platform/server/asyncStorage';
import * as connection from '../../platform/server/connection';
import { logger } from '../../platform/server/log';
import type {
  AccountEntity,
  SyncServerEnableBankingAccount,
  SyncServerGoCardlessAccount,
  SyncServerPluggyAiAccount,
  SyncServerSimpleFinAccount,
} from '../../types/models';
import * as db from '../db';
import { post } from '../post';
import { getServer } from '../server-config';

import { seedCategoryRules } from './eb-category-rules.js';
import * as link from './link';
import * as bankSync from './sync';

export type LinkAccountBaseParams = {
  upgradingId?: AccountEntity['id'];
  offBudget?: boolean;
  startingDate?: string;
  startingBalance?: number;
};

export async function linkGoCardlessAccount({
  requisitionId,
  account,
  upgradingId,
  offBudget = false,
  startingDate,
  startingBalance,
}: LinkAccountBaseParams & {
  requisitionId: string;
  account: SyncServerGoCardlessAccount;
}) {
  let id;
  const bank = await link.findOrCreateBank(account.institution, requisitionId);

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    id = accRow.id;
    await db.update('accounts', {
      id,
      account_id: account.account_id,
      bank: bank.id,
      account_sync_source: 'goCardless',
    });
  } else {
    id = uuidv4();
    await db.insertWithUUID('accounts', {
      id,
      account_id: account.account_id,
      mask: account.mask,
      name: account.name,
      official_name: account.official_name,
      bank: bank.id,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'goCardless',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: id,
    });
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    id,
    account.account_id,
    bank.bank_id,
    startingDate,
    startingBalance,
  );

  connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

export async function linkSimpleFinAccount({
  externalAccount,
  upgradingId,
  offBudget = false,
  startingDate,
  startingBalance,
}: LinkAccountBaseParams & {
  externalAccount: SyncServerSimpleFinAccount;
}) {
  let id;

  const institution = {
    name: externalAccount.institution ?? t('Unknown'),
  };

  const bank = await link.findOrCreateBank(
    institution,
    externalAccount.orgDomain ?? externalAccount.orgId,
  );

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    id = accRow.id;
    await db.update('accounts', {
      id,
      account_id: externalAccount.account_id,
      bank: bank.id,
      account_sync_source: 'simpleFin',
    });
  } else {
    id = uuidv4();
    await db.insertWithUUID('accounts', {
      id,
      account_id: externalAccount.account_id,
      name: externalAccount.name,
      official_name: externalAccount.name,
      bank: bank.id,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'simpleFin',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: id,
    });
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    id,
    externalAccount.account_id,
    bank.bank_id,
    startingDate,
    startingBalance,
  );

  await connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

export async function linkPluggyAiAccount({
  externalAccount,
  upgradingId,
  offBudget = false,
  startingDate,
  startingBalance,
}: LinkAccountBaseParams & {
  externalAccount: SyncServerPluggyAiAccount;
}) {
  let id;

  const institution = {
    name: externalAccount.institution ?? t('Unknown'),
  };

  const bank = await link.findOrCreateBank(
    institution,
    externalAccount.orgDomain ?? externalAccount.orgId,
  );

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    id = accRow.id;
    await db.update('accounts', {
      id,
      account_id: externalAccount.account_id,
      bank: bank.id,
      account_sync_source: 'pluggyai',
    });
  } else {
    id = uuidv4();
    await db.insertWithUUID('accounts', {
      id,
      account_id: externalAccount.account_id,
      name: externalAccount.name,
      official_name: externalAccount.name,
      bank: bank.id,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'pluggyai',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: id,
    });
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    id,
    externalAccount.account_id,
    bank.bank_id,
    startingDate,
    startingBalance,
  );

  await connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

export async function linkEnableBankingAccount({
  sessionId,
  account,
  upgradingId,
  offBudget = false,
  startingDate,
  startingBalance,
}: LinkAccountBaseParams & {
  sessionId: string;
  account: SyncServerEnableBankingAccount;
}) {
  let newAccountId: string;

  const institution = { name: account.institution };
  const bank = await link.findOrCreateBank(institution, sessionId);

  if (upgradingId) {
    const accRow = await db.first<db.DbAccount>(
      'SELECT * FROM accounts WHERE id = ?',
      [upgradingId],
    );

    if (!accRow) {
      throw new Error(`Account with ID ${upgradingId} not found.`);
    }

    newAccountId = accRow.id;
    await db.update('accounts', {
      id: newAccountId,
      account_id: account.account_id,
      bank: bank.id,
      bankName: account.institution,
      account_sync_source: 'enableBanking',
    });
  } else {
    newAccountId = uuidv4();
    await db.insertWithUUID('accounts', {
      id: newAccountId,
      account_id: account.account_id,
      name: account.name,
      official_name: account.official_name,
      bank: bank.id,
      bankName: account.institution,
      bankId: sessionId,
      balance_current: account.balance,
      mask: account.mask,
      offbudget: offBudget ? 1 : 0,
      account_sync_source: 'enableBanking',
    });
    await db.insertPayee({
      name: '',
      transfer_acct: newAccountId,
    });
  }

  const userToken = await asyncStorage.getItem('user-token');
  const serverConfig = getServer();
  if (!serverConfig) {
    throw new Error('Failed to get server config.');
  }

  const mapRes = await post(
    serverConfig.ENABLEBANKING_SERVER + '/update-account-map',
    { ebAccountUid: account.account_id, actualAccountId: newAccountId },
    {
      'X-ACTUAL-TOKEN': userToken,
    },
  );

  if (!mapRes || mapRes.status !== 'ok') {
    throw new Error(
      'Failed to update account map for ' +
        account.account_id +
        '. Aborting link.',
    );
  }

  await bankSync.syncAccount(
    undefined,
    undefined,
    newAccountId,
    account.account_id,
    sessionId,
    startingDate,
    startingBalance,
  );

  await seedCategoryRules();

  connection.send('sync-event', {
    type: 'success',
    tables: ['transactions'],
  });

  return 'ok';
}

export async function unlinkAccount({ id }: { id: AccountEntity['id'] }) {
  const accRow = await db.first<db.DbAccount>(
    'SELECT * FROM accounts WHERE id = ?',
    [id],
  );

  if (!accRow) {
    throw new Error(`Account with ID ${id} not found.`);
  }

  const bankId = accRow.bank;

  if (!bankId) {
    return 'ok';
  }

  const isGoCardless = accRow.account_sync_source === 'goCardless';

  await db.updateAccount({
    id,
    account_id: null,
    bank: null,
    balance_current: null,
    balance_available: null,
    balance_limit: null,
    account_sync_source: null,
  });

  if (isGoCardless === false) {
    return;
  }

  const accountWithBankResult = await db.first<{ count: number }>(
    'SELECT COUNT(*) as count FROM accounts WHERE bank = ?',
    [bankId],
  );

  const userToken = await asyncStorage.getItem('user-token');
  if (!userToken) {
    return 'ok';
  }

  if (!accountWithBankResult || accountWithBankResult.count === 0) {
    const bank = await db.first<Pick<db.DbBank, 'bank_id'>>(
      'SELECT bank_id FROM banks WHERE id = ?',
      [bankId],
    );

    if (!bank) {
      throw new Error(`Bank with ID ${bankId} not found.`);
    }

    const serverConfig = getServer();
    if (!serverConfig) {
      throw new Error('Failed to get server config.');
    }

    const requisitionId = bank.bank_id;

    try {
      await post(
        serverConfig.GOCARDLESS_SERVER + '/remove-account',
        {
          requisitionId,
        },
        {
          'X-ACTUAL-TOKEN': userToken,
        },
      );
    } catch (error) {
      logger.log({ error });
    }
  }

  return 'ok';
}
