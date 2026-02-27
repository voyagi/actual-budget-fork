# Project Research Summary

**Project:** Actual Budget Fork - Enable Banking Edition
**Domain:** Self-hosted personal finance app with EU bank sync (PSD2/AIS) and PWA
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH

## Executive Summary

This project is a fork of Actual Budget that adds Enable Banking as a fourth bank sync provider (alongside GoCardless, SimpleFIN, and Pluggy AI), enabling automatic EU bank transaction imports via PSD2 AIS, and improves mobile usability by completing the existing PWA infrastructure. The established pattern in Actual Budget is to build each bank sync provider as a self-contained module in `packages/sync-server/src/` with Express routes and a service layer, then extend `loot-core`'s sync router with a new branch. Enable Banking fits this pattern exactly. The recommended approach is to build the adapter in discrete layers: API client first, then loot-core routing, then scheduled sync, then UI, then PWA hardening, then Docker/HTTPS infrastructure. These layers have hard dependencies on each other in that order, and each is independently testable.

The primary technical risks are PSD2 consent lifecycle management (sessions expire every 90-180 days and cannot be renewed silently), transaction deduplication across pending-to-booked state transitions, and RSA key persistence across Docker container restarts. None of these are blockers, but all three require deliberate design before the first sync runs in production. A secondary risk is fork maintenance: Actual Budget ships frequently, and without a discipline of adding only new files and tagging custom commits, the fork will accumulate merge debt that becomes expensive to resolve.

The PWA work is largely done by the existing codebase. Actual Budget already has `site.webmanifest`, `vite-plugin-pwa`, Workbox, and maskable icons. The main remaining PWA gap is that the service worker build is disabled in `vite.config.mts` due to offline support issues. The HTTPS requirement (mandatory for PWA installability on mobile) is the piece that most commonly trips up personal deployments. Caddy handles this for LAN access, but a real trusted certificate (via Cloudflare Tunnel or equivalent) is required for iOS PWA install to work.

## Key Findings

### Recommended Stack

All additions are to the existing TypeScript + React + SQLite + Vite + Yarn 4 monorepo. No new frameworks or build systems. Four packages are added:

**Core technologies:**

- `jose` (6.1.3, `sync-server`): RS256 JWT signing for Enable Banking auth - zero-dependency, ESM-native, de-facto standard for modern Node JWT
- `axios` (1.13.5, `sync-server`): HTTP client for Enable Banking API - matches what the existing GoCardless adapter uses, avoids a second HTTP abstraction
- `node-cron` (4.2.1, `sync-server`): 4x/day scheduled sync - v4 is TypeScript-native, zero dependencies, cron expressions fit the fixed-interval requirement exactly
- `vite-plugin-pwa` (1.2.0, `desktop-client` devDep): PWA generation via Workbox - already partially configured in the codebase, may need only minor changes
- Caddy (`caddy:2-alpine`, Docker Compose): HTTPS termination with automatic local CA - zero cert management overhead vs nginx + mkcert

**Critical note:** No Enable Banking TypeScript SDK exists on npm. All API calls are made manually with axios against the REST API.

See [STACK.md](.planning/research/STACK.md) for detailed rationale and alternatives considered.

### Expected Features

The Enable Banking integration has a natural dependency chain. Features are listed in the order they unlock each other.

**Must have (table stakes):**

- Enable Banking OAuth redirect flow - without this, zero transactions sync
- Account linking UI - maps bank accounts to Actual accounts, required before any import
- Transaction auto-import + balance update - the core stated goal
- Consent expiry notification - EU consents expire at 180 days (UK: 90 days), silent expiry is worse than visible
- Consent renewal flow - reuses OAuth flow, triggered from expiry notification
- Scheduled sync 4x/day - PSD2 maximum rate, automates what manual sync does
- Error surfacing per account - last sync timestamp + last error message, essential for trust
- HTTPS infrastructure - service worker prerequisite for PWA installability
- Web app manifest - already partially exists, needs verification
- Service worker offline read - Workbox already present, needs caching strategy configured

**Should have (differentiators for this use case):**

- Pending transaction display - Enable Banking returns `PDNG` vs `BOOK` status
- Per-account last-synced timestamp - visible data freshness indicator
- Multi-bank support - adapter pattern supports it naturally
- Sync-on-open trigger - complements cron schedule for immediate freshness

**Defer to v2:**

- Sync log / history - useful for debugging but not blocking
- Push notifications for consent expiry - in-app banner is sufficient
- Payment initiation - separate regulatory scope, not needed for personal budget tracking

**Important nuance:** EU bank consents now expire at 180 days (extended July 2023 under PSD2), not 90 days. UK banks remain at 90 days. Build the notification system to read `maximum_consent_validity` from the Enable Banking session response rather than hardcoding either value.

