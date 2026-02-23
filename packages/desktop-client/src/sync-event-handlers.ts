import { t } from 'i18next';

import { send } from 'loot-core/platform/client/connection';

import { resetSync, sync } from './app/appSlice';
import { closeAndDownloadBudget, uploadBudget } from './budgetfiles/budgetfilesSlice';
import { pushModal } from './modals/modalsSlice';
import type { Notification } from './notifications/notificationsSlice';
import { loadPrefs } from './prefs/prefsSlice';
import type { AppStore } from './redux/store';
import { signOut } from './users/usersSlice';

export type SyncErrorContext = {
  event: { type: string; subtype?: string; meta?: Record<string, unknown> };
  store: AppStore;
  learnMore: string;
  githubIssueLink: string;
  attemptedSyncRepair: boolean;
  setAttemptedSyncRepair: (v: boolean) => void;
};

export type SyncErrorHandlerResult = {
  notification: Notification | null;
  sideEffect?: () => void;
};

type SyncErrorHandler = (ctx: SyncErrorContext) => SyncErrorHandlerResult;

function handleOutOfSync(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store, learnMore, attemptedSyncRepair, setAttemptedSyncRepair } = ctx;

  if (attemptedSyncRepair) {
    return {
      notification: {
        title: t('Your data is still out of sync'),
        message:
          t(
            'We were unable to repair your sync state, sorry! You need to reset your sync state.',
          ) +
          ' ' +
          learnMore,
        sticky: true,
        id: 'reset-sync',
        button: {
          title: t('Reset sync'),
          action: () => {
            store.dispatch(resetSync());
          },
        },
      },
    };
  }

  return {
    notification: {
      title: t('Your data is out of sync'),
      message:
        t(
          'There was a problem syncing your data. We can try to repair your sync state to fix it.',
        ) +
        ' ' +
        learnMore,
      type: 'warning',
      sticky: true,
      id: 'repair-sync',
      button: {
        title: t('Repair'),
        action: async () => {
          setAttemptedSyncRepair(true);
          await send('sync-repair');
          store.dispatch(sync());
        },
      },
    },
  };
}

function handleFileOldVersion(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store } = ctx;
  return {
    notification: {
      title: t('Actual has updated the syncing format'),
      message: t(
        'This happens rarely (if ever again). The internal syncing format ' +
          'has changed and you need to reset sync. This will upload data from ' +
          'this device and revert all other devices. ' +
          '[Learn more about what this means](https://actualbudget.org/docs/getting-started/sync/#what-does-resetting-sync-mean).' +
          '\n\n' +
          'Old encryption keys are not migrated. If using encryption, [reset encryption here](#makeKey).',
      ),
      messageActions: {
        makeKey: () =>
          store.dispatch(
            pushModal({
              modal: { name: 'create-encryption-key', options: {} },
            }),
          ),
      },
      sticky: true,
      id: 'old-file',
      button: {
        title: t('Reset sync'),
        action: () => {
          store.dispatch(resetSync());
        },
      },
    },
  };
}

function handleFileKeyMismatch(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store, learnMore } = ctx;
  return {
    notification: {
      title: t('Your encryption key need to be reset'),
      message:
        t(
          'Something went wrong when registering your encryption key id. ' +
            'You need to recreate your key. ',
        ) + learnMore,
      sticky: true,
      id: 'invalid-key-state',
      button: {
        title: t('Reset key'),
        action: () => {
          store.dispatch(
            pushModal({
              modal: { name: 'create-encryption-key', options: {} },
            }),
          );
        },
      },
    },
  };
}

function handleFileNotFound(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store, learnMore } = ctx;
  return {
    notification: {
      title: t('This file is not a cloud file'),
      message:
        t(
          'You need to register it to take advantage ' +
            'of syncing which allows you to use it across devices and never worry ' +
            'about losing your data.',
        ) +
        ' ' +
        learnMore,
      type: 'warning',
      sticky: true,
      id: 'register-file',
      button: {
        title: t('Register'),
        action: async () => {
          await store.dispatch(uploadBudget({}));
          store.dispatch(sync());
          store.dispatch(loadPrefs());
        },
      },
    },
  };
}

function handleFileNeedsUpload(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store, learnMore } = ctx;
  return {
    notification: {
      title: t('File needs upload'),
      message:
        t(
          'Something went wrong when creating this cloud file. You need ' +
            'to upload this file to fix it.',
        ) +
        ' ' +
        learnMore,
      sticky: true,
      id: 'upload-file',
      button: {
        title: t('Upload'),
        action: () => {
          store.dispatch(resetSync());
        },
      },
    },
  };
}

