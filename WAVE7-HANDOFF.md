# Handoff: Wave 7 - Long-Term Tech Debt (8-Agent Team)

**Created:** 2026-02-23
**Branch:** `chore/techdebt-remediation`
**Last commit:** `7770034bc` (docs: update execution summary with wave 6 results)
**Working tree:** Clean

## Goal

Execute all 7+1 Wave 7 findings from TECHDEBT-PLAN.md plus the deferred
#11 from Wave 6, using a team of 8 parallel agents. Each agent owns one
finding and commits independently.

## Completed Work (Waves 1-6)

23 findings fixed across 6 waves. See TECHDEBT-PLAN.md Execution Summary
for full details. All committed and pushed to `chore/techdebt-remediation`.

## Pre-Existing TypeScript Errors (10 total, do NOT count as regressions)

These errors exist BEFORE wave 7 starts. Agents must not introduce new
errors but should not block on these:

1. `App.tsx:165,243` - FallbackProps type mismatch (react-error-boundary)
2. `RouteErrorBoundary.tsx:44` - Same FallbackProps issue (wave 5 addition)
3. `EnableBankingExternalMsgModal.tsx:157` - `.message` on `{}`
4. `app-enablebanking.ts:261` - Expected 3 args, got 2
5. `enablebanking-service.ts:76,82,112,132,162` - Same 3-args issue (5 sites)

## Agent Assignments

### Agent 1: Finding #11 - Split TransactionsTable.tsx

**Risk: HIGH. Needs visual verification after.**

Split `packages/desktop-client/src/components/transactions/TransactionsTable.tsx`
(3061 lines) into focused modules. Component boundaries at:

| Component                           | Lines     | Extract to                |
| ----------------------------------- | --------- | ------------------------- |
| TransactionHeader + HeaderCell      | 144-484   | TransactionHeader.tsx     |
| StatusCell + PayeeCell + PayeeIcons | 338-832   | TransactionCells.tsx      |
| Transaction (memo)                  | 833-1713  | TransactionRow.tsx        |
| TransactionError                    | 1714-1778 | TransactionError.tsx      |
| NewTransaction                      | 1779-1961 | NewTransaction.tsx        |
| TransactionTableInner               | 1962-2318 | TransactionTableInner.tsx |

Keep in TransactionsTable.tsx: TransactionTable (line 2378, the ONLY
public export), getCategoriesById (line 3050), imports + re-exports.

External consumers (only 2): `TransactionList.tsx` and
`TransactionsTable.test.tsx` import `TransactionTable` and
`TransactionTableProps`.

**Key risk:** PayeeCell needs ~25 imports. Transaction component has
intricate focus/edit closures. Test with `npx tsc --noEmit`.

**Commit:** `refactor(techdebt): wave 7 - split TransactionsTable.tsx (#11)`

### Agent 2: Finding #14 - Migrate sync-server JS to TypeScript

**Scope:** ~80 .js files in `packages/sync-server/src/`

Strategy:

1. Enable `checkJs: true` in `packages/sync-server/tsconfig.json`
2. Convert core infrastructure first: config.js, middleware files, database
3. Convert GoCardless bank adapters last (lowest priority, most files)
4. Add type annotations to function params and return types
5. Run `npx tsc --noEmit` after each batch

Do NOT attempt all 80 files. Focus on the highest-value conversions
(middleware, config, main app entry points). Leave bank adapters as .js
with checkJs catching obvious issues.

**Commit:** `chore(techdebt): wave 7 - sync-server TypeScript migration (#14)`

### Agent 3: Finding #25 - Remove @ts-strict-ignore from critical files

**Scope:** Top 10 priority files (from TECHDEBT-PLAN.md):

1. `packages/loot-core/src/shared/util.ts`
2. `packages/loot-core/src/server/budget/envelope.ts`
3. `packages/loot-core/src/server/budget/tracking.ts`
4. `packages/loot-core/src/server/accounts/sync.ts`
5. `packages/loot-core/src/server/spreadsheet/spreadsheet.ts`
6. `packages/loot-core/src/server/aql/compiler.ts`
7. `packages/loot-core/src/server/sync/index.ts`
8. `packages/loot-core/src/shared/rules.ts`
9. `packages/loot-core/src/shared/schedules.ts`
10. `packages/loot-core/src/server/transactions/transaction-rules.ts`

For each: remove `// @ts-strict-ignore`, fix resulting type errors, verify
with `npx tsc --noEmit`. If a file has too many errors (50+), skip it and
document why. Aim for at least 5 of the 10.

**Commit:** `chore(techdebt): wave 7 - remove @ts-strict-ignore from critical files (#25)`

### Agent 4: Finding #23 - Migrate groupBy to native Object.groupBy

**Prerequisites to check first:**

- Root `tsconfig.json` lib setting must include ES2024
- If not, add it (or upgrade from ES2023)

**Files:**

- `packages/loot-core/src/shared/util.ts`:
  - `groupBy` (line ~102) -> `Map.groupBy()`
  - `groupById` (line ~154) -> `Object.groupBy()`
  - `_groupById` (line ~117) -> `Map.groupBy()` then remove
- Update ALL callers across the monorepo (grep for imports of these functions)
- Keep the old functions as deprecated wrappers if caller count is too high

