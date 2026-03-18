# Phase 8: Quality and Test Infrastructure - Research

**Researched:** 2026-03-19
**Domain:** React code splitting, Vitest coverage, Playwright CI, React error boundaries
**Confidence:** HIGH

## Summary

Phase 8 is a quality-only pass with no new features. The five tasks are: route-level code splitting (React.lazy + Suspense), sync failure UI audit (verify Phase 7 coverage is complete), Vitest coverage with v8 provider scoped to fork files, Playwright E2E CI re-enablement by aligning container to `@playwright/test` 1.58.2, and granular error boundaries around the EnableBanking OAuth modal and any remaining route-level gaps.

The project already has `react-error-boundary` 6.1.1 installed, an existing `RouteErrorBoundary` component (wrapping `react-router` `<Routes>` in `FinancesApp.tsx` via a single `<ErrorBoundary>`), a Vitest config in `packages/sync-server` with `coverage.enabled: false`, and a disabled E2E workflow pinned to the stale `v1.57.0-jammy` container image. The `@playwright/test` package is already at `1.58.2` in `packages/desktop-client/package.json`, meaning the fix is a single container tag bump.

**Primary recommendation:** Each area is a targeted mechanical change. No new dependencies are needed. Do tasks in order: (1) Playwright fix first (highest CI value, one-line change), (2) Vitest coverage config, (3) React.lazy code splitting, (4) error boundary additions, (5) sync failure UI audit.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Code splitting strategy**
- Route-level splitting only using React.lazy + Suspense — split at top-level page routes (accounts, budget, reports, settings, enable-banking)
- No React.lazy or Suspense exists yet — this is greenfield
- Suspense fallback: simple skeleton or spinner per route (not blank screen)
- No sub-route splitting or component-level splitting — keep it simple for v1

**Sync failure UI surfacing**
- Phase 7 already implemented `useOperationalAlerts` hook that polls GET /alerts every 60s and dispatches sticky notifications for `sync_failure`, `consent_expiry`, `auth_failure_burst`
- This phase verifies that coverage is complete and the UX is acceptable — no new sync failure UI needed
- If gaps found: extend existing alerter event types, not build a parallel system

**Code coverage**
- Use Vitest coverage with v8 provider (matches existing Vitest setup in sync-server)
- Target fork files only — upstream uncovered code is not our problem
- 60% line coverage threshold as a starting CI gate (non-blocking initially, promote to blocking once met)
- Cover `packages/sync-server/src/app-enablebanking/` and fork-modified files in `loot-core`

**E2E test fix**
- Fix Playwright browser version mismatch in CI container (`mcr.microsoft.com/playwright:v1.57.0-jammy` missing `chromium_headless_shell-1208`)
- Approach: align Playwright npm package version with container image version, or update container tag
- Re-enable the `if: false` guard in `.github/workflows/e2e-test.yml`
- Don't write new E2E tests — just get existing upstream E2E suite passing in CI

**Error boundaries**
- RouteErrorBoundary already exists — extend to wrap each lazy-loaded route
- Add error boundaries around EnableBanking-specific components that make network calls (OAuth flow, sync status, consent banner)
- Error boundary fallback: show a recoverable error message with retry button, not crash the whole app
- Don't add boundaries around every component — only at route splits and network-dependent EB components

### Claude's Discretion
- Exact Suspense fallback component design (skeleton vs spinner vs loading text)
- Coverage report format and CI integration details
- Specific Playwright version to pin to
- Error boundary fallback UI styling

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| perf-2 | Route-level code splitting via React.lazy + Suspense | React.lazy + Suspense + existing RouteErrorBoundary pattern documented; FinancesApp route map read |
| fq-1 | Surface sync failures in UI | useOperationalAlerts already complete in Phase 7; research confirms audit-only scope |
| dx-2 | Configure code coverage | Vitest v8 provider config pattern; include filter for fork files; sync-server vitest.config.ts baseline read |
| dx-1 | Fix E2E tests in CI | Package is already at @playwright/test 1.58.2; container tag v1.57.0-jammy is the mismatch; v1.58.2-jammy exists on MCR |
| fq-2 | Add granular error boundaries | Existing RouteErrorBoundary + react-error-boundary 6.1.1 pattern read; EnableBankingExternalMsgModal identified as network-dependent target |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-error-boundary | 6.1.1 | `ErrorBoundary` + `useErrorBoundary` hook | Already installed; used in App.tsx, FinancesApp.tsx, RouteErrorBoundary.tsx |
| React.lazy / Suspense | React 19.2.4 (built-in) | Dynamic route imports with loading fallback | Built into React; no extra dependency |
| @vitest/coverage-v8 | matches vitest ^4.0.18 | V8-native coverage instrumentation | No Babel transform needed; faster than Istanbul; matches existing sync-server config |
| @playwright/test | 1.58.2 | E2E test runner | Already in desktop-client/package.json devDeps |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| react-router `<Suspense>` boundary | react-router (existing) | Wrap `<Routes>` subtree | Route-level loading states |
| LoadingIndicator | existing component | Suspense fallback | Already used in FinancesApp for accounts-fetching state |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @vitest/coverage-v8 | @vitest/coverage-istanbul | Istanbul requires Babel transform, more config; v8 matches existing sync-server setup |
| mcr.microsoft.com/playwright:v1.58.2-jammy | v1.58.2-noble (Ubuntu 24.04) | jammy maintains consistency with existing CI; noble is newer but untested here |

