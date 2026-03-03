---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 04.2-01-PLAN.md (Phase 04.2 fully complete - 1/1 plans done)
last_updated: "2026-03-03T21:11:45.866Z"
progress:
  total_phases: 13
  completed_phases: 5
  total_plans: 15
  completed_plans: 15
  percent: 33
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: planning
stopped_at: Completed 04.2-01-PLAN.md (Phase 04.2 Plan 01 - CVE remediation complete)
last_updated: "2026-03-03T20:59:47Z"
progress:
  total_phases: 13
  completed_phases: 4
  total_plans: 15
  completed_plans: 15
  percent: 33
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: completed
stopped_at: Completed 03-02-PLAN.md
last_updated: "2026-03-01T17:09:19.607Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 100
---

---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Between phases
stopped_at: Completed 03-02-PLAN.md
last_updated: "2026-03-01T18:00:00.000Z"
progress:
  total_phases: 3
  completed_phases: 3
  total_plans: 11
  completed_plans: 11
  percent: 100
---

# Project State: Actual Budget Fork - Enable Banking Edition

**Last updated:** 2026-03-03
**Session:** Phase 04.2 Plan 01 complete (CVE remediation: rollup RCE, serialize-js RCE, jws HMAC bypass, axios DoS, lodash prototype pollution, tar symlink, storybook WebSocket RCE - all 7 sec-8 through sec-14 CVEs resolved)

## Project Reference

**Core Value:** Automatic bank transaction sync that works for EU accounts without manual data entry. If everything else fails, transactions must flow from the bank into the app without me touching anything.

**Milestone:** v1 (initial release)

**Current Focus:** Phase 04.1 Plans 01-03 complete. Design system compliance (SvgDelete dismiss, Button variant=bare, clamp() modal width), localStorage self-cleanup, American English normalization, 2 dead hook files deleted. Phase 04.1 fully complete (3/3 plans done).

## Current Position

**Active Phase:** 04.2-dependency-security-updates
**Active Plan:** Plan 01 complete (Phase complete - 1/1 plans done)
**Status:** Ready to plan

**Progress:**
[████████░░░░░░░░░░] 33%
Phase 1: Foundation and API Client [4/4] Complete
Phase 2: Bank Sync Pipeline [5/5] Complete (E2E verified, 3 tests deferred to Phase 5)
Phase 3: Automation and Consent [2/2] Complete
Phase 4: PWA Completion [ ] Not started
Phase 4.1: Audit Quick Wins [3/3] Complete (INSERTED)
Phase 4.2: Dependency Security Updates [1/1] Complete (INSERTED)
Phase 5: Infrastructure and Production [ ] Not started
Phase 5.1: Accessibility Overhaul [ ] Not started (INSERTED)
Phase 5.2: Security Hardening [ ] Not started (INSERTED)
Phase 6: Design Refinement [ ] Not started
Phase 7: Observability and Monitoring [ ] Not started
Phase 8: Quality and Test Infrastructure [ ] Not started
Phase 9: Feature Expansion [ ] Not started

Overall: 3/13 phases complete (14 plans complete across all phases)

## Performance Metrics

| Metric                                    | Value | Tasks   | Files    |
| ----------------------------------------- | ----- | ------- | -------- |
| Phases total                              | 5     |         |          |
| Requirements mapped                       | 29/29 |         |          |
| Plans complete                            | 12    |         |          |
| Phases complete                           | 3     |         |          |
| Phase 02-bank-sync-pipeline P04           | 45min | 3 tasks | 11 files |
| Phase 02-bank-sync-pipeline P05           | 90min | 2 tasks | 0 files (verification only) |
| Phase 03-automation-consent-lifecycle P01 | 70min | 2 tasks | 10 files |
| Phase 03-automation-consent-lifecycle P02 | 65min | 2 tasks | 12 files |
| Phase 04.1-audit-quick-wins P01           | 21min | 3 tasks | 6 files  |
| Phase 04.1-audit-quick-wins P02           | 7min  | 2 tasks | 4 files  |
| Phase 04.1-audit-quick-wins P03           | 12min | 3 tasks | 5 files  |
| Phase 04.2-dependency-security-updates P01| 15min | 3 tasks | 2 files  |

## Key Decisions Recorded

