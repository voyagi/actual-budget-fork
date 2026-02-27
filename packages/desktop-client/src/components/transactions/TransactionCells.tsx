import { createElement, useRef } from 'react';
import type { CSSProperties } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import {
  SvgLeftArrow2,
  SvgRightArrow2,
  SvgSplit,
} from '@actual-app/components/icons/v0';
import {
  SvgArrowsSynchronize,
  SvgCalendar3,
} from '@actual-app/components/icons/v2';
import { Popover } from '@actual-app/components/popover';
import { styles } from '@actual-app/components/styles';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { View } from '@actual-app/components/view';

import { isTemporaryId } from 'loot-core/shared/transactions';
import type {
  AccountEntity,
  PayeeEntity,
  ScheduleEntity,
  TransactionEntity,
} from 'loot-core/types/models';

import type {
  SerializedTransaction,
  TransactionEditFunction,
  TransactionUpdateFunction,
} from './table/utils';

import { PayeeAutocomplete } from '@desktop-client/components/autocomplete/PayeeAutocomplete';
import { getStatusProps } from '@desktop-client/components/schedules/StatusBadge';
import type { StatusTypes } from '@desktop-client/components/schedules/StatusBadge';
import {
  Cell,
  CellButton,
  CustomCell,
  UnexposedCellContent,
} from '@desktop-client/components/table';
import { useCachedSchedules } from '@desktop-client/hooks/useCachedSchedules';
import { useDisplayPayee } from '@desktop-client/hooks/useDisplayPayee';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type StatusCellProps = {
  id: TransactionEntity['id'];
  status?: StatusTypes | null;
  focused?: boolean;
  selected?: boolean;
  isChild?: boolean;
  isPreview?: boolean;
  onEdit: TransactionEditFunction;
  onUpdate: TransactionUpdateFunction;
};

function StatusCell({
  id,
  focused,
  selected,
  status,
  isChild,
  isPreview,
  onEdit,
  onUpdate,
}: StatusCellProps) {
  const { t } = useTranslation();
  const isClearedField =
    status === 'cleared' || status === 'reconciled' || status == null;
  const statusProps = getStatusProps(status);

  const statusColor =
    status === 'cleared'
      ? theme.noticeTextLight
      : status === 'reconciled'
        ? theme.noticeTextLight
        : status === 'missed'
          ? theme.errorText
          : status === 'due'
            ? theme.warningText
            : selected
              ? theme.pageTextLinkLight
              : theme.pageTextSubdued;

  function onSelect() {
    if (isClearedField) {
      onUpdate('cleared', !(status === 'cleared'));
    }
  }

  return (
    <Cell
      name="cleared"
      width={38}
      alignItems="center"
      focused={focused}
      style={{ padding: 1 }}
      plain
    >
      <CellButton
        aria-label={status ?? t('uncleared')}
        style={{
          padding: 3,
          backgroundColor: 'transparent',
          border: '1px solid transparent',
          borderRadius: 50,
          ':focus': {
            ...(isPreview
              ? {
                  boxShadow: 'none',
                }
              : {
                  border: '1px solid ' + theme.formInputBorderSelected,
                  boxShadow: '0 1px 2px ' + theme.formInputBorderSelected,
                }),
          },
          cursor: isClearedField ? 'pointer' : 'default',
          ...(isChild && { visibility: 'hidden' }),
        }}
        disabled={isPreview || isChild}
        onEdit={() => onEdit(id, 'cleared')}
        onSelect={onSelect}
      >
        {createElement(statusProps.Icon, {
          style: {
            width: 13,
            height: 13,
            color: statusColor,
            marginTop: status === 'due' ? -1 : 0,
          },
        })}
      </CellButton>
    </Cell>
  );
}

const payeeIconButtonStyle = {
  marginLeft: -5,
  marginRight: 2,
  width: 23,
  height: 23,
  color: 'inherit',
};
const scheduleIconStyle = { width: 13, height: 13 };
const transferIconStyle = { width: 10, height: 10 };

type PayeeIconsProps = {
  transaction: SerializedTransaction;
  transferAccount: AccountEntity | null;
  onNavigateToTransferAccount: (id: AccountEntity['id']) => void;
  onNavigateToSchedule: (id: ScheduleEntity['id']) => void;
};

