# Technology Stack

**Project:** Actual Budget Fork - Enable Banking Edition
**Researched:** 2026-02-18
**Confidence:** MEDIUM-HIGH (all versions verified against npm registry; Enable Banking API behaviour confirmed against official docs; PWA and scheduler patterns verified across multiple current sources)

## Scope

This document covers only the **additions** to Actual Budget's existing stack. The base stack (TypeScript, React, SQLite, Vite, Yarn 4 workspaces, Express in sync-server) is inherited from the fork and is not repeated here.

## Recommended Additions

### Enable Banking - JWT Auth

| Technology | Version | Package Location | Why |
|------------|---------|-----------------|-----|
| `jose` | `6.1.3` | `packages/sync-server` | The only zero-dependency JWT library that is universal (Node + browser), written in TypeScript with full type exports, and supports RS256 natively. Panva's `jose` is the de-facto standard; `jsonwebtoken` is CommonJS-only and requires `@types` shim. `node-jose` is unmaintained. Verified current version via npm registry. |

Enable Banking requires every HTTP request to carry `Authorization: Bearer <JWT>` signed with RS256 using a private RSA `.pem` key. The JWT payload must include `iss: "enablebanking.com"`, `aud: "api.enablebanking.com"`, `iat`, `exp`, and `kid` (application ID) in the header. `jose`'s `SignJWT` class covers this in 10 lines.

