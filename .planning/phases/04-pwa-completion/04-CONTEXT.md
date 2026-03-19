# Phase 4: PWA Completion - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

The app is installable as a standalone PWA on both Android and iOS home screens, and previously loaded budget data is readable offline. Resolves the existing service worker blockage in vite.config.mts rather than rebuilding from scratch.

</domain>

<decisions>
## Implementation Decisions

### Offline data strategy
- Workbox precaches the app shell (JS, CSS, HTML, WASM, SQL) so the app loads offline
- Budget data is already stored locally in IndexedDB by loot-core's browser worker - no additional data caching strategy needed
- The current `generateSW` (Workbox auto-generated) strategy is sufficient - do NOT switch to `injectManifest` (the commented-out approach was abandoned due to issues)
- Network-first for data sync endpoints, cache-first for static assets (already configured via `navigateFallbackDenylist`)

### Service worker update UX
- Keep current `registerType: 'prompt'` - users see a prompt when new version is available
- Standard PWA update-available banner/toast, click to reload
- No silent background updates (prompt is safer for a finance app where data integrity matters)

### Mobile usability verification
- Verify at 375px minimum width using browser DevTools
- The existing `NarrowAlternate`/`WideComponent` responsive pattern handles layout switching
- No new responsive breakpoints or layout code expected - verify existing responsive design works
- Check Enable Banking-specific components (consent banner, sync status, OAuth modal) render correctly on narrow screens

### iOS Safari PWA behavior
- iOS PWA requires trusted HTTPS certificate - Caddy local CA is NOT trusted by iOS Safari
- Cloudflare Tunnel (or real domain cert) required for iOS PWA install - this is an Infrastructure (Phase 5) dependency
- Phase 4 can verify Android PWA independently; iOS verification deferred until HTTPS infrastructure is ready
- Apple-touch-icon already exists in index.html and public/ directory
- `display: standalone` in manifest works on iOS Safari (confirmed pattern)

### Claude's Discretion
- Exact Workbox cache size limits and eviction strategy
- Whether to add a custom offline fallback page or rely on cached app shell
- Service worker update prompt UI implementation (toast vs banner)
- Any minor manifest field additions (e.g., `orientation`, `scope`)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### PWA Configuration
- `packages/desktop-client/vite.config.mts` -- VitePWA plugin config (lines 155-200), disabled injectManifest strategy, active Workbox generateSW config
- `packages/desktop-client/public/site.webmanifest` -- Complete manifest with icons, shortcuts, screenshots, theme_color, display: standalone
- `packages/desktop-client/index.html` -- Viewport meta, manifest link, apple-touch-icon, theme-color meta tags

### Responsive Design
- `packages/desktop-client/src/components/responsive/index.tsx` -- NarrowAlternate/WideComponent lazy-loaded responsive pattern
- `packages/desktop-client/src/components/FinancesApp.tsx` -- Main app layout with responsive routing

### Requirements
- `.planning/REQUIREMENTS.md` -- PWA-01 through PWA-06 requirements

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **VitePWA plugin**: Already configured in vite.config.mts with Workbox generateSW strategy, globPatterns, navigateFallback, and navigateFallbackDenylist
- **site.webmanifest**: Complete with name, icons (192+512 any + maskable), shortcuts (Add Transaction, Accounts, Reports), screenshots (wide+narrow), theme_color, display: standalone
- **PWA icons**: android-chrome-192x192.png, android-chrome-512x512.png, maskable-192x192.png, maskable-512x512.png, apple-touch-icon.png all present in public/
- **index.html PWA meta**: viewport, manifest link (crossorigin=use-credentials), apple-touch-icon, theme-color all present
- **NarrowAlternate/WideComponent**: Existing responsive component pattern with lazy loading for narrow vs wide layouts
- **useResponsive() hook**: From @actual-app/components, provides isNarrowWidth flag

### Established Patterns
- **Responsive routing**: FinancesApp uses NarrowAlternate for components that need mobile variants
- **Lazy loading**: React.lazy with Suspense already used for route code splitting (Phase 8 added this)
- **registerType: 'prompt'**: PWA updates prompt user rather than auto-updating

### Integration Points
- **navigateFallbackDenylist**: Already includes /enablebanking/* to prevent SW intercepting Enable Banking OAuth callback
- **loot-core browser worker**: Budget data stored in IndexedDB via browser SQLite - this is the offline data source
- **Docker build**: Workbox SW generation happens during Vite build step in Docker (loot-core build:browser -> desktop-client build)

</code_context>

<specifics>
## Specific Ideas

- The existing PWA setup is ~90% complete. Main work is verification and fixing any remaining issues rather than building from scratch.
- The commented-out `injectManifest` approach (lines 161-177 in vite.config.mts) was explicitly abandoned by upstream with a TODO note about "issues with offline support" - do NOT try to re-enable it.
- The `navigateFallbackDenylist` already correctly excludes the Enable Banking callback route.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 04-pwa-completion*
*Context gathered: 2026-03-19*