function PayeeIcons({
  transaction,
  transferAccount,
  onNavigateToTransferAccount,
  onNavigateToSchedule,
}: PayeeIconsProps) {
  const { t } = useTranslation();

  const scheduleId = transaction.schedule;
  const { isLoading, schedules = [] } = useCachedSchedules();

  if (isLoading) {
    return null;
  }

  const schedule = scheduleId ? schedules.find(s => s.id === scheduleId) : null;

  if (schedule == null && transferAccount == null) {
    // Neither a valid scheduled transaction nor a transfer.
    return null;
  }

  const recurring =
    schedule &&
    schedule._date &&
    typeof schedule._date === 'object' &&
    !!schedule._date.frequency;
  const isDeposit = transaction.amount > 0;

  return (
    <>
      {schedule && (
        <Button
          variant="bare"
          data-testid="schedule-icon"
          aria-label={t('See schedule details')}
          style={payeeIconButtonStyle}
          onPress={() => {
            if (scheduleId) {
              onNavigateToSchedule(scheduleId);
            }
          }}
        >
          {recurring ? (
            <SvgArrowsSynchronize style={scheduleIconStyle} />
          ) : (
            <SvgCalendar3 style={scheduleIconStyle} />
          )}
        </Button>
      )}
      {transferAccount && (
        <Button
          variant="bare"
          data-testid="transfer-icon"
          aria-label={t('See transfer account')}
          style={payeeIconButtonStyle}
          onPress={() => {
            if (!isTemporaryId(transaction.id)) {
              onNavigateToTransferAccount(transferAccount.id);
            }
          }}
        >
          {isDeposit ? (
            <SvgLeftArrow2 style={transferIconStyle} />
          ) : (
            <SvgRightArrow2 style={transferIconStyle} />
          )}
        </Button>
      )}
    </>
  );
}

type PayeeCellProps = {
  id: TransactionEntity['id'];
  payee?: PayeeEntity;
  focused: boolean;
  payees: PayeeEntity[];
  accounts: AccountEntity[];
  transferAccountsByTransaction: {
    [id: TransactionEntity['id']]: AccountEntity | null;
  };
  valueStyle: CSSProperties | null;
  transaction: SerializedTransaction;
  importedPayee?: PayeeEntity['id'];
  isPreview: boolean;
  onEdit: TransactionEditFunction;
  onUpdate: TransactionUpdateFunction;
  onCreatePayee: (name: string) => Promise<null | PayeeEntity['id']>;
  onManagePayees: (id: PayeeEntity['id'] | undefined) => void;
  onNavigateToTransferAccount: (id: AccountEntity['id']) => void;
  onNavigateToSchedule: (id: ScheduleEntity['id']) => void;
};

