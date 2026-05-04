# Phase 5: Infrastructure and Production - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 05-infrastructure-and-production
**Mode:** `--auto`
**Areas discussed:** Deployment baseline, Trust-state ownership, Warning surface, Recovery semantics, Plan handling

---

## Deployment Baseline

| Option | Description | Selected |
|--------|-------------|----------|
| Preserve existing three-service topology | Keep `sync-server`, `caddy`, and `cloudflared`; treat Plan 05-01 as the baseline | yes |
| Rebuild infrastructure around a new proxy/cert approach | Replace Caddy/Cloudflare Tunnel with another production access strategy | |
| Skip infrastructure checks and focus only on warning UI | Would leave original Phase 5 criteria unverified | |

**Auto choice:** Preserve existing three-service topology.
**Notes:** Plan 05-01 already completed the deployment topology. The 2026-05-04 SPEC adds trust-state behavior; it does not invalidate Caddy, Cloudflare Tunnel, or Compose decisions.

---

## Trust-State Ownership

| Option | Description | Selected |
|--------|-------------|----------|
| Durable server-owned trust state | Store access, persistence, multi-device sync, and bank-sync trust state in server-owned persistent state | yes |
| Client-only local warning state | Track stale/untrusted state in browser local state or localStorage only | |
| In-memory operational alert reuse | Reuse `/alerts` and `alerter.ts` as the source of truth | |

**Auto choice:** Durable server-owned trust state.
**Notes:** `INFRA-06` requires warnings to survive dismissal, reload, and elapsed time until recovery is verified. Existing `/alerts` are useful precedent but are in-memory and explicitly acknowledgeable, so they are not strict enough as the trust-state source of truth.

---

## Warning Surface

| Option | Description | Selected |
|--------|-------------|----------|
| One aggregate whole-app warning | Display one app-wide warning with affected condition details; leave app usable | yes |
| Separate warning per subsystem | Emit independent access, persistence, sync, and bank warnings | |
| Blocking modal or lockout | Prevent normal budget use until production trust is fixed | |

**Auto choice:** One aggregate whole-app warning.
**Notes:** The SPEC says warning, not lockout. Existing `FinancesApp` and Redux Notifications provide global app-shell wiring. If Notifications are used, close/dismiss must not clear underlying trust state.

---

## Recovery Semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Clear only after verified recovery | Automated checks clear on pass; manual fixes clear only through explicit verified action | yes |
| Clear on local dismissal | User closes the warning and the condition is considered resolved | |
| Clear on timeout or reload | Warning disappears after time passes or browser reloads | |

**Auto choice:** Clear only after verified recovery.
**Notes:** This directly implements `INFRA-06`. Local dismissal can only hide a rendered notification temporarily; it cannot mutate trust state while the condition remains untrusted.

---

## Plan Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Update/replan `05-02-PLAN.md` | Fold `INFRA-05` and `INFRA-06` into the existing active Phase 5 production verification plan | yes |
| Add a new `05-03-PLAN.md` | Create a separate follow-up plan only for trust-state behavior | |
| Leave plans unchanged | Keep current verification plan even though it omits new requirements | |

**Auto choice:** Update/replan `05-02-PLAN.md`.
**Notes:** `STATE.md` already names the active plan as updating 05-02 production verification with stale/untrusted whole-app warning behavior. Replanning the active plan keeps Phase 5 bounded and avoids unnecessary plan sprawl.

---

## Claude's Discretion

- Exact trust-state storage shape
- Exact endpoint and IPC handler names
- Exact UI implementation, provided the result is whole-app, non-blocking, translatable, and not cleared by dismissal
- Exact stale thresholds, provided they are explicit and testable

## Deferred Ideas

None - discussion stayed within Phase 5 scope.
