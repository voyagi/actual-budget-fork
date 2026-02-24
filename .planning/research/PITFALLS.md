# Domain Pitfalls

**Domain:** Personal finance app fork with EU bank sync (Enable Banking / PSD2)
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH (OpenBanking specifics from official docs; Enable Banking sandbox behavior from official docs; fork/Docker from community evidence)

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or complete blockers.

### Pitfall 1: Sandbox Behavior Diverges Significantly From Production

**What goes wrong:** Enable Banking's own documentation states that "ASPSP sandbox environment does not accurately simulate its live environment." Sandbox may accept requests that production rejects, return fixed mock data instead of real account data, and skip authentication flows entirely. You build the entire integration against sandbox, it passes all tests, then production auth fails or returns unexpected field shapes.

**Why it happens:** Banks are not required to fully mirror production in sandbox. Many EU bank sandboxes have low traffic, lack regulatory enforcement, and are maintained as an afterthought. Enable Banking's mock ASPSP is not a real bank simulator — it tests request signing only, not real flows.

**Consequences:** Integration works end-to-end in sandbox, fails silently or throws on first real bank connection. Field names, date formats, or pagination may differ. Rate limiting may behave differently.

**Prevention:**

- Use sandbox only for testing JWT signing, request structure, and HTTP wiring
- Create your own test fixtures that represent known-bad cases: null fields, missing optional fields, pending transactions that later become booked
- Plan a separate "production smoke test" phase with a real bank account before considering the feature done
- Do not treat sandbox success as feature completion

**Detection:** Sandbox returns perfectly-shaped data every time with zero null fields — that is a sign of mock data, not real bank behavior.

**Phase:** Enable Banking integration (sandbox phase and production cutover must be treated as two distinct milestones)

### Pitfall 2: Transaction Deduplication Across Pending and Booked States

**What goes wrong:** The same transaction appears twice: once as `PDNG` (pending) with an estimated amount and date, then again as `BOOKED` with a final amount and booking date. If your sync logic inserts both, users see duplicate transactions. If you delete pending on rebook, you lose the pending record prematurely. Amounts can differ between the two states (e.g. foreign currency conversion applied at booking).

**Why it happens:** PSD2 requires banks to expose pending and booked transactions separately. Banks are inconsistent about whether they assign stable `transactionId` values across state transitions. Some banks reuse the same ID, others assign a new ID at booking, making deduplication non-trivial.

**Consequences:** Duplicate transactions in Actual Budget corrupts the budget. Manual cleanup is tedious with no undo. Users lose trust in the app.

**Prevention:**

- Implement a deduplication layer keyed on `(transactionId OR bankTransactionId) + amount + date + accountId`
- Store a `raw_pending_id` field alongside imported transactions so you can match and update-in-place when the booked version arrives
- Never blindly insert — always upsert (insert or update)
- Design the schema for mutable pending transactions from the start; retrofitting this after Go is painful

**Detection:** Two transactions with the same amount on adjacent dates, one with a status of pending and one with a status of booked.

**Phase:** Enable Banking integration (data model design, before first sync runs)

### Pitfall 3: RSA Private Key Not Surviving Container Restarts

**What goes wrong:** Enable Banking authentication requires an RSA-256 key pair. The private key must be used to sign every JWT. If the key is stored inside the container, it is lost on every container recreation. If the key is stored as an environment variable passed through Docker Compose, MSYS bash will mangle the multi-line PEM content when you set it.

**Why it happens:** Multi-line secrets are awkward in Docker Compose environment blocks. MSYS bash history expansion and newline handling silently truncates or transforms PEM headers. The Enable Banking dashboard associates your public key with your application ID — if the key changes, all existing sessions become invalid.

**Consequences:** Auth works once, breaks after container restart. Silent JWT signing failure with a 401 response. Worse: key works until the next `docker compose up` then suddenly stops, with no obvious cause.

**Prevention:**

