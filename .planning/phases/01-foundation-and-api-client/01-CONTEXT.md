# Phase 1 Context: Foundation and API Client

**Phase goal:** Fork builds and runs in Docker, RSA auth with Enable Banking sandbox verified, fork hygiene established.

**Created:** 2026-02-18
**Source:** User discussion (all 4 gray areas explored)

## Decisions

### Fork Visual Identity

| Decision                              | Choice                                                      |
| ------------------------------------- | ----------------------------------------------------------- |
| App title (browser tab, PWA manifest) | Keep stock "Actual" - no changes                            |
| About/Settings page                   | Add fork info: version, Enable Banking status, link to repo |
| Favicon and app icons                 | Keep stock icons (revisit in Phase 4 PWA)                   |
| Runtime EB status indicator           | Not in Phase 1 - UI indicators belong in Phase 2            |

**Rationale:** Minimal fork surface area. The About page addition provides discoverability without disrupting the stock experience.

### Development Workflow

| Decision              | Choice                                                                  |
| --------------------- | ----------------------------------------------------------------------- |
| Dev mode              | Hybrid: desktop-client runs locally (hot reload), sync-server in Docker |
| Local toolchain       | Node.js installed. Yarn availability needs verification at setup time   |
| Server reload         | Auto-restart on save (nodemon or similar inside Docker)                 |
| Docker Compose config | Single docker-compose.yml for both dev and prod, toggled via env vars   |

**Rationale:** Hybrid approach gives fast UI iteration locally while keeping the sync-server (where EB code lives) in a Docker environment matching production. Auto-restart minimizes friction during API client development.

**Note:** Verify yarn is installed locally before starting. If not, install it or check if Actual uses a different package manager.

### Configuration Layout

| Decision                     | Choice                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------- |
| RSA key location             | `secrets/eb_private.pem` (gitignored `secrets/` directory)                    |
| Other EB config              | `.env` file at repo root (app_id, environment, API URLs)                      |
| Sandbox vs production toggle | All in `.env` - swap values or use `.env.sandbox`/`.env.production`           |
| Template file                | Both: `.env.example` committed to git AND documented in README                |
| Docker secret mounting       | Simple bind mount (`./secrets/eb_private.pem:/run/secrets/eb_private.pem:ro`) |

**Rationale:** PEM files don't belong in .env (binary/multiline). The secrets/ directory handles the key, .env handles everything else. Simple bind mount avoids Docker secrets complexity for a single-user app.

**Gitignore additions required:**

- `secrets/`
- `.env`
- `.env.sandbox`
- `.env.production`

### Upstream Merge Strategy

| Decision            | Choice                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------- |
| Sync frequency      | After each phase completion                                                              |
| Conflict resolution | Case by case (no blanket rule)                                                           |
| Branch model        | Separate `upstream/main` branch mirrors Actual Budget. Merge from there into fork's main |
| Branch naming       | Standard naming (`feat/`, `fix/`, `chore/`). The `[eb]` commit prefix is sufficient      |

**Rationale:** Phase boundaries are natural merge points since you're not mid-feature. Separate upstream branch keeps a clean reference of stock Actual Budget for comparison and cherry-picking.

**Setup required in Phase 1:**

- Add upstream remote: `git remote add upstream <actual-budget-repo-url>`
- Create and push `upstream/main` branch tracking the upstream repo
- Document the merge workflow in README or CONTRIBUTING.md

## Deferred Ideas

None raised during discussion.

## Constraints for Downstream Agents

These decisions are **locked** - researcher and planner should not revisit them:

1. **No app rebranding** - stock title, stock icons. Only the About page gets fork info.
2. **Hybrid dev mode** - desktop-client local, sync-server Docker. Plan accordingly.
3. **secrets/ + .env pattern** - RSA key as file, everything else in .env. No Docker secrets feature.
4. **Simple bind mount** for the PEM file into the container.
5. **Single docker-compose.yml** - no separate dev/prod compose files.
6. **Auto-restart** for sync-server in Docker (nodemon or equivalent).
7. **Standard branch names** - no `eb/` prefix convention.
8. **Upstream sync after each phase** - not during phases.

## Open for Researcher/Planner to Decide

- Exact nodemon/watch configuration for sync-server in Docker
- Whether Actual uses yarn, npm, or pnpm (verify from repo)
- Specific .env variable names and structure
- Docker base image selection
- About page implementation approach (new component vs modifying existing)
