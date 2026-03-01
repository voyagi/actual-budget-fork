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
- When a scheduled sync fails for one account, continue syncing remaining accounts and log the error
- Log sync runs to both console (visible in docker logs) and database (eb_sync_log entries)

### Consent Expiry UX
- Graduated placement: global banner at top of app for urgent warnings (< 7 days), plus subtle indicator on account list page always
- Banner is dismissible but re-appears daily until consent is renewed
- Graduated urgency colors: 14-7 days informational/yellow, under 7 days warning/orange, expired error/red
- When multiple banks have expiring consent, show a single grouped banner ("2 bank connections expiring soon") with a link to the account list

### Re-authorization Flow
- Reuse the existing OAuth popup flow (create-auth, bank redirect, callback) for re-authorization
- After successful re-authorization, immediately trigger a sync so user sees fresh data confirming re-auth worked
- Preserve existing account links automatically by matching EB account UIDs from the new session to existing eb_account_map rows (no re-linking needed)
- On re-authorization failure (user cancels at bank or bank rejects), show a brief toast error and keep the consent warning banner visible

### Sync-on-Open
- When app opens and last sync is 6+ hours old, run a background sync with a subtle indicator (small spinner or "Syncing..." text near account names), non-blocking so user can navigate freely
- 6-hour threshold is hardcoded (not configurable in settings)
- If sync-on-open fails, show a non-blocking toast ("Sync failed - check your connection") and let user continue with stale data

### Claude's Discretion
- Whether sync-on-open syncs accounts in parallel or sequentially (consider EB API rate limits)
- Loading skeleton/spinner design details
- Exact banner component styling and animation
- Console log format and verbosity level

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
