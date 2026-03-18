import React, { useEffect, useEffectEvent, useRef } from 'react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes, useHref, useLocation } from 'react-router';

import { useResponsive } from '@actual-app/components/hooks/useResponsive';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';
import { css } from '@emotion/css';
import { useQuery } from '@tanstack/react-query';

import { send } from 'loot-core/platform/client/connection';
import * as undo from 'loot-core/platform/client/undo';

import { UserAccessPage } from './admin/UserAccess/UserAccessPage';
import { CommandBar } from './CommandBar';
import { GlobalKeys } from './GlobalKeys';
import { MobileBankSyncAccountEditPage } from './mobile/banksync/MobileBankSyncAccountEditPage';
import { MobileNavTabs } from './mobile/MobileNavTabs';
import { TransactionEdit } from './mobile/transactions/TransactionEdit';
import { Notifications } from './Notifications';
import { Reports } from './reports';
import { LoadingIndicator } from './reports/LoadingIndicator';
import { NarrowAlternate, WideComponent } from './responsive';
import { UserDirectoryPage } from './responsive/wide';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { useMultiuserEnabled } from './ServerContext';
import { Settings } from './settings';
import { FloatableSidebar } from './sidebar';
import { ManageTagsPage } from './tags/ManageTagsPage';
import { Titlebar } from './Titlebar';

import { accountQueries } from '@desktop-client/accounts';
import { getLatestAppVersion, sync } from '@desktop-client/app/appSlice';
import { ProtectedRoute } from '@desktop-client/auth/ProtectedRoute';
import { Permissions } from '@desktop-client/auth/types';
import { useGlobalPref } from '@desktop-client/hooks/useGlobalPref';
import { useLocalPref } from '@desktop-client/hooks/useLocalPref';
import { useMetaThemeColor } from '@desktop-client/hooks/useMetaThemeColor';
import { useNavigate } from '@desktop-client/hooks/useNavigate';
import {
  useConsentExpiryNotifications,
  useBankSyncNotification,
} from '@desktop-client/hooks/useEnableBankingStatus';
import { ScrollProvider } from '@desktop-client/hooks/useScrollListener';
import { addNotification } from '@desktop-client/notifications/notificationsSlice';
import { useDispatch, useSelector } from '@desktop-client/redux';

function NarrowNotSupported({
  redirectTo = '/budget',
  children,
}: {
  redirectTo?: string;
  children: ReactElement;
}) {
  const { isNarrowWidth } = useResponsive();
  const navigate = useNavigate();
  useEffect(() => {
    if (isNarrowWidth) {
      navigate(redirectTo);
    }
  }, [isNarrowWidth, navigate, redirectTo]);
  return isNarrowWidth ? null : children;
}

function WideNotSupported({
  children,
  redirectTo = '/budget',
}: {
  redirectTo?: string;
  children: ReactElement;
}) {
  const { isNarrowWidth } = useResponsive();
  const navigate = useNavigate();
  useEffect(() => {
    if (!isNarrowWidth) {
      navigate(redirectTo);
    }
  }, [isNarrowWidth, navigate, redirectTo]);
  return isNarrowWidth ? children : null;
}

function RouterBehaviors() {
  const location = useLocation();
  const href = useHref(location);
  useEffect(() => {
    undo.setUndoState('url', href);
  }, [href]);

  return null;
}

