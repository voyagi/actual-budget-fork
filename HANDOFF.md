# Handoff: Phase 2 Bank Sync Pipeline - Debugging OAuth + Account Linking

**Created:** 2026-02-19
**Updated:** 2026-02-19 (session 2)
**Branch:** `feat/01-03-enablebanking-auth`

## Goal

Complete E2E testing of the Enable Banking OAuth flow. The code for Phase 2 (Bank Sync Pipeline) was shipped in Waves 1-3. We are now debugging the OAuth-to-transaction-display pipeline to get it working end-to-end with the Enable Banking sandbox (Mock ASPSP).

## Current Progress

### Bugs Found and Fixed This Session (not yet committed)

Three bugs were identified and fixed. All changes are local (unstaged).

#### Bug 1: `account_id` is an object, not a string (FIXED)

The Enable Banking API returns `account_id` as an object like `{ iban: "DK0550517826136334" }`, not a simple string. The `uid` field (UUID like `"b078224f-..."`) is the identifier used in API paths.

**Impact:** `eb_account_map.eb_account_uid` stored `"[object Object]"`. API calls to `/accounts/[object Object]/transactions` failed. In the SelectLinkedAccountsModal, `findIndex` compared object === string and returned -1, silently skipping account linking.

**Files changed:**
- `packages/sync-server/src/app-enablebanking/utils.js` - `normalizeAccount()` now uses `ebAccount.uid` for `account_id`, extracts IBAN from `ebAccount.account_id?.iban`, and uses `ebAccount.name` (not `account_name`)
- `packages/sync-server/src/app-enablebanking/app-enablebanking.js` - callback route uses `account.uid` instead of `account.account_id || account.uid`

#### Bug 2: PWA service worker intercepted OAuth callback (FIXED)

The Workbox service worker's `navigateFallback` served `index.html` for ALL navigation requests. The `/enablebanking/callback` URL was NOT in the `navigateFallbackDenylist`, so the bank's redirect never reached the Express server. The callback appeared as 0 hits in server logs while polling continued until timeout.

**File changed:**
- `packages/desktop-client/vite.config.mts` - added `/^\/enablebanking\/.*$/` to `navigateFallbackDenylist`

#### Bug 3: `link.html` 404 in Docker build (FIXED)

The sync-server build compiles to `build/` but `link.html` stays in `src/`. At runtime `__dirname` resolves to the build path, causing `ENOENT`. Fixed by inlining the HTML response. Also removed unused `path` and `fileURLToPath` imports.

**File changed:**
- `packages/sync-server/src/app-enablebanking/app-enablebanking.js` - replaced `res.sendFile()` with inline `res.type('html').send()`

### What's Verified Working

After these fixes, the Docker logs show:
1. `POST 200 /enablebanking/create-auth` - OAuth session created
2. `GET 302 /enablebanking/callback?code=...&state=...` - Callback fires, code exchanged
3. `GET 200 /enablebanking/link?state=...` - Popup close page served
4. `POST 200 /enablebanking/get-accounts` - Client polls and receives accounts
5. DB confirms: `eb_account_uid = "b078224f-..."` (proper UUID), `accounts` JSON populated with correct Mock ASPSP data (account name "Ida Jensen", IBAN "DK0550517826136334")

### What's NOT Working Yet

**Account linking fails.** After the user selects an account in the SelectLinkedAccountsModal and clicks Link, the app shows:
- "There was an error linking the account to Enable Banking"
- "Something internally went wrong"

The error happens in loot-core (browser web worker), NOT on the sync server. Server logs show NO requests to `/update-account-map` or `/transactions` after the modal action, meaning `linkEnableBankingAccount()` in `app.ts` throws before making any HTTP calls.

**The exact error is unknown.** We need the browser DevTools Console output to identify the root cause. The user was asked to open DevTools > Console before retrying.

## What Worked

- `docker compose up --build -d` rebuilds cleanly each time (~2.5 min)
- Service worker denylist fix immediately unblocked the callback
- EB API returns `uid` (UUID) as expected after the fix
- The `normalizeAccount` output is correct: proper UUID, account name "Ida Jensen", IBAN extracted

## What Didn't Work

- **Original `account_id` derivation** used `account.account_id || account.uid` which picked the IBAN object over the UUID string
- **Service worker** intercepted the callback URL silently for weeks with no server-side indication
- **`link.html` as static file** broke because the build copies JS but not HTML
- **Guessing the linking error** without browser console output - the error happens entirely in the browser web worker with no server-side trace

## Likely Causes of the Remaining Linking Error

Investigate in this order:
1. **`eb-category-rules.js` import** - imported with `.js` extension in a `.ts` file (`app.ts:41`). If the bundler handles this differently, the import might fail at runtime
2. **`db.insertWithUUID` column mismatch** - verify the `accounts` table schema has all columns used in the INSERT (especially `account_sync_source`)
3. **`bankSync.syncAccount()` early return** - `downloadEnableBankingTransactions` returns undefined if `userToken` is null, causing destructuring crash
4. **`handleError` wrapper** still wraps errors as `{ status: 'ok' }` - any sync-server error during account map update would look like success but have `error_code` field

## Key Files

- **Sync-server routes:** `packages/sync-server/src/app-enablebanking/app-enablebanking.js`
- **Normalizer:** `packages/sync-server/src/app-enablebanking/utils.js`
- **EB service (API calls):** `packages/sync-server/src/app-enablebanking/enablebanking-service.js`
- **IPC handlers (linking logic):** `packages/loot-core/src/server/accounts/app.ts` (line ~1375, `linkEnableBankingAccount`)
- **Sync function:** `packages/loot-core/src/server/accounts/sync.ts` (line ~299, `downloadEnableBankingTransactions`)
- **OAuth client (polling):** `packages/desktop-client/src/enablebanking.ts`
- **Modal (UI):** `packages/desktop-client/src/components/modals/EnableBankingExternalMsgModal.tsx`
- **Account selection modal:** `packages/desktop-client/src/components/modals/SelectLinkedAccountsModal.tsx`
- **Mutation (link call):** `packages/desktop-client/src/accounts/mutations.ts` (line ~510, `useLinkAccountEnableBankingMutation`)
- **Vite config (SW denylist):** `packages/desktop-client/vite.config.mts` (line ~192)
- **Category rules:** `packages/loot-core/src/server/accounts/eb-category-rules.js`

## Sandbox Credentials

- Application ID: `b619fe6c-ab92-4de5-a7c2-901c0e0ef580`
- Private key: `secrets/eb_private.pem` (PKCS#8, RS256)
- Redirect URL: `http://localhost:5006/enablebanking/callback`
- API base: `https://api.enablebanking.com`

## Next Steps

1. **Get browser console error** - Open DevTools (F12) > Console before retrying the link flow. The exact error message will pinpoint the issue in `linkEnableBankingAccount()`
2. **Fix the linking error** based on console output
3. **Hard-refresh browser** (Ctrl+Shift+R) + unregister old service worker before each retry
4. **Clean EB tables** before each retry: `docker exec actual-budget-fork-sync-server-1 node -e "const db = require('better-sqlite3')('/data/server-files/account.sqlite'); db.prepare('DELETE FROM eb_sessions').run(); db.prepare('DELETE FROM eb_account_map').run(); db.close();"`
5. **After linking works:** complete the 8 E2E verification tests (SYNC-01 through SYNC-09)
6. **After approved:** commit all fixes, complete Plan 02-05 SUMMARY, run phase verification
