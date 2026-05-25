# Phase 4: PWA Completion - Research

**Researched:** 2026-03-19
**Domain:** Progressive Web App (PWA) — VitePWA/Workbox, web app manifest, service worker, responsive mobile layout
**Confidence:** HIGH

## Summary

The existing PWA setup is approximately 90% complete. The service worker is NOT disabled — the `generateSW` strategy is active and working. What is commented out in `vite.config.mts` (lines 161-177) is the `injectManifest` strategy that was tried and abandoned due to offline support issues. The active `VitePWA` configuration uses `generateSW`, `registerType: 'prompt'`, and a full Workbox config. The `registerSW` call in `browser-preload.browser.js` is already wired up with `onNeedRefresh` triggering `markUpdateReadyForDownload`, and `applyAppUpdate()` calling `updateSW()` to reload.

The manifest (`site.webmanifest`) is complete: name, short_name, icons (192px + 512px, any + maskable), shortcuts, screenshots, theme_color, background_color, display: standalone, start_url. All required icon files exist in `public/`. The `index.html` has the correct viewport meta, manifest link with `crossorigin="use-credentials"`, apple-touch-icon, and theme-color meta. The `NarrowAlternate`/`WideComponent` pattern already handles mobile layout switching.

The primary remaining work is: (1) audit the build to confirm the service worker and precache manifest are actually being generated, (2) verify Android Chrome shows the install prompt end-to-end, (3) verify the responsive layout at 375px for fork-specific components (Enable Banking consent banner, sync status, OAuth modal), and (4) confirm iOS Safari behavior is deferred until Phase 5 HTTPS infrastructure provides a trusted cert.

**Primary recommendation:** Build the Docker image, load the app in Chrome DevTools, inspect the Application > Service Workers tab and Application > Manifest tab, and audit what Lighthouse reports. Fix any gaps found rather than rebuilding from scratch.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Offline data strategy**: Workbox precaches the app shell (JS, CSS, HTML, WASM, SQL) so the app loads offline. Budget data is already stored locally in IndexedDB by loot-core's browser worker — no additional data caching strategy needed. The current `generateSW` strategy is sufficient. Do NOT switch to `injectManifest` (the commented-out approach was abandoned due to issues).
- **Service worker update UX**: Keep current `registerType: 'prompt'`. Users see a prompt when a new version is available. Standard PWA update-available banner/toast, click to reload. No silent background updates.
- **Mobile usability verification**: Verify at 375px minimum width using browser DevTools. The existing `NarrowAlternate`/`WideComponent` responsive pattern handles layout switching. No new responsive breakpoints or layout code expected — verify existing responsive design works. Check Enable Banking-specific components (consent banner, sync status, OAuth modal) render correctly on narrow screens.
- **iOS Safari PWA behavior**: iOS PWA requires trusted HTTPS certificate — Caddy local CA is NOT trusted by iOS Safari. Cloudflare Tunnel (or real domain cert) required for iOS PWA install — this is an Infrastructure (Phase 5) dependency. Phase 4 can verify Android PWA independently; iOS verification deferred until HTTPS infrastructure is ready. Apple-touch-icon already exists in index.html and public/. `display: standalone` in manifest works on iOS Safari.
- **Do NOT re-enable injectManifest**: The commented-out `injectManifest` approach (lines 161-177 in vite.config.mts) was explicitly abandoned by upstream with a TODO note about "issues with offline support." Do not try to re-enable it.

### Claude's Discretion

