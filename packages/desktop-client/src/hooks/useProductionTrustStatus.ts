import { useCallback, useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import { useSyncServerStatus } from './useSyncServerStatus';

export type ProductionTrustCondition =
  | 'access'
  | 'persistence'
  | 'multi_device_sync'
  | 'bank_sync';

export type ProductionTrustConditionState = {
  condition: ProductionTrustCondition;
  status: 'trusted' | 'untrusted';
  reason: string | null;
  message: string | null;
  lastCheckedAt: string;
  lastVerifiedAt: string | null;
  recoverySource: 'automated' | 'manual' | null;
  evidence: unknown;
};

export type ProductionTrustState = {
  isTrusted: boolean;
  activeConditions: ProductionTrustConditionState[];
  conditions: ProductionTrustConditionState[];
  lastCheckedAt: string | null;
  canRunAutomatedCheck: boolean;
};

export function useProductionTrustStatus() {
  const syncServerStatus = useSyncServerStatus();
  const [state, setState] = useState<ProductionTrustState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const refresh = useCallback(async () => {
    if (syncServerStatus !== 'online') {
      setState(null);
      return null;
    }

    setIsLoading(true);
    try {
      const result = await send('production-trust-status');
      if (result?.error) {
        setState(null);
        return null;
      }
      setState(result);
      return result as ProductionTrustState;
    } catch {
      setState(null);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [syncServerStatus]);

  const runAutomatedCheck = useCallback(
    async (condition?: ProductionTrustCondition) => {
      if (syncServerStatus !== 'online') return null;

      setIsChecking(true);
      try {
        const result = await send('production-trust-check', { condition });
        if (result?.error) {
          return null;
        }
        setState(result);
        return result as ProductionTrustState;
      } catch {
        return null;
      } finally {
        setIsChecking(false);
      }
    },
    [syncServerStatus],
  );

  const verifyManually = useCallback(
    async ({
      condition,
      evidence,
      message,
    }: {
      condition: ProductionTrustCondition;
      evidence?: unknown;
      message?: string;
    }) => {
      if (syncServerStatus !== 'online') return null;

      const result = await send('production-trust-manual-verify', {
        condition,
        evidence,
        message,
      });
      if (result?.error) {
        return null;
      }
      setState(result);
      return result as ProductionTrustState;
    },
    [syncServerStatus],
  );

  useEffect(() => {
    if (syncServerStatus !== 'online') {
      setState(null);
      return;
    }

    let active = true;

    async function poll() {
      const result = await refresh();
      if (!active || !result) return;
      setState(result);
    }

    function onVisibilityOrFocus() {
      if (!document.hidden) {
        poll();
      }
    }

    poll();
    const interval = setInterval(poll, 60_000);
    window.addEventListener('visibilitychange', onVisibilityOrFocus);
    window.addEventListener('focus', onVisibilityOrFocus);

    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibilityOrFocus);
      window.removeEventListener('focus', onVisibilityOrFocus);
    };
  }, [refresh, syncServerStatus]);

  return {
    state,
    isLoading,
    isChecking,
    refresh,
    runAutomatedCheck,
    verifyManually,
  };
}
