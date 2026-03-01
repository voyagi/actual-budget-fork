---
phase: 03-automation-consent-lifecycle
verified: 2026-03-01T00:00:00Z
status: passed
score: 6/6 must-haves verified
re_verification: false
human_verification:
  - test: "Cron fires and syncs transactions 4x/day"
    expected: "Sync timestamps in eb_sync_log show entries at 00:00, 06:00, 12:00, 18:00 UTC"
    why_human: "Requires live server with ENABLE_AUTO_SYNC=true running for 24 hours"
  - test: "App syncs on open after 6+ hours"
    expected: "Opening the app after inactivity triggers accounts-bank-sync within seconds, before manual action"
    why_human: "Requires real session with stale last_sync value; behavior is timing-dependent"
  - test: "Consent banner appears when consent is within 14 days"
    expected: "Yellow banner appears for 7-14 days, orange for under 7 days, red for expired"
    why_human: "Requires live EB session with a near-expiry valid_until date in the DB"
  - test: "Re-authorize button completes OAuth flow and updates session links"
    expected: "User clicks re-auth, completes bank OAuth redirect, sync resumes without data loss or re-linking accounts"
    why_human: "Requires browser redirect to real/sandbox bank and round-trip OAuth callback"
---

# Phase 3: Automation and Consent Lifecycle Verification Report

**Phase Goal:** Transactions sync automatically four times per day without user action, consent expiry is tracked per-bank from the session response, and users are notified in-app before consent expires so they can re-authorize before sync breaks.

