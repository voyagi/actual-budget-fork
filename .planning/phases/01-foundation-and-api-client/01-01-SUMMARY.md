---
phase: 01-foundation-and-api-client
plan: 01
subsystem: infra
tags: [docker, yarn, monorepo, upstream-fork, actual-budget]

# Dependency graph
requires: []
provides:
  - Actual Budget v26.2.0 running in Docker at localhost:5006
  - Upstream remote configured (actualbudget/actual) with upstream/main tracking branch
  - Fork hygiene: [eb] commit convention, secrets/ gitignored, .env.example committed
  - Single docker-compose.yml (dev+prod) with bind mount for RSA key
  - .gitignore extended with secrets/, .env, .env.sandbox, .env.production, .vscode/
  - .env.example with all Enable Banking configuration variables documented
affects:
  - 01-02 (Enable Banking API client - builds on running Docker stack)
  - 01-03 (TypeScript types - uses same monorepo workspace structure)
  - All future phases (fork hygiene convention must be maintained)

# Tech tracking
tech-stack:
  added:
    - Docker / docker-compose (custom Dockerfile for sync-server + web build)
    - Yarn 4.10.3 via Corepack (activated in container)
    - Node.js 22 Bookworm Slim base image
  patterns:
    - "[eb] commit tagging: all fork-custom commits carry [eb] in the message"
    - "Monorepo build order: loot-core build:browser -> web build -> sync-server build"
    - "IS_GENERIC_BROWSER=1 required for Vite desktop-client build outside Electron context"
    - "ACTUAL_WEB_ROOT auto-resolved via require.resolve('@actual-app/web/package.json')"

key-files:
  created:
    - packages/sync-server/Dockerfile
    - docker-compose.yml
    - .env.example
    - secrets/.gitkeep
    - .dockerignore
  modified:
    - .gitignore

key-decisions:
  - "Single docker-compose.yml for dev and prod (no separate override file)"
  - "Build context is monorepo root so Dockerfile has access to all workspaces"
  - "ACTUAL_WEB_ROOT not hardcoded - auto-resolved via require.resolve in load-config.js"
  - "Temporary RSA key generated in secrets/ for initial Docker startup without real EB credentials"
  - "upstream/main branch name (not upstream/master) matches remote master branch as local tracking branch"

patterns-established:
  - "[eb] tag pattern: every fork-custom commit includes [eb] in message for easy upstream diff"
  - "secrets/ directory: gitignored, bind-mounted into container at /run/secrets/"
  - "Monorepo Docker build order: always build loot-core browser bundle before desktop-client Vite build"

requirements-completed: [FOUND-01, FOUND-02, FOUND-04]

# Metrics
duration: ~2h
completed: 2026-02-18
---

# Phase 1 Plan 01: Foundation and Fork Setup Summary

**Actual Budget v26.2.0 upstream code pulled into fork, running in Docker at localhost:5006 with [eb] commit convention and secrets mount established**

## Performance

- **Duration:** ~2h
- **Started:** 2026-02-18
- **Completed:** 2026-02-18
- **Tasks:** 3 (2 auto + 1 human-verify)
- **Files modified:** 6

## Accomplishments

- Upstream Actual Budget monorepo merged into fork with upstream remote and upstream/main tracking branch configured
- Custom Dockerfile builds the full monorepo (loot-core browser bundle, desktop-client Vite app, sync-server TypeScript) and runs the app at localhost:5006
- App verified in Chrome: UI loads, budget creation works, app is fully functional

## Task Commits

Each task was committed atomically:

1. **Task 1: Pull upstream Actual Budget code and establish fork hygiene** - `b6246e6` (chore)
2. **Task 2: Create sync-server Dockerfile and docker-compose.yml, build and run** - `b91da5d` (feat)
3. **Task 3: Verify app accessible in Chrome and budget creation works** - user-verified checkpoint (no code commit)

**Dockerfile fixes (post-plan deviations):**

- `e7b0b82` - fix: set IS_GENERIC_BROWSER=1 for Vite web build
- `750b8f4` - fix: add loot-core browser build step to Dockerfile

## Files Created/Modified

