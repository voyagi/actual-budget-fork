# Contributing to Actual Budget

Thank you for your interest in contributing to Actual Budget. This guide covers everything you need to get started developing locally.

For additional context and discussion, see the upstream contributing docs at [actualbudget.org/docs/contributing](https://actualbudget.org/docs/contributing/).

## Prerequisites

| Tool    | Version    | Notes                                                      |
| ------- | ---------- | ---------------------------------------------------------- |
| Node.js | >= 22      | An `.nvmrc` file is provided; run `nvm use` if you use nvm |
| Yarn    | 4.10.3     | Managed via Corepack (see below)                           |
| Git     | any recent | Husky git hooks are installed automatically                |

**Enable Corepack** (ships with Node 22):

```sh
corepack enable
```

This activates the exact Yarn version declared in `package.json` (`packageManager` field). You do not need to install Yarn separately.

## Getting Started

```sh
# Clone the repository
git clone git@github.com:actualbudget/actual.git
cd actual

# Install dependencies (Corepack picks up the correct Yarn version)
yarn install

# Start the app in browser mode
yarn start
```

The browser client will be available at `http://localhost:5006` by default (the frontend dev server runs on port 3001 and proxies to the backend).

### Other Start Commands

| Command                | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `yarn start`           | Alias for `yarn start:browser`                                     |
| `yarn start:browser`   | Runs the full browser stack (backend + frontend + plugins service) |
| `yarn start:desktop`   | Builds dependencies and runs the Electron desktop app              |
| `yarn start:server`    | Runs only the sync server                                          |
| `yarn start:storybook` | Launches the component library Storybook                           |
| `yarn start:docs`      | Starts the Docusaurus documentation site locally                   |

## Package Overview

This is a monorepo managed by Yarn 4 workspaces. All packages live under `packages/`.

| Package                | Name on npm               | Description                                                    |
| ---------------------- | ------------------------- | -------------------------------------------------------------- |
| `api`                  | `@actual-app/api`         | Public Node.js API for Actual                                  |
| `component-library`    | `@actual-app/components`  | Shared React components, icons, and hooks (includes Storybook) |
| `crdt`                 | `@actual-app/crdt`        | CRDT synchronization layer                                     |
| `desktop-client`       | `@actual-app/web`         | React frontend (web and Electron renderer)                     |
| `desktop-electron`     | `desktop-electron`        | Electron shell for the desktop app                             |
| `loot-core`            | `loot-core`               | Core business logic, database, syncing, and budgeting engine   |
| `sync-server`          | `@actual-app/sync-server` | Node.js server for multi-device sync                           |
| `plugins-service`      | `plugins-service`         | Service worker that manages bank-sync plugins                  |
| `docs`                 | (private)                 | Docusaurus documentation site                                  |
| `ci-actions`           | (private)                 | Custom GitHub Actions used in CI                               |
| `eslint-plugin-actual` | (private)                 | Project-specific ESLint rules                                  |

## Development Workflows

### Running Tests

```sh
# Run all unit tests across the monorepo (uses lage task runner)
yarn test

# Run tests without cache (useful for debugging)
yarn test:debug

# Run end-to-end tests (Playwright, browser mode)
yarn e2e

# Run end-to-end tests (Playwright, desktop/Electron mode)
yarn e2e:desktop

# Run visual regression tests
yarn vrt

# Run VRT inside Docker (for consistent cross-platform screenshots)
yarn vrt:docker
```

Unit tests use **Vitest**. End-to-end and visual regression tests use **Playwright**.

### Linting and Formatting

The project uses **oxlint** for linting and **oxfmt** for formatting.

```sh
# Check formatting and lint
yarn lint

# Auto-fix formatting and lint issues
yarn lint:fix
```

A **Husky pre-commit hook** runs `lint-staged` automatically, which applies `oxfmt` and `oxlint --fix` to staged files. You generally do not need to run lint manually before committing.

### Type Checking

```sh
yarn typecheck
```

This runs both the standard TypeScript compiler (`tsc --incremental`) and `tsc-strict`, which uses the `typescript-strict-plugin` for incremental strictness adoption (see Code Style below).

### Building

```sh
# Build the full browser bundle (frontend + backend)
yarn build:browser

# Build the sync server
yarn build:server

# Build the desktop app
yarn build:desktop

# Build the public API package
yarn build:api

# Build the documentation site
yarn build:docs
```

### Docker

A `docker-compose.yml` is provided at the repository root. This is useful for running the sync server or for a consistent development environment.

## Code Style

### TypeScript

- The codebase is TypeScript-first. New files should be `.ts` or `.tsx`.
- Strict mode is being adopted incrementally via the `typescript-strict-plugin`. The plugin enforces strict checking on files that do **not** contain the `@ts-strict-ignore` comment at the top.
- **New files**: do not add `@ts-strict-ignore`. Write strict-compliant TypeScript from the start.
- **Existing files with `@ts-strict-ignore`**: if you are making substantial changes to such a file, consider removing the comment and fixing the type errors. Small drive-by fixes are welcome too, but this is not required for every PR.

### Formatting and Lint Rules

- oxfmt handles all formatting. Run `yarn lint:fix` and move on.
- oxlint with `--type-aware` is the primary linter. Fix warnings before submitting.

### General Conventions

- Prefer `const` over `let`. Never use `var`.
- Use named exports rather than default exports.
- Use `async`/`await` instead of `.then()` chains.
- Write descriptive variable names. Single-letter names are acceptable only for loop indices.
- Error messages should describe what went wrong, why, and what the user can try.

## Commit Conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Each commit message should follow this format:

```text
type(scope): short description
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `ci`, `perf`, `build`

**Rules**:

- Use imperative mood ("add feature", not "added feature")
- Lowercase, no trailing period
- Keep the subject line under 72 characters
- Scope is optional but encouraged (e.g., `fix(budget): correct rollover calculation`)
- Breaking changes: append `!` after the type/scope (e.g., `feat(api)!: remove v1 endpoints`)

The pre-commit hook will auto-format and lint your staged files. If the hook fails, fix the reported issues before committing.

## Pull Request Process

1. **Fork and branch.** Create a feature branch from `master` (e.g., `fix/rollover-bug` or `feat/dark-mode-toggle`). Do not commit directly to `master`.

2. **Keep PRs focused.** One logical change per pull request. If your work involves both a refactor and a new feature, split them into separate PRs.

3. **Write or update tests.** If you are fixing a bug, add a test that reproduces it. If you are adding a feature, cover the main paths with unit or e2e tests.

4. **Run the checks locally** before pushing:

   ```sh
   yarn lint
   yarn typecheck
   yarn test
   ```

5. **Describe your changes** in the PR description. Explain what changed and why. Link to any relevant issue.

6. **Be responsive to review feedback.** Maintainers may request changes. Push follow-up commits rather than force-pushing so reviewers can see the delta.

7. **CI must pass.** The CI pipeline runs linting, type checking, unit tests, e2e tests, and visual regression tests. All checks must be green before merge.

## Internationalization (i18n)

If you add or change user-facing strings in the desktop client, regenerate the i18n files:

```sh
yarn generate:i18n
```

## Where to Find More Information

- **Upstream contributing docs**: [actualbudget.org/docs/contributing](https://actualbudget.org/docs/contributing/)
- **Issue tracker**: [github.com/actualbudget/actual/issues](https://github.com/actualbudget/actual/issues/)
- **Component library**: run `yarn start:storybook` to browse available components
- **API documentation**: see the `packages/api` README and types
- **Discord**: the Actual Budget community Discord is linked from the main website