**Verified:** 2026-03-01
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| #  | Truth                                                                                           | Status     | Evidence                                                                                              |
|----|--------------------------------------------------------------------------------------------------|------------|-------------------------------------------------------------------------------------------------------|
| 1  | Transactions sync automatically without user action (cron fires 4x/day when ENABLE_AUTO_SYNC=true) | VERIFIED | `scheduler.ts` exports `startScheduler()`, gates on `ENABLE_AUTO_SYNC !== 'true'`, schedules `cron.schedule('0 0,6,12,18 * * *', ...)`. `app.ts` calls `startScheduler()` after listen block at line 218. |
| 2  | Banks with expired consent are skipped during automatic sync without blocking other banks          | VERIFIED | `scheduler.ts` lines 96-101: `if (validUntil && new Date(validUntil) < new Date()) { ... continue; }` per session group. One session's failure does not affect others due to session-grouped Map loop. |
| 3  | Each bank gets its correct maximum consent duration from the EB API (no hardcoded cap)            | VERIFIED | `enablebanking-service.ts` lines 102-111: calls `getAspsps(aspspCountry)`, reads `maximum_consent_validity`, falls back to 180 days. Old `90 * 24 * 60 * 60 * 1000` removed. `console.warn` on ASPSP name mismatch. |
| 4  | A graduated color banner appears when any bank consent is within 14 days of expiry               | VERIFIED | `ConsentExpiryBanner.tsx` (289 lines): renders red/orange/yellow banners via `useConsentExpiry()`. Placed in `FinancesApp.tsx` between `<Notifications />` and `<BankSyncStatus />` at line 388. |
| 5  | Banner is dismissible and re-appears daily until consent is renewed                               | VERIFIED | `ConsentExpiryBanner.tsx` lines 24-32: localStorage key `consent-dismissed-{sessionId}-{new Date().toDateString()}`. Daily reset via `toDateString()`. `forceUpdate` reducer triggers re-render on dismiss. |
| 6  | App triggers background sync on open and on focus/visibility when last sync exceeds threshold    | VERIFIED | `FinancesApp.tsx` lines 120-177 (init/sync-on-open) and lines 212-263 (visibility/focus useEffect). Both filter expired-consent accounts and call `send('accounts-bank-sync', { ids: staleIds })` fire-and-forget. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/sync-server/src/scheduler.ts` | Cron scheduler with 6-hour interval, retry logic, expired-consent skip | VERIFIED | 178 lines. Exports `startScheduler()`. Contains cron `'0 0,6,12,18 * * *'`, session-grouped loop, consent expiry check per session, `RateLimitError` break, `SessionExpiredError` break, transient retry logic with `eb_sync_log` write. |
| `packages/sync-server/src/app-enablebanking/enablebanking-service.ts` | Fixed createAuth with maximum_consent_validity lookup | VERIFIED | Lines 102-111 call `getAspsps()`, read `maximum_consent_validity`, no hardcoded 90-day value. Pattern confirmed via grep. |
| `packages/sync-server/src/app-enablebanking/app-enablebanking.ts` | Extended /sync-status with consent_valid_until, session_id, aspsp_name, aspsp_country | VERIFIED | Lines 350-382 join `eb_account_map` + `eb_sessions`, return `consent_valid_until`, `session_id`, `aspsp_name`, `aspsp_country` per account. Null-guarded `defaultEntry` for never-synced accounts. Converts `synced_at` epoch to ISO string. `/reauth-complete` route at lines 392-410. |
| `packages/sync-server/src/app.ts` | Imports and calls startScheduler() | VERIFIED | Line 12: `import { startScheduler } from './scheduler.js'`. Line 218: `startScheduler()` called at end of `run()` after listen block. |
| `packages/desktop-client/src/components/ConsentExpiryBanner.tsx` | Graduated consent expiry banner with dismiss and re-auth button | VERIFIED | 289 lines. `SessionBanner` (single) and `MultiSessionBanner` (multiple sessions) rendered from `useConsentExpiry()`. Graduated colors: `errorText/errorBackground` (expired), `warningText/warningBackground` (<7d), `noticeText/noticeBackground` (<14d). `pushModal` with re-auth options dispatched on button click. localStorage dismiss with daily key. |
| `packages/desktop-client/src/components/FinancesApp.tsx` | ConsentExpiryBanner, sync-on-open in init, visibility/focus handler | VERIFIED | Line 388: `<ConsentExpiryBanner />`. Lines 120-177: sync-on-open in `init()` with expired-consent filter. Lines 212-263: `useEffect` for `visibilitychange`+`focus` with `isSyncingRef` mutex. |
| `packages/loot-core/src/types/prefs.ts` | bankSyncStaleThresholdHours in LocalPrefs type | VERIFIED | Line 89: `bankSyncStaleThresholdHours: number;` present in `LocalPrefs` type. |
| `packages/desktop-client/src/modals/modalsSlice.ts` | Options field on enablebanking-external-msg Modal union | VERIFIED | Lines 128-136: `enablebanking-external-msg` union member has optional `options?: { sessionId?, aspspName?, aspspCountry?, reauth? }`. |
| `packages/desktop-client/src/components/Modals.tsx` | Spreads modal.options to EnableBankingExternalMsgModal | VERIFIED | Line 188: `<EnableBankingExternalMsgModal key={key} {...modal.options} />`. |
| `packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx` | Re-auth props, pre-filled bank, reauth-complete call on success | VERIFIED | Lines 106-198: accepts `EnableBankingExternalMsgModalProps`, initializes `selectedBankId` and `country` from props in re-auth mode, guards for empty accounts, calls `send('enablebanking-reauth-complete', ...)`, triggers `accounts-bank-sync` after re-auth. |
| `packages/loot-core/src/server/accounts/app.ts` | enablebanking-reauth-complete handler registered | VERIFIED | Line 93: typed in `AccountHandlers`. Line 591: `app.method('enablebanking-reauth-complete', enableBankingReauthComplete)`. |
| `packages/loot-core/src/server/accounts/provider-status.ts` | enableBankingReauthComplete function | VERIFIED | Lines 441-464: `enableBankingReauthComplete({ newSessionId, oldSessionId })` calls POST `/reauth-complete` with user token. |
| `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` | SyncStatusEntry type with new fields, useConsentExpiry hook | VERIFIED | Lines 45-56: `SyncStatusEntry` includes `consent_valid_until`, `session_id`, `aspsp_name`, `aspsp_country`. Lines 137-206: `useConsentExpiry()` hook fetches accounts, filters EB-linked, groups by session, calculates urgency, returns sorted `sessions` array and `worstUrgency`. |
| `packages/desktop-client/src/components/banksync/AccountRow.tsx` | Consent expiry date with urgency coloring and re-auth button | VERIFIED | Lines 29-46: `getConsentUrgencyColor()` helper. Lines 70-81: `consentValidUntil` from `ebStatus`, expiry date rendered with urgency color. Lines 83-90: `handleReauth()` dispatches re-auth modal. Line 192: `onClick={handleReauth}`. Line 203: "Re-authorize" button text. |
| `packages/sync-server/package.json` | node-cron 4.2.1 in dependencies | VERIFIED | Line 48: `"node-cron": "4.2.1"` in dependencies. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app.ts` | `scheduler.ts` | `import { startScheduler }` + `startScheduler()` after listen | WIRED | Import at line 12, call at line 218 of `run()`. |
| `scheduler.ts` | `enablebanking-service.ts` | `getTransactions`, `getBalances` direct calls in `syncOneAccount()` | WIRED | Lines 36-40 in `scheduler.ts` call `getTransactions` and `getBalances` directly (no internal HTTP). |
| `enablebanking-service.ts` | EB API `/aspsps` | `createAuth()` calls `getAspsps(aspspCountry)` reads `maximum_consent_validity` | WIRED | Lines 102-110: `getAspsps()` wrapped call, `.aspsps` access, `maximum_consent_validity` read. |
| `ConsentExpiryBanner.tsx` | `useEnableBankingStatus.ts` | `useConsentExpiry()` provides session-grouped consent data | WIRED | Line 9-10: imports `useConsentExpiry`, `ConsentSession`. Line 270: `const { sessions } = useConsentExpiry()`. |
| `ConsentExpiryBanner.tsx` | `modalsSlice.ts` | `pushModal` with `enablebanking-external-msg` + re-auth options | WIRED | Lines 70-82 in `SessionBanner.handleReauth()`: dispatches `pushModal` with `name: 'enablebanking-external-msg'` and re-auth options. |
| `FinancesApp.tsx` | `accounts-bank-sync` IPC | `send('accounts-bank-sync', { ids: staleIds })` in init and visibility handler | WIRED | Line 163 (init) and line 248 (visibility handler): fire-and-forget `send('accounts-bank-sync', { ids: staleIds })`. |
| `EnableBankingExternalMsgModal.tsx` | `enablebanking-reauth-complete` IPC | `send('enablebanking-reauth-complete', ...)` after OAuth completes in re-auth mode | WIRED | Line 173: `await send('enablebanking-reauth-complete', { newSessionId, oldSessionId: sessionId })`. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| AUTO-01 | 03-01 | Transactions sync automatically 4x/day (node-cron scheduler) | SATISFIED | `scheduler.ts` exports `startScheduler()` with `cron.schedule('0 0,6,12,18 * * *', ...)`. Gated on `ENABLE_AUTO_SYNC=true`. Wired to `app.ts`. |
| AUTO-02 | 03-01 | Consent expiry date reads `maximum_consent_validity` per bank (not hardcoded) | SATISFIED | `enablebanking-service.ts` `createAuth()` calls `getAspsps()`, reads `aspsp.maximum_consent_validity`. No hardcoded 90-day value. Falls back to 180 days with `console.warn`. |
| AUTO-03 | 03-02 | In-app banner when PSD2 consent within 14 days of expiry | SATISFIED | `ConsentExpiryBanner.tsx` with graduated colors (yellow=14-7d, orange=<7d, red=expired). Placed in `FinancesApp.tsx`. `useConsentExpiry()` hook groups by session. |
| AUTO-04 | 03-02 | User can re-authorize bank access through consent renewal flow | SATISFIED | Re-auth button dispatches modal with props. `EnableBankingExternalMsgModal` re-auth mode pre-fills bank, calls `enablebanking-reauth-complete`, triggers immediate sync. `/reauth-complete` server route swaps session IDs in `eb_account_map`. |
| AUTO-05 | 03-02 | App triggers sync on open if last sync was more than 6 hours ago | SATISFIED | `FinancesApp.tsx` `init()` fires after CRDT sync: fetches accounts, checks consent status, filters expired, calls `accounts-bank-sync` for stale IDs. Configurable via `bankSyncStaleThresholdHours` local pref (default 6h). Also fires on `visibilitychange` and `focus` events. |
| AUTO-06 | 03-01 | Per-account last-synced timestamp visible in account view | SATISFIED | `/sync-status` returns `synced_at` (ISO string), `consent_valid_until`, `session_id`, `aspsp_name`, `aspsp_country`. `AccountRow.tsx` uses `useEnableBankingSyncStatus` to show consent expiry with urgency color and re-auth button. `SyncStatusEntry` type includes all new fields. |

