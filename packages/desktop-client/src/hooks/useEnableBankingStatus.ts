import { useEffect, useRef, useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import { send } from 'loot-core/platform/client/connection';

import { useNavigate } from './useNavigate';
import { useSyncServerStatus } from './useSyncServerStatus';

import { accountQueries } from '@desktop-client/accounts';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import {
  addNotification,
  removeNotification,
} from '@desktop-client/notifications/notificationsSlice';
import { useDispatch, useSelector } from '@desktop-client/redux';
import {
  getUrgencyLevel,
  type ConsentUrgency,
} from '@desktop-client/utils/consent-urgency';

export type { ConsentUrgency } from '@desktop-client/utils/consent-urgency';

/**
 * Checks whether Enable Banking is configured on the sync-server
 * (JWT key present and valid).
 *
 * Returns:
 * - configured: true when the server has a working Enable Banking key
 * - isLoading: true while the status check is in flight
 */
export function useEnableBankingStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const status = useSyncServerStatus();

  useEffect(() => {
    async function fetch() {
      setIsLoading(true);

      const results = await send('enablebanking-status');

      setConfigured(results?.configured || false);
      setIsLoading(false);
    }

    if (status === 'online') {
      fetch();
    }
  }, [status]);

  return {
    configured,
    isLoading,
  };
}

type SyncStatusEntry = {
  synced_at: string | null; // ISO string (server converts from epoch integer)
  status: string;
  error_message: string | null;
  transactions_added: number | null; // from eb_sync_log
  transactions_updated: number | null; // from eb_sync_log
  error_code: string | null; // from eb_sync_log
  consent_valid_until: string | null; // NEW - ISO date from eb_sessions.valid_until
  session_id: string | null; // NEW - for re-auth grouping
  aspsp_name: string | null; // NEW - for banner display (e.g. "ING Bank connection expires March 15")
  aspsp_country: string | null; // NEW - for re-auth createAuth country param
};

/**
 * Fetches per-account Enable Banking sync status from the sync-server.
 * Accepts an array of Actual account UUIDs (the standard `account.id` field).
 *
 * CRITICAL DEPENDENCY: This hook works correctly because
 * `eb_account_map.actual_account_id` is populated at link time by the
 * `enablebanking-accounts-link` IPC handler (Plan 02-03 Task 2), which
 * calls POST /update-account-map to store the Actual UUID in the map.
 * The /transactions route then uses `mapRow.actual_account_id` from that
 * map when writing to `eb_sync_log`. Without this link-time population,
 * the `actual_account_id` column would be NULL and queries here would
 * return no results.
 *
 * Returns:
 * - statuses: Record<string, SyncStatusEntry> keyed by Actual account UUID
 * - isLoading: true while the fetch is in flight
 */
export function useEnableBankingSyncStatus(accountIds: string[]) {
  const [statuses, setStatuses] = useState<Record<string, SyncStatusEntry>>({});
  const [isLoading, setIsLoading] = useState(false);

  // Stable key to avoid re-fetching on every render when the array
  // reference changes but contents are the same
  const accountIdsKey = accountIds.join(',');

  useEffect(() => {
    if (accountIds.length === 0) {
      setStatuses({});
      return;
    }

    async function fetch() {
      setIsLoading(true);

      const result = await send('enablebanking-sync-status', { accountIds });

      if (result && result.statuses) {
        setStatuses(result.statuses);
      } else {
        setStatuses({});
      }

      setIsLoading(false);
    }

    fetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountIdsKey]);

  return {
    statuses,
    isLoading,
  };
}

export type ConsentSession = {
  sessionId: string;
  aspspName: string | null;
  aspspCountry: string | null;
  validUntil: string | null;
  urgency: ConsentUrgency;
  accountIds: string[];
};

/**
 * Self-contained hook that:
 * - Fetches all accounts via accountQueries.list()
 * - Filters to Enable Banking-linked accounts
 * - Groups by session_id with urgency calculation
 * - Returns sessions sorted by urgency (expired first)
 *
 * Urgency thresholds:
 * - expired: consent_valid_until is in the past
 * - urgent: within 7 days
 * - soon: within 14 days
 * - ok: more than 14 days away (not returned in sessions array)
 */