- `packages/sync-server/Dockerfile` - Multi-stage build: installs Corepack/Yarn, builds loot-core browser bundle, builds desktop-client (Vite), builds sync-server (tsc), runs node on build/app.js
- `docker-compose.yml` - Single-file compose with sync-server service, named volume for data, bind mount for RSA key, env var pass-through for Enable Banking config
- `.env.example` - Documents all Enable Banking configuration variables with explanatory comments
- `.gitignore` - Extended with secrets/, .env, .env.sandbox, .env.production, .vscode/
- `secrets/.gitkeep` - Placeholder so gitignored secrets/ directory exists in the repo
- `.dockerignore` - Excludes node_modules, .git, secrets from Docker build context (not in original plan - added for correctness)

## Decisions Made

- Single docker-compose.yml (not dev + prod override) per locked decision from CONTEXT.md
- Build context set to monorepo root so Dockerfile can reach all workspace packages
- ACTUAL_WEB_ROOT left to auto-resolve via `require.resolve('@actual-app/web/package.json')` rather than hardcoding a path - more robust against upstream refactors
- Temporary RSA key (`openssl genrsa`) placed in secrets/ for initial Docker startup without real Enable Banking credentials

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing loot-core browser build step in Dockerfile**

- **Found during:** Task 2 (Docker build and run)
- **Issue:** The desktop-client Vite build imports from `@actual-app/loot-core/browser` which requires a prior `yarn workspace @actual-app/loot-core build:browser` step. Without it, the Vite build fails with missing module errors.
- **Fix:** Added `RUN yarn workspace @actual-app/loot-core build:browser` before the desktop-client build step in the Dockerfile.
- **Files modified:** packages/sync-server/Dockerfile
- **Verification:** `docker compose build` completed with exit 0, `curl http://localhost:5006` returned 200
- **Committed in:** `750b8f4` (fix commit after Task 2)

**2. [Rule 1 - Bug] IS_GENERIC_BROWSER=1 missing from Vite web build**

- **Found during:** Task 2 (Docker build and run)
- **Issue:** The desktop-client Vite build runs in a Node.js/Docker context, not a browser or Electron context. Without `IS_GENERIC_BROWSER=1`, the build uses Electron-specific code paths that fail in a generic browser environment.
- **Fix:** Added `ENV IS_GENERIC_BROWSER=1` to the Dockerfile before the `yarn workspace @actual-app/web build` step.
- **Files modified:** packages/sync-server/Dockerfile
- **Verification:** Vite build completed without Electron errors, app served correct HTML
- **Committed in:** `e7b0b82` (fix commit after Task 2)

**3. [Rule 2 - Missing Critical] Added .dockerignore file**

- **Found during:** Task 2 (Dockerfile creation)
- **Issue:** Without a .dockerignore, Docker copies node_modules and .git into the build context, causing very slow builds and potentially leaking git history into the image.
- **Fix:** Created `.dockerignore` excluding node_modules, .git, secrets/, .env files, and IDE directories.
- **Files modified:** .dockerignore (created)
- **Verification:** Build context size reduced significantly
- **Committed in:** `b91da5d` (part of Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2 Rule 1 bugs, 1 Rule 2 missing critical)
**Impact on plan:** All three fixes were necessary for a working Docker build. The plan's Dockerfile description captured the correct final structure but missed two build-chain requirements that the upstream's own build scripts handle automatically. No scope creep.

## Issues Encountered

- The plan noted that `ACTUAL_WEB_ROOT` auto-resolves via `require.resolve('@actual-app/web/package.json')`. This is correct but requires the `loot-core build:browser` step to complete first, since the web package imports loot-core browser modules. The dependency chain (loot-core browser -> web build -> sync-server start) is the critical discovery for future Dockerfile maintenance.

## User Setup Required

None - no external service configuration required for this plan. The Enable Banking sandbox credentials are a prerequisite for Plan 02.

## Next Phase Readiness

- Ready for Plan 02: Enable Banking API client (the running Docker stack is the foundation)
- Prerequisite reminder: Create Enable Banking sandbox account at enablebanking.com/cp and download RSA keypair before starting Plan 02
- The temporary RSA key in secrets/ must be replaced with the real sandbox key before Plan 02 testing

---

_Phase: 01-foundation-and-api-client_
_Completed: 2026-02-18_
