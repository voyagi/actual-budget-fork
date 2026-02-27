# Feature Landscape

**Domain:** Self-hosted personal finance app with EU bank sync (PSD2) and PWA
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH (official docs + community sources confirmed most claims)

## What Actual Budget Already Provides

These features exist in the fork base. Do NOT rebuild them.

| Feature                         | Notes                                                   |
| ------------------------------- | ------------------------------------------------------- |
| Envelope/zero-based budgeting   | Core Actual Budget feature                              |
| Account management (CRUD)       | Create, edit, delete accounts                           |
| Transaction CRUD                | Full create/read/update/delete                          |
| Transaction categorization      | Manual + rules engine                                   |
| Custom rules engine             | Pattern matching, auto-assign categories/payees         |
| Manual import (OFX/QIF/CSV)     | File-based import with duplicate detection              |
| Duplicate detection             | By `imported_id` or fuzzy match (amount + date + payee) |
| Manual merge of duplicates      | User selects two matching transactions, presses G       |
| Multi-device sync               | Via sync-server (Express + SQLite)                      |
| Reporting/charts                | Built-in spending/budget reports                        |
| Mobile-responsive pages         | Ongoing effort, most pages now mobile-ready (375px min) |
| Workbox service worker          | Already introduced for plugin caching                   |
| Bank sync adapter pattern       | GoCardless/SimpleFIN/Pluggy adapters exist to copy      |
| End-to-end encryption           | For sync-server data at rest                            |
| API package (`@actual-app/api`) | Used by community auto-sync tools                       |

