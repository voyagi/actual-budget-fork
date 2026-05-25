# Phase 05: Infrastructure and Production - Research

**Researched:** 2026-03-19
**Domain:** Docker Compose, Caddy reverse proxy, Cloudflare Tunnel, Enable Banking production credentials
**Confidence:** HIGH

## Summary

This phase assembles three services — `sync-server`, `caddy`, and `cloudflared` — into a single `docker compose up` stack, then verifies persistence, multi-device sync, and production Enable Banking credentials. The existing `docker-compose.yml` already defines `sync-server` correctly; the work is extending it with two additional services and updating the `.env` / `.env.example` files.

The core architecture decision is already locked: Caddy handles LAN/desktop HTTPS via its internal CA (`tls internal`), while Cloudflare Tunnel (`cloudflared`) provides external HTTPS that is trusted by iOS Safari without any certificate installation. The Cloudflare Tunnel is the only path to a certificate that iOS Safari trusts out of the box — Caddy's `tls internal` local CA is not trusted by iOS and cannot be made so without manual per-device cert installation.

Production Enable Banking credentials require a separate application registration at enablebanking.com/cp. The production app starts in "restricted mode" (free, personal use), activated by linking your own bank accounts. The redirect URL in the production app registration must be updated from `http://localhost:5006/enablebanking/callback` to the Cloudflare Tunnel public URL.

**Primary recommendation:** Use `TUNNEL_TOKEN` environment variable (not a credentials JSON file) to configure `cloudflared`. Use `tls internal` in the Caddyfile for LAN HTTPS. Route cloudflared directly to `sync-server:5006` over the Docker internal network.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Cloudflare Tunnel for external/phone access (free tier, handles iOS HTTPS trust automatically, no port forwarding or domain purchase needed)
- Caddy as local reverse proxy inside Docker Compose for LAN/desktop access with automatic local HTTPS
- Cloudflare Tunnel runs as a `cloudflared` service in the same docker-compose.yml
- sync-server's built-in HTTPS support (`ACTUAL_HTTPS_KEY`/`ACTUAL_HTTPS_CERT`) is NOT used — Caddy and Cloudflare Tunnel handle TLS termination externally
- `trust proxy` is set on sync-server since it sits behind Caddy
- 3 services in single docker-compose.yml: `sync-server`, `caddy`, `cloudflared`
- sync-server listens on HTTP port 5006 internally (no direct host port exposure in production)
- Caddy proxies to sync-server, serves HTTPS on port 443 (LAN access)
- cloudflared connects to Caddy or sync-server and exposes via Cloudflare Tunnel (phone access)
- Named volume `actual_data` for persistence (already exists in current compose)
- RSA key bind mount `./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro` (already exists)
- Healthcheck on sync-server using upstream pattern: `node src/scripts/health-check.js`
- `restart: unless-stopped` on all services
- Same docker-compose.yml for sandbox and production (per Phase 1 locked decision)
- Environment switch via `.env` file: swap `ENABLE_BANKING_APP_ID` to production app ID
- Production registration at enablebanking.com/cp is a manual human checkpoint (restricted mode, no contract needed)
- New RSA key pair may be needed for production app — document in checklist
- Production API base URL is the same: `https://api.enablebanking.com`
- Checklist-based verification with explicit human checkpoints for all 7 success criteria

### Claude's Discretion

- Caddyfile configuration details (reverse proxy directives, TLS settings)
- cloudflared tunnel configuration format (config.yml vs CLI flags / TUNNEL_TOKEN env var)
- Exact healthcheck script path and timing intervals
- Whether cloudflared proxies to Caddy or directly to sync-server
- Docker network configuration between services

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Docker Compose deploys sync-server + desktop-client + Caddy in a single `docker compose up` | Caddy + cloudflared service definitions extend existing docker-compose.yml |
| INFRA-02 | HTTPS termination via Caddy with automatic local CA (or Cloudflare Tunnel for phone access) | `tls internal` in Caddyfile for LAN; TUNNEL_TOKEN pattern for cloudflared |
| INFRA-03 | Multi-device sync works (phone and desktop see the same budget data via sync-server) | Both paths (Caddy LAN and cloudflared external) route to the same sync-server instance with shared `actual_data` volume |
| INFRA-04 | Docker volumes persist data across container restarts (verified explicitly) | Named volume `actual_data` already defined; explicit `down && up` test step in checklist |
</phase_requirements>

