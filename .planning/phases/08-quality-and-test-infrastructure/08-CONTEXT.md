# Phase 8: Quality and Test Infrastructure - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement route-level code splitting, surface sync failures in UI, configure code coverage, fix E2E tests in CI, add granular error boundaries. This is quality infrastructure — no new features, just making existing code more robust, testable, and performant.

</domain>

<decisions>
## Implementation Decisions

### Code splitting strategy
- Route-level splitting only using React.lazy + Suspense — split at top-level page routes (accounts, budget, reports, settings, enable-banking)
- No React.lazy or Suspense exists yet — this is greenfield
- Suspense fallback: simple skeleton or spinner per route (not blank screen)
- No sub-route splitting or component-level splitting — keep it simple for v1

### Sync failure UI surfacing
- Phase 7 already implemented `useOperationalAlerts` hook that polls GET /alerts every 60s and dispatches sticky notifications for `sync_failure`, `consent_expiry`, `auth_failure_burst`
- This phase verifies that coverage is complete and the UX is acceptable — no new sync failure UI needed
- If gaps found: extend existing alerter event types, not build a parallel system

### Code coverage
- Use Vitest coverage with v8 provider (matches existing Vitest setup in sync-server)
- Target fork files only — upstream uncovered code is not our problem
- 60% line coverage threshold as a starting CI gate (non-blocking initially, promote to blocking once met)
- Cover `packages/sync-server/src/app-enablebanking/` and fork-modified files in `loot-core`

### E2E test fix
- Fix Playwright browser version mismatch in CI container (`mcr.microsoft.com/playwright:v1.57.0-jammy` missing `chromium_headless_shell-1208`)
- Approach: align Playwright npm package version with container image version, or update container tag
- Re-enable the `if: false` guard in `.github/workflows/e2e-test.yml`
- Don't write new E2E tests — just get existing upstream E2E suite passing in CI

### Error boundaries
- RouteErrorBoundary already exists — extend to wrap each lazy-loaded route
- Add error boundaries around EnableBanking-specific components that make network calls (OAuth flow, sync status, consent banner)
- Error boundary fallback: show a recoverable error message with retry button, not crash the whole app
- Don't add boundaries around every component — only at route splits and network-dependent EB components

### Claude's Discretion
- Exact Suspense fallback component design (skeleton vs spinner vs loading text)
- Coverage report format and CI integration details
- Specific Playwright version to pin to
- Error boundary fallback UI styling

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Error boundaries
- `packages/desktop-client/src/components/RouteErrorBoundary.tsx` — Existing error boundary pattern to extend
- `packages/desktop-client/src/components/App.tsx` — Where top-level error boundary is mounted

### E2E tests
- `.github/workflows/e2e-test.yml` — Disabled E2E workflow, needs Playwright version fix
- `.github/workflows/e2e-vrt-comment.yml` — VRT comment workflow, may need similar fix

### Observability (Phase 7 overlap)
- `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` — useOperationalAlerts hook (sync failure surfacing already implemented)
- `packages/sync-server/src/util/alerter.ts` — In-memory alert store with event types
- `packages/sync-server/src/app.ts` — GET /alerts and POST /alerts/acknowledge endpoints

### Test infrastructure
- `packages/sync-server/vitest.globalSetup.js` — Existing Vitest global setup
- `packages/sync-server/package.json` — Current test configuration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RouteErrorBoundary.tsx`: Existing error boundary component — extend for lazy routes
- `useOperationalAlerts` hook: Already surfaces sync failures as sticky notifications
- Vitest setup in sync-server: Foundation for coverage configuration

### Established Patterns
- No code splitting exists — React.lazy/Suspense is entirely new to this codebase
- ErrorBoundary pattern established in 4 files (RouteErrorBoundary, FinancesApp, App, GetCardData)
- Vitest is the test runner for sync-server; upstream uses Vitest across packages

### Integration Points
- Route definitions in desktop-client (where React.lazy wraps will go)
- `.github/workflows/e2e-test.yml` (re-enable E2E)
- `vitest.config` files per package (add coverage config)
- `package.json` scripts (add coverage commands)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-quality-and-test-infrastructure*
*Context gathered: 2026-03-19*
