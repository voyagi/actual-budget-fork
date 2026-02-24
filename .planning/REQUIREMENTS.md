# Requirements: Actual Budget Fork - Enable Banking Edition

**Defined:** 2026-02-18
**Core Value:** Automatic bank transaction sync that works for EU accounts without manual data entry

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [ ] **FOUND-01**: User can build and run the forked Actual Budget repo in Docker with no errors
- [ ] **FOUND-02**: User can open the app in Chrome on Windows and create a budget
- [x] **FOUND-03**: RSA key pair is generated and file-mounted as a Docker secret for Enable Banking auth
- [x] **FOUND-04**: Fork commit convention established (all custom commits tagged with `[eb]` prefix)

### Bank Sync

- [x] **SYNC-01**: User can initiate Enable Banking OAuth flow and authorize bank access via redirect to their bank's login page
- [ ] **SYNC-02**: User can link bank accounts to Actual accounts after OAuth authorization completes
- [x] **SYNC-03**: User can trigger a manual sync that imports transactions from linked bank accounts with deduplication (handles pending-to-booked state transitions)
- [x] **SYNC-04**: Account balances update automatically with each sync
- [x] **SYNC-05**: User can see pending vs booked status on imported transactions (visual indicator for PDNG vs BOOK)
- [x] **SYNC-06**: User can link multiple banks under separate Enable Banking sessions
- [x] **SYNC-07**: User can see last sync status and error message per account in the UI
- [x] **SYNC-08**: Sync runs are logged to an append-only history for debugging
- [ ] **SYNC-09**: App ships with pre-populated categorization rules for common EU merchants and payees (grocery chains, utilities, subscriptions, transport) that auto-assign categories on import

### Automation

- [ ] **AUTO-01**: Transactions sync automatically 4x/day without manual intervention (node-cron scheduler)
- [ ] **AUTO-02**: Consent expiry date is stored from Enable Banking session response (reads `maximum_consent_validity` per bank, not hardcoded)
- [ ] **AUTO-03**: User sees an in-app banner when PSD2 consent is within 14 days of expiry
- [ ] **AUTO-04**: User can re-authorize bank access through the consent renewal flow (reuses OAuth redirect)
- [ ] **AUTO-05**: App triggers a sync on open if last sync was more than 6 hours ago
- [ ] **AUTO-06**: User can see per-account last-synced timestamp in the account view

### PWA

- [ ] **PWA-01**: Web app manifest is complete (name, icons 192px + 512px, start_url, display: standalone, theme_color)
- [ ] **PWA-02**: Service worker provides offline read of previously loaded budget data (cache-first for app shell, network-first for data)
- [ ] **PWA-03**: User can install the app on Android home screen from Chrome and it launches without browser chrome
- [ ] **PWA-04**: User can install the app on iOS home screen from Safari and it launches without browser chrome
- [ ] **PWA-05**: UI is usable on mobile without horizontal scrolling or cut-off elements (verify existing responsive design)
- [ ] **PWA-06**: Installed PWA has a polished splash screen and branded theme color

### Infrastructure

- [ ] **INFRA-01**: Docker Compose deploys sync-server + desktop-client + Caddy in a single `docker compose up`
- [ ] **INFRA-02**: HTTPS termination via Caddy with automatic local CA (or Cloudflare Tunnel for phone access)
- [ ] **INFRA-03**: Multi-device sync works (phone and desktop see the same budget data via sync-server)
- [ ] **INFRA-04**: Docker volumes persist data across container restarts (verified explicitly)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Notifications

- **NOTF-01**: User receives push notifications for consent expiry (requires VAPID keys + notification permissions)
- **NOTF-02**: User receives push notifications for sync failures

### Advanced Sync

- **ASYN-01**: User can configure sync frequency per bank account
- **ASYN-02**: User can view detailed transaction metadata from Enable Banking (full remittance info, creditor/debtor details)

### Upstream Maintenance

- **MAINT-01**: Monthly upstream sync procedure documented and tested
- **MAINT-02**: Automated upstream merge conflict detection (CI check)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                    | Reason                                                                            |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| Custom UI themes / redesign                | Future project, keep existing Actual Budget style unchanged                       |
| Payment initiation                         | Read-only bank access only (AIS). Payment APIs require separate regulatory scope  |
| Native mobile app (React Native, Flutter)  | PWA is sufficient for personal use                                                |
| Multi-user support                         | Personal use only. Would require auth layer + per-user data isolation             |
| Contributing upstream to Actual Budget     | Maybe later, not a goal for v1                                                    |
| App store publishing                       | PWA installs directly from browser                                                |
| Automatic consent renewal (no user action) | PSD2 requires Strong Customer Authentication at the bank. User MUST be redirected |
| Webhook-based real-time sync               | Enable Banking does not support webhooks. PSD2 rate limits make polling correct   |
| Transaction categorization AI/ML           | Actual Budget's rules engine + pre-populated EU merchant rules covers this        |
| Let's Encrypt cert management in the app   | Caddy or Cloudflare Tunnel handles this at infrastructure level                   |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase   | Status   |
| ----------- | ------- | -------- |
| FOUND-01    | Phase 1 | Pending  |
| FOUND-02    | Phase 1 | Pending  |
| FOUND-03    | Phase 1 | Complete |
| FOUND-04    | Phase 1 | Complete |
| SYNC-01     | Phase 2 | Complete |
| SYNC-02     | Phase 2 | Pending  |
| SYNC-03     | Phase 2 | Complete |
| SYNC-04     | Phase 2 | Complete |
| SYNC-05     | Phase 2 | Complete |
| SYNC-06     | Phase 2 | Complete |
| SYNC-07     | Phase 2 | Complete |
| SYNC-08     | Phase 2 | Complete |
| SYNC-09     | Phase 2 | Pending  |
| AUTO-01     | Phase 3 | Pending  |
| AUTO-02     | Phase 3 | Pending  |
| AUTO-03     | Phase 3 | Pending  |
| AUTO-04     | Phase 3 | Pending  |
| AUTO-05     | Phase 3 | Pending  |
| AUTO-06     | Phase 3 | Pending  |
| PWA-01      | Phase 4 | Pending  |
| PWA-02      | Phase 4 | Pending  |
| PWA-03      | Phase 4 | Pending  |
| PWA-04      | Phase 4 | Pending  |
| PWA-05      | Phase 4 | Pending  |
| PWA-06      | Phase 4 | Pending  |
| INFRA-01    | Phase 5 | Pending  |
| INFRA-02    | Phase 5 | Pending  |
| INFRA-03    | Phase 5 | Pending  |
| INFRA-04    | Phase 5 | Pending  |

**Coverage:**

- v1 requirements: 29 total
- Mapped to phases: 29
- Unmapped: 0

---

_Requirements defined: 2026-02-18_
_Last updated: 2026-02-18 after Plan 01-04 (FOUND-04 marked complete)_