function handleFileHasReset(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store, learnMore } = ctx;
  const { cloudFileId } = store.getState().prefs.local;
  if (!cloudFileId) {
    console.error(
      'Received file-has-reset or file-has-new-key error but no cloudFileId in prefs',
    );
    return { notification: null };
  }

  return {
    notification: {
      title: t('Syncing has been reset on this cloud file'),
      message:
        t(
          'You need to revert it to continue syncing. Any unsynced ' +
            'data will be lost. If you like, you can instead ' +
            '[upload this file](#upload) to be the latest version.',
        ) +
        ' ' +
        learnMore,
      messageActions: { upload: () => store.dispatch(resetSync()) },
      sticky: true,
      id: 'needs-revert',
      button: {
        title: t('Revert'),
        action: () => {
          store.dispatch(closeAndDownloadBudget({ cloudFileId }));
        },
      },
    },
  };
}

function handleEncryptFailure(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { store, event } = ctx;
  if (event.meta?.isMissingKey) {
    return {
      notification: {
        title: t('Missing encryption key'),
        message: t(
          'Unable to encrypt your data because you are missing the key. ' +
            'Create your key to sync your data.',
        ),
        sticky: true,
        id: 'encrypt-failure-missing',
        button: {
          title: t('Create key'),
          action: () => {
            store.dispatch(
              pushModal({
                modal: {
                  name: 'fix-encryption-key',
                  options: {
                    onSuccess: () => store.dispatch(sync()),
                  },
                },
              }),
            );
          },
        },
      },
    };
  }

  return {
    notification: {
      message: t(
        'Unable to encrypt your data. You have the correct ' +
          'key so this is likely an internal failure. To fix this, ' +
          'reset your sync data with a new key.',
      ),
      sticky: true,
      id: 'encrypt-failure',
      button: {
        title: t('Reset key'),
        action: () => {
          store.dispatch(
            pushModal({
              modal: { name: 'create-encryption-key', options: {} },
            }),
          );
        },
      },
    },
  };
}

function handleInvalidSchema(ctx: SyncErrorContext): SyncErrorHandlerResult {
  console.trace('invalid-schema', ctx.event.meta);
  return {
    notification: {
      title: t('Update required'),
      message: t(
        "We couldn't apply changes from the server. This probably means you " +
          'need to update the app to support the latest database.',
      ),
      type: 'warning',
    },
  };
}

function handleApplyFailure(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { githubIssueLink } = ctx;
  console.trace('apply-failure', ctx.event.meta);
  return {
    notification: {
      message: t(
        "We couldn't apply that change to the database. Please report this as a bug by [opening a GitHub issue]({{githubIssueLink}}).",
        { githubIssueLink },
      ),
    },
  };
}

function handleClockDrift(): SyncErrorHandlerResult {
  return {
    notification: {
      title: t('Time sync issue'),
      message: t(
        'Failed to sync because your device time differs too much from the server. Please check your device time settings and ensure they are correct.',
      ),
      type: 'warning',
      sticky: true,
    },
  };
}

function handleTokenExpired(ctx: SyncErrorContext): SyncErrorHandlerResult {
  return {
    notification: null,
    sideEffect: () => ctx.store.dispatch(signOut()),
  };
}

export function handleUnknownError(ctx: SyncErrorContext): SyncErrorHandlerResult {
  const { githubIssueLink, event } = ctx;
  console.trace('unknown error', event);
  return {
    notification: {
      message: t(
        'We had problems syncing your changes. Please report this as a bug by [opening a GitHub issue]({{githubIssueLink}}).',
        { githubIssueLink },
      ),
    },
  };
}

export const syncErrorHandlers: Record<string, SyncErrorHandler> = {
  'out-of-sync': handleOutOfSync,
  'file-old-version': handleFileOldVersion,
  'file-key-mismatch': handleFileKeyMismatch,
  'file-not-found': handleFileNotFound,
  'file-needs-upload': handleFileNeedsUpload,
  'file-has-reset': handleFileHasReset,
  'file-has-new-key': handleFileHasReset,
  'encrypt-failure': handleEncryptFailure,
  'decrypt-failure': handleEncryptFailure,
  'invalid-schema': handleInvalidSchema,
  'apply-failure': handleApplyFailure,
  'network': () => ({ notification: null }),
  'clock-drift': handleClockDrift,
  'token-expired': handleTokenExpired,
};