All 6 required requirements (AUTO-01 through AUTO-06) are satisfied. No orphaned requirements found - REQUIREMENTS.md traceability table maps all six to Phase 3, all marked complete.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `ConsentExpiryBanner.tsx` | 277 | `return null` | Info | Legitimate conditional early return when no sessions need attention (zero non-dismissed sessions). Not a stub. |

No blocker or warning anti-patterns found. All placeholder/TODO patterns were searched across the modified files and returned no matches.

### Human Verification Required

#### 1. 4x/day automatic sync fires on schedule

**Test:** Run the sync-server with `ENABLE_AUTO_SYNC=true` and at least one EB-linked account. Wait across a 24-hour period and inspect `eb_sync_log.synced_at` values.
**Expected:** Entries appear at approximately 00:00, 06:00, 12:00, and 18:00 UTC (within a few seconds). Log shows `[scheduler] Sync run complete.` messages.
**Why human:** Requires a live server running for up to 24 hours. Cannot be verified programmatically without running the process.

#### 2. Sync-on-open fires after 6+ hours of inactivity

**Test:** Open the app after the last bank sync was 6+ hours ago (verify via `last_sync` on an account). Check that a new entry appears in `eb_sync_log` within seconds of opening the app.
**Expected:** A new `eb_sync_log` entry is inserted with `status='ok'` for the stale account ID within ~5 seconds of app load.
**Why human:** Requires a real EB session with a stale `last_sync` timestamp. Cannot fake timing-dependent behavior without running the app.

