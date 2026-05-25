# Phase 3: Automation and Consent Lifecycle - Research

**Researched:** 2026-03-01
**Domain:** Node.js cron scheduling, consent expiry lifecycle, React banner UI, sync-on-open
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Scheduling:**
- Server-side cron using node-cron on the sync-server, running every 6 hours (4x/day at fixed intervals)
- When a scheduled sync fails for one account, retry once after a short delay, then continue syncing remaining accounts
- Log sync runs to both console (visible in docker logs) and database (eb_sync_log entries)
- Scheduler must be multi-user aware: group accounts by user/budget, sync each user's accounts independently
- Scheduler is opt-in via `ENABLE_AUTO_SYNC=true/false` env var (off by default, good for development)
- No overlap guard needed: trust that syncs finish quickly, EB API handles idempotently
- Claude's discretion: whether to skip accounts with expired consent before attempting sync

**Consent Expiry UX:**
- Graduated placement: global banner at top of app for urgent warnings (< 7 days), plus subtle indicator on account list page always
- Banner is dismissible but re-appears daily until consent is renewed
- Graduated urgency colors: 14-7 days informational/yellow, under 7 days warning/orange, expired error/red
- When multiple banks have expiring consent, show a single grouped banner ("2 bank connections expiring soon") with a link to the account list
- Banner shows specific details: bank name and exact expiry date (e.g. "ING Bank connection expires March 15")
- When consent has fully expired: red error banner + disable automatic sync for that bank (don't waste API calls)
- Account list shows a "Consent expires" date column per bank, always visible (not just when expiring)
- Claude's discretion: how to fetch consent expiry data for the client (new endpoint vs extending sync-status)

**Re-authorization Flow:**
- Reuse the existing OAuth popup flow (create-auth, bank redirect, callback) for re-authorization
- After successful re-authorization, immediately trigger a sync so user sees fresh data confirming re-auth worked
- Preserve existing account links automatically by matching EB account UIDs from the new session to existing eb_account_map rows (no re-linking needed)
- On re-authorization failure, show an error modal with a "Try again" button (more prominent than a toast)
- Prefer extending/renewing the existing EB session if the API supports it, fall back to creating a new session if not
- Re-auth button appears in both the global consent banner AND on individual account rows in the bank sync page
- Re-authorization is per-session: one OAuth flow renews all accounts under that bank session
- Consent expiry notifications are in-app only (no email/push notifications)

**Sync-on-Open:**
- When app opens and last sync is 6+ hours old, run a background sync with a subtle indicator (small spinner or "Syncing..." text near account names), non-blocking so user can navigate freely
- Sync all linked accounts in parallel on open (not just EB, all bank sync providers: GoCardless, SimpleFin, etc.)
- 6-hour threshold is configurable in settings (default 6 hours)
- If sync-on-open fails, show a non-blocking toast ("Sync failed - check your connection") and let user continue with stale data
- Combined check on app open: check last sync age AND consent expiry in one pass, show both syncing indicator and consent banner if needed
- Last-synced timestamp updates only after sync completes successfully (no "syncing now" replacement during)
- Also trigger sync on window/tab focus if the stale threshold has passed (catches long idle sessions)

### Claude's Discretion
- Loading skeleton/spinner design details
- Exact banner component styling and animation
- Console log format and verbosity level
- Data flow for consent expiry to client (new endpoint vs extending sync-status)
- Whether to skip expired-consent accounts in scheduler or let API error

### Deferred Ideas (OUT OF SCOPE)
None - discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| AUTO-01 | Transactions sync automatically 4x/day without manual intervention (node-cron scheduler) | node-cron 4.2.1 already in STATE.md; scheduler pattern documented; server entry point identified |
| AUTO-02 | Consent expiry date stored from EB session response (reads actual valid_until per bank, not hardcoded) | Critical finding: valid_until is already stored from exchangeCode() response; createAuth() must read maximum_consent_validity from ASPSP listing to pass correct access.valid_until; migration needed to rename/clarify field |
| AUTO-03 | User sees in-app banner when PSD2 consent is within 14 days of expiry | addNotification pattern exists; existing Notification type supports button + sticky; consent data endpoint strategy documented |
| AUTO-04 | User can re-authorize bank access through consent renewal flow (reuses OAuth redirect) | Existing createAuth/exchangeCode/callback flow reusable; re-auth vs new session fallback strategy documented |
| AUTO-05 | App triggers sync on open if last sync was more than 6 hours ago | FinancesApp.tsx already calls dispatch(sync()) at init; visibilitychange already wired in App.tsx; hook point identified |
| AUTO-06 | User can see per-account last-synced timestamp in the account view | AccountRow.tsx already shows last_sync via tsToRelativeTime(); eb_sync_log.synced_at already exists; consent expiry column addition documented |
</phase_requirements>

## Summary

Phase 3 has the most existing infrastructure of any phase so far. The sync-server already has the full Enable Banking integration (sessions, account map, sync log, transactions endpoint). The desktop client already shows last-sync timestamps per account in `AccountRow.tsx`. The `accounts-bank-sync` IPC handler already orchestrates multi-account sync. The `FinancesApp.tsx` already calls `dispatch(sync())` on load and `App.tsx` already listens to `visibilitychange`. The notification system (`addNotification`, `Notification` type, sticky banners) is mature and well-understood.

The six requirements break down into four distinct work streams: (1) server-side cron scheduler, (2) consent expiry data plumbing, (3) consent expiry banner UI, and (4) sync-on-open. Each has clear hook points in existing code. The biggest gotcha is the `maximum_consent_validity` field - it lives in the ASPSP object from GET /aspsps, not in the session creation response. The session creation response does return `access.valid_until` (the actual negotiated expiry), which the existing `/callback` route already stores in `eb_sessions.valid_until`. The `createAuth()` function currently hardcodes 90 days; it must call getAspsps first to read `maximum_consent_validity` and pass the correct ceiling to EB.

The consent expiry data flow (Claude's discretion) should extend the existing `/sync-status` endpoint rather than creating a new endpoint. This keeps the client's data fetch consolidated. For re-authorization, the Enable Banking API does NOT have a session renewal endpoint - the correct approach is always to create a new session via `createAuth()` and then update `eb_account_map.session_id` to point to the new session.

**Primary recommendation:** Build the scheduler first (server side, no UI), then consent expiry data plumbing, then the banner UI, then sync-on-open. Each wave is independently testable.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node-cron | 4.2.1 (already installed, STATE.md) | Cron scheduler on sync-server | Already in project; v4 is TypeScript-native; confirmed stable |
| @react-spring/web | existing | Animated banner transitions | Already used by BankSyncStatus.tsx with identical pattern |
| @tanstack/react-query | existing | Data fetching for consent status | Already used throughout FinancesApp |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | 4.1.0 (already in sync-server) | Date math for expiry calculations | Expiry countdown arithmetic server-side |
| No new packages needed | - | All tools already present | Phase uses existing infrastructure |

**Installation:** No new packages required. node-cron 4.2.1 is already listed in STATE.md as a project dependency but not yet installed. Run:

```bash
cd packages/sync-server && yarn add node-cron@4.2.1
```

Verify it is not already present:
```bash
cd packages/sync-server && node -e "require('node-cron'); console.log('ok')" 2>/dev/null || echo "not installed"
```

## Architecture Patterns

### Recommended Project Structure

New files for this phase:

```
packages/sync-server/src/
└── scheduler.ts                         # NEW: cron + consent checker

packages/desktop-client/src/
├── components/
│   ├── ConsentExpiryBanner.tsx          # NEW: global top banner
│   └── banksync/
│       └── AccountRow.tsx               # MODIFY: add consent expiry column
├── hooks/
│   └── useEnableBankingStatus.ts        # MODIFY: add useConsentExpiry hook
└── components/
    └── FinancesApp.tsx                  # MODIFY: add sync-on-open logic
```

Modified files:
```
packages/sync-server/src/
├── app.ts                               # MODIFY: import scheduler, start on boot
└── app-enablebanking/
    ├── app-enablebanking.ts             # MODIFY: extend /sync-status with consent data, add /consent-expiry
    └── enablebanking-service.ts         # MODIFY: fix createAuth() to use maximum_consent_validity
```

### Pattern 1: node-cron Scheduler on Sync-Server

**What:** A cron job running every 6 hours on the sync-server, triggered by the scheduler module imported in `app.ts`. The scheduler queries the database for all linked EB accounts, groups them (one sync per user/budget), fetches transactions, and writes to `eb_sync_log`.

**When to use:** Server-side background work that must run independent of any connected client.

**Key facts about node-cron 4.x (verified via npm registry and official docs):**
- `cron.schedule(expression, handler, options?)` is the main API
- Available options: `name`, `timezone`, `noOverlap`, `maxExecutions`, `maxRandomDelay`
- Tasks start immediately upon creation (no `scheduled: true` needed - removed in v4)
- Use `createTask` for a stopped task that you manually `start()`
- `noOverlap: true` prevents concurrent runs (not needed here per CONTEXT.md, but available)

**Cron expression for every 6 hours:** `'0 0 */6 * * *'` (second-level precision: at minute 0, hour 0/6/12/18)

```typescript
// Source: node-cron v4 API, STATE.md decision
import cron from 'node-cron';
import { getAccountDb } from './account-db.js';

export function startScheduler() {
  if (process.env.ENABLE_AUTO_SYNC !== 'true') {
    console.log('[scheduler] Auto-sync disabled (ENABLE_AUTO_SYNC not set to true)');
    return;
  }

  cron.schedule('0 0 */6 * * *', async () => {
    console.log('[scheduler] Starting scheduled sync run');
    const db = getAccountDb();

    // Query all linked EB accounts (actual_account_id must be populated)
    const accounts = db.all(
      `SELECT m.actual_account_id, m.eb_account_uid, m.session_id
       FROM eb_account_map m
       WHERE m.actual_account_id IS NOT NULL`,
    );

    for (const account of accounts) {
      // Check consent expiry before attempting - skip if expired
      const session = db.first(
        'SELECT valid_until FROM eb_sessions WHERE id = ?',
        [account.session_id],
      );
      if (session?.valid_until && new Date(session.valid_until) < new Date()) {
        console.log(`[scheduler] Skipping ${account.actual_account_id}: consent expired`);
        continue;
      }

      try {
        // Trigger via internal HTTP or direct service call
        await syncOneAccount(account.actual_account_id);
      } catch (err) {
        // Retry once after 30 seconds
        await new Promise(r => setTimeout(r, 30_000));
        try {
          await syncOneAccount(account.actual_account_id);
        } catch (retryErr) {
          console.error(`[scheduler] Retry failed for ${account.actual_account_id}:`, retryErr.message);
          // Log to eb_sync_log
          db.mutate(
            `INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, error_message)
             VALUES (?, ?, 'error', ?)`,
            [account.actual_account_id, account.eb_account_uid, retryErr.message],
          );
        }
      }
    }
  });

  console.log('[scheduler] Auto-sync scheduled (every 6 hours)');
}
```

**Integration in app.ts:** Import and call `startScheduler()` after `bootstrap()` completes in `run()`.

### Pattern 2: Consent Expiry Data Flow

**What:** The server exposes consent expiry dates through the existing `/sync-status` endpoint (extended). The client reads this data on load and shows the banner.

**Recommendation (Claude's discretion resolved):** Extend `/sync-status` to include `consent_valid_until` per account. This avoids a second HTTP round-trip and keeps the client's data fetch atomic.

```typescript
// In app-enablebanking.ts /sync-status handler
for (const accountId of accountIds || []) {
  const lastEntry = db.first(
    'SELECT * FROM eb_sync_log WHERE actual_account_id = ? ORDER BY id DESC LIMIT 1',
    [accountId],
  );
  const mapRow = db.first(
    'SELECT m.session_id FROM eb_account_map m WHERE m.actual_account_id = ?',
    [accountId],
  );
  const session = mapRow
    ? db.first('SELECT valid_until FROM eb_sessions WHERE id = ?', [mapRow.session_id])
    : null;

  statuses[accountId] = {
    ...lastEntry,
    consent_valid_until: session?.valid_until ?? null,
  };
}
```

### Pattern 3: ConsentExpiryBanner Component

**What:** A React component placed in `FinancesApp.tsx` above `<Notifications />`. Reads consent data from the extended `/sync-status` hook, renders a colored banner based on urgency.

**Where it lives:** Between `<Notifications />` and `<BankSyncStatus />` in `FinancesApp.tsx` JSX.

**Urgency thresholds:**
- Expired: `valid_until < now` - red error banner
- Urgent: `valid_until - now < 7 days` - orange warning banner
- Upcoming: `valid_until - now < 14 days` - yellow informational banner
- OK: no banner (but account list still shows the date)

**Dismissibility:** Use `localStorage` keyed by `consent-expiry-dismissed-{sessionId}-{date}` where `{date}` is the current date string. On each render, check if today's key exists. The daily re-appearance is automatic - tomorrow's key won't match.

```typescript
// Source: derived from existing Notification type in notificationsSlice.ts
// The existing addNotification dispatch works for consent banners too,
// avoiding a custom banner component entirely.
dispatch(addNotification({
  notification: {
    id: `consent-expiry-${sessionId}`,  // stable ID prevents duplicates
    type: 'warning',  // or 'error' for expired
    title: 'Bank connection expiring soon',
    message: `ING Bank connection expires March 15. Click to re-authorize.`,
    sticky: true,
    button: {
      title: 'Re-authorize',
      action: () => dispatch(pushModal({ modal: { name: 'enable-banking-reauth', options: { sessionId } } })),
    },
    onClose: () => {
      // Mark dismissed for today
      localStorage.setItem(`consent-dismissed-${sessionId}-${todayStr}`, '1');
    },
  },
}));
```

**Alternative:** Custom `ConsentExpiryBanner.tsx` component with graduated colors. The `addNotification` approach is simpler because the Notifications component is already wired and positioned, but it only supports `message/warning/error` types without custom color gradation. For the orange "< 7 days" color that is not a standard Actual notification color, a custom banner component is necessary.

**Decision:** Build `ConsentExpiryBanner.tsx` as a custom component placed directly in `FinancesApp.tsx`. It reads the consent data from `useEnableBankingSyncStatus` (extended) and renders its own DOM with graduated colors. The `addNotification` system stays for transient errors.

### Pattern 4: Sync-on-Open

**What:** When the budget loads, check if any linked account's `last_sync` is older than the configured threshold (default 6 hours). If so, trigger `accounts-bank-sync` IPC call in the background.

**Hook point:** `FinancesApp.tsx` already calls `dispatch(sync())` on init (line 115). Extend this to also trigger bank sync if stale. App.tsx already listens to `visibilitychange` (line 201) for the database sync - add bank sync check there too.

**Threshold configurable in settings:** Use the existing `useLocalPref` hook pattern. Add a `bankSyncStaleThresholdHours` local pref (default: 6).

```typescript
// In FinancesApp.tsx, extend the init useEffectEvent
const init = useEffectEvent(() => {
  setTimeout(async () => {
    await dispatch(sync()); // existing CRDT sync

    // NEW: check if bank sync is stale
    const accounts = await send('accounts-get');
    const linkedAccounts = accounts.filter(a => a.account_sync_source && a.account_id);
    const staleThresholdMs = staleThresholdHours * 60 * 60 * 1000;
    const now = Date.now();
    const needsSync = linkedAccounts.some(a => {
      const lastSync = a.last_sync ? parseInt(a.last_sync, 10) : 0;
      return (now - lastSync) > staleThresholdMs;
    });

    if (needsSync) {
      // Non-blocking: don't await, let it run in background
      // accountsSyncing redux state shows the BankSyncStatus indicator
      dispatch(accountsBankSync({ ids: [] })); // empty ids = all accounts
    }
  }, 100);
});
```

**visibilitychange:** App.tsx line 191 has an `onVisibilityChange` handler that calls `dispatch(sync())`. Extend it to also call the bank sync check when the tab becomes visible.

**Note:** `accountsBankSync` is an IPC handler (`accounts-bank-sync`), not a Redux thunk. The UI dispatches it via `send('accounts-bank-sync', { ids: [] })`. The existing `BankSyncStatus` component reads `state.account.accountsSyncing` from Redux, which is updated by the existing `accountsBankSync` handler.

### Pattern 5: Fix createAuth() for maximum_consent_validity (AUTO-02)

**What:** The `createAuth()` function in `enablebanking-service.ts` currently hardcodes 90 days for `access.valid_until`. The correct approach is to fetch the ASPSP's `maximum_consent_validity` first and use it to calculate the ceiling.

**Critical finding:** `maximum_consent_validity` is in the ASPSP object from GET /aspsps (field: `aspsps[].maximum_consent_validity`, type: integer, unit: seconds). The session creation response (`POST /sessions`) does NOT contain this field. The session response returns `access.valid_until` in RFC3339 format - the actual negotiated expiry after EB applies the bank's constraints.

**The flow for AUTO-02:**
1. When `/create-auth` is called with `aspspName` + `aspspCountry`, fetch ASPSP data first
2. Look up `maximum_consent_validity` from the matching ASPSP
3. Pass `valid_until = now + maximum_consent_validity` to `createAuth()`
4. After `/callback` exchanges the code, the session response returns the actual `access.valid_until`
5. Store that value in `eb_sessions.valid_until` (already done by existing code)
6. The stored value IS the correct per-bank consent expiry

**The existing `/callback` route already stores `valid_until` from `exchangeCode()`** - this is already correct. The only fix needed is in `createAuth()` to pass the right ceiling, which ensures EB negotiates the longest possible session with the bank.

```typescript
// In enablebanking-service.ts createAuth() - MODIFIED
export async function createAuth({ aspspName, aspspCountry, redirectUrl, state }) {
  // Fetch ASPSP to get maximum_consent_validity
  const aspspsResponse = await ebRequest('GET', `/aspsps?country=${aspspCountry}`);
  const aspsp = (aspspsResponse.data.aspsps || []).find(a => a.name === aspspName);

  // Use bank's maximum validity (in seconds), fall back to 180 days (EU standard)
  const maxValiditySeconds = aspsp?.maximum_consent_validity ?? (180 * 24 * 3600);
  const validUntil = new Date(Date.now() + maxValiditySeconds * 1000).toISOString();

  const response = await ebRequest('POST', '/auth', {
    aspsp: { name: aspspName, country: aspspCountry },
    redirect_url: redirectUrl,
    state,
    access: { valid_until: validUntil },
  });

  return response.data;
}
```

### Pattern 6: Re-authorization Flow

**What:** Re-auth reuses the existing `createAuth` / `exchangeCode` / `callback` flow. After a new session is created, the existing `eb_account_map` rows for that bank are updated to point to the new session ID. No re-linking is needed.

**EB API capability:** The Enable Banking API does NOT have a session renewal/extension endpoint. Re-authorization always creates a new session. The old session remains in `eb_sessions` but `eb_account_map.session_id` is updated to point to the new one.

**Re-auth vs new session:** They are the same flow. `createAuth()` always creates a new session. The difference from the initial flow is that after `/callback`, instead of inserting new rows into `eb_account_map`, we UPDATE existing rows to the new `session_id`.

**Re-auth button trigger:** The button dispatches a Redux action to open the EB auth modal. The modal calls `enablebanking-create-auth` IPC handler. The modal detects "re-auth mode" from props and after success calls `enablebanking-reauth-complete` (a new IPC handler that updates `eb_account_map.session_id` without creating new Actual accounts).

```typescript
// New IPC handler in loot-core/src/server/accounts/app.ts
async function enableBankingReauth({ newSessionId, oldSessionId }) {
  // Update all account map rows from old session to new session
  await db.runQuery(
    'UPDATE eb_account_map SET session_id = ? WHERE session_id = ?',
    [newSessionId, oldSessionId],
  );
  // Delete the old session (optional - keeps DB clean)
  // Actually: keep old session for audit trail, just update the map
  return {};
}
```

### Anti-Patterns to Avoid

- **Polling for consent status in the client:** Do not query `/sync-status` every N seconds. Fetch once on load and once after any sync operation. Consent validity is days/weeks, not seconds.
- **Storing maximum_consent_validity in the database:** It is a per-bank API property, not session state. Fetch it fresh from the ASPSP listing at createAuth() time.
- **Creating a separate `maximum_consent_validity` field in eb_sessions:** The `valid_until` field already captures the correct expiry after the session is created. Do not add confusion with a second expiry field.
- **Blocking the UI on sync-on-open:** Sync runs fire-and-forget. User can navigate immediately.
- **Showing a dismissible banner that resets on every page navigation:** Use `localStorage` keyed by date+sessionId to maintain dismissed state across React re-renders.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom setInterval loop | node-cron 4.2.1 | Handles edge cases: daylight saving, missed runs on restart, cron expression parsing |
| Date math for expiry | Manual timestamp arithmetic | date-fns (already installed) | Edge cases: timezone, month boundaries, RFC3339 parsing |
| Animated banner transitions | Custom CSS animation | @react-spring/web (already used by BankSyncStatus.tsx) | Same pattern already in codebase |
| Redux state updates from IPC | Custom event emitter | Existing `send()` + `listen()` pattern | Already wired; bank sync state flows through `state.account.accountsSyncing` |
| Duplicate notification guard | Custom deduplication | `addNotification` with stable `id` field | Existing slice already deduplicates by ID (line 65 of notificationsSlice.ts) |

**Key insight:** This phase is primarily integration work, not new infrastructure. Every problem already has a solution in the codebase - the task is wiring them together correctly.

## Common Pitfalls

### Pitfall 1: maximum_consent_validity Location Confusion

**What goes wrong:** Attempting to read `maximum_consent_validity` from the session creation response (`POST /sessions` / `exchangeCode()`). This field does NOT exist in the session response.

**Why it happens:** CONTEXT.md says "reads `maximum_consent_validity` per bank, not hardcoded" - this describes the intent, not the API field location.

**How to avoid:**
- `maximum_consent_validity` is in the **ASPSP object** from GET /aspsps, unit: seconds
- The session response returns `access.valid_until` (already stored in `eb_sessions.valid_until` by `/callback`)
- AUTO-02 requires: (1) fix `createAuth()` to use `maximum_consent_validity` as the ceiling when requesting access, and (2) confirm that `/callback` stores the returned `access.valid_until` - it already does

**Warning signs:** Tests that verify `createAuth()` still hardcodes 90 days will catch this.

### Pitfall 2: Scheduler Accessing loot-core IPC from sync-server

**What goes wrong:** The scheduler tries to call `send('accounts-bank-sync')` or import loot-core functions directly from the sync-server context.

**Why it happens:** `loot-core` and the sync-server share the monorepo but run in completely different contexts. loot-core runs in the browser's web worker (or Electron renderer). The sync-server is a standalone Node.js Express process.

**How to avoid:** The scheduler on the sync-server CANNOT call loot-core IPC. It must call the EB API directly (via `enablebanking-service.ts` functions) and write results to `eb_sync_log`. The client polls `/sync-status` to pick up the results. The scheduler does NOT update Actual Budget transactions directly - it updates `eb_sync_log`, and the client fetches transactions when it next connects.

**Alternative (simpler):** The scheduler calls POST /transactions on itself (localhost HTTP call) to reuse the existing route. This avoids duplicating the transaction fetching + logging logic.

**Warning signs:** Any import of loot-core modules in the scheduler file is wrong.

### Pitfall 3: eb_sessions Schema Doesn't Store Consent Expiry Correctly

**What goes wrong:** The `eb_sessions.valid_until` column exists but stores the request-time calculated value (90 days from now) rather than the actual value returned by EB. After the fix to `createAuth()`, it will store the bank-specific maximum. But the schema is shared with the existing test data.

**How to avoid:** Verify that the `/callback` route stores `valid_until` from `exchangeCode()` response, not from the initial `createAuth()` call. Reading the code confirms this is already correct - the `UPDATE eb_sessions SET valid_until = ?` uses the value from `exchangeCode()`. The only bug is that `createAuth()` sends the wrong ceiling (90 days instead of bank-specific), which causes EB to cap the session at the bank's actual maximum anyway. So existing stored `valid_until` values may already be correct (EB adjusts the returned value to the bank's maximum regardless of what was requested).

**Warning signs:** `eb_sessions.valid_until` is NULL for accounts linked before this phase.

### Pitfall 4: Re-auth Breaks Existing Account Links

**What goes wrong:** Re-auth creates a new session but the `/callback` route inserts NEW rows into `eb_account_map` (with `actual_account_id = NULL`), breaking the link between EB accounts and Actual accounts.

**Why it happens:** The existing `/callback` route uses `INSERT OR IGNORE` for `eb_account_map`. If the same EB account UID already exists (from the original link), the INSERT is ignored - which is actually correct behavior. The mapping survives re-auth.

**How to avoid:** After re-auth, update `eb_account_map.session_id` for rows matching the new session's account UIDs. The `actual_account_id` links remain intact. Verify this in the re-auth completion handler.

**Warning signs:** After re-auth, `/sync-status` returns no data for previously linked accounts.

### Pitfall 5: Sync-on-Open Race with CRDT Sync

**What goes wrong:** Bank sync fires before the budget is fully loaded (CRDT sync in progress), causing race conditions in the SQLite database.

**Why it happens:** `FinancesApp.tsx` dispatches both `sync()` (CRDT) and the bank sync check in the same `init` useEffectEvent.

**How to avoid:** Wait for CRDT sync to complete before checking bank sync staleness. Add `await dispatch(sync())` before the bank sync check. The 100ms delay already exists in `FinancesApp.tsx` - the bank sync check should follow after the `await`.

**Warning signs:** SQLite "database is locked" errors in the browser console during app open.

### Pitfall 6: Daily Banner Re-appearance with Wrong Key Format

**What goes wrong:** Banner re-appears on every page navigation, not just daily.

**Why it happens:** If the dismissed state is stored in React state or per-component local state, it resets on unmount/remount (navigation).

**How to avoid:** Use `localStorage` with a date-keyed string: `consent-dismissed-${sessionId}-${new Date().toDateString()}`. Read on every render. `toDateString()` produces a stable daily key (e.g. "Mon Mar 01 2026") that changes at midnight.

### Pitfall 7: Scheduler Running in Development Breaking Sandbox API Rate Limits

**What goes wrong:** Developer runs the server locally, scheduler fires 4x/day hitting the Enable Banking sandbox, which may have rate limits.

**Why it happens:** `ENABLE_AUTO_SYNC=true` is set in a dev `.env` for testing.

**How to avoid:** The `ENABLE_AUTO_SYNC` env var is off by default (CONTEXT.md decision). Document clearly in code and in any env file template that this should be false in development.

## Code Examples

### Scheduler Entry Point in app.ts

```typescript
// Source: existing app.ts pattern, adapted for scheduler
import { startScheduler } from './scheduler.js';

export async function run() {
  // ... existing server startup code ...

  app.listen(port, hostname, () => {
    sendServerStartedMessage();
  });

  // Start scheduler after server is listening
  startScheduler();
}
```

### Consent Expiry Check in FinancesApp.tsx

```typescript
// Source: existing FinancesApp.tsx init pattern
// File: packages/desktop-client/src/components/FinancesApp.tsx
import { send } from 'loot-core/platform/client/connection';

const [staleThresholdHours] = useLocalPref('bankSyncStaleThresholdHours');
const effectiveThreshold = staleThresholdHours ?? 6;

const init = useEffectEvent(() => {
  setTimeout(async () => {
    await dispatch(sync()); // existing CRDT sync

    // Bank sync-on-open check
    const accounts = await send('accounts-get');
    const linkedAccounts = accounts?.filter(a => a.account_sync_source && a.account_id) ?? [];
    const staleThresholdMs = effectiveThreshold * 60 * 60 * 1000;
    const now = Date.now();
    const hasStale = linkedAccounts.some(a => {
      const lastSync = a.last_sync ? parseInt(a.last_sync, 10) : 0;
      return (now - lastSync) > staleThresholdMs;
    });

    if (hasStale) {
      // Fire and forget - BankSyncStatus indicator shows progress
      send('accounts-bank-sync', { ids: [] }).catch(err => {
        dispatch(addNotification({
          notification: {
            id: 'sync-on-open-failed',
            type: 'warning',
            message: 'Sync failed - check your connection',
          },
        }));
      });
    }
  }, 100);
});
```

### ConsentExpiryBanner Placement

```typescript
// Source: FinancesApp.tsx - placed between Notifications and BankSyncStatus
// File: packages/desktop-client/src/components/FinancesApp.tsx
<Notifications />
<ConsentExpiryBanner />  {/* NEW */}
<BankSyncStatus />
```

### Extended /sync-status Response Shape

```typescript
// New response shape (extend existing type in useEnableBankingStatus.ts)
type SyncStatusEntry = {
  synced_at: string | null;
  status: string;
  error_message: string | null;
  consent_valid_until: string | null; // NEW: ISO date from eb_sessions.valid_until
};
```

### Consent Urgency Calculation

```typescript
// Source: derived from date-fns usage in AccountRow.tsx
import { differenceInDays } from 'date-fns';

function getConsentUrgency(validUntil: string | null): 'expired' | 'urgent' | 'soon' | 'ok' {
  if (!validUntil) return 'ok';
  const daysRemaining = differenceInDays(new Date(validUntil), new Date());
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining < 7) return 'urgent';
  if (daysRemaining < 14) return 'soon';
  return 'ok';
}

const urgencyColors = {
  expired: theme.errorText,    // red
  urgent: theme.warningText,   // orange
  soon: theme.noticeText,      // yellow
  ok: theme.tableText,         // default
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-cron v2/v3 (`scheduled: true` option, `start()` needed) | node-cron v4 (tasks start immediately, `createTask` for stopped) | v4.0.0 release | v4 is TypeScript-native; old tutorials with `scheduled: false` or `task.start()` patterns are outdated |
| GoCardless 90-day consent (hardcoded) | EB `maximum_consent_validity` per ASPSP | Phase 3 fix | Each bank specifies its own validity; EU banks up to 180 days, UK 90 days |
| Manual bank sync only | Automated 4x/day + sync-on-open | Phase 3 | Core value proposition of the project |

**Deprecated/outdated:**
- `cron.validate(expression)`: exists in v4 but rarely needed - bad expressions throw at schedule time
- `node-cron` options `runOnInit`, `scheduled`: removed in v4

## Open Questions

1. **Does the Enable Banking sandbox support GET /aspsps with `maximum_consent_validity` for Mock ASPSP?**
   - What we know: The field exists in the ASPSP schema per official docs. Sandbox may return `null` or a test value.
   - What's unclear: Whether the sandbox Mock ASPSP entry has a real `maximum_consent_validity` value.
   - Recommendation: Write the code to handle `null` gracefully (fall back to 180 days). Do not block the fix on sandbox behavior.

2. **Does the Actual Budget `accounts` table have a field accessible client-side for `last_sync` that covers all bank sync providers, not just EB?**
   - What we know: `AccountEntity.last_sync` exists (used in `AccountRow.tsx`). The field is in the account model.
   - What's unclear: Whether `last_sync` is updated by GoCardless/SimpleFin sync (not just EB). If not, the "sync all providers" sync-on-open check may show false positives.
   - Recommendation: Check if `last_sync` is updated by `handleSyncResponse` for all providers, not just EB. If it is, the check works universally.

3. **Does window/tab focus event need a separate handler or can it reuse the visibilitychange handler?**
   - What we know: `App.tsx` already listens to `visibilitychange` for `dispatch(sync())`. CONTEXT.md says "also trigger on window/tab focus".
   - What's unclear: `visibilitychange` fires when tab becomes visible (which covers focus from another app). A separate `window.focus` event would cover switching tabs within the same browser window.
   - Recommendation: Add `window.addEventListener('focus', onBankSyncCheck)` alongside the existing `visibilitychange` listener in `App.tsx`. Use the same stale-threshold check.

4. **Re-auth: How to identify which session to renew from the consent banner?**
   - What we know: Each consent banner entry corresponds to one `eb_sessions` row (one bank session). The session has a `session_id`.
   - What's unclear: The client-side consent data comes via `/sync-status` which is keyed by `actual_account_id`. Multiple accounts can share a session. Need to derive the `session_id` from the account ID.
   - Recommendation: Extend the `/sync-status` response to include `session_id` in each entry, or create a dedicated `/consent-status` endpoint that returns `{ sessions: [{ session_id, aspsp_name, valid_until }] }` keyed by session.

## Sources

### Primary (HIGH confidence)
- Enable Banking API Reference ([https://enablebanking.com/docs/api/reference/](https://enablebanking.com/docs/api/reference/)) - ASPSP schema, `maximum_consent_validity` field location, session response `access.valid_until`
- Codebase reads (direct file inspection):
  - `packages/sync-server/src/app-enablebanking/app-enablebanking.ts` - all existing routes
  - `packages/sync-server/src/app-enablebanking/enablebanking-service.ts` - `createAuth()` hardcoded 90 days bug
  - `packages/sync-server/src/app-enablebanking/migrations.js` - `eb_sessions.valid_until` schema
  - `packages/desktop-client/src/components/App.tsx` - `visibilitychange` hook point
  - `packages/desktop-client/src/components/FinancesApp.tsx` - `init` hook, bank-sync route `/bank-sync`
  - `packages/desktop-client/src/components/BankSyncStatus.tsx` - `@react-spring/web` animation pattern
  - `packages/desktop-client/src/notifications/notificationsSlice.ts` - `addNotification`, `id` dedup
  - `packages/desktop-client/src/components/banksync/AccountRow.tsx` - existing last-sync display
  - `packages/loot-core/src/server/accounts/app.ts` - `accountsBankSync`, existing IPC handlers
  - `packages/loot-core/src/server/accounts/sync.ts` - `downloadEnableBankingTransactions` pattern

### Secondary (MEDIUM confidence)
- node-cron v4 npm page and GitHub README - API shape, options, v4 behavior changes
- WebSearch "node-cron 4.x API schedule options TypeScript 2025" - confirmed `noOverlap`, `timezone` options

### Tertiary (LOW confidence)
- Enable Banking sandbox behavior with `maximum_consent_validity` for Mock ASPSP (unverified - sandbox may differ from production)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - node-cron 4.2.1 already in STATE.md, version confirmed against npm registry; no new packages needed
- Architecture: HIGH - hook points in existing code verified by direct file reads; patterns follow existing code style
- Pitfalls: HIGH - identified from direct code reading (hardcoded 90 days in createAuth, scheduler cannot use loot-core IPC, re-auth INSERT OR IGNORE behavior); one MEDIUM (sandbox `maximum_consent_validity` behavior)
- Enable Banking API: MEDIUM - `maximum_consent_validity` in ASPSP object confirmed via official docs fetch; session response `access.valid_until` confirmed; sandbox behavior unverified

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable stack, no fast-moving dependencies introduced)
