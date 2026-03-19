// @ts-strict-ignore
import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { FallbackProps } from 'react-error-boundary';
import { Trans, useTranslation } from 'react-i18next';

import { Button } from '@actual-app/components/button';
import { AnimatedLoading } from '@actual-app/components/icons/AnimatedLoading';
import { Paragraph } from '@actual-app/components/paragraph';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

import { send, sendCatch } from 'loot-core/platform/client/connection';

import { Error, Warning } from '@desktop-client/components/alerts';
import { Autocomplete } from '@desktop-client/components/autocomplete/Autocomplete';
import { Link } from '@desktop-client/components/common/Link';
import {
  Modal,
  ModalCloseButton,
  ModalHeader,
} from '@desktop-client/components/common/Modal';
import { FormField, FormLabel } from '@desktop-client/components/forms';
import { COUNTRY_OPTIONS } from '@desktop-client/components/util/countries';
import { getCountryFromBrowser } from '@desktop-client/components/util/localeToCountry';
import { authorizeEnableBank } from '@desktop-client/enablebanking';
import { useEnableBankingStatus } from '@desktop-client/hooks/useEnableBankingStatus';
import { useGlobalPref } from '@desktop-client/hooks/useGlobalPref';
import { pushModal } from '@desktop-client/modals/modalsSlice';
import { useDispatch } from '@desktop-client/redux';

type EnableBankingExternalMsgModalProps = {
  sessionId?: string;
  aspspName?: string;
  aspspCountry?: string;
  reauth?: boolean;
};

type AspspOption = {
  id: string;
  name: string;
};

