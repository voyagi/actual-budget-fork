import { createRef, useCallback, useEffect, useMemo, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent,
  ReactNode,
  Ref,
  RefObject,
} from 'react';

import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

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

import { NewTransaction } from './NewTransaction';
import { isLastChild } from './table/utils';
import { TransactionError } from './TransactionError';
import { TransactionHeader } from './TransactionHeader';
import { Transaction } from './TransactionRow';

import { Table } from '@desktop-client/components/table';
import type {
  TableHandleRef,
  TableNavigator,
  TableProps,
} from '@desktop-client/components/table';
import { usePrevious } from '@desktop-client/hooks/usePrevious';

type TransactionTableInnerProps = {
  tableRef: Ref<TableHandleRef<TransactionEntity>>;
  listContainerRef: RefObject<HTMLDivElement>;
  tableNavigator: TableNavigator<TransactionEntity>;
  newNavigator: TableNavigator<TransactionEntity>;
  selectedItems: Set<string>;
  isExpanded: (id: string) => boolean;
  transactionMap: Map<TransactionEntity['id'], TransactionEntity>;
  transactionsByParent: {
    [parentId: TransactionEntity['id']]: TransactionEntity[];
  };
  transferAccountsByTransaction: {
    [id: TransactionEntity['id']]: AccountEntity | null;
  };
  newTransactions: TransactionEntity[];

  transactions: TransactionEntity[];
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
    field: string,
  ) => Promise<TransactionEntity>;
  onSplit: (id: TransactionEntity['id']) => void;
  onAddSplit: (id: TransactionEntity['id']) => void;
  onCloseAddTransaction: () => void;
  onAdd: (transactions: TransactionEntity[]) => void;
  onCreatePayee: (name: string) => Promise<null | PayeeEntity['id']>;
  style?: CSSProperties;
  onNavigateToTransferAccount: (id: AccountEntity['id']) => void;
  onNavigateToSchedule: (id: ScheduleEntity['id']) => void;
  onNotesTagClick: (tag: string) => void;
  sortField: string;
  ascDesc: 'asc' | 'desc';
  onCreateRule: (ids: RuleEntity['id'][]) => void;
  onScheduleAction: (
    name: 'skip' | 'post-transaction' | 'post-transaction-today' | 'complete',
    ids: TransactionEntity['id'][],
  ) => void;
  onMakeAsNonSplitTransactions: (ids: TransactionEntity['id'][]) => void;
  showSelection: boolean;
  allowSplitTransaction?: boolean;

  onDelete: (id: TransactionEntity['id']) => void;
  onBatchDelete: (ids: TransactionEntity['id'][]) => void;
  onBatchDuplicate: (ids: TransactionEntity['id'][]) => void;
  onBatchLinkSchedule: (ids: TransactionEntity['id'][]) => void;
  onBatchUnlinkSchedule: (ids: TransactionEntity['id'][]) => void;
  onCheckNewEnter: (e: KeyboardEvent) => void;
  onCheckEnter: (e: KeyboardEvent) => void;
  onAddTemporary: (id?: TransactionEntity['id']) => void;
  onAddAndCloseTemporary: () => void;
  onDistributeRemainder: (id: TransactionEntity['id']) => void;
  onToggleSplit: (id: TransactionEntity['id']) => void;
  onManagePayees: (id?: PayeeEntity['id']) => void;

  onSort: (field: string, ascDesc: 'asc' | 'desc') => void;
  showHiddenCategories?: boolean;
};