**Confidence:** HIGH - confirmed against [Enable Banking API reference](https://enablebanking.com/docs/api/reference/)

### Enable Banking - HTTP Client

| Technology | Version | Package Location | Why |
|------------|---------|-----------------|-----|
| `axios` | `1.13.5` | `packages/sync-server` | Actual Budget's existing GoCardless adapter uses axios (confirmed via codebase search). Staying on axios avoids introducing a second HTTP abstraction. Axios provides automatic JSON parsing, typed request/response bodies, and intuitive error handling (rejects non-2xx by default, unlike native fetch). Bundle size is irrelevant in a server-side context. |

No Enable Banking TypeScript SDK exists on npm. Their [sample repository](https://github.com/enablebanking/enablebanking-api-samples) provides JavaScript samples but not a published package. All API calls must be made manually with an HTTP client.

**Confidence:** HIGH - [axios npm](https://www.npmjs.com/package/axios) verified, GoCardless adapter axios usage confirmed via community search

### PWA - Service Worker and Manifest

| Technology | Version | Package Location | Why |
|------------|---------|-----------------|-----|
| `vite-plugin-pwa` | `1.2.0` | `packages/desktop-client` (devDependency) | The canonical Vite PWA solution. Generates service worker via Workbox under the hood, auto-injects web app manifest, handles precaching of all static assets, and supports `injectRegister: 'auto'` for zero-boilerplate setup. Compatible with Vite 6 and React. Actively maintained. No competitor comes close for Vite-based apps. |
| `workbox-window` | `7.4.0` | `packages/desktop-client` | Runtime companion for `vite-plugin-pwa`'s generated service worker. Handles update notifications, service worker registration lifecycle, and offline status events. Required for the "new version available" prompt pattern. |

**Why not manual service worker:** Writing a Workbox service worker manually for a multi-chunk Vite app is fragile. The precache manifest hash must be regenerated on every build. `vite-plugin-pwa` automates this and integrates with Vite's build pipeline.

**Confidence:** HIGH - [vite-plugin-pwa npm](https://www.npmjs.com/package/vite-plugin-pwa) version confirmed, Vite 6 compatibility confirmed via [GitHub releases](https://github.com/vite-pwa/vite-plugin-pwa/releases)

### Scheduled Bank Sync (4x/day)

| Technology | Version | Package Location | Why |
|------------|---------|-----------------|-----|
| `node-cron` | `4.2.1` | `packages/sync-server` | Lightweight, zero-dependency cron scheduler for Node.js. Version 4 was rewritten in TypeScript with native type exports (no `@types` package needed). For a single-process, personal-use server that runs continuously in Docker, `node-cron` is the right tool. `node-schedule` supports date-based scheduling but adds overhead that is unnecessary for fixed-interval cron expressions. Agenda/Bull are overkill (require Redis or MongoDB for persistence). |

The 4x/day sync requirement maps to a simple cron expression: `0 6,12,18,0 * * *` (6am, noon, 6pm, midnight). This fits `node-cron`'s model exactly.

**Single-process caveat:** `node-cron` jobs only run while the Node process is alive. In Docker Compose, the sync-server container runs continuously, so job loss on restart is limited to missed windows during restarts. For a personal finance app this is acceptable. If the container restarts mid-day, the next scheduled window fires normally.

**Confidence:** HIGH - version confirmed via npm registry, v4 TypeScript migration confirmed via [node-cron GitHub](https://github.com/node-cron/node-cron)

### Docker Deployment - HTTPS Termination

| Technology | Version | Package Location | Why |
|------------|---------|-----------------|-----|
| Caddy | `2.x` (Docker image: `caddy:2-alpine`) | `docker-compose.yml` | HTTPS is mandatory for PWA service workers and installability. Caddy auto-generates TLS certificates for `*.localhost` domains using its internal CA, requiring zero cert management for local deployment. On Windows Docker Desktop, the generated root certificate can be installed once via Windows Certificate Import Wizard. Nginx requires manual cert provisioning with mkcert or certbot. Caddy is simpler for a single-developer local setup. |

For phone access over LAN or Tailscale, Caddy proxies to the Actual Budget web server on the internal Docker network. A 5-line Caddyfile covers the full setup.

**Why not nginx:** nginx requires either a manually generated mkcert certificate (extra tooling, cert renewal) or an external CA. Caddy handles the entire CA chain automatically. For a local Windows machine with Docker Desktop, Caddy's localhost CA trust is the lowest-friction path.

**Why not Cloudflare Tunnel:** Valid alternative for phone access over the internet, but introduces an external dependency and exposes financial data to Cloudflare's network. Tailscale or LAN-only is preferable for security. Caddy handles the HTTPS requirement independently of the network access method.

**Confidence:** MEDIUM - Caddy Docker setup confirmed via [official docs](https://caddyserver.com/docs/running) and community guides, Windows certificate trust flow confirmed

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| JWT signing | `jose` (panva) | `jsonwebtoken` | CommonJS-only, requires `@types/jsonwebtoken`, does not support modern ESM. jose is its spiritual successor and is actively maintained. |
| JWT signing | `jose` | `node-jose` | Unmaintained, last significant update 2019, complex API. |
| HTTP client | `axios` | Native `fetch` | Fetch requires manual `response.ok` checking, no built-in timeout, and inconsistent error shapes. For server-side bank API calls where retry logic and error classification matter, axios saves boilerplate. Also matches what the GoCardless adapter already uses. |
| PWA | `vite-plugin-pwa` | Manual Workbox config | The precache manifest must be regenerated on each Vite build. Manual wiring is brittle and duplicates what vite-plugin-pwa automates. |
| Scheduler | `node-cron` | `node-schedule` | node-schedule is date-oriented. For 4x/day fixed intervals, cron expressions are simpler and more readable. |
| Scheduler | `node-cron` | Agenda/Bull | Require persistent job queues (Redis/MongoDB). Personal-use Docker setup does not need distributed job coordination. |
| HTTPS | Caddy | nginx + mkcert | More configuration files, manual cert renewal, more steps on Windows. |
| HTTPS | Caddy | Cloudflare Tunnel | External dependency, exposes financial data to third-party network path. |

## Installation

All packages go into the appropriate workspace package. Run from the monorepo root with Yarn 4.

```bash
# sync-server: Enable Banking client + scheduler
yarn workspace @actual-app/sync-server add jose axios node-cron

# desktop-client: PWA support (dev deps only)
yarn workspace @actual-app/desktop-client add -D vite-plugin-pwa workbox-window
```

Caddy is added to `docker-compose.yml` as a service using the `caddy:2-alpine` image - no npm install needed.

## Configuration Notes

### jose RSA key loading

The Enable Banking private key is a `.pem` file downloaded during application registration. Load it at server startup using `jose`'s `importPKCS8`:

```typescript
import { importPKCS8, SignJWT } from "jose";
import { readFileSync } from "fs";

const privateKey = await importPKCS8(
  readFileSync(process.env.ENABLE_BANKING_KEY_PATH, "utf8"),
  "RS256"
);
```

Never commit the `.pem` file. Mount it into the Docker container via a volume or environment variable.

### vite-plugin-pwa minimal config

Add to `packages/desktop-client/vite.config.ts`:

```typescript
import { VitePWA } from "vite-plugin-pwa";

// inside defineConfig plugins array:
VitePWA({
  registerType: "autoUpdate",
  workbox: {
    globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
  },
  manifest: {
    name: "Actual Budget",
    short_name: "Actual",
    theme_color: "#ffffff",
    icons: [
      { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
      { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
    ],
  },
})
```

Before enabling, check whether Actual Budget already ships a `manifest.json` or service worker - avoid doubling up on existing PWA infrastructure.

### node-cron 4x/day schedule

```typescript
import cron from "node-cron";

cron.schedule("0 6,12,18,0 * * *", async () => {
  await runBankSync();
}, { timezone: "Europe/Helsinki" }); // adjust to user's timezone
```

### Caddy minimal config for local Docker

```caddyfile
actual.localhost {
  reverse_proxy actual-web:5006
}
```

Caddy auto-provisions a local CA certificate. First run requires installing the Caddy root cert in Windows trust store.

## What to Investigate Before Building

| Area | Unknown | How to Resolve |
|------|---------|---------------|
| Actual Budget existing PWA state | Does Actual Budget already ship a web manifest or service worker? If yes, `vite-plugin-pwa` may conflict or be unnecessary. | Read `packages/desktop-client/src/`, `index.html`, and `vite.config.ts` from the forked source before adding PWA. |
| GoCardless adapter code | Exact module structure, exports, and how it registers with sync-server routing. The Enable Banking adapter must follow this exact pattern. | Read `packages/sync-server/src/app-gocardless/` source before writing the Enable Banking equivalent. |
| Enable Banking sandbox credentials | Enable Banking sandbox testing requires account creation at [enablebanking.com/cp](https://enablebanking.com/cp/applications). No npm-installable mock. | Create account and download test RSA keypair before starting API integration phase. |
| PSD2 consent expiry | The 90-day consent renewal notification flow is not a standard library problem. It requires storing expiry timestamps per account and surfacing an in-app alert. | Design during architecture phase, no additional library needed. |

## Sources

- [Enable Banking API reference](https://enablebanking.com/docs/api/reference/) - authentication, endpoints, JWT spec (HIGH confidence)
- [Enable Banking Quick Start](https://enablebanking.com/docs/api/quick-start/) - redirect flow, session exchange (HIGH confidence)
- [jose npm](https://www.npmjs.com/package/jose) - version 6.1.3 confirmed (HIGH confidence)
- [panva/jose GitHub](https://github.com/panva/jose) - RS256 support, ESM-only in v6 (HIGH confidence)
- [vite-plugin-pwa npm](https://www.npmjs.com/package/vite-plugin-pwa) - version 1.2.0 confirmed (HIGH confidence)
- [vite-pwa/vite-plugin-pwa GitHub](https://github.com/vite-pwa/vite-plugin-pwa) - Vite 6 compatibility (HIGH confidence)
- [workbox-window npm](https://www.npmjs.com/package/workbox-window) - version 7.4.0 confirmed (HIGH confidence)
- [node-cron npm](https://www.npmjs.com/package/node-cron) - version 4.2.1 confirmed (HIGH confidence)
- [node-cron v4 migration guide](https://nodecron.com/migrating-from-v3) - TypeScript rewrite in v4 (HIGH confidence)
- [axios npm](https://www.npmjs.com/package/axios) - version 1.13.5 confirmed (HIGH confidence)
- [Caddy documentation - running](https://caddyserver.com/docs/running) - Docker setup (HIGH confidence)
- [enablebanking-api-samples GitHub](https://github.com/enablebanking/enablebanking-api-samples) - no published TypeScript SDK exists (MEDIUM confidence)
- [actual-auto-sync GitHub](https://github.com/seriouslag/actual-auto-sync) - community scheduler pattern reference (MEDIUM confidence)
- [Actual Budget bank sync docs](https://actualbudget.org/docs/advanced/bank-sync/) - GoCardless adapter structure reference (MEDIUM confidence)
- [LogRocket - axios vs fetch 2025](https://blog.logrocket.com/axios-vs-fetch-2025/) - axios recommendation for server-side use (MEDIUM confidence)
