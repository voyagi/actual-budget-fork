import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  CSSProperties,
  ForwardedRef,
  KeyboardEvent,
  ReactNode,
  RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';

import memoizeOne from 'memoize-one';

import { q } from 'loot-core/shared/query';
import {
  addSplitTransaction,
  deleteTransaction,
  groupTransaction,
  isPreviewId,
  isTemporaryId,
  splitTransaction,
  ungroupTransactions,
  updateTransaction,
} from 'loot-core/shared/transactions';
import type { IntegerAmount } from 'loot-core/shared/util';
import type {
  AccountEntity,
  CategoryEntity,
  CategoryGroupEntity,
  PayeeEntity,
  RuleEntity,
  ScheduleEntity,
  TransactionEntity,
} from 'loot-core/types/models';

import { isLastChild, makeTemporaryTransactions } from './table/utils';
import { TransactionTableInner } from './TransactionTableInner';

import { getAccountsById } from '@desktop-client/accounts/accountsSlice';
import type {
  TableHandleRef,
  TableNavigator,
} from '@desktop-client/components/table';
import { useTableNavigator } from '@desktop-client/components/table';
import {
  SchedulesProvider,
} from '@desktop-client/hooks/useCachedSchedules';
import {
  DisplayPayeeProvider,
} from '@desktop-client/hooks/useDisplayPayee';
import { useLocalPref } from '@desktop-client/hooks/useLocalPref';
import { useMergedRefs } from '@desktop-client/hooks/useMergedRefs';
import {
  useSelectedItems,
} from '@desktop-client/hooks/useSelected';
import { useSplitsExpanded } from '@desktop-client/hooks/useSplitsExpanded';
import type { SplitsExpandedContextValue } from '@desktop-client/hooks/useSplitsExpanded';
import { addNotification } from '@desktop-client/notifications/notificationsSlice';
import { getPayeesById } from '@desktop-client/payees/payeesSlice';
import { useDispatch } from '@desktop-client/redux';

// Re-export getCategoriesById so extracted modules can import it from here
export const getCategoriesById = memoizeOne(
  (categoryGroups: CategoryGroupEntity[] | null | undefined) => {
    const res: { [id: CategoryEntity['id']]: CategoryEntity } = {};
    categoryGroups?.forEach(group => {
      group.categories?.forEach(cat => {
        res[cat.id] = cat;
      });
    });

    return res;
  },
);

type TableState = {
  newTransactions: TransactionEntity[];
  newNavigator: TableNavigator<TransactionEntity>;
  tableNavigator: TableNavigator<TransactionEntity>;
  transactions: readonly TransactionEntity[];
};

export type TransactionTableProps = {
  transactions: readonly TransactionEntity[];
  loadMoreTransactions: () => void;
  accounts: AccountEntity[];
  categoryGroups: CategoryGroupEntity[];
  payees: PayeeEntity[];
  balances: Record<TransactionEntity['id'], IntegerAmount> | null;
  showBalances: boolean;
  showReconciled: boolean;
  showCleared: boolean;
  showAccount: boolean;
  showCategory: boolean;
  currentAccountId: AccountEntity['id'];
  currentCategoryId: CategoryEntity['id'];
  isAdding: boolean;
  isNew: (id: TransactionEntity['id']) => boolean;
  isMatched: (id: TransactionEntity['id']) => boolean;
  dateFormat: string | undefined;
  hideFraction: boolean;
  renderEmpty: ReactNode | (() => ReactNode);
  onSave: (transaction: TransactionEntity) => void;
  onApplyRules: (
    transaction: TransactionEntity,
    field: string | null,
  ) => Promise<TransactionEntity>;
  onSplit: (id: TransactionEntity['id']) => TransactionEntity['id'];
  onAddSplit: (id: TransactionEntity['id']) => TransactionEntity['id'];
  onCloseAddTransaction: () => void;
  onAdd: (transactions: TransactionEntity[]) => void;
  onCreatePayee: (name: string) => Promise<null | PayeeEntity['id']>;
  style?: CSSProperties;
  onNavigateToTransferAccount: (id: AccountEntity['id']) => void;
  onNavigateToSchedule: (id: ScheduleEntity['id']) => void;
  onNotesTagClick: (tag: string) => void;
  onSort: (field: string, ascDesc: 'asc' | 'desc') => void;
  sortField: string;
  ascDesc: 'asc' | 'desc';
  onBatchDelete: (ids: TransactionEntity['id'][]) => void;
  onBatchDuplicate: (ids: TransactionEntity['id'][]) => void;
  onBatchLinkSchedule: (ids: TransactionEntity['id'][]) => void;
  onBatchUnlinkSchedule: (ids: TransactionEntity['id'][]) => void;
  onCreateRule: (ids: RuleEntity['id'][]) => void;
  onScheduleAction: (
    name: 'skip' | 'post-transaction' | 'post-transaction-today' | 'complete',
    ids: TransactionEntity['id'][],
  ) => void;
  onMakeAsNonSplitTransactions: (ids: string[]) => void;
  showSelection: boolean;
  allowSplitTransaction?: boolean;
  onManagePayees: (id?: PayeeEntity['id']) => void;
};