---

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| `caddy:2-alpine` | 2.9.1+ (use `caddy:2-alpine` tag for auto-updates within v2) | LAN HTTPS reverse proxy + internal CA | Zero cert management; `tls internal` generates trusted local cert; Alpine keeps image small |
| `cloudflare/cloudflared` | `2025.2.0` (or `latest` for auto-update) | Cloudflare Tunnel — external HTTPS trusted by iOS Safari | Free tier; no domain purchase; no port forwarding; cert trusted by all clients including iOS |
| `actual_data` named volume | Docker builtin | Persist `/data` across restarts | Already defined in existing compose |
| `node src/scripts/health-check.js` | Upstream pattern | sync-server healthcheck | Upstream upstream docker-compose.yml uses this exact command |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| `.env` file with `TUNNEL_TOKEN` | Store Cloudflare Tunnel token outside compose file | Always — keeps secret out of version control |
| `caddy_data` named volume | Persist Caddy certificate store | Required — without it, Caddy regenerates CA on each restart, breaking trust |
| `caddy_config` named volume | Persist Caddy runtime config | Recommended to avoid cold-start config loss |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `TUNNEL_TOKEN` env var | credentials JSON file + `config.yml` | JSON file approach requires `cloudflared tunnel create` CLI locally first; TUNNEL_TOKEN from dashboard is simpler for a single-tunnel setup |
| `cloudflare/cloudflared` (official image) | `erisamoe/cloudflared` (community image) | Official image is the correct choice; community image exists for alternative platforms only |
| cloudflared → sync-server direct | cloudflared → Caddy → sync-server | Direct is simpler; avoids double-hop; Caddy is only needed for LAN access. **Recommend: cloudflared routes directly to `sync-server:5006`** |

**Installation (no npm packages — Docker images only):**

