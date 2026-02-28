# Roadmap: Actual Budget Fork - Enable Banking Edition

**Project:** Actual Budget Fork - Enable Banking Edition
**Core Value:** Automatic bank transaction sync that works for EU accounts without manual data entry
**Depth:** Comprehensive
**Created:** 2026-02-18

## Phases

- [-] **Phase 1: Foundation and API Client** - Fork is running, Enable Banking API client is sandbox-tested with RSA auth
- [ ] **Phase 2: Bank Sync Pipeline** - Full manual sync works end-to-end: OAuth, account linking, transaction import, balance update
- [ ] **Phase 3: Automation and Consent Lifecycle** - Sync runs 4x/day automatically, consent expiry is tracked and surfaced in the UI
- [ ] **Phase 4: PWA Completion** - App is installable on Android and iOS home screen with offline read support
- [ ] **Phase 5: Infrastructure and Production** - Docker Compose deploys the full stack with HTTPS, volume persistence verified, production Enable Banking credentials connected and smoke-tested

## Progress

| Phase                               | Plans Complete | Status                    | Completed |
| ----------------------------------- | -------------- | ------------------------- | --------- |
| 1. Foundation and API Client        | 4/4            | Awaiting human checkpoint | -         |
| 2. Bank Sync Pipeline               | 3/5            | In Progress               |           |
| 3. Automation and Consent Lifecycle | 0/?            | Not started               | -         |
| 4. PWA Completion                   | 0/?            | Not started               | -         |
| 5. Infrastructure and Production    | 0/?            | Not started               | -         |

## Phase Details

### Phase 1: Foundation and API Client

**Goal:** The forked Actual Budget repo builds and runs in Docker, RSA key auth with Enable Banking is verified against the sandbox, and fork hygiene discipline is established before any custom code is written.

**Depends on:** Nothing (first phase)

**Requirements:** FOUND-01, FOUND-02, FOUND-03, FOUND-04

**Success Criteria** (what must be TRUE when this phase completes):

1. Running `docker compose up` starts the sync-server and desktop-client with no build errors, and the user can open the app in Chrome and create a budget
2. An Enable Banking sandbox API call authenticated with the RSA key pair returns a 200 response (not a 401 or JWT error)
3. The RSA private key file survives a `docker compose down && docker compose up` cycle without being regenerated
4. Every custom commit in the repo carries an `[eb]` prefix tag distinguishing it from upstream commits

**Research flag:** Read `packages/sync-server/src/app-gocardless/` before implementing `app-enablebanking/` to confirm the current adapter interface (GoCardless may have been refactored since July 2025).

**Plans:** 4 plans

Plans:

- [x] 01-01-PLAN.md - Fork setup: upstream pull, git hygiene, Docker build, Chrome verification
- [x] 01-02-PLAN.md - Enable Banking sandbox registration (human action: credentials + RSA key)
- [x] 01-03-PLAN.md - Enable Banking API client scaffold, sandbox auth test, key persistence verification (awaiting Task 3 human checkpoint)
- [x] 01-04-PLAN.md - Gap closure: fix missing [eb] tag on commit 371f06e2e (FOUND-04)

### Phase 2: Bank Sync Pipeline

**Goal:** A user can connect a bank account through the Enable Banking OAuth flow, link it to an Actual account, trigger a manual sync, and see imported transactions with correct balances - with full deduplication of pending-to-booked state transitions.

**Depends on:** Phase 1

**Requirements:** SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05, SYNC-06, SYNC-07, SYNC-08, SYNC-09

**Success Criteria** (what must be TRUE when this phase completes):

1. User clicks "Add bank" in the UI, is redirected to their sandbox bank's login page, completes auth, and returns to the app with bank accounts visible and ready to link
2. User maps a bank account to an Actual account and triggers a manual sync that imports transactions into the correct account ledger
3. Running two syncs in a row does not create duplicate transactions (deduplication works across pending-to-booked transitions)
4. Account balances shown in Actual match the balances returned by the Enable Banking API after each sync
5. Each transaction in the ledger shows a visual indicator distinguishing pending (PDNG) from booked (BOOK) status
6. User can connect a second bank under a separate Enable Banking session without breaking the first connection
7. The account view shows last sync time and the most recent sync error (if any) for each linked account
8. Sync events are appended to a log file or DB table that can be inspected for debugging
9. Imported transactions from common EU merchants (grocery chains, utilities, subscriptions, transport) are automatically assigned categories via pre-populated rules

**Research flag:** Standard patterns. `processBankSyncDownload()` and `reconcileTransactions()` are shared loot-core APIs documented in the GoCardless adapter. No additional research needed.

**Plans:** 4/5 plans executed

Plans:

- [x] 02-01-PLAN.md - Sync-server data layer: DB migrations, service extensions, transaction normalizer
- [x] 02-02-PLAN.md - loot-core types and sync extension: AccountSyncSource, server-config, download function
- [x] 02-03-PLAN.md - Sync-server routes and loot-core IPC handlers: OAuth flow, transactions, sync status
- [x] 02-04-PLAN.md - Desktop UI and category rules: OAuth modal, account linking, EU merchant rules
- [ ] 02-05-PLAN.md - Docker rebuild and end-to-end sandbox verification (human checkpoint)

### Phase 3: Automation and Consent Lifecycle

**Goal:** Transactions sync automatically four times per day without user action, consent expiry is tracked per-bank from the session response, and users are notified in-app before consent expires so they can re-authorize before sync breaks.

**Depends on:** Phase 2

