# Plan Review: 03-01-PLAN.md (Round 3)

**Reviewed:** 2026-03-01
**Review round:** 3 (final)
**Prior rounds:** Round 1 fixed wrong getTransactions signature, missing unit test updates, synced_at epoch type. Round 2 fixed getAspsps unwrap divergence, RateLimitError compounding, ASPSP name silent fallback, cron expression, null lastEntry spread.

---

## Verdict: CONDITIONAL PASS

No critical issues. One major issue (missing import in scheduler causes runtime failure). Three minor issues. Fix the major before executing.

---

## Findings

### MAJOR - normalizeTransaction missing from scheduler.ts import list

**Step:** Task 1 - syncOneAccount helper

The plan's import list for scheduler.ts specifies exactly three imports:

- cron from node-cron
- getAccountDb from ./account-db.js
- getTransactions, getBalances from ./app-enablebanking/enablebanking-service.js

The syncOneAccount description says: "call getTransactions, getBalances, then normalizeTransaction() each transaction". normalizeTransaction is exported from ./app-enablebanking/utils.js. It is NOT in the scheduler import list. An autonomous executor following the import list literally will produce a runtime ReferenceError when syncOneAccount calls normalizeTransaction.

This is a new finding not caught in prior rounds. Prior rounds addressed the getTransactions/getBalances signatures and sinceDate derivation, but did not audit the normalizeTransaction import gap.

**Impact:** Every scheduled sync call to syncOneAccount will throw ReferenceError: normalizeTransaction is not defined. The scheduler will log status=error for every account on every run.

**Verification:** Confirmed by reading the plan import list (Task 1, step 1) and cross-referencing utils.js, which exports normalizeTransaction as a named export.

**Fix:** Add to Task 1 import list: import { normalizeTransaction } from './app-enablebanking/utils.js'

---

### MINOR - Success INSERT SQL for eb_sync_log not specified in syncOneAccount

**Step:** Task 1 - syncOneAccount helper

The plan describes writing a success entry to eb_sync_log but provides no SQL for the success path. The error-path SQL is shown explicitly. The success SQL is left implicit ("insert a success entry into eb_sync_log").

The eb_sync_log schema (verified in migrations.js) has these NOT NULL columns: actual_account_id, eb_account_uid, status, synced_at (auto-default). Without explicit SQL, the executor must infer the INSERT. Risk: missing actual_account_id or eb_account_uid causes a NOT NULL constraint failure at runtime.

The correct reference is in app-enablebanking.ts lines 283-292:

    INSERT INTO eb_sync_log (actual_account_id, eb_account_uid, status, transactions_added)
    VALUES (?, ?, 'ok', ?)

**Fix:** Add the success INSERT SQL explicitly to the syncOneAccount description, matching the existing transactions route pattern. Params: [account.actual_account_id, account.eb_account_uid, 'ok', booked.length + pending.length].

---

### MINOR - Plan rationale for DB readiness incorrectly credits bootstrap()

**Step:** Task 1 - Wire scheduler into app.ts

The plan says: "the scheduler only needs the database to be ready, which is guaranteed by the bootstrap() call earlier in run()."

bootstrap() in account-db.ts initializes the auth/sessions/users tables only. It does NOT create the EB tables (eb_sessions, eb_account_map, eb_sync_log). Those are created by runMigrations() called at module load time in app-enablebanking.ts line 27. Since app-enablebanking.ts is imported at the top of app.ts (before run() executes), the EB tables do exist when startScheduler() is called - but via module initialization, not bootstrap().

The outcome is correct. The stated rationale is wrong. If a future refactor makes the enablebanking import lazy, the scheduler would break silently with no warning from the incorrect comment.

**Fix:** Change the rationale to: "EB tables exist because app-enablebanking.ts calls runMigrations() at module load time, before run() is called."

---

### MINOR - files_modified frontmatter omits the desktop-client hook file

**Step:** Task 2 - Update client-side type in useEnableBankingStatus.ts

The plan frontmatter files_modified lists six files. Task 2 modifies packages/desktop-client/src/hooks/useEnableBankingStatus.ts but this file is absent from the frontmatter list.

**Impact:** GSD artifact validation will not check this file. Low execution risk but creates an incomplete handoff record.

**Fix:** Add packages/desktop-client/src/hooks/useEnableBankingStatus.ts to files_modified.

---

## Missing Steps

None. All required steps for AUTO-01, AUTO-02, and AUTO-06 are covered.

---

## Assumptions to State Explicitly

1. normalizeTransaction from utils.js is safe to call from the scheduler context. Confirmed: it is a pure function with no external imports of request/response objects, no side effects.

2. The scheduler writes to eb_sync_log only. It cannot update Actual Budget transaction records because loot-core runs in the client context (RESEARCH.md Pitfall 2). Account balances go stale between client-initiated syncs. This is a known architectural constraint, not a bug. The plan does not document this as a known limitation.

3. node-cron v4 default import: import cron from 'node-cron' is correct for ESM with v4. The package ships its own TypeScript types. No @types/node-cron needed (plan correctly calls this out).

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0     |
| Major    | 1     |
| Minor    | 3     |

**CONDITIONAL PASS.** The one major issue (missing normalizeTransaction import) must be added to the import list before execution. The three minor issues are low-risk and can be addressed in-line during execution without blocking progress.
