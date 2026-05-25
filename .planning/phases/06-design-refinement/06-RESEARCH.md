# Phase 6: Design Refinement - Research

**Researched:** 2026-03-18
**Domain:** React Redux notification system, async retry patterns (Node.js scheduler)
**Confidence:** HIGH

## Summary

Phase 6 has three tightly-scoped tasks: route ConsentExpiryBanner and BankSyncStatus through
the upstream Notifications Redux system, extract the scheduler's inline retry logic into a
`syncAccountWithRetry()` helper, and replace the fixed 30-second single retry with
exponential backoff plus jitter.

All source code has been read directly. The codebase is well-understood — no external library
research is needed. The Notifications system is fully capable of handling both use cases as-is:
sticky warnings with button actions for consent expiry, and transient message notifications for
sync status. The scheduler refactoring is self-contained with no caller impact.

**Primary recommendation:** Implement all three items in a single plan with three tasks. No new
dependencies are required for any of the three changes.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Alert Surface Consolidation (dsg-1)
- Route ConsentExpiryBanner and BankSyncStatus through the existing upstream Notifications system instead of maintaining 3 separate positioning strategies
- Current state: Notifications uses `position: fixed` bottom-right; BankSyncStatus uses `position: absolute` top-center z-index 501; ConsentExpiryBanner uses document flow (no positioning)
- ConsentExpiryBanner becomes sticky warning notifications dispatched via `addNotification()` with `type: 'warning'`, `sticky: true`, and a button action for re-auth navigation
- BankSyncStatus becomes a transient message notification with loading indicator, dispatched on sync start and removed on sync complete
- Preserve daily-dismiss behavior for consent warnings via localStorage (existing pattern)
- Remove the standalone ConsentExpiryBanner and BankSyncStatus components from FinancesApp.tsx after migration
- The `useConsentExpiry()` hook and `consent-urgency.ts` utility remain as data sources; only the rendering surface changes

#### Scheduler Retry Flattening (dx-4)
- Extract retry logic from the inline try/catch/sleep/try/catch nesting (scheduler.ts lines 108-150) into a `syncAccountWithRetry()` helper function
- Use async loop with delay pattern (not recursion) for clarity
- Helper takes an account row and retry policy config, returns success/failure result
- RateLimitError and SessionExpiredError continue to bypass retry and break the session loop (existing behavior preserved)
- Only transient errors (network failures, 5xx responses) trigger retry

#### Exponential Backoff (fq-4)
- Replace fixed 30-second single retry with exponential backoff: initial delay 5s, multiplier 2x, max delay 60s, max 3 retries
- Add jitter of +/-20% to each delay to prevent thundering herd when multiple accounts fail simultaneously
- Retry sequence: ~5s, ~10s, ~20s (all with jitter, capped at 60s)
- Log each retry attempt with attempt number and delay for debugging
- On final failure after all retries, log error and write to eb_sync_log (existing behavior)

### Claude's Discretion
- Exact notification message wording for consent expiry warnings and sync status
- Whether to use `timeout` on sync status notifications or manually remove them
- Notification `type` for sync-in-progress (message vs custom)
- Whether `syncAccountWithRetry()` lives in scheduler.ts or a new retry-utils.ts file
- Jitter implementation (Math.random based vs deterministic)

### Deferred Ideas (OUT OF SCOPE)

None -- discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| dsg-1 | Consolidate alert surfaces: ConsentExpiryBanner and BankSyncStatus into the existing Notifications system | Notifications Redux slice fully supports sticky warnings with button actions and transient messages with manual removal. Both patterns verified in source. |
| dx-4 | Flatten scheduler retry nesting into a `syncAccountWithRetry()` helper using an async loop | Retry nesting is at scheduler.ts lines 108-150. RateLimitError and SessionExpiredError bypass paths confirmed. Extraction is caller-transparent. |
| fq-4 | Replace fixed 30s single retry with exponential backoff (5s/10s/20s + jitter, max 3 retries) | Sleep function already exists in scheduler.ts. No new dependencies needed. Jitter via Math.random is idiomatic. |
</phase_requirements>

