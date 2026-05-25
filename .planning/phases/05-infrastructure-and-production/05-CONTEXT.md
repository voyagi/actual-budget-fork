# Phase 5: Infrastructure and Production - Context

**Gathered:** 2026-05-04
**Status:** Ready for re-planning

<domain>
## Phase Boundary

Phase 5 verifies and hardens the production deployment path for this Actual Budget fork: single-command Compose startup, trusted HTTPS access on desktop and phone, persistent data, multi-device sync, production Enable Banking OAuth, real-bank sync, and whole-app production trust state. The original deployment topology from Plan 05-01 remains valid; the new work is the production trust-state behavior from `INFRA-05` and `INFRA-06`.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**8 requirements are locked.** See `.planning/phases/05-infrastructure-and-production/05-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `.planning/phases/05-infrastructure-and-production/05-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Production Compose verification for `sync-server`, `caddy`, and `cloudflared`
- Desktop HTTPS verification through Caddy
- Phone HTTPS verification through Cloudflare Tunnel
- Docker named-volume persistence verification
- Two-device budget sync verification
- Production Enable Banking OAuth with a real bank account
- Manual and automatic real-bank sync verification
- Whole-app production trust warning behavior for access, persistence, multi-device sync, and bank sync
- Warning recovery behavior for automated recovery checks and verified manual fixes

**Out of scope (from SPEC.md):**
- Payment initiation
- Native mobile app work
- App store publishing
- Automatic PSD2 consent renewal without user action
- New bank-sync providers beyond Enable Banking
- Custom certificate tooling
- New push notification infrastructure
- Broad UI redesign
- Upstream contribution work

</spec_lock>

<decisions>
## Implementation Decisions

### Existing Deployment Topology
- **D-01:** Keep the existing Phase 5 three-service production topology: `sync-server`, `caddy`, and `cloudflared` in the root `docker-compose.yml`.
- **D-02:** Preserve Caddy for LAN/desktop HTTPS and Cloudflare Tunnel for phone/iOS trusted HTTPS; do not introduce new certificate tooling.
- **D-03:** Preserve the no-raw-host-port production access decision: production ingress should go through Caddy or Cloudflare Tunnel, not direct sync-server HTTP.
- **D-04:** Plan 05-01 is still the deployment baseline; the remaining Phase 5 work should update/replan Plan 05-02 rather than create a separate deployment primitive.

### Production Trust-State Model
- **D-05:** Treat production trust as durable server-owned state, not as a purely client-side notification and not as the current in-memory operational alert store.
- **D-06:** Track four condition classes explicitly: access/HTTPS, persistence, multi-device sync, and bank sync.
- **D-07:** Each condition needs enough structured state to explain what is untrusted, when it was last checked, when it was last verified, and what recovery path can clear it.
- **D-08:** Stale/unverified is a real trust state. A condition can become untrusted because verification failed or because the last successful verification is too old for production confidence.

### Warning Surface
- **D-09:** Show one aggregated whole-app production trust warning for active trust problems instead of separate route-specific alerts.
- **D-10:** The warning is non-blocking: users can keep reading budgets, navigating the app, and entering transactions while it is visible.
- **D-11:** Mount the warning from app-shell code so it persists across normal budget workflows. `FinancesApp` is the existing app-shell integration point.
- **D-12:** Reuse Actual's design system and translatable user-facing text. Avoid a broad UI redesign.
- **D-13:** Existing sticky Redux Notifications are acceptable as the display surface only if dismissal does not clear the underlying trust state and the warning returns while the condition remains untrusted.

### Recovery and Clearing
- **D-14:** Local dismissal, page reload, or elapsed time alone must not clear production trust state.
- **D-15:** Automated recovery checks can clear a condition only when the affected check actually passes.
- **D-16:** Manual recovery can clear a condition only through an explicit verified-manual-fix action that records what was verified.
- **D-17:** Recovery actions should be auditable enough for later debugging; use existing logging/audit patterns where practical.
- **D-18:** Acknowledge/dismiss behavior from `/alerts/acknowledge` must not be reused as the trust-state clearing mechanism.

### Plan Handling
- **D-19:** Fold the pending todo "Update Phase 5 verification with production trust-state behavior" into Phase 5 planning.
- **D-20:** Replan or replace `05-02-PLAN.md` so it covers all 8 SPEC requirements, including `INFRA-05` and `INFRA-06`.
- **D-21:** Keep human checkpoints for production Enable Banking registration, real-bank OAuth, phone HTTPS, and two-device verification; these cannot be fully automated.
- **D-22:** Add automated or simulated checks for stale/untrusted trust-state conditions where code can cover them, then keep physical-device and real-bank checks as manual gates.

### Claude's Discretion
- Exact database/table shape for production trust state
- Exact endpoint names and IPC handler names
- Whether the UI is implemented as a sticky Notification hook or a small dedicated app-shell banner, as long as dismissal cannot clear trust state
- Exact stale thresholds for each condition, as long as they are explicit and testable
- Exact recovery-check command names and test fixtures

