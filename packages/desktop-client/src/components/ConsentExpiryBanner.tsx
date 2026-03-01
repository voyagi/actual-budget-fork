import React from 'react';
import { Trans } from 'react-i18next';
import { useNavigate } from 'react-router';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { useConsentExpiry } from '@desktop-client/hooks/useEnableBankingStatus';
import type { ConsentSession } from '@desktop-client/hooks/useEnableBankingStatus';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

function formatExpiryDate(validUntil: string | null): string {
  if (!validUntil) return 'Unknown date';
  const date = new Date(validUntil);
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function isDismissed(sessionId: string): boolean {
  const key = `consent-dismissed-${sessionId}-${new Date().toDateString()}`;
  return localStorage.getItem(key) === 'true';
}

function dismiss(sessionId: string): void {
  const key = `consent-dismissed-${sessionId}-${new Date().toDateString()}`;
  localStorage.setItem(key, 'true');
}

type SessionBannerProps = {
  session: ConsentSession;
  onDismiss: () => void;
};

function SessionBanner({ session, onDismiss }: SessionBannerProps) {
  const dispatch = useDispatch();

  const urgencyColors = {
    expired: {
      text: theme.errorText,
      background: theme.errorBackground,
      border: theme.errorText,
    },
    urgent: {
      text: theme.warningText,
      background: theme.warningBackground,
      border: theme.warningText,
    },
    soon: {
      text: theme.noticeText,
      background: theme.noticeBackground,
      border: theme.noticeText,
    },
    ok: {
      text: theme.pageText,
      background: theme.pageBackground,
      border: theme.pageTextSubdued,
    },
  };

  const colors = urgencyColors[session.urgency];
  const bankName = session.aspspName ?? 'Bank';
  const expiryDate = formatExpiryDate(session.validUntil);

  function handleReauth() {
    dispatch(
      pushModal({
        modal: {
          name: 'enablebanking-external-msg',
          options: {
            sessionId: session.sessionId,
            aspspName: session.aspspName ?? undefined,
            aspspCountry: session.aspspCountry ?? undefined,
            reauth: true,
          },
        },
      }),
    );
  }

  function handleDismiss() {
    dismiss(session.sessionId);
    onDismiss();
  }

  const messageText =
    session.urgency === 'expired' ? (
      <span>
        <strong>{bankName}</strong>{' '}
        <Trans>bank connection expired - re-authorize to resume automatic sync</Trans>
      </span>
    ) : (
      <span>
        <strong>{bankName}</strong>{' '}
        <Trans>bank connection expires</Trans>{' '}
        <strong>{expiryDate}</strong>
      </span>
    );

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderLeft: `4px solid ${colors.border}`,
        color: colors.text,
        padding: '10px 14px',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
      }}
    >
      <View style={{ flex: 1 }}>{messageText}</View>

      <Button
        variant="bare"
        onPress={handleReauth}
        style={{
          color: colors.text,
          border: `1px solid ${colors.border}`,
          padding: '4px 10px',
          fontSize: 12,
          whiteSpace: 'nowrap',
        }}
      >
        <Trans>Re-authorize</Trans>
      </Button>

      <Button
        variant="bare"
        onPress={handleDismiss}
        style={{
          color: colors.text,
          fontSize: 16,
          padding: '0 4px',
          lineHeight: 1,
        }}
        aria-label="Dismiss"
      >
        &times;
      </Button>
    </View>
  );
}

type MultiSessionBannerProps = {
  sessions: ConsentSession[];
  onDismiss: () => void;
};

function MultiSessionBanner({ sessions, onDismiss }: MultiSessionBannerProps) {
  const navigate = useNavigate();

  // Use the worst urgency for banner color
  const worstUrgency = sessions[0].urgency;

  const urgencyColors = {
    expired: {
      text: theme.errorText,
      background: theme.errorBackground,
      border: theme.errorText,
    },
    urgent: {
      text: theme.warningText,
      background: theme.warningBackground,
      border: theme.warningText,
    },
    soon: {
      text: theme.noticeText,
      background: theme.noticeBackground,
      border: theme.noticeText,
    },
    ok: {
      text: theme.pageText,
      background: theme.pageBackground,
      border: theme.pageTextSubdued,
    },
  };

  const colors = urgencyColors[worstUrgency];
  const count = sessions.length;

  const expiredCount = sessions.filter(s => s.urgency === 'expired').length;
  const messageText =
    expiredCount > 0 ? (
      <span>
        <strong>{count} <Trans>bank connections</Trans></strong>{' '}
        <Trans>need re-authorization</Trans>
        {' '}({expiredCount} <Trans>expired</Trans>)
      </span>
    ) : (
      <span>
        <strong>{count} <Trans>bank connections</Trans></strong>{' '}
        <Trans>are expiring soon</Trans>
      </span>
    );

  function handleDismissAll() {
    for (const session of sessions) {
      dismiss(session.sessionId);
    }
    onDismiss();
  }

  return (
    <View
      style={{
        backgroundColor: colors.background,
        borderLeft: `4px solid ${colors.border}`,
        color: colors.text,
        padding: '10px 14px',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        fontSize: 13,
      }}
    >
      <View style={{ flex: 1 }}>{messageText}</View>

      <Button
        variant="bare"
        onPress={() => navigate('/bank-sync')}
        style={{
          color: colors.text,
          border: `1px solid ${colors.border}`,
          padding: '4px 10px',
          fontSize: 12,
          whiteSpace: 'nowrap',
        }}
      >
        <Trans>Manage bank sync</Trans>
      </Button>

      <Button
        variant="bare"
        onPress={handleDismissAll}
        style={{
          color: colors.text,
          fontSize: 16,
          padding: '0 4px',
          lineHeight: 1,
        }}
        aria-label="Dismiss all"
      >
        &times;
      </Button>
    </View>
  );
}

/**
 * Graduated consent expiry banner displayed at the top of FinancesApp.
 *
 * Self-contained: fetches its own data via useConsentExpiry().
 * No props needed - just drop it into the JSX.
 *
 * Colors:
 * - red (errorText/errorBackground): expired consent
 * - orange (warningText/warningBackground): within 7 days
 * - yellow (noticeText/noticeBackground): within 14 days
 *
 * Dismissible per day per session via localStorage.
 * Re-appears daily until consent is renewed.
 */
export function ConsentExpiryBanner() {
  const { sessions } = useConsentExpiry();
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  // Filter out dismissed sessions
  const visibleSessions = sessions.filter(s => !isDismissed(s.sessionId));

  if (visibleSessions.length === 0) {
    return null;
  }

  if (visibleSessions.length === 1) {
    return (
      <SessionBanner session={visibleSessions[0]} onDismiss={forceUpdate} />
    );
  }

  return (
    <MultiSessionBanner sessions={visibleSessions} onDismiss={forceUpdate} />
  );
}