Cloudflare Tunnel setup is a one-time manual step in the Cloudflare Zero Trust dashboard:
1. Log into [one.dash.cloudflare.com](https://one.dash.cloudflare.com)
2. Networks > Tunnels > Create a tunnel > Cloudflared
3. Name the tunnel (e.g., `actual-budget`)
4. Copy the tunnel token shown in the dashboard
5. Add `CLOUDFLARE_TUNNEL_TOKEN=<token>` to `.env`

A Cloudflare account with at least one domain added to Cloudflare is required for a **named persistent tunnel with a public hostname**. The domain can be on Cloudflare's free plan. A custom domain (even a cheap one) is needed for a stable URL — TryCloudflare (`trycloudflare.com`) provides temporary URLs only, unsuitable for production.

---

## Architecture Patterns

### Recommended Docker Compose Topology

```
Internet
    │
    ▼ HTTPS (Cloudflare edge cert — trusted by all)
cloudflared ──────────────────────────────► sync-server:5006 (HTTP, Docker network)
                                                    ▲
desktop browser                                     │
    │ HTTPS (Caddy internal CA — trusted on desktop)│
    ▼                                               │
 caddy:443 ──────────────────────────────────────────
```

Both `caddy` and `cloudflared` terminate TLS externally and proxy plain HTTP to `sync-server:5006` on the Docker internal network. `sync-server` never handles TLS directly.

### Recommended Project Structure (new files)

```
./
├── docker-compose.yml          # EXTEND: add caddy + cloudflared services
├── Caddyfile                   # NEW: Caddy reverse proxy config
├── .env                        # EXTEND: add CLOUDFLARE_TUNNEL_TOKEN, CADDY_HOST
├── .env.example                # EXTEND: document new vars
└── secrets/
    └── eb_private.pem          # Already exists (bind mount, gitignored)
```

No `cloudflared-config.yml` is needed when using `TUNNEL_TOKEN` (remote-managed tunnel). The tunnel ingress is configured in the Cloudflare dashboard, not in a local config file.

### Pattern 1: Caddy `tls internal` for LAN HTTPS

**What:** Caddy generates its own local CA and signs a certificate for the configured hostname. Desktop browsers trust it after one-time CA trust installation.

**When to use:** LAN/desktop access where you can install the CA cert on the machine.

**Caddyfile:**
```caddyfile
# Source: caddyserver.com/docs/caddyfile/directives/tls + automatic-https docs
{
  # Global options block — optional but useful for log level control
  log {
    level ERROR
  }
}

# LAN access: replace with your LAN hostname or IP
# Using an IP address causes Caddy to issue a self-signed cert (not internal CA)
# Using a hostname like "actual.local" with tls internal uses the local CA
:443 {
  tls internal
  reverse_proxy sync-server:5006
}

# HTTP redirect to HTTPS
:80 {
  redir https://{host}{uri} permanent
}
```

For a LAN IP address (e.g., `192.168.x.x`) instead of a hostname, Caddy issues a self-signed cert. The `tls internal` directive applies only when a hostname is used. For IP-based LAN access, desktop users will see a browser warning unless they add a security exception.

**Caddy volumes required:**

```yaml
volumes:
  caddy_data:    # Persists CA + certs across restarts — critical
  caddy_config:  # Persists Caddy runtime config
```

### Pattern 2: cloudflared with `TUNNEL_TOKEN` (remote-managed tunnel)

**What:** cloudflared reads the tunnel token from `TUNNEL_TOKEN` env var, connects outbound to Cloudflare edge, and proxies requests to the configured upstream. No inbound port opening required.

**When to use:** External access and iOS Safari HTTPS trust. The Cloudflare edge certificate is trusted by all browsers/OS trust stores including iOS Safari.

```yaml
# Source: developers.cloudflare.com/cloudflare-one/connections/connect-networks
cloudflared:
  image: cloudflare/cloudflared:latest
  restart: unless-stopped
  command: tunnel run
  environment:
    - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
  depends_on:
    sync-server:
      condition: service_healthy
  networks:
    - actual_net
```

The ingress rule (which hostname → which upstream) is configured in the Cloudflare Zero Trust dashboard, not in a local config file. Set the upstream to `http://sync-server:5006` in the dashboard Public Hostname configuration.

**Important:** The tunnel hostname in the Cloudflare dashboard must match the redirect URL registered in the Enable Banking production application. If the tunnel URL is `https://actual.yourdomain.com`, the Enable Banking production app's redirect URL must be `https://actual.yourdomain.com/enablebanking/callback`.

### Pattern 3: sync-server healthcheck

Adopt the upstream pattern exactly (confirmed: `health-check.js` exists at `packages/sync-server/src/scripts/health-check.js`):

```yaml
healthcheck:
  test: ['CMD-SHELL', 'node src/scripts/health-check.js']
  interval: 60s
  timeout: 10s
  retries: 3
  start_period: 20s
```

This enables `depends_on: condition: service_healthy` on `caddy` and `cloudflared` to wait for sync-server to be ready before starting proxies.

### Pattern 4: Docker service startup ordering

```yaml
caddy:
  depends_on:
    sync-server:
      condition: service_healthy

cloudflared:
  depends_on:
    sync-server:
      condition: service_healthy
```

Both proxy services wait for sync-server to pass healthcheck before starting. This prevents 502 errors during cold start.

### Anti-Patterns to Avoid

- **Exposing sync-server port directly to host in production:** Remove or comment out `ports: - '${SYNC_PORT:-5006}:5006'` once Caddy and cloudflared are in place. Direct exposure bypasses TLS and rate limiting.
- **Using `tls internal` for iOS access:** Caddy's local CA root is not trusted by iOS Safari. Only Cloudflare Tunnel (with its globally trusted edge certificate) satisfies iOS PWA HTTPS requirement.
- **Using TryCloudflare for production:** Quick tunnels (`trycloudflare.com`) have a 200-concurrent-request cap, no SSE support, no guaranteed uptime, and generate a new random URL on each run. Use a named persistent tunnel.
- **Storing `CLOUDFLARE_TUNNEL_TOKEN` in `docker-compose.yml`:** Always use `.env` file. The token grants full tunnel access — treat it like a password.
- **Skipping `caddy_data` volume:** Without this volume, Caddy regenerates its local CA on each container restart. All previously trusted certificates become invalid and browsers show errors until the new CA is re-trusted.
- **Registering the same Enable Banking app for sandbox and production:** Sandbox and production applications are separate registrations and cannot be transferred. The production app needs its own app ID, its own RSA key pair, and updated redirect URLs.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TLS certificate management | Custom mkcert scripts, self-signed cert generation | Caddy `tls internal` | Caddy handles CA lifecycle, cert renewal, and system trust store; hand-rolled certs expire silently |
| External HTTPS tunnel | ngrok, custom VPN setup, port forwarding | Cloudflare Tunnel (`cloudflared`) | Free, persistent, globally trusted cert, no inbound firewall rules |
| iOS certificate trust | Manual cert distribution, MDM profiles | Cloudflare Tunnel | Only path to automatic iOS trust without user action |
| Service startup ordering | Shell scripts with sleep loops | Docker healthcheck + `depends_on: service_healthy` | Reliable, no timing assumptions |

**Key insight:** All TLS complexity in this phase is solved by two tools that already handle the hard parts. Do not attempt to manage certificates manually.

---

## Common Pitfalls

### Pitfall 1: Caddy local CA not trusted by iOS Safari

**What goes wrong:** Desktop Chrome works fine (`tls internal` + manual CA trust on desktop). iOS Safari shows "This connection is not private" and the PWA cannot be installed.

**Why it happens:** iOS Safari uses Apple's own certificate trust store. Third-party local CAs (including Caddy's) cannot be trusted on iOS by web app users without explicit user action in Settings, which Apple makes intentionally difficult.