export function useConsentExpiry(): {
  sessions: ConsentSession[];
  worstUrgency: ConsentUrgency;
} {
  const { data: accounts } = useQuery(accountQueries.list());

  const ebAccountIds = (accounts ?? [])
    .filter(a => a.account_sync_source === 'enableBanking')
    .map(a => a.id);

  const { statuses } = useEnableBankingSyncStatus(ebAccountIds);

  // Group accounts by session_id
  const sessionMap = new Map<string, ConsentSession>();

  for (const accountId of ebAccountIds) {
    const entry = statuses[accountId];
    if (!entry || !entry.session_id) continue;

    const sessionId = entry.session_id;

    if (!sessionMap.has(sessionId)) {
      const validUntil = entry.consent_valid_until;
      let urgency: ConsentUrgency = 'ok';

      if (validUntil) {
        const now = new Date();
        const expiry = new Date(validUntil);
        const msUntilExpiry = expiry.getTime() - now.getTime();
        const daysUntilExpiry = msUntilExpiry / (1000 * 60 * 60 * 24);
        urgency = getUrgencyLevel(daysUntilExpiry);
      }

      sessionMap.set(sessionId, {
        sessionId,
        aspspName: entry.aspsp_name,
        aspspCountry: entry.aspsp_country,
        validUntil: entry.consent_valid_until,
        urgency,
        accountIds: [],
      });
    }

    sessionMap.get(sessionId)!.accountIds.push(accountId);
  }

  // Only surface sessions that need attention (not 'ok')
  const urgencyOrder: Record<ConsentUrgency, number> = {
    expired: 0,
    urgent: 1,
    soon: 2,
    ok: 3,
  };

  const sessions = Array.from(sessionMap.values())
    .filter(s => s.urgency !== 'ok')
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

  const worstUrgency: ConsentUrgency =
    sessions.length > 0 ? sessions[0].urgency : 'ok';

  return { sessions, worstUrgency };
}

// ---------------------------------------------------------------------------
// Helper functions (moved from ConsentExpiryBanner.tsx)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// useConsentExpiryNotifications
// ---------------------------------------------------------------------------

/**
 * Side-effect hook that routes consent expiry warnings through the Redux
 * Notifications system as sticky warnings. Call from FinancesApp.
 *
 * Replaces the ConsentExpiryBanner standalone component:
 * - Single session  → per-session notification with Re-authorize button
 * - Multiple sessions → aggregated notification with Manage bank sync button
 * - Daily-dismiss via localStorage preserved (isDismissed / dismiss helpers)
 * - Two-pass localStorage cleanup on each sessions change
 */
