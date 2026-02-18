---
phase: 01-foundation-and-api-client
plan: 03
subsystem: api
tags: [jwt, jose, axios, enable-banking, docker, rsa]

# Dependency graph
requires:
  - phase: 01-foundation-and-api-client
    provides: Plan 01-01 Docker build working, Plan 01-02 RSA key and sandbox credentials ready
provides:
  - Enable Banking service module with JWT signing via jose (RS256)
  - GET /enablebanking/test-auth endpoint - unauthenticated sandbox auth verification
  - POST /enablebanking/status endpoint - session-authenticated production status
  - Confirmed: RSA key persists across container down/up cycles
  - Confirmed: Enable Banking sandbox API returns 200 with valid JWT
affects: [phase-02-bank-sync-pipeline, phase-03-automation-and-consent]

# Tech tracking
tech-stack:
  added: [jose 6.1.3, axios 1.13.5]
  patterns:
    - "Two-file adapter pattern: enablebanking-service.js (API client) + app-enablebanking.js (Express routes)"
    - "Lazy key loading: importPKCS8 cached in module-level variable on first call"
    - "Unauthenticated test route before export+session middleware for dev verification"

key-files:
  created:
    - packages/sync-server/src/app-enablebanking/enablebanking-service.js
    - packages/sync-server/src/app-enablebanking/app-enablebanking.js
    - packages/sync-server/src/app-enablebanking/util/handle-error.js
  modified:
    - packages/sync-server/src/app.ts

key-decisions:
  - "Lazy key loading on first request (not startup) avoids startup failures when EB not configured"
  - "Unauthenticated GET /test-auth placed before session middleware for automated verification without Actual user login"
  - "jose importPKCS8 handles PKCS#8 PEM natively - no openssl conversion needed (key confirmed PKCS#8)"

patterns-established:
  - "enablebanking-service.js exports: loadPrivateKey, generateJWT, ebRequest, testAuth"
  - "JWT header: alg RS256, typ JWT, kid = ENABLE_BANKING_APP_ID"
  - "JWT payload: iss enablebanking.com, aud api.enablebanking.com, iat+exp (now+3600)"

requirements-completed: [FOUND-03]

# Metrics
duration: 45min
completed: 2026-02-18
---

# Phase 01 Plan 03: Enable Banking JWT Auth and API Client Summary

**RS256 JWT signing via jose + Enable Banking sandbox API verified end-to-end - `configured: true` confirmed after container restart**

## Performance

- **Duration:** ~45 min
- **Started:** 2026-02-18T18:00:00Z
- **Completed:** 2026-02-18T18:45:00Z
- **Tasks:** 2 of 3 complete (Task 3 is checkpoint:human-verify, awaiting user)
- **Files modified:** 4

## Accomplishments

- Enable Banking adapter module built following GoCardless two-file pattern exactly
- JWT signing pipeline verified: jose RS256 + PKCS#8 key + sandbox API returns 200
- RSA key persistence confirmed: `docker compose down && docker compose up -d` returns `configured: true`
- Container logs clean - lazy key loading means no EB startup errors when credentials present

## Task Commits

1. **Task 1: Create Enable Banking service, routes, and mount in app.ts** - `462e2568e` (feat) - *committed in plan 01-02 execution (scaffold was ahead-of-plan)*
2. **Task 2: Rebuild Docker, test sandbox auth, verify RSA key persistence** - No code changes; Docker rebuilt and verification run. Results documented in SUMMARY.

**Plan metadata:** committed after checkpoint resolves

## Files Created/Modified

- `packages/sync-server/src/app-enablebanking/enablebanking-service.js` - loadPrivateKey, generateJWT, ebRequest, testAuth exports
- `packages/sync-server/src/app-enablebanking/app-enablebanking.js` - Express routes: GET /test-auth (unauthenticated), POST /status (session-auth)
- `packages/sync-server/src/app-enablebanking/util/handle-error.js` - Async error wrapper matching GoCardless pattern
- `packages/sync-server/src/app.ts` - Added import and mount at /enablebanking

## Decisions Made

- Lazy key loading on first request (not container startup). This avoids startup failures if EB is not configured yet, and matches the GoCardless pattern where credentials are optional.
- GET /test-auth placed before `export { app as handlers }` AND before session middleware - making it accessible without an Actual user session. This is a development verification route only; production use goes through POST /status which is session-authenticated.
- jose handles PKCS#8 (`BEGIN PRIVATE KEY`) natively. The Enable Banking dashboard generates PKCS#8 format, so no openssl conversion is needed.

## Deviations from Plan

### Structural Note (Not a Deviation - Planned Ahead)

**Task 1 code committed in plan 01-02 execution**
- **Context:** Plan 01-02 executor created the three EB files plus app.ts mount as part of the `/test-auth` scaffold commit `462e2568e`. This was the final commit of plan 01-02.
- **Effect on plan 01-03:** Task 1 verification passed immediately - all files existed and matched spec. No code changes needed. Task 2 proceeded directly to Docker rebuild.
- **Impact:** No scope creep. The work was correct and complete. This just means the task boundary between plan 01-02 and 01-03 was slightly blurred at the scaffold level.

None of the deviation rules triggered - this was planned ahead, not unplanned work.

## Issues Encountered

- **Docker cache hit on first rebuild**: `docker compose build` used cached layers and did not pick up new Enable Banking files. Required `docker compose build --no-cache` to force full rebuild including the new app-enablebanking files. This is a one-time issue; future builds will correctly detect changed source files.
- **curl not working in MSYS bash**: curl exits with code 1/23 in this environment. Used PowerShell `Invoke-WebRequest` instead for all HTTP verification steps.

## User Setup Required

None - sandbox credentials are already in place from Plan 01-02. The RSA key at `secrets/eb_private.pem` and `ENABLE_BANKING_APP_ID` in `.env` were configured in the previous plan.

## Next Phase Readiness

- Enable Banking API client is verified end-to-end against the sandbox
- JWT signing pipeline is proven working
- Key persistence is confirmed
- Phase 1 is complete pending Task 3 user verification (checkpoint:human-verify)
- Phase 2 (Bank Sync Pipeline) can begin once user approves the Phase 1 checkpoint

---
*Phase: 01-foundation-and-api-client*
*Completed: 2026-02-18*

## Self-Check: PASSED

- FOUND: `packages/sync-server/src/app-enablebanking/enablebanking-service.js`
- FOUND: `packages/sync-server/src/app-enablebanking/app-enablebanking.js`
- FOUND: `packages/sync-server/src/app-enablebanking/util/handle-error.js`
- FOUND: commit `462e2568e` - feat(sync-server): [eb] add Enable Banking API client scaffold
- FOUND: `GET /enablebanking/test-auth` returns `{"status":"ok","data":{"configured":true}}`
- FOUND: RSA key persists across `docker compose down && docker compose up -d` - same response after restart
- FOUND: `.planning/phases/01-foundation-and-api-client/01-03-SUMMARY.md`