See [FEATURES.md](.planning/research/FEATURES.md) for full feature table with complexity ratings.

### Architecture Approach

Enable Banking slots into Actual Budget's existing bank sync architecture as a fourth provider. The integration adds one new module in `sync-server`, one new scheduler, type extensions in `loot-core`, and three new UI components in `desktop-client`. Existing transaction reconciliation, deduplication, and rule application in loot-core are shared and require no changes.

**Major components:**

1. `sync-server/app-enablebanking/` (NEW) - Express routes + Enable Banking API client with RS256 JWT auth, session/account storage, transaction normalization
2. `sync-server/scheduler.js` (NEW) - node-cron 4x/day trigger, consent expiry checker, writes to notifications table
3. `loot-core/sync.ts` (MODIFY) - adds `downloadEnableBankingTransactions()` and `'enableBanking'` branch in `syncAccount()`
4. `loot-core/types/models/account.ts` (MODIFY) - adds `'enableBanking'` to `account_sync_source` union
5. `desktop-client/banksync/` (ADD) - `EnableBankingLink.tsx`, `ConsentExpiryBanner.tsx`, `EnableBankingSettings.tsx`
6. Docker Compose + Caddy (NEW) - HTTPS termination, RSA key mount as bind volume

**Patterns to follow:**

- Two-file provider module: `app-{provider}.js` (routes only) + `{provider}-service.js` (API client only)
- NormalizedTransaction shape that matches what `processBankSyncDownload()` expects (already defined)
- JWT generated per-request or cached with 1-hour TTL, never stored long-lived
- Scheduler lives in sync-server, not loot-core (loot-core runs in a browser web worker, cron cannot run in browser context)

See [ARCHITECTURE.md](.planning/research/ARCHITECTURE.md) for complete data flow diagrams and code patterns.

### Critical Pitfalls

1. **Sandbox diverges from production** - Enable Banking's own docs warn the sandbox does not accurately simulate live behavior. Sandbox tests only HTTP wiring and JWT signing. Plan a separate production smoke test with a real bank account as a distinct milestone before declaring the integration done.

2. **Pending-to-booked transaction deduplication** - PSD2 exposes the same transaction twice: once as `PDNG`, once as `BOOK`, sometimes with different amounts. Banks are inconsistent about whether `transactionId` is stable across state transitions. Design an upsert layer keyed on `(transactionId OR bankTransactionId) + amount + date + accountId` before the first sync runs. Retrofitting this after data is in SQLite is painful.

3. **RSA private key not surviving container restarts** - Multi-line PEM values are fragile in Docker Compose env blocks, and MSYS mangles them. Mount the key as a file (`./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`) and read it at startup. Verify persistence by restarting the container on day one.

4. **PSD2 consent expiry silently breaks sync** - When a session expires, API returns an error. If the scheduler catches it generically and logs without alerting, sync stops invisibly for days. Track `session_expiry_at` in DB, show UI banner at 7-14 days before expiry, and surface sync failures prominently in the UI.

5. **Fork merge debt accumulation** - Actual Budget ships frequently. Tag all custom commits with `[eb]` prefix, keep custom code in new files rather than modifying existing ones, and schedule monthly upstream syncs. GoCardless adapter may be refactored or removed since GoCardless stopped accepting EU accounts in July 2025.

See [PITFALLS.md](.planning/research/PITFALLS.md) for the full list including moderate and minor pitfalls.

## Implications for Roadmap

Based on research, the feature dependency chain and architectural layer dependencies both point to a 6-phase structure. The first three phases must be sequential. Phases 5 and 6 are largely independent and can overlap with Phase 4.

### Phase 1: Foundation and Enable Banking API Client

**Rationale:** All other work depends on a working, tested API client. JWT signing, OAuth redirect flow, and session exchange must be proven before building anything else. This phase also establishes the fork maintenance discipline before any custom code is written.
**Delivers:** Working `enablebanking-service.js` with RSA auth, Express routes at `/enablebanking`, sandbox-tested, plus fork tagging and upstream sync procedure documented.
**Addresses:** Enable Banking OAuth flow, account listing
**Avoids:** RSA key persistence pitfall (establish file-mount pattern on day one), fork merge debt (tag and structure discipline before line 1)
**Research flag:** Needs research-phase to confirm current GoCardless adapter interface before implementing Enable Banking adapter (GoCardless may have been refactored since July 2025 when they stopped EU accounts).

### Phase 2: loot-core Integration and Manual Sync

**Rationale:** Once the API client is proven, extend loot-core's sync router and prove the full data pipeline end-to-end with a manual sync trigger. Deduplication design must happen here, before any data enters production SQLite.
**Delivers:** Manual sync working end-to-end (trigger sync -> fetch transactions -> normalize -> reconcile -> write to SQLite), account linking UI, balance updates.
**Addresses:** Transaction auto-import, balance update on sync, account linking UI, error surfacing
**Avoids:** Pending-to-booked deduplication pitfall (design upsert layer before first real data), sandbox-vs-production gap (plan production smoke test as explicit milestone)
**Research flag:** Standard patterns from GoCardless adapter, no additional research needed. `processBankSyncDownload()` and `reconcileTransactions()` are shared and documented.

