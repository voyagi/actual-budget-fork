---
phase: 05
slug: infrastructure-and-production
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-19
---

# Phase 05 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Manual verification + Docker CLI commands |
| **Config file** | docker-compose.yml |
| **Quick run command** | `docker compose ps --format json` |
| **Full suite command** | `docker compose up -d && docker compose ps && curl -sk https://localhost/` |
| **Estimated runtime** | ~30 seconds (container startup) |

---

## Sampling Rate

- **After every task commit:** Run `docker compose config --quiet` (validates compose syntax)
- **After every plan wave:** Run `docker compose up -d && docker compose ps`
- **Before `/gsd:verify-work`:** Full suite must show all 3 services healthy
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA-01 | integration | `docker compose config --quiet` | N/A | pending |
| 05-01-02 | 01 | 1 | INFRA-01 | integration | `docker compose up -d && docker compose ps` | N/A | pending |
| 05-01-03 | 01 | 1 | INFRA-02 | manual | Desktop Chrome HTTPS check | N/A | pending |
| 05-02-01 | 02 | 2 | INFRA-02 | manual | iOS Safari HTTPS + PWA install | N/A | pending |
| 05-02-02 | 02 | 2 | INFRA-03 | manual | Multi-device transaction sync | N/A | pending |
| 05-02-03 | 02 | 2 | INFRA-04 | integration | `docker compose down && docker compose up -d` | N/A | pending |
| 05-02-04 | 02 | 2 | INFRA-04 | manual | Production EB OAuth + real bank sync | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers all phase requirements. No test framework additions needed — this phase is infrastructure deployment verified by Docker CLI and manual browser checks.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| iOS Safari HTTPS trust | INFRA-02 | Requires physical iOS device | Open Cloudflare Tunnel URL in Safari, verify no cert warning, install PWA |
| Multi-device sync | INFRA-03 | Requires two devices on network | Enter transaction on desktop, verify on phone (and reverse) |
| Volume persistence | INFRA-04 | Requires Docker restart cycle | `docker compose down && docker compose up`, verify data intact |
| Production EB OAuth | INFRA-04 | Requires real bank credentials | Complete OAuth at real bank, verify transactions sync |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
