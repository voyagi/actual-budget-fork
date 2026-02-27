import { send, sendCatch } from 'loot-core/platform/client/connection';
import type { SyncServerEnableBankingAccount } from 'loot-core/types/models';

// Timeout after 5 minutes of waiting for OAuth completion
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
// Poll every 3 seconds
const POLL_INTERVAL_MS = 3000;

/**
 * Opens the Enable Banking OAuth flow for the given bank (ASPSP).
 * Returns the list of accounts and session state once the user completes
 * authorization in the browser.
 *
 * Flow:
 * 1. Calls enablebanking-create-auth IPC to get { url, state }
 * 2. Opens the OAuth URL in the system browser
 * 3. Polls enablebanking-poll-session every 3s until accounts are returned
 * 4. Resolves with { accounts, state } or rejects on timeout
 */
export async function authorizeEnableBank(
  aspspName: string,
  aspspCountry: string,
): Promise<{ accounts: SyncServerEnableBankingAccount[]; state: string }> {
  // Step 1: Create auth session and get the redirect URL
  const authResult = await send('enablebanking-create-auth', {
    aspspName,
    aspspCountry,
  });

  if (!authResult || authResult.error) {
    throw new Error(
      authResult?.error ?? 'Failed to create Enable Banking auth session',
    );
  }

  const { url, state } = authResult as { url: string; state: string };

  // Step 2: Open the OAuth URL in the browser
  if (window.Actual?.openURLInBrowser) {
    window.Actual.openURLInBrowser(url);
  } else {
    window.open(url, '_blank');
  }

  // Step 3: Poll until accounts appear or timeout
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const pollTimer = setInterval(async () => {
      if (Date.now() - startTime > OAUTH_TIMEOUT_MS) {
        clearInterval(pollTimer);
        reject(new Error('timeout'));
        return;
      }

      const { data, error } = await sendCatch('enablebanking-poll-session', {
        state,
      });

      if (error) {
        // Non-fatal - session may not be ready yet
        return;
      }

      if (data && Array.isArray(data.accounts) && data.accounts.length > 0) {
        clearInterval(pollTimer);
        resolve({ accounts: data.accounts, state });
      }
    }, POLL_INTERVAL_MS);
  });
}