- Exact Workbox cache size limits and eviction strategy
- Whether to add a custom offline fallback page or rely on cached app shell
- Service worker update prompt UI implementation (toast vs banner)
- Any minor manifest field additions (e.g., `orientation`, `scope`)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PWA-01 | Web app manifest is complete (name, icons 192px + 512px, start_url, display: standalone, theme_color) | Manifest already complete — verify it passes Lighthouse and is served correctly at runtime |
| PWA-02 | Service worker provides offline read of previously loaded budget data (cache-first for app shell, network-first for data) | generateSW with globPatterns already configured; verify precache manifest includes WASM/SQL files; IndexedDB holds budget data natively |
| PWA-03 | User can install the app on Android home screen from Chrome and it launches without browser chrome | Verify beforeinstallprompt fires, manifest meets Chrome criteria, SW is registered with fetch handler |
| PWA-04 | User can install the app on iOS home screen from Safari and it launches without browser chrome | DEFERRED to Phase 5 (requires trusted cert via Cloudflare Tunnel); apple-touch-icon and display:standalone already present |
| PWA-05 | UI is usable on mobile without horizontal scrolling or cut-off elements (verify existing responsive design) | NarrowAlternate/WideComponent pattern in place; audit fork-specific components at 375px |
| PWA-06 | Installed PWA has a polished splash screen and branded theme color (not a blank white screen on launch) | theme_color + background_color already in manifest and index.html; verify splash screen renders on Android |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| vite-plugin-pwa | ^1.2.0 (installed) | Service worker generation via Workbox, manifest injection | Already installed and configured; de facto standard for Vite PWA |
| workbox (via vite-plugin-pwa) | bundled | Precaching, routing strategies, SW lifecycle | Industry standard for SW logic; generateSW abstracts manual SW authoring |
| virtual:pwa-register | bundled with vite-plugin-pwa | SW registration + update lifecycle in app code | Already wired in browser-preload.browser.js |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Chrome DevTools Application tab | N/A | Inspect manifest, SW registration, precache entries | Primary debugging tool for PWA verification |
| Lighthouse (built into Chrome) | N/A | Automated PWA audit — installability, offline, manifest | Run against Docker build to find gaps |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| generateSW (current) | injectManifest | injectManifest gives full control but was abandoned upstream due to offline issues; do not switch |

**No installation needed** — all PWA dependencies are already in `packages/desktop-client/package.json`.

---

## Architecture Patterns

### What Is Already In Place

```
packages/desktop-client/
├── vite.config.mts          # VitePWA plugin: generateSW, registerType:'prompt', workbox config
├── index.html               # viewport, manifest link (crossorigin=use-credentials), apple-touch-icon, theme-color
├── public/
│   ├── site.webmanifest     # Complete: name, icons, shortcuts, screenshots, theme_color, display:standalone
│   ├── android-chrome-192x192.png   # purpose: any
│   ├── android-chrome-512x512.png   # purpose: any
│   ├── maskable-192x192.png         # purpose: maskable
│   ├── maskable-512x512.png         # purpose: maskable
│   └── apple-touch-icon.png
└── src/
    ├── browser-preload.browser.js   # registerSW with onNeedRefresh -> markUpdateReadyForDownload
    └── components/
        ├── FinancesApp.tsx          # waitForUpdateReadyForDownload -> update notification dispatch
        ├── UpdateNotification.tsx   # Electron update UI (not the SW prompt — separate concern)
        └── responsive/
            └── index.tsx            # NarrowAlternate / WideComponent pattern
```

### Pattern 1: SW Update Prompt (Already Wired)

**What:** `registerSW({ immediate: true, onNeedRefresh })` in `browser-preload.browser.js` sets `markUpdateReadyForDownload` which resolves `isUpdateReadyForDownloadPromise`. In `FinancesApp.tsx`, `init()` calls `global.Actual.waitForUpdateReadyForDownload()` and dispatches a sticky notification with "Update now" button that calls `global.Actual.applyAppUpdate()` which calls `updateSW()`.

**Key insight:** The PWA update prompt is already implemented end-to-end. No new UI code needed for `registerType: 'prompt'` flow.

**When to use:** This pattern fires when a new SW version is waiting. The `registerType: 'prompt'` means the new SW does NOT auto-activate until the user clicks "Update now."

### Pattern 2: Workbox generateSW Config (Active)

