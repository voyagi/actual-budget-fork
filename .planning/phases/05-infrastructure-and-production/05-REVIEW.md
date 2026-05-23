---
phase: 05-infrastructure-and-production
reviewed: 2026-05-23T14:45:00Z
depth: standard
files_reviewed: 13
files_reviewed_list:
  - .env.example
  - Caddyfile
  - docker-compose.yml
  - packages/desktop-client/src/components/FinancesApp.tsx
  - packages/desktop-client/src/components/ProductionTrustWarning.test.tsx
  - packages/desktop-client/src/components/ProductionTrustWarning.tsx
  - packages/desktop-client/src/hooks/useProductionTrustStatus.ts
  - packages/loot-core/src/server/accounts/app.ts
  - packages/loot-core/src/server/accounts/provider-status.ts
  - packages/sync-server/src/app.ts
  - packages/sync-server/src/app-production-trust.ts
  - packages/sync-server/src/util/production-trust.test.ts
  - packages/sync-server/src/util/production-trust.ts
findings:
  critical: 2
  warning: 5
  info: 2
  total: 9
status: issues_found
---

# Phase 5: Code Review Report

**Reviewed:** 2026-05-23T14:45:00Z
**Depth:** standard
**Files Reviewed:** 13
**Status:** issues_found

## Summary

This review covers the production trust infrastructure: a server-side trust-state tracking system backed by SQLite, Express API routes, client-side React hook and warning banner, Docker Compose deployment topology (Caddy + Cloudflare Tunnel), and associated tests. The production trust feature is well-structured with proper input validation, authentication middleware, and evidence redaction. However, several issues were found: a security gap where string evidence bypasses redaction, a missing error handler in the client hook, an overly broad redaction regex that silently destroys diagnostic data, insecure defaults in docker-compose, and an HTTP-only default for a banking redirect URL.

**Note on prior CR-01 (retracted):** The previous review claimed `fetchOperationalAlerts` and `fetchProductionTrustStatus` pass headers incorrectly to `get()`. This was wrong. The `get()` function is `fetch(url, opts).then(res => res.text())` -- it passes `opts` directly to the Fetch API. The new code passes `{ headers: { 'X-ACTUAL-TOKEN': userToken } }`, which is the correct Fetch API shape. It is the pre-existing `checkSecret` (line 313) that passes `{ 'X-ACTUAL-TOKEN': userToken }` without the `headers` wrapper -- that is the broken pattern, but it is upstream code not introduced in this phase.

## Critical Issues

### CR-01: String evidence bypasses secret redaction entirely

**File:** `packages/sync-server/src/util/production-trust.ts:88-104`
**Issue:** The `serializeEvidence` function only runs `redactEvidence()` on non-string evidence (objects/arrays). When `evidence` is a raw string, it is stored verbatim without any redaction. If a caller passes a string containing secrets (e.g., a serialized token, a raw error message containing credentials, or a connection string with embedded passwords), it will be persisted unredacted in the `production_trust_state` table and returned to all authenticated clients via the GET endpoint.

The `recordProductionTrustUntrusted` function accepts `evidence?: unknown`, so any caller can pass a string. The `verifyProductionTrustCondition` function has the same exposure. The `/record` API endpoint forwards `evidence` from the request body with no type constraint.

**Fix:**
```typescript
function serializeEvidence(evidence: unknown): string | null {
  if (evidence == null) {
    return null;
  }

  // Always redact, regardless of type
  const redacted = redactEvidence(evidence);
  const value = typeof redacted === 'string'
    ? redacted
    : JSON.stringify(redacted);

  if (value.length <= MAX_EVIDENCE_LENGTH) {
    return value;
  }

  if (typeof redacted === 'string') {
    return value.slice(0, MAX_EVIDENCE_LENGTH);
  }

  return JSON.stringify({
    _truncated: true,
    _preview: value.slice(0, MAX_EVIDENCE_LENGTH - 50),
  });
}
```

And extend `redactEvidence` to handle strings:

```typescript
function redactEvidence(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/(?:token|password|secret|key|authorization)[=:]\s*\S+/gi,
        (match) => match.split(/[=:]/)[0] + '=[redacted]')
      .replace(/-----BEGIN[^-]*PRIVATE KEY-----[\s\S]*?-----END[^-]*PRIVATE KEY-----/g,
        '[redacted-private-key]');
  }
  // ... existing object/array handling ...
}
```

### CR-02: Banking redirect URL defaults to plain HTTP in docker-compose

**File:** `docker-compose.yml:30`
**Issue:** The `ENABLE_BANKING_REDIRECT_URL` environment variable defaults to `http://localhost:5006/enablebanking/callback` (plain HTTP). This is the OAuth redirect URL for the Enable Banking flow. In production, the banking provider redirects the user's browser to this URL with an authorization code in the query string. Transmitting the authorization code over plain HTTP exposes it to network interception. The `.env.example` file correctly documents an HTTPS URL, but the docker-compose fallback is what takes effect when the `.env` value is missing or empty.

**Fix:** Remove the fallback so a missing value causes a visible failure rather than silently using an insecure default:
```yaml
- ENABLE_BANKING_REDIRECT_URL=${ENABLE_BANKING_REDIRECT_URL:?Set ENABLE_BANKING_REDIRECT_URL in .env}
```

Or if a fallback is needed, make it HTTPS:
```yaml
- ENABLE_BANKING_REDIRECT_URL=${ENABLE_BANKING_REDIRECT_URL:-https://localhost:5006/enablebanking/callback}
```

## Warnings

### WR-01: `verifyManually` missing try/catch -- unhandled promise rejection

**File:** `packages/desktop-client/src/hooks/useProductionTrustStatus.ts:82-106`
**Issue:** The `verifyManually` callback calls `await send(...)` without a try/catch block. Both sibling functions in the same hook (`refresh` at line 38 and `runAutomatedCheck` at line 61) wrap their `send()` calls in try/catch. If `send('production-trust-manual-verify', ...)` throws a network error or the server is unreachable, the promise rejection propagates to the caller unhandled. This can crash the React component that invokes it or trigger an unhandled promise rejection warning.

**Fix:**
```typescript
const verifyManually = useCallback(
  async ({ condition, evidence, message }) => {
    if (syncServerStatus !== 'online') return null;

    try {
      const result = await send('production-trust-manual-verify', {
        condition,
        evidence,
        message,
      });
      if (result?.error) {
        return null;
      }
      setState(result);
      return result as ProductionTrustState;
    } catch {
      return null;
    }
  },
  [syncServerStatus],
);
```

### WR-02: Redaction regex matches `key` as a bare substring -- over-redacts legitimate diagnostic data

**File:** `packages/sync-server/src/util/production-trust.ts:78`
**Issue:** The regex `/authorization|password|private|secret|token|key/i` tests property names for redaction. The `key` alternative matches any property containing "key" as a substring: `primaryKey`, `publicKey`, `errorKey`, `keyName`, `monkeyPatch`, etc. The word `private` similarly matches `isPrivate`, `privateNote`. This destroys diagnostic data silently. The test at line 166-185 only tests obvious cases (`token`, `privateKey`) and does not catch this over-matching.

For a production trust system whose purpose is diagnostics, silently destroying evidence fields defeats its utility.

**Fix:** Use exact-match or word-boundary patterns:
```typescript
const SENSITIVE_KEY_PATTERN = /^(authorization|password|secret|token|api_?key|private_?key|credential|credentials)$/i;
// ...
SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : redactEvidence(entry)
```

### WR-03: `canRunAutomatedCheck` is always `true` -- dead conditional in UI

**File:** `packages/sync-server/src/util/production-trust.ts:189`
**Issue:** The expression `rows.some(row => row.condition === 'bank_sync')` always returns `true` because `bank_sync` is one of the four hardcoded `PRODUCTION_TRUST_CONDITIONS` seeded by `ensureProductionTrustTable()`. The client component (`ProductionTrustWarning.tsx:76`) conditionally renders the "Check again" button based on this value, but the button always renders. This makes the conditional dead code that gives a false impression of dynamic behavior.

**Fix:** If the intent is "show the button only when there are untrusted conditions that support automated checks":
```typescript
canRunAutomatedCheck: activeConditions.some(
  row => row.condition === 'bank_sync',
),
```

### WR-04: Docker Compose Caddy ports bind to all network interfaces

**File:** `docker-compose.yml:56-58`
**Issue:** The Caddy service exposes ports `80:80`, `443:443`, and `443:443/udp` without binding to a specific interface. Docker maps these to `0.0.0.0`, making the service accessible from any network interface. On a machine with a public IP, connected to a public Wi-Fi, or running on a cloud VM, this exposes the Actual Budget server beyond the intended LAN. The comments in `.env.example` and `Caddyfile` describe this as "LAN/desktop access," implying local-only intent.

**Fix:** Add a configurable bind address defaulting to all interfaces but documented:
```yaml
ports:
  - '${CADDY_BIND:-0.0.0.0}:80:80'
  - '${CADDY_BIND:-0.0.0.0}:443:443'
  - '${CADDY_BIND:-0.0.0.0}:443:443/udp'
```
And add to `.env.example`:
```
# Bind address for Caddy ports. Use 127.0.0.1 for local-only access.
# Default 0.0.0.0 exposes on ALL network interfaces (LAN + any public IPs).
CADDY_BIND=0.0.0.0
```

### WR-05: `get()` does not check HTTP status -- server errors silently become parse errors

**File:** `packages/loot-core/src/server/accounts/provider-status.ts:479,518`
**Issue:** The `get()` function (`post.ts:217`) is `fetch(url, opts).then(res => res.text())` -- it returns the response body as text regardless of HTTP status. When `fetchOperationalAlerts` or `fetchProductionTrustStatus` receive a non-200 response (e.g., 500 Internal Server Error with HTML body), the text is passed to `JSON.parse()`, which throws, and the catch block returns `{ error: 'parse-error' }`. A server crash is reported to the user as a "parse error," hiding the root cause and making debugging harder.

The companion `post()` function in the same module calls `throwIfNot200()`, but `get()` has no equivalent.

**Fix:** Add status checking in the callers:
```typescript
export async function fetchProductionTrustStatus() {
  // ... existing auth/config checks ...

  const text = await get(serverConfig.BASE_SERVER + '/production-trust', {
    headers: { 'X-ACTUAL-TOKEN': userToken },
  });

  try {
    const response = JSON.parse(text);
    return response.status === 'ok'
      ? response.data
      : { error: response.reason || 'unknown' };
  } catch {
    // Distinguish parse errors from server errors
    return { error: text?.startsWith('<') ? 'server-error' : 'parse-error' };
  }
}
```

## Info

### IN-01: `ensureProductionTrustTable()` runs DDL on every function call

**File:** `packages/sync-server/src/util/production-trust.ts:125,165,204,241,292,370`
**Issue:** Every public function in this module calls `ensureProductionTrustTable()`, which executes `CREATE TABLE IF NOT EXISTS` plus four `INSERT OR IGNORE` statements. This means every API request to any production-trust endpoint runs 5 SQL statements just for initialization. While SQLite handles these idempotent operations efficiently, this is unnecessary after the first call.

**Fix:** Use a module-level flag:
```typescript
let tableInitialized = false;

export function ensureProductionTrustTable(): void {
  if (tableInitialized) return;
  // ... existing DDL/DML ...
  tableInitialized = true;
}
```

### IN-02: CORS origin defaults to development value in production docker-compose

**File:** `docker-compose.yml:31`
**Issue:** `ACTUAL_CORS_ORIGIN` defaults to `http://localhost:3001` (the React dev server address) in the production docker-compose file. When the `.env` file omits this variable, the CORS policy allows the development origin in production. The `.env.example` comments explain this is "usually not needed," but a development-targeted default in a production topology is confusing.

**Fix:** Default to empty string:
```yaml
- ACTUAL_CORS_ORIGIN=${ACTUAL_CORS_ORIGIN:-}
```

---

_Reviewed: 2026-05-23T14:45:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