**Installation:**

No new packages needed. To add coverage provider:
```bash
yarn workspace @actual-app/sync-server add -D @vitest/coverage-v8
```

**Version verification:** `@playwright/test` is already 1.58.2. `@vitest/coverage-v8` should match the vitest version in sync-server (^4.0.18).

---

## Architecture Patterns

### Recommended Structure for This Phase

```
.github/workflows/
└── e2e-test.yml          # Remove if: false; bump container to v1.58.2-jammy

packages/sync-server/
├── vitest.config.ts      # Add coverage provider + include filter
└── src/app-enablebanking/ # Coverage target

packages/desktop-client/src/
├── components/
│   ├── FinancesApp.tsx   # Replace eager imports with React.lazy; add Suspense wrappers
│   ├── RouteErrorBoundary.tsx  # Existing — reuse as-is for each lazy route
│   └── modals/
│       └── EnableBankingExternalMsgModal.tsx  # Wrap with ErrorBoundary
└── hooks/
    └── useEnableBankingStatus.ts  # useOperationalAlerts audit target
```

### Pattern 1: React.lazy Route Splitting

**What:** Replace a static import of a page component with `React.lazy(() => import(...))`, then wrap the `<Route element={...}>` in `<React.Suspense fallback={<LoadingIndicator/>}>`.

**When to use:** Top-level routes only. The existing `FinancesApp.tsx` imports all route components eagerly at the top of the file.

**Example:**
```typescript
// Before (eager import at top of FinancesApp.tsx):
import { Reports } from './reports';

// After (lazy import, module-level — NOT inside component):
const Reports = React.lazy(() => import('./reports').then(m => ({ default: m.Reports })));

// In JSX — Suspense wraps the entire <Routes> block or individual <Route>:
<React.Suspense fallback={<LoadingIndicator />}>
  <RouteErrorBoundary>
    <Routes>
      <Route path="/reports/*" element={<Reports />} />
      {/* ... */}
    </Routes>
  </RouteErrorBoundary>
</React.Suspense>
```

**Named export caveat:** `React.lazy` only works with default exports. When the module uses a named export (e.g. `export function Reports`), use `.then(m => ({ default: m.Reports }))` in the dynamic import to adapt it. This is the standard pattern and is HIGH confidence.

**Where in FinancesApp.tsx:** The `<RouteErrorBoundary>` already wraps `<Routes>` at line 404. A single `<React.Suspense>` wrapper outside `<RouteErrorBoundary>` covers all routes — no per-route Suspense needed.

### Pattern 2: Vitest v8 Coverage Config

**What:** Add `coverage` block to `vitest.config.ts` with `provider: 'v8'`, `include` limited to fork files, and `thresholds`.

**Example:**
```typescript
// packages/sync-server/vitest.config.ts
export default {
  test: {
    // ... existing config
    coverage: {
      enabled: false,        // keep false for normal test runs
      provider: 'v8',
      include: [
        'src/app-enablebanking/**',
        'src/scheduler.ts',
        'src/util/alerter.ts',
      ],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      thresholds: {
        lines: 60,           // non-blocking initially
      },
      reporter: ['text', 'lcov'],
    },
  },
};
```

To run coverage: `yarn test --coverage`. To enforce in CI: add `--coverage --coverage.enabled` flags.

### Pattern 3: Error Boundary Around Network-Dependent Component

**What:** Wrap `EnableBankingExternalMsgModal` content (not the `<Modal>` shell) with `<ErrorBoundary>` from `react-error-boundary`, using `RouteErrorFallback` or a minimal inline fallback.

