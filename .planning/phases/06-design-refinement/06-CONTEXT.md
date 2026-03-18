# Phase 6: Design Refinement - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Consolidate three competing alert surfaces into the existing Notifications system, flatten scheduler retry nesting into an extracted helper, and replace the fixed 30s retry delay with exponential backoff. Addresses audit findings dsg-1, dx-4, fq-4.

</domain>

<decisions>
## Implementation Decisions

### Alert Surface Consolidation (dsg-1)
- Route ConsentExpiryBanner and BankSyncStatus through the existing upstream Notifications system instead of maintaining 3 separate positioning strategies
- Current state: Notifications uses `position: fixed` bottom-right; BankSyncStatus uses `position: absolute` top-center z-index 501; ConsentExpiryBanner uses document flow (no positioning)
- ConsentExpiryBanner becomes sticky warning notifications dispatched via `addNotification()` with `type: 'warning'`, `sticky: true`, and a button action for re-auth navigation
- BankSyncStatus becomes a transient message notification with loading indicator, dispatched on sync start and removed on sync complete
- Preserve daily-dismiss behavior for consent warnings via localStorage (existing pattern)
- Remove the standalone ConsentExpiryBanner and BankSyncStatus components from FinancesApp.tsx after migration
- The `useConsentExpiry()` hook and `consent-urgency.ts` utility remain as data sources; only the rendering surface changes

### Scheduler Retry Flattening (dx-4)
- Extract retry logic from the inline try/catch/sleep/try/catch nesting (scheduler.ts lines 108-150) into a `syncAccountWithRetry()` helper function
- Use async loop with delay pattern (not recursion) for clarity
- Helper takes an account row and retry policy config, returns success/failure result
- RateLimitError and SessionExpiredError continue to bypass retry and break the session loop (existing behavior preserved)
- Only transient errors (network failures, 5xx responses) trigger retry

### Exponential Backoff (fq-4)
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

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Alert surfaces
- `packages/desktop-client/src/components/Notifications.tsx` -- Upstream notification system with animation, stacking, swipe-to-dismiss, fixed positioning
- `packages/desktop-client/src/notifications/notificationsSlice.ts` -- Redux slice: addNotification, removeNotification, notification types (message/error/warning), sticky/timeout/button options
- `packages/desktop-client/src/components/ConsentExpiryBanner.tsx` -- Current standalone consent banner (to be migrated)
- `packages/desktop-client/src/components/BankSyncStatus.tsx` -- Current standalone sync status (to be migrated)
- `packages/desktop-client/src/components/FinancesApp.tsx` lines 395-397 -- Where all 3 alert surfaces are mounted
- `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` -- useConsentExpiry() hook providing consent session data
- `packages/desktop-client/src/utils/consent-urgency.ts` -- Shared urgency colors, icons, threshold logic

### Scheduler
- `packages/sync-server/src/scheduler.ts` -- Full scheduler file; retry nesting at lines 108-150
- `packages/sync-server/src/app-enablebanking/errors.js` -- RateLimitError, SessionExpiredError classes

### Prior phase context
- `.planning/phases/04.1-audit-quick-wins/04.1-CONTEXT.md` -- aria-live regions, design system fixes already applied
- `.planning/phases/05.1-accessibility-overhaul/05.1-CONTEXT.md` -- Consent urgency utility extraction, deferred alert consolidation to this phase

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `Notifications` component: full animation system via `@react-spring/web`, swipe-to-dismiss, z-index stacking, responsive layout, auto-timeout
- `notificationsSlice`: Redux toolkit slice with `addNotification({ notification })` and `removeNotification({ id })` actions
- Notification type supports: `type` (message/error/warning), `sticky` (boolean), `timeout` (ms), `button` ({ title, action }), `onClose` callback
- `useConsentExpiry()` hook: fetches and groups consent sessions by session_id, calculates urgency levels
- `consent-urgency.ts`: urgencyColors (theme token mapping), urgencyIcons (SVG component mapping), getUrgencyLevel()
- `AnimatedLoading` component from `@actual-app/components/icons/AnimatedLoading`

### Established Patterns
- Notifications dispatched via Redux: `dispatch(addNotification({ notification: { ... } }))`
- Notification stacking: max 3 visible, newest on top, scale/opacity reduction for stacked items
- Inline style objects on React components (not CSS modules)
- Error classification: RateLimitError and SessionExpiredError are distinct classes for control flow

### Integration Points
- FinancesApp.tsx: Remove `<ConsentExpiryBanner />` and `<BankSyncStatus />` JSX; Notifications component already present
- ConsentExpiryBanner consumers: Need to dispatch notifications instead of rendering inline JSX
- BankSyncStatus consumers: Sync status hooks need to dispatch/remove notifications
- scheduler.ts: Retry logic is self-contained; extraction doesn't affect callers (runScheduledSync calls syncOneAccount)

</code_context>

<specifics>
## Specific Ideas

- The audit's design review explicitly suggested: "Could the consent banner route through the existing Notifications system as a sticky warning? Would inherit animation, swipe-to-dismiss, stacking, and visual treatment for free."
- Consent notifications should include the bank name and expiry date in the message, matching current banner content
- Sync status notification should show the animated spinner matching current BankSyncStatus visual

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 06-design-refinement*
*Context gathered: 2026-03-18*
