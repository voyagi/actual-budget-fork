# Project Goals

## Goal: Formatting passes (oxfmt)

- **measure**: `npx oxfmt --check packages/sync-server/src/app-enablebanking/ packages/sync-server/src/scheduler.ts packages/desktop-client/src/components/ConsentExpiryBanner.tsx packages/desktop-client/src/components/FinancesApp.tsx packages/desktop-client/src/hooks/useEnableBankingStatus.ts packages/loot-core/src/server/accounts/provider-status.ts`
- **check**: exit code 0
- **weight**: 2
- **note**: Scoped to fork files only. Upstream has 358 pre-existing format issues.

## Goal: Typecheck passes

- **measure**: `npm run typecheck`
- **check**: exit code 0
- **weight**: 3

## Goal: Tests pass

- **measure**: `npm test`
- **check**: exit code 0
- **weight**: 3

## Goal: No dead code (knip)

- **measure**: `npx knip`
- **check**: exit code 0
- **weight**: 1
