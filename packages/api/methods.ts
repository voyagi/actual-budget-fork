import type {
  APIAccountEntity,
  APICategoryEntity,
  APICategoryGroupEntity,
  APIFileEntity,
  APIPayeeEntity,
  APIScheduleEntity,
  APITagEntity,
} from 'loot-core/server/api-models';
import type { Query } from 'loot-core/shared/query';
import type { Handlers } from 'loot-core/types/handlers';
import type {
  ImportTransactionEntity,
  RuleEntity,
  TransactionEntity,
} from 'loot-core/types/models';

import * as injected from './injected';

export { q } from './app/query';

function send<K extends keyof Handlers, T extends Handlers[K]>(
  name: K,
  args?: Parameters<T>[0],
): Promise<Awaited<ReturnType<T>>> {
  return injected.send(name, args);
}

/**
 * Wraps a set of import operations in a begin/finish lifecycle.
 * If the callback throws, the import is automatically aborted.
 */
export async function runImport(
  budgetName: APIFileEntity['name'],
  func: () => Promise<void>,
) {
  await send('api/start-import', { budgetName });
  try {
    await func();
  } catch (e) {
    await send('api/abort-import');
    throw e;
  }
  await send('api/finish-import');
}

/** Loads a budget file by its ID. */
export async function loadBudget(budgetId: string) {
  return send('api/load-budget', { id: budgetId });
}

/** Downloads a budget from the server using its sync ID. */
export async function downloadBudget(
  syncId: string,
  { password }: { password?: string } = {},
) {
  return send('api/download-budget', { syncId, password });
}

/** Returns a list of all local budget files. */
export async function getBudgets() {
  return send('api/get-budgets');
}

/** Syncs the current budget with the server. */
export async function sync() {
  return send('api/sync');
}

/** Runs bank sync for a specific account, or all linked accounts if no ID is given. */
export async function runBankSync(args?: {
  accountId: APIAccountEntity['id'];
}) {
  return send('api/bank-sync', args);
}

/**
 * Batches multiple budget amount updates into a single operation for performance.
 * Wrap calls to `setBudgetAmount` / `setBudgetCarryover` inside the callback.
 */
export async function batchBudgetUpdates(func: () => Promise<void>) {
  await send('api/batch-budget-start');
  try {
    await func();
  } finally {
    await send('api/batch-budget-end');
  }
}

/**
 * @deprecated Please use `aqlQuery` instead.
 * This function will be removed in a future release.
 */
export function runQuery(query: Query) {
  return send('api/query', { query: query.serialize() });
}

/** Runs an AQL query against the budget database. */
export function aqlQuery(query: Query) {
  return send('api/query', { query: query.serialize() });
}

/** Returns all months that have budget data. */
export function getBudgetMonths() {
  return send('api/budget-months');
}

/** Returns budget data for a specific month (format: "YYYY-MM"). */
export function getBudgetMonth(month: string) {
  return send('api/budget-month', { month });
}

/** Sets the budgeted amount for a category in a given month. */
export function setBudgetAmount(
  month: string,
  categoryId: APICategoryEntity['id'],
  value: number,
) {
  return send('api/budget-set-amount', { month, categoryId, amount: value });
}

/** Enables or disables rollover (carryover) for a category in a given month. */
export function setBudgetCarryover(
  month: string,
  categoryId: APICategoryEntity['id'],
  flag: boolean,
) {
  return send('api/budget-set-carryover', { month, categoryId, flag });
}

/**
 * Adds new transactions to an account without running reconciliation.
 * Optionally learns category assignments from payees and detects transfers.
 */
export function addTransactions(
  accountId: APIAccountEntity['id'],
  transactions: Omit<ImportTransactionEntity, 'account'>[],
  {
    learnCategories = false,
    runTransfers = false,
  }: { learnCategories?: boolean; runTransfers?: boolean } = {},
) {
  return send('api/transactions-add', {
    accountId,
    transactions,
    learnCategories,
    runTransfers,
  });
}

