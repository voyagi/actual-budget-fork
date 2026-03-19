# Phase 5: Infrastructure and Production - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the full Actual Budget fork as a production-ready stack: Docker Compose with sync-server, Caddy reverse proxy, and Cloudflare Tunnel for external HTTPS access. Data persists across restarts, multi-device sync works between phone and desktop, and production Enable Banking credentials are connected with at least one real bank account syncing.

This phase does NOT include new features, UI changes, or code logic changes. It is purely infrastructure, configuration, and deployment verification.

</domain>

<decisions>
## Implementation Decisions

### Phone Access and HTTPS Strategy
- Cloudflare Tunnel for external/phone access (free tier, handles iOS HTTPS trust automatically, no port forwarding or domain purchase needed)
- Caddy as local reverse proxy inside Docker Compose for LAN/desktop access with automatic local HTTPS
- Cloudflare Tunnel runs as a `cloudflared` service in the same docker-compose.yml
- sync-server's built-in HTTPS support (`ACTUAL_HTTPS_KEY`/`ACTUAL_HTTPS_CERT`) is NOT used — Caddy and Cloudflare Tunnel handle TLS termination externally
- `trust proxy` is set on sync-server since it sits behind Caddy

### Docker Compose Topology
- 3 services in single docker-compose.yml: `sync-server`, `caddy`, `cloudflared`
- sync-server listens on HTTP port 5006 internally (no direct host port exposure in production)
- Caddy proxies to sync-server, serves HTTPS on port 443 (LAN access)
- cloudflared connects to Caddy or sync-server and exposes via Cloudflare Tunnel (phone access)
- Named volume `actual_data` for persistence (already exists in current compose)
- RSA key bind mount `./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro` (already exists)
- Healthcheck on sync-server using upstream pattern: `node src/scripts/health-check.js`
- `restart: unless-stopped` on all services

### Production Enable Banking Transition
- Same docker-compose.yml for sandbox and production (per Phase 1 locked decision)
- Environment switch via `.env` file: swap `ENABLE_BANKING_APP_ID` to production app ID
- Production registration at enablebanking.com/cp is a manual human checkpoint (restricted mode, no contract needed)
- New RSA key pair may be needed for production app — document in checklist
- Production API base URL is the same: `https://api.enablebanking.com`

### Verification and Smoke Test
- Checklist-based verification with explicit human checkpoints for:
  1. `docker compose up` starts all 3 services cleanly
  2. Desktop Chrome accesses app via Caddy HTTPS (LAN) with trusted cert
  3. Phone accesses app via Cloudflare Tunnel URL with trusted cert
  4. `docker compose down && docker compose up` — data intact
  5. Transaction entered on desktop visible on phone (and reverse)
  6. Production EB OAuth flow completes with real bank
  7. At least one automatic sync imports real transactions
- Steps 6-7 require production credentials and real bank account — separate human milestone

### Claude's Discretion
- Caddyfile configuration details (reverse proxy directives, TLS settings)
- cloudflared tunnel configuration format (config.yml vs CLI flags)
- Exact healthcheck script path and timing intervals
- Whether cloudflared proxies to Caddy or directly to sync-server
- Docker network configuration between services

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Docker and deployment
- `docker-compose.yml` — Current fork compose (sync-server only, needs Caddy + cloudflared additions)
- `packages/sync-server/Dockerfile` — Production monorepo build (node:22-bookworm-slim, full build chain)
- `packages/sync-server/docker-compose.yml` — Upstream stock compose (healthcheck pattern reference)
- `.env.example` — Current env var template (needs production vars added)

### Server configuration
- `packages/sync-server/src/load-config.ts` — All server config options including HTTPS, trustedProxies, ports
- `packages/sync-server/src/app.ts` — Express app setup, trust proxy, HTTPS server creation

### Prior phase decisions
- `.planning/phases/01-foundation-and-api-client/01-CONTEXT.md` — Locked decisions: single compose, bind mount, .env pattern, hybrid dev mode

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `docker-compose.yml` (root): Working sync-server service definition with volumes and env vars — extend with Caddy and cloudflared
- `packages/sync-server/Dockerfile`: Production-ready monorepo build — no changes needed
- `packages/sync-server/docker-compose.yml`: Upstream healthcheck pattern (`node src/scripts/health-check.js`) — adopt for fork compose
- Built-in HTTPS support in `app.ts` lines 259-266: Available but not needed (Caddy handles TLS)
- `trust proxy` config in `app.ts` line 35 and `load-config.ts` line 135: Already supports reverse proxy setups

### Established Patterns
- Named Docker volume `actual_data` for `/data` persistence
- `.env` + `.env.example` pattern for configuration
- RSA key via bind mount to `/run/secrets/eb_private.pem:ro`
- `restart: unless-stopped` on services

### Integration Points
- Caddy needs to reverse proxy to `sync-server:5006` on Docker internal network
- cloudflared needs tunnel token or config to connect to Cloudflare
- `.env` needs new vars: `CLOUDFLARE_TUNNEL_TOKEN`, optional Caddy domain
- `.gitignore` may need updates for any new config files

</code_context>

<specifics>
## Specific Ideas

- iOS PWA requires trusted HTTPS cert — Caddy local CA is insufficient (known pitfall #6 from STATE.md)
- Cloudflare Tunnel is the recommended solution for iOS trust without buying a domain
- Production Enable Banking uses "restricted mode" — free for personal accounts, no contract/KYB needed
- Sandbox credentials (app ID `b619fe6c-ab92-4de5-a7c2-901c0e0ef580`) are documented in STATE.md — production will have different app ID
- Redirect URL will change from `http://localhost:5006/enablebanking/callback` to the Cloudflare Tunnel URL

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-infrastructure-and-production*
*Context gathered: 2026-03-19*
