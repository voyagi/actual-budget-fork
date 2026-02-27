---
phase: 02-bank-sync-pipeline
plan: 04
subsystem: ui
tags:
  [enablebanking, react, typescript, oauth, modal, hooks, category-rules, psd2]

# Dependency graph
requires:
  - phase: 02-bank-sync-pipeline
    provides: '02-03: enablebanking-create-auth, enablebanking-poll-session, enablebanking-accounts-link, enablebanking-sync-status IPC handlers; eb_account_map.actual_account_id populated at link time'
  - phase: 02-bank-sync-pipeline
    provides: "02-02: SyncServerEnableBankingAccount type, AccountSyncSource includes 'enableBanking', ENABLEBANKING_SERVER in server config"

provides:
  - 'authorizeEnableBank() in enablebanking.ts: polls enablebanking-poll-session every 3s with 5-min timeout'
  - 'useEnableBankingStatus() hook: checks server configuration (returns { configured, isLoading })'
  - 'useEnableBankingSyncStatus(accountIds) hook: returns sync statuses keyed by Actual UUID, documents eb_account_map dependency'
  - 'EnableBankingExternalMsgModal: country -> bank select -> OAuth redirect -> poll -> select-linked-accounts'
  - "'enablebanking-external-msg' registered in modalsSlice and Modals.tsx"
  - "'enableBanking' case in SelectLinkedAccountsModal and its union type"
  - 'useLinkAccountEnableBankingMutation: calls enablebanking-accounts-link with session_id from account'
  - 'Enable Banking button in CreateAccountModal (EU PSD2 bank sync)'
  - 'AccountRow.tsx: imports useEnableBankingSyncStatus, shows error_message in red for EB accounts (SYNC-07)'
  - 'eb-category-rules.js: 47 EU merchant patterns across 5 categories, seedCategoryRules() idempotent'
  - 'app.ts: seedCategoryRules() called in enablebanking-accounts-link after initial sync'

affects:
  - 02-05-PLAN (scheduler builds on this complete UI/link pipeline)
  - Phase 3 automation (consent expiry banner needs useEnableBankingStatus)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Enable Banking modal flow: country/bank select -> authorizeEnableBank polls -> dispatches select-linked-accounts'
    - 'useEnableBankingSyncStatus passes empty array for non-EB accounts (React rules of hooks compliance)'
    - "seedCategoryRules idempotency via preference key 'eb-rules-seeded' prevents double-seeding"
    - 'EU merchant rules look up category by name at seed time, skip missing categories gracefully'

key-files:
  created:
    - packages/desktop-client/src/enablebanking.ts
    - packages/desktop-client/src/hooks/useEnableBankingStatus.ts
    - packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx
    - packages/loot-core/src/server/accounts/eb-category-rules.js
  modified:
    - packages/desktop-client/src/components/Modals.tsx
    - packages/desktop-client/src/modals/modalsSlice.ts
    - packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx
    - packages/desktop-client/src/accounts/mutations.ts
    - packages/desktop-client/src/components/modals/CreateAccountModal.tsx
    - packages/desktop-client/src/components/banksync/AccountRow.tsx
    - packages/loot-core/src/server/accounts/app.ts

key-decisions:
  - 'authorizeEnableBank opens OAuth URL in browser then polls enablebanking-poll-session (not callback-based) - polling matches GoCardless pattern and avoids needing a callback listener in the desktop client'
  - 'useEnableBankingSyncStatus accepts Actual UUIDs not EB UIDs - UI always has account.id, never the internal EB UID'
  - 'Empty array passed to useEnableBankingSyncStatus for non-EB accounts - satisfies React rules of hooks while adding zero overhead'
  - "EU merchant rules use category names not UUIDs at seed time - adapts to any budget's category setup without hardcoding"
  - "Enable Banking button always visible (not gated on configuredEnableBanking) so users can still click it; the modal shows the 'not configured' message if needed"

patterns-established:
  - 'Enable Banking UI chain: CreateAccountModal -> enablebanking-external-msg -> select-linked-accounts -> closeModal'
  - 'AccountRow error display pattern: hook called unconditionally, conditional render of error span'

requirements-completed: [SYNC-01, SYNC-02, SYNC-05, SYNC-06, SYNC-07, SYNC-09]

# Metrics
duration: 45min
completed: 2026-02-19
---

# Phase 2 Plan 04: Enable Banking Desktop UI Summary

**Full Enable Banking UI: OAuth flow modal, account linking mutations, EU merchant category rules, and sync error display - making the complete bank sync pipeline accessible from the Create Account dialog**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-19T00:00:00Z
- **Completed:** 2026-02-19T00:45:00Z
- **Tasks:** 3
- **Files modified:** 10 (4 created, 6 modified + app.ts)

## Accomplishments