**How to avoid:** Route all phone/iOS access through Cloudflare Tunnel. The Cloudflare edge presents a certificate signed by a globally trusted CA (DigiCert). iOS Safari trusts it automatically.

**Warning signs:** PWA install prompt does not appear on iOS. Safari shows certificate error on the Caddy URL from the phone.

### Pitfall 2: Enable Banking redirect URL mismatch

**What goes wrong:** Production OAuth flow starts but the callback fails with a redirect_uri mismatch error. The bank redirects to `http://localhost:5006/enablebanking/callback` (the sandbox URL) instead of the production tunnel URL.

**Why it happens:** The production Enable Banking app registration has a separate `redirect_urls` list from sandbox. The production app must be registered with the Cloudflare Tunnel URL, not localhost.

**How to avoid:** Before registering the production Enable Banking app, confirm the Cloudflare Tunnel public hostname. Register the production app with `https://<tunnel-hostname>/enablebanking/callback` as the redirect URL. Update `ENABLE_BANKING_REDIRECT_URL` in `.env` (if the server uses it) or verify the callback route handles the production hostname correctly.

**Warning signs:** OAuth redirect returns with error=invalid_redirect_uri. Bank login page shows callback URL mismatch.

### Pitfall 3: CORS origin mismatch in production

**What goes wrong:** Browser console shows CORS errors when the Cloudflare Tunnel URL tries to talk to the sync-server.

**Why it happens:** `load-config.ts` has `corsOrigin` (env: `ACTUAL_CORS_ORIGIN`) which defaults to `http://localhost:3001`. In production, requests originate from the Cloudflare Tunnel URL or Caddy HTTPS URL.

**How to avoid:** Add `ACTUAL_CORS_ORIGIN=https://<tunnel-hostname>` to `.env` for the Cloudflare Tunnel origin. If desktop (Caddy) and phone (cloudflared) use different origins, verify which origin makes API requests. Since the web app is served by sync-server itself (same origin), CORS should not be an issue for same-origin requests — but verify after deploy.

**Warning signs:** CORS preflight errors in browser DevTools on the phone.

### Pitfall 4: sync-server port still exposed to host

**What goes wrong:** After adding Caddy and cloudflared, the raw HTTP port 5006 is still exposed on the host, bypassing TLS and rate limiting. Any device on the LAN can access the app without HTTPS.

