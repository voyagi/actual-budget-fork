---
status: testing
phase: 03-automation-consent-lifecycle
source: 03-01-SUMMARY.md, 03-02-SUMMARY.md
started: 2026-03-01T18:49:00Z
updated: 2026-03-01T18:49:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: 1
name: Scheduler starts with ENABLE_AUTO_SYNC gate
expected: |
  Start the sync server with ENABLE_AUTO_SYNC=true. Server logs should show the cron scheduler registering (6-hour interval). Without the env var (or =false), no scheduler log appears.
awaiting: user response

## Tests

### 1. Scheduler starts with ENABLE_AUTO_SYNC gate
expected: Start the sync server with ENABLE_AUTO_SYNC=true. Server logs should show the cron scheduler registering (6-hour interval). Without the env var (or =false), no scheduler log appears.
result: [pending]

### 2. /sync-status returns consent expiry fields
expected: Call GET /sync-status with linked Enable Banking accounts. Response includes consent_valid_until (ISO date), session_id, aspsp_name, and aspsp_country for each account.
result: [pending]

### 3. Consent expiry banner renders with graduated colors
expected: With bank accounts whose consent is near expiry, the ConsentExpiryBanner appears between Notifications and BankSyncStatus. Red for expired, orange for <7 days, yellow for <14 days. Accounts with >14 days remaining show no banner.
result: [pending]

### 4. Banner dismiss persists for current day only
expected: Clicking dismiss on the consent banner hides it. Reloading the app on the same day keeps it hidden. The next calendar day, the banner reappears (localStorage key includes date).
result: [pending]

### 5. Re-auth modal opens pre-filled from banner
expected: Clicking "Re-authorize" on the consent banner opens the Enable Banking OAuth modal. The country and bank fields are pre-filled (not showing the picker). Modal title says "Re-authorize Bank".
result: [pending]

### 6. Sync-on-open triggers after stale threshold
expected: After 6+ hours without syncing (or with bankSyncStaleThresholdHours set lower), opening/focusing the app triggers an automatic bank sync for stale accounts. Accounts with expired consent are skipped.
result: [pending]

### 7. OAuth re-auth completes and swaps session
expected: Completing the re-auth OAuth flow calls /reauth-complete, which swaps the old session_id to the new one in eb_account_map. An immediate sync fires for the re-authed accounts. Success message shows in the modal.
result: [pending]

## Summary

total: 7
passed: 0
issues: 0
pending: 7
skipped: 0

## Gaps

[none yet]