export type ImportTransactionsOpts = {
  defaultCleared?: boolean;
  dryRun?: boolean;
};

/**
 * Imports transactions with full reconciliation (deduplication, rule application).
 * Use `dryRun: true` to preview what would be imported without committing.
 */
export function importTransactions(
  accountId: APIAccountEntity['id'],
  transactions: ImportTransactionEntity[],
  opts: ImportTransactionsOpts = {
    defaultCleared: true,
    dryRun: false,
  },
) {
  return send('api/transactions-import', {
    accountId,
    transactions,
    isPreview: opts.dryRun,
    opts,
  });
}

/** Returns transactions for an account within a date range (format: "YYYY-MM-DD"). */
export function getTransactions(
  accountId: APIAccountEntity['id'],
  startDate: string,
  endDate: string,
) {
  return send('api/transactions-get', { accountId, startDate, endDate });
}

/** Updates fields on an existing transaction. */
export function updateTransaction(
  id: TransactionEntity['id'],
  fields: Partial<TransactionEntity>,
) {
  return send('api/transaction-update', { id, fields });
}

/** Deletes a transaction by ID. */
export function deleteTransaction(id: TransactionEntity['id']) {
  return send('api/transaction-delete', { id });
}

/** Returns all accounts. */
export function getAccounts() {
  return send('api/accounts-get');
}

/** Creates a new account and optionally sets its starting balance. */
export function createAccount(
  account: Omit<APIAccountEntity, 'id'>,
  initialBalance?: number,
) {
  return send('api/account-create', { account, initialBalance });
}

/** Updates fields on an existing account. */
export function updateAccount(
  id: APIAccountEntity['id'],
  fields: Partial<APIAccountEntity>,
) {
  return send('api/account-update', { id, fields });
}

/**
 * Closes an account. Remaining balance can be transferred to another account
 * or moved to a category (e.g., for write-offs).
 */
export function closeAccount(
  id: APIAccountEntity['id'],
  transferAccountId?: APIAccountEntity['id'],
  transferCategoryId?: APICategoryEntity['id'],
) {
  return send('api/account-close', {
    id,
    transferAccountId,
    transferCategoryId,
  });
}

/** Reopens a previously closed account. */
export function reopenAccount(id: APIAccountEntity['id']) {
  return send('api/account-reopen', { id });
}

/** Permanently deletes an account and all its transactions. */
export function deleteAccount(id: APIAccountEntity['id']) {
  return send('api/account-delete', { id });
}

/** Returns the balance of an account, optionally as of a cutoff date. */
export function getAccountBalance(id: APIAccountEntity['id'], cutoff?: Date) {
  return send('api/account-balance', { id, cutoff });
}

/** Returns all category groups with their categories. */
export function getCategoryGroups() {
  return send('api/category-groups-get');
}

/** Creates a new category group. */
export function createCategoryGroup(group: Omit<APICategoryGroupEntity, 'id'>) {
  return send('api/category-group-create', { group });
}

/** Updates fields on an existing category group. */
export function updateCategoryGroup(
  id: APICategoryGroupEntity['id'],
  fields: Partial<APICategoryGroupEntity>,
) {
  return send('api/category-group-update', { id, fields });
}

/** Deletes a category group. Transactions can be moved to a transfer category. */
export function deleteCategoryGroup(
  id: APICategoryGroupEntity['id'],
  transferCategoryId?: APICategoryEntity['id'],
) {
  return send('api/category-group-delete', { id, transferCategoryId });
}

/** Returns all categories as a flat list (not grouped). */
export function getCategories() {
  return send('api/categories-get', { grouped: false });
}

/** Creates a new category. */
export function createCategory(category: Omit<APICategoryEntity, 'id'>) {
  return send('api/category-create', { category });
}

/** Updates fields on an existing category. */
export function updateCategory(
  id: APICategoryEntity['id'],
  fields: Partial<APICategoryEntity>,
) {
  return send('api/category-update', { id, fields });
}