#### 3. Consent expiry banner appears with correct graduated colors

**Test:** Manually insert a row into `eb_sessions` with a `valid_until` date 5 days from now. Open the app.
**Expected:** An orange banner (`warningBackground`) appears at the top of the app with the bank name and expiry date. Clicking the X dismisses it for the day.
**Why human:** Requires DB manipulation and visual verification of rendered CSS colors and layout.

#### 4. Re-authorize button completes OAuth flow and resumes sync

**Test:** Click the "Re-authorize" button on an expiring/expired consent banner. Complete the OAuth flow at the sandbox bank. Verify sync resumes.
**Expected:** After OAuth callback, `eb_account_map.session_id` is updated to the new session ID. A new sync entry appears in `eb_sync_log`. Previously linked accounts are NOT re-linked (they retain their Actual account mapping).
**Why human:** Requires browser redirect to a real/sandbox bank. Cannot simulate OAuth callback programmatically.

## Gaps Summary

No gaps found. All 6/6 observable truths are verified against the actual codebase. All 14 required artifacts exist, are substantive (not stubs), and are correctly wired. All 7 key links are confirmed wired. All 6 requirement IDs are satisfied with implementation evidence.

The phase goal - "Transactions sync automatically four times per day without user action, consent expiry is tracked per-bank from the session response, and users are notified in-app before consent expires so they can re-authorize before sync breaks" - is fully achieved in code. Four human verification items remain for runtime/visual confirmation, but all underlying implementation is present and correct.

---

_Verified: 2026-03-01_
_Verifier: Claude (gsd-verifier)_