```typescript
// Source: packages/desktop-client/vite.config.mts lines 182-199
workbox: {
  globPatterns: [
    '**/*.{js,css,html,txt,wasm,sql,sqlite,ico,png,woff2,webmanifest}',
  ],
  ignoreURLParametersMatching: [/^v$/],
  navigateFallback: '/index.html',
  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
  navigateFallbackDenylist: [
    /^\/account\/.*$/,
    /^\/admin\/.*$/,
    /^\/secret\/.*$/,
    /^\/openid\/.*$/,
    /^\/plugins\/.*$/,
    /^\/kcab\/.*$/,
    /^\/plugin-data\/.*$/,
    /^\/enablebanking\/.*$/,  // Critical: prevents SW intercepting OAuth callback
  ],
},
```

**Key insight:** The 10MB limit is important. WASM and SQL files can be large. If any file exceeds 10MB it will be silently excluded from precache (and Workbox will throw since v0.20.2+). Monitor build output for warnings.

### Pattern 3: NarrowAlternate Responsive Pattern

```typescript
// Source: packages/desktop-client/src/components/responsive/index.tsx
// NarrowAlternate: loads narrow OR wide component based on useResponsive().isNarrowWidth
// WideComponent: always loads wide component
// Both use lazy loading via dynamic import
```

**When to use:** For any component that needs a different layout on mobile. Fork-specific components (consent banner, OAuth modal) should be audited at 375px — if they break, they need narrow variants or responsive CSS adjustments.

### Anti-Patterns to Avoid

- **Switching to injectManifest:** Upstream explicitly abandoned this due to offline support issues. The TODO comment at line 161 says "Fix this" — but the CONTEXT.md decision locks generateSW as the approach.
- **Adding `apple-mobile-web-app-capable` meta tag:** This old iOS meta tag is deprecated in iOS 17+. The `display: standalone` in the manifest is the correct modern approach.
- **Hardcoding SW registration outside `virtual:pwa-register`:** The existing `registerSW` in browser-preload.browser.js is the correct pattern. Do not add a second SW registration.
- **Using `maximum-scale=1, user-scalable=no` in viewport for accessibility:** Already present in index.html — note this conflicts with WCAG 1.4.4. However, this is existing upstream code and is out of scope for Phase 4.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Service worker generation | Custom SW file | Workbox generateSW via vite-plugin-pwa | SW caching logic has many edge cases (cache versioning, cleanup, race conditions) |
| Precache manifest | Manual file list | Workbox globPatterns | Workbox hashes assets and handles versioning automatically |
| SW registration + update lifecycle | Custom registration code | `virtual:pwa-register` + existing browser-preload.browser.js | Already wired; adding a second registration causes conflicts |
| Offline detection | Custom navigator.onLine code | Workbox navigateFallback + cached app shell | Workbox handles network-first/cache-first routing correctly |

**Key insight:** The entire PWA infrastructure exists. The work is verification and gap-filling, not construction.

---

## Common Pitfalls

### Pitfall 1: Manifest Not Served With Credentials
**What goes wrong:** The `site.webmanifest` file is fetched by the browser without credentials by default. On an authenticated app served behind Caddy, this may return 401, causing the manifest to fail to load and the install prompt to never appear.
**Why it happens:** Browser manifest fetches are anonymous unless `crossorigin="use-credentials"` is on the `<link rel="manifest">` tag.
**How to avoid:** The `index.html` already has `crossorigin="use-credentials"` on the manifest link (line 18). Verify the manifest is accessible without auth OR that the crossorigin attribute is being served in the built output. Note: `useCredentials: true` is NOT set in the vite.config.mts VitePWA options — the attribute was added manually to index.html. This is fine as long as it survives the build process.
**Warning signs:** Chrome DevTools Application tab shows manifest fetch failed or 401 error.

