import type { QueryClient } from '@tanstack/react-query';
import { t } from 'i18next';

import { listen } from 'loot-core/platform/client/connection';

import { accountQueries } from './accounts';
import { sync } from './app/appSlice';
import { categoryQueries } from './budget';
import { addNotification } from './notifications/notificationsSlice';
import { reloadPayees } from './payees/payeesSlice';
import { loadPrefs } from './prefs/prefsSlice';
import type { AppStore } from './redux/store';
import { handleUnknownError, syncErrorHandlers } from './sync-event-handlers';

export function listenForSyncEvent(store: AppStore, queryClient: QueryClient) {
  // TODO: This is only wired up in App.tsx (desktop). Verify whether
  // mobile also needs these sync-event notifications, and if so wire
  // up listenForSyncEvent in the mobile entry point.
  const unlistenUnauthorized = listen('sync-event', async ({ type }) => {
    if (type === 'unauthorized') {
      store.dispatch(
        addNotification({
          notification: {
            type: 'warning',
            message: 'Unable to authenticate with server',
            sticky: true,
            id: 'auth-issue',
          },
        }),
      );
    }
  });

  let attemptedSyncRepair = false;

  const unlistenSuccess = listen('sync-event', event => {
    const prefs = store.getState().prefs.local;
    if (!prefs || !prefs.id) {
      // Do nothing if no budget is loaded
      return;
    }

    if (event.type === 'success' || event.type === 'applied') {
      if (attemptedSyncRepair) {
        attemptedSyncRepair = false;

        store.dispatch(
          addNotification({
            notification: {
              title: t('Syncing has been fixed!'),
              message: t('Happy budgeting!'),
              type: 'message',
            },
          }),
        );
      }

      const tables = event.tables;

      if (tables.includes('prefs')) {
        store.dispatch(loadPrefs());
      }

      if (
        tables.includes('categories') ||
        tables.includes('category_groups') ||
        tables.includes('category_mapping')
      ) {
        queryClient.invalidateQueries({
          queryKey: categoryQueries.lists(),
        });
      }

      if (
        // Sync on accounts change because so that transfer payees are updated
        tables.includes('accounts') ||
        tables.includes('payees') ||
        tables.includes('payee_mapping')
      ) {
        store.dispatch(reloadPayees());
      }

      if (tables.includes('accounts')) {
        queryClient.invalidateQueries({
          queryKey: accountQueries.lists(),
        });
      }
    } else if (event.type === 'error') {
      const learnMore = `[${t('Learn more')}](https://actualbudget.org/docs/getting-started/sync/#debugging-sync-issues)`;
      const githubIssueLink =
        'https://github.com/actualbudget/actual/issues/new?assignees=&labels=bug&template=bug-report.yml&title=%5BBug%5D%3A+';

      const ctx = {
        event,
        store,
        learnMore,
        githubIssueLink,
        attemptedSyncRepair,
        setAttemptedSyncRepair: (v: boolean) => {
          attemptedSyncRepair = v;
        },
      };

      const handler = syncErrorHandlers[event.subtype] ?? handleUnknownError;
      const result = handler(ctx);
      if (result.sideEffect) result.sideEffect();
      if (result.notification) {
        store.dispatch(
          addNotification({
            notification: { type: 'error', ...result.notification },
          }),
        );
      }
    }
  });

  return () => {
    unlistenUnauthorized();
    unlistenSuccess();
  };
}
