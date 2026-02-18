# Project State: Actual Budget Fork - Enable Banking Edition

**Last updated:** 2026-02-18
**Session:** Plan 01-04 execution complete (gap closure - [eb] tag rewrite done)

## Project Reference

**Core Value:** Automatic bank transaction sync that works for EU accounts without manual data entry. If everything else fails, transactions must flow from the bank into the app without me touching anything.

**Milestone:** v1 (initial release)

**Current Focus:** Phase 1 gap closure complete. All 11 custom commits carry [eb] tag. FOUND-04 satisfied. Phase 1 human verification checkpoint still pending (from Plan 01-03 Task 3).

## Current Position

**Active Phase:** 01-foundation-and-api-client
**Active Plan:** 01-04 complete (gap closure done)
**Status:** All 4 Phase 1 plans complete. Commit convention (FOUND-04) now fully satisfied. Awaiting human verification of Phase 1 success criteria (from Plan 01-03 Task 3 checkpoint).

**Progress:**
```
Phase 1: Foundation and API Client    [4/4] Awaiting human checkpoint
Phase 2: Bank Sync Pipeline           [ ] Not started
Phase 3: Automation and Consent       [ ] Not started
Phase 4: PWA Completion               [ ] Not started
Phase 5: Infrastructure and Production[ ] Not started
```

Overall: 0/5 phases complete (4 plans complete, 1 awaiting human checkpoint)

## Performance Metrics

| Metric | Value |
|--------|-------|
| Phases total | 5 |
| Requirements mapped | 29/29 |
| Plans complete | 4 |
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
| Single docker-compose.yml (not dev+prod override) | Per locked decision from CONTEXT.md - simpler, env vars handle environment differences | 2026-02-18 |
| ACTUAL_WEB_ROOT not hardcoded | Auto-resolves via require.resolve('@actual-app/web/package.json') - more robust than hardcoded path | 2026-02-18 |
| Monorepo Docker build order | loot-core build:browser must precede desktop-client Vite build - loot-core browser modules are imported | 2026-02-18 |
| Redirect URL http://localhost:5006/enablebanking/callback | Matches planned Express route in Plan 01-03. Configured on sandbox application at registration time. | 2026-02-18 |
| RSA key is PKCS#8 format (BEGIN PRIVATE KEY) | Enable Banking browser UI generates PKCS#8. jose handles it natively - no conversion needed. | 2026-02-18 |
| Lazy key loading on first request (not startup) | Avoids startup failure when EB not configured. Module-level cache means key imported only once per process lifetime. | 2026-02-18 |
| GET /test-auth placed before session middleware | Enables automated sandbox verification without needing Actual user session. Development-only route; production uses POST /status. | 2026-02-18 |
| GIT_SEQUENCE_EDITOR on MSYS: use PowerShell not bash script | MSYS bash cannot find shell scripts at workspace paths when git invokes the editor. PowerShell -File with Windows-style forward-slash path resolves correctly. | 2026-02-18 |

## Critical Pitfalls (from research)

1. **RSA key persistence** - Mount key as file (`./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`), never as env var. Verify survives container restart on Phase 1 day one.
2. **Pending-to-booked deduplication** - Design upsert layer keyed on `(transactionId OR bankTransactionId) + amount + date + accountId` in Phase 2. Cannot retrofit after data is in SQLite.
3. **Consent expiry silent failure** - Track `session_expiry_at` in DB, show banner at 14 days before expiry, surface sync failures prominently. Catch expiry errors specifically, not generically.
4. **Sandbox diverges from production** - Sandbox tests HTTP wiring and JWT signing only. Phase 5 includes explicit production smoke test with real bank account as distinct milestone.
5. **Fork merge debt** - All custom commits tagged `[eb]`, new code in new files rather than modifying existing ones. Monthly upstream sync discipline.
6. **iOS HTTPS certificate trust** - Caddy local CA is NOT trusted by iOS Safari for PWA install. Cloudflare Tunnel (or real domain cert) required for iOS PWA success.
7. **Docker build chain** - loot-core build:browser MUST run before desktop-client Vite build. IS_GENERIC_BROWSER=1 required for non-Electron builds. Both discovered in Plan 01-01.

## Research Flags (act before planning these phases)

- **Before planning Phase 1:** Read `packages/sync-server/src/app-gocardless/` to confirm current adapter file structure and interface. GoCardless may have been refactored since July 2025.
- **Before planning Phase 4:** Read `packages/desktop-client/vite.config.mts` to understand why the service worker build is disabled. The reason determines the fix approach.
- ~~**Before starting Phase 1:** Create Enable Banking sandbox account at enablebanking.com/cp and download test RSA keypair. This is a manual prerequisite, not automated.~~ (Prerequisite for Plan 01-02, not 01-01)

## Accumulated Context

### Stack Versions (verified against npm registry 2026-02-18)
- `jose`: 6.1.3 (sync-server) - RS256 JWT signing
- `axios`: 1.13.5 (sync-server) - Enable Banking HTTP client
- `node-cron`: 4.2.1 (sync-server) - TypeScript-native v4
- `vite-plugin-pwa`: 1.2.0 (desktop-client devDep) - Workbox generation
- Caddy: `caddy:2-alpine` (Docker Compose)

### Docker Build Facts (discovered Plan 01-01)

- Base image: `node:22-bookworm-slim`
- Build order: `yarn install` -> `loot-core build:browser` -> `@actual-app/web build` -> `sync-server build`
- Required env: `IS_GENERIC_BROWSER=1` for Vite build (non-Electron context)
- Entrypoint: `node packages/sync-server/build/app.js`
- ACTUAL_DATA_DIR=/data (named Docker volume)
- RSA key: `./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`

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
- Has the GoCardless adapter been refactored or removed since July 2025? (Determines Phase 1 starting point for Plan 01-02)
- Cloudflare Tunnel vs LAN-only + Caddy: which approach for phone HTTPS access? (Determines Phase 5 approach for iOS)
- Docker volume path behavior on WSL2 Docker Desktop: verify named volume behavior on setup day

## Session Continuity

**Stopped at:** Plan 01-04 complete (gap closure)

**Next action:** Phase 1 human verification checkpoint still pending (from Plan 01-03 Task 3). User must verify Phase 1 success criteria. After verification, continue with Phase 2.

**Phase 1 verification results (automated):**
- `GET /enablebanking/test-auth` returns `{"status":"ok","data":{"configured":true}}`
- RSA key persists across `docker compose down && docker compose up -d`
- Container logs clean, server healthy at http://localhost:5006
- All 11 custom commits tagged `[eb]` (FOUND-04 fully satisfied after Plan 01-04 gap closure)

**Sandbox credentials ready:**
- Application ID: `b619fe6c-ab92-4de5-a7c2-901c0e0ef580`
- Private key: `secrets/eb_private.pem` (PKCS#8, RS256)
- Redirect URL: `http://localhost:5006/enablebanking/callback`
- API base: `https://api.enablebanking.com`

---
*State initialized: 2026-02-18*
*Last updated: 2026-02-18 - Plan 01-04 complete (gap closure)*