### Pitfall 2: Large WASM/SQL Files Excluded From Precache
**What goes wrong:** The loot-core browser build includes WASM and SQL files. If any exceed 10MB, they are excluded from the precache manifest and the app will not work offline for first-time loads.
**Why it happens:** `maximumFileSizeToCacheInBytes: 10 * 1024 * 1024` is the cap. Workbox throws a build error if files exceed this limit (since v0.20.2+).
**How to avoid:** Monitor Docker build output for Workbox warnings about file sizes. If build fails, increase the limit or exclude large binary assets with `globIgnores`.
**Warning signs:** Build output contains "Workbox: maximumFileSizeToCacheInBytes" warnings or errors; offline mode fails to load the budget.

### Pitfall 3: SW Not Active on First Visit
**What goes wrong:** On the very first visit, the SW installs but is not yet controlling the page. Network requests go to the server. The app appears to work online but fails offline until a second visit.
**Why it happens:** Default SW activation behavior — new SW waits for all tabs to close before taking control.
**How to avoid:** `registerType: 'prompt'` (current setting) means the SW does NOT auto-skip-waiting. After install, on the next visit it takes control. This is correct behavior for a finance app. Document this in testing: offline mode requires one prior online visit.
**Warning signs:** After "install," going offline immediately fails — this is expected and correct behavior.

### Pitfall 4: Enable Banking OAuth Callback Intercepted by SW
**What goes wrong:** The `/enablebanking/*` routes are OAuth callback URLs. If the SW intercepts these with the navigateFallback, the callback would return `index.html` instead of the actual server response, breaking the OAuth flow.
**Why it happens:** `navigateFallback: '/index.html'` applies to all navigation requests by default.
**How to avoid:** Already handled — `/^\/enablebanking\/.*$/` is in `navigateFallbackDenylist`. Verify this is present in the built SW file after Docker build.
**Warning signs:** OAuth callback fails silently after bank authorization; user is redirected to index.html instead of completing the flow.

### Pitfall 5: iOS PWA Requires Trusted HTTPS Certificate
**What goes wrong:** iOS Safari will not offer "Add to Home Screen" as a full standalone PWA if the certificate is not trusted by iOS. Caddy's local CA cert is not trusted by iOS Safari.
**Why it happens:** iOS enforces strict HTTPS certificate validation for PWA installation. Self-signed or local CA certs are not trusted.
**How to avoid:** PWA-04 (iOS) is deferred to Phase 5 which will provide Cloudflare Tunnel with a real cert. Phase 4 verification uses Android only.
**Warning signs:** Safari shows "website not trusted" or the installed app shows the browser chrome instead of standalone mode.

### Pitfall 6: Android Chrome Install Prompt Not Appearing
**What goes wrong:** The `beforeinstallprompt` event does not fire, so Chrome never shows the install prompt.
**Why it happens:** Chrome requires: (1) served over HTTPS or localhost, (2) manifest with name/icons/start_url/display:standalone, (3) service worker registered with a fetch handler. The service worker from Workbox generateSW includes a fetch handler automatically.
**How to avoid:** Use Chrome DevTools > Application > Manifest to check "Add to home screen" eligibility. Ensure the app is accessed over HTTPS (via Caddy) not plain HTTP.
**Warning signs:** Chrome DevTools Application tab shows installability warnings; no install button appears in Chrome menu.

---

## Code Examples

### SW Registration (Already in place — do not change)
```javascript
// Source: packages/desktop-client/src/browser-preload.browser.js lines 56-59
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: markUpdateReadyForDownload,
});
```

### Update Notification Dispatch (Already in place — do not change)
```typescript
// Source: packages/desktop-client/src/components/FinancesApp.tsx lines 206-228
async function run() {
  await global.Actual.waitForUpdateReadyForDownload();
  dispatch(addNotification({
    notification: {
      type: 'message',
      title: t('A new version of Actual is available!'),
      message: t('Click the button below to reload and apply the update.'),
      sticky: true,
      id: 'update-reload-notification',
      button: {
        title: t('Update now'),
        action: async () => { await global.Actual.applyAppUpdate(); },
      },
    },
  }));
}
```