function useAvailableBanks(country: string) {
  const [banks, setBanks] = useState<AspspOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    async function fetch() {
      setIsError(false);

      if (!country) {
        setBanks([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const { data, error } = await sendCatch('enablebanking-get-banks', {
        country,
      });

      if (error || !Array.isArray(data)) {
        setIsError(true);
        setBanks([]);
      } else {
        // Enable Banking ASPSPs have a `name` field; map to autocomplete format
        const options: AspspOption[] = data.map(
          (aspsp: { name: string; country?: string }) => ({
            id: aspsp.name,
            name: aspsp.name,
          }),
        );
        setBanks(options);
      }

      setIsLoading(false);
    }

    fetch();
  }, [country]);

  return {
    data: banks,
    isLoading,
    isError,
  };
}

function renderError(
  error: { code: 'unknown' | 'timeout'; message?: string },
  t: ReturnType<typeof useTranslation>['t'],
) {
  return (
    <Error style={{ alignSelf: 'center', marginBottom: 10 }}>
      {error.code === 'timeout'
        ? t('Timed out. Please try again.')
        : t(
            'An error occurred while linking your account, sorry! The potential issue could be: {{ message }}',
            { message: error.message },
          )}
    </Error>
  );
}

// Error fallback shown when the OAuth flow or bank-fetch renders throw.
// Catches errors from useAvailableBanks, sendCatch calls, and authorizeEnableBank.
function EBModalErrorFallback({
  error: rawError,
  resetErrorBoundary,
}: FallbackProps) {
  const { t } = useTranslation();
  const errorMessage =
    rawError instanceof globalThis.Error ? rawError.message : String(rawError);

  return (
    <View style={{ padding: 20, alignItems: 'center' }}>
      <Paragraph style={{ color: theme.errorText, marginBottom: 10 }}>
        {t('Something went wrong with the bank connection flow.')}
      </Paragraph>
      <Paragraph
        style={{ fontSize: 12, color: theme.pageTextLight, marginBottom: 15 }}
      >
        {errorMessage}
      </Paragraph>
      <Button variant="primary" onPress={resetErrorBoundary}>
        {t('Try again')}
      </Button>
    </View>
  );
}

export function EnableBankingExternalMsgModal({
  sessionId,
  aspspName,
  aspspCountry,
  reauth = false,
}: EnableBankingExternalMsgModalProps = {}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const [language] = useGlobalPref('language');

  const browserTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const browserLocale = language || navigator.language || 'en-US';
  const detectedCountry = getCountryFromBrowser(
    browserTimezone,
    browserLocale,
    COUNTRY_OPTIONS,
  );

  const [waiting, setWaiting] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  // In re-auth mode, pre-fill bank and country from props to bypass the picker.
  // This ensures onJump() doesn't silently abort due to the guard
  // `if (!selectedBankId || !country) return`.
  const [selectedBankId, setSelectedBankId] = useState<string | undefined>(
    reauth ? aspspName : undefined,
  );
  const [country, setCountry] = useState<string | undefined>(
    reauth ? aspspCountry : detectedCountry,
  );
  const [error, setError] = useState<{
    code: 'unknown' | 'timeout';
    message?: string;
  } | null>(null);

  const {
    data: bankOptions,
    isLoading: isBankOptionsLoading,
    isError: isBankOptionError,
  } = useAvailableBanks(country ?? '');

  const { configured: isConfigured, isLoading: isConfigurationLoading } =
    useEnableBankingStatus();

  async function onJump() {
    if (!selectedBankId || !country) return;

    setError(null);
    setWaiting('browser');

    try {
      const { accounts } = await authorizeEnableBank(selectedBankId, country);

      if (reauth) {
        // Re-auth mode: swap the old session for the new one in eb_account_map.
        // The new session_id is shared by all accounts from the same OAuth flow.
        if (!accounts || accounts.length === 0) {
          setError({
            code: 'unknown',
            message: t('No accounts returned from re-authorization'),
          });
          setWaiting(null);
          return;
        }

        const newSessionId = accounts[0].session_id;

        await send('enablebanking-reauth-complete', {
          newSessionId,
          oldSessionId: sessionId,
        });

        // Trigger an immediate sync so the user sees fresh data after re-auth.
        send('accounts-bank-sync', { ids: [] }).catch(() => {});

        setWaiting(null);
        setSuccess(true);
      } else {
        dispatch(
          pushModal({
            modal: {
              name: 'select-linked-accounts',
              options: {
                externalAccounts: accounts,
                syncSource: 'enableBanking',
              },
            },
          }),
        );

        setWaiting(null);
        setSuccess(true);
      }
    } catch (err: unknown) {
      const message =
        err instanceof globalThis.Error ? err.message : String(err);
      setError({
        code: message === 'timeout' ? 'timeout' : 'unknown',
        message: message !== 'timeout' ? message : undefined,
      });
      setWaiting(null);
    }
  }

  const renderLinkButton = () => {
    return (
      <View style={{ gap: 10 }}>
        <FormField>
          <FormLabel
            title={t('Choose your country:')}
            htmlFor="country-field"
          />
          <Autocomplete
            strict
            highlightFirst
            suggestions={COUNTRY_OPTIONS}
            onSelect={setCountry}
            value={country}
            inputProps={{
              id: 'country-field',
              placeholder: t('(please select)'),
            }}
          />
        </FormField>

        {isBankOptionError ? (
          <Error>
            <Trans>
              Failed loading available banks. Enable Banking may not be
              configured correctly. Please check your server settings.
            </Trans>
          </Error>
        ) : (
          country &&
          (isBankOptionsLoading ? (
            t('Loading banks...')
          ) : (
            <FormField>
              <FormLabel title={t('Choose your bank:')} htmlFor="bank-field" />
              <Autocomplete
                focused
                strict
                highlightFirst
                suggestions={bankOptions}
                onSelect={setSelectedBankId}
                value={selectedBankId}
                inputProps={{
                  id: 'bank-field',
                  placeholder: t('(please select)'),
                }}
              />
            </FormField>
          ))
        )}

        <Warning>
          <Trans>
            By enabling bank sync, you will be granting Enable Banking (a third
            party service) read-only access to your account&apos;s transaction
            history. This service is not affiliated with Actual in any way. Make
            sure you&apos;ve read and understand Enable Banking&apos;s{' '}
            <Link
              variant="external"
              to="https://enablebanking.com/privacy-policy/"
              linkColor="purple"
            >
              Privacy Policy
            </Link>{' '}
            before proceeding.
          </Trans>
        </Warning>

        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Button
            variant="primary"
            autoFocus
            style={{
              padding: '10px 0',
              fontSize: 15,
              fontWeight: 600,
              flexGrow: 1,
            }}
            onPress={onJump}
            isDisabled={!selectedBankId || !country}
          >
            <Trans>Link bank in browser</Trans> &rarr;
          </Button>
        </View>
      </View>
    );
  };

  return (
    <Modal
      name="enablebanking-external-msg"
      containerProps={{ style: { width: 'clamp(300px, 85vw, 600px)' } }}
    >
      {({ state: { close } }) => (
        <>
          <ModalHeader
            title={
              reauth
                ? t('Re-authorize Bank (Enable Banking)')
                : t('Link Your Bank (Enable Banking)')
            }
            rightContent={<ModalCloseButton onPress={close} />}
          />
          <ErrorBoundary FallbackComponent={EBModalErrorFallback}>
            <View>
              <Paragraph style={{ fontSize: 15 }}>
                {reauth ? (
                  <Trans>
                    To re-authorize your bank connection, you will be redirected
                    to a new page where your bank will ask you to authorize
                    access again. Your existing accounts and transaction history
                    will not be affected.
                  </Trans>
                ) : (
                  <Trans>
                    To link your bank account, you will be redirected to a new
                    page where your bank will ask you to authorize access.
                    Enable Banking will not be able to withdraw funds from your
                    accounts.
                  </Trans>
                )}
              </Paragraph>

              {error && (
                <>
                  {renderError(error, t)}
                  {reauth && (
                    <View style={{ alignItems: 'center', marginTop: 10 }}>
                      <Button variant="primary" onPress={onJump}>
                        <Trans>Try again</Trans>
                      </Button>
                    </View>
                  )}
                </>
              )}

              {!error &&
                (waiting || isConfigurationLoading ? (
                  <View style={{ alignItems: 'center', marginTop: 15 }}>
                    <AnimatedLoading
                      color={theme.pageTextDark}
                      style={{ width: 20, height: 20 }}
                    />
                    <View style={{ marginTop: 10, color: theme.pageText }}>
                      {isConfigurationLoading
                        ? t('Checking Enable Banking configuration...')
                        : waiting === 'browser'
                          ? t('Waiting for bank authorization...')
                          : null}
                    </View>

                    {waiting === 'browser' && (
                      <Link
                        variant="text"
                        onClick={onJump}
                        style={{ marginTop: 10 }}
                      >
                        (
                        <Trans>
                          Bank authorization not opening in a new tab? Click
                          here
                        </Trans>
                        )
                      </Link>
                    )}
                  </View>
                ) : success ? (
                  <Paragraph
                    style={{ marginTop: 10, color: theme.noticeTextLight }}
                  >
                    {reauth ? (
                      <Trans>
                        Success! Your bank connection has been re-authorized.
                        Syncing fresh transactions now. Please close this
                        window.
                      </Trans>
                    ) : (
                      <Trans>
                        Success! Your bank accounts are being linked. Please
                        close this window.
                      </Trans>
                    )}
                  </Paragraph>
                ) : isConfigured ? (
                  renderLinkButton()
                ) : (
                  <>
                    <Paragraph style={{ color: theme.errorText }}>
                      <Trans>
                        Enable Banking integration has not yet been configured.
                        Please contact your server administrator to set up the
                        Enable Banking API credentials.
                      </Trans>
                    </Paragraph>
                  </>
                ))}
            </View>
          </ErrorBoundary>
        </>
      )}
    </Modal>
  );
}
