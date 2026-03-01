import { useEffect, useState } from 'react';

import { send } from 'loot-core/platform/client/connection';

import { useSyncServerStatus } from './useSyncServerStatus';

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
  synced_at: string | null;           // ISO string (server converts from epoch integer)
  status: string;
  error_message: string | null;
  transactions_added: number | null;  // from eb_sync_log
  transactions_updated: number | null; // from eb_sync_log
  error_code: string | null;          // from eb_sync_log
  consent_valid_until: string | null; // NEW - ISO date from eb_sessions.valid_until
  session_id: string | null;          // NEW - for re-auth grouping
  aspsp_name: string | null;          // NEW - for banner display (e.g. "ING Bank connection expires March 15")
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
