---
status: complete
phase: 05-infrastructure-and-production
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md]
started: 2026-05-06T15:30:06+02:00
updated: 2026-05-06T15:41:17+02:00
---

## Current Test

[testing complete]

## Tests

### 1. Docker production stack preflight

expected: `docker-compose config --quiet` passes, the production stack starts, and `docker-compose ps` shows Caddy, Cloudflared, and sync-server running with sync-server healthy.
result: pass
evidence: `docker-compose config --quiet` returned exit code 0 on 2026-05-06. `docker-compose ps` showed Caddy and Cloudflared up for 45 hours and sync-server up for 2 hours with `(healthy)` status.

### 2. Public HTTPS health check

expected: The public Cloudflare Tunnel URL responds over HTTPS without exposing the raw sync-server port.
result: pass
evidence: `curl.exe -s https://actual-budget.taranity.com/health` returned `{"status":"UP"}` on 2026-05-06.

### 3. Desktop browser production access

expected: Desktop Chrome can open the production URL, log in, open the budget file, and show `Server online` without a browser certificate warning.
result: pass
evidence: User screenshots showed `https://actual-budget.taranity.com` opened on desktop with the `My Finances` budget loaded and `Server online`.

### 4. Phone browser production access

expected: iPhone Safari and iPhone Chrome can open the production URL, recover from stale client state, and reach the file picker/budget without a fatal UI error.
result: pass
evidence: User screenshots showed Safari and Chrome on iPhone loading the Actual file picker after the `/account/reset-client` client-reset path cleared stale browser state.

### 5. Data persistence after Docker restart/rebuild

expected: Budget data remains after restarting or rebuilding the Docker stack.
result: pass
evidence: After rebuilding/restarting sync-server, the same `My Finances` budget, balances, and linked OP accounts remained visible.

### 6. Multi-device budget availability

expected: The same budget is available from desktop and phone through the production URL.
result: pass
evidence: Desktop and iPhone screenshots both showed the production server and the `My Finances` file path. Full two-way transaction-entry testing was not repeated in this UAT pass.

### 7. Production readiness warning activation and clearing

expected: The whole-app warning appears when required production checks are untrusted, and clears only after verified recovery evidence.
result: pass
evidence: The warning appeared while bank sync was untrusted. It cleared only after the bank-sync recovery check observed recent successful `eb_sync_log` rows.

### 8. Enable Banking sandbox authorization

expected: The Enable Banking OAuth flow opens a real ASPSP consent page instead of `about:blank`, returns through the public callback URL, and completes successfully.
result: pass
evidence: OP sandbox authorization completed successfully after the public callback URL was allowlisted and consent validity was reduced by the ASPSP buffer.

### 9. Enable Banking sandbox sync recovery

expected: Existing linked OP sandbox accounts recover from expired sessions and record recent successful sync evidence.
result: pass
evidence: Bank Sync page showed two OP rows with `Last sync: Less than a minute ago`; transaction probes returned `status: ok`; latest `eb_sync_log` rows were successful; `/production-trust/check` marked `bank_sync` trusted.

### 10. Production real-bank OAuth

expected: A production Enable Banking application with a real bank account completes OAuth through the user's real bank.
result: skipped
reason: Production Enable Banking application and real bank account are not configured in this environment.
evidence: Not configured in this environment. Current verification uses the Enable Banking sandbox OP ASPSP only.

### 11. Production real-bank sync

expected: A real linked bank account syncs successfully and creates recent successful production `eb_sync_log` evidence.
result: skipped
reason: Production Enable Banking application and real linked bank account are not configured in this environment.
evidence: Not configured in this environment. Sandbox OP sync recovery passed and proves app wiring, callback routing, token handling, reauthorization remapping, and trust recovery behavior.

## Summary

total: 11
passed: 9
issues: 0
pending: 0
skipped: 2

## Gaps

[none]

## Deferred Follow-Up

- Production real-bank OAuth and real-bank sync remain outside Phase 5 because this deployment is still using the Enable Banking sandbox application and OP sandbox ASPSP.
- Full two-way transaction-entry testing across desktop and phone was not repeated during this UAT pass; verified evidence covers same-budget production availability on both devices.
