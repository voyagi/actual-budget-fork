---
phase: 09
slug: feature-expansion
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (sync-server); React Testing Library + Vitest (desktop-client) |
| **Config file** | `packages/sync-server/vitest.config.ts` |
| **Quick run command** | `yarn workspace @actual-app/sync-server test --run --reporter=verbose` |
| **Full suite command** | `yarn workspace @actual-app/sync-server test --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `yarn workspace @actual-app/sync-server test --run --reporter=verbose`
- **After every plan wave:** Run `yarn workspace @actual-app/sync-server test --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | fc-1 | unit | `yarn workspace @actual-app/sync-server test --run accounts/totp` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | fc-1 | unit | same | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | fc-1 | unit | same | ❌ W0 | ⬜ pending |
| 09-01-04 | 01 | 1 | fc-1 | integration | `yarn workspace @actual-app/sync-server test --run app-account` | ❌ W0 | ⬜ pending |
| 09-01-05 | 01 | 1 | fc-1 | unit | same | Exists | ⬜ pending |
| 09-02-01 | 02 | 1 | fc-2 | unit | `yarn workspace @actual-app/sync-server test --run util/backup` | ❌ W0 | ⬜ pending |
| 09-02-02 | 02 | 1 | fc-2 | unit | same | ❌ W0 | ⬜ pending |
| 09-02-03 | 02 | 1 | fc-2 | unit | same + `util/alerter` | Exists | ⬜ pending |
| 09-02-04 | 02 | 1 | fc-2 | unit | `yarn workspace @actual-app/sync-server test --run scheduler` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `packages/sync-server/src/accounts/totp.test.ts` — stubs for fc-1 (TOTP generation, verification, replay prevention, recovery codes)
- [ ] `packages/sync-server/src/util/backup.test.ts` — stubs for fc-2 (SQLite backup, retention cleanup, alert trigger)

*Existing infrastructure covers audit logging and alerter tests.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| QR code renders in Settings page | fc-1 | Visual rendering | Navigate to Settings > Security, enable 2FA, verify QR code is scannable |
| Authenticator app accepts scanned QR | fc-1 | External device | Scan QR with Google Authenticator, verify 6-digit code appears |
| Backup file integrity | fc-2 | Docker volume | After backup runs, extract tar.gz and verify SQLite files open without corruption |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
