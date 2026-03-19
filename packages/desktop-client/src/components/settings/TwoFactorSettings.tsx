import React, { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';

import { Button, ButtonWithLoading } from '@actual-app/components/button';
import { BigInput } from '@actual-app/components/input';
import { Text } from '@actual-app/components/text';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send } from 'loot-core/platform/client/connection';

import { Setting } from './UI';

import { useSyncServerStatus } from '@desktop-client/hooks/useSyncServerStatus';

type TotpStatus = {
  enrolled: boolean;
  recoveryCodesRemaining: number;
};

type SetupData = {
  qrCodeUri: string;
  secret: string;
  recoveryCodes: string[];
};

export function TwoFactorSettings() {
  const { t } = useTranslation();
  const serverStatus = useSyncServerStatus();

  const [status, setStatus] = useState<TotpStatus | null>(null);
  const [setupData, setSetupData] = useState<SetupData | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [disablePassword, setDisablePassword] = useState('');
  const [showDisable, setShowDisable] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await send('totp-status');
    if (res && !res.error) {
      setStatus(res as TotpStatus);
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

  async function onStartSetup() {
    setError(null);
    setLoading(true);
    const res = await send('totp-setup');
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSetupData(res as SetupData);
      setVerifyCode('');
    }
  }

  async function onVerifySetup() {
    if (!verifyCode || loading) return;
    setError(null);
    setLoading(true);
    const res = await send('totp-verify-setup', { code: verifyCode });
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setSetupData(null);
      setVerifyCode('');
      await loadStatus();
    }
  }

  async function onDisable() {
    if (!disablePassword || loading) return;
    setError(null);
    setLoading(true);
    const res = await send('totp-disable', { password: disablePassword });
    setLoading(false);
    if (res.error) {
      setError(res.error);
    } else {
      setShowDisable(false);
      setDisablePassword('');
      await loadStatus();
    }
  }

  async function onCopyCodes() {
    if (!setupData) return;
    await navigator.clipboard.writeText(setupData.recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Setup flow: QR code + recovery codes + verify step
  if (setupData) {
    return (
      <Setting>
        <Text>
          <Trans>
            <strong>Two-Factor Authentication Setup</strong>
          </Trans>
        </Text>
        <Text style={{ color: theme.pageTextLight }}>
          <Trans>
            Scan this QR code with your authenticator app (Google Authenticator,
            Authy, etc.):
          </Trans>
        </Text>
        <img
          src={setupData.qrCodeUri}
          alt={t('TOTP QR Code')}
          style={{ width: 180, height: 180, display: 'block' }}
        />
        <Text style={{ color: theme.pageTextLight, fontSize: 13 }}>
          <Trans>Or enter this secret manually:</Trans>{' '}
          <span
            style={{
              fontFamily: 'monospace',
              backgroundColor: theme.pillBackground,
              padding: '2px 6px',
              borderRadius: 3,
            }}
          >
            {setupData.secret}
          </span>
        </Text>
        <Text style={{ fontWeight: 600, marginTop: 8 }}>
          <Trans>Recovery codes (save these securely — shown once):</Trans>
        </Text>
        <View
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            backgroundColor: theme.tableBackground,
            border: '1px solid ' + theme.tableBorder,
            borderRadius: 4,
            padding: 10,
            gap: 4,
          }}
        >
          {setupData.recoveryCodes.map(code => (
            <Text key={code} style={{ fontFamily: 'monospace' }}>
              {code}
            </Text>
          ))}
        </View>
        <Button variant="bare" onPress={onCopyCodes}>
          {copied ? <Trans>Copied!</Trans> : <Trans>Copy All</Trans>}
        </Button>
        <Text style={{ color: theme.warningText, fontSize: 13 }}>
          <Trans>
            Save these recovery codes securely. They will not be shown again.
          </Trans>
        </Text>
        <Text style={{ marginTop: 8 }}>
          <Trans>
            Enter the 6-digit code from your authenticator app to confirm setup:
          </Trans>
        </Text>
        <View style={{ flexDirection: 'row', gap: '0.5rem', marginTop: 4 }}>
          <BigInput
            autoFocus
            aria-label={t('Verification code')}
            placeholder={t('6-digit code')}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            onChangeValue={setVerifyCode}
            onEnter={onVerifySetup}
            style={{ flex: 1 }}
            required
          />
          <ButtonWithLoading
            variant="primary"
            isLoading={loading}
            onPress={onVerifySetup}
          >
            <Trans>Confirm</Trans>
          </ButtonWithLoading>
          <Button
            variant="bare"
            onPress={() => {
              setSetupData(null);
              setError(null);
            }}
          >
            <Trans>Cancel</Trans>
          </Button>
        </View>
        {error && (
          <Text style={{ color: theme.errorText }}>{error}</Text>
        )}
      </Setting>
    );
  }

  // Disable flow: password confirmation
  if (showDisable) {
    return (
      <Setting>
        <Text>
          <Trans>
            <strong>Disable Two-Factor Authentication</strong>
          </Trans>
        </Text>
        <Text style={{ color: theme.pageTextLight }}>
          <Trans>Enter your password to confirm disabling 2FA:</Trans>
        </Text>
        <View style={{ flexDirection: 'row', gap: '0.5rem' }}>
          <BigInput
            autoFocus
            aria-label={t('Password')}
            placeholder={t('Password')}
            type="password"
            onChangeValue={setDisablePassword}
            onEnter={onDisable}
            style={{ flex: 1 }}
            required
          />
          <ButtonWithLoading
            variant="primary"
            isLoading={loading}
            onPress={onDisable}
          >
            <Trans>Disable 2FA</Trans>
          </ButtonWithLoading>
          <Button
            variant="bare"
            onPress={() => {
              setShowDisable(false);
              setDisablePassword('');
              setError(null);
            }}
          >
            <Trans>Cancel</Trans>
          </Button>
        </View>
        {error && (
          <Text style={{ color: theme.errorText }}>{error}</Text>
        )}
      </Setting>
    );
  }

  // Default view: status + enable/disable button
  const enrolled = status?.enrolled ?? false;

  return (
    <Setting
      primaryAction={
        <>
          {isOffline && (
            <Text style={{ color: theme.warningText, paddingTop: 5 }}>
              <Trans>Server is offline. 2FA settings are unavailable.</Trans>
            </Text>
          )}
          {!isOffline && enrolled && (
            <View style={{ gap: 8 }}>
              <Text>
                <Trans>
                  Recovery codes remaining:{' '}
                  <strong>{status?.recoveryCodesRemaining ?? 0}</strong>
                </Trans>
              </Text>
              <Button
                variant="normal"
                isDisabled={isOffline}
                onPress={() => setShowDisable(true)}
              >
                <Trans>Disable 2FA</Trans>
              </Button>
            </View>
          )}
          {!isOffline && !enrolled && (
            <ButtonWithLoading
              variant="normal"
              isLoading={loading}
              isDisabled={isOffline}
              onPress={onStartSetup}
              style={{ marginTop: 10 }}
            >
              <Trans>Enable 2FA</Trans>
            </ButtonWithLoading>
          )}
          {error && (
            <Text style={{ color: theme.errorText, marginTop: 5 }}>{error}</Text>
          )}
        </>
      }
    >
      <Text>
        <Trans>
          <strong>Two-factor authentication</strong> adds a second layer of
          security to your account using a time-based one-time password (TOTP)
          from an authenticator app.
        </Trans>
      </Text>
      {enrolled && (
        <Text style={{ color: theme.noticeTextLight, fontWeight: 600 }}>
          <Trans>Two-factor authentication is enabled.</Trans>
        </Text>
      )}
    </Setting>
  );
}