- Store the RSA private key as a file on the host, bind-mounted into the container (e.g. `./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`)
- Never embed the key in environment variables — use Docker secrets or a mounted file
- Add the secrets directory to `.gitignore` immediately during project setup
- Verify key persistence on first setup: restart the container and confirm auth still works

**Detection:** 401 responses from Enable Banking API immediately after a `docker compose up` when it worked before.

**Phase:** Authentication/infrastructure setup (early, before integration code is written)

### Pitfall 4: PSD2 Consent Expiry Silently Breaks Sync Without User Notice

**What goes wrong:** Enable Banking sessions have a validity period set at authorization time (capped by the bank's maximum, often 90 or 180 days). When a session expires, the API returns an error. If your scheduled sync job doesn't surface this error clearly — or catches it generically — sync silently stops and the user has no idea for days or weeks.

**Why it happens:** PSD2 mandates periodic re-authentication. Enable Banking sessions cannot be silently renewed — the user must go through the bank's redirect flow again. Background jobs that catch all errors and log them without alerting miss this entirely.

**Consequences:** Budget data goes stale. User doesn't notice until they wonder why their balance is weeks out of date. There is no way to programmatically re-consent without user interaction.

**Prevention:**

- Track `session_expiry_at` for each bank connection in the database
- Add a proactive check: 7 days before expiry, show a banner in the UI ("Bank connection expires in 7 days — click to renew")
- On sync failure due to expired session, surface the error prominently in the UI rather than silently logging
- Design the consent renewal flow before implementing it — it requires redirecting the user to Enable Banking's auth URL and handling the callback

**Detection:** Sync job logs show auth errors but no UI indication. Balance and transaction dates stop advancing.

**Phase:** Enable Banking integration (consent lifecycle design before first production sync)

### Pitfall 5: Forking a Fast-Moving Monorepo and Accumulating Merge Debt

**What goes wrong:** Actual Budget ships frequent releases (it shipped 25.5.0 in 2025, for example). If you fork and customize without a strategy for pulling upstream changes, after 3-6 months your fork diverges enough that merging upstream becomes a multi-day project. The more you touch the same files upstream touches, the worse it gets.

**Why it happens:** Monorepos amplify the conflict surface — one merge might touch `package.json`, `yarn.lock`, shared component files, and business logic simultaneously. Yarn 4 lockfile merges are not human-readable and cannot be resolved manually. Upstream may refactor the exact GoCardless adapter code you are replacing with your Enable Banking adapter.

**Consequences:** Critical security patches are missed for months. New Actual Budget features (better mobile UI, budget improvements) are inaccessible. Eventually the fork is so stale that merging is a rewrite.

**Prevention:**

- Tag all custom commits with a consistent prefix (e.g. `[eb]` for Enable Banking) so they are identifiable in git log
- Keep all custom code in clearly-bounded locations: a new `packages/enable-banking/` package, and a new adapter file following the exact GoCardless adapter pattern
- Minimize modifications to existing Actual Budget files — the goal is to add files, not edit them
- Schedule a monthly upstream sync: `git fetch upstream && git merge upstream/main`, resolve conflicts, run tests
- Use GitHub Actions or a similar workflow to alert when you are more than N commits behind upstream

**Detection:** Running `git log upstream/main...HEAD --oneline | wc -l` and seeing a large number. Upstream release notes mention changes to bank sync adapter patterns.

**Phase:** Fork setup (strategy established before writing a line of custom code)

## Moderate Pitfalls

### Pitfall 6: PWA Service Worker Caches Stale App Version on Mobile

**What goes wrong:** After deploying a new version of the app, the phone continues running the old cached version indefinitely. The service worker's `install` + `activate` lifecycle means old clients keep the old worker active until all tabs are closed. On a phone with persistent PWA install, "all tabs closed" may never happen naturally.

**Why it happens:** Service workers are designed for resilience, which means they resist updates by default. The `vite-plugin-pwa` generates a precache manifest; if the update strategy is not configured explicitly, users may miss updates for days.

**Prevention:**

- Use `vite-plugin-pwa` with `registerType: 'autoUpdate'` for personal use (acceptable because there is only one user, you)
- Add a `skipWaiting: true` to the service worker to force activation immediately on install
- Test the update cycle explicitly: deploy a change, reload the PWA on phone, confirm new version loads

**Detection:** Deployed a bug fix but the phone still shows the bug. DevTools Application panel shows an "Update available" badge on the service worker.

**Phase:** PWA implementation

### Pitfall 7: iOS Safari PWA Has Persistent Offline Cache Bugs

**What goes wrong:** iOS Safari's service worker implementation has documented instability: cached assets disappear unexpectedly, IndexedDB transactions hang or corrupt, and service worker push/background-sync events do not fire after device restart. The offline viewing requirement ("offline viewing of previously loaded data on phone") may partially fail on iOS.

**Why it happens:** Apple's WKWebView has a separate, more restricted service worker implementation from Chrome. iOS has historically shipped PWA features late and with more edge cases.

**Prevention:**

- Test all offline scenarios on an actual iOS device (not just Chrome DevTools offline mode, not just Android)
- For the offline data requirement: Actual Budget's own sync client already stores data in IndexedDB. Confirm this works on iOS before building additional caching layers on top
- Keep offline functionality as "read-only" — attempting to queue writes offline and sync later is significantly more complex and fragile on iOS
- If iOS PWA proves too unreliable, fall back to "mobile browser tab" as acceptable for personal use

**Detection:** App shows stale data or blank screens on iOS after going offline. IndexedDB reads return undefined unexpectedly.

**Phase:** PWA implementation (iOS testing must be explicit, not assumed)

### Pitfall 8: Docker Desktop on Windows Loses SQLite Data via Volume Path Confusion

**What goes wrong:** Docker Desktop on Windows uses WSL2 as its backend. Since Docker Desktop v26.1.4 (January 2025), named volumes are stored at `\\wsl$\docker-desktop\mnt\docker-desktop-disk\data\docker\volumes`. Bind mounts using Windows paths (like `C:\Users\...`) work but have slower I/O and can have permission issues. If you specify the volume path incorrectly in Docker Compose, Docker silently creates an anonymous volume that disappears on container removal.

**Why it happens:** Windows path syntax, WSL2 path syntax, and Docker path syntax all differ. An incorrect path in `docker-compose.yml` does not fail — Docker simply creates a fresh anonymous volume, discarding all previous data.

**Consequences:** Budget database wiped on next `docker compose up --force-recreate` or after a Docker update.

**Prevention:**

- Use a named volume for Actual Budget data (`actual_data:/data`) rather than a bind mount — Docker manages the path
- Verify persistence on day one: create a test budget entry, run `docker compose down`, run `docker compose up`, confirm the entry still exists
- Keep manual backups of the `/data` volume to a Windows path on a weekly schedule

**Detection:** All budget data disappears after container recreate. No error message — just an empty new budget.

**Phase:** Docker deployment setup (verify persistence before any real data is entered)

### Pitfall 9: HTTPS Termination Breaks PWA Installability on Phone

**What goes wrong:** PWAs require HTTPS to be installable. On a local network setup (phone accessing the app via Tailscale or LAN), the HTTPS certificate may be self-signed or use a private CA. iOS Safari refuses to install PWAs from domains with untrusted certificates — it will not even show the "Add to Home Screen" install prompt for untrusted HTTPS.

**Why it happens:** PWA install prompt gating is stricter than just serving over HTTPS. The certificate must be trusted by the phone's certificate store. Self-signed certs require manual per-device trust installation, which is cumbersome on iOS.

**Prevention:**

- Use a real domain with a real Let's Encrypt certificate (via Cloudflare Tunnel or a public DNS record pointing to Tailscale IP or similar)
- Caddy + Cloudflare Tunnel is the lowest-friction path: Cloudflare terminates TLS with a trusted cert, tunnels to local Caddy, no port forwarding needed
- Avoid self-signed certificates for anything that needs to work on iOS PWA

**Detection:** App works in mobile Safari but "Add to Home Screen" prompt never appears. DevTools shows a certificate warning.

**Phase:** Docker/HTTPS setup (must be resolved before PWA testing on phone)

### Pitfall 10: Enable Banking Rate Limit Confusion Between Session-Level and Request-Level Limits

**What goes wrong:** PSD2 defines a 4-calls-per-day-per-account limit for AIS. This is a regulatory limit that banks enforce. Enable Banking may also apply its own request-level rate limits independently. Hitting a 429 from a bank (PSD2 limit exhausted) is fundamentally different from hitting a 429 from Enable Banking's platform (request throttle). Treating them as the same causes incorrect backoff logic — waiting 15 minutes for a PSD2 daily limit that won't reset until midnight.

**Why it happens:** Enable Banking acts as an aggregator. Their platform rate limits and the underlying ASPSP PSD2 limits are separate. The 429 response body may not clearly indicate which limit was hit.

**Prevention:**

- Implement separate retry logic: PSD2 daily-limit 429s should not retry until the next sync window; platform throttle 429s should use exponential backoff
- Log the response body of every 429 to determine which limit was hit
- Design the 4x/day sync schedule to spread calls evenly (e.g. 06:00, 12:00, 18:00, 23:00) rather than allowing manual ad-hoc sync that could exhaust the daily limit early

**Detection:** Sync starts failing with 429 errors partway through a day. Check if it's after the 4th call of the day (PSD2 limit) or immediately on first call (platform throttle).

**Phase:** Enable Banking integration (sync scheduler design)

## Minor Pitfalls

### Pitfall 11: Yarn 4 Lockfile Merge Conflicts on Upstream Sync

**What goes wrong:** `yarn.lock` in Yarn 4 Berry format is not human-readable and cannot be manually resolved like Yarn 1 lockfiles. When merging upstream, any dependency version change upstream produces a conflict that looks terrifying but is actually resolvable by running `yarn install` after taking either side.

**Prevention:** After merging upstream, always run `yarn install` to regenerate the lockfile rather than trying to resolve it manually. Add a note to the monthly sync procedure.

**Phase:** Fork maintenance (first upstream merge)

### Pitfall 12: Vite Dev Server Does Not Register Service Worker

**What goes wrong:** `vite-plugin-pwa` only generates and registers the service worker in production builds (`vite build`). During development (`vite dev`), no service worker is registered. PWA manifest features and offline behavior cannot be tested with `vite dev`. Developers assume the PWA works because the dev server loads fine, then discover service worker problems only after building for production.

**Prevention:** Test PWA behavior against `vite preview` (serves the production build locally) or a deployed container, not against `vite dev`. Document this in development setup notes.

**Phase:** PWA implementation

### Pitfall 13: Enable Banking Application ID Cannot Move Between Sandbox and Production

**What goes wrong:** Enable Banking sandbox and production are separate environments with separate application registrations. The RSA key pair, application ID, and any configured redirect URIs registered in sandbox do not carry over to production. You must register a new application, generate a new key pair, and update all configuration when moving from sandbox to production.

**Prevention:** Treat the sandbox application as throwaway. Keep a clear checklist for production registration: new RSA key pair, new application ID, updated callback URL, tested with a real bank account before relying on it.

**Phase:** Enable Banking integration (production cutover)

### Pitfall 14: Actual Budget's GoCardless Code May Be Partially or Fully Removed

**What goes wrong:** Since GoCardless stopped accepting EU accounts in July 2025, the Actual Budget community may remove, stub out, or significantly refactor the GoCardless bank sync adapter in future releases. If you base your Enable Banking adapter pattern on GoCardless code, upstream may silently change or remove the interface you are implementing.

**Prevention:** Before writing the adapter, read the current upstream GoCardless adapter code and document the interface it implements. If upstream removes it before you finish, your adapter may orphan without a mounting point.

**Detection:** After an upstream merge, the GoCardless adapter files are missing or the bank sync module's plugin interface has changed.

**Phase:** Enable Banking adapter design (confirm adapter interface before implementing)

## Phase-Specific Warnings

| Phase Topic               | Likely Pitfall                         | Mitigation                                                                 |
| ------------------------- | -------------------------------------- | -------------------------------------------------------------------------- |
| Fork setup                | Merge debt accumulation                | Establish prefix tagging and monthly sync ritual before writing any code   |
| Enable Banking sandbox    | Sandbox diverges from production       | Use sandbox for HTTP wiring only, build separate real-data test plan       |
| Enable Banking auth       | RSA key not persisting across restarts | Mount key as a file, test restart persistence on day one                   |
| Enable Banking data model | Duplicate pending/booked transactions  | Design upsert with deduplication before first sync                         |
| Consent lifecycle         | Silent sync failure on expiry          | Implement expiry tracking and UI notification before going live            |
| PWA implementation        | Service worker update cycle            | Use `autoUpdate` for personal use, test on production build not dev server |
| PWA on iOS                | Service worker instability             | Explicit iOS device testing, not emulator                                  |
| Docker deployment         | Volume data loss                       | Use named volumes, verify persistence before entering real data            |
| HTTPS setup               | Certificate not trusted on iOS         | Use Cloudflare Tunnel or real domain, not self-signed cert                 |
| Rate limiting             | PSD2 vs platform 429 confusion         | Log 429 response bodies, implement two separate retry strategies           |
| Upstream merges           | Yarn lockfile conflicts                | Always run `yarn install` after merge, never resolve lockfile manually     |

## Sources

- [Enable Banking Sandbox Documentation](https://enablebanking.com/docs/api/sandbox/) — official, HIGH confidence
- [Enable Banking API Reference](https://enablebanking.com/docs/api/reference/) — official, HIGH confidence
- [UK vs EU Open Banking Consent: 90-Day / 180-Day rules](https://www.saasant.com/blog/uk-eu-open-banking-consent-feed-break-fix/) — MEDIUM confidence
- [PSD2 consent extended to 180 days - EnableNow](https://www.enablenow.nl/en/blog/psd2-consent-to-180-days) — MEDIUM confidence
- [Everything you need to know about 90-day reauthentication - Yapily](https://www.yapily.com/blog/90-day-reauthentication-changes) — MEDIUM confidence
- [Open Banking API transaction states - UK Open Banking v3.1.10](https://openbankinguk.github.io/read-write-api-site3/v3.1.10/resources-and-data-models/aisp/Transactions.html) — HIGH confidence (authoritative spec)
- [PWA on iOS - Current Status and Limitations 2025 - Brainhub](https://brainhub.eu/library/pwa-on-ios) — MEDIUM confidence
- [PWA iOS Limitations and Safari Support - MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) — MEDIUM confidence
- [Actual Budget Docker Installation](https://actualbudget.org/docs/install/docker/) — official, HIGH confidence
- [Docker Desktop WSL2 volume paths - Docker Docs](https://docs.docker.com/desktop/features/wsl/) — official, HIGH confidence
- [Docker volume path changes v26.1.4 - josephguadagno.net](https://www.josephguadagno.net/2024/07/13/docker-volume-location-on-windows) — MEDIUM confidence
- [Caddy reverse proxy with Docker Compose and self-signed certs - Caddy Community](https://caddy.community/t/how-to-get-dockerised-caddy-to-use-self-signed-certs-for-local-dev-with-php-fpm-spa-vuejs/16802) — MEDIUM confidence
- [Vite Plugin PWA - Registration strategies](https://vite-pwa-org.netlify.app/guide/register-service-worker) — official, HIGH confidence
- [SQLite WAL mode in Docker](https://sqlite.org/wal.html) — official, HIGH confidence
- [Best Practices for Keeping a Forked Repository Up to Date - GitHub Community](https://github.com/orgs/community/discussions/153608) — MEDIUM confidence
- [Designing API Rate Limiting for Open Banking - OceanOBE](https://oceanobe.com/news/designing-api-rate-limiting-and-throttling-for-open-banking/1833) — MEDIUM confidence