### Phase 3: Scheduled Sync and Consent Lifecycle

**Rationale:** Once manual sync is stable, automate it. PSD2 rate limits (4x/day max) and consent expiry handling must be designed together because both affect how the scheduler behaves.
**Delivers:** node-cron 4x/day scheduler, consent expiry tracking in DB, UI notification banner, consent renewal flow.
**Addresses:** Scheduled sync 4x/day, consent expiry notification, consent renewal flow, per-account last-synced timestamp
**Avoids:** Consent expiry silent failure pitfall (banner + prominent error), PSD2 rate limit vs platform rate limit confusion (separate retry strategies), rate limit exhaustion from manual sync button (6-hour minimum gap enforcement)
**Research flag:** Standard patterns. node-cron 4x/day is well-documented.

### Phase 4: PWA Completion

**Rationale:** PWA infrastructure already exists in the codebase. The service worker build is disabled in `vite.config.mts` due to offline issues. This phase investigates and resolves the existing blockage rather than building from scratch.
**Delivers:** Service worker build re-enabled, offline read working, PWA installable on Android and iOS home screen.
**Addresses:** Service worker offline read, PWA installability, web app manifest verification
**Avoids:** Service worker update cycle pitfall (`registerType: 'autoUpdate'`), Vite dev server service worker gap (test on `vite preview` not `vite dev`), iOS Safari service worker instability (explicit device testing)
**Research flag:** Needs investigation of the existing `vite.config.mts` service worker disable before planning this phase. The reason for the disable determines the solution.

### Phase 5: Docker Compose and HTTPS

**Rationale:** Infrastructure prerequisite for PWA installability on phone. Can be developed in parallel with Phase 4 once the Enable Banking integration is stable.
**Delivers:** Docker Compose with sync-server + desktop-client + Caddy, RSA key mounted as Docker secret, HTTPS working on LAN and optionally via Cloudflare Tunnel for phone access.
**Addresses:** HTTPS infrastructure, Docker volume persistence, PWA installability prerequisite
**Avoids:** Docker volume data loss pitfall (named volumes, verify persistence before real data), HTTPS certificate not trusted on iOS (Cloudflare Tunnel or real domain, not Caddy self-signed for iOS PWA)
**Research flag:** Caddy + Cloudflare Tunnel path for iOS needs concrete testing. The interaction between Caddy's local CA and iOS certificate trust is a known pain point.

### Phase 6: Production Cutover and Polish

**Rationale:** Sandbox credentials and production credentials are separate registrations in Enable Banking. Production cutover requires new RSA key pair, new application ID, and smoke test with a real bank account. This is a distinct milestone, not just deploying Phase 1-5 code.
**Delivers:** Production Enable Banking credentials configured, real bank account connected, first real sync confirmed, pending transaction display, sync-on-open trigger.
**Addresses:** Pending transaction display, sync-on-open trigger, production smoke test
**Avoids:** Sandbox-to-production credential confusion (explicit registration checklist), post-deployment consent expiry timing (document when first renewal will be needed)
**Research flag:** No additional research needed. Enable Banking's production registration process is documented.

### Phase Ordering Rationale

- Phases 1-3 are strictly sequential: API client -> data pipeline -> automation. Each layer depends on the previous.
- Phases 4 and 5 are parallel to each other and can begin after Phase 2 is stable (PWA works independently of bank sync logic).
- Phase 6 cannot start until Phases 1-5 are proven in sandbox/local environment.
- The account linking UI (Phase 2) must come before the consent renewal banner (Phase 3) because users need to have linked accounts before consent expiry is meaningful.

### Research Flags

Phases likely needing `/gsd:research-phase` before planning:

- **Phase 1:** Confirm current GoCardless adapter file structure and interface (may have changed since July 2025 when EU accounts stopped). Read `packages/sync-server/src/app-gocardless/` before implementing `app-enablebanking/`.
- **Phase 4:** Read current `packages/desktop-client/vite.config.mts` and `src/` to understand why service worker build is disabled. The reason determines the fix.

Phases with standard, well-documented patterns:

