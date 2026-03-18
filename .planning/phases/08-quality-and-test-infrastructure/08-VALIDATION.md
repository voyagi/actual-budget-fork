---
phase: 08
slug: quality-and-test-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | packages/sync-server/vitest.config.ts |
| **Quick run command** | `yarn vitest run --reporter=dot` |
| **Full suite command** | `yarn vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn vitest run --reporter=dot`
- **After every plan wave:** Run `yarn vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | perf-2 | build | `yarn tsc --noEmit` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | fq-2 | unit | `yarn vitest run` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 2 | dx-2 | e2e | `yarn e2e` | ❌ W0 | ⬜ pending |
| 08-02-02 | 02 | 2 | fq-1 | unit | `yarn vitest run` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 2 | dx-1 | build | `yarn tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Code splitting reduces initial bundle | perf-2 | Bundle size is a build artifact | Run `yarn build` and compare chunk sizes before/after |
| E2E tests pass in CI | dx-2 | Requires CI runner | Push branch and verify GitHub Actions |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
