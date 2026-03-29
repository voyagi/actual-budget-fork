# Review: 07-03-PLAN.md

**Plan goal:** Add GET /alerts and POST /alerts/acknowledge to sync-server, IPC handlers in loot-core, and a `useOperationalAlerts()` polling hook in the desktop client.

**Review verdict: ALREADY IMPLEMENTED — plan is obsolete, not blocked**

---

## Implementation Status

### `packages/sync-server/src/app.ts`
- `import { getRecentAlerts, acknowledgeAlert } from './util/alerter.js'` — present at line 22
- `app.get('/alerts', ...)` returning `{ alerts: getRecentAlerts() }` — present at line 176
- `app.post('/alerts/acknowledge', ...)` with `alertId` validation and 400/404 responses — present at lines 180-188

### `packages/loot-core/src/server/accounts/provider-status.ts`
- `export async function fetchOperationalAlerts()` — present at line 472
- `export async function acknowledgeOperationalAlert({ alertId })` — present at line 489
- Both use `serverConfig.BASE_SERVER + '/alerts'` pattern consistent with existing IPC handlers

### `packages/loot-core/src/server/accounts/app.ts`
- `'operational-alerts': typeof fetchOperationalAlerts` — present at line 96
- `'operational-alerts-acknowledge': typeof acknowledgeOperationalAlert` — present at line 97
- `app.method('operational-alerts', fetchOperationalAlerts)` — present at line 596
- `app.method('operational-alerts-acknowledge', acknowledgeOperationalAlert)` — present at line 597

### `packages/desktop-client/src/hooks/useEnableBankingStatus.ts`
- `export function useOperationalAlerts(): void` — present
- `send('operational-alerts')` polling — present
- `send('operational-alerts-acknowledge', { alertId })` in `onClose` — present
- `setInterval(poll, 60_000)` — present
- `knownAlertIds` ref to deduplicate — present
- `status !== 'online'` guard — present
- `formatAlertTitle()` with `sync_failure`, `consent_expiry`, `auth_failure_burst` cases — present
- Cleanup: `active = false; clearInterval(interval)` in effect return — present

### `packages/desktop-client/src/components/FinancesApp.tsx`
- `useOperationalAlerts` in import at line 35 — present
- `useOperationalAlerts()` call at line 346 — present

---

## One Real Gap Found: /alerts endpoint has no authentication

**Severity: MEDIUM**

The plan explicitly states: "These endpoints do NOT require authentication (they return no PII, only operational event_type/message/severity)." The implementation follows this decision — both `/alerts` and `/alerts/acknowledge` are unauthenticated.

However, the `POST /alerts/acknowledge` endpoint mutates server state (removes an alert from the in-memory store). Any client that can reach the sync-server — including unauthenticated ones — can silently suppress operational alerts before the legitimate user sees them. This is a denial-of-visibility attack surface.

The plan acknowledged the lack of auth as a deliberate decision. This is recorded here as a MEDIUM finding for awareness; it does not block execution since the feature is already deployed.

**Suggested improvement (post-hoc, not blocking):** Add `validateSessionMiddleware` to the acknowledge endpoint, or at minimum add the endpoints to the existing express-rate-limit scope.

---

## Divergence from Plan (non-blocking)

- `fetchOperationalAlerts` in `provider-status.ts` uses `post()` (not `get()`) to call `BASE_SERVER + '/alerts'`. The sync-server exposes this as `GET /alerts`. Using `post()` for a GET endpoint will work if the server ignores the body, but is semantically wrong and could fail if the server ever enforces method restrictions. The plan's interface section documents `get(url, opts?)` for GET requests. This is a potential correctness issue in the IPC implementation — it was not caught at plan-write time because the plan gives both `get` and `post` signatures.

  **Status:** Already deployed, so this is a latent bug to fix separately. Not blocking the review.

---

## Findings Summary

| Severity | Finding |
|----------|---------|
| MEDIUM | `/alerts/acknowledge` is unauthenticated and can be called by anyone to suppress operational alerts (deliberate decision per plan, noted for awareness) |
| LOW | `fetchOperationalAlerts` IPC handler uses `post()` to call a `GET /alerts` endpoint — method mismatch that could fail under strict servers |

---

## Action Required

**Do not re-execute this plan.** The implementation is complete. Address the two findings above as separate targeted fixes if desired:

1. Add `validateSessionMiddleware` to `POST /alerts/acknowledge` in `app.ts`
2. Change `fetchOperationalAlerts` in `provider-status.ts` to use `get()` instead of `post()`

Create `07-03-SUMMARY.md` if it doesn't exist.
