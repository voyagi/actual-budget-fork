import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { ButtonWithLoading } from '@actual-app/components/button';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Setting } from './UI';

import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';

type BackupStatusData = {
  lastBackupAt: number | null;
  lastBackupSize: number | null;
  lastBackupStatus: 'success' | 'failure' | 'never' | null;
  backupCount: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

export function BackupStatus() {
  const { t } = useTranslation();
  const serverStatus = useSyncServerStatus();

  const [status, setStatus] = useState<BackupStatusData | null>(null);
  const [loading, setLoading] = useState(false);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const res = await send('backup-status');
    if (res && !res.error) {
      setStatus(res as BackupStatusData);
    }
  }, []);

  useEffect(() => {
    if (serverStatus === 'online') {
      loadStatus();
    }
  }, [serverStatus, loadStatus]);

  if (serverStatus === 'no-server') {
    return null;
  }

  const isOffline = serverStatus === 'offline';

  async function onTriggerBackup() {
    if (loading) return;
    setError(null);
    setTriggerResult(null);
    setLoading(true);
    const res = await send('backup-trigger');
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      const sizeStr = res.sizeBytes != null ? formatBytes(res.sizeBytes) : '';
      const filesStr =
        res.filesCount != null ? ` (${res.filesCount} files)` : '';
      setTriggerResult(
        t('Backup completed: {{size}}{{files}}', {
          size: sizeStr,
          files: filesStr,
        }),
      );
      await loadStatus();
    }
  }

  const lastBackupText =
    status?.lastBackupAt != null
      ? `${new Date(status.lastBackupAt).toLocaleString()} (${formatRelativeTime(status.lastBackupAt)})`
      : t('Never');

  const statusColor =
    status?.lastBackupStatus === 'success'
      ? theme.noticeTextLight
      : status?.lastBackupStatus === 'failure'
        ? theme.errorText
        : theme.pageTextLight;

  const statusLabel =
    status?.lastBackupStatus === 'success'
      ? t('Success')
      : status?.lastBackupStatus === 'failure'
        ? t('Failed')
        : t('Never run');

  return (
    <Setting
      primaryAction={
        <>
          {isOffline && (
            <Text style={{ color: theme.warningText, paddingTop: 5 }}>
              <Trans>Server is offline. Backup controls are unavailable.</Trans>
            </Text>
          )}
          {!isOffline && (
            <View style={{ gap: 8, marginTop: 6 }}>
              <View style={{ gap: 4 }}>
                <Text>
                  <Trans>Last backup:</Trans>{' '}
                  <span style={{ fontWeight: 500 }}>{lastBackupText}</span>
                </Text>
                <Text>
                  <Trans>Status:</Trans>{' '}
                  <span style={{ color: statusColor, fontWeight: 600 }}>
                    {statusLabel}
                  </span>
                </Text>
                {status?.lastBackupSize != null && (
                  <Text>
                    <Trans>Size:</Trans>{' '}
                    <span style={{ fontWeight: 500 }}>
                      {formatBytes(status.lastBackupSize)}
                    </span>
                  </Text>
                )}
                <Text>
                  <Trans>Backups on disk:</Trans>{' '}
                  <span style={{ fontWeight: 500 }}>
                    {status?.backupCount ?? 0}
                  </span>
                </Text>
              </View>
              <ButtonWithLoading
                variant="normal"
                isLoading={loading}
                onPress={onTriggerBackup}
              >
                <Trans>Backup Now</Trans>
              </ButtonWithLoading>
              {triggerResult && (
                <Text style={{ color: theme.noticeTextLight }}>
                  {triggerResult}
                </Text>
              )}
              {error && (
                <Text style={{ color: theme.errorText }}>{error}</Text>
              )}
            </View>
          )}
        </>
      }
    >
      <Text>
        <Trans>
          <strong>Server Backup</strong> creates a compressed archive of your
          budget data on the server. Backups are also created automatically on a
          schedule.
        </Trans>
      </Text>
    </Setting>
  );
}
