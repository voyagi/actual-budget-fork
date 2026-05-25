# Plan Review: 03-02-PLAN.md (Cycle 3)

**Reviewed:** 2026-03-01
**Reviewer:** adversarial plan reviewer - third and final cycle
**Plan Goal:** Client-side consent expiry banner, re-authorization flow, and sync-on-open behavior

## Previous Cycle Fixes Confirmed

All findings from cycle 2 are fixed in the current plan:
- C-1 (account_sync_source case): Fixed - line 391 uses enableBanking (camelCase B)
- H-1 (newSessionId path): Fixed - plan now states result.accounts[0].session_id with normalizeAccount reference (lines 258, 487)
- H-2 (CRDT race): Addressed - comment block at lines 334-341 documents the concurrency as an accepted limitation
- M-1 (settings UI): Addressed - Step 0 notes DevTools workaround, defers UI to a future plan (line 192)
- M-2 (duplicate grouping logic): Fixed - banner uses useConsentExpiry() hook exclusively
- N-1 (ModalState naming): Fixed - plan text uses Modal union throughout

---

## Verdict: PASS

Zero CRITICAL findings. One HIGH (an initialization gap), two MEDIUM (a closure race and a missing verification step).
All are addressable in execution without plan revision.

---

## Findings

### HIGH

#### H-1: Re-auth modal state initialization gap

**Severity:** HIGH
**Category:** missing-step
**Step:** Task 2 - EnableBankingExternalMsgModal re-auth mode implementation

The plan says to pre-fill bank selection in re-auth mode and call authorizeEnableBank(aspspName, aspspCountry)
directly. However, the existing component initializes country via getCountryFromBrowser() and
selectedBankId to undefined. The onJump() function has a guard: if (!selectedBankId or !country) return.
This silently aborts without calling authorizeEnableBank if the state is not pre-initialized.

The plan says to skip the bank picker step but does not say how. In re-auth mode, the executor must either:
(a) Initialize useState for country and selectedBankId from props when reauth is true, OR
(b) Add a separate code path that calls authorizeEnableBank(aspspName, aspspCountry) without the guard.

If the executor adds only the re-auth completion handler but forgets to pre-initialize state,
the button stays disabled and re-auth never starts.

Verified against: EnableBankingExternalMsgModal.tsx lines 113-134 (useState inits at undefined,
onJump guard). authorizeEnableBank() signature in enablebanking.ts line 20-23.

Suggestion: Add to Task 2 - When reauth is true, initialize country = aspspCountry and
selectedBankId = aspspName in their respective useState calls or via useEffect on mount.
This satisfies the guard without modifying the guard logic, preserving backward compatibility.

---

### MEDIUM

#### M-1: isSyncing closure is replaced on staleThresholdHours change

**Severity:** MEDIUM
**Category:** edge-case
**Step:** Task 1 Step 3 - visibility/focus bank sync useEffect in FinancesApp

The visibility/focus useEffect has [staleThresholdHours] in its dependency array.
When the pref changes, React tears down the old effect and creates a new one. The isSyncing
flag is a closure-scoped let. A new closure starts at false. If a sync is in-flight when
the re-render happens, the old closure is abandoned and the new one allows a second concurrent sync.

This is unlikely in practice (users rarely change the pref during an active sync) but it is
a structural gap. The existing App.tsx pattern avoids it because its deps [dispatch, hiddenScrollbars]
do not change during a sync.

Suggestion: Use useRef for the mutex so it persists across effect re-runs:
  const isSyncingRef = useRef(false);
  In onVisibilityOrFocus: if (document.hidden or isSyncingRef.current) return;
  isSyncingRef.current = true;
  try { ... } finally { isSyncingRef.current = false; }

#### M-2: Task 2 verify block does not check aspsp_country in /sync-status response

**Severity:** MEDIUM
**Category:** verification
**Step:** Task 2 verify block

The aspsp_country addition to /sync-status is labeled a Plan 01 prerequisite amendment.
The Task 2 automated verify step greps only for reauth-complete and reauth. It does not
verify aspsp_country is present in the response.

If the executor omits aspsp_country from the /sync-status JOIN, the re-auth flow receives
aspspCountry = undefined. createAuth() is called with undefined, the EB API returns an error.
The failure is silent at compile time because aspspCountry is typed as optional in the modal props.

Verified against: eb_sessions schema in migrations.js (aspsp_country TEXT at line 16).
The current /sync-status route in app-enablebanking.ts (lines 330-347) returns only
lastEntry from eb_sync_log with no JOIN to eb_sessions at all.

Suggestion: Add to Task 2 verify block:
  grep -c aspsp_country packages/sync-server/src/app-enablebanking/app-enablebanking.ts
And to the Task 2 done checklist: aspsp_country returned by /sync-status (JOIN to eb_sessions added).

---

## Missing Steps

None. All required functionality is covered across Tasks 1 and 2.

---

## Assumptions

1. useQuery and accountQueries are importable inside useEnableBankingStatus.ts. Confirmed -
   both are used in the hooks/ folder already (useAccounts.ts, useClosedAccounts.ts).

2. eb_sessions.aspsp_country is populated for all sessions. Confirmed - migrations.js line 16
   has aspsp_country TEXT, and the /create-auth route (line 178) inserts it at create-auth time.

3. last_sync is stored as a millisecond timestamp string. The plan does parseInt(a.last_sync, 10)
   and compares to Date.now() in milliseconds. If last_sync stored seconds instead, every account
   would appear stale on every open. Carried forward from research - verify in execution.

4. authorizeEnableBank resolves with the new session ID, not the old one. In re-auth mode,
   createAuth is called with the same aspspName/aspspCountry and the EB API creates a fresh
   session. accounts[0].session_id is the new session ID. Safe per existing flow.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 1 |
| Medium | 2 |
| Minor | 0 |

PASS - The plan is structurally sound. H-1 (re-auth modal state initialization) is the only
issue that could cause a silent failure at runtime: the re-auth button stays disabled if the
executor forgets to initialize country and selectedBankId from re-auth props. This is a
one-line fix in execution. Both MEDIUM issues are low-probability edge cases.