export const TransactionTable = forwardRef(
  (
    props: TransactionTableProps,
    ref: ForwardedRef<TableHandleRef<TransactionEntity>>,
  ) => {
    const { t } = useTranslation();

    const dispatch = useDispatch();
    const [showHiddenCategories] = useLocalPref('budget.showHiddenCategories');
    const [newTransactions, setNewTransactions] = useState<TransactionEntity[]>(
      [],
    );
    const [prevIsAdding, setPrevIsAdding] = useState(false);
    const splitsExpanded = useSplitsExpanded();
    const splitsExpandedDispatch = splitsExpanded.dispatch;
    const prevSplitsExpanded = useRef<SplitsExpandedContextValue | null>(null);

    const tableRef = useRef<TableHandleRef<TransactionEntity>>(null);
    const listContainerRef = useRef<HTMLDivElement>(
      null,
    ) as RefObject<HTMLDivElement>;
    const mergedRef = useMergedRefs(tableRef, ref);

    const transactionsWithExpandedSplits = useMemo(() => {
      let result: TransactionEntity[];

      if (splitsExpanded.state.transitionId != null) {
        const index = props.transactions.findIndex(
          t => t.id === splitsExpanded.state.transitionId,
        );
        result = props.transactions.filter((t, idx) => {
          if (t.parent_id) {
            if (idx >= index) {
              return splitsExpanded.isExpanded(t.parent_id);
            } else if (prevSplitsExpanded.current) {
              return prevSplitsExpanded.current.isExpanded(t.parent_id);
            }
          }
          return true;
        });
      } else {
        if (
          prevSplitsExpanded.current &&
          prevSplitsExpanded.current.state.transitionId != null
        ) {
          tableRef.current?.anchor();
          tableRef.current?.setRowAnimation(false);
        }
        prevSplitsExpanded.current = splitsExpanded;

        result = props.transactions.filter(t => {
          if (t.parent_id) {
            return splitsExpanded.isExpanded(t.parent_id);
          }
          return true;
        });
      }

      prevSplitsExpanded.current = splitsExpanded;
      return result;
    }, [props.transactions, splitsExpanded]);

    const transactionMap = useMemo(() => {
      return new Map(
        transactionsWithExpandedSplits.map(trans => [trans.id, trans]),
      );
    }, [transactionsWithExpandedSplits]);

    const transactionsByParent = useMemo(() => {
      return props.transactions.reduce(
        (acc, trans) => {
          if (trans.is_child && trans.parent_id) {
            acc[trans.parent_id] = [...(acc[trans.parent_id] ?? []), trans];
          }
          return acc;
        },
        {} as { [parentId: TransactionEntity['id']]: TransactionEntity[] },
      );
    }, [props.transactions]);

    const transferAccountsByTransaction = useMemo(() => {
      if (!props.accounts) {
        return {};
      }
      const accounts = getAccountsById(props.accounts);
      const payees = getPayeesById(props.payees);

      return Object.fromEntries(
        props.transactions.map(t => {
          if (!props.accounts) {
            return [t.id, null];
          }

          const payee = (t.payee && payees[t.payee]) || undefined;
          const transferAccount =
            payee?.transfer_acct && accounts[payee.transfer_acct];
          return [t.id, transferAccount || null];
        }),
      );
    }, [props.transactions, props.payees, props.accounts]);

    const hasPrevSplitsExpanded = prevSplitsExpanded.current;

    useEffect(() => {
      // If it's anchored that means we've also disabled animations. To
      // reduce the chance for side effect collision, only do this if
      // we've actually anchored it
      if (tableRef.current?.isAnchored()) {
        tableRef.current.unanchor();
        tableRef.current.setRowAnimation(true);
      }
    }, [hasPrevSplitsExpanded]);

    const newNavigator = useTableNavigator(
      newTransactions ?? [],
      getFieldsNewTransaction,
    );

    const tableNavigator = useTableNavigator(
      transactionsWithExpandedSplits,
      getFieldsTableTransaction,
    );

    const shouldAdd = useRef(false);
    const shouldAddAndClose = useRef(false);
    const latestState = useRef<TableState>({
      newTransactions: newTransactions ?? [],
      newNavigator,
      tableNavigator,
      transactions: [],
    });
    const savePending = useRef(false);
    const afterSaveFunc = useRef<null | (() => void)>(null);
    const [_, forceRerender] = useState({});
    const selectedItems = useSelectedItems();

    latestState.current = {
      newTransactions: newTransactions ?? [],
      newNavigator,
      tableNavigator,
      transactions: props.transactions,
    };

    // Derive new transactions from the `isAdding` prop
    if (prevIsAdding !== props.isAdding) {
      if (!prevIsAdding && props.isAdding) {
        setNewTransactions(
          makeTemporaryTransactions(
            props.currentAccountId,
            props.currentCategoryId,
          ),
        );
      }
      setPrevIsAdding(props.isAdding);
    }

    if (shouldAdd.current || shouldAddAndClose.current) {
      if (newTransactions?.[0] && newTransactions[0].account == null) {
        dispatch(
          addNotification({
            notification: {
              type: 'error',
              message: t('Account is a required field'),
            },
          }),
        );
        newNavigator.onEdit('temp', 'account');
      } else {
        const transactions = latestState.current.newTransactions;

        if (shouldAddAndClose.current) {
          props.onAdd(transactions);
          props.onCloseAddTransaction();
        } else {
          const lastDate =
            transactions.length > 0 ? transactions[0].date : null;
          setNewTransactions(
            makeTemporaryTransactions(
              props.currentAccountId,
              props.currentCategoryId,
              lastDate,
            ),
          );
          newNavigator.onEdit('temp', 'date');
          props.onAdd(transactions);
        }
      }
      shouldAdd.current = false;
      shouldAddAndClose.current = false;
    }

    useEffect(() => {
      if (savePending.current && afterSaveFunc.current) {
        afterSaveFunc.current();
        afterSaveFunc.current = null;
      }

      savePending.current = false;
    }, [newTransactions, props, props.transactions]);

    function getFieldsNewTransaction(item?: TransactionEntity) {
      const fields = [
        'select',
        'date',
        'account',
        'payee',
        'notes',
        'category',
        'debit',
        'credit',
        'cleared',
        'cancel',
        'add',
      ];

      return getFields(item, fields);
    }

    function getFieldsTableTransaction(item?: TransactionEntity) {
      const fields = [
        'select',
        'date',
        'account',
        'payee',
        'notes',
        'category',
        'debit',
        'credit',
        'cleared',
      ];

      return getFields(item, fields);
    }

    function getFields(item: TransactionEntity | undefined, fields: string[]) {
      fields = item?.is_child
        ? ['select', 'payee', 'notes', 'category', 'debit', 'credit']
        : fields.filter(
            f =>
              (props.showAccount || f !== 'account') &&
              (props.showCategory || f !== 'category'),
          );

      if (item?.id && isPreviewId(item.id)) {
        fields = ['select'];
      }
      if (item?.id && isTemporaryId(item.id)) {
        // You can't focus the select/delete button of temporary
        // transactions
        fields = fields.slice(1);
      }

      return fields;
    }

    function afterSave(func: () => void) {
      if (savePending.current) {
        afterSaveFunc.current = func;
      } else {
        func();
      }
    }

    function onCheckNewEnter(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          e.stopPropagation();
          afterSave(() => {
            shouldAddAndClose.current = true;
            forceRerender({});
          });
        } else if (!e.shiftKey) {
          function getLastTransaction(state: RefObject<TableState>) {
            const { newTransactions } = state.current;
            return newTransactions[newTransactions.length - 1];
          }

          // Right now, the table navigator does some funky stuff with
          // focus, so we want to stop it from handling this event. We
          // still want enter to move up/down normally, so we only stop
          // it if we are on the last transaction (where we are about to
          // do some logic). I don't like this.
          if (newNavigator.editingId === getLastTransaction(latestState).id) {
            e.stopPropagation();
          }

          afterSave(() => {
            const lastTransaction = getLastTransaction(latestState);
            const isSplit =
              lastTransaction.parent_id || lastTransaction.is_parent;

            if (
              latestState.current.newTransactions[0].error &&
              newNavigator.editingId === lastTransaction.id
            ) {
              // add split
              onAddSplit(lastTransaction.id);
            } else if (
              newNavigator.editingId === lastTransaction.id &&
              (!isSplit || !lastTransaction.error)
            ) {
              onAddTemporary();
            }
          });
        }
      }
    }

    function onCheckEnter(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey) {
        const { editingId: id, focusedField } = tableNavigator;

        afterSave(() => {
          const transactions = latestState.current.transactions;
          const idx = transactions.findIndex(t => t.id === id);
          const parent = transactions.find(
            t => t.id === transactions[idx]?.parent_id,
          );

          if (
            isLastChild(transactions, idx) &&
            parent &&
            parent.error &&
            focusedField !== 'select'
          ) {
            e.stopPropagation();
            onAddSplit(id);
          }
        });
      }
    }

    const onAddTemporary = useCallback(() => {
      shouldAdd.current = true;
      // A little hacky - this forces a rerender which will cause the
      // effect we want to run. We have to wait for all updates to be
      // committed (the input could still be saving a value).
      forceRerender({});
    }, []);

    const onAddAndCloseTemporary = useCallback(() => {
      afterSave(() => {
        shouldAddAndClose.current = true;
        forceRerender({});
      });
    }, []);

    const {
      onSave: onSaveProp,
      onApplyRules: onApplyRulesProp,
      onBatchDelete: onBatchDeleteProp,
      onBatchDuplicate: onBatchDuplicateProp,
      onBatchLinkSchedule: onBatchLinkScheduleProp,
      onBatchUnlinkSchedule: onBatchUnlinkScheduleProp,
      onCreateRule: onCreateRuleProp,
      onScheduleAction: onScheduleActionProp,
      onMakeAsNonSplitTransactions: onMakeAsNonSplitTransactionsProp,
      onSplit: onSplitProp,
    } = props;

    const onSave = useCallback(
      async (
        transaction: TransactionEntity,
        subtransactions: TransactionEntity[] | null = null,
        updatedFieldName: keyof TransactionEntity | null = null,
      ) => {
        savePending.current = true;

        let groupedTransaction = subtransactions
          ? groupTransaction([transaction, ...subtransactions])
          : transaction;

        if (isTemporaryId(transaction.id)) {
          if (onApplyRulesProp) {
            groupedTransaction = await onApplyRulesProp(
              groupedTransaction,
              updatedFieldName,
            );
          }

          const newTrans = latestState.current.newTransactions;
          // Future refactor: we shouldn't need to iterate through the entire
          // transaction list to ungroup, just the new transactions.
          setNewTransactions(
            ungroupTransactions(
              updateTransaction(newTrans, groupedTransaction).data,
            ),
          );
        } else {
          onSaveProp(groupedTransaction);
        }
      },
      [onSaveProp, onApplyRulesProp],
    );

    const onDelete = useCallback((id: TransactionEntity['id']) => {
      const temporary = isTemporaryId(id);

      if (temporary) {
        const newTrans = latestState.current.newTransactions;

        if (id === newTrans[0].id) {
          // You can never delete the parent new transaction
          return;
        }

        setNewTransactions(deleteTransaction(newTrans, id).data);
      }
    }, []);

    const onBatchDelete = useCallback(
      (ids: TransactionEntity['id'][]) => {
        onBatchDeleteProp(ids);
      },
      [onBatchDeleteProp],
    );

    const onBatchDuplicate = useCallback(
      (ids: TransactionEntity['id'][]) => {
        onBatchDuplicateProp(ids);
      },
      [onBatchDuplicateProp],
    );

    const onBatchLinkSchedule = useCallback(
      (ids: TransactionEntity['id'][]) => {
        onBatchLinkScheduleProp(ids);
      },
      [onBatchLinkScheduleProp],
    );

    const onBatchUnlinkSchedule = useCallback(
      (ids: TransactionEntity['id'][]) => {
        onBatchUnlinkScheduleProp(ids);
      },
      [onBatchUnlinkScheduleProp],
    );

    const onCreateRule = useCallback(
      (ids: TransactionEntity['id'][]) => {
        onCreateRuleProp(ids);
      },
      [onCreateRuleProp],
    );

    const onScheduleAction = useCallback(
      (
        action:
          | 'skip'
          | 'post-transaction'
          | 'post-transaction-today'
          | 'complete',
        ids: TransactionEntity['id'][],
      ) => {
        onScheduleActionProp(action, ids);
      },
      [onScheduleActionProp],
    );

    const onMakeAsNonSplitTransactions = useCallback(
      (ids: TransactionEntity['id'][]) => {
        onMakeAsNonSplitTransactionsProp(ids);
      },
      [onMakeAsNonSplitTransactionsProp],
    );

    const onSplit = useMemo(() => {
      return (id: TransactionEntity['id']) => {
        if (isTemporaryId(id)) {
          const { newNavigator } = latestState.current;
          const newTrans = latestState.current.newTransactions;
          const { data, diff } = splitTransaction(newTrans, id);
          setNewTransactions(data);

          // Jump next to "debit" field if it is empty
          // Otherwise jump to the same field as before, but downwards
          // to the added split transaction
          if (newTrans[0].amount === null) {
            newNavigator.onEdit(newTrans[0].id, 'debit');
          } else {
            newNavigator.onEdit(
              diff.added[0].id,
              latestState.current.newNavigator.focusedField,
            );
          }
        } else {
          const trans = latestState.current.transactions.find(t => t.id === id);
          const newId = onSplitProp(id);
          if (!trans) {
            return;
          }

          splitsExpandedDispatch({ type: 'open-split', id: trans.id });

          const { tableNavigator } = latestState.current;
          if (trans.amount === null) {
            tableNavigator.onEdit(trans.id, 'debit');
          } else {
            tableNavigator.onEdit(newId, tableNavigator.focusedField);
          }
        }
      };
    }, [onSplitProp, splitsExpandedDispatch]);

    const { onAddSplit: onAddSplitProp } = props;

    const onAddSplit = useCallback(
      (id: TransactionEntity['id']) => {
        const {
          tableNavigator,
          newNavigator,
          newTransactions: newTrans,
        } = latestState.current;

        if (isTemporaryId(id)) {
          const { data, diff } = addSplitTransaction(newTrans, id);
          setNewTransactions(data);
          newNavigator.onEdit(
            diff.added[0].id,
            latestState.current.newNavigator.focusedField,
          );
        } else {
          const newId = onAddSplitProp(id);
          tableNavigator.onEdit(
            newId,
            latestState.current.tableNavigator.focusedField,
          );
        }
      },
      [onAddSplitProp],
    );

    const onDistributeRemainder = useCallback(
      async (id: TransactionEntity['id']) => {
        const { transactions, newNavigator, tableNavigator, newTransactions } =
          latestState.current;

        const targetTransactions = isTemporaryId(id)
          ? newTransactions
          : transactions;
        const transaction = targetTransactions.find(t => t.id === id);

        const parentTransaction = transaction?.is_parent
          ? transaction
          : targetTransactions.find(t => t.id === transaction?.parent_id);

        const siblingTransactions = targetTransactions.filter(
          t =>
            t.parent_id &&
            t.parent_id ===
              (transaction?.is_parent
                ? transaction?.id
                : transaction?.parent_id),
        );

        const emptyTransactions = siblingTransactions.filter(
          t => t.amount === 0,
        );
        if (!parentTransaction) {
          console.error(
            'Parent transaction not found for transaction',
            transaction,
          );
          return;
        }

        const remainingAmount =
          parentTransaction.amount -
          siblingTransactions.reduce((acc, t) => acc + t.amount, 0);

        const amountPerTransaction = Math.floor(
          remainingAmount / emptyTransactions.length,
        );
        let remainingCents =
          remainingAmount - amountPerTransaction * emptyTransactions.length;

        const amounts = new Array(emptyTransactions.length).fill(
          amountPerTransaction,
        );

        for (const amountIndex in amounts) {
          if (remainingCents === 0) break;

          amounts[amountIndex] += 1;
          remainingCents--;
        }

        if (isTemporaryId(id)) {
          newNavigator.onEdit(null);
        } else {
          tableNavigator.onEdit(null);
        }

        for (const transactionIndex in emptyTransactions) {
          await onSave({
            ...emptyTransactions[transactionIndex],
            amount: amounts[transactionIndex],
          });
        }
      },
      [onSave],
    );

    function onCloseAddTransaction() {
      setNewTransactions(
        makeTemporaryTransactions(
          props.currentAccountId,
          props.currentCategoryId,
        ),
      );
      props.onCloseAddTransaction();
    }

    const onToggleSplit = useCallback(
      (id: TransactionEntity['id']) =>
        splitsExpandedDispatch({ type: 'toggle-split', id }),
      [splitsExpandedDispatch],
    );

    const displayPayeeTransactions = useMemo(
      () => [...props.transactions, ...newTransactions],
      [props.transactions, newTransactions],
    );

    const allSchedulesQuery = useMemo(() => q('schedules').select('*'), []);

    return (
      <DisplayPayeeProvider transactions={displayPayeeTransactions}>
        <SchedulesProvider query={allSchedulesQuery}>
          <TransactionTableInner
            tableRef={mergedRef}
            listContainerRef={listContainerRef}
            {...props}
            transactions={transactionsWithExpandedSplits}
            transactionMap={transactionMap}
            transactionsByParent={transactionsByParent}
            transferAccountsByTransaction={transferAccountsByTransaction}
            selectedItems={selectedItems}
            isExpanded={splitsExpanded.isExpanded}
            onSave={onSave}
            onDelete={onDelete}
            onBatchDelete={onBatchDelete}
            onBatchDuplicate={onBatchDuplicate}
            onBatchLinkSchedule={onBatchLinkSchedule}
            onBatchUnlinkSchedule={onBatchUnlinkSchedule}
            onCreateRule={onCreateRule}
            onScheduleAction={onScheduleAction}
            onMakeAsNonSplitTransactions={onMakeAsNonSplitTransactions}
            onSplit={onSplit}
            onCheckNewEnter={onCheckNewEnter}
            onCheckEnter={onCheckEnter}
            onAddTemporary={onAddTemporary}
            onAddAndCloseTemporary={onAddAndCloseTemporary}
            onAddSplit={onAddSplit}
            onDistributeRemainder={onDistributeRemainder}
            onCloseAddTransaction={onCloseAddTransaction}
            onToggleSplit={onToggleSplit}
            newTransactions={newTransactions ?? []}
            tableNavigator={tableNavigator}
            newNavigator={newNavigator}
            showSelection={props.showSelection}
            allowSplitTransaction={props.allowSplitTransaction}
            showHiddenCategories={showHiddenCategories}
          />
        </SchedulesProvider>
      </DisplayPayeeProvider>
    );
  },
);

TransactionTable.displayName = 'TransactionTable';