function PayeeCell({
  id,
  payee,
  focused,
  payees,
  accounts,
  transferAccountsByTransaction,
  valueStyle,
  transaction,
  importedPayee,
  isPreview,
  onEdit,
  onUpdate,
  onCreatePayee,
  onManagePayees,
  onNavigateToTransferAccount,
  onNavigateToSchedule,
}: PayeeCellProps) {
  const isCreatingPayee = useRef(false);
  const { t } = useTranslation();

  const dispatch = useDispatch();

  const transferAccount = transferAccountsByTransaction[transaction.id];

  const displayPayee = useDisplayPayee({ transaction });

  return transaction.is_parent ? (
    <Cell
      name="payee"
      width="flex"
      focused={focused}
      style={{ padding: 0 }}
      plain
    >
      <CellButton
        bare
        style={{
          alignSelf: 'stretch',
          borderRadius: 4,
          border: '1px solid transparent', // so it doesn't shift on hover
          ':hover': isPreview
            ? {}
            : {
                border: '1px solid ' + theme.buttonNormalBorder,
              },
        }}
        disabled={isPreview}
        onSelect={() =>
          dispatch(
            pushModal({
              modal: {
                name: 'payee-autocomplete',
                options: {
                  onSelect: (payeeId: PayeeEntity['id']) => {
                    onUpdate('payee', payeeId);
                  },
                },
              },
            }),
          )
        }
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'stretch',
            borderRadius: 4,
            flex: 1,
            padding: 4,
            color: theme.pageTextSubdued,
          }}
        >
          <PayeeIcons
            transaction={transaction}
            transferAccount={transferAccount}
            onNavigateToTransferAccount={onNavigateToTransferAccount}
            onNavigateToSchedule={onNavigateToSchedule}
          />
          <SvgSplit
            style={{
              color: 'inherit',
              width: 14,
              height: 14,
              marginRight: 5,
              flexShrink: 0,
            }}
          />
          <Text
            style={{
              fontStyle: 'italic',
              fontWeight: 300,
              userSelect: 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
              borderBottom: importedPayee
                ? `1px dashed ${theme.pageTextSubdued}`
                : 'none',
            }}
          >
            {importedPayee ? (
              <Tooltip
                content={
                  <View style={{ padding: 10 }}>
                    <Text style={{ fontWeight: 'bold' }}>
                      <Trans>Imported Payee</Trans>
                    </Text>
                    <Text style={{ fontWeight: 'normal' }}>
                      {importedPayee}
                    </Text>
                  </View>
                }
                style={{ ...styles.tooltip, borderRadius: '0px 5px 5px 0px' }}
                placement="bottom"
                triggerProps={{ delay: 750 }}
              >
                {displayPayee}
              </Tooltip>
            ) : (
              displayPayee
            )}
          </Text>
        </View>
      </CellButton>
    </Cell>
  ) : (
    <CustomCell
      width="flex"
      name="payee"
      textAlign="flex"
      value={payee?.id}
      valueStyle={valueStyle}
      exposed={focused}
      onExpose={name => !isPreview && onEdit(id, name)}
      onUpdate={async value => {
        onUpdate('payee', value);

        if (value && value.startsWith('new:') && !isCreatingPayee.current) {
          isCreatingPayee.current = true;
          const id = await onCreatePayee(value.slice('new:'.length));
          onUpdate('payee', id ?? undefined);
          isCreatingPayee.current = false;
        }
      }}
      formatter={() => {
        if (!displayPayee && isPreview) {
          return t('(No payee)');
        }
        return displayPayee;
      }}
      unexposedContent={props => {
        const payeeName = (
          <UnexposedCellContent
            {...props}
            style={
              importedPayee
                ? { borderBottom: `1px dashed ${theme.pageTextSubdued}` }
                : {}
            }
          />
        );

        return (
          <>
            <PayeeIcons
              transaction={transaction}
              transferAccount={transferAccount}
              onNavigateToTransferAccount={onNavigateToTransferAccount}
              onNavigateToSchedule={onNavigateToSchedule}
            />
            <div
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {importedPayee ? (
                <Tooltip
                  content={
                    <View style={{ padding: 10 }}>
                      <Text style={{ fontWeight: 'bold' }}>
                        <Trans>Imported Payee</Trans>
                      </Text>
                      <Text style={{ fontWeight: 'normal' }}>
                        {importedPayee}
                      </Text>
                    </View>
                  }
                  style={{ ...styles.tooltip, borderRadius: '0px 5px 5px 0px' }}
                  placement="bottom"
                  triggerProps={{ delay: 750 }}
                >
                  {payeeName}
                </Tooltip>
              ) : (
                payeeName
              )}
            </div>
          </>
        );
      }}
    >
      {({
        onBlur,
        onKeyDown,
        onUpdate,
        onSave,
        shouldSaveFromKey,
        inputStyle,
      }) => (
        <PayeeAutocomplete
          payees={payees}
          accounts={accounts}
          value={payee?.id ?? null}
          shouldSaveFromKey={shouldSaveFromKey}
          inputProps={{
            onBlur,
            onKeyDown,
            style: inputStyle,
          }}
          showManagePayees
          clearOnBlur={false}
          focused
          onUpdate={(_, value) => onUpdate?.(value)}
          onSelect={onSave}
          onManagePayees={() => onManagePayees(payee?.id)}
        />
      )}
    </CustomCell>
  );
}

export { StatusCell, PayeeCell, PayeeIcons };
export type { StatusCellProps, PayeeCellProps, PayeeIconsProps };
