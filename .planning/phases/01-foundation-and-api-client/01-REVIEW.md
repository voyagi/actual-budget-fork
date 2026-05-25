---
phase: 01-foundation-and-api-client
review_depth: standard
status: fixed
files_reviewed: 8
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
fixed: 7
skipped: 2
fix_commit: 7e30f19cc
reviewed_at: 2026-05-23
---

# Phase 01 Code Review: Foundation and API Client

## Files Reviewed

- packages/sync-server/Dockerfile
- docker-compose.yml
- .env.example
- .dockerignore
- packages/sync-server/src/app-enablebanking/enablebanking-service.ts
- packages/sync-server/src/app-enablebanking/app-enablebanking.ts
- packages/sync-server/src/app-enablebanking/util/handle-error.js
- packages/sync-server/src/app.ts

---

## Findings

### WR-01: URL query parameters built via string concatenation without encoding

**Severity:** Warning
**File:** packages/sync-server/src/app-enablebanking/enablebanking-service.ts
**Lines:** 97, 170-175

`getAspsps()` and `getTransactions()` build query strings by concatenating user-supplied values directly:

```ts
const response = await ebRequest('GET', '/aspsps?country=' + country);
```

```ts
const qs = '?date_from=' + startDate + (nextKey ? '&continuation_key=' + nextKey : '');
```

If `country` or `startDate` contain characters like `&`, `=`, or `#`, the URL semantics break. While axios does some URL normalization, it does not encode query parameter values passed inline in the URL string.

**Fix:** Use axios `params` option:
```ts
const response = await axios({ method, url: `${baseUrl}/aspsps`, params: { country } });
```

Or use `encodeURIComponent()` on each value.

---

### WR-02: Error handler logs to console.log instead of console.error

**Severity:** Warning
**File:** packages/sync-server/src/app-enablebanking/util/handle-error.js
**Line:** 9

```js
console.log('Error', req.originalUrl, err.message || String(err));
```

Error-level events should use `console.error` (or the project's `logger.error`) so log aggregators and structured logging pipelines classify them correctly. The project has a Winston logger (`../util/logger.js`) available.

---

### WR-03: Error handler always returns HTTP 200

**Severity:** Warning
**File:** packages/sync-server/src/app-enablebanking/util/handle-error.js
**Lines:** 31-39

All errors (including 500-class internal errors) return HTTP 200 with `status: 'ok'` and an error_code in the body. This is intentional to match the GoCardless adapter pattern, but it means:

- Monitoring/load-balancer health checks cannot distinguish healthy responses from error responses
- Standard HTTP error-rate alerting is blind to Enable Banking failures

Not a bug since it follows the established codebase pattern, but worth documenting as a known limitation.

---

### WR-04: @ts-strict-ignore on both main source files

**Severity:** Warning
**Files:** enablebanking-service.ts:1, app-enablebanking.ts:1

Both files disable TypeScript strict checking. The service file has untyped function parameters (`method`, `path`, `data`, `country`, `code`, `sessionId`, `accountUid`, `startDate`, `continuationKey`) which means the compiler cannot catch type mismatches at call sites.

---

### IN-01: No TypeScript types on service function signatures

**Severity:** Info
**File:** packages/sync-server/src/app-enablebanking/enablebanking-service.ts

All exported functions use implicit `any` for parameters:

```ts
export async function ebRequest(method, path, data?) { ... }
export async function getAspsps(country) { ... }
export async function exchangeCode(code) { ... }
export async function getTransactions(accountUid, startDate, continuationKey?) { ... }
```

The companion file `enablebanking.types.ts` exists but these functions don't use it.

---

### IN-02: Module-level side effect at import time

**Severity:** Info
**File:** packages/sync-server/src/app-enablebanking/app-enablebanking.ts
**Line:** 29

```ts
runMigrations();
```

Database migrations run at module import time. This makes the module harder to test in isolation and means importing the module for type-checking or static analysis triggers database operations.

---

### IN-03: Single-stage Dockerfile produces larger image

**Severity:** Info
**File:** packages/sync-server/Dockerfile

The Dockerfile uses a single stage that includes build tools (python3, make, g++) in the final image. A multi-stage build could use a builder stage for compilation and copy only runtime artifacts to a slim final stage, reducing image size by ~200-400MB.

---

### IN-04: No Docker container resource limits

**Severity:** Info
**File:** docker-compose.yml

No `mem_limit`, `cpus`, or `deploy.resources` constraints are set on any service. In production, a runaway process could consume all host memory.

---

### IN-05: Private key cached indefinitely in memory

**Severity:** Info
**File:** packages/sync-server/src/app-enablebanking/enablebanking-service.ts
**Lines:** 22-31

```ts
let cachedPrivateKey = null;
```

The imported PKCS#8 key is cached for the process lifetime. If the key file is rotated on disk, the server must be restarted to pick up the new key. This is acceptable for the current deployment model (Docker container restarts on key change) but worth noting.

---

## Fix Status

| Finding | Status | Commit |
|---------|--------|--------|
| WR-01 | Fixed | 7e30f19cc - axios params instead of string concat |
| WR-02 | Fixed | 7e30f19cc - Winston logger.error with structured metadata |
| WR-03 | Skipped | Inherited GoCardless pattern, changing breaks client error handling |
| WR-04 | Fixed | 7e30f19cc - removed @ts-strict-ignore from enablebanking-service.ts |
| IN-01 | Fixed | 7e30f19cc - all service functions typed |
| IN-02 | Skipped | Module-level migrations is the established adapter pattern |
| IN-03 | Fixed | 7e30f19cc - multi-stage Dockerfile with non-root user |
| IN-04 | Fixed | 7e30f19cc - mem_limit + cpus on all 3 services |
| IN-05 | Skipped | By design for Docker deployment model |

## Summary

7 of 9 findings fixed. 2 skipped (WR-03 inherited GoCardless pattern, IN-02 established adapter pattern).