---

## Standard Stack

### Core (already in project — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@reduxjs/toolkit` (createSlice) | existing | `addNotification` / `removeNotification` actions | Already the notification dispatch mechanism |
| `@react-spring/web` (useTransition/useSpring) | existing | Animation inside Notifications component | Already used; no changes needed |
| `react-swipeable` | existing | Swipe-to-dismiss inside Notifications | Already used; no changes needed |
| `uuid` (v4) | existing | Auto-generated notification IDs | Already used in notificationsSlice |

### No New Dependencies

All three requirements are satisfied by code already in the project. The planner MUST NOT add any new npm packages.

---

## Architecture Patterns

### Recommended Project Structure (no structural changes)

```
packages/desktop-client/src/
├── components/
│   ├── Notifications.tsx          # Unchanged - already handles rendering
│   ├── ConsentExpiryBanner.tsx    # DELETE after migration complete
│   └── BankSyncStatus.tsx         # DELETE after migration complete
├── hooks/
│   └── useEnableBankingStatus.ts  # MODIFY: dispatch notifications instead of rendering
├── notifications/
│   └── notificationsSlice.ts      # UNCHANGED - already has all needed actions
└── ...

packages/sync-server/src/
└── scheduler.ts                   # MODIFY: extract syncAccountWithRetry(), add backoff
    OR
    retry-utils.ts                 # NEW (Claude's discretion): house syncAccountWithRetry()
```

### Pattern 1: Sticky Warning Notification for Consent Expiry

**What:** Dispatch a Redux notification with `type: 'warning'`, `sticky: true`, `button` (Re-authorize), and a stable `id` keyed to the session. The stable ID prevents duplicate dispatches because `addNotification` is idempotent when the same ID already exists.

**When to use:** On mount (or when `useConsentExpiry()` first returns non-ok sessions). Re-dispatch if the user dismisses and then re-opens the app (localStorage daily-dismiss handles suppression).

**Key insight from source code review:**

```typescript
// notificationsSlice.ts line 64-66 — idempotency guard:
if (state.notifications.find(n => n.id === notification.id)) {
  return; // No-op if same ID already exists
}
```

This means dispatching with a stable session-scoped ID (e.g. `consent-expiry-${sessionId}`) is
safe to call on every render — duplicates are silently dropped.

```typescript
// Dispatch pattern (inside useConsentExpiry consumer):
dispatch(addNotification({
  notification: {
    id: `consent-expiry-${session.sessionId}`,
    type: 'warning',
    sticky: true,
    title: 'Bank connection expiring',
    message: `${bankName} bank connection expires ${expiryDate}`,
    button: {
      title: 'Re-authorize',
      action: () => {
        dispatch(pushModal({ modal: { name: 'enablebanking-external-msg', options: { ... } } }));
      },
    },
    onClose: () => {
      // Daily-dismiss localStorage write goes here
      dismiss(session.sessionId);
    },
  },
}));
```

**Where to put the dispatch logic:** The consumer hook pattern is to create a new hook
`useConsentExpiryNotifications()` in `useEnableBankingStatus.ts` that calls `useConsentExpiry()`
and dispatches — or extend an existing component in `FinancesApp.tsx`. Since the locked decision
says "remove the standalone components," the dispatch must live in a hook that `FinancesApp` calls
(or directly in `FinancesApp` via a `useEffect`).

### Pattern 2: Transient Sync-Status Notification

**What:** On sync start, dispatch a message notification with a stable ID. On sync complete,
call `dispatch(removeNotification({ id }))` explicitly. This is preferred over `timeout` because
sync duration is variable.

```typescript
// On sync start:
dispatch(addNotification({
  notification: {
    id: 'bank-sync-in-progress',
    type: 'message',
    sticky: true,
    message: `Syncing... ${count} accounts remaining`,
  },
}));

// On sync complete:
dispatch(removeNotification({ id: 'bank-sync-in-progress' }));
```

