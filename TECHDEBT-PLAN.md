# Tech Debt Remediation Plan

Comprehensive plan to fix 31 tech debt findings across the Actual Budget
monorepo. Organized into 7 execution waves ordered by risk (lowest first)
and dependency constraints. Each wave can be committed independently.

**Branch:** `chore/techdebt-remediation`
**Commit convention:** `chore(techdebt): wave N - description`

---

## Wave 1: Zero-Risk Quick Wins

All changes are comment-only or trivial. No runtime behavior changes.
Can all be done in parallel and committed together.

### Finding #4: Remove misleading userId TODO

**File:** `packages/loot-core/src/types/prefs.ts` line 69

```diff
- userId: string; // TODO: delete this (unused)
+ userId: string;
```

`userId` IS actively used in `packages/loot-core/src/server/budgetfiles/app.ts`
line 536 and `packages/desktop-client/src/components/settings/index.tsx` line 168.

### Finding #31: Add rollup pin comment

**File:** `package.json` (root), in the `resolutions` block

```diff
  "resolutions": {
+   "//rollup": "Pinned to deduplicate vite's nested rollup versions (see PR #2369, #4943)",
    "rollup": "4.40.1",
```

### Finding #24: Remove 2 unused exports

**File 1:** `packages/loot-core/src/shared/environment.ts` line 1

```diff
- export function isPreviewEnvironment() {
+ function isPreviewEnvironment() {
```

Keep the function (called internally by `isNonProductionEnvironment`), just
remove the `export`.

**File 2:** `packages/loot-core/src/server/db/mappings.ts` lines 57-59

Delete the entire `getMapping` function:
```diff
- export function getMapping(id) {
-   return allMappings.get(id) || null;
- }
```

Zero imports across the monorepo. Trivial to re-add if ever needed.

### Finding #3: Fix crdt workspace reference

**File:** `packages/sync-server/package.json` line 31

```diff
- "@actual-app/crdt": "2.1.0",
+ "@actual-app/crdt": "workspace:^",
```

Other consumers (`api`, `loot-core`) already use `workspace:^`. The pinned
version happens to resolve today but will break on the next crdt version bump.

**Post-change:** Run `yarn install` to update yarn.lock.

**Commit:** `chore(techdebt): wave 1 - zero-risk quick wins (#3, #4, #24, #31)`

---

## Wave 2: Low-Risk Small Changes

Small code removals and replacements. Each changes runtime behavior trivially.
Can all be done in parallel.

### Finding #5: Remove dead node-fetch polyfill

**File 1:** `packages/api/index.ts`

Remove the type import (lines 1-4):
```diff
- import type {
-   RequestInfo as FetchInfo,
-   RequestInit as FetchInit,
- } from 'node-fetch';
```

Remove the conditional polyfill block (lines 28-34):
```diff
- if (!globalThis.fetch) {
-   globalThis.fetch = (url: URL | RequestInfo, init?: RequestInit) => {
-     return import('node-fetch').then(({ default: fetch }) =>
-       fetch(url as unknown as FetchInfo, init as unknown as FetchInit),
-     ) as unknown as Promise<Response>;
-   };
- }
```

**File 2:** `packages/api/package.json` - Remove `node-fetch` from dependencies:
```diff
  "dependencies": {
    "@actual-app/crdt": "workspace:^",
    "better-sqlite3": "^12.6.2",
    "compare-versions": "^6.1.1",
-   "node-fetch": "^3.3.2",
    "uuid": "^13.0.0"
  },
```

**Post-change:** `yarn install` + `yarn workspace @actual-app/api test`

### Finding #22: Replace flatten2 with .flat()

**File 1:** `packages/loot-core/src/server/budget/util.ts` - Delete flatten2:
```diff
- export function flatten2(arr) {
-   return Array.prototype.concat.apply([], arr);
- }
```

