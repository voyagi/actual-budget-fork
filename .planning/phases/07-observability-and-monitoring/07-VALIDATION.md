---
phase: 07
slug: observability-and-monitoring
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | none - invoked via package.json test script |
| **Quick run command** | `yarn workspace @actual-app/sync-server test --run` |
| **Full suite command** | `yarn workspace @actual-app/sync-server test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @actual-app/sync-server test --run`
- **After every plan wave:** Run `yarn workspace @actual-app/sync-server test --run`
- **Before `/gsd:verify-work`:** Full suite must be green + TypeScript compile (`yarn workspace @actual-app/sync-server build`)
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | obs-1 | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap | pending |
| 07-01-02 | 01 | 0 | obs-2 | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap | pending |
| 07-01-03 | 01 | 0 | obs-3 | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap | pending |
| 07-01-04 | 01 | 0 | obs-4 | unit | `yarn workspace @actual-app/sync-server test --run` | Wave 0 gap | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `packages/sync-server/src/util/audit.test.ts` -- stubs for obs-3 (writeAuditLog insert + error swallowing)
- [ ] `packages/sync-server/src/util/alerter.test.ts` -- stubs for obs-2 (triggerAlert payload, cooldown, no-throw on network error)
- [ ] `packages/sync-server/src/util/metrics.test.ts` -- stubs for obs-4 (recordLatency, percentile math, fixed-size eviction)
- [ ] `packages/sync-server/src/util/logger.test.ts` -- stubs for obs-1 (file transport present in non-test env; absent in test env)

All four test files use `vi.mock` for `getAccountDb()` and `global.fetch` to avoid real DB/network dependencies.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Webhook alert delivery to external service | obs-2 | Requires actual HTTP endpoint (Discord/ntfy) | Configure ALERT_WEBHOOK_URL, trigger sync failure, verify payload received |
| Log file rotation on disk | obs-1 | Requires 24h elapsed time or date change | Check /data/logs/ for dated log files after container restart |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