export function FinancesApp() {
  const { isNarrowWidth } = useResponsive();
  useMetaThemeColor(isNarrowWidth ? theme.mobileViewTheme : undefined);

  const dispatch = useDispatch();
  const { t } = useTranslation();

  // TODO: Replace with `useAccounts` hook once it's updated to return the useQuery results.
  const { data: accounts, isFetching: isAccountsFetching } = useQuery(
    accountQueries.list(),
  );

  const versionInfo = useSelector(state => state.app.versionInfo);
  const [notifyWhenUpdateIsAvailable] = useGlobalPref(
    'notifyWhenUpdateIsAvailable',
  );
  const [lastUsedVersion, setLastUsedVersion] = useLocalPref(
    'flags.updateNotificationShownForVersion',
  );
  const [staleThresholdHours] = useLocalPref('bankSyncStaleThresholdHours');

  const multiuserEnabled = useMultiuserEnabled();

  // Mutex for background bank sync triggered by visibility/focus changes.
  // useRef persists across re-renders and effect re-creations (the effect
  // depends on staleThresholdHours, so a closure-scoped let would reset to
  // false whenever the pref changes, allowing concurrent syncs).
  const isSyncingRef = useRef(false);

  const init = useEffectEvent(() => {
    // Wait a little bit to make sure the sync button will get the
    // sync start event. This can be improved later.
    setTimeout(async () => {
      await dispatch(sync());

      // After CRDT sync completes, trigger background bank sync for accounts
      // whose last sync is older than the configurable stale threshold.
      // CRDT sync must finish first to avoid SQLite race conditions.
      try {
        const allAccounts = await send('accounts-get');
        const linkedAccounts = (allAccounts || []).filter(
          a => a.account_sync_source && a.account_id,
        );
        const effectiveThreshold = (staleThresholdHours ?? 6) * 60 * 60 * 1000;
        const now = Date.now();

        // Fetch consent status in one call to filter out expired-consent
        // accounts before syncing (avoids wasted Enable Banking API calls).
        const linkedIds = linkedAccounts.map(a => a.id);
        // CRITICAL: send() returns { statuses } directly. post() already
        // unwraps responseData.data, so there is NO extra .data layer.
        const syncStatuses =
          linkedIds.length > 0
            ? ((
                await send('enablebanking-sync-status', {
                  accountIds: linkedIds,
                })
              )?.statuses ?? {})
            : {};

        const staleIds = linkedAccounts
          .filter(a => {
            const ebStatus = syncStatuses[a.id];
            // Skip EB accounts with expired consent
            if (
              ebStatus?.consent_valid_until &&
              new Date(ebStatus.consent_valid_until) <= new Date()
            ) {
              return false;
            }
            const lastSync = a.last_sync ? parseInt(a.last_sync, 10) : 0;
            return now - lastSync > effectiveThreshold;
          })
          .map(a => a.id);

        if (staleIds.length > 0) {
          send('accounts-bank-sync', { ids: staleIds }).catch(() => {
            dispatch(
              addNotification({
                notification: {
                  id: 'sync-on-open-failed',
                  type: 'warning',
                  message: t('Background sync failed - check your connection'),
                },
              }),
            );
          });
        }
      } catch {
        // Non-blocking: don't surface errors from the sync-on-open check
      }
    }, 100);

    async function run() {
      await global.Actual.waitForUpdateReadyForDownload(); // This will only resolve when an update is ready
      dispatch(
        addNotification({
          notification: {
            type: 'message',
            title: t('A new version of Actual is available!'),
            message: t(
              'Click the button below to reload and apply the update.',
            ),
            sticky: true,
            id: 'update-reload-notification',
            button: {
              title: t('Update now'),
              action: async () => {
                await global.Actual.applyAppUpdate();
              },
            },
          },
        }),
      );
    }

    run();
  });

  useEffect(() => init(), []);

  // Bank sync check on visibility/focus changes. Lives in FinancesApp (not
  // App.tsx) because useLocalPref requires budget context - App.tsx renders
  // before any budget is loaded, so useLocalPref there produces the wrong
  // localStorage key ('undefined-bankSyncStaleThresholdHours').
  useEffect(() => {
    async function onVisibilityOrFocus() {
      // App.tsx already fires dispatch(sync()) (CRDT sync) on visibilitychange.
      // The two handlers run concurrently - this is acceptable because bank
      // sync reads from the EB API (not local DB) and is idempotent.
      if (document.hidden || isSyncingRef.current) return;
      isSyncingRef.current = true;
      try {
        const allAccounts = await send('accounts-get');
        const linkedAccounts = (allAccounts || []).filter(
          a => a.account_sync_source && a.account_id,
        );
        const effectiveThreshold = (staleThresholdHours ?? 6) * 60 * 60 * 1000;
        const now = Date.now();

        const linkedIds = linkedAccounts.map(a => a.id);
        const syncStatuses =
          linkedIds.length > 0
            ? ((
                await send('enablebanking-sync-status', {
                  accountIds: linkedIds,
                })
              )?.statuses ?? {})
            : {};

        const staleIds = linkedAccounts
          .filter(a => {
            const ebStatus = syncStatuses[a.id];
            if (
              ebStatus?.consent_valid_until &&
              new Date(ebStatus.consent_valid_until) <= new Date()
            ) {
              return false;
            }
            const lastSync = a.last_sync ? parseInt(a.last_sync, 10) : 0;
            return now - lastSync > effectiveThreshold;
          })
          .map(a => a.id);

        if (staleIds.length > 0) {
          send('accounts-bank-sync', { ids: staleIds }).catch(() => {});
        }
      } catch {
        // Non-blocking: don't surface errors from background sync check
      } finally {
        isSyncingRef.current = false;
      }
    }

    window.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);
    return () => {
      window.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [staleThresholdHours]);

  useEffect(() => {
    dispatch(getLatestAppVersion());
  }, [dispatch]);

  useEffect(() => {
    if (notifyWhenUpdateIsAvailable && versionInfo) {
      if (
        versionInfo.isOutdated &&
        lastUsedVersion !== versionInfo.latestVersion
      ) {
        dispatch(
          addNotification({
            notification: {
              type: 'message',
              title: t('A new version of Actual is available!'),
              message:
                (process.env.REACT_APP_IS_PIKAPODS ?? '').toLowerCase() ===
                'true'
                  ? t(
                      'A new version of Actual is available! Your Pikapods instance will be automatically updated in the next few days - no action needed.',
                    )
                  : t(
                      'Version {{latestVersion}} of Actual was recently released.',
                      { latestVersion: versionInfo.latestVersion },
                    ),
              sticky: true,
              id: 'update-notification',
              button: {
                title: t('Open changelog'),
                action: () => {
                  window.open('https://actualbudget.org/docs/releases');
                },
              },
              onClose: () => {
                setLastUsedVersion(versionInfo.latestVersion);
              },
            },
          }),
        );
      }
    }
  }, [
    dispatch,
    lastUsedVersion,
    notifyWhenUpdateIsAvailable,
    setLastUsedVersion,
    t,
    versionInfo,
  ]);

  useConsentExpiryNotifications();
  useBankSyncNotification();

  const scrollableRef = useRef<HTMLDivElement>(null);

  return (
    <View style={{ height: '100%' }}>
      <a
        href="#main-content"
        className={css({
          position: 'absolute',
          left: -9999,
          top: 'auto',
          width: 1,
          height: 1,
          overflow: 'hidden',
          '&:focus': {
            position: 'fixed',
            top: 0,
            left: 0,
            width: 'auto',
            height: 'auto',
            padding: '10px 15px',
            backgroundColor: theme.pageBackground,
            color: theme.pageText,
            zIndex: 9999,
            outline: `2px solid ${theme.pageTextPositive}`,
          },
        })}
      >
        {t('Skip to main content')}
      </a>
      <RouterBehaviors />
      <GlobalKeys />
      <CommandBar />
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: theme.pageBackground,
          flex: 1,
        }}
      >
        <FloatableSidebar />

        <View
          style={{
            color: theme.pageText,
            backgroundColor: theme.pageBackground,
            flex: 1,
            overflow: 'hidden',
            width: '100%',
          }}
        >
          <ScrollProvider
            isDisabled={!isNarrowWidth}
            scrollableRef={scrollableRef}
          >
            <View
              ref={scrollableRef}
              style={{
                flex: 1,
                overflow: 'auto',
                position: 'relative',
              }}
            >
              <Titlebar
                style={{
                  WebkitAppRegion: 'drag',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  zIndex: 1000,
                }}
              />
              <Notifications />

              <RouteErrorBoundary>
                <Routes>
                  <Route
                    path="/"
                    element={
                      isAccountsFetching || !accounts ? (
                        <LoadingIndicator />
                      ) : accounts.length > 0 ? (
                        <Navigate to="/budget" replace />
                      ) : (
                        // If there are no accounts, we want to redirect the user to
                        // the All Accounts screen which will prompt them to add an account
                        <Navigate to="/accounts" replace />
                      )
                    }
                  />

                  <Route path="/reports/*" element={<Reports />} />

                  <Route
                    path="/budget"
                    element={<NarrowAlternate name="Budget" />}
                  />

                  <Route
                    path="/schedules"
                    element={<NarrowAlternate name="Schedules" />}
                  />
                  <Route
                    path="/schedules/:id"
                    element={
                      <WideNotSupported>
                        <NarrowAlternate name="ScheduleEdit" />
                      </WideNotSupported>
                    }
                  />

                  <Route
                    path="/payees"
                    element={<NarrowAlternate name="Payees" />}
                  />
                  <Route
                    path="/payees/:id"
                    element={
                      <WideNotSupported>
                        <NarrowAlternate name="PayeeEdit" />
                      </WideNotSupported>
                    }
                  />
                  <Route
                    path="/rules"
                    element={<NarrowAlternate name="Rules" />}
                  />
                  <Route
                    path="/rules/:id"
                    element={<NarrowAlternate name="RuleEdit" />}
                  />
                  <Route
                    path="/bank-sync"
                    element={<NarrowAlternate name="BankSync" />}
                  />
                  <Route
                    path="/bank-sync/account/:accountId/edit"
                    element={
                      <WideNotSupported redirectTo="/bank-sync">
                        <MobileBankSyncAccountEditPage />
                      </WideNotSupported>
                    }
                  />
                  <Route path="/tags" element={<ManageTagsPage />} />
                  <Route path="/settings" element={<Settings />} />

                  <Route
                    path="/gocardless/link"
                    element={
                      <NarrowNotSupported>
                        <WideComponent name="GoCardlessLink" />
                      </NarrowNotSupported>
                    }
                  />

                  <Route
                    path="/accounts"
                    element={<NarrowAlternate name="Accounts" />}
                  />

                  <Route
                    path="/accounts/:id"
                    element={<NarrowAlternate name="Account" />}
                  />

                  <Route
                    path="/transactions/:transactionId"
                    element={
                      <WideNotSupported>
                        <TransactionEdit />
                      </WideNotSupported>
                    }
                  />

                  <Route
                    path="/categories/:id"
                    element={<NarrowAlternate name="Category" />}
                  />
                  {multiuserEnabled && (
                    <Route
                      path="/user-directory"
                      element={
                        <ProtectedRoute
                          permission={Permissions.ADMINISTRATOR}
                          element={<UserDirectoryPage />}
                        />
                      }
                    />
                  )}
                  {multiuserEnabled && (
                    <Route
                      path="/user-access"
                      element={
                        <ProtectedRoute
                          permission={Permissions.ADMINISTRATOR}
                          validateOwner
                          element={<UserAccessPage />}
                        />
                      }
                    />
                  )}
                  {/* redirect all other traffic to the budget page */}
                  <Route
                    path="/*"
                    element={<Navigate to="/budget" replace />}
                  />
                </Routes>
              </RouteErrorBoundary>
            </View>

            <Routes>
              <Route path="/budget" element={<MobileNavTabs />} />
              <Route path="/accounts" element={<MobileNavTabs />} />
              <Route path="/settings" element={<MobileNavTabs />} />
              <Route path="/reports" element={<MobileNavTabs />} />
              <Route path="/reports/:dashboardId" element={<MobileNavTabs />} />
              <Route path="/bank-sync" element={<MobileNavTabs />} />
              <Route path="/rules" element={<MobileNavTabs />} />
              <Route path="/payees" element={<MobileNavTabs />} />
              <Route path="/schedules" element={<MobileNavTabs />} />
              <Route path="*" element={null} />
            </Routes>
          </ScrollProvider>
        </View>
      </View>
    </View>
  );
}