**Commit:** `refactor(techdebt): wave 7 - migrate groupBy to native Object.groupBy (#23)`

### Agent 5: Finding #6 - Migrate openid-client v5 to v6

**Scope:** Breaking API rewrite in `packages/sync-server/src/`

Key API changes (v5 -> v6):

- `new Issuer()` -> `discovery()` function
- `client.authorizationUrl()` -> `buildAuthorizationUrl()`
- `client.callback()` -> `authorizationCodeGrant()`
- Token refresh API completely different
- v6 uses functional API, not class-based

Steps:

1. Find all openid-client imports: `grep -r "openid-client" packages/sync-server/`
2. Read the v6 migration guide (web search for "openid-client v6 migration")
3. Update package.json dependency
4. Rewrite each usage site
5. Run `yarn install` and `npx tsc --noEmit`

**Commit:** `chore(techdebt): wave 7 - migrate openid-client v5 to v6 (#6)`

### Agent 6: Finding #26 - TODO/FIXME triage

**Scope:** ~55 TODO/FIXME comments across source files.

Steps:

1. `grep -rn "TODO\|FIXME\|HACK\|XXX" packages/*/src/ --include="*.ts" --include="*.tsx" --include="*.js"`
2. Categorize each into:
   - (a) Actionable now - fix it inline
   - (b) Informational / design note - leave as-is
   - (c) Already addressed / stale - remove
3. For (a) items too large to fix: leave the TODO but make it specific
   (what, why, when, who)
4. Remove all (c) stale comments
5. Count results and document

**Commit:** `chore(techdebt): wave 7 - TODO/FIXME triage (#26)`

### Agent 7: Finding #28 - Migrate pikaday to react-aria date picker

**Scope:** `packages/desktop-client/src/components/select/DateSelect.tsx`

This file has:

- Custom keyboard navigation
- Relative date parsing ("today", "+3d", "next month")
- Integration with budget transaction UI
- pikaday dependency for calendar rendering

Steps:

1. Read DateSelect.tsx fully to understand the interface
2. Install `@react-aria/datepicker` and `@react-stately/datepicker`
3. Replace pikaday calendar with react-aria DatePicker
4. Preserve all keyboard shortcuts and relative date parsing
5. Remove pikaday from package.json
6. Run `yarn install` and typecheck

**Key risk:** Custom keyboard nav and relative date parsing must be
preserved exactly. The budget UI depends on these behaviors.

**Commit:** `refactor(techdebt): wave 7 - migrate pikaday to react-aria date picker (#28)`

### Agent 8: Finding #29 - Upgrade react-spring

**Scope:** 7 files use react-spring for animations.

Steps:

1. Find all react-spring imports: `grep -rn "react-spring" packages/desktop-client/src/`
2. Check current version: `react-spring@10.0.3` in package.json
3. The upgrade path: `react-spring` -> `@react-spring/web`
4. Update package.json: remove `react-spring`, add `@react-spring/web`
5. Update all imports in the 7 files
6. Verify API compatibility (animated, useSpring, useTransition)
7. Run `yarn install` and typecheck

**Commit:** `chore(techdebt): wave 7 - upgrade react-spring to @react-spring/web (#29)`

## Coordination Rules

1. **Branch:** All agents work on `chore/techdebt-remediation` (current branch)
2. **No overlapping files:** Assignments are scoped to separate packages/files.
   Only conflict risk: Agent 3 (#25 ts-strict) and Agent 4 (#23 groupBy) both
   touch `packages/loot-core/src/shared/util.ts`. Agent 4 should go first
   (changes function signatures), then Agent 3 (fixes types in same file).
3. **Commit convention:** `type(techdebt): wave 7 - description (#finding)`
4. **Typecheck:** Each agent runs `npx tsc --noEmit` before committing.
   Ignore the 10 pre-existing errors listed above.
5. **Push after commit:** Always push (`git push`) per project convention.
6. **If blocked:** Document the blocker and move on. Don't force risky changes.

## File Conflict Matrix

| Agent   | Package        | Key files                | Conflicts with          |
| ------- | -------------- | ------------------------ | ----------------------- |
| 1 (#11) | desktop-client | TransactionsTable.tsx    | None                    |
| 2 (#14) | sync-server    | _.js -> _.ts             | None                    |
| 3 (#25) | loot-core      | 10 .ts files             | Agent 4 (util.ts)       |
| 4 (#23) | loot-core      | shared/util.ts + callers | Agent 3 (util.ts)       |
| 5 (#6)  | sync-server    | openid-client usage      | Agent 2 (if same files) |
| 6 (#26) | all packages   | scattered TODOs          | Low risk                |
| 7 (#28) | desktop-client | DateSelect.tsx           | None                    |
| 8 (#29) | desktop-client | 7 animation files        | None                    |

**Sequencing constraint:** Agent 4 before Agent 3 on util.ts.
Agent 2 and Agent 5 may touch overlapping sync-server files; coordinate
via commit order (Agent 2 first for .js->.ts renames, Agent 5 after for
openid-client migration).

## Verification

After all agents complete:

1. `npx tsc --noEmit` - should show same 10 pre-existing errors (or fewer)
2. `yarn test` - full test suite
3. `yarn lint` - lint clean
4. Visual testing for #11 (TransactionsTable) and #28 (DateSelect)
