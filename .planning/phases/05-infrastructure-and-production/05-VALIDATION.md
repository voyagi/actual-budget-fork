---
phase: 05
slug: infrastructure-and-production
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-19
updated: 2026-05-04
---

# Phase 05 - Validation Strategy

Per-phase validation contract for production deployment and trust-state execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest, Docker CLI, manual device/bank verification |
| **Config files** | `docker-compose.yml`, `Caddyfile`, `packages/sync-server/vitest.config.ts` |
| **Quick run command** | `yarn workspace @actual-app/sync-server run test -- src/util/production-trust.test.ts` |
| **Full suite command** | `yarn typecheck && yarn lint:fix && docker compose config --quiet` |
| **Manual gate** | Desktop HTTPS, phone HTTPS, persistence, multi-device sync, production EB OAuth, real-bank sync |
| **Estimated runtime** | 1-5 minutes automated; human bank/device checks vary |

## Sampling Rate

- **After trust-state code edits:** Run focused sync-server trust tests.
- **After client IPC/UI edits:** Run `yarn typecheck`; run `yarn lint:fix` before committing code.
- **After Compose/config edits:** Run `docker compose config --quiet`.
- **Before human verification:** Run `docker compose up -d && docker compose ps`.
- **Before `/gsd:verify-work`:** All automated checks pass and manual gates have recorded evidence.
- **Max automated feedback latency:** 5 minutes.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Manual Gate | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | INFRA-01 | integration | `docker compose config --quiet` | N/A | pending |
| 05-01-02 | 01 | 1 | INFRA-01 | integration | `docker compose up -d && docker compose ps` | N/A | pending |
| 05-01-03 | 01 | 1 | INFRA-02 | manual | N/A | Desktop Chrome HTTPS trust | pending |
| 05-02-01 | 02 | 2 | INFRA-05, INFRA-06 | unit/integration | `yarn workspace @actual-app/sync-server run test -- src/util/production-trust.test.ts` | N/A | pending |
| 05-02-02 | 02 | 2 | INFRA-05, INFRA-06 | type/lint | `yarn typecheck && yarn lint:fix` | N/A | pending |
| 05-02-03 | 02 | 2 | INFRA-01, INFRA-02 | integration | `docker compose config --quiet && docker compose up -d && docker compose ps` | N/A | pending |
| 05-02-04 | 02 | 2 | INFRA-02, INFRA-04 | manual | N/A | Desktop HTTPS and data/Caddy persistence | pending |
| 05-02-05 | 02 | 2 | INFRA-02, INFRA-03 | manual | N/A | Phone HTTPS and two-way sync | pending |
| 05-02-06 | 02 | 2 | INFRA-01, INFRA-05, INFRA-06 | integration/manual | Production trust manual verification endpoint | Verified access/persistence/multi-device fixes | pending |
| 05-02-07 | 02 | 2 | INFRA-05, INFRA-06 | integration | Bank-sync recovery check against `eb_sync_log` | N/A | pending |
| 05-02-08 | 02 | 2 | INFRA-01 | manual | N/A | Production Enable Banking OAuth with real bank | pending |
| 05-02-09 | 02 | 2 | INFRA-01, INFRA-05, INFRA-06 | integration/manual | Bank-sync recovery check after successful sync log | Real-bank sync result | pending |

*Status: pending / green / red / flaky*

## Wave 0 Requirements

- Trust-state persistence tests must exist before relying on the UI warning.
- Docker stack checks remain the production deployment baseline.
- Human-only checks are allowed only where the server cannot prove the condition, such as iOS certificate trust and real-bank OAuth.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Desktop Caddy HTTPS trust | INFRA-02 | Requires local browser trust store | Open Caddy HTTPS URL in desktop Chrome and verify no certificate warning |
| Phone Cloudflare HTTPS trust | INFRA-02 | Requires physical phone browser | Open Cloudflare Tunnel URL in Safari or Chrome and verify no certificate warning |
| Volume persistence | INFRA-04 | Requires restart cycle and visual data check | `docker compose down && docker compose up -d`, then verify budget data and Caddy trust remain |
| Multi-device sync | INFRA-03 | Requires two devices | Enter transaction on desktop and phone, verify each appears on the other device |
| Production EB OAuth | INFRA-01 | Requires real bank credentials and EB dashboard setup | Complete production OAuth through real bank and return to app |
| Production real-bank sync | INFRA-01 | Requires real linked account | Trigger manual sync and verify successful `eb_sync_log` evidence |
| Manual trust recovery | INFRA-06 | Some production truths cannot be server-proven | Use the verified manual fix path and confirm only the affected condition clears |

## Production Trust-State Checks

| Condition | Untrusted Trigger | Recovery Path | Must Not Clear From |
|-----------|-------------------|---------------|---------------------|
| access | Desktop or phone HTTPS unverified, failed, or stale | Verified manual fix; optional automated server health check where valid | Reload, elapsed time, `/alerts/acknowledge` |
| persistence | Data or Caddy trust restart check unverified, failed, or stale | Verified manual fix after Compose restart check | Reload, elapsed time, `/alerts/acknowledge` |
| multi_device_sync | Two-device sync unverified, failed, or stale | Verified manual fix after both directions pass | Reload, elapsed time, `/alerts/acknowledge` |
| bank_sync | Missing, stale, or failed `eb_sync_log` evidence | Automated recovery check sees recent successful sync; verified manual sync evidence if needed | Reload, elapsed time, `/alerts/acknowledge` |

## Validation Sign-Off

- [ ] All Phase 5 requirements have automated verify or justified manual gate.
- [ ] Trust-state persistence has automated tests.
- [ ] Warning activation covers all four condition classes.
- [ ] Warning recovery covers automated pass and verified manual fix.
- [ ] No local dismissal path clears durable trust state.
- [ ] Docker production stack preflight passes.
- [ ] Manual device and bank gates have recorded evidence.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending
