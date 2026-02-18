# Phase 1: Foundation and API Client - Research

**Researched:** 2026-02-18
**Domain:** Docker setup, Fork hygiene, Enable Banking RSA/JWT authentication, GoCardless adapter interface
**Confidence:** HIGH

## Summary

Phase 1 has four concrete deliverables: (1) the fork runs in Docker, (2) the app opens in Chrome and creates a budget, (3) the RSA key pair is configured and survives container restarts, and (4) the `[eb]` commit convention is established. None of these require writing Enable Banking sync code - they are purely infrastructure, authentication scaffolding, and discipline setup.

The fork has not yet pulled any upstream Actual Budget code. The first action of Phase 1 is therefore pulling the upstream repo and verifying the build. Actual Budget uses **Yarn 4.10.3** (verified from `package.json`), Node 22 as minimum, and ES modules throughout. The existing dev-oriented Docker setup is a single container that mounts the entire monorepo at `/app` with a `node:22-bookworm` base image and runs via `./bin/docker-start`. This is the starting point; the fork will adapt it for a production-usable setup.

The Enable Banking API uses RS256 JWTs where the JWT header carries `kid: <applicationId>` and the payload carries `iss: "enablebanking.com"`, `aud: "api.enablebanking.com"`, `iat`, and `exp`. The private key is a standard PEM file downloaded at application registration time. The `jose` library (6.1.3, already chosen) covers this in under 15 lines using `SignJWT` and `importPKCS8`. The Enable Banking sandbox uses the same API base URL with a Mock ASPSP - no separate sandbox URL. A sandbox application registration at enablebanking.com/cp is a required pre-step before any code can be tested.

The GoCardless adapter is structurally stable and well-suited to mirror. It lives at `packages/sync-server/src/app-gocardless/` and follows a clear two-file pattern: `app-gocardless.js` (Express routes, exports `{ app as handlers }`) and `services/gocardless-service.js` (API client). It uses a shared `handleError` wrapper from `./util/handle-error.js`. The Enable Banking adapter will follow this exact pattern but in a new directory `app-enablebanking/` with no modifications to existing files.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Fork Visual Identity**

| Decision | Choice |
|----------|--------|
| App title (browser tab, PWA manifest) | Keep stock "Actual" - no changes |
| About/Settings page | Add fork info: version, Enable Banking status, link to repo |
| Favicon and app icons | Keep stock icons (revisit in Phase 4 PWA) |
| Runtime EB status indicator | Not in Phase 1 - UI indicators belong in Phase 2 |

**Rationale:** Minimal fork surface area. The About page addition provides discoverability without disrupting the stock experience.

**Development Workflow**

| Decision | Choice |
|----------|--------|
| Dev mode | Hybrid: desktop-client runs locally (hot reload), sync-server in Docker |
| Local toolchain | Node.js installed. Yarn availability needs verification at setup time |
| Server reload | Auto-restart on save (nodemon or similar inside Docker) |
| Docker Compose config | Single docker-compose.yml for both dev and prod, toggled via env vars |

**Rationale:** Hybrid approach gives fast UI iteration locally while keeping the sync-server (where EB code lives) in a Docker environment matching production. Auto-restart minimizes friction during API client development.

**Note:** Verify yarn is installed locally before starting. If not, install it or check if Actual uses a different package manager.

**Configuration Layout**

| Decision | Choice |
|----------|--------|
| RSA key location | `secrets/eb_private.pem` (gitignored `secrets/` directory) |
| Other EB config | `.env` file at repo root (app_id, environment, API URLs) |
| Sandbox vs production toggle | All in `.env` - swap values or use `.env.sandbox`/`.env.production` |
| Template file | Both: `.env.example` committed to git AND documented in README |
| Docker secret mounting | Simple bind mount (`./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`) |

**Rationale:** PEM files don't belong in .env (binary/multiline). The secrets/ directory handles the key, .env handles everything else. Simple bind mount avoids Docker secrets complexity for a single-user app.

**Gitignore additions required:**
- `secrets/`
- `.env`
- `.env.sandbox`
- `.env.production`

**Upstream Merge Strategy**

| Decision | Choice |
|----------|--------|
| Sync frequency | After each phase completion |
| Conflict resolution | Case by case (no blanket rule) |
| Branch model | Separate `upstream/main` branch mirrors Actual Budget. Merge from there into fork's main |
| Branch naming | Standard naming (`feat/`, `fix/`, `chore/`). The `[eb]` commit prefix is sufficient |

**Rationale:** Phase boundaries are natural merge points since you're not mid-feature. Separate upstream branch keeps a clean reference of stock Actual Budget for comparison and cherry-picking.

**Setup required in Phase 1:**
- Add upstream remote: `git remote add upstream <actual-budget-repo-url>`
- Create and push `upstream/main` branch tracking the upstream repo
- Document the merge workflow in README or CONTRIBUTING.md

### Claude's Discretion

- Exact nodemon/watch configuration for sync-server in Docker
- Whether Actual uses yarn, npm, or pnpm (verify from repo)
- Specific .env variable names and structure
- Docker base image selection
- About page implementation approach (new component vs modifying existing)

### Deferred Ideas (OUT OF SCOPE)

None raised during discussion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FOUND-01 | User can build and run the forked Actual Budget repo in Docker with no errors | Upstream Docker setup confirmed: `node:22-bookworm` base, `./bin/docker-start` entrypoint, port 3001. Yarn 4.10.3 workspace build sequence identified. |
| FOUND-02 | User can open the app in Chrome on Windows and create a budget | App serves on port 3001 (or 5006 for sync-server only). Development docker-compose mounts full monorepo. Desktop-client served from sync-server's `ACTUAL_WEB_ROOT`. |
| FOUND-03 | RSA key pair is generated and file-mounted as a Docker secret for Enable Banking auth | Bind mount pattern `./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro` confirmed. `jose` `importPKCS8` loads the key at startup. Key persists because it is on host filesystem, not inside container. |
| FOUND-04 | Fork commit convention established (all custom commits tagged with `[eb]` prefix) | Git remote setup, upstream branch creation, and `[eb]` prefix tagging all standard git operations. No library required. |
</phase_requirements>

## Standard Stack

### Core (for Phase 1 specifically)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `jose` | `6.1.3` | RS256 JWT signing for Enable Banking auth | Zero-dependency, ESM-native, TypeScript-first. `SignJWT` + `importPKCS8` covers Enable Banking's exact requirements. Confirmed current via `npm view jose version`. |
| `axios` | `1.13.5` | HTTP client for Enable Banking API calls | Already used by the GoCardless adapter. Avoiding a second HTTP abstraction. No Enable Banking TypeScript SDK exists on npm - raw HTTP required. Confirmed via `npm view axios version`. |
| Yarn | `4.10.3` | Package manager | Hardcoded in upstream `package.json` as `"packageManager": "yarn@4.10.3"`. Node 22 minimum. NOT npm or pnpm. |
| `node:22-bookworm` | Docker base | Container runtime | Upstream Dockerfile confirmed. LTS Node 22. Debian bookworm for apt-get openssl. |
| `nodemon` | `3.1.11` | Sync-server auto-restart in Docker dev mode | Already a devDependency in sync-server's package.json (confirmed from upstream). Use existing install. |

### Note on Package Installation

Yarn 4 workspaces: install packages scoped to the right workspace from the monorepo root:

```bash
# Add jose and axios to sync-server
yarn workspace @actual-app/sync-server add jose axios

# These two are already present in the codebase per upstream package.json - verify before adding
```

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `jose` | `jsonwebtoken` | CommonJS-only, requires `@types/jsonwebtoken`. jose is the ESM successor and is actively maintained. |
| `jose` | `node-jose` | Unmaintained since 2019. |
| `axios` | Native `fetch` | Requires manual `response.ok` checking. Axios matches what GoCardless adapter already uses. |

## Architecture Patterns

### Confirmed Upstream Structure

From direct inspection of the upstream repo at `github.com/actualbudget/actual` (branch: master):

```
packages/
  sync-server/
    src/
      app-gocardless/          <- Mirror this pattern for app-enablebanking/
        app-gocardless.js      <- Express routes, exports { app as handlers }
        bank-factory.js        <- Dynamic bank adapter loader
        errors.js              <- Custom error classes
        gocardless.types.ts    <- TypeScript type definitions
        gocardless-node.types.ts <- PSD2/Berlin Group transaction types
        link.html              <- Static HTML for bank linking UI
        utils.js               <- amountToInteger, sortByBookingDateOrValueDate
        banks/                 <- 45 per-ASPSP override files
          integration-bank.js  <- Fallback/base adapter (normalizeTransaction)
        services/
          gocardless-service.js <- API client (client factory, token management)
        util/
          handle-error.js      <- Shared error wrapper for route handlers
      app-simplefin/
        app-simplefin.js       <- Single-file provider (simpler)
      app-pluggyai/
        app-pluggyai.js        <- Routes
        pluggyai-service.js    <- API client
      app.ts                   <- Mounts all providers: app.use('/gocardless', goCardlessApp.handlers)
      services/
        secrets-service.js     <- SecretName constants + DB-backed secrets with in-memory cache
      util/
        middlewares.js         <- requestLoggerMiddleware, validateSessionMiddleware
        hash.js                <- sha256String

  desktop-client/              <- React app, Vite build, Yarn workspace
  loot-core/                   <- Platform-agnostic core, TypeScript
```

### Pattern 1: Provider Module Structure (TWO-FILE pattern)

Every multi-file provider in sync-server uses this exact structure. Phase 1 creates the scaffold; Phase 2 fills in the route handlers.

**`app-gocardless.js` (routes file) - confirmed from upstream:**

```javascript
// packages/sync-server/src/app-gocardless/app-gocardless.js
import path from 'path';
import { isAxiosError } from 'axios';
import express from 'express';
import { sha256String } from '../util/hash';
import { requestLoggerMiddleware, validateSessionMiddleware } from '../util/middlewares';
import { SomeError } from './errors';
import { goCardlessService } from './services/gocardless-service';
import { handleError } from './util/handle-error';

const app = express();
app.use(requestLoggerMiddleware);

app.get('/link', function (req, res) {
  res.sendFile('link.html', { root: path.resolve('./src/app-gocardless') });
});

export { app as handlers };  // Export BEFORE json middleware (critical - handlers export happens here)

app.use(express.json());
app.use(validateSessionMiddleware);

app.post('/status', handleError(async (req, res) => { ... }));
app.post('/transactions', handleError(async (req, res) => { ... }));
// ... other routes

// Specific error classification in /transactions:
// switch on error type -> return { status: 'ok', data: { error_type: 'RATE_LIMIT_EXCEEDED' } }
```

**Critical note on export placement:** `export { app as handlers }` appears BEFORE `app.use(express.json())`. This is by design - handlers is exported as the Express app instance, and middleware added after export still applies (Express middleware is evaluated at request time, not at module load time).

**`handle-error.js` (shared within provider) - confirmed from upstream:**

```javascript
// packages/sync-server/src/app-gocardless/util/handle-error.js
export function handleError(func) {
  return (req, res) => {
    func(req, res).catch(err => {
      console.log('Error', req.originalUrl, err.message || String(err));
      res.send({
        status: 'ok',
        data: {
          error_code: 'INTERNAL_ERROR',
          error_type: err.message ? err.message : 'internal-error',
        },
      });
    });
  };
}
```

Note: `handleError` is local to the `app-gocardless/util/` subdirectory, not from the top-level `util/`. The Enable Banking adapter will have its own copy at `app-enablebanking/util/handle-error.js`.

### Pattern 2: Mounting in app.ts

```typescript
// packages/sync-server/src/app.ts (confirmed from upstream)
import * as goCardlessApp from './app-gocardless/app-gocardless';
app.use('/gocardless', goCardlessApp.handlers);

// Enable Banking will add:
import * as enableBankingApp from './app-enablebanking/app-enablebanking';
app.use('/enablebanking', enableBankingApp.handlers);
```

### Pattern 3: Secrets Service (for Phase 1 scaffold)

The `SecretName` enum in `secrets-service.js` must be extended with Enable Banking keys:

```javascript
// packages/sync-server/src/services/secrets-service.js (confirmed from upstream)
export const SecretName = {
  gocardless_secretId: 'gocardless_secretId',
  gocardless_secretKey: 'gocardless_secretKey',
  simplefin_token: 'simplefin_token',
  simplefin_accessKey: 'simplefin_accessKey',
  pluggyai_clientId: 'pluggyai_clientId',
  pluggyai_clientSecret: 'pluggyai_clientSecret',
  pluggyai_itemIds: 'pluggyai_itemIds',
  // ADD:
  enablebanking_appId: 'enablebanking_appId',
  enablebanking_keyPath: 'enablebanking_keyPath',  // or read from env
};
```

**Alternative (simpler for Phase 1):** Read `ENABLE_BANKING_APP_ID` and `ENABLE_BANKING_KEY_PATH` directly from `process.env` rather than through the secrets service. The secrets service is designed for user-configurable secrets via the admin UI. For a single-user fork where the values come from `.env` and Docker bind mount, env vars are simpler and avoid adding UI configuration complexity. Recommendation: use env vars for Phase 1, integrate with secrets service if UI configuration is needed later.

### Pattern 4: Enable Banking JWT Generation

Enable Banking JWT requirements (confirmed from official docs and js_example sample):

```
Header:
  typ: "JWT"
  alg: "RS256"
  kid: <applicationId>   <- not "kid" as in JWK thumbprint, but literally the applicationId string

Payload:
  iss: "enablebanking.com"
  aud: "api.enablebanking.com"
  iat: Math.floor(Date.now() / 1000)
  exp: iat + 3600         <- max 86400 (24h), recommend 3600 (1h)

Signed with RS256 using the private RSA key from the downloaded .pem file
```

Implementation with `jose` 6.x (ESM):

```typescript
// packages/sync-server/src/app-enablebanking/enablebanking-service.js
import { importPKCS8, SignJWT } from 'jose';
import { readFileSync } from 'fs';

let privateKey; // loaded once at startup

export async function loadPrivateKey(keyPath) {
  const pem = readFileSync(keyPath, 'utf8');
  privateKey = await importPKCS8(pem, 'RS256');
}

export async function generateJWT(applicationId) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: applicationId })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);
}

export async function apiRequest(method, path, body = null) {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const jwt = await generateJWT(appId);
  const baseUrl = process.env.ENABLE_BANKING_BASE_URL ?? 'https://api.enablebanking.com';
  return axios({
    method,
    url: `${baseUrl}${path}`,
    headers: { Authorization: `Bearer ${jwt}` },
    data: body,
  });
}
```

**Key detail from official sample:** The original Enable Banking JS sample uses the `jwa` library (not `jose`). `jose` is the correct choice for this project (ESM, TypeScript-first, same algorithm) but the implementation structure differs slightly. The `jose` `SignJWT` API is the standard approach.

### Pattern 5: Docker Compose for Hybrid Dev Mode

The upstream `docker-compose.yml` is a dev-only file with a single service (`actual-development`) that mounts the full monorepo and runs `./bin/docker-start`. Phase 1 replaces this with a production-usable setup that also supports the hybrid dev workflow.

**Confirmed upstream Docker details:**
- Base image: `node:22-bookworm`
- Working directory: `/app`
- Port: 3001 (sync-server listens on 3001 in the dev entrypoint, `ACTUAL_PORT` defaults to 5006 for production)
- Data directory: `/data` (ACTUAL_DATA_DIR)
- `nodemon` 3.1.11 is already in devDependencies - use it for Docker dev-mode auto-restart

**Phase 1 docker-compose.yml structure:**

```yaml
services:
  sync-server:
    build:
      context: .
      dockerfile: packages/sync-server/Dockerfile
    environment:
      - NODE_ENV=${NODE_ENV:-production}
      - ACTUAL_PORT=5006
      - ENABLE_BANKING_APP_ID=${ENABLE_BANKING_APP_ID}
      - ENABLE_BANKING_KEY_PATH=/run/secrets/eb_private.pem
      - ENABLE_BANKING_BASE_URL=${ENABLE_BANKING_BASE_URL:-https://api.enablebanking.com}
    ports:
      - "${SYNC_PORT:-5006}:5006"
    volumes:
      - actual_data:/data
      - ./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro
    restart: unless-stopped

volumes:
  actual_data:
```

**Development toggle via env vars:**
- `NODE_ENV=development` enables nodemon in the start script
- Desktop-client runs locally with `yarn workspace @actual-app/desktop-client dev` pointing at sync-server
- Production: `NODE_ENV=production`, desktop-client served from sync-server's `ACTUAL_WEB_ROOT`

**Note on sync-server Dockerfile:** The upstream repo does not have a `packages/sync-server/Dockerfile`. The single `Dockerfile` at the root is for the dev container only. Phase 1 must create a `packages/sync-server/Dockerfile` for production use. Base it on `node:22-bookworm-slim` (lighter than full bookworm, still has apt for openssl).

### Pattern 6: Upstream Remote Setup

```bash
# Add upstream remote
git remote add upstream https://github.com/actualbudget/actual.git

# Pull upstream into a tracking branch
git fetch upstream
git checkout -b upstream/main
git reset --hard upstream/main
git push -u origin upstream/main

# Merge upstream into fork's main (Phase 1 initial pull)
git checkout main
git merge upstream/main --allow-unrelated-histories
```

**Commit prefix convention:** All custom commits carry `[eb]` in the message body (not the type prefix), e.g.:
```
feat(sync-server): [eb] add app-enablebanking scaffold
chore: [eb] add secrets/ to .gitignore
```

### Anti-Patterns to Avoid

- **Putting the PEM key content in `.env` as a multi-line string.** Docker Compose and MSYS both mangle multi-line env values. Always use a file bind mount.
- **Using `npm install` or `pnpm install`.** This is a Yarn 4 workspace monorepo. Using npm creates a `package-lock.json` that conflicts with `yarn.lock`. Always use `yarn`.
- **Modifying `secrets-service.js` in a way that adds UI-facing config for Phase 1.** The secrets service triggers admin UI dropdowns for GoCardless/SimpleFin. For Phase 1, env vars are sufficient and avoids scope creep into the settings UI.
- **Skipping the `docker compose down && docker compose up` RSA key persistence verification.** This is Phase 1 success criterion #3. Do not move to Phase 2 until this is confirmed.
- **Using the upstream dev `docker-compose.yml` as-is.** It mounts the full monorepo and has no persistence for `/data`. The Phase 1 compose file uses a named volume.
- **Committing before adding `secrets/` and `.env` to `.gitignore`.** The RSA private key must never reach git. Verify `.gitignore` as step one.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JWT RS256 signing | Custom crypto implementation | `jose` SignJWT | Edge cases in JWT header encoding, key import, and algorithm validation. jose is audited and spec-compliant. |
| File watching in Docker | Custom fs.watch loop | `nodemon` (already installed) | nodemon handles SIGTERM, debouncing, and process restart correctly. Already in sync-server devDependencies. |
| Secrets storage | Custom env parser | `convict` (already used in load-config.js) | Actual Budget already uses convict for config schema validation. |
| Docker named volumes | Bind mounts with Windows paths | Named volumes (`actual_data:/data`) | Windows paths in Docker Compose bind mounts have known WSL2 permission issues. Named volumes are path-agnostic. |

## Common Pitfalls

### Pitfall 1: RSA Key Not Surviving Container Restart

**What goes wrong:** Enable Banking's dashboard associates a specific public key with an application ID. If the private key changes between restarts, all subsequent JWTs will have a mismatched signature and return 401.

**Why it happens:** Storing the key inside the Docker image (baked in) means a new image rebuild creates a new key. Storing as an environment variable fails because multi-line PEM values are garbled by MSYS and Docker Compose.

**How to avoid:** Bind-mount the key as a read-only file: `./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`. The file lives on the host, survives container recreation, and is never modified by the container.