### Folded Todos
- **Update Phase 5 verification with production trust-state behavior:** Folded into this context and into the required Plan 05-02 replan. It maps directly to `INFRA-05` and `INFRA-06`.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements and planning state
- `.planning/phases/05-infrastructure-and-production/05-SPEC.md` - Locked Phase 5 requirements, boundaries, and acceptance criteria
- `.planning/REQUIREMENTS.md` - `INFRA-01` through `INFRA-06`, including pending trust-state requirements
- `.planning/ROADMAP.md` - Phase 5 roadmap entry and current plan list
- `.planning/todos/pending/2026-05-04-update-phase-5-verification-with-production-trust-state-behavior.md` - Folded todo that triggered the trust-state update
- `.planning/phases/05-infrastructure-and-production/05-02-PLAN.md` - Existing production verification plan that must be updated/replaced

### Existing production deployment baseline
- `docker-compose.yml` - Current three-service production topology
- `Caddyfile` - LAN HTTPS reverse proxy with `tls internal`
- `.env.example` - Enable Banking, Caddy, Cloudflare Tunnel, and CORS environment documentation
- `.planning/phases/05-infrastructure-and-production/05-01-SUMMARY.md` - Completed deployment topology decisions and deviations from original research
- `.planning/phases/05-infrastructure-and-production/05-RESEARCH.md` - Deployment research and production Enable Banking checklist

### Existing alert, status, and UI surfaces
- `packages/sync-server/src/app.ts` - Server routes for `/health`, `/metrics`, `/alerts`, `/alerts/acknowledge`, static app serving, and scheduler startup
- `packages/sync-server/src/util/alerter.ts` - Current in-memory operational alert store; useful pattern but insufficient as durable trust state
- `packages/sync-server/src/scheduler.ts` - Scheduled bank sync, consent expiry alerts, sync failure alerts, and backup failure alerts
- `packages/sync-server/src/app-enablebanking/app-enablebanking.ts` - Enable Banking routes, `/sync-status`, sync logging, account/session mapping
- `packages/loot-core/src/server/accounts/provider-status.ts` - IPC bridge for Enable Banking status and operational alerts
- `packages/loot-core/src/server/accounts/app.ts` - Account handler registration for Enable Banking and operational alert IPC methods
- `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` - Existing hooks for EB status, consent notifications, operational alerts, and bank-sync notifications
- `packages/desktop-client/src/hooks/useSyncServerStatus.ts` - Existing online/offline/no-server status hook
- `packages/desktop-client/src/components/FinancesApp.tsx` - App-shell hook wiring and global notification mounting point
- `packages/desktop-client/src/notifications/notificationsSlice.ts` - Redux notification model and `addNotification`/`removeNotification`
- `packages/desktop-client/src/components/Notifications.tsx` - Current sticky warning/error/message display surface

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml`, `Caddyfile`, and `.env.example`: Production stack already exists; planning should verify and extend behavior, not rebuild infrastructure.
- `packages/sync-server/src/app.ts`: Central place for server-level health/status endpoints and new production trust endpoints.
- `packages/sync-server/src/app-enablebanking/app-enablebanking.ts`: Provides `/sync-status`, `eb_sync_log`, session metadata, and account mapping needed for bank-sync trust checks.
- `packages/sync-server/src/util/alerter.ts`: Shows alert shape and tests, but stores only in memory and supports acknowledgment. Do not use it as the source of truth for production trust.
- `packages/loot-core/src/server/accounts/provider-status.ts`: Established path for browser/client code to call sync-server endpoints through loot-core IPC.
- `packages/desktop-client/src/hooks/useEnableBankingStatus.ts`: Existing side-effect hook pattern for polling server state and dispatching sticky notifications.
- `packages/desktop-client/src/components/FinancesApp.tsx`: Existing app-shell hook call site for whole-app side effects.
- `packages/desktop-client/src/notifications/notificationsSlice.ts` and `packages/desktop-client/src/components/Notifications.tsx`: Existing notification store and rendering surface.

### Established Patterns
- Sync-server owns provider status and operational status endpoints; desktop-client consumes through loot-core IPC handlers.
- App-wide side effects are mounted from `FinancesApp` as hooks, alongside consent expiry, bank-sync progress, and operational alerts.
- User-facing strings in React must be translatable.
- Existing Notifications are sticky and global, but dismissible. Underlying production trust state must survive dismissal and reappear while untrusted.
- Existing `/alerts` are in-memory and acknowledged on close; this is not durable enough for `INFRA-05`/`INFRA-06`.
- Manual production verification is already accepted for physical-device HTTPS, real-bank OAuth, and two-device sync.

### Integration Points
- Add durable production trust state to sync-server storage or another server-owned persistent location.
- Add sync-server endpoints for reading trust state and triggering/recording recovery checks.
- Add loot-core account/provider-status handlers for production trust state.
- Add a desktop-client hook mounted in `FinancesApp` to poll trust state and display/update the whole-app warning.
- Update `05-02-PLAN.md` so verification covers original deployment checks plus trust warning trigger and clear paths.

</code_context>

<specifics>
## Specific Ideas

- Warning copy should be direct and non-alarming, such as: "Production readiness needs attention" with details naming the affected condition.
- Prefer one aggregate warning with condition details over four independent warnings, to avoid stacking noise.
- Include a "Check again" style action for automated recovery checks where possible.
- Manual verification should be explicit and recorded; do not make "close" or "dismiss" mean "fixed".
- Simulated trust-state tests should cover stale/untrusted access, persistence, multi-device sync, and bank-sync states even when full real-device verification remains manual.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within Phase 5 scope.

</deferred>

---

*Phase: 05-infrastructure-and-production*
*Context gathered: 2026-05-04*