- **Phase 2:** `processBankSyncDownload()` and `reconcileTransactions()` are internal Actual Budget APIs. Pattern is clear from GoCardless adapter.
- **Phase 3:** `node-cron` 4x/day scheduling is a solved problem. Implementation is straightforward.
- **Phase 5:** Docker Compose + Caddy + named volumes is well-documented. Cloudflare Tunnel is the only uncertain piece.
- **Phase 6:** Enable Banking production registration is documented at [enablebanking.com/cp](https://enablebanking.com/cp/applications).

## Confidence Assessment

| Area         | Confidence  | Notes                                                                                                                                                                                                                                                                   |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stack        | HIGH        | All package versions verified against npm registry. Enable Banking auth requirements confirmed against official API docs. GoCardless adapter confirmed using axios.                                                                                                     |
| Features     | MEDIUM-HIGH | Must-have features confirmed against Enable Banking API reference and PSD2 spec. PWA installability criteria confirmed against web.dev. Consent validity clarification (180 days EU) confirmed from Enable Banking changelog and third-party sources.                   |
| Architecture | HIGH        | Based on direct inspection of the Actual Budget monorepo source. Component boundaries, file locations, and data flow confirmed against actual code, not documentation alone.                                                                                            |
| Pitfalls     | MEDIUM-HIGH | RSA key and Docker volume pitfalls confirmed from official Docker and Enable Banking docs. Pending-to-booked dedup confirmed from PSD2 spec and Open Banking transaction state docs. iOS PWA pitfalls from multiple community sources, no official Apple documentation. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Actual PWA state:** Architecture research confirmed `site.webmanifest` and `vite-plugin-pwa` exist, and the service worker build is disabled in `vite.config.mts`. The exact reason for the disable is unknown without reading the file. Read this before starting Phase 4 planning.
- **GoCardless adapter stability:** Since GoCardless stopped EU accounts in July 2025, Actual Budget may refactor or remove the GoCardless adapter in upcoming releases. The Enable Banking adapter mirrors this structure, so if upstream changes the pattern, the interface changes too. Verify the adapter interface is stable before implementation.
- **Enable Banking sandbox credentials:** Sandbox testing requires account creation at [enablebanking.com/cp](https://enablebanking.com/cp/applications) and downloading a test RSA keypair. This is not automated. Must be done before Phase 1 implementation begins.
- **iOS PWA certificate trust:** Caddy's automatic local CA works for LAN access from browsers, but iOS Safari requires the certificate to be trusted by the device's certificate store for PWA install to work. Cloudflare Tunnel solves this but introduces an external dependency. Validate the network access approach before Phase 5 implementation.

## Sources

### Primary (HIGH confidence)

- [Enable Banking API Reference](https://enablebanking.com/docs/api/reference/) - authentication, JWT spec, endpoints, session model
- [Enable Banking Quick Start](https://enablebanking.com/docs/api/quick-start/) - OAuth redirect flow, session exchange
- [Enable Banking Sandbox](https://enablebanking.com/docs/api/sandbox/) - sandbox limitations and divergence from production
- [Actual Budget monorepo](https://github.com/actualbudget/actual) - direct source inspection of adapter pattern, sync.ts, PWA config
- [jose npm](https://www.npmjs.com/package/jose) - version 6.1.3 confirmed
- [vite-plugin-pwa npm](https://www.npmjs.com/package/vite-plugin-pwa) - version 1.2.0, Vite 6 compatibility confirmed
- [node-cron npm](https://www.npmjs.com/package/node-cron) - version 4.2.1, v4 TypeScript rewrite confirmed
- [PWA install criteria](https://web.dev/articles/install-criteria) - HTTPS + manifest + icons 192/512px requirements
- [UK Open Banking transaction states v3.1.10](https://openbankinguk.github.io/read-write-api-site3/v3.1.10/resources-and-data-models/aisp/Transactions.html) - PDNG vs BOOK state model
- [Docker Desktop WSL2 volumes](https://docs.docker.com/desktop/features/wsl/) - named volume behavior on Windows

### Secondary (MEDIUM confidence)

- [Enable Banking changelog October 2025](https://enablebanking.com/blog/2025/11/05/enable-banking-changelog-october-2025) - 180-day consent validity default
- [actual-auto-sync community tool](https://github.com/seriouslag/actual-auto-sync) - proves cron + Actual API pattern for scheduled sync
- [Actual Budget bank sync docs](https://actualbudget.org/docs/advanced/bank-sync/) - GoCardless stopped new EU accounts July 2025
- [PSD2 consent 180 days extension](https://www.enablenow.nl/en/blog/psd2-consent-to-180-days) - EU 180-day rule, July 2023
- [Caddy documentation](https://caddyserver.com/docs/running) - Docker setup, local CA behavior
- [Vite Plugin PWA registration strategies](https://vite-pwa-org.netlify.app/guide/register-service-worker) - autoUpdate strategy
- PWA on iOS limitations (Brainhub, MagicBell) - service worker instability, offline behavior

### Tertiary (LOW confidence)

- Community posts on Docker volume path changes in v26.1.4 (josephguadagno.net) - needs local verification on setup day

_Research completed: 2026-02-18_
_Ready for roadmap: yes_