**Verification step (Phase 1 success criterion #3):** After initial setup, run:
1. `docker compose up` - verify JWT auth returns 200 from sandbox
2. `docker compose down`
3. `docker compose up` - verify JWT auth still returns 200 (same key, same file)

### Pitfall 2: Yarn Version Confusion

**What goes wrong:** Running `npm install` or `npm run build` instead of `yarn install` or `yarn build`. The monorepo's `package.json` specifies `packageManager: "yarn@4.10.3"`. Running npm creates a `package-lock.json` that conflicts with the Yarn 4 `yarn.lock` (Berry format).

**How to avoid:** Install Yarn 4 globally or via Corepack:
```bash
corepack enable
corepack prepare yarn@4.10.3 --activate
```

**Verification:** `yarn --version` should output `4.10.3` before running any install commands.

### Pitfall 3: Sandbox Credentials Are Separate From Production

**What goes wrong:** Enable Banking has two separate environments: sandbox (`https://api.enablebanking.com` with sandbox application) and production (same URL, different application ID and key pair). Sandbox registration at enablebanking.com/cp creates a separate application from the eventual production one.

**How to avoid:** Treat the sandbox application as throwaway. The RSA key pair generated for sandbox is NOT the production key. `.env.example` should document both sets of variables clearly.

**Note:** Enable Banking sandbox uses the same base URL (`https://api.enablebanking.com`). There is no separate sandbox URL. The "Mock ASPSP" is the sandbox bank to use for testing.

### Pitfall 4: About Page Modification Scope

**What goes wrong:** Modifying the About/Settings page in `desktop-client` to add fork info creates a file that upstream will also touch, creating merge conflicts at Phase 2.

**How to avoid:** When adding fork info to the About page, make it conditional: check for a `VITE_EB_VERSION` or similar env var. This way the file change is isolated to adding one conditional block, which minimizes conflict surface.

**Identification:** Find the About page component by searching `desktop-client/src` for "About" or version string rendering. Do not rewrite the component - add the minimum necessary.

### Pitfall 5: Docker Build Context is the Monorepo Root

**What goes wrong:** Placing a `Dockerfile` inside `packages/sync-server/` but setting `build: context: packages/sync-server` means the Dockerfile cannot access `yarn.lock` or the root `package.json` (which defines the workspaces). Yarn 4 workspace installs require the root `package.json`.

**How to avoid:** Set Docker build context to the monorepo root: `build: context: .` with `dockerfile: packages/sync-server/Dockerfile`. The Dockerfile uses `COPY . .` to bring the full monorepo, then `yarn workspaces focus @actual-app/sync-server --production` to install only the needed dependencies.

**Alternative:** Use `yarn workspaces focus` for a minimal production image that excludes dev dependencies.

### Pitfall 6: Node 22 Minimum - Windows Local Dev

**What goes wrong:** The upstream `package.json` requires `"node": ">=22"`. If the local Windows machine runs Node 20 (common LTS at the time of writing), `yarn install` may fail or show warnings, and some ES features used in the codebase may not work.

**How to avoid:** Check `node --version` before starting. If below 22, install via `nvm-windows` or the Node.js installer. The Docker container uses Node 22 regardless.

## Code Examples

### Enable Banking JWT with jose 6.x

```typescript
// Source: Enable Banking API reference + panva/jose GitHub (official docs)
// packages/sync-server/src/app-enablebanking/enablebanking-service.js

import { importPKCS8, SignJWT } from 'jose';
import { readFileSync } from 'fs';
import axios from 'axios';

const EB_BASE_URL = process.env.ENABLE_BANKING_BASE_URL ?? 'https://api.enablebanking.com';
const EB_APP_ID = process.env.ENABLE_BANKING_APP_ID;
const EB_KEY_PATH = process.env.ENABLE_BANKING_KEY_PATH ?? '/run/secrets/eb_private.pem';

let _privateKey = null;

async function getPrivateKey() {
  if (!_privateKey) {
    const pem = readFileSync(EB_KEY_PATH, 'utf8');
    _privateKey = await importPKCS8(pem, 'RS256');
  }
  return _privateKey;
}

async function generateJWT() {
  const key = await getPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: EB_APP_ID })
    .setIssuer('enablebanking.com')
    .setAudience('api.enablebanking.com')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);
}

async function ebRequest(method, path, data = null) {
  const token = await generateJWT();
  return axios({
    method,
    url: `${EB_BASE_URL}${path}`,
    headers: { Authorization: `Bearer ${token}` },
    data,
  });
}

// Sandbox test call - GET /application returns app metadata
export async function testAuth() {
  const response = await ebRequest('GET', '/application');
  return response.data;
}
```

### Enable Banking /status Route (Phase 1 scaffold only)

```javascript
// Source: mirrors app-gocardless.js pattern (confirmed upstream)
// packages/sync-server/src/app-enablebanking/app-enablebanking.js

import express from 'express';
import { requestLoggerMiddleware, validateSessionMiddleware } from '../util/middlewares';
import { handleError } from './util/handle-error';
import { testAuth } from './enablebanking-service';

const app = express();
app.use(requestLoggerMiddleware);

export { app as handlers };

app.use(express.json());
app.use(validateSessionMiddleware);

// Phase 1: status endpoint only - full routes in Phase 2
app.post('/status', handleError(async (req, res) => {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const keyPath = process.env.ENABLE_BANKING_KEY_PATH;

  if (!appId || !keyPath) {
    return res.send({
      status: 'ok',
      data: { configured: false, reason: 'Missing ENABLE_BANKING_APP_ID or ENABLE_BANKING_KEY_PATH' },
    });
  }

  try {
    await testAuth();
    res.send({ status: 'ok', data: { configured: true } });
  } catch (err) {
    res.send({
      status: 'ok',
      data: { configured: false, reason: err.message },
    });
  }
}));
```

### Mounting in app.ts

```typescript
// Source: mirrors existing provider mounting pattern (confirmed upstream)
// packages/sync-server/src/app.ts - add this line alongside existing mounts

import * as enableBankingApp from './app-enablebanking/app-enablebanking';
// ...
app.use('/enablebanking', enableBankingApp.handlers);
```

### .env.example (template to commit)

```bash
# Enable Banking Configuration
# Get app_id from enablebanking.com/cp after registering your application
ENABLE_BANKING_APP_ID=your-application-id-here

# Path where the RSA private key is mounted in the container
# Host file goes in ./secrets/eb_private.pem (gitignored)
ENABLE_BANKING_KEY_PATH=/run/secrets/eb_private.pem

# API base URL - same for sandbox and production
# Use Mock ASPSP in sandbox testing (no separate sandbox URL)
ENABLE_BANKING_BASE_URL=https://api.enablebanking.com

# NODE_ENV toggles nodemon (development) vs direct node (production)
NODE_ENV=production
```

### RSA Key Generation (for sandbox registration)

Enable Banking generates the key pair in the browser during application registration - it is NOT generated locally. The browser download provides `<app-id>-private.pem`. Copy it to `secrets/eb_private.pem`.

However, for testing the key mounting before sandbox registration is complete, a test key can be generated locally:

```bash
# Generate a test RSA 2048-bit key pair (for mounting/reading tests only)
openssl genrsa -out secrets/eb_private.pem 2048
openssl rsa -in secrets/eb_private.pem -pubout -out secrets/eb_public.pem
```

This locally generated key will NOT authenticate with Enable Banking (public key not registered), but it validates that the bind mount, `importPKCS8`, and JWT generation pipeline work before the real key is obtained.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `actual-server` separate repo | All adapters in `packages/sync-server` monorepo | February 2025 | The fork starts from the monorepo directly - no separate server repo to manage |
| Nordigen / GoCardless for EU | Enable Banking (free personal use) | July 2025 (GC stopped EU) | The fork's entire reason for existence |
| Per-provider Dockerfile | Single monorepo root Dockerfile for dev | N/A | Phase 1 must create a dedicated sync-server production Dockerfile |
| `jsonwebtoken` (CommonJS) | `jose` v6 (ESM-native) | jose v3+ | Matches the `"type": "module"` ES module requirement in sync-server's package.json |

**Deprecated/outdated:**
- The `actual-server` separate GitHub repo: archived February 2025. Do not reference it.
- GoCardless for new EU accounts: stopped July 2025. The GoCardless adapter code remains in the repo for existing users but should not be used as a behavioral reference for Enable Banking flows (authentication is completely different).

## Open Questions

1. **Yarn 4 availability on the local Windows machine**
   - What we know: Upstream requires `"packageManager": "yarn@4.10.3"`. Corepack ships with Node 22 and can install Yarn 4 automatically.
   - What's unclear: Whether Yarn is already installed globally on the developer's machine.
   - Recommendation: First task in Phase 1 - run `yarn --version`. If not 4.x, run `corepack enable && corepack prepare yarn@4.10.3 --activate`.

2. **Sync-server Dockerfile does not exist upstream**
   - What we know: The upstream repo has only a root `Dockerfile` for dev use (mounts monorepo, no production build step). `packages/sync-server/` has no Dockerfile.
   - What's unclear: The exact production build sequence for sync-server (does `yarn workspaces focus` work correctly with the Babel transpilation step?).
   - Recommendation: Read `packages/sync-server/package.json` scripts section during Phase 1 to understand the full `build` and `start` sequence before writing the Dockerfile. The `start` script is `build && run` - Babel compiles TypeScript + adds import extensions.

3. **About page component location in desktop-client**
   - What we know: The user decision is to add fork info (version, EB status, repo link) to the About/Settings page. This is a Phase 1 deliverable.
   - What's unclear: Exact file path of the About component in `packages/desktop-client/src/`.
   - Recommendation: Search for "About" in `packages/desktop-client/src/` during Phase 1 implementation. Keep the change minimal (one conditional block, driven by a `VITE_EB_VERSION` env var).

4. **Enable Banking sandbox base URL**
   - What we know: The official sandbox docs do not specify a separate sandbox base URL. The sample code uses `https://api.enablebanking.com`. The Mock ASPSP is the sandbox bank.
   - What's unclear: Whether sandbox applications use the same URL or a separate one like `https://sandbox.enablebanking.com`.
   - Recommendation: Confirm at application registration time by checking the Control Panel at enablebanking.com/cp. The `.env.example` uses `https://api.enablebanking.com` as the default, which is what the official samples show.

5. **`bin/docker-start` script behavior**
   - What we know: The upstream dev Docker entrypoint is `sh ./bin/docker-start`. This likely runs `yarn install && yarn start` for the relevant package.
   - What's unclear: Exact contents of the script.
   - Recommendation: Read `bin/docker-start` during Phase 1 from the upstream repo to understand the full startup sequence before writing the Phase 1 Dockerfile.

## Sources

### Primary (HIGH confidence)

- Upstream repo inspected at `github.com/actualbudget/actual`, branch `master` - file structure, package manager, Docker setup, GoCardless adapter interface
- `packages/sync-server/package.json` (upstream): `"packageManager": "yarn@4.10.3"`, `"type": "module"`, Express 5.2.1, nodemon 3.1.11, better-sqlite3 12.5.0
- `packages/sync-server/src/app-gocardless/app-gocardless.js` (upstream): exact route structure, `export { app as handlers }`, import paths
- `packages/sync-server/src/app-gocardless/util/handle-error.js` (upstream): exact `handleError` implementation
- `packages/sync-server/src/services/secrets-service.js` (upstream): exact `SecretName` constants
- `packages/sync-server/src/app.ts` (upstream): provider mounting pattern, `app.use('/gocardless', goCardlessApp.handlers)`
- `packages/sync-server/src/app-pluggyai/pluggyai-service.js` (upstream): service singleton pattern, lazy client initialization
- `root/Dockerfile` (upstream): `node:22-bookworm`, `/app` workdir, `sh ./bin/docker-start`
- [Enable Banking API Quick Start](https://enablebanking.com/docs/api/quick-start/) - JWT fields, auth flow steps
- [Enable Banking API Reference](https://enablebanking.com/docs/api/reference/) - exact JWT header/payload claims, `/auth` body, session response, transaction fields
- [Enable Banking Sandbox Docs](https://enablebanking.com/docs/api/sandbox/) - Mock ASPSP, sandbox limitations, no separate base URL
- [enablebanking-api-samples/js_example/utils.js](https://github.com/enablebanking/enablebanking-api-samples) - JWT generation pattern with RS256
- `npm view jose version` -> 6.1.3, `npm view axios version` -> 1.13.5, `npm view node-cron version` -> 4.2.1 (all confirmed 2026-02-18)

### Secondary (MEDIUM confidence)

- Prior project research documents: `.planning/research/STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `SUMMARY.md` (confirmed from earlier research session)
- `packages/sync-server/src/app-gocardless/banks/integration-bank.js` (upstream): normalizeTransaction pattern, calculateStartingBalance approach

### Tertiary (LOW confidence)

- `packages/sync-server/src/app-gocardless/gocardless-node.types.ts` (upstream): PSD2 transaction field names - field names match Berlin Group spec, Enable Banking uses snake_case variants

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Yarn 4.10.3 confirmed from upstream package.json. Node 22 confirmed from Dockerfile. Package versions confirmed from npm registry.
- Architecture: HIGH - GoCardless adapter structure inspected directly from upstream GitHub. Export pattern, middleware order, route structure all confirmed.
- Pitfalls: HIGH for Docker and RSA key concerns (from prior research plus direct code inspection). MEDIUM for About page merge risk (requires reading the actual file to confirm).
- Enable Banking JWT: HIGH - confirmed from official docs and official JS sample code.

**Research date:** 2026-02-18
**Valid until:** 2026-04-18 (stable - Yarn 4 and Node 22 are locked, GoCardless adapter pattern unlikely to change)

**Prerequisites not yet resolved (must complete before Phase 1 begins):**
1. Register a sandbox application at [enablebanking.com/cp](https://enablebanking.com/cp/applications) - required to get App ID and sandbox RSA key pair
2. Verify Yarn is installed locally (`yarn --version` should be 4.x)
3. Confirm Node 22 is installed locally (`node --version` should be >= 22)
