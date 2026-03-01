# Phase 3: Automation and Consent Lifecycle - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Transactions sync automatically four times per day without user action, consent expiry is tracked per-bank from the Enable Banking session response, and users are notified in-app before consent expires so they can re-authorize before sync breaks. This phase delivers: server-side scheduled sync, consent expiry tracking and warnings, re-authorization flow, and sync-on-open behavior.

</domain>

<decisions>
## Implementation Decisions

### Scheduling
- Server-side cron using node-cron on the sync-server, running every 6 hours (4x/day at fixed intervals)
- When a scheduled sync fails for one account, retry once after a short delay, then continue syncing remaining accounts
- Log sync runs to both console (visible in docker logs) and database (eb_sync_log entries)
- Scheduler must be multi-user aware: group accounts by user/budget, sync each user's accounts independently
- Scheduler is opt-in via `ENABLE_AUTO_SYNC=true/false` env var (off by default, good for development)
- No overlap guard needed: trust that syncs finish quickly, EB API handles idempotently
- Claude's discretion: whether to skip accounts with expired consent before attempting sync

### Consent Expiry UX
- Graduated placement: global banner at top of app for urgent warnings (< 7 days), plus subtle indicator on account list page always
- Banner is dismissible but re-appears daily until consent is renewed
- Graduated urgency colors: 14-7 days informational/yellow, under 7 days warning/orange, expired error/red
- When multiple banks have expiring consent, show a single grouped banner ("2 bank connections expiring soon") with a link to the account list
- Banner shows specific details: bank name and exact expiry date (e.g. "ING Bank connection expires March 15")
- When consent has fully expired: red error banner + disable automatic sync for that bank (don't waste API calls)
- Account list shows a "Consent expires" date column per bank, always visible (not just when expiring)
- Claude's discretion: how to fetch consent expiry data for the client (new endpoint vs extending sync-status)

### Re-authorization Flow
- Reuse the existing OAuth popup flow (create-auth, bank redirect, callback) for re-authorization
- After successful re-authorization, immediately trigger a sync so user sees fresh data confirming re-auth worked
- Preserve existing account links automatically by matching EB account UIDs from the new session to existing eb_account_map rows (no re-linking needed)
- On re-authorization failure, show an error modal with a "Try again" button (more prominent than a toast)
- Prefer extending/renewing the existing EB session if the API supports it, fall back to creating a new session if not
- Re-auth button appears in both the global consent banner AND on individual account rows in the bank sync page
- Re-authorization is per-session: one OAuth flow renews all accounts under that bank session
- Consent expiry notifications are in-app only (no email/push notifications)

### Sync-on-Open
- When app opens and last sync is 6+ hours old, run a background sync with a subtle indicator (small spinner or "Syncing..." text near account names), non-blocking so user can navigate freely
- Sync all linked accounts in parallel on open (not just EB, all bank sync providers: GoCardless, SimpleFin, etc.)
- 6-hour threshold is configurable in settings (default 6 hours)
- If sync-on-open fails, show a non-blocking toast ("Sync failed - check your connection") and let user continue with stale data
- Combined check on app open: check last sync age AND consent expiry in one pass, show both syncing indicator and consent banner if needed
- Last-synced timestamp updates only after sync completes successfully (no "syncing now" replacement during)
- Also trigger sync on window/tab focus if the stale threshold has passed (catches long idle sessions)

### Claude's Discretion
- Loading skeleton/spinner design details
- Exact banner component styling and animation
- Console log format and verbosity level
- Data flow for consent expiry to client (new endpoint vs extending sync-status)
- Whether to skip expired-consent accounts in scheduler or let API error

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `eb_sessions` table: already stores `valid_until` from EB session response (needs to use `maximum_consent_validity` instead of hardcoded 90 days)
- `eb_sync_log` table: append-only sync log with `actual_account_id`, `eb_account_uid`, `status`, `error_message` fields
- `eb_account_map` table: maps EB account UIDs to Actual Budget UUIDs, has `session_id` for session lookup
- `useEnableBankingSyncStatus` hook: fetches EB sync status per account, used by AccountRow
- `AccountRow.tsx`: already displays `last_sync` relative time with tooltip showing absolute datetime and EB error details
- `enablebanking-service.ts`: `createAuth()`, `exchangeCode()`, `getTransactions()`, `getBalances()` functions ready for reuse
- `tsToRelativeTime()` utility: converts timestamps to relative time strings

### Established Patterns
- EB routes use `handleError()` wrapper for consistent error handling
- Session validation via `validateSessionMiddleware` for authenticated routes
- Sync log pattern: insert success/error entries after each transaction fetch
- Account normalization via `normalizeAccount()` and `normalizeTransaction()`
- Existing `EBSession` type has `session_id`, `accounts[]`, `valid_until` fields

### Integration Points
- `createAuth()` in `enablebanking-service.ts`: currently hardcodes 90-day `valid_until`, needs to read `maximum_consent_validity` from EB API response
- `/callback` route: exchanges OAuth code and stores `valid_until` in `eb_sessions` - needs to store the real consent expiry
- `/sync-status` endpoint: returns last sync log entry per account - could be extended for consent status
- `AccountEntity.last_sync` field: already exists in the account model, updated after sync
- Desktop client `sync-event-handlers.ts`: handles sync events, potential hook point for sync-on-open

</code_context>

<specifics>
## Specific Ideas

No specific requirements - open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope

</deferred>

---

*Phase: 03-automation-consent-lifecycle*
*Context gathered: 2026-03-01*
