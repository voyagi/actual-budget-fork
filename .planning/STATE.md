# Project State: Actual Budget Fork - Enable Banking Edition

**Last updated:** 2026-02-18
**Session:** Initial roadmap creation

## Project Reference

**Core Value:** Automatic bank transaction sync that works for EU accounts without manual data entry. If everything else fails, transactions must flow from the bank into the app without me touching anything.

**Milestone:** v1 (initial release)

**Current Focus:** Roadmap created. Ready for Phase 1 planning.

## Current Position

**Active Phase:** None (planning complete, execution not started)
**Active Plan:** None
**Status:** Roadmap approved, awaiting first plan

**Progress:**
```
Phase 1: Foundation and API Client    [ ] Not started
Phase 2: Bank Sync Pipeline           [ ] Not started
Phase 3: Automation and Consent       [ ] Not started
Phase 4: PWA Completion               [ ] Not started
Phase 5: Infrastructure and Production[ ] Not started
```

Overall: 0/5 phases complete

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 5 |
| Requirements mapped | 29/29 |
| Plans complete | 0 |
| Phases complete | 0 |

## Key Decisions Recorded

| Decision | Rationale | Date |
|----------|-----------|------|
| 5-phase structure (not 6) | All 29 requirements fit cleanly into 5 delivery boundaries. Research's "Phase 6 production cutover" is absorbed into Phase 5 success criteria as an explicit production smoke test milestone | 2026-02-18 |
| Phases 4 and 5 can run in parallel with Phase 3 | PWA and infrastructure work is independent of automation logic once Phase 2 (manual sync) is stable | 2026-02-18 |
| Enable Banking over GoCardless | GoCardless stopped accepting EU users July 2025, Enable Banking is free for personal use and covers 4,709+ banks | 2026-02-18 |
| PWA over native app | Lower complexity, single codebase, sufficient for personal use | 2026-02-18 |
| Caddy for HTTPS | Zero cert management overhead vs nginx + mkcert. Cloudflare Tunnel needed for iOS PWA trust | 2026-02-18 |
| node-cron 4x/day scheduler | PSD2 maximum rate. Lives in sync-server (not loot-core) because loot-core runs in browser web worker | 2026-02-18 |
| jose for JWT signing | RS256, zero-dependency, ESM-native. Matches Enable Banking RS256 requirement | 2026-02-18 |

## Critical Pitfalls (from research)

1. **RSA key persistence** - Mount key as file (`./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`), never as env var. Verify survives container restart on Phase 1 day one.
2. **Pending-to-booked deduplication** - Design upsert layer keyed on `(transactionId OR bankTransactionId) + amount + date + accountId` in Phase 2. Cannot retrofit after data is in SQLite.
3. **Consent expiry silent failure** - Track `session_expiry_at` in DB, show banner at 14 days before expiry, surface sync failures prominently. Catch expiry errors specifically, not generically.
4. **Sandbox diverges from production** - Sandbox tests HTTP wiring and JWT signing only. Phase 5 includes explicit production smoke test with real bank account as distinct milestone.
5. **Fork merge debt** - All custom commits tagged `[eb]`, new code in new files rather than modifying existing ones. Monthly upstream sync discipline.
6. **iOS HTTPS certificate trust** - Caddy local CA is NOT trusted by iOS Safari for PWA install. Cloudflare Tunnel (or real domain cert) required for iOS PWA success.

## Research Flags (act before planning these phases)

- **Before planning Phase 1:** Read `packages/sync-server/src/app-gocardless/` to confirm current adapter file structure and interface. GoCardless may have been refactored since July 2025.
- **Before planning Phase 4:** Read `packages/desktop-client/vite.config.mts` to understand why the service worker build is disabled. The reason determines the fix approach.
- **Before starting Phase 1:** Create Enable Banking sandbox account at enablebanking.com/cp and download test RSA keypair. This is a manual prerequisite, not automated.

## Accumulated Context

### Stack Versions (verified against npm registry 2026-02-18)
- `jose`: 6.1.3 (sync-server) - RS256 JWT signing
- `axios`: 1.13.5 (sync-server) - Enable Banking HTTP client
- `node-cron`: 4.2.1 (sync-server) - TypeScript-native v4
- `vite-plugin-pwa`: 1.2.0 (desktop-client devDep) - Workbox generation
- Caddy: `caddy:2-alpine` (Docker Compose)

### Architecture Summary
- `sync-server/app-enablebanking/` (NEW) - Express routes + Enable Banking API client
- `sync-server/scheduler.js` (NEW) - node-cron 4x/day + consent expiry checker
- `loot-core/sync.ts` (MODIFY) - adds `downloadEnableBankingTransactions()` branch
- `loot-core/types/models/account.ts` (MODIFY) - adds `'enableBanking'` to sync source union
- `desktop-client/banksync/` (ADD) - `EnableBankingLink.tsx`, `ConsentExpiryBanner.tsx`, `EnableBankingSettings.tsx`

### PWA State (from research)
- `site.webmanifest` already exists
- `vite-plugin-pwa` and Workbox already present
- Service worker build is DISABLED in `vite.config.mts` (reason unknown - read before planning Phase 4)
- Maskable icons already exist
- Main work: re-enable and configure service worker, verify iOS Safari behavior

### Consent Validity Note
- EU banks: 180 days (extended July 2023 under PSD2 review)
- UK banks: 90 days
- Read `maximum_consent_validity` from Enable Banking session response. Never hardcode either value.

## Open Questions

- What is the exact reason the service worker build is disabled in `vite.config.mts`? (Determines Phase 4 approach)
- Has the GoCardless adapter been refactored or removed since July 2025? (Determines Phase 1 starting point)
- Cloudflare Tunnel vs LAN-only + Caddy: which approach for phone HTTPS access? (Determines Phase 5 approach for iOS)
- Docker volume path behavior on WSL2 Docker Desktop: verify named volume behavior on setup day

## Session Continuity

Next action: Run `/gsd:plan-phase 1` to create the execution plan for Phase 1.

Before planning Phase 1, complete manual prerequisite: create Enable Banking sandbox account at enablebanking.com/cp.

---
*State initialized: 2026-02-18*
