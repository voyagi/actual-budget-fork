---
phase: 08-quality-and-test-infrastructure
plan: 02
subsystem: ui
tags: [react, code-splitting, react-lazy, suspense, error-boundary, react-error-boundary, enablebanking]

# Dependency graph
requires:
  - phase: 07-observability-and-monitoring
    provides: useOperationalAlerts hook wired in FinancesApp covering sync_failure, consent_expiry, auth_failure_burst

provides:
  - React.lazy route-level code splitting for 5 heavy page components in FinancesApp
  - Suspense with LoadingIndicator fallback wrapping RouteErrorBoundary
  - ErrorBoundary around EnableBankingExternalMsgModal body with retry fallback
  - Confirmed: Phase 7 sync failure UI audit — all 3 alert event types covered end-to-end

affects: [09-feature-expansion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "React.lazy with .then(m => ({ default: m.X })) for named exports"
    - "Suspense OUTSIDE RouteErrorBoundary so chunk load errors propagate for retry"
    - "Inline error fallback component (EBModalErrorFallback) scoped to file, not shared"

key-files:
  created: []
  modified:
    - packages/desktop-client/src/components/FinancesApp.tsx
    - packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx

key-decisions:
  - "Suspense wraps RouteErrorBoundary (not inside it) so chunk load errors are caught by the error boundary as render errors, enabling the Try again button"
  - "5 components lazy-loaded: Reports, Settings, UserDirectoryPage, UserAccessPage, ManageTagsPage — app shell (Sidebar, Titlebar, Notifications) stays eager"
  - "NarrowAlternate/WideComponent not converted to React.lazy (already do internal lazy loading)"
  - "EBModalErrorFallback uses globalThis.Error instanceof check for unknown error type under @ts-strict-ignore"
  - "fq-1 audit: Phase 7 useOperationalAlerts covers sync_failure, consent_expiry, auth_failure_burst — no gaps found"

patterns-established:
  - "React.lazy at module scope (after all imports) using .then(m => ({ default: m.Named })) for named export compatibility"
  - "ErrorBoundary wraps modal body content, not the Modal shell — header/close always render"

requirements-completed: [perf-2, fq-2, fq-1]

# Metrics
duration: 11min
completed: 2026-03-19
---

# Phase 08 Plan 02: Quality and Test Infrastructure Summary

**React.lazy code splitting for 5 route components with Suspense/ErrorBoundary, plus ErrorBoundary on EnableBanking modal body, and confirmed Phase 7 sync failure UI coverage**

## fq-1 Audit Result

Phase 7 useOperationalAlerts is confirmed complete. Coverage verified:

- **Server-side**: `triggerAlert({ event_type: 'sync_failure' })` in `scheduler.ts` line 224; `event_type: 'consent_expiry'` at lines 175 and 188; `event_type: 'auth_failure_burst'` in `app-account.ts` line 39.
- **Client-side**: `formatAlertTitle()` maps all 3 event types to user-friendly titles. `useOperationalAlerts()` polls every 60s (`setInterval(poll, 60_000)`), dispatches sticky notifications via Redux `addNotification`, deduplicates via `knownAlertIds` useRef<Set<string>>, and acknowledges on server via `send('operational-alerts-acknowledge')` on close.
- **Integration**: `useOperationalAlerts()` called in FinancesApp.tsx at line 346.

No gaps found. No code changes required for Task 3.

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-19T17:59:19Z
- **Completed:** 2026-03-19T18:10:30Z
- **Tasks:** 3 (2 code changes + 1 audit)
- **Files modified:** 2

## Accomplishments

- 5 heavy route components (Reports, Settings, UserDirectoryPage, UserAccessPage, ManageTagsPage) are now lazy-loaded via React.lazy, producing separate JS chunks on build
- Suspense with LoadingIndicator fallback wraps RouteErrorBoundary so chunk load errors (network failures during lazy import) are caught and show a recoverable retry UI
- EnableBankingExternalMsgModal body wrapped in ErrorBoundary with EBModalErrorFallback — OAuth/bank-fetch render errors no longer crash the app
- Sync failure UI audit confirms Phase 7 implementation covers all required alert types end-to-end

## Task Commits

Each task was committed atomically:

1. **Task 1: Add React.lazy route splitting to FinancesApp** - `1593d8400` (feat)
2. **Task 2: Add ErrorBoundary to EnableBankingExternalMsgModal** - `8ab7ffca5` (feat)
3. **Task 3: Audit sync failure UI coverage** - no code changes (audit only)
4. **Formatting fixes** - `431fb8e95` (style)

## Files Created/Modified

- `packages/desktop-client/src/components/FinancesApp.tsx` - Replaced 5 static imports with React.lazy declarations at module scope; added React.Suspense wrapper outside RouteErrorBoundary
- `packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx` - Added ErrorBoundary import, EBModalErrorFallback component, and ErrorBoundary wrapper around modal body

## Decisions Made

- Suspense wraps RouteErrorBoundary (not inside) so chunk load errors propagate to the error boundary as render errors, enabling the "Try again" button — this is the correct React pattern for recoverable chunk failures.
- Used `globalThis.Error` for instanceof check in EBModalErrorFallback to satisfy TypeScript's `unknown` type under the file's `@ts-strict-ignore` directive.
- NarrowAlternate and WideComponent kept as eager imports — they already do internal lazy loading and are not heavy top-level chunks.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript error: Property 'message' does not exist on type '{}'**
- **Found during:** Task 2 (EnableBankingExternalMsgModal ErrorBoundary)
- **Issue:** FallbackProps has `error: unknown` — under @ts-strict-ignore, TS treated the instanceof-narrowed type as `{}`, rejecting `.message` access
- **Fix:** Changed `error instanceof Error` to `rawError instanceof globalThis.Error` (renamed destructured param to rawError)
- **Files modified:** packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx
- **Verification:** TypeScript typecheck passes with no errors
- **Committed in:** 8ab7ffca5 (Task 2 commit)

**2. [Rule 1 - Formatting] oxfmt format issues in both modified files**
- **Found during:** Post-task verification
- **Issue:** Both files had minor formatting differences from oxfmt's import ordering and line-wrapping rules
- **Fix:** Ran `npx oxfmt` to auto-format both files
- **Files modified:** Both FinancesApp.tsx and EnableBankingExternalMsgModal.tsx
- **Verification:** `npx oxfmt --check` passes with "All matched files use the correct format"
- **Committed in:** 431fb8e95 (style commit)

---

**Total deviations:** 2 auto-fixed (1 type fix, 1 formatting)
**Impact on plan:** Both auto-fixes necessary for correctness and CI compliance. No scope creep.

## Issues Encountered

- oxfmt PostToolUse hook reset EnableBankingExternalMsgModal.tsx mid-edit by stripping unused imports. Fixed by writing the complete file in a single Write call so all imports were used before the formatter ran.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Route-level code splitting is complete; initial bundle size is reduced for production builds
- EnableBanking modal error handling is resilient to OAuth and bank-fetch failures
- Phase 7 sync failure alerting confirmed complete — all 3 event types covered end-to-end
- Ready to proceed with remaining Phase 08 plans (08-01: E2E CI fix + Vitest coverage)

---
*Phase: 08-quality-and-test-infrastructure*
*Completed: 2026-03-19*

## Self-Check: PASSED

- FOUND: packages/desktop-client/src/components/FinancesApp.tsx
- FOUND: packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx
- FOUND: .planning/phases/08-quality-and-test-infrastructure/08-02-SUMMARY.md
- FOUND commit 1593d8400: feat(08-02): add React.lazy route splitting with Suspense to FinancesApp
- FOUND commit 8ab7ffca5: feat(08-02): wrap EnableBankingExternalMsgModal body in ErrorBoundary
- FOUND commit 431fb8e95: style(08-02): apply oxfmt formatting to FinancesApp and EnableBankingModal
- TypeScript typecheck: PASSED (0 errors)
- oxfmt format check: PASSED (all matched files use correct format)
