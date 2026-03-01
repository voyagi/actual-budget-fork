import React, { memo } from 'react';
import { Trans } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { styles } from '@actual-app/components/styles';
import { theme } from '@actual-app/components/theme';
import { Tooltip } from '@actual-app/components/tooltip';
import { format as formatDate } from 'date-fns';
import type { Locale } from 'date-fns';

import { tsToRelativeTime } from 'loot-core/shared/util';
import type { AccountEntity } from 'loot-core/types/models';

import { Cell, Row } from '@desktop-client/components/table';
import {
  useEnableBankingSyncStatus,
} from '@desktop-client/hooks/useEnableBankingStatus';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type AccountRowProps = {
  account: AccountEntity;
  hovered: boolean;
  onHover: (id: AccountEntity['id'] | null) => void;
  onAction: (account: AccountEntity, action: 'link' | 'edit') => void;
  locale: Locale;
};

function getConsentUrgencyColor(
  validUntil: string | null,
): { text: string; background?: string } | null {
  if (!validUntil) return null;
  const now = new Date();
  const expiry = new Date(validUntil);
  const msUntilExpiry = expiry.getTime() - now.getTime();
  const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);

  if (daysUntilExpiry <= 0) {
    return { text: theme.errorText };
  } else if (daysUntilExpiry <= 7) {
    return { text: theme.warningText };
  } else if (daysUntilExpiry <= 14) {
    return { text: theme.noticeText };
  }
  return null;
}

export const AccountRow = memo(
  ({ account, hovered, onHover, onAction, locale }: AccountRowProps) => {
    const dispatch = useDispatch();
    const backgroundFocus = hovered;

    const lastSyncString = tsToRelativeTime(account.last_sync, locale, {
      capitalize: true,
    });
    const lastSyncDateTime = formatDate(
      new Date(parseInt(account.last_sync ?? '0', 10)),
      'MMM d, yyyy, HH:mm:ss',
      { locale },
    );

    // SYNC-07: Fetch Enable Banking-specific error details for EB accounts.
    // Called unconditionally (React rules of hooks). Passes empty array for
    // non-EB accounts so the hook is a no-op with no network cost.
    const { statuses: ebStatuses } = useEnableBankingSyncStatus(
      account.account_sync_source === 'enableBanking' ? [account.id] : [],
    );
    const ebStatus = ebStatuses?.[account.id];
    const consentUrgencyColor = getConsentUrgencyColor(
      ebStatus?.consent_valid_until ?? null,
    );
    const consentValidUntil = ebStatus?.consent_valid_until
      ? new Date(ebStatus.consent_valid_until).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null;
    const consentIsExpired =
      ebStatus?.consent_valid_until &&
      new Date(ebStatus.consent_valid_until) <= new Date();

    function handleReauth() {
      dispatch(
        pushModal({
          modal: {
            name: 'enablebanking-external-msg',
            options: {
              sessionId: ebStatus?.session_id ?? undefined,
              aspspName: ebStatus?.aspsp_name ?? undefined,
              aspspCountry: ebStatus?.aspsp_country ?? undefined,
              reauth: true,
            },
          },
        }),
      );
    }

    const potentiallyTruncatedAccountName =
      account.name.length > 30
        ? account.name.slice(0, 30) + '...'
        : account.name;

    return (
      <Row
        height="auto"
        style={{
          fontSize: 13,
          backgroundColor: backgroundFocus
            ? theme.tableRowBackgroundHover
            : theme.tableBackground,
        }}
        collapsed
        onMouseEnter={() => onHover && onHover(account.id)}
        onMouseLeave={() => onHover && onHover(null)}
        onFocus={() => onHover && onHover(account.id)}
        onBlur={() => onHover && onHover(null)}
      >
        <Cell
          name="accountName"
          width={250}
          plain
          style={{ color: theme.tableText, padding: '10px' }}
        >
          {potentiallyTruncatedAccountName}
        </Cell>

        <Cell
          name="bankName"
          width="flex"
          plain
          style={{ color: theme.tableText, padding: '10px' }}
        >
          {account.bankName}
        </Cell>

        {account.account_sync_source ? (
          <Tooltip
            placement="bottom start"
            content={
              lastSyncDateTime +
              (ebStatus?.status === 'error' && ebStatus?.error_message
                ? '\nError: ' + ebStatus.error_message
                : '')
            }
            style={{
              ...styles.tooltip,
            }}
          >
            <Cell
              name="lastSync"
              width={200}
              plain
              style={{
                color: theme.tableText,
                padding: '11px',
                textDecoration: 'underline',
                textDecorationStyle: 'dashed',
                textDecorationColor: theme.pageTextSubdued,
                textUnderlineOffset: '4px',
              }}
              data-vrt-mask
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span>{lastSyncString}</span>
                {ebStatus?.status === 'error' && ebStatus?.error_message ? (
                  <span
                    style={{
                      color: theme.errorText,
                      fontSize: 11,
                      fontWeight: 'normal',
                    }}
                  >
                    {ebStatus.error_message}
                  </span>
                ) : null}
                {consentValidUntil && consentUrgencyColor ? (
                  <span
                    style={{
                      color: consentUrgencyColor.text,
                      fontSize: 11,
                      fontWeight: 'normal',
                    }}
                  >
                    {consentIsExpired ? (
                      <Trans>Consent expired</Trans>
                    ) : (
                      <Trans>Consent expires {{ consentValidUntil }}</Trans>
                    )}
                    {' '}
                    <button
                      onClick={handleReauth}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: consentUrgencyColor.text,
                        fontSize: 11,
                        textDecoration: 'underline',
                      }}
                    >
                      <Trans>Re-authorize</Trans>
                    </button>
                  </span>
                ) : null}
              </div>
            </Cell>
          </Tooltip>
        ) : (
          ''
        )}

        {account.account_sync_source ? (
          <Cell name="edit" plain style={{ paddingRight: '10px' }}>
            <Button onPress={() => onAction(account, 'edit')}>
              <Trans>Edit</Trans>
            </Button>
          </Cell>
        ) : (
          <Cell name="link" plain style={{ paddingRight: '10px' }}>
            <Button onPress={() => onAction(account, 'link')}>
              <Trans>Link account</Trans>
            </Button>
          </Cell>
        )}
      </Row>
    );
  },
);

AccountRow.displayName = 'AccountRow';