**When to use:** Any component that calls `send()`/`sendCatch()` at render time or in `useEffect` without its own error state — if the call throws rather than returning an error object, an uncaught exception will propagate to the nearest boundary.

**Example:**
```typescript
// In EnableBankingExternalMsgModal.tsx (or its parent modal container):
import { ErrorBoundary } from 'react-error-boundary';

function EBErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <View style={{ padding: 20 }}>
      <View>Something went wrong: {error.message}</View>
      <Button variant="primary" onPress={resetErrorBoundary}>Try again</Button>
    </View>
  );
}

// Wrap the modal body content:
<ErrorBoundary FallbackComponent={EBErrorFallback}>
  {/* existing modal body */}
</ErrorBoundary>
```

### Pattern 4: Playwright Container Version Fix

**What:** Update the `image:` field in `e2e-test.yml` from `mcr.microsoft.com/playwright:v1.57.0-jammy` to `mcr.microsoft.com/playwright:v1.58.2-jammy`. Then remove or set `if: true` on all `if: false` guards.

**Where:** Four places in `.github/workflows/e2e-test.yml` — jobs `functional`, `functional-desktop-app`, `vrt`, `merge-vrt`. Each has `if: false` and each `functional`/`vrt` job has the stale container tag.

**Note:** `merge-vrt` has `needs: vrt` — when un-commenting both, `merge-vrt`'s `if: false` also needs removal.

### Anti-Patterns to Avoid

- **React.lazy inside a component function:** The lazy factory is called on every render. Define at module scope.
- **Suspense outside ErrorBoundary:** Errors during lazy chunk loading (network failure fetching the JS chunk) surface as render errors, not Suspense. `ErrorBoundary` must wrap (or co-wrap) `Suspense` to catch chunk load failures.
- **Per-route Suspense with different fallbacks for each route:** Adds complexity without measurable benefit at this scale. One Suspense wrapping the entire Routes block is sufficient.
- **Coverage `enabled: true` in normal test config:** Slows down every test run. Keep `enabled: false`; enable only in CI coverage job or via CLI flag.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Error boundary component | Custom try/catch wrapper | `react-error-boundary` `<ErrorBoundary>` | Handles React render-phase errors, async boundary reset, `useErrorBoundary` hook — all edge cases handled |
| Coverage instrumentation | Manual Istanbul setup | `@vitest/coverage-v8` | V8 built-in; no Babel pipeline; zero-config with vitest |
| Lazy chunk loading state | Custom loading hook | `React.Suspense` | React manages the Promise-based loading protocol natively |
| Playwright browser install in CI | Custom download script | MCR Playwright image | Image bundles exact browser versions matching the npm package |

---

## Common Pitfalls

### Pitfall 1: Named Export Incompatibility with React.lazy

**What goes wrong:** `React.lazy(() => import('./reports'))` only works when the module's default export is the component. `Reports`, `Settings`, `NarrowAlternate` etc. are all named exports.

**Why it happens:** React.lazy spec requires a module with `{ default: Component }`.

**How to avoid:** Always use `.then(m => ({ default: m.ComponentName }))` in the import factory, or add a `export default` re-export in the target file.

**Warning signs:** TypeScript will show `Type 'Promise<typeof import(...)>' is not assignable` if the module has no default export.

### Pitfall 2: Suspense Fallback Causes Layout Shift

**What goes wrong:** A full-page spinner replacing the route content shifts the sidebar/titlebar layout on route navigation.

**Why it happens:** Suspense unmounts the previous content and shows the fallback during chunk loading. On fast connections the flash is nearly imperceptible; on slow connections it's jarring.

**How to avoid:** Use a lightweight fallback that preserves layout (a positioned loading indicator inside the content area rather than full-page replacement). The existing `<LoadingIndicator />` component from `./reports/LoadingIndicator` is appropriate.

### Pitfall 3: E2E CI Re-enablement Causes Flake Storm

**What goes wrong:** After re-enabling, the E2E suite produces intermittent failures unrelated to the container fix, overwhelming CI signal.

**Why it happens:** E2E tests have been disabled since February 2025; upstream may have accumulated flaky tests or timing issues.

**How to avoid:** Re-enable as a separate commit so any flake is clearly attributable to pre-existing test state, not this phase's code changes. Do not write new tests; just un-gate the existing suite.

### Pitfall 4: Coverage Include Patterns Matching Upstream Files

**What goes wrong:** `include: ['src/**']` in sync-server catches all upstream files, surfacing hundreds of uncovered upstream lines and making the 60% threshold immediately fail.