| Decision                                                                               | Rationale                                                                                                                                                                                    | Date       |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Yarn resolutions >=X.Y.Z range form for CVE overrides                                  | Ranges allow Dependabot to auto-bump future security fixes; exact pins freeze forever. Upper bound added only for rollup (>=4.59.0 <5.0.0) to prevent 5.x breaking changes. | 2026-03-03 |
| minimatch 3.x/5.x/9.x CVEs accepted as unfixable transitive risk                       | Fixing requires incompatible major API override (3.x API != 10.x API), breaks build toolchain. DoS requires attacker-controlled glob patterns that never occur in build config. | 2026-03-03 |
| SvgDelete from @actual-app/components/icons/v0 for consent banner dismiss buttons              | v0 is the correct icon set for delete/close icons in Actual design system. Replaces HTML entity &times; (dsg-2). | 2026-03-03 |
| Two-pass localStorage cleanup for consent-dismissed-* keys                                     | Collect stale keys into array first, then delete. Deleting during index iteration corrupts i and skips keys (dsg-5). | 2026-03-03 |
| clamp(400px, 30vw, 600px) for EnableBankingExternalMsgModal width                             | 400px readable minimum, 30vw scales with viewport, 600px prevents over-stretching on large screens (dsg-4). | 2026-03-03 |
| Button variant='bare' replaces raw button element in AccountRow re-authorize link              | Design system Button provides background:none, border:none, cursor:pointer + hover/focus-visible/active automatically (dsg-3). | 2026-03-03 |
| aria-live="polite" on animated container (not nested text) for BankSyncStatus                  | Prevents double-announcements from nested aria-live regions. Outer role="status" provides semantic container. | 2026-03-03 |
| urgencyIcons module-level const mapping urgency to SVG component                               | Module-level avoids recreation on render. Null for ok urgency renders no icon (non-alert state). Shared by SessionBanner and MultiSessionBanner. | 2026-03-03 |
| :focus-visible + :focus:not(:focus-visible) pattern for DateSelect calendar buttons            | Removes blanket outline:none (which blocked keyboard focus ring). :focus-visible shows 2px boxShadow for keyboard users, :focus:not(:focus-visible) suppresses for mouse. | 2026-03-03 |
| CORS single-origin String format (not Array) via ACTUAL_CORS_ORIGIN                   | Single allowed origin per deployment simplifies configuration. Set to production domain; defaults to localhost:3001 for dev.                                                                  | 2026-03-03 |
| CSP style-src includes unsafe-inline                                                   | Required because React uses inline style objects extensively throughout the frontend. Removing it would break UI.                                                                             | 2026-03-03 |
| 404 FileNotFound deferred (kept as 400)                                                | Tests confirm frontend expects 400 for file-not-found; the original FIXME said "make sure frontend is ok with it" - it is not. Requires coordinated frontend + backend change.               | 2026-03-03 |
| boolToInt to Boolean conversion deferred                                               | Tests confirm integer 0/1 values for deleted field are expected by test suite. Frontend code uses truthy/falsy, but changing without test suite update is unsafe.                            | 2026-03-03 |
| res.json tests use res.body not res.text                                               | res.json('string') JSON-encodes string with quotes. res.body is the parsed JSON value (string without quotes). Tests updated to check res.body for semantic correctness.                     | 2026-03-03 |
| 5-phase structure (not 6)                                                              | All 29 requirements fit cleanly into 5 delivery boundaries. Research's "Phase 6 production cutover" is absorbed into Phase 5 success criteria as an explicit production smoke test milestone | 2026-02-18 |
| Phases 4 and 5 can run in parallel with Phase 3                                        | PWA and infrastructure work is independent of automation logic once Phase 2 (manual sync) is stable                                                                                          | 2026-02-18 |
| Enable Banking over GoCardless                                                         | GoCardless stopped accepting EU users July 2025, Enable Banking is free for personal use and covers 4,709+ banks                                                                             | 2026-02-18 |
| PWA over native app                                                                    | Lower complexity, single codebase, sufficient for personal use                                                                                                                               | 2026-02-18 |
| Caddy for HTTPS                                                                        | Zero cert management overhead vs nginx + mkcert. Cloudflare Tunnel needed for iOS PWA trust                                                                                                  | 2026-02-18 |
| node-cron 4x/day scheduler                                                             | PSD2 maximum rate. Lives in sync-server (not loot-core) because loot-core runs in browser web worker                                                                                         | 2026-02-18 |
| jose for JWT signing                                                                   | RS256, zero-dependency, ESM-native. Matches Enable Banking RS256 requirement                                                                                                                 | 2026-02-18 |
| Single docker-compose.yml (not dev+prod override)                                      | Per locked decision from CONTEXT.md - simpler, env vars handle environment differences                                                                                                       | 2026-02-18 |
| ACTUAL_WEB_ROOT not hardcoded                                                          | Auto-resolves via require.resolve('@actual-app/web/package.json') - more robust than hardcoded path                                                                                          | 2026-02-18 |
| Monorepo Docker build order                                                            | loot-core build:browser must precede desktop-client Vite build - loot-core browser modules are imported                                                                                      | 2026-02-18 |
| Redirect URL http://localhost:5006/enablebanking/callback                              | Matches planned Express route in Plan 01-03. Configured on sandbox application at registration time.                                                                                         | 2026-02-18 |
| RSA key is PKCS#8 format (BEGIN PRIVATE KEY)                                           | Enable Banking browser UI generates PKCS#8. jose handles it natively - no conversion needed.                                                                                                 | 2026-02-18 |
| Lazy key loading on first request (not startup)                                        | Avoids startup failure when EB not configured. Module-level cache means key imported only once per process lifetime.                                                                         | 2026-02-18 |
| GET /test-auth placed before session middleware                                        | Enables automated sandbox verification without needing Actual user session. Development-only route; production uses POST /status.                                                            | 2026-02-18 |
| GIT_SEQUENCE_EDITOR on MSYS: use PowerShell not bash script                            | MSYS bash cannot find shell scripts at workspace paths when git invokes the editor. PowerShell -File with Windows-style forward-slash path resolves correctly.                               | 2026-02-18 |
| downloadEnableBankingTransactions takes acctId + since only (no userId/userKey/bankId) | Enable Banking session context is stored server-side - sync-server needs only accountId to look up the session. Simpler than GoCardless pattern.                                             | 2026-02-19 |
| SyncServerEnableBankingAccount placed in account.ts (not gocardless.ts)                | Belongs to account model domain, not GoCardless-specific. Future account linking UI imports from account.ts.                                                                                 | 2026-02-19 |
| eb_sync_log uses actual_account_id not account_id                                      | The Actual Budget UUID is what the UI has when querying sync status. eb_account_uid retained for API cross-reference.                                                                        | 2026-02-19 |
| normalizeTransaction includes top-level date and notes fields                          | loot-core defaultMappings reads trans['date'] and trans['notes'] directly. Missing date causes thrown error on every transaction.                                                            | 2026-02-19 |
| getTransactions pagination safeguard maxPages=100                                      | Returns partial results with console.warn rather than throwing - partial data beats a crashed sync job.                                                                                      | 2026-02-19 |
| normalizeAccount account_id derivation must be replicated in /callback route           | account_id ?? uid derivation in utils.js must match what /callback inserts into eb_account_map.eb_account_uid.                                                                               | 2026-02-19 |
| GET /callback unauthenticated before export { app as handlers }                        | Bank's browser redirect has no Actual session cookie - route must be outside session middleware scope                                                                                        | 2026-02-19 |
| linkEnableBankingAccount aborts on /update-account-map failure                         | Partial link without actual_account_id causes silent sync log failures and broken /sync-status - better to abort and let user retry                                                          | 2026-02-19 |
| findOrCreateBank receives institution object not string                                | link.ts reads institution.name - must pass { name: account.institution } not bare string                                                                                                     | 2026-02-19 |
| ACCOUNT_NOT_MAPPED uses status:ok wrapper                                              | loot-core post() throws on status:error and only returns data field - wrapping in status:ok lets download function check res.error_code                                                      | 2026-02-19 |
| authorizeEnableBank uses polling not callback                                          | Polling matches GoCardless pattern, avoids needing a callback listener in the desktop client - works naturally with OAuth redirect flow                                                      | 2026-02-19 |
| useEnableBankingSyncStatus accepts Actual UUIDs                                        | UI always has account.id (Actual UUID), never the internal EB UID - IPC layer handles mapping                                                                                                | 2026-02-19 |
| EU merchant rules look up category by name not UUID                                    | Adapts to any budget's category setup without hardcoding UUIDs - missing categories skipped gracefully                                                                                       | 2026-02-19 |
| 5-field cron `0 0,6,12,18 * * *` preferred over 6-field node-cron v4 format          | 5-field form is version-stable and easier to verify; 6-field second-precision format is node-cron-version-sensitive                                                                          | 2026-03-01 |
| Session-grouped sync loop: consent expiry checked once per bank connection              | One OAuth session = one bank connection = one group. Prevents per-account consent checks (wasteful) and ensures one session's failure doesn't block other users.                             | 2026-03-01 |
| RateLimitError breaks session account loop without sleep                               | 429 applies to entire API connection. Sleeping 30s per account compounds to N*30s (e.g. 50 accounts = 25 minutes). Break immediately and continue to next session.                          | 2026-03-01 |
| closeAccountDb() + EBUSY catch in vitest teardown                                     | Windows holds SQLite file handle during teardown rm. closeAccountDb() releases the singleton; EBUSY catch handles race where worker-held handle lingers. Test results recorded before teardown. | 2026-03-01 |
| useConsentExpiry() hook encapsulates all data fetching and grouping; banner is pure render | Self-contained hook pattern avoids prop drilling: banner needs no props, just drop into JSX. Groups by session_id server-side concept makes sessions the unit of re-auth. | 2026-03-01 |
| useRef mutex for isSyncingRef in FinancesApp visibility/focus handler (not closure-scoped let) | useRef survives effect re-creation when staleThresholdHours dep changes. Closure-scoped let would be reset on each re-creation, allowing concurrent syncs during dep-triggered effect restart. | 2026-03-01 |
| Re-auth modal pre-fills country and bank from props to bypass picker and prevent silent abort | onJump() has guard: if (!selectedBankId || !country) return. In re-auth mode, user should not see the picker - pre-fill ensures the guard is satisfied immediately. | 2026-03-01 |
| aspsp_country added as Plan 01 amendment to /sync-status (trivial JOIN column addition) | No schema change needed - eb_sessions already has aspsp_country column. Required for re-auth createAuth() country param from client side. | 2026-03-01 |

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

