---
status: complete
phase: 03-automation-consent-lifecycle
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md
started: 2026-03-01T18:49:00Z
updated: 2026-03-01T19:12:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Scheduler starts with ENABLE_AUTO_SYNC gate
expected: Start the sync server with ENABLE_AUTO_SYNC=true. Server logs should show the cron scheduler registering (6-hour interval). Without the env var (or =false), no scheduler log appears.
result: pass
method: code-review
evidence: scheduler.ts:162-176 checks ENABLE_AUTO_SYNC env var, registers cron '0 0,6,12,18 * * *' (6h intervals), logs conditionally

### 2. /sync-status returns consent expiry fields
expected: Call GET /sync-status with linked Enable Banking accounts. Response includes consent_valid_until (ISO date), session_id, aspsp_name, and aspsp_country for each account.
result: pass
method: code-review
evidence: app-enablebanking.ts:378-381 returns all four fields from eb_sessions join

### 3. Consent expiry banner renders with graduated colors
expected: With bank accounts whose consent is near expiry, the ConsentExpiryBanner appears between Notifications and BankSyncStatus. Red for expired, orange for <7 days, yellow for <14 days. Accounts with >14 days remaining show no banner.
result: pass
method: code-review
evidence: FinancesApp.tsx renders Notifications > ConsentExpiryBanner > BankSyncStatus. useConsentExpiry hook: expired<=0d, urgent<=7d, soon<=14d, ok>14d filtered out

### 4. Banner dismiss persists for current day only
expected: Clicking dismiss on the consent banner hides it. Reloading the app on the same day keeps it hidden. The next calendar day, the banner reappears (localStorage key includes date).
result: pass
method: code-review
evidence: ConsentExpiryBanner.tsx:24-31 uses key `consent-dismissed-${sessionId}-${new Date().toDateString()}` in localStorage

### 5. Re-auth modal opens pre-filled from banner
expected: Clicking "Re-authorize" on the consent banner opens the Enable Banking OAuth modal. The country and bank fields are pre-filled (not showing the picker). Modal title says "Re-authorize Bank".
result: pass
method: code-review
evidence: ConsentExpiryBanner.tsx:69-83 dispatches modal with reauth=true, aspspName, aspspCountry. Modal initializes state from these, title="Re-authorize Bank (Enable Banking)"

### 6. Sync-on-open triggers after stale threshold
expected: After 6+ hours without syncing (or with bankSyncStaleThresholdHours set lower), opening/focusing the app triggers an automatic bank sync for stale accounts. Accounts with expired consent are skipped.
result: pass
method: code-review
evidence: FinancesApp.tsx:120-178 checks (staleThresholdHours ?? 6) * 3600000, filters expired consent at lines 151-156, triggers sync for stale accounts

### 7. OAuth re-auth completes and swaps session
expected: Completing the re-auth OAuth flow calls /reauth-complete, which swaps the old session_id to the new one in eb_account_map. An immediate sync fires for the re-authed accounts. Success message shows in the modal.
result: pass
method: code-review
evidence: app-enablebanking.ts:392-411 UPDATE eb_account_map SET session_id. Modal line 179 triggers accounts-bank-sync. Success message at lines 377-381.

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
