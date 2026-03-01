---
phase: 03-automation-consent-lifecycle
plan: 02
subsystem: desktop-client
tags: [consent-banner, sync-on-open, re-auth, enable-banking, ux]
dependency_graph:
  requires:
    - 03-01-SUMMARY.md
  provides:
    - ConsentExpiryBanner.tsx with graduated urgency colors and dismiss-per-day
    - useConsentExpiry() hook for session-grouped consent expiry data
    - sync-on-open in FinancesApp.tsx init() with stale threshold and expired-consent filtering
    - visibility/focus bank sync handler in FinancesApp.tsx with useRef mutex
    - /reauth-complete server route for session swap after OAuth re-auth
    - enablebanking-reauth-complete IPC handler
    - EnableBankingExternalMsgModal re-auth mode (pre-filled bank, post-reauth sync)
    - aspsp_country in /sync-status response (Plan 01 amendment)
  affects:
    - packages/desktop-client/src/components/ConsentExpiryBanner.tsx
    - packages/desktop-client/src/components/FinancesApp.tsx
    - packages/desktop-client/src/hooks/useEnableBankingStatus.ts
    - packages/desktop-client/src/components/banksync/AccountRow.tsx
    - packages/desktop-client/src/modals/modalsSlice.ts
    - packages/desktop-client/src/components/Modals.tsx
    - packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx
    - packages/loot-core/src/types/prefs.ts
    - packages/loot-core/src/server/accounts/app.ts
    - packages/loot-core/src/server/accounts/provider-status.ts
    - packages/sync-server/src/app-enablebanking/app-enablebanking.ts
    - packages/sync-server/src/app-enablebanking/app-enablebanking.test.js
tech_stack:
  added: []
  patterns:
    - useConsentExpiry() self-contained hook pattern (fetches own data, groups by session_id)
    - useRef mutex for visibility/focus sync handler (survives effect re-creation on dep change)
    - Re-auth mode via optional Modal union options field (backward-compatible)
    - Dismiss-per-day via localStorage key scoped by sessionId + Date.toDateString()
key_files:
  created:
    - packages/desktop-client/src/components/ConsentExpiryBanner.tsx
  modified:
    - packages/desktop-client/src/components/FinancesApp.tsx
    - packages/desktop-client/src/hooks/useEnableBankingStatus.ts
    - packages/desktop-client/src/components/banksync/AccountRow.tsx
    - packages/desktop-client/src/modals/modalsSlice.ts
    - packages/desktop-client/src/components/Modals.tsx
    - packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx
    - packages/loot-core/src/types/prefs.ts
    - packages/loot-core/src/server/accounts/app.ts
    - packages/loot-core/src/server/accounts/provider-status.ts
    - packages/sync-server/src/app-enablebanking/app-enablebanking.ts
    - packages/sync-server/src/app-enablebanking/app-enablebanking.test.js
decisions:
  - "useConsentExpiry() hook encapsulates all data fetching and grouping; banner is a pure render component"
  - "useRef mutex for isSyncing in FinancesApp visibility/focus handler (not closure-scoped let - survives effect re-creation when staleThresholdHours changes)"
  - "Re-auth modal pre-fills country and bank from props to bypass picker and prevent silent onJump() abort"
  - "aspsp_country added as Plan 01 amendment to /sync-status (trivial JOIN column addition, no schema change needed)"
  - "i18next Trans interpolation syntax {{ var }} avoided in TypeScript strict mode - use JSX string concatenation instead"
  - "4 new tests added for /reauth-complete and aspsp_country in /sync-status"
metrics:
  duration: 65min
  completed: "2026-03-01"
  tasks: 2
  files_changed: 12
---

# Phase 03 Plan 02: Consent Expiry Banner, Re-auth Flow, and Sync-on-Open Summary

**One-liner:** Graduated consent expiry banner with dismiss-per-day, OAuth re-authorization modal flow with session swap, and configurable sync-on-open with expired-consent filtering in FinancesApp.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | ConsentExpiryBanner, sync-on-open, consent expiry types | 0bdaba417 | ConsentExpiryBanner.tsx, FinancesApp.tsx, useEnableBankingStatus.ts, AccountRow.tsx, prefs.ts, modalsSlice.ts, Modals.tsx |
| 2 | Re-auth server support and Plan 01 aspsp_country prerequisite | 6437756d6 | app-enablebanking.ts, app-enablebanking.test.js, provider-status.ts, app.ts, EnableBankingExternalMsgModal.tsx |

## What Was Built

### Task 1: ConsentExpiryBanner and Sync-on-Open

**ConsentExpiryBanner.tsx** - New self-contained component:
- Calls `useConsentExpiry()` (no props needed) for session-grouped urgency data
- Renders SessionBanner (single) or MultiSessionBanner (multiple) based on visible session count
- Graduated colors: red (`theme.errorText/errorBackground`) = expired, orange (`warningText/warningBackground`) = <7 days, yellow (`noticeText/noticeBackground`) = <14 days
- Dismissible per session per day via localStorage key `consent-dismissed-{sessionId}-{date}` - daily reset from Date.toDateString()
- Re-authorize button dispatches `pushModal` with `enablebanking-external-msg` and re-auth options (sessionId, aspspName, aspspCountry, reauth: true)
- Multi-session banner shows count + expired count, links to /bank-sync page

**useConsentExpiry() hook** in `useEnableBankingStatus.ts`:
- Fetches accounts via `accountQueries.list()`, filters to `account_sync_source === 'enableBanking'`
- Groups by session_id, calculates urgency per session (expired/urgent/soon/ok)
- Returns sorted sessions array (worst urgency first) - 'ok' sessions excluded
- Returns `{ sessions, worstUrgency }`