- Built the full Enable Banking OAuth UI chain: country select -> bank select -> browser redirect -> polling -> account list
- Integrated Enable Banking into all 6 existing modal system files (modalsSlice, Modals, SelectLinkedAccounts, mutations, CreateAccountModal, AccountRow)
- Created 47-entry EU merchant categorization rules that seed once per budget on first account link, covering grocery chains, subscriptions, transport, utilities, and shopping

## Task Commits

Each task was committed atomically:

1. **Task 1: Create enablebanking.ts, useEnableBankingStatus.ts, EnableBankingExternalMsgModal.tsx** - `84dd44958` (feat)
2. **Task 2: Wire Enable Banking into existing modal system, mutations, and AccountRow** - `709528fea` (feat)
3. **Task 3: Create EU merchant categorization rules and integrate into link handler** - `0cf2a2a4e` (feat)

**Plan metadata:** (to be added after docs commit)

## Files Created/Modified

- `packages/desktop-client/src/enablebanking.ts` - authorizeEnableBank() with 3s polling, 5-min timeout
- `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` - useEnableBankingStatus() + useEnableBankingSyncStatus() with eb_account_map dependency documented
- `packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx` - OAuth flow modal mirroring GoCardless
- `packages/desktop-client/src/components/Modals.tsx` - Added enablebanking-external-msg case
- `packages/desktop-client/src/modals/modalsSlice.ts` - Added 'enablebanking-external-msg' modal type
- `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx` - Added 'enableBanking' to union type, onNext handler, and mutation call
- `packages/desktop-client/src/accounts/mutations.ts` - Added useLinkAccountEnableBankingMutation
- `packages/desktop-client/src/components/modals/CreateAccountModal.tsx` - Added Enable Banking button with EU PSD2 description
- `packages/desktop-client/src/components/banksync/AccountRow.tsx` - SYNC-07: imports useEnableBankingSyncStatus, renders error_message in red
- `packages/loot-core/src/server/accounts/eb-category-rules.js` - EU_MERCHANT_PATTERNS (47 entries), seedCategoryRules()
- `packages/loot-core/src/server/accounts/app.ts` - Import and call seedCategoryRules() in enablebanking-accounts-link

## Decisions Made

- `authorizeEnableBank` uses setInterval polling (not callbacks) - matches the GoCardless `pollGoCardlessWebToken` pattern and works naturally with the OAuth redirect flow
- `useEnableBankingSyncStatus` accepts Actual UUIDs (not EB UIDs) because the UI only has `account.id` - the IPC layer and sync-server handle the mapping to EB internal IDs
- React rules of hooks: `useEnableBankingSyncStatus` is always called in AccountRow with an empty array for non-EB accounts - zero network overhead, hooks compliance maintained
- EU merchant rules use category name lookup not UUID - adapts to any budget's category structure without hardcoded assumptions
- `seedCategoryRules` skips categories not found in the budget rather than throwing - partial seeding beats zero seeding when category names differ

## Deviations from Plan

None - plan executed exactly as written. All 3 tasks implemented per spec.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required for this UI layer.

## Next Phase Readiness

- Full Enable Banking user journey is complete: Create Account -> OAuth -> Link accounts -> Sync
- EU merchant categorization rules seed automatically on first link
- Sync error messages visible in AccountRow for EB accounts (SYNC-07 fully satisfied)
- Plan 02-05 (scheduler / background sync) can build on this complete pipeline

## Self-Check: PASSED

Files verified:

- `packages/desktop-client/src/enablebanking.ts` - FOUND (exports authorizeEnableBank, polling loop at line 44)
- `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` - FOUND (exports both hooks, eb_account_map dependency documented)
- `packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx` - FOUND (country input, bank list, calls authorizeEnableBank, dispatches select-linked-accounts)
- `packages/desktop-client/src/components/Modals.tsx` - FOUND (enablebanking-external-msg case at line 187)
- `packages/desktop-client/src/modals/modalsSlice.ts` - FOUND (enablebanking-external-msg type at line 129)
- `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx` - FOUND (enableBanking in union type, in onNext handler)
- `packages/desktop-client/src/accounts/mutations.ts` - FOUND (useLinkAccountEnableBankingMutation, enablebanking-accounts-link call)
- `packages/desktop-client/src/components/modals/CreateAccountModal.tsx` - FOUND (Enable Banking button, onConnectEnableBanking)
- `packages/desktop-client/src/components/banksync/AccountRow.tsx` - FOUND (useEnableBankingSyncStatus import, error_message render)
- `packages/loot-core/src/server/accounts/eb-category-rules.js` - FOUND (47 EU_MERCHANT_PATTERNS entries, seedCategoryRules)
- `packages/loot-core/src/server/accounts/app.ts` - FOUND (seedCategoryRules import and call in linkEnableBankingAccount)

Commits verified:

- `84dd44958` - Task 1 feat commit - confirmed in git log
- `709528fea` - Task 2 feat commit - confirmed in git log
- `0cf2a2a4e` - Task 3 feat commit - confirmed in git log

---

_Phase: 02-bank-sync-pipeline_
_Completed: 2026-02-19_