**Why it happens:** The current `docker-compose.yml` has `ports: - '${SYNC_PORT:-5006}:5006'`. This remains active unless removed or commented out.

**How to avoid:** Remove the `ports` mapping from sync-server in the final production compose. Caddy and cloudflared access sync-server over the Docker internal network — no host port exposure is needed.

**Warning signs:** `curl http://<lan-ip>:5006` returns a response when it should be refused.

### Pitfall 5: Enable Banking production app stays in "pending" state

**What goes wrong:** Production app ID is set in `.env` but all API calls return 401 or "application not active".

**Why it happens:** Production Enable Banking applications start as "pending" after registration. They activate in restricted mode only after you link at least one of your own bank accounts to the application via the enablebanking.com/cp dashboard.

**How to avoid:** After registering the production app, immediately go to the control panel, use "Link accounts", and authorize at least one real bank account. The app status changes to active (restricted mode). Only then will the API accept the production app ID.

**Warning signs:** Enable Banking API returns 401 or application status errors. Dashboard shows application status as "pending".

### Pitfall 6: `caddy_data` volume missing — CA regenerates on restart

**What goes wrong:** After `docker compose down && docker compose up`, desktop Chrome shows a certificate error for the Caddy HTTPS URL.

**Why it happens:** Without a persistent volume for `/data`, Caddy generates a new local CA on each container start. The previously trusted root CA is replaced by a new one the browser has never seen.

**How to avoid:** Always mount `caddy_data:/data` and `caddy_config:/config` as named volumes. They persist across `down/up` cycles.

**Warning signs:** "Certificate not trusted" error on desktop after `docker compose down && up` when it was working before.

---

## Code Examples

### Complete docker-compose.yml extension

```yaml
# Source: CONTEXT.md locked decisions + cloudflare docs + caddy docs
services:
  sync-server:
    build:
      context: .
      dockerfile: packages/sync-server/Dockerfile
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - ACTUAL_PORT=5006
      - ACTUAL_DATA_DIR=/data
      - ENABLE_BANKING_APP_ID=${ENABLE_BANKING_APP_ID:-}
      - ENABLE_BANKING_KEY_PATH=/run/secrets/eb_private.pem
      - ENABLE_BANKING_BASE_URL=${ENABLE_BANKING_BASE_URL:-https://api.enablebanking.com}
      - ACTUAL_CORS_ORIGIN=${ACTUAL_CORS_ORIGIN:-http://localhost:3001}
    # No host port exposure in production — Caddy and cloudflared use Docker network
    # ports:
    #   - '${SYNC_PORT:-5006}:5006'
    volumes:
      - actual_data:/data
      - ./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro
    healthcheck:
      test: ['CMD-SHELL', 'node src/scripts/health-check.js']
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 20s
    restart: unless-stopped
    networks:
      - actual_net

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
      - '443:443/udp'  # HTTP/3 QUIC
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      sync-server:
        condition: service_healthy
    networks:
      - actual_net

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      sync-server:
        condition: service_healthy
    networks:
      - actual_net

networks:
  actual_net:
    driver: bridge

volumes:
  actual_data:
  caddy_data:
  caddy_config:
```

### Caddyfile (minimal internal CA)

```caddyfile
# Source: caddyserver.com/docs/caddyfile/directives/tls
# Replace "actual.local" with your LAN hostname, or use the machine's LAN IP
# If using a LAN IP, remove "tls internal" — Caddy will use a self-signed cert
{$CADDY_HOST:actual.local}:443 {
  tls internal
  reverse_proxy sync-server:5006
}

{$CADDY_HOST:actual.local}:80 {
  redir https://{host}{uri} permanent
}
```

### .env additions