**File 2:** `packages/loot-core/src/server/budget/envelope.ts` line 9 - Update import:
```diff
- import { flatten2, number, sumAmounts, unflatten2 } from './util';
+ import { number, sumAmounts, unflatten2 } from './util';
```

Same file, line 131 - Replace call:
```diff
-   dependencies: flatten2(
-     expenseCategories.map(cat => [
-       `${prevSheetName}!leftover-${cat.id}`,
-       `${prevSheetName}!carryover-${cat.id}`,
-     ]),
-   ),
+   dependencies: expenseCategories
+     .map(cat => [
+       `${prevSheetName}!leftover-${cat.id}`,
+       `${prevSheetName}!carryover-${cat.id}`,
+     ])
+     .flat(),
```

Same file, line 164 - Same pattern:
```diff
-   dependencies: flatten2(
-     incomeCategories.map(c => [
-       `${sheetName}!sum-amount-${c.id}`,
-       `${sheetName}!carryover-${c.id}`,
-     ]),
-   ),
+   dependencies: incomeCategories
+     .map(c => [
+       `${sheetName}!sum-amount-${c.id}`,
+       `${sheetName}!carryover-${c.id}`,
+     ])
+     .flat(),
```

Same file, line 316 - Remove no-op flatten2 (input is already flat):
```diff
-           flatten2([
-             `${sheetName}!sum-amount-${id}`,
-             `${sheetName}!carryover-${id}`,
-           ]),
+           [
+             `${sheetName}!sum-amount-${id}`,
+             `${sheetName}!carryover-${id}`,
+           ],
```

**File 3:** `packages/loot-core/src/server/transactions/transaction-rules.test.ts`
line 844:
```diff
-     return Array.prototype.concat.apply([], arr);
+     return arr.flat();
```

### Finding #30: Replace md5 with crypto.createHash

**File 1:** `packages/loot-core/src/server/update.ts`

```diff
- import md5 from 'md5';
+ import { createHash } from 'crypto';
```

Line 23:
```diff
- const currentHash = md5(views);
+ const currentHash = createHash('sha256').update(views).digest('hex');
```

**File 2:** `packages/loot-core/package.json` - Remove md5 dependency:
```diff
-   "md5": "^2.3.0",
```

Note: Changing the hash algorithm means views will be re-created one time on
next startup (harmless, the new hash gets stored in `__meta__`).

**Post-change:** `yarn install` + `yarn workspace loot-core test`

### Finding #19: Move html-to-image to correct package

**File 1:** `package.json` (root) - Remove from root devDependencies:
```diff
-   "html-to-image": "^1.11.13",
```

**File 2:** `packages/desktop-client/package.json` - Add to devDependencies:
```diff
  "devDependencies": {
+   "html-to-image": "^1.11.13",
```

**Post-change:** `yarn install`

**Commit:** `chore(techdebt): wave 2 - low-risk removals (#5, #19, #22, #30)`

---

## Wave 3: Low-Risk Targeted Fixes

Slightly larger scope but still low risk. Can be done in parallel.

### Finding #17: Fix FIXME/TODO comments in app-sync.ts

**File:** `packages/sync-server/src/app-sync.ts`

**Fix 1 (line 61):** Change 400 to 404 for FileNotFound.
Search `packages/loot-core/src/server/` for `status === 400` in sync callers
first. If safe:
```diff
- res.status(400).send({ status: 'error', reason: 'file-not-found' });
+ res.status(404).send({ status: 'error', reason: 'file-not-found' });
```
Remove the FIXME comment.

**Fix 2 (lines 204, 299):** These header type guards are actually correct
(Express headers CAN be arrays). Replace FIXME with explanatory comment:
```diff
- // FIXME: Not sure how this cannot be a string when the header is set.
+ // Express headers can be string | string[] | undefined. Type guard required.
```