**Why it happens:** The sync-server has upstream-managed files alongside fork-specific `app-enablebanking/` and `scheduler.ts`.

**How to avoid:** Enumerate fork-specific paths explicitly: `src/app-enablebanking/**`, `src/scheduler.ts`, `src/util/alerter.ts`. Do not use glob-all patterns.

### Pitfall 5: Chunk Load Errors Not Caught by ErrorBoundary

**What goes wrong:** If the CDN or static server returns a 404 for a lazy chunk (e.g. after a deploy), React throws a network error during the Suspense resolution. If `<Suspense>` is not co-located with an `<ErrorBoundary>`, the error propagates to the nearest parent boundary, which may be the top-level `FatalError`.

**Why it happens:** `React.lazy` rejects its Promise on chunk load failure; this propagates as a render error.

**How to avoid:** Always nest `<Suspense>` inside or adjacent to an `<ErrorBoundary>`. The existing `<RouteErrorBoundary>` already wraps `<Routes>`, so placing `<Suspense>` inside `<RouteErrorBoundary>` (wrapping `<Routes>`) catches chunk failures correctly.

---

## Code Examples

### Existing RouteErrorBoundary (from source)

```typescript
// packages/desktop-client/src/components/RouteErrorBoundary.tsx
export function RouteErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary FallbackComponent={RouteErrorFallback}>
      {children}
    </ErrorBoundary>
  );
}
// RouteErrorFallback shows error.message + "Try again" Button (variant="primary")
// Uses theme.pageText/pageTextLight for consistent styling
```

### Current FinancesApp Route Structure (key section)

```typescript
// Line 404 in FinancesApp.tsx — existing structure:
<RouteErrorBoundary>
  <Routes>
    <Route path="/reports/*" element={<Reports />} />
    <Route path="/budget" element={<NarrowAlternate name="Budget" />} />
    <Route path="/settings" element={<Settings />} />
    // ... other routes
  </Routes>
</RouteErrorBoundary>

// Target structure after code splitting:
<React.Suspense fallback={<LoadingIndicator />}>
  <RouteErrorBoundary>
    <Routes>
      <Route path="/reports/*" element={<Reports />} />
      {/* React.lazy wraps each heavy import */}
    </Routes>
  </RouteErrorBoundary>
</React.Suspense>
```

### Vitest Coverage CLI

```bash
# Run with coverage (sync-server):
yarn workspace @actual-app/sync-server test --coverage --coverage.enabled

# CI step addition:
- name: Run coverage
  run: yarn workspace @actual-app/sync-server test --coverage --coverage.enabled --coverage.thresholds.lines=60
```

### E2E Container Fix (diff summary)