### Manifest Completeness Check (Verification reference)
```json
// Source: packages/desktop-client/public/site.webmanifest (complete)
{
  "name": "Actual",
  "short_name": "Actual",
  "icons": [
    { "src": "/android-chrome-192x192.png", "sizes": "192x192", "purpose": "any" },
    { "src": "/android-chrome-512x512.png", "sizes": "512x512", "purpose": "any" },
    { "src": "/maskable-192x192.png", "sizes": "192x192", "purpose": "maskable" },
    { "src": "/maskable-512x512.png", "sizes": "512x512", "purpose": "maskable" }
  ],
  "start_url": "./",
  "display": "standalone",
  "theme_color": "#5c3dbb",
  "background_color": "#5c3dbb"
}
```
All Chrome installability criteria fields are present.

### Workbox navigateFallbackDenylist Verification
After Docker build, inspect `packages/desktop-client/build/sw.js` and confirm `/enablebanking/` appears in the denylist. This is the critical exclusion that protects the OAuth callback route.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Service worker required for Chrome install prompt | SW recommended but not required for menu install (fetch handler still needed for auto-prompt) | Chrome 108 (mobile), 112 (desktop) | Install prompt still requires SW with fetch handler; generateSW provides this automatically |
| `apple-mobile-web-app-capable` meta tag for iOS standalone | `display: standalone` in manifest | iOS 17+ | Old meta tag deprecated; manifest field is correct approach |
| injectManifest for custom SW | generateSW for standard apps | N/A (upstream decision) | generateSW is simpler and handles offline correctly without custom SW code |
| Manual SW registration | `virtual:pwa-register` | vite-plugin-pwa v0.x | registerSW handles lifecycle events cleanly |

**Deprecated/outdated:**
- `apple-mobile-web-app-capable` meta: deprecated in iOS 17+. Not present in current index.html (correct).
- `injectManifest` strategy: abandoned by upstream, do not re-enable.

---

## Key Finding: Service Worker Is NOT Disabled

The STATE.md research flag says "Service worker build is DISABLED in vite.config.mts (reason unknown — read before planning Phase 4)." After reading the file, this is **incorrect** — the service worker build is **active**.

What is disabled/commented out is the `injectManifest` strategy (lines 161-177), which was an alternative approach that was tried and abandoned. The current active configuration uses `generateSW` strategy with full Workbox config. The VitePWA plugin is enabled for all non-desktop builds. The `registerSW` call in `browser-preload.browser.js` confirms the SW is being registered at runtime.

**Implication for planning:** Phase 4 work is verification and minor gap-filling, not re-enabling a disabled service worker.

---

## Open Questions

1. **Does the built Docker image actually produce `sw.js` in the build output?**
   - What we know: vite.config.mts has VitePWA configured correctly
   - What's unclear: Whether the `IS_GENERIC_BROWSER=1` env var or any Docker-specific build condition suppresses SW generation
   - Recommendation: Wave 0 task — run Docker build, check `build/sw.js` exists and `build/manifest.webmanifest` is generated; treat as the gate before any other tasks

2. **Do any fork-specific components (ConsentExpiryBanner, EnableBankingExternalMsgModal, BankSyncAccountEditPage) overflow at 375px?**
   - What we know: NarrowAlternate/WideComponent pattern handles routing; modal uses `clamp(400px, 30vw, 600px)` width (from STATE.md decision log)
   - What's unclear: `clamp(400px, ...)` has a 400px minimum — this exceeds 375px and may cause horizontal scroll on the narrowest phones
   - Recommendation: Audit at 375px in DevTools; if the modal minimum is 400px, change to `clamp(320px, 85vw, 600px)` or equivalent

