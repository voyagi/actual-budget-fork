---
phase: 05-infrastructure-and-production
plan: 01
subsystem: infra
tags: [docker-compose, caddy, cloudflared, tls, reverse-proxy, cloudflare-tunnel]

# Dependency graph
requires:
  - phase: 01-foundation-and-api-client
    provides: docker-compose.yml with sync-server service definition

provides:
  - 3-service Docker Compose stack (sync-server + caddy + cloudflared)
  - Caddyfile with tls internal + reverse_proxy to sync-server:5006
  - .env.example with CADDY_HOST, CLOUDFLARE_TUNNEL_TOKEN, ACTUAL_CORS_ORIGIN
  - sync-server healthcheck enabling service_healthy dependency ordering from the monorepo image root

affects: [05-infrastructure-and-production, phase-5-verification, pwa-completion]

# Tech tracking
tech-stack:
  added:
    - caddy:2-alpine (LAN HTTPS reverse proxy with automatic internal CA)
    - cloudflare/cloudflared:latest (Cloudflare Tunnel for iOS/phone HTTPS access)
  patterns:
    - Docker healthcheck + depends_on service_healthy for startup ordering
    - Caddy tls internal for zero-config LAN certificate management
    - cloudflared --no-autoupdate in Docker; image pulls control updates
    - TUNNEL_TOKEN env var for remote-managed Cloudflare Tunnel (no local config.yml)
    - sync-server unexposed from host; accessed only via Docker internal network

key-files:
  created:
    - docker-compose.yml (extended with caddy + cloudflared services)
    - Caddyfile (Caddy reverse proxy config with tls internal)
  modified:
    - .env.example (added CADDY_HOST, CLOUDFLARE_TUNNEL_TOKEN, ACTUAL_CORS_ORIGIN)

key-decisions:
  - "cloudflared routes directly to sync-server:5006, not through Caddy - avoids double-hop; Caddy serves LAN only"
  - "sync-server ports section removed - Caddy and cloudflared handle all ingress over Docker network"
  - "ACTUAL_CORS_ORIGIN added to sync-server environment with localhost:3001 default - avoids CORS errors without config"
  - "sync-server healthcheck uses an inline Node fetch to /health - upstream src/scripts path is invalid from this monorepo Dockerfile's /app root"
  - "Compose validation command is environment-dependent - this machine has docker-compose v5.1.1 but no docker compose plugin"
  - "cloudflared uses tunnel --no-autoupdate run - matches Cloudflare's Docker guidance and avoids self-updating inside the container"
  - "Caddyfile must be validated with the Caddy container; grep checks are not enough to catch parser errors"

patterns-established:
  - "Pattern: healthcheck on sync-server + condition: service_healthy on both proxy services prevents 502s during cold start"
  - "Pattern: caddy_data named volume required to persist CA across restarts - without it CA regenerates and browser trust breaks"

requirements-completed: [INFRA-01, INFRA-02, INFRA-04]

# Metrics
duration: 8min
completed: 2026-03-19
---

# Phase 05 Plan 01: Infrastructure and Production - Docker Compose Stack Summary

**3-service production topology (sync-server + caddy + cloudflared) with Caddy tls internal for LAN HTTPS and Cloudflare Tunnel for iOS/phone access**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-19T02:01:22Z
- **Completed:** 2026-03-19T02:09:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Extended docker-compose.yml from 1 service to the production 3-service topology
- Created Caddyfile with `tls internal` and HTTP-to-HTTPS redirect, CADDY_HOST env var support
- Removed sync-server direct host port exposure; all access goes through Docker internal network
- Added sync-server healthcheck enabling `service_healthy` dependency ordering
- Updated cloudflared command to disable in-container autoupdates
- Updated .env.example with all new infrastructure variables including commented ACTUAL_CORS_ORIGIN

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend docker-compose.yml with Caddy, cloudflared, and healthcheck** - `682ca12b1` (feat)
2. **Task 2: Create Caddyfile and update .env.example** - `8fc746991` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `docker-compose.yml` - 3-service stack with monorepo-safe healthcheck, actual_net network, caddy_data/caddy_config volumes
- `Caddyfile` - Caddy reverse proxy config: tls internal, reverse_proxy sync-server:5006, HTTP redirect
- `.env.example` - Added CADDY_HOST, CLOUDFLARE_TUNNEL_TOKEN, ACTUAL_CORS_ORIGIN sections

## Decisions Made

- cloudflared routes directly to sync-server:5006 (not through Caddy) — avoids double-hop; architecture diagram in RESEARCH.md confirms this is correct
- ACTUAL_CORS_ORIGIN added to sync-server environment block with `http://localhost:3001` default — matches server's default from load-config.ts and makes it explicit in compose
- sync-server ports section deleted — production never exposes port directly to host, and leaving commented `ports:` text breaks simple grep-based verification
- sync-server healthcheck uses an inline Node fetch to `http://127.0.0.1:${ACTUAL_PORT}/health` — the upstream `node src/scripts/health-check.js` path is invalid when the container runs from the monorepo root

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

Initial review found two documentation/config mismatches after execution: this machine provides `docker-compose` but not the `docker compose` plugin, and the upstream `node src/scripts/health-check.js` healthcheck path is invalid from this monorepo image root. Steelman also found that cloudflared should use `--no-autoupdate` in Docker and that Caddyfile syntax needed container validation, not only grep checks. All were corrected. The CLOUDFLARE_TUNNEL_TOKEN warning from compose config validation is expected — the token is intentionally unset in version control and populated from `.env` at runtime.

## User Setup Required

**External services require manual configuration before `docker-compose up` works fully.** Use `docker compose up` instead on machines where the Docker Compose plugin is installed.

Cloudflare Tunnel setup (one-time):
1. Log into [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. Networks > Tunnels > Create a tunnel > Cloudflared
3. Name the tunnel (e.g., `actual-budget`)
4. Configure Public Hostname: Service = `http://sync-server:5006`
5. Copy the tunnel token
6. Add to `.env`: `CLOUDFLARE_TUNNEL_TOKEN=<token>`

Caddy LAN hostname (optional):
- Add to `.env`: `CADDY_HOST=actual.local` (or your preferred LAN hostname)
- Add `actual.local` to your hosts file or local DNS pointing to the Docker host IP

## Next Phase Readiness

- Docker Compose stack definition is complete and validates
- Phase 5 verification (Plans 02+) can now run `docker-compose up` to start the 3-service stack (`docker compose up` also works where that plugin is installed)
- Cloudflare Tunnel token must be configured in `.env` before cloudflared starts successfully
- Caddy local CA trust on desktop is a one-time step: `docker-compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt` (`docker compose exec ...` also works where that plugin is installed)

## Self-Check: PASSED

- docker-compose.yml: FOUND
- Caddyfile: FOUND
- .env.example: FOUND
- 05-01-SUMMARY.md: FOUND
- Commit 682ca12b1 (Task 1): FOUND
- Commit 8fc746991 (Task 2): FOUND

---
*Phase: 05-infrastructure-and-production*
*Completed: 2026-03-19*
