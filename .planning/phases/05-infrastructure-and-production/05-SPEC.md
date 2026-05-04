# Phase 05: Infrastructure and Production - Specification

**Created:** 2026-05-04
**Ambiguity score:** 0.17 (gate: <= 0.20)
**Requirements:** 8 locked

## Goal

Phase 5 changes the fork from a locally configured integration into a production-ready deployment whose HTTPS access, persistence, multi-device sync, real-bank sync, and production trust state can be verified and recovered deterministically.

## Background

The project is a self-hosted Actual Budget fork for automatic EU bank transaction sync through Enable Banking. Earlier work added Enable Banking OAuth, manual and scheduled sync, consent warnings, PWA support, operational alerts, and the first Phase 5 production stack plan. Current Phase 5 assets already include a root `docker-compose.yml` with `sync-server`, `caddy`, and `cloudflared`, a root `Caddyfile`, and `.env.example` entries for Caddy and Cloudflare Tunnel.

The remaining gap is not another deployment primitive. The open requirements added on 2026-05-04 are `INFRA-05` and `INFRA-06`: the app must treat failed or stale production health signals as a whole-app trust problem, show a warning without blocking usage, and clear that warning only after an automated recovery check or a verified manual fix.

## Requirements

1. **Single-command production stack**: One Compose command starts the production stack needed for app access and bank sync.
   - Current: `docker-compose.yml` defines `sync-server`, `caddy`, and `cloudflared`; Plan 05-01 completed the stack definition, but final production verification is not complete.
   - Target: Running the project production Compose file starts all required services with no manual container commands after environment values and secrets are provided.
   - Acceptance: A verifier runs Compose config validation, starts the stack, and sees `sync-server`, `caddy`, and `cloudflared` running with no exited or restart-looping services.

2. **Trusted HTTPS access**: Desktop and phone access use trusted HTTPS paths appropriate to each device.
   - Current: Caddy is configured for LAN HTTPS and Cloudflare Tunnel is configured for phone/iOS HTTPS, but device-level verification remains pending.
   - Target: Desktop Chrome can load the app through the Caddy HTTPS URL, and a phone browser can load the app through the Cloudflare Tunnel URL without certificate warnings.
   - Acceptance: Desktop Chrome and phone Safari or Chrome both show a valid HTTPS page load, and direct raw HTTP access to the sync-server host port is not part of the production access path.

3. **Persistent production data**: Budget data and production infrastructure state survive container restarts.
   - Current: `actual_data`, `caddy_data`, and `caddy_config` named volumes are defined, but restart verification is still pending.
   - Target: Budgets, accounts, transactions, and Caddy trust state remain intact after a full Compose down/up cycle that preserves named volumes.
   - Acceptance: A verifier creates or identifies budget data, runs `docker compose down` followed by `docker compose up`, and confirms the same data is still present and the Caddy HTTPS URL does not require a new trust setup.

4. **Multi-device sync verification**: Desktop and phone clients read and write the same budget through the production stack.
   - Current: Sync-server exists and phone/desktop access routes are configured, but Phase 5 has no completed two-device production verification.
   - Target: A transaction entered on desktop appears on phone, and a transaction entered on phone appears on desktop, using the same budget data through the production deployment.
   - Acceptance: A verifier creates a desktop transaction and a phone transaction, reloads the opposite device after each change, and confirms both transactions are visible.

5. **Production Enable Banking OAuth**: The production Enable Banking application connects at least one real bank account through the production URL.
   - Current: Sandbox credentials and OAuth flow exist; production app registration, production redirect URL, and real-bank OAuth remain human checkpoints.
   - Target: The production Enable Banking app is active for restricted personal use, uses the production Cloudflare Tunnel callback URL, and returns real bank accounts to the app for linking.
   - Acceptance: A verifier completes OAuth at a real bank using the production URL and sees at least one real bank account available to link to an Actual account.

6. **Real-bank transaction sync**: Production bank sync imports real transactions and records sync state.
   - Current: Manual and scheduled Enable Banking sync paths exist, including `eb_sync_log`, `last_sync`, `/sync-status`, and operational sync-failure alerts; real-bank production sync is not yet verified.
   - Target: At least one linked real bank account imports transactions or confirms a successful no-new-transactions sync, updates account sync state, and records a sync log entry.
   - Acceptance: A verifier links a real bank account, triggers manual sync, confirms the Actual account reflects the bank sync result, and confirms a scheduled or equivalent automatic sync run completes and records status.

7. **Whole-app production trust warning**: Any stale or untrusted production condition creates an app-wide warning while leaving the app usable.
   - Current: The app has sticky Notifications, operational alerts for sync failures, consent expiry, and login failure bursts, plus background stale bank-sync checks; there is no single production trust contract covering access, persistence, multi-device sync, and bank-sync state.
   - Target: If production access, data persistence, multi-device sync, or bank sync is stale, failed, or unverified, the app shows a whole-app warning that remains visible across normal budget workflows and does not prevent reading budgets or entering transactions.
   - Acceptance: A verifier simulates or records a stale/untrusted condition in each class: access, persistence, multi-device sync, and bank sync. Each condition produces a visible warning, and the user can still navigate budgets and create a transaction while the warning is present.

8. **Deterministic trust recovery**: Production trust warnings clear only after recovery has been verified.
   - Current: Existing operational alerts can be acknowledged by dismissal; that is not strict enough for production trust state.
   - Target: A production trust warning remains active until either an automated recovery check passes for the affected condition or a manual verification step marks the fix as verified. Local dismissal, reload, or elapsed time alone does not clear it.
   - Acceptance: A verifier triggers a trust warning, tries to dismiss or reload without fixing it and confirms the warning remains or returns, then performs an automated passing check or verified manual fix and confirms the warning clears.