```bash
# Cloudflare Tunnel token — from zero.dash.cloudflare.com > Networks > Tunnels
# Create tunnel first, copy token from dashboard
CLOUDFLARE_TUNNEL_TOKEN=your-tunnel-token-here

# LAN hostname for Caddy (used in Caddyfile as {$CADDY_HOST})
# Must match a hostname you can resolve on your LAN (hosts file or local DNS)
CADDY_HOST=actual.local

# CORS origin — set to the Cloudflare Tunnel public URL for phone access
# If desktop and phone use different origins, set to the primary access URL
ACTUAL_CORS_ORIGIN=https://actual.yourdomain.com
```

### Trusting the Caddy local CA on desktop (one-time)

```bash
# Source: caddyserver.com/docs/automatic-https
# Export Caddy's root CA certificate from the running container
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt

# On Windows: double-click caddy-root.crt, install to "Trusted Root Certification Authorities"
# On macOS: sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain caddy-root.crt
# On Linux: sudo cp caddy-root.crt /usr/local/share/ca-certificates/ && sudo update-ca-certificates
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| nginx + mkcert for local HTTPS | Caddy `tls internal` | Caddy manages CA lifecycle; no manual cert renewal |
| ngrok for external tunnel | Cloudflare Tunnel (`cloudflared`) | Free, persistent URL, globally trusted cert |
| Separate tunnel config file | `TUNNEL_TOKEN` env var (remote-managed) | Simpler — no credentials JSON or local config.yml needed |
| `--token` flag on cloudflared | `TUNNEL_TOKEN` env var | Token not visible in `ps` output; preferred security pattern |

---

## Enable Banking Production Transition

### What Changes for Production

| Item | Sandbox | Production |
|------|---------|------------|
| App ID | `b619fe6c-ab92-4de5-a7c2-901c0e0ef580` | New UUID from enablebanking.com/cp |
| RSA key pair | `secrets/eb_private.pem` (current) | May need new key pair registered to production app |
| Redirect URL | `http://localhost:5006/enablebanking/callback` | `https://<tunnel-hostname>/enablebanking/callback` |
| API base URL | `https://api.enablebanking.com` | Same — no change |
| Application status | Active immediately | Starts "pending" → activate by linking own accounts |
| Cost | Free | Free (restricted mode, own accounts only) |

### Production App Activation Checklist

These are manual human steps — not automatable:

1. Register new application at [enablebanking.com/cp](https://enablebanking.com/cp) with environment=PRODUCTION
2. Set redirect URL to `https://<tunnel-hostname>/enablebanking/callback`
3. Upload the production RSA public key (generate new pair or reuse sandbox key — confirm with EB docs)
4. Copy the new production App ID
5. In the EB control panel, click "Link accounts" and authorize at least one real bank account
6. Confirm app status changes from "pending" to active (restricted mode)
7. Update `.env`: set `ENABLE_BANKING_APP_ID` to production app ID
8. Restart sync-server: `docker compose restart sync-server`

---

## Validation Architecture

> `workflow.nyquist_validation` is absent from `.planning/config.json` — treated as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing in sync-server) |
| Config file | `packages/sync-server/vitest.config.ts` |
| Quick run | `cd packages/sync-server && npx vitest run --reporter=verbose` |
| Full suite | `cd packages/sync-server && npx vitest run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Notes |
|--------|----------|-----------|-------|
| INFRA-01 | `docker compose up` starts all 3 services | Manual smoke test | Cannot automate Docker orchestration in unit tests |
| INFRA-02 | HTTPS cert trusted by desktop Chrome and iOS Safari | Manual smoke test | Browser trust verification requires human observation |
| INFRA-03 | Transaction on desktop visible on phone within seconds | Manual smoke test | Requires two physical devices |
| INFRA-04 | Data persists across `down && up` | Manual smoke test | Requires running Docker locally |

All four requirements are inherently integration/infrastructure tests that cannot be automated in a unit test suite. The verification approach is a documented checklist executed by the human developer.

### Wave 0 Gaps

None for automated tests — this phase has no new server-side code requiring unit tests. All verification is via the checklist-based smoke test in the PLAN.

---

## Open Questions

1. **cloudflared → Caddy vs cloudflared → sync-server direct**
   - What we know: Both work. Direct (cloudflared → sync-server) is simpler, avoids a hop, and is what the CONTEXT.md describes as a discretion item.
   - What's unclear: Whether there's a reason to route through Caddy (there isn't — Caddy is for LAN, cloudflared is for WAN).
   - Recommendation: Route cloudflared directly to `sync-server:5006`. Caddy serves LAN. This is the architecture diagram in this document.

2. **Cloudflare domain requirement**
   - What we know: A named persistent tunnel requires at least one domain added to Cloudflare. The domain can be on the free plan.
   - What's unclear: Whether the user already has a domain on Cloudflare.
   - Recommendation: Include a prerequisite check in the PLAN. If no domain is available, document that a cheap domain is needed (or use TryCloudflare for testing, named tunnel for production).

3. **Production Enable Banking RSA key**
   - What we know: Sandbox uses `secrets/eb_private.pem`. Production may require a separate key pair uploaded to the production app registration.
   - What's unclear: Enable Banking docs do not explicitly state whether you must use a new key pair for the production app or can reuse the sandbox public key.
   - Recommendation: Plan for generating and uploading a new RSA key pair for the production app registration. Document as a manual step. If reuse is possible, it's a simplification — but don't assume it.

4. **ACTUAL_CORS_ORIGIN for dual-origin access**
   - What we know: The server's CORS config (`corsOrigin`) is a single string. Desktop uses the Caddy LAN URL; phone uses the Cloudflare Tunnel URL.
   - What's unclear: Since the web app is served by sync-server itself (same origin as the API), CORS may be a non-issue for same-origin requests.
   - Recommendation: Verify after first deploy by checking browser DevTools on the phone. If CORS errors appear, set `ACTUAL_CORS_ORIGIN` to the Cloudflare Tunnel URL (phone is the cross-origin client).

---

## Sources

### Primary (HIGH confidence)

- `docker-compose.yml` (project root) — current sync-server service definition, confirmed working
- `packages/sync-server/docker-compose.yml` — upstream healthcheck pattern (`node src/scripts/health-check.js`)
- `packages/sync-server/src/scripts/health-check.js` — confirmed exists
- `packages/sync-server/src/app.ts` — `trust proxy` config at line 35, confirmed
- `packages/sync-server/src/load-config.ts` — `trustedProxies`, `corsOrigin`, HTTPS config confirmed
- [Caddy Automatic HTTPS docs](https://caddyserver.com/docs/automatic-https) — local CA behavior, iOS limitation
- [Cloudflare Zero Trust tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — TUNNEL_TOKEN pattern, remote-managed tunnel
- [Enable Banking FAQ](https://enablebanking.com/docs/faq/) — restricted mode activation, free personal use
- `.planning/phases/05-infrastructure-and-production/05-CONTEXT.md` — locked decisions

### Secondary (MEDIUM confidence)

- [Docker Compose startup order docs](https://docs.docker.com/compose/how-tos/startup-order/) — `depends_on: service_healthy` pattern
- [Cloudflare Community: cloudflared in docker-compose](https://community.cloudflare.com/t/can-i-use-cloudflared-in-a-docker-compose-yml/407168) — TUNNEL_TOKEN env var confirmed preferred
- [Caddy community: tls internal + Docker](https://caddy.community/t/caddy-in-docker-container-does-not-trust-its-own-root-ca-certificate-automatically/13671) — CA trust store behavior in Docker

### Tertiary (LOW confidence — needs validation on setup day)

- Enable Banking production RSA key reuse vs new key pair — not explicitly documented; verify at registration time
- CORS behavior when web app is same-origin as API — confirm in browser DevTools after first deploy

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Caddy and cloudflared are the locked decisions from CONTEXT.md; versions confirmed via Docker Hub tags
- Architecture: HIGH — Docker Compose patterns are well-documented; topology matches locked decisions
- Pitfalls: HIGH — iOS CA trust limitation is documented in Caddy official docs and is the primary motivator for Cloudflare Tunnel; redirect URL mismatch is a standard OAuth pitfall
- Enable Banking production: MEDIUM — Restricted mode and activation process confirmed via EB FAQ; RSA key reuse policy is LOW confidence

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (stable infrastructure components; cloudflared version tag may need updating)