/** Deletes a category. Transactions can be moved to a transfer category. */
export function deleteCategory(
  id: APICategoryEntity['id'],
  transferCategoryId?: APICategoryEntity['id'],
) {
  return send('api/category-delete', { id, transferCategoryId });
}

/** Returns the most frequently used payees. */
export function getCommonPayees() {
  return send('api/common-payees-get');
}

/** Returns all payees. */
export function getPayees() {
  return send('api/payees-get');
}

/** Creates a new payee. */
export function createPayee(payee: Omit<APIPayeeEntity, 'id'>) {
  return send('api/payee-create', { payee });
}

/** Updates fields on an existing payee. */
export function updatePayee(
  id: APIPayeeEntity['id'],
  fields: Partial<APIPayeeEntity>,
) {
  return send('api/payee-update', { id, fields });
}

/** Deletes a payee by ID. */
export function deletePayee(id: APIPayeeEntity['id']) {
  return send('api/payee-delete', { id });
}

/** Returns all tags. */
export function getTags() {
  return send('api/tags-get');
}

/** Creates a new tag. */
export function createTag(tag: Omit<APITagEntity, 'id'>) {
  return send('api/tag-create', { tag });
}

/** Updates fields on an existing tag. */
export function updateTag(
  id: APITagEntity['id'],
  fields: Partial<Omit<APITagEntity, 'id'>>,
) {
  return send('api/tag-update', { id, fields });
}

/** Deletes a tag by ID. */
export function deleteTag(id: APITagEntity['id']) {
  return send('api/tag-delete', { id });
}

/** Merges multiple payees into a target payee, reassigning all their transactions. */
export function mergePayees(
  targetId: APIPayeeEntity['id'],
  mergeIds: APIPayeeEntity['id'][],
) {
  return send('api/payees-merge', { targetId, mergeIds });
}

/** Returns all transaction rules. */
export function getRules() {
  return send('api/rules-get');
}

/** Returns all rules associated with a specific payee. */
export function getPayeeRules(id: RuleEntity['id']) {
  return send('api/payee-rules-get', { id });
}

/** Creates a new transaction rule. */
export function createRule(rule: Omit<RuleEntity, 'id'>) {
  return send('api/rule-create', { rule });
}

/** Updates an existing transaction rule. */
export function updateRule(rule: RuleEntity) {
  return send('api/rule-update', { rule });
}

/** Deletes a transaction rule by ID. */
export function deleteRule(id: RuleEntity['id']) {
  return send('api/rule-delete', id);
}

/** Holds a specified amount from the current month's budget for next month. */
export function holdBudgetForNextMonth(month: string, amount: number) {
  return send('api/budget-hold-for-next-month', { month, amount });
}

/** Releases any held budget amount for a given month. */
export function resetBudgetHold(month: string) {
  return send('api/budget-reset-hold', { month });
}

/** Creates a new scheduled transaction. */
export function createSchedule(schedule: Omit<APIScheduleEntity, 'id'>) {
  return send('api/schedule-create', schedule);
}

/** Updates a scheduled transaction. Set `resetNextDate` to recalculate the next occurrence. */
export function updateSchedule(
  id: APIScheduleEntity['id'],
  fields: Partial<APIScheduleEntity>,
  resetNextDate?: boolean,
) {
  return send('api/schedule-update', {
    id,
    fields,
    resetNextDate,
  });
}

/** Deletes a scheduled transaction by ID. */
export function deleteSchedule(scheduleId: APIScheduleEntity['id']) {
  return send('api/schedule-delete', scheduleId);
}

/** Returns all scheduled transactions. */
export function getSchedules() {
  return send('api/schedules-get');
}

/** Looks up an entity ID by its display name. Useful for scripting without hardcoded IDs. */
export function getIDByName(
  type: 'accounts' | 'schedules' | 'categories' | 'payees',
  name: string,
) {
  return send('api/get-id-by-name', { type, name });
}

/** Returns the version string of the connected Actual server. */
export function getServerVersion() {
  return send('api/get-server-version');
}