**Critical finding (MEDIUM confidence):** Actual Budget has a Workbox service worker and partial PWA support already. Do NOT assume it is missing - investigate the current `desktop-client` source before adding from scratch. The icons were enhanced to align with desktop recently (#6204), suggesting manifest work is in progress.

## Table Stakes

Features that must exist for the bank sync integration to feel complete. Missing any of these and the product feels broken.

| Feature                                | Why Expected                                                                                            | Complexity | Notes                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Enable Banking OAuth redirect flow     | The only way to authorize bank access under PSD2. Without it, zero transactions sync.                   | Medium     | POST /auth -> redirect to bank -> POST /sessions. Follows existing GoCardless adapter pattern.                                                 |
| Transaction auto-import                | Core stated goal. Manual sync defeated by "automatic" in project requirements.                          | Medium     | Uses `importTransactions` API, which already handles duplicate checking.                                                                       |
| Balance update on sync                 | Users expect account balances to reflect bank reality after sync.                                       | Low        | GET /accounts/{id}/balances is one API call per account.                                                                                       |
| Scheduled sync (4x/day)                | PSD2 maximum rate. Without scheduling, auto-import is meaningless.                                      | Medium     | Cron-based (e.g., every 6h) running inside Docker Compose alongside sync-server. Community tool `actual-auto-sync` proves the pattern.         |
| Consent expiry notification            | PSD2 consents expire (180 days EU, 90 days UK). Silent expiry means sync stops with no explanation.     | Medium     | In-app banner or alert when consent is within N days of expiry (14 days is standard). Requires storing consent expiry date per linked account. |
| Consent renewal flow                   | When consent expires, user needs a guided re-authorization flow. Identical to initial auth flow.        | Low        | Reuse the OAuth redirect flow. Trigger from expiry notification.                                                                               |
| Account linking UI                     | User must be able to select which bank account maps to which Actual account.                            | Medium     | POST /auth returns a list of bank accounts after consent. Must store session_id + account_id mappings persistently.                            |
| Error surfacing for sync failures      | Bank APIs fail. Network drops. Session expires mid-sync. Silent failures are worse than visible errors. | Medium     | Show last-synced timestamp + last error message per account in the UI.                                                                         |
| HTTPS for PWA                          | Service workers require HTTPS. PWA install prompt requires HTTPS.                                       | Low        | Handled at infrastructure level (Caddy/Cloudflare Tunnel). Not a code feature, but a deployment prerequisite.                                  |
| Web app manifest                       | Required for PWA installability (name, icons 192px + 512px, start_url, display: standalone).            | Low        | May already partially exist. Verify before building.                                                                                           |
| Service worker (offline read)          | Required for offline viewing of cached budget data on mobile.                                           | Medium     | Workbox already present. Strategy: cache-first for app shell + static assets, network-first for data.                                          |
| Installable on Android/iOS home screen | The "mobile installability" done criterion. Requires manifest + HTTPS + service worker (Chrome).        | Low        | Follows from manifest + HTTPS + existing service worker.                                                                                       |

## Differentiators

Nice to have for this project specifically. Not expected by the base Actual Budget user, but valuable for this fork's use case.

| Feature                           | Value Proposition                                                                                                          | Complexity | Notes                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------- |
| Pending transaction display       | Shows in-flight transactions before they clear. Enable Banking returns pending status.                                     | Low        | Filter by `status: PDNG` vs `BOOK`. Surface as a visual indicator in the transaction list.  |
| Per-account last-synced timestamp | Makes it clear when data was last refreshed. Builds trust in the sync.                                                     | Low        | Store in DB alongside account mapping. Display in account view.                             |
| Sync log / history                | Useful for debugging sync failures after the fact. Shows which runs succeeded, how many transactions were imported.        | Medium     | Simple append-only log stored in SQLite. Not critical for v1 but useful for debugging.      |
| Multi-bank support                | Link more than one bank under separate Enable Banking sessions.                                                            | Low-Medium | The adapter pattern naturally supports this - each account has its own session_id mapping.  |
| PWA splash screen / theme color   | Makes the installed PWA feel more polished and app-like.                                                                   | Low        | `theme_color` and `background_color` in manifest + screenshot metadata.                     |
| Sync-on-open trigger              | On app load, trigger a sync if last sync was more than 6 hours ago. Complements the cron schedule for immediate freshness. | Medium     | Requires tracking last_sync_time and calling the sync API from the frontend or sync-server. |

## Anti-Features

Things to explicitly NOT build in v1. Most of these are scope creep risks given this is a personal-use project.

| Anti-Feature                                                            | Why Avoid                                                                                                                     | What to Do Instead                                                   |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Payment initiation                                                      | PSD2 read-only consent is what we need. Payment APIs require separate regulatory scope and testing.                           | Keep to AIS (Account Information Service) only.                      |
| Push notifications for consent expiry                                   | Requires a push server, VAPID keys, and notification permissions flow. Significant overhead for one notification type.        | In-app banner is sufficient. Show it prominently on login/dashboard. |
| Automatic consent renewal (no user action)                              | PSD2 requires Strong Customer Authentication (SCA) at the bank. The user MUST be redirected to the bank. Cannot bypass.       | Redirect flow is the only option.                                    |
| Multi-user support                                                      | Personal use only. Multi-user requires auth layer, per-user data isolation, and session scoping changes throughout the app.   | Single-user self-hosted is the target.                               |
| Webhook-based real-time sync                                            | Enable Banking does not document push webhooks in their public API. PSD2 rate limits (4x/day) make polling the correct model. | Scheduled cron sync at 4x/day max.                                   |
| Native mobile app (iOS/Android)                                         | Requires separate codebase, app store accounts, and review process. PWA covers the mobile use case.                           | PWA with home screen install.                                        |
| Transaction categorization AI                                           | Actual Budget's existing rules engine handles auto-categorization. Adding ML or API calls for this is out of scope.           | Configure Actual's existing rules for common payees.                 |
| Sharing / export to accountants                                         | Out of scope for personal use. Actual Budget has CSV export if ever needed.                                                   | Use existing manual export.                                          |
| Automatic HTTPS certificate management via Let's Encrypt within the app | Caddy or Cloudflare Tunnel handles this at infrastructure level. Baking cert management into the app adds maintenance burden. | Deploy Caddy as a reverse proxy in Docker Compose.                   |
| Custom UI themes / redesign                                             | Adds significant UI work with no functional benefit. Existing Actual Budget design is mature.                                 | Keep stock Actual Budget styling throughout.                         |

## Feature Dependencies

```
Enable Banking OAuth flow
  -> Account linking UI (must complete auth before mapping accounts)
    -> Transaction auto-import (requires account_id + session_id)
      -> Scheduled sync 4x/day (requires import to work first)
        -> Sync-on-open trigger (optional, enhances scheduled sync)
    -> Balance update on sync (parallel with transaction import)
    -> Consent expiry storage (store expiry date from session response)
      -> Consent expiry notification (requires stored expiry date)
        -> Consent renewal flow (reuses OAuth flow, triggered from notification)

HTTPS (infrastructure)
  -> Service worker registration (browsers block SW on HTTP)
    -> Offline read (requires service worker with cache)
    -> PWA installability (requires HTTPS + manifest + SW)
      -> Home screen install (iOS/Android)

Web app manifest
  -> PWA installability (parallel with HTTPS + SW)

Error surfacing
  -> Per-account last-synced timestamp (timestamp is part of error state)
```

## MVP Feature Set

Build in this order (each unlocks the next):

1. **Enable Banking OAuth redirect flow** - The entire integration hangs on this. Nothing else works until auth works.
2. **Account linking UI** - Maps bank accounts to Actual accounts. Required before any import.
3. **Transaction auto-import + balance update** - The core value. Single manual sync first, then schedule.
4. **Consent expiry storage + notification** - Store expiry date from session response. Show banner N days before expiry.
5. **Scheduled sync (4x/day via cron)** - Automates what the manual sync does. Docker Compose cron container or interval-based trigger in sync-server.
6. **Consent renewal flow** - Reuse auth flow. Triggered from the expiry banner.
7. **HTTPS + web app manifest** - Infrastructure prerequisite for PWA. Manifest may be partially complete already.
8. **Offline read (service worker)** - Workbox already exists. Configure caching strategy for app shell + data.
9. **Error surfacing per account** - Last sync time + last error message. Polish, but important for trust.

**Defer:**

- Sync log / history: useful but not blocking. Add in phase 2.
- Sync-on-open trigger: nice, adds complexity, defer until scheduled sync is proven stable.
- Pending transaction display: low complexity but low priority for v1.

## Consent Validity Clarification

**Important nuance (MEDIUM confidence - multiple sources agree):** The original project doc says "90-day consent expiry" but PSD2 was extended in July 2023. EU bank consents now expire at 180 days (not 90). UK banks remain at 90 days (but this is an EU-only project targeting EEA banks). The Enable Banking October 2025 changelog confirms this: "default consent validity increased from 90 to 180 days as more banks adopted this standard under PSD2."

Build the notification system to read the actual expiry date from the Enable Banking session response (which returns `maximum_consent_validity` per ASPSP) rather than hardcoding 90 days.

## Sources

- [Actual Budget bank sync docs](https://actualbudget.org/docs/advanced/bank-sync/) - GoCardless stopped new accounts July 2025, sync is manual today
- [Actual Budget release notes](https://actualbudget.org/docs/releases/) - PWA/mobile improvements, Workbox service worker (#5784), mobile bank sync settings (#5978)
- [Actual Budget merging duplicates](https://actualbudget.org/docs/transactions/merging/) - Manual merge flow, priority rules
- [Enable Banking API reference](https://enablebanking.com/docs/api/reference/) - Endpoints, session management, transaction schema
- [Enable Banking changelog October 2025](https://enablebanking.com/blog/2025/11/05/enable-banking-changelog-october-2025) - Consent validity now 180 days default
- [actual-auto-sync community tool](https://github.com/seriouslag/actual-auto-sync) - Proves cron + Actual API pattern for scheduled sync
- [PSD2 consent 180 days extension](https://www.enablenow.nl/en/blog/psd2-consent-to-180-days) - EU extended from 90 to 180 days July 2023
- [UK vs EU consent comparison](https://www.saasant.com/blog/uk-eu-open-banking-consent-feed-break-fix/) - UK stays 90 days, EU is 180 days
- [PWA install criteria](https://web.dev/articles/install-criteria) - HTTPS + manifest + icons 192/512px + start_url + display
- [MDN PWA caching](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching) - Cache-first for app shell, network-first for data
- [Actual Budget mobile RFC](https://github.com/actualbudget/actual/issues/804) - Mobile strategy discussion, PWA approach confirmed