### Roadmap Evolution

- Phase 04.1 inserted after Phase 4: Audit Quick Wins (URGENT) - from project audit 2026-03-03
- Phase 04.2 inserted after Phase 4: Dependency Security Updates (URGENT) - trivy CVEs
- Phase 05.1 inserted after Phase 5: Accessibility Overhaul (URGENT) - WCAG/EU Accessibility Act
- Phase 05.2 inserted after Phase 5: Security Hardening (URGENT) - PBKDF2, OpenID, password strength
- Phase 6 added: Design Refinement - alert surfaces, design system consistency
- Phase 7 added: Observability and Monitoring - error tracking, alerting, audit logging
- Phase 8 added: Quality and Test Infrastructure - code splitting, coverage, E2E
- Phase 9 added: Feature Expansion - 2FA/TOTP, backup automation

## Open Questions

- What is the exact reason the service worker build is disabled in `vite.config.mts`? (Determines Phase 4 approach)
- Has the GoCardless adapter been refactored or removed since July 2025? (Determines Phase 1 starting point for Plan 01-02)
- Cloudflare Tunnel vs LAN-only + Caddy: which approach for phone HTTPS access? (Determines Phase 5 approach for iOS)
- Docker volume path behavior on WSL2 Docker Desktop: verify named volume behavior on setup day