function TransactionTableInner({
  tableNavigator,
  tableRef,
  listContainerRef,
  dateFormat = 'MM/dd/yyyy',
  newNavigator,
  renderEmpty,
  showHiddenCategories,
  ...props
}: TransactionTableInnerProps) {
  const containerRef = createRef<HTMLDivElement>();
  const isAddingPrev = usePrevious(props.isAdding);
  const [scrollWidth, setScrollWidth] = useState(0);

  function saveScrollWidth(parent: number, child: number) {
    const width = parent > 0 && child > 0 && parent - child;

    setScrollWidth(!width ? 0 : width);
  }

  const {
    onCloseAddTransaction: onCloseAddTransactionProp,
    onNavigateToTransferAccount: onNavigateToTransferAccountProp,
    onNavigateToSchedule: onNavigateToScheduleProp,
    onNotesTagClick: onNotesTagClickProp,
  } = props;

  const onNavigateToTransferAccount = useCallback(
    (accountId: AccountEntity['id']) => {
      onCloseAddTransactionProp();
      onNavigateToTransferAccountProp(accountId);
    },
    [onCloseAddTransactionProp, onNavigateToTransferAccountProp],
  );

  const onNavigateToSchedule = useCallback(
    (scheduleId: ScheduleEntity['id']) => {
      onCloseAddTransactionProp();
      onNavigateToScheduleProp(scheduleId);
    },
    [onCloseAddTransactionProp, onNavigateToScheduleProp],
  );

  const onNotesTagClick = useCallback(
    (noteTag: string) => {
      onCloseAddTransactionProp();
      onNotesTagClickProp(noteTag);
    },
    [onCloseAddTransactionProp, onNotesTagClickProp],
  );

  useEffect(() => {
    if (!isAddingPrev && props.isAdding) {
      newNavigator.onEdit('temp', 'date');
    }
  }, [isAddingPrev, props.isAdding, newNavigator]);

  // Don't render reconciled transactions if we're hiding them.
  const transactionsToRender = useMemo(
    () =>
      props.showReconciled
        ? props.transactions
        : props.transactions.filter(t => !t.reconciled),
    [props.transactions, props.showReconciled],
  );

  const renderRow: TableProps<TransactionEntity>['renderItem'] = ({
    item,
    index,
    editing,
  }) => {
    const {
      transactions,
      selectedItems,
      accounts,
      categoryGroups,
      payees,
      showCleared,
      showAccount,
      showBalances,
      balances,
      hideFraction,
      isNew,
      isMatched,
      isExpanded,
      showSelection,
      allowSplitTransaction,
    } = props;

    const trans = item;
    const selected = selectedItems.has(trans.id);

    const parent = trans.parent_id && props.transactionMap.get(trans.parent_id);
    const isChildDeposit = parent ? parent.amount > 0 : undefined;
    const expanded = isExpanded && isExpanded((parent || trans).id);

    // For backwards compatibility, read the error of the transaction
    // since in previous versions we stored it there. In the future we
    // can simplify this to just the parent
    const error = expanded
      ? (parent && parent.error) || trans.error
      : trans.error;

    const hasSplitError =
      (trans.is_parent || trans.is_child) &&
      (!expanded || isLastChild(transactions, index)) &&
      error &&
      error.type === 'SplitTransactionError';

    const childTransactions = trans.is_parent
      ? props.transactionsByParent[trans.id]
      : null;
    const emptyChildTransactions = props.transactionsByParent[
      (trans.is_parent ? trans.id : trans.parent_id) || ''
    ]?.filter(t => t.amount === 0);

    return (
      <Transaction
        allTransactions={props.transactions}
        editing={editing}
        transaction={trans}
        transferAccountsByTransaction={props.transferAccountsByTransaction}
        subtransactions={childTransactions}
        showAccount={showAccount}
        showBalance={showBalances}
        showCleared={showCleared}
        selected={selected}
        highlighted={false}
        added={isNew?.(trans.id)}
        expanded={isExpanded?.(trans.id)}
        matched={isMatched?.(trans.id)}
        showZeroInDeposit={isChildDeposit}
        balance={balances?.[trans.id] ?? 0}
        focusedField={editing ? tableNavigator.focusedField : undefined}
        accounts={accounts}
        categoryGroups={categoryGroups}
        payees={payees}
        dateFormat={dateFormat}
        hideFraction={hideFraction}
        onEdit={tableNavigator.onEdit}
        onSave={props.onSave}
        onDelete={props.onDelete}
        onBatchDelete={props.onBatchDelete}
        onBatchDuplicate={props.onBatchDuplicate}
        onBatchLinkSchedule={props.onBatchLinkSchedule}
        onBatchUnlinkSchedule={props.onBatchUnlinkSchedule}
        onCreateRule={props.onCreateRule}
        onScheduleAction={props.onScheduleAction}
        onMakeAsNonSplitTransactions={props.onMakeAsNonSplitTransactions}
        onSplit={props.onSplit}
        onManagePayees={props.onManagePayees}
        onCreatePayee={props.onCreatePayee}
        onToggleSplit={props.onToggleSplit}
        onNavigateToTransferAccount={onNavigateToTransferAccount}
        onNavigateToSchedule={onNavigateToSchedule}
        onNotesTagClick={onNotesTagClick}
        splitError={
          hasSplitError && (
            <TransactionError
              error={error}
              isDeposit={!!isChildDeposit}
              onAddSplit={() => props.onAddSplit(trans.id)}
              onDistributeRemainder={() =>
                props.onDistributeRemainder(trans.id)
              }
              canDistributeRemainder={emptyChildTransactions.length > 0}
            />
          )
        }
        listContainerRef={listContainerRef}
        showSelection={showSelection}
        allowSplitTransaction={allowSplitTransaction}
        showHiddenCategories={showHiddenCategories}
      />
    );
  };

  return (
    <View
      innerRef={containerRef}
      style={{
        flex: 1,
        cursor: 'default',
        ...props.style,
      }}
    >
      <View>
        <TransactionHeader
          hasSelected={props.selectedItems.size > 0}
          showAccount={props.showAccount}
          showCategory={props.showCategory}
          showBalance={props.showBalances}
          showCleared={props.showCleared}
          scrollWidth={scrollWidth}
          onSort={props.onSort}
          ascDesc={props.ascDesc}
          field={props.sortField}
          showSelection={props.showSelection}
        />

        {props.isAdding && (
          <View
            {...newNavigator.getNavigatorProps({
              onKeyDown: (e: KeyboardEvent) => props.onCheckNewEnter(e),
            })}
          >
            <NewTransaction
              transactions={props.newTransactions}
              transferAccountsByTransaction={
                props.transferAccountsByTransaction
              }
              editingTransaction={newNavigator.editingId}
              focusedField={newNavigator.focusedField}
              accounts={props.accounts}
              categoryGroups={props.categoryGroups}
              payees={props.payees || []}
              showAccount={props.showAccount}
              showBalance={props.showBalances}
              showCleared={props.showCleared}
              dateFormat={dateFormat}
              hideFraction={props.hideFraction}
              onClose={props.onCloseAddTransaction}
              onAdd={props.onAddTemporary}
              onAddAndClose={props.onAddAndCloseTemporary}
              onAddSplit={props.onAddSplit}
              onToggleSplit={props.onToggleSplit}
              onSplit={props.onSplit}
              onEdit={newNavigator.onEdit}
              onSave={props.onSave}
              onDelete={props.onDelete}
              onManagePayees={props.onManagePayees}
              onCreatePayee={props.onCreatePayee}
              onNavigateToTransferAccount={onNavigateToTransferAccount}
              onNavigateToSchedule={onNavigateToSchedule}
              onNotesTagClick={onNotesTagClick}
              onDistributeRemainder={props.onDistributeRemainder}
              showHiddenCategories={showHiddenCategories}
            />
          </View>
        )}
      </View>
      {/*// * On Windows, makes the scrollbar always appear
         //   the full height of the container ??? */}

      <View
        style={{ flex: 1, overflow: 'hidden' }}
        data-testid="transaction-table"
      >
        <Table
          navigator={tableNavigator}
          ref={tableRef}
          listContainerRef={listContainerRef}
          items={transactionsToRender}
          renderItem={renderRow}
          renderEmpty={renderEmpty}
          loadMore={props.loadMoreTransactions}
          isSelected={id => props.selectedItems.has(id)}
          onKeyDown={e => props.onCheckEnter(e)}
          saveScrollWidth={saveScrollWidth}
        />

        {props.isAdding && (
          <div
            key="shadow"
            style={{
              position: 'absolute',
              top: -20,
              left: 0,
              right: 0,
              height: 20,
              backgroundColor: theme.errorText,
              boxShadow: '0 0 6px rgba(0, 0, 0, .20)',
            }}
          />
        )}
      </View>
    </View>
  );
}

export { TransactionTableInner };
export type { TransactionTableInnerProps };
