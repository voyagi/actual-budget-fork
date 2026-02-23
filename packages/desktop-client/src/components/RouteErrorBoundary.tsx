import React from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorBoundary } from 'react-error-boundary';

import { Button } from '@actual-app/components/button';
import { theme } from '@actual-app/components/theme';
import { View } from '@actual-app/components/view';

function RouteErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  const { t } = useTranslation();

  return (
    <View
      id="main-content"
      style={{
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        flex: 1,
        color: theme.pageText,
      }}
    >
      <View style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>
        {t('Something went wrong loading this page.')}
      </View>
      <View style={{ fontSize: 14, marginBottom: 20, color: theme.pageTextLight }}>
        {error.message}
      </View>
      <Button variant="primary" onPress={resetErrorBoundary}>
        {t('Try again')}
      </Button>
    </View>
  );
}

export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={RouteErrorFallback}>
      {children}
    </ErrorBoundary>
  );
}