export function useConsentExpiryNotifications(): void {
  const { sessions } = useConsentExpiry();
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Stable deps: re-run only when session count or IDs change, not on
  // referential array identity changes.
  const sessionCount = sessions.length;
  const sessionIdsKey = sessions.map(s => s.sessionId).join(',');

  useEffect(() => {
    // Two-pass localStorage cleanup: collect stale keys first, then delete.
    // Deleting during index iteration corrupts i and skips keys.
    const today = new Date().toDateString();
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('consent-dismissed-') && !key.endsWith(today)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      localStorage.removeItem(key);
    }

    if (sessionCount === 0) return;

    const visibleSessions = sessions.filter(s => !isDismissed(s.sessionId));

    if (visibleSessions.length === 0) return;

    if (visibleSessions.length === 1) {
      const session = visibleSessions[0];
      const bankName = session.aspspName ?? 'Bank';
      const isExpired = session.urgency === 'expired';

      dispatch(
        addNotification({
          notification: {
            id: `consent-expiry-${session.sessionId}`,
            type: 'warning',
            sticky: true,
            title: isExpired
              ? 'Bank connection expired'
              : 'Bank connection expiring',
            message: isExpired
              ? `${bankName} bank connection expired - re-authorize to resume automatic sync`
              : `${bankName} bank connection expires ${formatExpiryDate(session.validUntil)}`,
            button: {
              title: 'Re-authorize',
              action: () => {
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
              },
            },
            onClose: () => {
              dismiss(session.sessionId);
            },
          },
        }),
      );
    } else {
      // Multiple sessions: single aggregated notification
      const expiredCount = visibleSessions.filter(
        s => s.urgency === 'expired',
      ).length;
      const baseMessage = `${visibleSessions.length} bank connections need re-authorization`;
      const message =
        expiredCount > 0
          ? `${baseMessage} (${expiredCount} expired)`
          : baseMessage;

      dispatch(
        addNotification({
          notification: {
            id: 'consent-expiry-multi',
            type: 'warning',
            sticky: true,
            title: 'Bank connections expiring',
            message,
            button: {
              title: 'Manage bank sync',
              action: () => {
                navigate('/bank-sync');
              },
            },
            onClose: () => {
              for (const s of visibleSessions) {
                dismiss(s.sessionId);
              }
            },
          },
        }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionCount, sessionIdsKey]);
}

// ---------------------------------------------------------------------------
// useOperationalAlerts
// ---------------------------------------------------------------------------

type ServerAlert = {
  id: string;
  event_type: string;
  message: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'error';
};

/**
 * Side-effect hook that polls the sync-server for operational alerts
 * (sync failures, consent expiry warnings, auth failure bursts) and
 * surfaces them as in-app notifications via the Redux Notifications system.
 *
 * Polls every 60 seconds. Acknowledges alerts on the server when the
 * user dismisses the notification (onClose callback).
 *
 * Per user decision obs-2: "Extend the existing in-app Notifications
 * system (from Phase 6 migration) for user-visible alerts."
 */
export function useOperationalAlerts(): void {
  const dispatch = useDispatch();
  const status = useSyncServerStatus();
  const knownAlertIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (status !== 'online') return;

    let active = true;

    async function poll() {
      try {
        const result = await send('operational-alerts');
        if (!active || !result?.alerts) return;

        const alerts: ServerAlert[] = result.alerts;

        for (const alert of alerts) {
          if (knownAlertIds.current.has(alert.id)) continue;
          knownAlertIds.current.add(alert.id);

          const notificationType: 'error' | 'warning' | 'message' =
            alert.severity === 'error'
              ? 'error'
              : alert.severity === 'warning'
                ? 'warning'
                : 'message';

          dispatch(
            addNotification({
              notification: {
                id: `op-alert-${alert.id}`,
                type: notificationType,
                sticky: true,
                title: formatAlertTitle(alert.event_type),
                message: alert.message,
                onClose: () => {
                  // Acknowledge on server so it doesn't re-appear
                  send('operational-alerts-acknowledge', {
                    alertId: alert.id,
                  }).catch(() => {});
                },
              },
            }),
          );
        }
      } catch {
        // Server unreachable - ignore, will retry next interval
      }
    }

    // Poll immediately, then every 60 seconds
    poll();
    const interval = setInterval(poll, 60_000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [status, dispatch]);
}

function formatAlertTitle(eventType: string): string {
  switch (eventType) {
    case 'sync_failure':
      return 'Sync failed';
    case 'consent_expiry':
      return 'Bank connection expiring';
    case 'auth_failure_burst':
      return 'Repeated login failures';
    default:
      return 'Operational alert';
  }
}

// ---------------------------------------------------------------------------
// useBankSyncNotification
// ---------------------------------------------------------------------------

/**
 * Side-effect hook that routes bank-sync-in-progress status through the Redux
 * Notifications system. Dispatches a sticky message while accounts are syncing
 * and removes it when sync completes. Call from FinancesApp.
 *
 * Replaces the BankSyncStatus standalone component.
 */
export function useBankSyncNotification(): void {
  const accountsSyncing = useSelector(
    (state: { account: { accountsSyncing: string[] } }) =>
      state.account.accountsSyncing,
  );
  const dispatch = useDispatch();
  // Track whether a sync notification is currently active to avoid orphaning
  // the notification if the component re-renders between sync start and end.
  const wasActive = useRef<boolean>(false);

  useEffect(() => {
    if (accountsSyncing.length > 0) {
      dispatch(
        addNotification({
          notification: {
            id: 'bank-sync-in-progress',
            type: 'message',
            sticky: true,
            message: `Syncing... ${accountsSyncing.length} accounts remaining`,
          },
        }),
      );
      wasActive.current = true;
    } else if (wasActive.current === true) {
      dispatch(removeNotification({ id: 'bank-sync-in-progress' }));
      wasActive.current = false;
    }
  }, [accountsSyncing.length, dispatch]);
}
