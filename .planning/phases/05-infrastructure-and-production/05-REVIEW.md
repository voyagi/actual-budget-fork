---
phase: 05-infrastructure-and-production
depth: standard
status: findings
files_reviewed: 13
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
reviewed_at: 2026-05-23
---

# Phase 05 Code Review: Infrastructure and Production

## Critical

### CR-01: `fetchOperationalAlerts` passes headers incorrectly to `get()`

**File:** `packages/loot-core/src/server/accounts/provider-status.ts:479-481`
**Category:** Bug

The `get()` helper receives `(url, headers)` but `fetchOperationalAlerts` passes `{ headers: { 'X-ACTUAL-TOKEN': userToken } }` — wrapping headers in a nested object. Compare with every other caller in this file which passes `{ 'X-ACTUAL-TOKEN': userToken }` directly. This means operational alerts requests are sent without authentication and will always fail with 401.

The same pattern is used by `fetchProductionTrustStatus` at line 518, which also wraps in `{ headers: ... }`. Both are broken.

**Impact:** Operational alerts and production trust status fetches from the loot-core client are silently unauthenticated. The production trust warning UI may never show real data.

**Fix:** Change both callers to pass headers directly:
```ts
const text = await get(serverConfig.BASE_SERVER + '/alerts', {
  'X-ACTUAL-TOKEN': userToken,
});
```

## Warning

### WR-01: `canRunAutomatedCheck` is always true — hardcoded to check if `bank_sync` condition exists

**File:** `packages/sync-server/src/util/production-trust.ts:189`
**Category:** Logic

```ts
canRunAutomatedCheck: rows.some(row => row.condition === 'bank_sync'),
```

Since `PRODUCTION_TRUST_CONDITIONS` always contains `'bank_sync'` and `ensureProductionTrustTable()` seeds all conditions, this expression is always `true`. The button always renders. If automated checks are extended to other conditions, this field won't reflect reality.

**Impact:** Low — currently harmless since bank_sync is the only automated check, but misleading if conditions change.

### WR-02: Docker Compose uses `cloudflare/cloudflared:latest` — unpinned image tag

**File:** `docker-compose.yml:71`
**Category:** Reliability

Using `:latest` means `docker compose pull` can introduce breaking changes without warning. The `caddy:2-alpine` tag is reasonably pinned to a major version, but `cloudflared:latest` has no version constraint.

**Impact:** A cloudflared breaking change could silently break tunnel access after a pull.

**Fix:** Pin to a specific version or use a dated tag (e.g., `cloudflare/cloudflared:2024.12.2`).

### WR-03: 60-second polling interval in `useProductionTrustStatus` with no backoff

**File:** `packages/desktop-client/src/hooks/useProductionTrustStatus.ts:129`
**Category:** Performance

The hook polls every 60 seconds unconditionally while the server is online, plus on every `visibilitychange` and `focus` event. For a status that changes rarely (production trust conditions), this creates unnecessary network traffic. The `focus` and `visibilitychange` handlers both fire `poll()`, and rapid tab switching can stack concurrent requests since there's no in-flight guard.

**Impact:** Minor network overhead per client; concurrent request stacking on rapid focus changes.

**Fix:** Add an `isFetching` guard to prevent concurrent polls, and consider increasing the interval (e.g., 5 minutes) since trust state changes are infrequent.

### WR-04: `evidence` field on `/record` endpoint accepts arbitrary JSON without size validation at API layer

**File:** `packages/sync-server/src/app-production-trust.ts:29-49`
**Category:** Security

The `/record` POST endpoint accepts `evidence` from the request body and passes it directly to `recordProductionTrustUntrusted`. While `serializeEvidence()` in `production-trust.ts` truncates to `MAX_EVIDENCE_LENGTH` (2000 chars) before DB storage, the full untrusted JSON is parsed and processed in memory first. A very large evidence payload (e.g., 10MB JSON) would be parsed and traversed by `redactEvidence()` recursively before truncation.

**Impact:** The express JSON body limit (`upload.fileSizeLimitMB`) provides an outer bound, but within that limit, deeply nested evidence objects could cause CPU spikes in `redactEvidence()` recursion.

**Fix:** Add a size check on `JSON.stringify(evidence).length` before calling `redactEvidence`, or limit recursion depth.

## Info

### IN-01: `ProductionTrustCondition` type is duplicated between server and client

**Files:**
- `packages/sync-server/src/util/production-trust.ts:3-8`
- `packages/desktop-client/src/hooks/useProductionTrustStatus.ts:7-11`

The client defines its own `ProductionTrustCondition` union type rather than importing from a shared package. If a condition is added server-side, the client type won't have it.

### IN-02: Test file imports `_resetAlerter` suggesting test-only export in production code

**File:** `packages/sync-server/src/util/production-trust.test.ts:9`

The `_resetAlerter` underscore-prefixed export from `alerter.js` is used only in tests. This is a minor convention note — the pattern is common but could benefit from a test-only export mechanism.

### IN-03: `conditionLabelKeys` in `ProductionTrustWarning.tsx` uses raw English strings instead of i18n keys

**File:** `packages/desktop-client/src/components/ProductionTrustWarning.tsx:14-19`

```ts
const conditionLabelKeys: Record<ProductionTrustCondition, string> = {
  access: 'access',
  persistence: 'persistence',
  multi_device_sync: 'multi-device sync',
  bank_sync: 'bank sync',
};
```

These are passed to `t()` which will look them up in the translation files. If translation keys aren't registered for these exact strings, they'll render as-is (English only). This is consistent with how the rest of the app handles translations, so it's informational.