**Fix 3 (line 358):** Uncomment the 422 validation for missing fileId:
```diff
- // TODO: Return 422 if fileId is not provided.
+ if (!fileId) {
+   res.status(422).send({ status: 'error', reason: 'file-id-required' });
+   return;
+ }
```
Verify frontend callers of `get-user-file-info` handle 422.

**Fix 4 (line 381):** Convert deleted to boolean:
```diff
- deleted: boolToInt(file.deleted),
+ deleted: !!file.deleted,
```
Search frontend for `deleted === 1` or `=== 0` and update to truthy/falsy.

### Finding #12: Extract sync-events.ts switch cases

**New file:** `packages/desktop-client/src/sync-event-handlers.ts`

Create a handler type and lookup table:
```ts
type SyncErrorContext = {
  event: SyncErrorEvent;
  store: AppStore;
  queryClient: QueryClient;
  learnMore: string;
  githubIssueLink: string;
  attemptedSyncRepair: boolean;
  setAttemptedSyncRepair: (v: boolean) => void;
};

type SyncErrorHandlerResult = {
  notification: Notification | null;
  sideEffect?: () => void;
};

// One named function per case
export function handleOutOfSync(ctx: SyncErrorContext): SyncErrorHandlerResult { ... }
export function handleFileOldVersion(ctx: SyncErrorContext): SyncErrorHandlerResult { ... }
// ... etc for each of the 13 cases

export const syncErrorHandlers: Record<string, SyncErrorHandler> = {
  'out-of-sync': handleOutOfSync,
  'file-old-version': handleFileOldVersion,
  'file-key-mismatch': handleFileKeyMismatch,
  'file-not-found': handleFileNotFound,
  'file-needs-upload': handleFileNeedsUpload,
  'file-has-reset': handleFileHasReset,
  'file-has-new-key': handleFileHasReset,
  'encrypt-failure': handleEncryptFailure,
  'decrypt-failure': handleEncryptFailure,
  'invalid-schema': handleInvalidSchema,
  'apply-failure': handleApplyFailure,
  'network': () => ({ notification: null }),
  'clock-drift': handleClockDrift,
  'token-expired': handleTokenExpired,
};
```

**Modified file:** `packages/desktop-client/src/sync-events.ts`

Replace the 300-line switch block with:
```ts
import { syncErrorHandlers, handleUnknownError } from './sync-event-handlers';

const handler = syncErrorHandlers[event.subtype] ?? handleUnknownError;
const result = handler(ctx);
if (result.sideEffect) result.sideEffect();
if (result.notification) {
  store.dispatch(addNotification({ notification: { type: 'error', ...result.notification } }));
}
```

### Finding #20: Remove ~257 unused v1 icon components

