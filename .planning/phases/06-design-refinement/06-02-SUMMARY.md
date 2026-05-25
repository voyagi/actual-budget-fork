---
phase: 06-design-refinement
plan: "02"
subsystem: testing
tags: [vitest, typescript, exponential-backoff, retry, scheduler, tdd]

# Dependency graph
requires:
  - phase: 02-bank-sync-pipeline
    provides: scheduler.ts with inline retry logic and RateLimitError/SessionExpiredError handling
provides:
  - syncAccountWithRetry: exported testable function with dependency injection (syncFn, sleepFn)
  - applyJitter: exported pure function for jitter calculation
  - RetryPolicy: exported type for configurable retry behavior
  - scheduler.test.ts: 9 unit tests covering all retry scenarios
affects:
  - 07-observability-and-monitoring
  - 08-quality-and-test-infrastructure

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Dependency injection for testability (syncFn, sleepFn parameters instead of direct calls)
    - Exponential backoff with capped base delay and jitter applied on top
    - Fast-fail error bypass (RateLimitError, SessionExpiredError skip retry loop entirely)
    - TDD red-green cycle for async retry logic

key-files:
  created:
    - packages/sync-server/src/scheduler.test.ts
  modified:
    - packages/sync-server/src/scheduler.ts

key-decisions:
  - "syncAccountWithRetry accepts syncFn and sleepFn as parameters for pure unit testing without DB or API calls"
  - "Base delay is capped to maxDelay BEFORE jitter so jitter may slightly exceed maxDelay (standard pattern)"
  - "delay multiplier applied AFTER sleep so delay sequence is: 5s, 10s, 20s (not 10s, 20s, 40s)"
  - "RateLimitError and SessionExpiredError propagate immediately from syncAccountWithRetry; outer runScheduledSync catch handles the break logic"

patterns-established:
  - "TDD with dependency injection: extract async side-effectful logic into functions that accept their dependencies as parameters to enable unit testing"
  - "Exponential backoff policy: cap base delay, apply jitter, multiply for next iteration"

requirements-completed: [dx-4, fq-4]

# Metrics
duration: 8min
completed: 2026-03-18
---

# Phase 06 Plan 02: Scheduler Retry Refactor Summary

**syncAccountWithRetry extracted from inline 4-level try/catch nesting into a testable exponential backoff helper (5s/10s/20s + 20% jitter, 3 retries, fast-fail for rate limits)**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T02:34:00Z
- **Completed:** 2026-03-18T02:42:00Z
- **Tasks:** 2 (TDD red + green)
- **Files modified:** 2

## Accomplishments

- Extracted `syncAccountWithRetry` as an exported, dependency-injected function with exponential backoff (5s initial, 2x multiplier, 60s cap, +/-20% jitter, max 3 retries)
- Exported `applyJitter` pure function and `RetryPolicy` type for reuse and testing
- Replaced the old inline `await sleep(30000)` single-retry pattern with the clean loop helper
- Added 9 unit tests covering: success, retry+succeed, exhaustion, exponential delays, jitter bounds, RateLimitError fast-fail, SessionExpiredError fast-fail, maxDelay cap, and retry logging
- Full sync-server test suite passes (495 tests, 41 files, 0 regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing tests for syncAccountWithRetry** - `593764f` (test) -- RED phase
2. **Task 2: Implement syncAccountWithRetry and refactor runScheduledSync** - `12b3a8d` (feat) -- GREEN phase

**Plan metadata:** (docs commit below)

_Note: TDD tasks have two commits (test RED -> feat GREEN)_

## Files Created/Modified

- `packages/sync-server/src/scheduler.test.ts` - 9 vitest unit tests for syncAccountWithRetry and applyJitter
- `packages/sync-server/src/scheduler.ts` - Added RetryPolicy type, applyJitter, syncAccountWithRetry exports; refactored runScheduledSync inner loop

## Decisions Made

- Dependency injection pattern chosen (syncFn, sleepFn params) so tests need no DB or API mocks -- just vi.fn() stubs
- Base delay capped before jitter: `applyJitter(Math.min(delay, maxDelay), jitterFraction)` -- jitter may slightly exceed maxDelay, which is the standard pattern for exponential backoff
- RateLimitError/SessionExpiredError propagate from syncAccountWithRetry immediately; the outer `runScheduledSync` catch still handles the `break` behavior for session-loop control
- delay *= multiplier applied AFTER sleep so the sequence is 5s, 10s, 20s (not doubling ahead of time)

## Deviations from Plan

None - plan executed exactly as written. The plan's implementation pseudocode had a commented self-correction about the cap logic; the correct `applyJitter(Math.min(delay, maxDelay), jitterFraction)` form was used as specified.

## Issues Encountered

None - TDD cycle was clean. RED phase showed all 9 tests failing with "syncAccountWithRetry is not a function". GREEN phase passed all 9 on first run.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 06 complete (both plans done)
- Phase 07 (Observability and Monitoring) can begin
- The syncAccountWithRetry function is now independently testable; future retry policy changes (different base delays, multipliers) can be validated without integration test setup

## Self-Check: PASSED

- `packages/sync-server/src/scheduler.test.ts` - FOUND
- `packages/sync-server/src/scheduler.ts` - FOUND
- `.planning/phases/06-design-refinement/06-02-SUMMARY.md` - FOUND
- Commit `593764f` (test RED) - FOUND
- Commit `12b3a8d` (feat GREEN) - FOUND
- Commit `d0da579` (docs metadata) - FOUND
- Commit `1194263` (fix TypeScript mock types) - FOUND
- 9/9 tests pass, 495/495 full suite passes, `npx tsc --noEmit` clean

---
*Phase: 06-design-refinement*
*Completed: 2026-03-18*
