# Actual Budget Fork

## Design Skills (MANDATORY)

When working on UI, styling, or visual changes, invoke the installed
design plugins instead of making changes manually:

- `/impeccable:critique` - before starting any redesign or major visual rework
- `/impeccable:polish` - after completing visual changes (pre-ship pass)
- `/impeccable:audit` - for accessibility, performance, and responsive checks

These are globally installed plugins. Use them, don't reinvent their guidance.

## Discovered Patterns

- `oxfmt --check .` fails on 347+ pre-existing upstream files. Scope formatting to fork files only: `npx oxfmt --check packages/sync-server/src/app-enablebanking/ packages/sync-server/src/scheduler.ts packages/desktop-client/src/components/FinancesApp.tsx packages/desktop-client/src/hooks/useEnableBankingStatus.ts packages/loot-core/src/server/accounts/provider-status.ts`
- GOALS.md measurement commands must be scoped to fork files only. Upstream issues (358 oxfmt, 317+ knip exports) make unscoped checks permanently fail, wasting evolve cycles.
- `npx knip` needs fork-aware ignore patterns before its GOALS.md entry is useful. Current upstream noise: 317 unused exports, 27 unlisted deps, 18 unused devDeps.