## Non-GSD Work (Feb 25-28)

Work outside the Enable Banking GSD roadmap that affects the codebase:

### Buddy Redesign (Feb 25-26)

- Dark theme with warm-neutral + purple accent palette
- New color palette defined in `palette.ts`
- UI component styling updates across desktop-client

### Tech Debt Remediation / Upstream Merge (Feb 26-27)

- Merged upstream actualbudget/actual into fork (PR #2)
- Replaced prettier/eslint with oxfmt/oxlint (matching upstream)
- Added knip dead-code workflow (informational, `--no-exit-code`)
- Restored local `titleFirst`/`boolToInt` utils that upstream removed
- Squash-merged via `chore/techdebt-remediation` branch

### CI Fixes (Feb 27-28)

- Split lint job: oxfmt `--check` (hard fail) + oxlint (informational `|| true`)
- E2E tests remain disabled (`if: false`) due to pre-existing Playwright browser version mismatch (`chromium_headless_shell-1208` missing from `mcr.microsoft.com/playwright:v1.57.0-jammy`)
- Autofix workflow disabled (pre-existing upstream oxlint errors)
- Repo made public, GitHub Actions unlimited free minutes
- Branch protection configured on master
- Merged Dependabot PRs for dependency updates

### Repository State Changes

- Repo visibility: private -> public
- CI status: lint, typecheck, test, validate-cli all passing (PR #6 green)
- Formatter: oxfmt (not prettier, despite `.prettierrc` still existing)

## Session Continuity

**Stopped at:** Completed 04.2-01-PLAN.md (Phase 04.2 fully complete - 1/1 plans done)

**Next action:** Execute Phase 05.1 Accessibility Overhaul or Phase 05.2 Security Hardening (both URGENT).

**Phase 2 E2E verification results (browser automation, 2026-03-01):**

- OAuth redirect chain: Actual -> EB consent -> Mock ASPSP sign-in (PASS)
- Account linking: 2 accounts linked in eb_account_map (PASS)
- Multi-session: 6 sessions across Mock ASPSP + OP (PASS)
- Sync logging: eb_sync_log entries with ok status (PASS)
- Balance display: UI shows 5,349.37 for MEIKÄLÄINEN MATTI (PASS)
- Dedup/pending-booked/category rules: DEFERRED (sandbox returns 0 transactions, verified in code)

**Sandbox credentials:**

- Application ID: `b619fe6c-ab92-4de5-a7c2-901c0e0ef580`
- Private key: `secrets/eb_private.pem` (PKCS#8, RS256)
- Redirect URL: `http://localhost:5006/enablebanking/callback`
- API base: `https://api.enablebanking.com`

---

_State initialized: 2026-02-18_
_Last updated: 2026-03-01 - Phase 02 complete (E2E verification via browser automation, 5/8 tests PASS, 3 deferred to Phase 5)_
