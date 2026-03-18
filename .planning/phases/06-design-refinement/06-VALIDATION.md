---
phase: 06
slug: design-refinement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (config at `packages/sync-server/vitest.config.ts`) |
| **Config file** | `packages/sync-server/vitest.config.ts` |
| **Quick run command** | `cd packages/sync-server && npx vitest run src/scheduler.test.ts` |
| **Full suite command** | `cd packages/sync-server && npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd packages/sync-server && npx vitest run src/scheduler.test.ts`
- **After every plan wave:** Run `cd packages/sync-server && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | dsg-1 | manual smoke | n/a | — | ⬜ pending |
| 06-01-02 | 01 | 1 | dsg-1 | manual smoke | n/a | — | ⬜ pending |
| 06-02-01 | 02 | 1 | dx-4, fq-4 | unit | `cd packages/sync-server && npx vitest run src/scheduler.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | fq-4 | unit | `cd packages/sync-server && npx vitest run src/scheduler.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/sync-server/src/scheduler.test.ts` — tests for syncAccountWithRetry retry behavior, exponential backoff with jitter, RateLimitError/SessionExpiredError fast-fail, error logging after max retries
- [ ] Vitest mock for `sleep()` (vi.useFakeTimers() or dependency injection) to avoid real waits

*Existing test infrastructure covers sync-server vitest config. No new framework installation needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Consent notification dispatched for non-ok sessions | dsg-1 | Requires Redux store + React render cycle (jsdom setup) | Open app with expiring consent, verify notification appears in bottom-right stack |
| BankSyncStatus notification removed on sync complete | dsg-1 | Requires Redux store + bank sync trigger | Trigger manual sync, verify notification appears then disappears |
| ConsentExpiryBanner and BankSyncStatus components removed from FinancesApp.tsx | dsg-1 | Structural verification | Grep for removed component imports |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
