# Actual Budget Fork - Enable Banking Edition

## What This Is

A self-hosted personal finance app forked from Actual Budget, with automatic EU bank sync powered by Enable Banking's API. Replaces the defunct GoCardless integration that stopped accepting new accounts in July 2025. Accessible as a web app on desktop Chrome and as an installable PWA on mobile.

## Core Value

Automatic bank transaction sync that works for EU accounts without manual data entry. If everything else fails, transactions must flow from the bank into the app without me touching anything.

## Requirements

### Validated

(None yet - ship to validate)

### Active

- [ ] Fork Actual Budget (latest release) and self-host via Docker with sync-server
- [ ] Build Enable Banking integration replacing GoCardless bank sync adapter
- [ ] Sync bank transactions automatically 4x/day (max PSD2 allows)
- [ ] Update balances with each sync
- [ ] Handle PSD2 consent renewal with in-app notification (consents expire every 90 days)
- [ ] Make the app a PWA (manifest, service worker, app icons, installable on phone)
- [ ] Ensure responsive UI on mobile (no horizontal scrolling, no cut-off elements)
- [ ] Multi-device sync between phone and desktop via sync-server
- [ ] Offline viewing of previously loaded data on phone
- [ ] Docker Compose deployment with HTTPS termination for PWA support

### Out of Scope

- Custom UI themes or redesigns - future project, keep existing Actual Budget style
- Payment initiation - read-only bank access only
- Native mobile app (React Native, Flutter) - PWA is sufficient
- Push notifications - nice to have later, not required now
- Multi-user support - personal use only
- Contributing upstream to Actual Budget - maybe later
- App store publishing - PWA installs directly from browser

## Context

### Why This Exists

GoCardless (formerly Nordigen) stopped accepting new accounts for EU bank sync in July 2025. Enable Banking covers 4,709+ bank APIs across 29+ EEA countries and is free for personal/restricted use (no contract or KYB process needed).

### Actual Budget Architecture

- Monorepo: Yarn 4 workspaces, TypeScript + React + SQLite + Vite
- Key packages:
  - `desktop-client`: React UI (components in `src/components/`)
  - `loot-core`: business logic, DB, calculations (platform-agnostic)
  - `sync-server`: Express server for multi-device sync
  - `component-library`: shared UI primitives, theme, design tokens
  - `api`: Node.js API for integrations/automation
- Bank sync code is modular with existing GoCardless adapter pattern to follow
- Web app may already have some PWA support or responsive design - investigate before adding from scratch

### Enable Banking API

- REST API with JWT Bearer auth (RSA key pair needed)
- Auth flow: POST /auth -> user redirects to bank login -> callback with auth code -> POST /sessions -> get account IDs + session -> GET /accounts/{id}/transactions and /balances
- Returns: booking date, amount, currency, creditor/debtor info, remittance info, credit/debit indicator, status
- Sandbox available for testing (mock ASPSP)
- Production: "restricted mode" for personal accounts, no contract needed
- Not yet signed up - account creation and sandbox testing needed first

### Deployment

- Docker Compose on local Windows machine (Docker Desktop)
- Phone access method TBD (options: Tailscale, Cloudflare Tunnel, or LAN-only)
- HTTPS termination needed for PWA (Caddy, nginx + Let's Encrypt, or Cloudflare Tunnel)

## Constraints

- **Tech stack**: Must stay within Actual Budget's existing stack (TypeScript, React, SQLite, Vite, Yarn 4)
- **Fork base**: Latest stable release of Actual Budget
- **Bank API limits**: PSD2 permits max 4 API calls per day per bank connection
- **Consent expiry**: PSD2 consents expire every 90 days, must handle renewal
- **PWA requirements**: HTTPS mandatory, service worker needed for offline + installability
- **Platform**: Development on Windows + MSYS bash, deployment via Docker

## Key Decisions

| Decision                            | Rationale                                                                                | Outcome   |
| ----------------------------------- | ---------------------------------------------------------------------------------------- | --------- |
| Enable Banking over GoCardless      | GoCardless stopped accepting EU users July 2025, Enable Banking is free for personal use | - Pending |
| PWA over native mobile app          | Lower complexity, single codebase, sufficient for personal use                           | - Pending |
| Fork latest stable release          | Stable base, avoid unreleased breaking changes                                           | - Pending |
| Docker Desktop on local machine     | Simple setup, no ongoing hosting costs                                                   | - Pending |
| In-app or cron-based scheduled sync | Architecture-dependent, decide during research                                           | - Pending |

---

_Last updated: 2026-02-18 after initialization_