3. **Is `crossorigin="use-credentials"` on the manifest link preserved through the Vite build process?**
   - What we know: It is manually in index.html line 18; `useCredentials: true` is NOT set in vite.config.mts
   - What's unclear: Whether VitePWA rewrites the manifest link tag and drops the attribute
   - Recommendation: Inspect the built `build/index.html` to confirm the attribute is present; if dropped, add `useCredentials: true` to the VitePWA plugin options

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (configured in vite.config.mts `test` block) |
| Config file | `packages/desktop-client/vite.config.mts` (test section) |
| Quick run command | `cd packages/desktop-client && yarn test --run` |
| Full suite command | `cd packages/desktop-client && yarn test --run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| PWA-01 | Manifest has required fields | manual | Chrome DevTools Application > Manifest | No automated test; Lighthouse audit is the gate |
| PWA-02 | SW precaches app shell; offline read works | manual | Load app, go offline, reload | Requires browser; cannot be unit tested |
| PWA-03 | Android install prompt appears | manual | Chrome DevTools > Application > Manifest > "Add to home screen" | Requires Android device or Chrome DevTools mobile emulation |
| PWA-04 | iOS install works | manual-deferred | Deferred to Phase 5 | Requires trusted cert via Cloudflare Tunnel |
| PWA-05 | No horizontal scroll at 375px | manual | Chrome DevTools device emulation (375px width) | Check all fork-specific components |
| PWA-06 | Splash screen and theme color | manual | Android device or Chrome DevTools | Verify no blank white screen on launch |

**All PWA requirements are manually verified** — by nature, PWA installability and offline behavior cannot be meaningfully unit-tested. The verification gate is a Lighthouse PWA audit score and manual device testing.

### Sampling Rate
- **Per task commit:** No automated test run required (all PWA verification is manual)
- **Per wave merge:** Manual checklist verification documented in commit message
- **Phase gate:** Lighthouse PWA audit + Android Chrome install confirmation before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] No automated PWA tests exist or are needed — manual verification is the correct approach for this domain
- [ ] Lighthouse CI could be added as a future CI step but is out of scope for Phase 4

*(No test file creation needed — PWA verification is inherently browser-based and manual)*

---

## Sources

### Primary (HIGH confidence)
- `packages/desktop-client/vite.config.mts` — direct code inspection; VitePWA config lines 155-200
- `packages/desktop-client/public/site.webmanifest` — direct code inspection; manifest fields verified
- `packages/desktop-client/index.html` — direct code inspection; head meta tags verified
- `packages/desktop-client/src/browser-preload.browser.js` — direct code inspection; registerSW wiring verified
- `packages/desktop-client/src/components/FinancesApp.tsx` — direct code inspection; update notification dispatch verified
- [web.dev install-criteria](https://web.dev/articles/install-criteria) — Chrome Android installability criteria
- [Chrome blog: update-install-criteria](https://developer.chrome.com/blog/update-install-criteria) — service worker fetch handler still required for auto-prompt

### Secondary (MEDIUM confidence)
- [vite-pwa-org: generateSW](https://vite-pwa-org.netlify.app/workbox/generate-sw) — generateSW configuration options
- [vite-pwa-org: FAQ](https://vite-pwa-org.netlify.app/guide/faq) — crossorigin use-credentials, maximumFileSizeToCacheInBytes behavior
- [MDN: Making PWAs installable](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable) — iOS Safari requirements

### Tertiary (LOW confidence — informational only)
- [brainhub.eu: PWA on iOS 2025](https://brainhub.eu/library/pwa-on-ios) — iOS Safari PWA limitations overview

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies verified from package.json; no new packages needed
- Architecture: HIGH — all patterns verified from direct code inspection
- Service worker status: HIGH — confirmed active from vite.config.mts and browser-preload.browser.js
- Manifest completeness: HIGH — all fields verified from site.webmanifest and confirmed against Chrome installability criteria
- Pitfalls: HIGH — crossorigin/credentials confirmed from vite-plugin-pwa official docs; iOS HTTPS from official sources
- Open question (Modal width at 375px): MEDIUM — `clamp(400px, 30vw, 600px)` observed in STATE.md decision log, not re-verified in source

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable PWA spec; Chrome installability criteria may evolve but core requirements are stable)