**AnimatedLoading in notifications:** The Notifications component renders plain text `message`.
To include the animated spinner the current `BankSyncStatus` shows, the message would need to be
a React node — but the `Notification` type only accepts `message: string`. The `compileMessage`
function parses markdown-like `[text](#action)` links but not arbitrary JSX.

**Recommendation (Claude's discretion):** Skip the animated spinner in the notification message.
The text "Syncing... N accounts remaining" is sufficient. The upstream Notifications component
already has an `AnimatedLoading` overlay for loading states triggered by button actions — there
is no slot for a persistent spinner in the notification body without modifying Notifications.tsx.

Alternatively: use `title` for "Syncing..." and `message` for the count, which gives a two-line
layout. This avoids Notifications.tsx modification.

**Where to put the dispatch logic:** Inside the component or hook that already tracks
`accountsSyncing` state — currently `BankSyncStatus.tsx` reads
`useSelector(state => state.account.accountsSyncing)`. That selector logic moves into a
`useBankSyncNotification()` hook that dispatches instead of rendering.

### Pattern 3: Exponential Backoff with Jitter

**What:** Replace the inline two-try pattern (lines 108-150 in scheduler.ts) with a helper
that loops up to `maxRetries` times, sleeping for `delay * multiplier^attempt * jitter` between
attempts.

```typescript
// Proposed RetryPolicy type:
type RetryPolicy = {
  maxRetries: number;     // 3
  initialDelay: number;   // 5000ms
  multiplier: number;     // 2
  maxDelay: number;       // 60000ms
  jitterFraction: number; // 0.2 (±20%)
};

// Jitter: Math.random() based, not deterministic
function applyJitter(delay: number, jitterFraction: number): number {
  const jitter = (Math.random() * 2 - 1) * jitterFraction; // [-0.2, +0.2]
  return Math.round(delay * (1 + jitter));
}

async function syncAccountWithRetry(
  account: AccountRow,
  policy: RetryPolicy,
): Promise<void> {
  let delay = policy.initialDelay;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      await syncOneAccount(account);
      return; // success
    } catch (err) {
      if (err instanceof RateLimitError || err instanceof SessionExpiredError) {
        throw err; // callers break session loop on these
      }
      if (attempt === policy.maxRetries) {
        throw err; // final attempt — propagate to caller for eb_sync_log write
      }
      const jitteredDelay = Math.min(applyJitter(delay, policy.jitterFraction), policy.maxDelay);
      console.log(
        `[scheduler] Retry ${attempt + 1}/${policy.maxRetries} for ${account.actual_account_id} in ${jitteredDelay}ms`,
      );
      await sleep(jitteredDelay);
      delay = Math.min(delay * policy.multiplier, policy.maxDelay);
    }
  }
}
```

**Placement decision (Claude's discretion):** Keeping `syncAccountWithRetry()` in `scheduler.ts`
is simpler (avoids a new file, shares the `sleep()` helper and `AccountRow` type). A separate
`retry-utils.ts` only makes sense if retry logic is reused elsewhere — it is not, currently.
Recommendation: keep in `scheduler.ts`.

### Anti-Patterns to Avoid

- **Don't add JSX to notification `message` strings.** The `compileMessage` parser handles only markdown-style `[text](#action)` links. Passing JSX renders as `[object Object]`.
- **Don't use `timeout` for sync-status notifications.** Sync duration is variable; timeout means stale "still syncing" toast if sync runs long. Use explicit `removeNotification` on completion.
- **Don't dispatch without a stable ID for consent notifications.** Without a fixed ID, each render cycle re-dispatches a new notification. The idempotency guard in the Redux slice requires a matching ID to deduplicate.
- **Don't use recursion for backoff.** The locked decision explicitly says "async loop with delay pattern (not recursion)." Deep stacks on many retries + Node.js scheduler context make recursion risky.
- **Don't rethrow RateLimitError/SessionExpiredError inside syncAccountWithRetry.** These must propagate to the session-level loop so it can `break` immediately — confirmed in existing caller logic.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Notification deduplication | Custom dedup map | Stable `id` in `addNotification` | notificationsSlice already guards duplicate IDs (line 64-66) |
| Notification dismiss tracking | Custom state layer | `onClose` callback + existing localStorage pattern | `onClose` fires when X button pressed; localStorage daily-dismiss already implemented in ConsentExpiryBanner |
| Notification stacking/animation | Custom CSS/animation | Existing `Notifications` component | Already has @react-spring/web animations, swipe-to-dismiss, MAX_VISIBLE_NOTIFICATIONS stacking |
| Retry state machine | Class-based state machine | Simple async `for` loop with `await sleep()` | Overkill for 3 retries; adds no testability benefit |

**Key insight:** Both the frontend and scheduler changes reuse existing infrastructure. The
notification system has everything needed; the scheduler already has a `sleep()` function.

---

## Common Pitfalls

### Pitfall 1: Consent Notification Dispatch on Every Render

**What goes wrong:** Placing `dispatch(addNotification(...))` inside a component body without
a stable ID causes one new notification per render cycle.

**Why it happens:** React renders run frequently; dispatch without dedup guard floods the queue.

**How to avoid:** Always use a stable, deterministic `id` for consent notifications (e.g.
`consent-expiry-${session.sessionId}`). The Redux slice's idempotency guard silently drops
duplicates matching that ID.

**Warning signs:** Multiple identical notifications stacking in the UI.

### Pitfall 2: Daily-Dismiss localStorage Pattern Breaks After Routing to Notifications

**What goes wrong:** When the user dismisses via the Notifications `X` button, the `onClose`
callback must be wired correctly to write the localStorage daily-dismiss key. If it is not wired,
the consent notification re-appears immediately on next render (dispatch fires again for non-ok
sessions, old notification was removed, new one is added).

**Why it happens:** The existing `ConsentExpiryBanner` calls `dismiss(session.sessionId)` in its
dismiss handler. The new flow must replicate this in `onClose` of the dispatched notification.
Additionally, the existing localStorage cleanup effect (two-pass delete of stale keys) currently
runs inside `ConsentExpiryBanner` — this must be preserved somewhere (move to the hook or
`FinancesApp.tsx`).

**How to avoid:** Wire `onClose: () => dismiss(session.sessionId)` in the notification payload.
Move the localStorage cleanup `useEffect` to the hook or a `FinancesApp.tsx` effect.

### Pitfall 3: Sync-Status Notification Orphaned on Error

**What goes wrong:** If the sync operation throws before `removeNotification` is called, the
"Syncing..." notification stays visible forever.

**Why it happens:** The dispatch pair (add on start, remove on complete) is easy to split across
try/catch paths and miss the finally block.

**How to avoid:** Always call `removeNotification` in a `finally` block, not just the success
path:

```typescript
dispatch(addNotification({ notification: { id: 'bank-sync-in-progress', ... } }));
try {
  await syncAccounts();
} finally {
  dispatch(removeNotification({ id: 'bank-sync-in-progress' }));
}
```

### Pitfall 4: Multiple Consent Notifications for Multi-Session Case

**What goes wrong:** With multiple expiring sessions, dispatching one notification per session
could push the stack past `MAX_VISIBLE_NOTIFICATIONS = 3` and hide earlier ones.

**Why it happens:** `useConsentExpiry()` returns one `ConsentSession` per bank connection;
there's no built-in aggregation in the notification dispatch layer.

**How to avoid:** Mirror the existing ConsentExpiryBanner behavior — dispatch a single
aggregated notification when sessions > 1 ("N bank connections expiring"), dispatch per-session
only when sessions === 1. This is exactly what the current `MultiSessionBanner` / `SessionBanner`
branching does.

### Pitfall 5: Re-dispatch After User Dismisses Consent Notification Mid-Session

**What goes wrong:** User dismisses the consent warning. On next render, `useConsentExpiry()`
still returns non-ok sessions (data hasn't changed). Without suppression, `addNotification` is
called again — but the old notification was removed, so the idempotency check passes and a new
one appears.

**Why it happens:** The stable-ID dedup only prevents duplicates while the notification still
exists. Once removed, the same ID can be re-added.

**How to avoid:** After dismiss, the `onClose` writes the daily-dismiss localStorage key. On next
render, the `isDismissed(sessionId)` check in the dispatch logic gates the `addNotification`
call. The dispatch must check `isDismissed()` before dispatching, not just in the legacy
filtering step.

---

## Code Examples

Verified patterns from source code.

### Adding a Notification (dispatch pattern)
```typescript
// Source: packages/desktop-client/src/notifications/notificationsSlice.ts
dispatch(addNotification({
  notification: {
    id: 'my-stable-id',          // optional; auto-generated UUID if omitted
    type: 'warning',             // 'message' | 'error' | 'warning'
    title: 'Optional title',     // bold header row
    message: 'Required text',    // supports [text](#action) and [text](url) links
    sticky: true,                // prevents auto-dismiss at 6500ms timeout
    button: {
      title: 'Action label',
      action: async () => { /* ... */ },
    },
    onClose: () => { /* cleanup */ },
  },
}));
```

### Removing a Notification Explicitly
```typescript
// Source: packages/desktop-client/src/notifications/notificationsSlice.ts
dispatch(removeNotification({ id: 'my-stable-id' }));
```

### Idempotency Guard (do not re-implement)
```typescript
// Source: packages/desktop-client/src/notifications/notificationsSlice.ts lines 64-66
if (state.notifications.find(n => n.id === notification.id)) {
  return; // no-op when ID already exists in queue
}
```

### Existing Sleep Helper (reuse in syncAccountWithRetry)
```typescript
// Source: packages/sync-server/src/scheduler.ts line 61-63
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### Existing Retry Logic to Replace (scheduler.ts lines 108-150)
```typescript
// CURRENT (to be replaced):
try {
  await syncOneAccount(account);
  successCount++;
  totalSynced++;
} catch (err) {
  if (err instanceof RateLimitError) { break; }
  if (err instanceof SessionExpiredError) { break; }
  await sleep(30000);  // ← fixed 30s
  try {
    await syncOneAccount(account);
    successCount++;
    totalSynced++;
  } catch (retryErr) {
    // log + eb_sync_log write
  }
}
```

### BankSyncStatus Redux Selector (existing — move to hook)
```typescript
// Source: packages/desktop-client/src/components/BankSyncStatus.tsx lines 15-17
const accountsSyncing = useSelector(state => state.account.accountsSyncing);
const accountsSyncingCount = accountsSyncing.length;
const count = accountsSyncingCount;
```

---

## State of the Art

| Old Approach | Current Approach | Notes |
|--------------|------------------|-------|
| Fixed 30s single retry | Exponential backoff 5s/10s/20s + jitter | Standard for distributed systems; prevents thundering herd |
| Inline try/catch/try/catch nesting | Extracted `syncAccountWithRetry()` helper | Reduces nesting from 4 levels to 2 |
| 3 separate alert surfaces with conflicting z-index/positioning | Single Notifications system | Eliminates z-index 501 vs MODAL_Z_INDEX-1 conflict |

---

## Open Questions

1. **Animated spinner in sync-status notification**
   - What we know: `Notification.message` is a string; `AnimatedLoading` is a React component
   - What's unclear: Whether to modify `Notifications.tsx` to support a `loading: boolean` prop on the notification, or drop the spinner
   - Recommendation (Claude's discretion): Drop the spinner for now. Text "Syncing... N accounts remaining" is sufficient. Avoids touching the upstream Notifications component.

2. **Where does localStorage cleanup useEffect live after ConsentExpiryBanner is deleted?**
   - What we know: The two-pass key cleanup currently runs in `ConsentExpiryBanner`'s `useEffect`
   - What's unclear: Best placement — FinancesApp.tsx or a new/extended hook
   - Recommendation: Move it to `FinancesApp.tsx` as a standalone `useEffect` that runs on mount. It has no dependencies and runs once.

3. **How to suppress re-dispatch after dismiss within a session?**
   - What we know: Stable ID dedup only works while notification exists in queue
   - What's unclear: Whether to use a React `useRef` set of dismissed IDs or rely purely on localStorage
   - Recommendation: Rely on `isDismissed(sessionId)` localStorage check before dispatching. The existing `isDismissed()` function in ConsentExpiryBanner.tsx must be moved to the dispatch logic layer.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest (config at `packages/sync-server/vitest.config.ts`) |
| Config file | `packages/sync-server/vitest.config.ts` |
| Quick run command | `cd packages/sync-server && npx vitest run src/app-enablebanking/utils.test.js` |
| Full suite command | `cd packages/sync-server && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| fq-4 | `syncAccountWithRetry` retries up to 3 times with exponential delay | unit | `npx vitest run src/scheduler.test.ts` | ❌ Wave 0 |
| fq-4 | Jitter keeps each delay within ±20% of nominal | unit | `npx vitest run src/scheduler.test.ts` | ❌ Wave 0 |
| fq-4 | RateLimitError propagates immediately without sleeping | unit | `npx vitest run src/scheduler.test.ts` | ❌ Wave 0 |
| fq-4 | SessionExpiredError propagates immediately without sleeping | unit | `npx vitest run src/scheduler.test.ts` | ❌ Wave 0 |
| dx-4 | After 3 failed retries writes error row to eb_sync_log | unit | `npx vitest run src/scheduler.test.ts` | ❌ Wave 0 |
| dsg-1 | (Frontend) Consent notification dispatched for non-ok sessions | manual smoke | n/a | — |
| dsg-1 | (Frontend) BankSyncStatus notification removed on sync complete | manual smoke | n/a | — |

**Note:** dsg-1 frontend behavior is integration-level and depends on Redux store + React render
cycle. Automated unit testing would require jsdom + Redux store setup. Mark as manual smoke for
this phase; automated coverage can be added in Phase 8 (Quality and Test Infrastructure).

### Sampling Rate

- **Per task commit:** `cd packages/sync-server && npx vitest run src/scheduler.test.ts`
- **Per wave merge:** `cd packages/sync-server && npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/sync-server/src/scheduler.test.ts` — covers fq-4 retry behavior, dx-4 error logging, RateLimitError/SessionExpiredError fast-fail
- [ ] Vitest mock for `sleep()` needed (inject via dependency parameter or `vi.useFakeTimers()`) to avoid real waits in retry tests

---

## Sources

### Primary (HIGH confidence)
- Direct source read: `packages/desktop-client/src/notifications/notificationsSlice.ts` — full type definitions, idempotency guard, all actions
- Direct source read: `packages/desktop-client/src/components/Notifications.tsx` — rendering, stacking, animation, compileMessage parser
- Direct source read: `packages/desktop-client/src/components/ConsentExpiryBanner.tsx` — existing dismiss logic, multi-session branch, JSX content
- Direct source read: `packages/desktop-client/src/components/BankSyncStatus.tsx` — existing selector, transition, positioning
- Direct source read: `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` — useConsentExpiry hook, ConsentSession type
- Direct source read: `packages/desktop-client/src/utils/consent-urgency.ts` — ConsentUrgency type, urgencyColors, urgencyIcons
- Direct source read: `packages/sync-server/src/scheduler.ts` — full file, retry nesting at lines 108-150, sleep helper
- Direct source read: `packages/sync-server/src/app-enablebanking/errors.ts` — RateLimitError, SessionExpiredError, EnableBankingError
- Direct source read: `packages/sync-server/vitest.config.ts` — test framework config

### Secondary (MEDIUM confidence)
- None required — all findings come from direct source reads

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries verified by direct source read; no new dependencies
- Architecture: HIGH — patterns derived from reading actual implementation, not documentation
- Pitfalls: HIGH — derived from reading the existing code paths that must be preserved or migrated

**Research date:** 2026-03-18
**Valid until:** 2026-06-18 (stable codebase; upstream merges could affect Notifications.tsx)
