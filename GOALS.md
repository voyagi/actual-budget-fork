# Project Goals

These are split into fast local fitness goals that `/evolve` can run
regularly, plus deeper CI/release checks that are intentionally listed outside
the `## Goal:` format so they do not slow every evolve cycle.

## Fast Local Fitness

## Goal: Formatting passes (oxfmt)

- **measure**: `yarn format:fork`
- **check**: exit code 0
- **weight**: 2
- **note**: Scoped to fork files only. Upstream has 358 pre-existing format issues.

## Goal: Typecheck passes

- **measure**: `yarn typecheck`
- **check**: exit code 0
- **weight**: 3

## Goal: Tests pass

- **measure**: `yarn test`
- **check**: exit code 0
- **weight**: 3

## Goal: Knip baseline does not regress

- **measure**: `yarn knip:baseline`
- **check**: exit code 0
- **weight**: 1
- **note**: Baselines known upstream/fork noise and fails only when a category grows. Use `yarn knip:report` for the full informational report.

## Goal: Fork coverage target passes

- **measure**: `yarn coverage:fork`
- **check**: exit code 0
- **weight**: 2
- **note**: Runs sync-server coverage scoped to Enable Banking and fork operational files only.

## Deep CI / Release Checks

These are important but intentionally not normal `/evolve` goals yet:

- Browser/server build: `yarn build:server`
- Web E2E: `yarn e2e`
- Visual regression: `yarn vrt`
- Security scan: `trivy fs . --severity HIGH,CRITICAL --exit-code 1`
- Full dead-code report: `yarn knip:report`