## Boundaries

**In scope:**
- Production Compose verification for `sync-server`, `caddy`, and `cloudflared`
- Desktop HTTPS verification through Caddy
- Phone HTTPS verification through Cloudflare Tunnel
- Docker named-volume persistence verification
- Two-device budget sync verification
- Production Enable Banking OAuth with a real bank account
- Manual and automatic real-bank sync verification
- Whole-app production trust warning behavior for access, persistence, multi-device sync, and bank sync
- Warning recovery behavior for automated recovery checks and verified manual fixes

**Out of scope:**
- Payment initiation - the project remains read-only account information access
- Native mobile app work - PWA remains the mobile strategy
- App store publishing - browser install remains sufficient
- Automatic PSD2 consent renewal without user action - bank SCA still requires redirect
- New bank-sync providers beyond Enable Banking - not needed for Phase 5
- Custom certificate tooling - Caddy and Cloudflare Tunnel own HTTPS handling
- New push notification infrastructure - in-app warning behavior is enough for this phase
- Broad UI redesign - the warning must fit the existing app style
- Upstream contribution work - this fork's production readiness is the objective

## Constraints

- The production stack must stay a single Compose-based deployment using existing project Docker conventions.
- The sync-server must not be exposed as a raw HTTP production access path when Caddy and Cloudflare Tunnel are active.
- Phone/iOS production access must use globally trusted HTTPS; Caddy local CA is not sufficient for iOS trust.
- Production Enable Banking registration and real-bank authorization remain human checkpoints.
- Bank sync must respect the existing scheduled sync model and PSD2 rate-limit assumptions.
- Trust warnings must be non-blocking: data entry and budget viewing remain possible while warning state is active.
- Trust warnings must not clear from local dismissal alone when the underlying condition is still untrusted.
- User-facing warning text must be translatable and must follow the existing Actual Budget design system.

## Acceptance Criteria

- [ ] Compose config validation passes for the production Compose file.
- [ ] Starting the production stack shows `sync-server`, `caddy`, and `cloudflared` running without restart loops.
- [ ] Desktop Chrome loads the Caddy HTTPS URL without a certificate warning after the expected trust setup.
- [ ] Phone Safari or Chrome loads the Cloudflare Tunnel URL without a certificate warning.
- [ ] The raw sync-server HTTP host port is not used as the production access path.
- [ ] Budget data and Caddy trust state survive a Compose down/up cycle that preserves named volumes.
- [ ] A desktop-created transaction appears on phone, and a phone-created transaction appears on desktop.
- [ ] Production Enable Banking OAuth completes with a real bank and returns linkable bank accounts.
- [ ] Manual real-bank sync imports transactions or records a successful no-new-transactions result for the linked account.
- [ ] A scheduled or equivalent automatic bank sync records a successful production sync status.
- [ ] A stale/untrusted access condition produces a whole-app warning and the app remains usable.
- [ ] A stale/untrusted persistence condition produces a whole-app warning and the app remains usable.
- [ ] A stale/untrusted multi-device sync condition produces a whole-app warning and the app remains usable.
- [ ] A stale/untrusted bank-sync condition produces a whole-app warning and the app remains usable.
- [ ] Dismissing, reloading, or waiting does not clear a production trust warning while its condition remains untrusted.
- [ ] A successful automated recovery check clears the affected production trust warning.
- [ ] A verified manual fix clears the affected production trust warning.

## Ambiguity Report

| Dimension           | Score | Min   | Status | Notes |
|---------------------|-------|-------|--------|-------|
| Goal Clarity        | 0.90  | 0.75  | Pass   | Goal now includes deployment verification and trust-state behavior. |
| Boundary Clarity    | 0.80  | 0.70  | Pass   | In-scope and out-of-scope lists separate production readiness from adjacent feature work. |
| Constraint Clarity  | 0.76  | 0.65  | Pass   | Device trust, Compose, EB human checkpoints, non-blocking warning, and clear rules are explicit. |
| Acceptance Criteria | 0.80  | 0.70  | Pass   | Acceptance checks cover stack, HTTPS, persistence, sync, EB, warning triggers, and recovery. |
| **Ambiguity**       | 0.17  | <=0.20| Pass   | Auto-selected defaults pass the gate. |

Status: Pass = met minimum, Below = below minimum and planner treats as assumption.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 0 | Initial assessment | What do ROADMAP.md and REQUIREMENTS.md already specify? | Initial scores: goal 0.78, boundary 0.65, constraint 0.68, acceptance 0.64; ambiguity 0.30. Gate did not pass because `INFRA-05` and `INFRA-06` were not integrated into Phase 5 roadmap criteria. |
| 1 | Researcher | What exists today related to Phase 5? | Auto-selected: keep the existing 3-service stack, Caddyfile, `.env.example`, sync-status, operational alerts, and notification surfaces as current baseline. The missing capability is production trust-state behavior. |
| 1 | Researcher | What is the delta between current state and target state? | Auto-selected: Phase 5 must verify original production stack criteria and add warning/recovery behavior for access, persistence, multi-device sync, and bank sync. |
| 2 | Simplifier | What is the simplest version that solves the core problem? | Auto-selected: one whole-app non-blocking trust warning contract with deterministic clear paths, not a broad observability redesign or push notification system. |
| 2 | Boundary Keeper | What explicitly will not be done? | Auto-selected: exclude native apps, payment initiation, automatic consent renewal, custom certificate tooling, push notifications, new providers, and broad redesign. |

---

*Phase: 05-infrastructure-and-production*
*Spec created: 2026-05-04*
*Next step: /gsd-discuss-phase 5 - implementation decisions for how to build what is specified above*