**Requirements:** AUTO-01, AUTO-02, AUTO-03, AUTO-04, AUTO-05, AUTO-06

**Success Criteria** (what must be TRUE when this phase completes):

1. Without any user action, new transactions appear in the app up to 4 times per day on the cron schedule (verified by checking sync timestamps across a day)
2. Opening the app after 6+ hours of inactivity triggers an automatic sync within seconds, before the user takes any manual action
3. Each linked account shows a "last synced" timestamp that updates after every sync run (automatic or manual)
4. When a bank session is within 14 days of its consent expiry date, a banner appears in the app prompting re-authorization
5. User clicks the re-authorization banner, completes the OAuth redirect at their bank, and sync resumes without data loss
6. The consent expiry date stored for each bank reflects the `maximum_consent_validity` from the Enable Banking session response - not a hardcoded 90 or 180 day value

**Plans:** TBD

### Phase 4: PWA Completion

**Goal:** The app is installable as a standalone PWA on both Android and iOS home screens, and previously loaded budget data is readable offline - resolving the existing service worker blockage in vite.config.mts rather than rebuilding from scratch.

**Depends on:** Phase 1 (can be developed in parallel with Phase 3)

**Requirements:** PWA-01, PWA-02, PWA-03, PWA-04, PWA-05, PWA-06

**Success Criteria** (what must be TRUE when this phase completes):

1. Chrome on Android shows the "Add to Home Screen" install prompt when visiting the app URL, and the installed app launches without browser chrome
2. Safari on iOS shows the "Add to Home Screen" option, and the installed app launches without browser chrome as a standalone app
3. With the phone in airplane mode, previously loaded budget data (accounts, transactions, budgets) is still readable in the installed PWA
4. The app UI is usable on a phone screen (375px+ width) with no horizontal scrolling and no elements clipped or overflowing their containers
5. The installed PWA on the home screen shows the correct app icon, branded splash screen, and theme color (not a blank white screen on launch)

**Research flag:** Read `packages/desktop-client/vite.config.mts` before planning this phase. The service worker build is known to be disabled - the reason for the disable determines the fix approach.

**Plans:** TBD

### Phase 5: Infrastructure and Production

**Goal:** A single `docker compose up` deploys the full stack with HTTPS that is trusted by both desktop Chrome and iOS Safari, data persists across restarts, multi-device sync works between phone and desktop, and production Enable Banking credentials are connected with at least one real bank account syncing successfully.

**Depends on:** Phases 1-4 all complete (production cutover requires proven sandbox integration)

**Requirements:** INFRA-01, INFRA-02, INFRA-03, INFRA-04

**Success Criteria** (what must be TRUE when this phase completes):

1. `docker compose up` starts sync-server, desktop-client, and Caddy in one command with no manual steps, and the app is accessible at an HTTPS URL
2. The HTTPS certificate is trusted by both desktop Chrome and iOS Safari (PWA install requires trusted cert on iOS - self-signed Caddy local CA is not sufficient for iOS)
3. A transaction entered on desktop is visible on the phone within seconds, and a transaction entered on the phone is visible on desktop (multi-device sync confirmed in both directions)
4. After `docker compose down && docker compose up`, all previously created budgets, accounts, and transactions are intact (volume persistence verified)
5. With production Enable Banking credentials and a real bank account connected, at least one automatic sync completes successfully and imports real transactions into the correct Actual account

**Note:** Production Enable Banking credentials require a separate registration at enablebanking.com/cp. This is distinct from the sandbox credentials used in Phases 1-3. Plan a dedicated smoke test milestone before marking this phase complete.

**Plans:** TBD

## Coverage

| Requirement | Phase   | Category       |
| ----------- | ------- | -------------- |
| FOUND-01    | Phase 1 | Foundation     |
| FOUND-02    | Phase 1 | Foundation     |
| FOUND-03    | Phase 1 | Foundation     |
| FOUND-04    | Phase 1 | Foundation     |
| SYNC-01     | Phase 2 | Bank Sync      |
| SYNC-02     | Phase 2 | Bank Sync      |
| SYNC-03     | Phase 2 | Bank Sync      |
| SYNC-04     | Phase 2 | Bank Sync      |
| SYNC-05     | Phase 2 | Bank Sync      |
| SYNC-06     | Phase 2 | Bank Sync      |
| SYNC-07     | Phase 2 | Bank Sync      |
| SYNC-08     | Phase 2 | Bank Sync      |
| SYNC-09     | Phase 2 | Bank Sync      |
| AUTO-01     | Phase 3 | Automation     |
| AUTO-02     | Phase 3 | Automation     |
| AUTO-03     | Phase 3 | Automation     |
| AUTO-04     | Phase 3 | Automation     |
| AUTO-05     | Phase 3 | Automation     |
| AUTO-06     | Phase 3 | Automation     |
| PWA-01      | Phase 4 | PWA            |
| PWA-02      | Phase 4 | PWA            |
| PWA-03      | Phase 4 | PWA            |
| PWA-04      | Phase 4 | PWA            |
| PWA-05      | Phase 4 | PWA            |
| PWA-06      | Phase 4 | PWA            |
| INFRA-01    | Phase 5 | Infrastructure |
| INFRA-02    | Phase 5 | Infrastructure |
| INFRA-03    | Phase 5 | Infrastructure |
| INFRA-04    | Phase 5 | Infrastructure |

**Total:** 29/29 v1 requirements mapped. No orphans.

---

_Roadmap created: 2026-02-18_
_Last updated: 2026-02-19 after Plan 02-01 complete (data layer, migrations, normalizer)_