```yaml
# In .github/workflows/e2e-test.yml
# Change EVERY occurrence of:
image: mcr.microsoft.com/playwright:v1.57.0-jammy
# To:
image: mcr.microsoft.com/playwright:v1.58.2-jammy

# And remove all:
if: false
# (4 jobs: functional, functional-desktop-app, vrt, merge-vrt)
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Istanbul coverage (Babel transform) | V8 coverage (native) | Vitest 1.x+ | Zero Babel config; faster |
| `import()` with default exports only | `.then(m => ({ default: m.X }))` adapter | React.lazy since React 16.6 | Named export support |
| Global ErrorBoundary only | Route-level + component-level ErrorBoundary | React 16+ best practice | Recoverable errors instead of white screen |

**Deprecated/outdated:**
- `React.lazy` + `import()` requires that the chunk load is triggered at render time, not in event handlers. This has been stable since React 16.6. No changes in React 19.

---

## Open Questions

1. **NarrowAlternate and WideComponent lazy-loading**
   - What we know: `NarrowAlternate` and `WideComponent` are wrapper components that dynamically load named modules (e.g. `name="Budget"`) using an internal registry — they already do their own lazy loading internally.
   - What's unclear: Whether wrapping `<NarrowAlternate name="Budget" />` in `React.lazy` provides any additional benefit, since the internal loading is already deferred.
   - Recommendation: Do NOT wrap `NarrowAlternate`/`WideComponent` themselves in `React.lazy`. Only wrap the routes with direct heavy imports like `<Reports />`, `<Settings />`, `<UserDirectoryPage />`.

2. **`functional-desktop-app` E2E job after re-enablement**
   - What we know: This job runs Electron E2E tests (`yarn e2e:desktop`) requiring `xvfb` — this works in the Playwright container.
   - What's unclear: Whether the Electron binary is present in CI since it's not built in the standard monorepo workflow.
   - Recommendation: Re-enable the web E2E shards first (`functional`), leave `functional-desktop-app` disabled until confirmed buildable in CI.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.0.18 (sync-server), Vitest ^4.x (desktop-client via root config) |
| Config file | `packages/sync-server/vitest.config.ts` (coverage config target) |
| Quick run command | `yarn workspace @actual-app/sync-server test --run` |
| Full suite command | `yarn test` (root vitest workspace, all packages) |
| Coverage run command | `yarn workspace @actual-app/sync-server test --coverage --coverage.enabled` |
| E2E run command | `yarn workspace @actual-app/web e2e` (after CI re-enablement) |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| perf-2 | React.lazy chunks load on route navigation | smoke (manual verify) | `yarn build && check chunk files in dist/` | N/A — build artifact check |
| perf-2 | Suspense fallback renders during chunk load | unit | `yarn workspace @actual-app/web test --run` | ❌ Wave 0 (new test) |
| fq-1 | useOperationalAlerts dispatches on sync_failure alert | unit | `yarn workspace @actual-app/sync-server test --run` | ❌ Wave 0 (extend existing) |
| dx-2 | Coverage report generates for fork files only | coverage | `yarn workspace @actual-app/sync-server test --coverage --coverage.enabled` | ❌ Wave 0 (config only) |
| dx-1 | E2E tests pass in CI with correct container | e2e / CI | GitHub Actions run | ❌ Wave 0 (CI fix) |
| fq-2 | ErrorBoundary catches OAuth modal render error | unit | `yarn workspace @actual-app/web test --run` | ❌ Wave 0 (new test) |

### Sampling Rate

- **Per task commit:** `yarn workspace @actual-app/sync-server test --run`
- **Per wave merge:** `yarn test` (full workspace)
- **Phase gate:** Full suite green + E2E CI green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `packages/sync-server/vitest.config.ts` — add `@vitest/coverage-v8` coverage block (config change, not new file)
- [ ] `packages/sync-server/package.json` — add `@vitest/coverage-v8` as devDep (`yarn workspace @actual-app/sync-server add -D @vitest/coverage-v8`)
- [ ] `.github/workflows/e2e-test.yml` — container tag fix + `if: false` removal (CI config, not test file)
- No new test fixture files are required; existing globalSetup covers the sync-server test DB

---

## Sources

### Primary (HIGH confidence)

- Read directly: `packages/desktop-client/src/components/FinancesApp.tsx` — route structure, existing imports, Suspense insertion point
- Read directly: `packages/desktop-client/src/components/RouteErrorBoundary.tsx` — existing boundary implementation
- Read directly: `packages/desktop-client/src/components/App.tsx` — top-level ErrorBoundary placement
- Read directly: `packages/desktop-client/src/hooks/useEnableBankingStatus.ts` — useOperationalAlerts complete implementation
- Read directly: `packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx` — network-dependent EB component
- Read directly: `packages/desktop-client/package.json` — `@playwright/test: 1.58.2` confirmed
- Read directly: `.github/workflows/e2e-test.yml` — `v1.57.0-jammy` container + all four `if: false` guards
- Read directly: `packages/sync-server/vitest.config.ts` — `coverage.enabled: false` baseline
- Read directly: `packages/sync-server/vitest.globalSetup.js` — existing test DB setup pattern
- Read directly: `packages/sync-server/package.json` — vitest ^4.0.18, no coverage-v8 yet

### Secondary (MEDIUM confidence)

- [MCR playwright:v1.58.2-jammy](https://mcr.microsoft.com/en-us/artifact/mar/playwright/tag/v1.58.2) — confirmed tag exists on Microsoft Container Registry
- [MCR playwright:v1.58.2](https://mcr.microsoft.com/en-us/artifact/mar/playwright/tag/v1.58.2) — default (noble) tag also confirmed

### Tertiary (LOW confidence)

None required — all findings verified from source files or official registry.

---

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — all libraries read directly from installed package.json files
- Architecture: HIGH — based on reading actual source files (FinancesApp.tsx, RouteErrorBoundary.tsx, vitest.config.ts, e2e-test.yml)
- Pitfalls: HIGH — based on direct code inspection + stable React.lazy patterns
- E2E fix: HIGH — package version (1.58.2) vs container version (1.57.0) mismatch confirmed from source; v1.58.2-jammy existence confirmed via MCR search

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable libraries; Playwright images are pinned versions)