**SyncStatusEntry type extension:** Added `aspsp_country: string | null` field

**prefs.ts:** Added `bankSyncStaleThresholdHours: number` to LocalPrefs type

**modalsSlice.ts:** Extended `enablebanking-external-msg` union member with optional `options` field (`sessionId`, `aspspName`, `aspspCountry`, `reauth`)

**Modals.tsx:** Changed `<EnableBankingExternalMsgModal key={key} />` to spread `{...modal.options}` as props

**FinancesApp.tsx changes:**
- Added `send` import from `loot-core/platform/client/connection`
- Added `[staleThresholdHours] = useLocalPref('bankSyncStaleThresholdHours')` at component level
- Added `isSyncingRef = useRef(false)` at component level (persists across effect re-creations)
- Added sync-on-open in `init()` after `await dispatch(sync())`: fetches accounts, gets EB sync statuses in one call, filters expired-consent accounts, fires `accounts-bank-sync` for stale IDs only
- Added `useEffect` for visibility/focus bank sync (same filtering logic, non-blocking, `isSyncingRef` mutex)
- Placed `<ConsentExpiryBanner />` between `<Notifications />` and `<BankSyncStatus />`

**AccountRow.tsx changes:**
- Added `getConsentUrgencyColor()` helper for urgency-based coloring
- Added `handleReauth()` to dispatch re-auth modal
- Shows consent expiry date with urgency color and inline "Re-authorize" button when consent is expiring/expired

### Task 2: Re-auth Server Support

**app-enablebanking.ts:**
- Extended `/sync-status` SELECT to include `aspsp_country` from eb_sessions - adds it to each status entry response
- Added POST `/reauth-complete` route (after validateSessionMiddleware): validates params, does `UPDATE eb_account_map SET session_id = ? WHERE session_id = ?`, logs the swap

**provider-status.ts:** Added `enableBankingReauthComplete()` function calling POST `/reauth-complete`

**loot-core app.ts:** Added `enablebanking-reauth-complete` to `AccountHandlers` type, imported `enableBankingReauthComplete`, registered handler

**EnableBankingExternalMsgModal.tsx:**
- Added `EnableBankingExternalMsgModalProps` type (sessionId, aspspName, aspspCountry, reauth)
- Updated signature to accept props with defaults
- In re-auth mode: initializes `country = aspspCountry`, `selectedBankId = aspspName` to bypass picker and prevent silent abort
- After OAuth completes in re-auth mode: guards for empty accounts, extracts `accounts[0].session_id`, calls `enablebanking-reauth-complete`, triggers `accounts-bank-sync` for immediate sync
- Shows "Try again" button on error (per CONTEXT.md requirement)
- Different title ("Re-authorize Bank") and success message in re-auth mode
- Normal flow unchanged (backward compatible)

**app-enablebanking.test.js:** Added 4 new tests:
- `/reauth-complete` swaps session_id for multiple accounts
- `/reauth-complete` returns INVALID_INPUT when newSessionId missing
- `/reauth-complete` returns INVALID_INPUT when oldSessionId missing
- `/sync-status` returns aspsp_country alongside aspsp_name and consent_valid_until

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript strict-mode error: i18next {{ var }} interpolation in Trans components**
- **Found during:** TypeScript typecheck (first run)
- **Issue:** `Trans` component with `{{ bankName }}` interpolation produces TS2353 errors in strict mode - the `{{ }}` syntax is i18next string interpolation not valid as JSX prop expressions in typed components
- **Fix:** Replaced `{{ variable }}` interpolation inside Trans with JSX string concatenation (`<strong>{bankName}</strong>{' '}<Trans>bank connection expires</Trans>`)
- **Files modified:** packages/desktop-client/src/components/ConsentExpiryBanner.tsx
- **Commit:** Included in 0bdaba417

## Requirements Satisfied

- AUTO-03: Consent expiry banner with graduated urgency colors (red/orange/yellow), dismissible per day per session
- AUTO-04: Re-auth flow via existing OAuth modal, session swap via /reauth-complete, immediate sync after re-auth
- AUTO-05: App syncs on open when last sync exceeds threshold (default 6 hours, configurable via bankSyncStaleThresholdHours), skips expired-consent accounts; also triggers on visibility/focus

## Self-Check: PASSED

- ConsentExpiryBanner.tsx exists at packages/desktop-client/src/components/ConsentExpiryBanner.tsx: FOUND
- FinancesApp.tsx contains ConsentExpiryBanner: FOUND (2 occurrences - import + JSX)
- modalsSlice.ts has options field on enablebanking-external-msg: FOUND
- Modals.tsx spreads modal.options: FOUND
- prefs.ts has bankSyncStaleThresholdHours: FOUND
- app-enablebanking.ts has /reauth-complete route: FOUND
- app-enablebanking.ts returns aspsp_country in /sync-status: FOUND (3 occurrences)
- EnableBankingExternalMsgModal.tsx has reauth prop handling: FOUND (10 occurrences)
- provider-status.ts has enableBankingReauthComplete: FOUND
- app.ts registers enablebanking-reauth-complete handler: FOUND
- TypeScript compiles with no errors: VERIFIED (tsc --noEmit)
- oxfmt formatting check on all modified files: PASSED
- 486 sync-server tests pass (up from 482 - 4 new tests): VERIFIED
- 503 loot-core tests pass: VERIFIED
- Pre-push hook (typecheck + test): PASSED on push to chore/state-update
- Commits 0bdaba417, 6437756d6: VERIFIED
