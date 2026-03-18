---
phase: 06-design-refinement
verified: 2026-03-18T12:00:00Z
status: passed
score: 13/13 must-haves verified
re_verification: false
gaps: []
human_verification:
  - test: "Consent expiry notification appears in the Notifications stack bottom-right"
    expected: "When a bank session is expiring, a sticky warning notification appears at bottom-right with a Re-authorize button, not a banner at a different location"
    why_human: "Requires an active Enable Banking session near expiry to trigger the notification path; cannot verify visual rendering programmatically"
  - test: "Sync-in-progress notification removes itself when sync completes"
    expected: "During bank sync, a 'Syncing... N accounts remaining' sticky notification appears; when sync finishes, it disappears automatically with no orphan notification left"
    why_human: "Requires triggering a real bank sync to observe the add/remove lifecycle in a running browser"
---

# Phase 6: Design Refinement Verification Report

**Phase Goal:** Consolidate alert surfaces into unified notification system, flatten scheduler retry nesting, add exponential backoff for scheduler retry.
**Verified:** 2026-03-18
**Status:** PASSED
**Re-verification:** No - initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Consent expiry warnings appear as sticky notifications in the bottom-right Notifications stack | VERIFIED | `useConsentExpiryNotifications()` dispatches `addNotification({ notification: { type: 'warning', sticky: true, id: 'consent-expiry-...' } })` in useEnableBankingStatus.ts lines 286-321 |
| 2 | Sync-in-progress status appears as a transient notification in the bottom-right Notifications stack | VERIFIED | `useBankSyncNotification()` dispatches `addNotification({ notification: { id: 'bank-sync-in-progress', type: 'message', sticky: true } })` in useEnableBankingStatus.ts lines 383-392 |
| 3 | Daily-dismiss behavior is preserved for consent warnings via localStorage | VERIFIED | `isDismissed()` and `dismiss()` helper functions present at lines 226-234; `isDismissed` check at line 277, `onClose: () => dismiss(session.sessionId)` at lines 316-318 |
| 4 | Multi-session consent expiry shows a single aggregated notification when sessions > 1 | VERIFIED | `else` branch at line 322 dispatches single notification with `id: 'consent-expiry-multi'` for `visibleSessions.length > 1` |
| 5 | Sync-status notification is removed when sync completes (not left orphaned) | VERIFIED | `wasActive.current` ref guards the remove path; `dispatch(removeNotification({ id: 'bank-sync-in-progress' }))` fired at line 395 when `accountsSyncing.length === 0 && wasActive.current === true` |
| 6 | ConsentExpiryBanner and BankSyncStatus standalone components are no longer rendered in FinancesApp | VERIFIED | No `<ConsentExpiryBanner` or `<BankSyncStatus` JSX in FinancesApp.tsx; no imports of those components; both files confirmed deleted (Glob returns no results) |
| 7 | syncAccountWithRetry retries up to 3 times with exponential delays of ~5s, ~10s, ~20s | VERIFIED | `DEFAULT_RETRY_POLICY = { maxRetries: 3, initialDelay: 5000, multiplier: 2, maxDelay: 60000, jitterFraction: 0.2 }`; loop at scheduler.ts line 87: `for (let attempt = 0; attempt <= policy.maxRetries; attempt++)` |
| 8 | Each retry delay has +/-20% jitter applied | VERIFIED | `applyJitter(cappedDelay, policy.jitterFraction)` at scheduler.ts line 102; `jitterFraction: 0.2` in default policy |
| 9 | RateLimitError propagates immediately without any sleep or retry | VERIFIED | `if (err instanceof RateLimitError || err instanceof SessionExpiredError) { throw err; }` at scheduler.ts line 93-95, before any sleep call |
| 10 | SessionExpiredError propagates immediately without any sleep or retry | VERIFIED | Same guard at line 93-95 covers both error types |
| 11 | After all retries exhausted, the error propagates to the caller for eb_sync_log write | VERIFIED | `if (attempt === policy.maxRetries) { throw err; }` at lines 96-98; outer catch in runScheduledSync writes to `eb_sync_log` at lines 192-203 |
| 12 | Each retry attempt is logged with attempt number and delay | VERIFIED | `console.log('[scheduler] Retry ${attempt + 1}/${policy.maxRetries} for ${accountLabel} in ${jitteredDelay}ms')` at lines 103-105; test at scheduler.test.ts lines 142-167 verifies format |
| 13 | The inline try/catch/sleep/try/catch nesting in runScheduledSync is replaced by a single syncAccountWithRetry call | VERIFIED | runScheduledSync inner account loop at scheduler.ts lines 163-170 calls `syncAccountWithRetry(() => syncOneAccount(account), sleep, DEFAULT_RETRY_POLICY, account.actual_account_id)`; no `sleep(30000)` pattern present |

**Score:** 13/13 truths verified

---

## Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` | useConsentExpiryNotifications() hook dispatching sticky warning notifications | VERIFIED (wired) | 400-line file; exports `useConsentExpiryNotifications` and `useBankSyncNotification`; imports `addNotification`, `removeNotification`, `pushModal`, `useDispatch`, `useSelector`, `useNavigate` |
| `packages/desktop-client/src/components/FinancesApp.tsx` | Calls new notification hooks, no longer renders standalone banner/status components | VERIFIED (wired) | Imports `useConsentExpiryNotifications`, `useBankSyncNotification` from useEnableBankingStatus at lines 41-44; both called at lines 325-326; no ConsentExpiryBanner or BankSyncStatus imports or JSX |
| `packages/sync-server/src/scheduler.test.ts` | Unit tests for syncAccountWithRetry retry behavior | VERIFIED (wired) | 169-line file; 9 test cases in `describe('syncAccountWithRetry')` + 1 in `describe('applyJitter')`; imports `syncAccountWithRetry, applyJitter, type RetryPolicy` from scheduler.js |
| `packages/sync-server/src/scheduler.ts` | Extracted syncAccountWithRetry function with exponential backoff | VERIFIED (wired) | Exports `RetryPolicy`, `applyJitter`, `syncAccountWithRetry`; `runScheduledSync` calls `syncAccountWithRetry`; no `sleep(30000)` |
| `packages/desktop-client/src/components/ConsentExpiryBanner.tsx` | DELETED | VERIFIED DELETED | Glob finds no file at this path |
| `packages/desktop-client/src/components/BankSyncStatus.tsx` | DELETED | VERIFIED DELETED | Glob finds no file at this path |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `useEnableBankingStatus.ts` | `notificationsSlice.ts` | `dispatch(addNotification)` and `dispatch(removeNotification)` | WIRED | `addNotification` imported at line 13; `removeNotification` at line 14; both dispatched in hooks at lines 286, 333, 384, 395 |
| `FinancesApp.tsx` | `useEnableBankingStatus.ts` | `useConsentExpiryNotifications()` and `useBankSyncNotification()` hook calls | WIRED | Import at lines 41-44; calls at lines 325-326 |
| `scheduler.ts` | `scheduler.ts` | `runScheduledSync` calls `syncAccountWithRetry` instead of inline try/catch nesting | WIRED | `syncAccountWithRetry(` appears in account loop at line 165; `sleep(30000)` pattern absent |
| `scheduler.test.ts` | `scheduler.ts` | imports and tests `syncAccountWithRetry` | WIRED | `import { syncAccountWithRetry, applyJitter, type RetryPolicy } from './scheduler.js'` at line 8 |

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| dsg-1 | 06-01-PLAN.md | Alert surface consolidation: 3 competing positioning strategies reduced to single Notifications Redux system | SATISFIED | ConsentExpiryBanner and BankSyncStatus deleted; two notification hooks dispatch through `addNotification` to `<Notifications />`; FinancesApp.tsx renders only `<Notifications />` for alert display |
| dx-4 | 06-02-PLAN.md | Flatten scheduler retry nesting (audit BL-10: "Flatten scheduler retry nesting") | SATISFIED | Old inline try/catch/sleep/try/catch nesting replaced with `syncAccountWithRetry()` call; scheduler.ts inner loop is flat at lines 163-204 |
| fq-4 | 06-02-PLAN.md | Exponential backoff for scheduler retry (audit BL-16: "Exponential backoff for scheduler retry") | SATISFIED | `syncAccountWithRetry` implements 5s/10s/20s exponential sequence (2x multiplier, 60s cap, +/-20% jitter, 3 max retries) replacing fixed `sleep(30000)` single retry |

**Notes on Requirement ID Format:** dsg-1, dx-4, fq-4 are project audit finding IDs (from PROJECT-AUDIT.md), not REQUIREMENTS.md IDs (which use SYNC/AUTO/FOUND/etc. format). REQUIREMENTS.md does not cover phase 6 — it maps only phases 1-5. The audit finding IDs are the correct authority for this phase. All 3 are fully satisfied.

**REQUIREMENTS.md traceability check:** Phase 6 has no entries in the REQUIREMENTS.md traceability table (which covers phases 1-5 only). No orphaned requirements detected — this is by design.

---

## Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` | 356 | `// eslint-disable-next-line react-hooks/exhaustive-deps` | Info | Intentional suppression: `navigate` is intentionally excluded from deps to avoid stale closures on the multi-session notification path. This is a deliberate, documented tradeoff — not a stub or placeholder. |
| `packages/desktop-client/src/utils/consent-urgency.ts` | 34 | Comment references deleted component: `Used by ConsentExpiryBanner and AccountRow.` | Info | Stale doc comment — references a deleted component. No functional impact. |

No blocker anti-patterns found. No TODO/FIXME/placeholder patterns in changed files. No empty implementations or stub returns detected.

---

## Human Verification Required

### 1. Consent Expiry Notification Rendering

**Test:** Configure an Enable Banking session with a consent expiry date within 14 days, open the app, and observe the notification area at bottom-right.
**Expected:** A sticky yellow/orange warning notification appears in the Notifications stack (bottom-right) with bank name, expiry date, and a "Re-authorize" button. No separate banner appears at a different screen position.
**Why human:** Requires a real (or test-seeded) consent session near expiry. Visual placement and correct rendering cannot be confirmed by static analysis.

### 2. Sync-in-Progress Notification Lifecycle

**Test:** Trigger a bank sync (manual or automated) and observe the Notifications stack.
**Expected:** A "Syncing... N accounts remaining" sticky message notification appears during sync and automatically disappears when sync completes, leaving no orphan notification.
**Why human:** Requires triggering an actual sync run and observing the real-time add/remove behavior in a running browser.

---

## Gaps Summary

None. All 13 observable truths verified. All artifacts exist, are substantive, and are wired. All 3 requirement IDs (dsg-1, dx-4, fq-4) are satisfied by concrete implementation evidence.

The two human verification items above are standard "does it look/feel right" checks that cannot be automated from static analysis. They do not indicate missing implementation.

---

_Verified: 2026-03-18_
_Verifier: Claude (gsd-verifier)_