**Step 1:** Write a temporary script to find used icons:
- Grep all `import.*from.*icons/v1` across packages/*/src/
- Extract icon names from imports
- Compare against exports in `packages/component-library/src/icons/v1/index.ts`
- Output list of unused icon names

**Step 2:** Remove unused re-exports from `packages/component-library/src/icons/v1/index.ts`

**Step 3:** Delete the ~257 unused `.tsx` icon component files from
`packages/component-library/src/icons/v1/`

**Step 4:** Verify with `yarn build` and full test suite.

**Used icons (54):** SvgAdd, SvgArrowDown, SvgArrowLeft, SvgArrowThickDown,
SvgArrowThickRight, SvgArrowThickUp, SvgArrowThinLeft, SvgArrowThinRight,
SvgArrowUp, SvgBookmark, SvgCalculator, SvgCalendar, SvgCamera, SvgChart,
SvgChartArea, SvgChartBar, SvgChartPie, SvgCheckmark, SvgCheveronDown,
SvgCheveronLeft, SvgCheveronRight, SvgCheveronUp, SvgClose, SvgCloudCheck,
SvgCloudDownload, SvgCode, SvgCog, SvgCopy, SvgCreditCard,
SvgDotsHorizontalTriple, SvgEquals, SvgExclamationOutline, SvgExclamationSolid,
SvgFileDouble, SvgFilter, SvgInformationOutline, SvgLibrary, SvgLightBulb,
SvgListBullet, SvgLockOpen, SvgPiggyBank, SvgPin, SvgQuestion, SvgQueue,
SvgRefresh, SvgReports, SvgStoreFront, SvgSubtract, SvgTag, SvgTrash,
SvgTuning, SvgUser, SvgUserGroup, SvgWallet

### Finding #27: Migrate jsverify to fast-check

**File 1:** `packages/loot-core/src/server/sync/sync.property.test.ts`

This is the ONLY file using jsverify. Migrate to fast-check (already in
package.json). The test uses `jsc.forall`, `jsc.nat`, `jsc.bool` - these map to
`fc.assert(fc.property(...))`, `fc.nat()`, `fc.boolean()`.

**File 2:** `packages/loot-core/package.json` - Remove jsverify:
```diff
-   "jsverify": "^0.8.4",
```

**Post-change:** `yarn install` + run the specific test file to verify.

**Commit:** `chore(techdebt): wave 3 - targeted fixes (#12, #17, #20, #27)`

---

## Wave 4: Deduplication

Medium-risk changes that consolidate duplicate code. Order matters within
this wave because #2 and #1 share the sync-server utils.

### Finding #2: Deduplicate amountToInteger

**Strategy:** Have sync-server import from loot-core's shared util.

**File:** `packages/sync-server/src/app-gocardless/utils.js`

```diff
- export const amountToInteger = n => Math.round(n * 100);
+ export { amountToInteger } from 'loot-core/src/shared/util';
```

Check: Does sync-server have loot-core as a dependency? If not, add
`"loot-core": "workspace:^"` to sync-server's package.json.

**All 14+ bank adapter files** that import from `../utils.js` continue to work
unchanged since the re-export preserves the same API.

### Finding #1: Consolidate title module

**Strategy:** Delete the sync-server copy, import from loot-core.

**Step 1:** Verify sync-server has loot-core as a workspace dependency (done
in #2 above).

**Step 2:** In `packages/sync-server/src/util/payee-name.js`, update import:
```diff
- import title from './title/index.js';
+ import { title } from 'loot-core/src/server/accounts/title/index';
```

**Step 3:** Delete `packages/sync-server/src/util/title/` directory (3 files:
index.js, lower-case.js, specials.js).

**Step 4:** Run sync-server tests.

### Finding #8: Parameterize calculateStartingBalance

**Strategy:** Add a `preferredBalanceType` parameter to the base method in
`integration-bank.js`. Adapters call with their preferred type instead of
overriding the entire method.

**File:** `packages/sync-server/src/app-gocardless/banks/integration-bank.js`

Add a new helper method:
```js
calculateStartingBalanceFromType(
  sortedTransactions,
  balances,
  preferredBalanceTypes = ['interimAvailable', 'closingBooked', 'expected'],
) {
  const currentBalance = balances.find(b =>
    preferredBalanceTypes.includes(b.balanceType),
  ) ?? balances[0];

  return sortedTransactions.reduce(
    (total, trans) => total - amountToInteger(trans.transactionAmount.amount),
    amountToInteger(currentBalance.balanceAmount.amount),
  );
}
```

**Each of 14+ adapter files:** Replace the overridden `calculateStartingBalance`
with a call to the base helper. Example for `sandboxfinance_sfin0000.js`:

```diff
- calculateStartingBalance(sortedTransactions, balances) {
-   const currentBalance = balances.find(
-     (b) => 'interimAvailable' === b.balanceType,
-   );
-   return sortedTransactions.reduce(
-     (total, trans) =>
-       total - amountToInteger(trans.transactionAmount.amount),
-     amountToInteger(currentBalance.balanceAmount.amount),
-   );
- }
+ calculateStartingBalance(sortedTransactions, balances) {
+   return Fallback.calculateStartingBalanceFromType(
+     sortedTransactions,
+     balances,
+     ['interimAvailable'],
+   );
+ }
```

Adapters that used `balances[0]` call with no type preference (uses fallback).

### Finding #9: Create Sparkasse base adapter

**New file:** `packages/sync-server/src/app-gocardless/banks/sparkasse-base.js`

Extract the shared `normalizeTransaction` logic:
```js
import Fallback from './integration-bank.js';

const SparkasseBase = {
  ...Fallback,

  normalizeTransaction(transaction, _bopioked) {
    const remittanceInformationUnstructured =
      transaction.remittanceInformationUnstructured ??
      transaction.remittanceInformationStructured ??
      transaction.remittanceInformationStructuredArray?.join(' ');

    const usefulCreditorName =
      transaction.ultimateCreditor ||
      transaction.creditorName ||
      transaction.debtorName;

    return {
      ...transaction,
      remittanceInformationUnstructured,
      creditorName: usefulCreditorName,
      debtorName: transaction.debtorName,
    };
  },
};

export default SparkasseBase;
```

Each Sparkassen adapter imports `SparkasseBase` instead of `Fallback` and only
overrides what differs (institutionIds, specific balance type preferences).

### Finding #10: Document GoCardless type divergence

**Strategy:** Full type consolidation is large-scope. For now, document the
divergence with cross-reference comments.

**File 1:** `packages/loot-core/src/types/models/gocardless.ts` - Add header:
```ts
// NOTE: Parallel type definitions exist in sync-server at
// src/app-gocardless/gocardless-node.types.ts
// Keep in sync when modifying. Consolidation tracked as tech debt.
```

**File 2:** `packages/sync-server/src/app-gocardless/gocardless-node.types.ts`
Add matching cross-reference.

**Fix the known divergence:** `creditorAccount` type in loot-core should match
sync-server's `string | { iban?: string }`.

**Commit:** `chore(techdebt): wave 4 - code deduplication (#1, #2, #8, #9, #10)`

---

## Wave 5: Architecture Fixes

Medium-risk structural improvements. Can be done in parallel across packages.

### Finding #15: Convert Enable Banking to TypeScript

**Files to convert** (all in `packages/sync-server/src/app-enablebanking/`):
1. `app-enablebanking.js` -> `app-enablebanking.ts`
2. `enablebanking-service.js` -> `enablebanking-service.ts`
3. `errors.js` -> `errors.ts`

**For each file:**
1. Rename `.js` to `.ts`
2. Add type annotations to function parameters and return types
3. Create proper interfaces for API responses
4. Type the error classes with `errorCode: string` properties

**New types to define** (in `enablebanking-service.ts` or a separate types file):
```ts
interface EnableBankingASPSP {
  name: string;
  country: string;
  logo?: string;
}
interface EnableBankingSession {
  session_id: string;
  status: 'AUTHORIZED' | 'PENDING' | 'FAILED';
  accounts?: EnableBankingAccount[];
}
interface EnableBankingAccount {
  uid: string;
  account_id: string;
  iban?: string;
  name?: string;
  currency?: string;
  balance?: number;
}
```

### Finding #16: Add route-level error boundaries

**File:** `packages/desktop-client/src/components/FinancesApp.tsx`

**Step 1:** Check for existing ErrorBoundary component:
- Search for `ErrorBoundary` in `packages/desktop-client/src/`
- If none exists, check `packages/component-library/src/`

**Step 2:** Create a route-level ErrorBoundary if needed:
```tsx
// packages/desktop-client/src/components/ErrorBoundary.tsx
function RouteErrorFallback({ error, resetErrorBoundary }) {
  return (
    <View style={{ padding: 20, textAlign: 'center' }}>
      <Text>Something went wrong loading this page.</Text>
      <Button onClick={resetErrorBoundary}>Try again</Button>
    </View>
  );
}
```

**Step 3:** Wrap major route groups in FinancesApp.tsx:
```diff
  <Routes>
+   <ErrorBoundary FallbackComponent={RouteErrorFallback}>
      <Route path="/budget" element={<BudgetPage />} />
      <Route path="/budget/:month" element={<BudgetPage />} />
+   </ErrorBoundary>
+   <ErrorBoundary FallbackComponent={RouteErrorFallback}>
      <Route path="/accounts" element={<AccountsPage />} />
      <Route path="/accounts/:id" element={<AccountPage />} />
+   </ErrorBoundary>
    <!-- etc for reports, schedules, rules, settings -->
  </Routes>
```

Group routes by domain (budget, accounts, reports, schedules, rules, settings)
so errors in one domain don't crash another.

### Finding #18: Migrate console.log to Winston in sync-server

**Step 1:** Find the Winston logger setup:
- Search for `winston` or `createLogger` in `packages/sync-server/src/`
- Identify the logger export path

**Step 2:** For each file with console.log/error/warn/debug:
- Add import: `import logger from '../logger.js';`
- Replace `console.log(...)` with `logger.info(...)`
- Replace `console.error(...)` with `logger.error(...)`
- Replace `console.warn(...)` with `logger.warn(...)`
- Replace `console.debug(...)` with `logger.debug(...)`

**Categorize by level:**
- Authentication logs -> `logger.info`
- "Something went wrong" -> `logger.error`
- Debug headers -> `logger.debug`
- Status messages -> `logger.info`

**Commit:** `chore(techdebt): wave 5 - architecture fixes (#15, #16, #18)`

---

## Wave 6: Large Refactoring

High-risk changes requiring careful testing. Do sequentially.

### Finding #7: Fix swallowed errors in post.ts

**File:** `packages/loot-core/src/server/post.ts`

Read the full file to understand each error site. At each of the 3 TODO
locations (lines 71, 121, 169), the catch block swallows errors silently.

For each site, add proper error propagation:
```ts
} catch (err) {
  console.error('POST request failed:', err);
  throw new Error(`Sync request failed: ${err.message}`);
}
```

Or if the callers expect a specific error shape, return an error result object
matching the existing API contract.

### Finding #13: Extract accounts/app.ts into focused modules

**New files:**
- `packages/loot-core/src/server/accounts/link-accounts.ts` (~300 lines)
  - `linkGoCardlessAccount`, `linkSimpleFinAccount`, `linkPluggyAiAccount`,
    `linkEnableBankingAccount`, `unlinkAccount`
  - Extract shared `linkProviderAccount` helper
- `packages/loot-core/src/server/accounts/provider-status.ts` (~250 lines)
  - `goCardlessStatus`, `simpleFinStatus`, `pluggyAiStatus`,
    `enableBankingStatus`, all account-listing and bank-listing functions,
    web token functions
  - Extract shared `postToProvider` helper
- `packages/loot-core/src/server/accounts/sync-helpers.ts` (~100 lines)
  - `handleSyncResponse`, `handleSyncError`, `isBankSyncError`
  - Type definitions: `SyncError`, `SyncResponseWithErrors`

**Modified:** `packages/loot-core/src/server/accounts/app.ts` (~600 lines)
- Keep: CRUD operations, accountsBankSync, simpleFinBatchSync, importTransactions
- Keep: app.method() registrations
- Import from the new modules

### Finding #11: Split TransactionsTable.tsx into 6 focused modules

**New files (all in `packages/desktop-client/src/components/transactions/`):**

| File | Components moved | Lines |
|---|---|---|
| `TransactionHeader.tsx` | TransactionHeader, HeaderCell | ~180 |
| `TransactionCells.tsx` | StatusCell, PayeeCell, PayeeIcons | ~350 |
| `TransactionRow.tsx` | Transaction (the 820-line memo component) | ~880 |
| `TransactionError.tsx` | TransactionError | ~65 |
| `NewTransaction.tsx` | NewTransaction | ~180 |
| `TransactionTableInner.tsx` | TransactionTableInner | ~350 |

**Modified:** `TransactionsTable.tsx` (~730 lines remaining)
- Keep: TransactionTable (the public forwardRef export), getCategoriesById
- Import from the new files

**Key constraints:**
- `TransactionTable` at line 2378 is the ONLY public export. External consumers
  are unaffected.
- The `Transaction` component captures `onUpdate` closure with local state.
  This closure travels with the component.
- `PayeeCell` and `Transaction` have intricate focus/edit interactions via
  `onEdit`/`onUpdate` callbacks. Thread carefully.

**Testing:** TypeScript compilation, existing test suite, manual test: open
account, add transaction with splits, edit payee/category, sort columns,
right-click context menu.

### Finding #21: Complete queryClient.invalidateQueries migration

**Prerequisite:** Payees must be migrated to react-query first.

**New file:** `packages/desktop-client/src/payees/queries.ts`
```ts
import { send } from 'loot-core/platform/client/connection';

export const payeeQueries = {
  all: () => ['payees'] as const,
  lists: () => [...payeeQueries.all(), 'list'] as const,
  list: () => ({
    queryKey: payeeQueries.lists(),
    queryFn: () => send('payees-get'),
  }),
};
```

**Modified:** `packages/desktop-client/src/accounts/mutations.ts`
Replace all 5 instances of:
```ts
dispatch(markPayeesDirty());
```
with:
```ts
queryClient.invalidateQueries({ queryKey: payeeQueries.lists() });
```

**If payee migration is too large:** Document the blocker in each TODO instead:
```ts
// TODO: Replace with queryClient.invalidateQueries({ queryKey: payeeQueries.lists() })
// Blocked on: payee Redux-to-react-query migration (see payeesSlice.ts)
dispatch(markPayeesDirty());
```

**Commit each individually:**
- `chore(techdebt): wave 6a - fix swallowed errors in post.ts (#7)`
- `refactor(techdebt): wave 6b - extract accounts/app.ts modules (#13)`
- `refactor(techdebt): wave 6c - split TransactionsTable.tsx (#11)`
- `chore(techdebt): wave 6d - queryClient migration or documentation (#21)`

---

## Wave 7: Long-Term / Deferred

These require significant effort, breaking API changes, or phased rollout.
Document in tracking issues rather than attempting in this remediation.

### Finding #14: Migrate sync-server JS files to TypeScript

**Scope:** ~80 .js files in `packages/sync-server/src/`
**Strategy:** Phased migration. Start with `checkJs: true` in tsconfig.json to
get type checking on JS files without renaming. Then migrate high-value files
(config, middleware, database, services) first.

**Phase 1:** Enable `checkJs` in `packages/sync-server/tsconfig.json`
**Phase 2:** Convert core infrastructure (config, middleware, database)
**Phase 3:** Convert GoCardless bank adapters (lowest priority, most files)

### Finding #25: Remove @ts-strict-ignore from critical files

**Scope:** 200+ files across loot-core and desktop-client.
**Strategy:** Prioritize business logic files where type safety matters most:

**Top 10 targets:**
1. `packages/loot-core/src/shared/util.ts` (most imported utility)
2. `packages/loot-core/src/server/budget/envelope.ts` (budget calculations)
3. `packages/loot-core/src/server/budget/tracking.ts` (budget calculations)
4. `packages/loot-core/src/server/accounts/sync.ts` (financial sync)
5. `packages/loot-core/src/server/spreadsheet/spreadsheet.ts` (calculation engine)
6. `packages/loot-core/src/server/aql/compiler.ts` (query compiler)
7. `packages/loot-core/src/server/sync/index.ts` (CRDT sync)
8. `packages/loot-core/src/shared/rules.ts` (rule evaluation)
9. `packages/loot-core/src/shared/schedules.ts` (schedule calculations)
10. `packages/loot-core/src/server/transactions/transaction-rules.ts` (rule engine)

For each: remove `@ts-strict-ignore`, fix resulting type errors, run tests.

### Finding #23: Migrate groupBy to native Object.groupBy / Map.groupBy

**Prerequisite:** TypeScript lib must include `ES2024` (where `Object.groupBy`
and `Map.groupBy` are defined). Check root `tsconfig.json` lib setting and
upgrade if needed.

**File:** `packages/loot-core/src/shared/util.ts`
- `groupBy` (line 102) -> `Map.groupBy()`
- `groupById` (line 154) -> `Object.groupBy()`
- `_groupById` (line 117) -> `Map.groupBy()` (then remove)

All callers must be updated. This is a large surface area change.

### Finding #6: Migrate openid-client v5 to v6

**Scope:** Breaking API rewrite. v6 uses functional API instead of class-based.
**Files:** All openid-client usage in `packages/sync-server/src/`

Key changes:
- `new Issuer()` -> `discovery()` function
- `client.authorizationUrl()` -> `buildAuthorizationUrl()`
- `client.callback()` -> `authorizationCodeGrant()`
- Token refresh API completely different

Plan a dedicated PR for this migration with thorough testing.

### Finding #26: TODO/FIXME triage

**Scope:** ~55 comments across source files.
Categorize into: (a) actionable now, (b) informational, (c) already addressed.
Remove stale comments, convert actionable items to GitHub issues.

### Finding #28: Migrate pikaday to react-aria date picker

**Scope:** Large effort. Used in `DateSelect.tsx` which has custom keyboard
navigation, relative date parsing, and integration with the budget UI.
**Strategy:** Defer unless touching DateSelect.tsx for other reasons.

### Finding #29: Upgrade react-spring

**Scope:** 7 files use react-spring for animations. The upgrade from
`react-spring@10.0.3` to `@react-spring/web` involves package rename and
possible API changes.
**Strategy:** Defer. Upgrade when touching animation code.

---

## Execution Summary

| Wave | Findings | Risk | Effort | Status |
|---|---|---|---|---|
| 1 | #3, #4, #24, #31 | None | Trivial | DONE |
| 2 | #5, #19, #22, #30 | Low | Small | DONE |
| 3 | #12, #17, #20, #27 | Low | Small-Medium | DONE |
| 4 | #1, #2, #8, #9, #10 | Medium | Medium | DONE |
| 5 | #15, #16, #18 | Medium | Medium | DONE |
| 6 | #7, #13, #21 | High | Large | DONE |
| 6 (deferred) | #11 | High | Large | Deferred |
| 7 | #6, #14, #23, #25, #26, #28, #29 | Varies | Ongoing | Tracked as issues |

**Findings fixed: 23. Deferred: 1 (#11). Long-term: 7.**

### Wave 6 execution notes

- **#7** (post.ts errors): Captured and logged original parse errors before
  re-throwing PostError. Removed stale TODO comments.
- **#13** (app.ts extraction): Split 1539-line file into 4 modules:
  `app.ts` (CRUD + sync + registrations), `link-accounts.ts` (provider linking),
  `provider-status.ts` (status/banks/polling), `sync-helpers.ts` (sync types and error handling).
  External consumers unchanged via re-exports.
- **#21** (queryClient): All 5 `markPayeesDirty()` calls already had TODO
  comments documenting the react-query migration blocker. No changes needed.
- **#11** (TransactionsTable split): **Deferred to separate PR.** 3061-line
  file with tight coupling through focus management, keyboard navigation,
  and context menus. Components like PayeeCell need 25+ imports when extracted.
  Requires visual testing to verify no regressions. Risk outweighs benefit
  in a techdebt batch.
- Also fixed 2 TS errors from earlier waves: `SyncErrorContext.subtype`
  made optional (wave 3), `fc.asciiString` replaced with `fc.string` (wave 3).
