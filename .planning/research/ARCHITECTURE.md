# Architecture Patterns

**Project:** Actual Budget Fork - Enable Banking Edition
**Domain:** Personal finance app with EU bank sync
**Researched:** 2026-02-18
**Overall confidence:** HIGH (based on direct source inspection of the Actual Budget monorepo)

## Recommended Architecture

Enable Banking integrates as a fourth bank sync provider alongside GoCardless, SimpleFIN, and Pluggy AI. The integration lives almost entirely in `packages/sync-server/src/` with a thin extension in `packages/loot-core/src/server/accounts/sync.ts` to route sync calls to the new provider.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         desktop-client (React)                       │
│                                                                       │
│  BankSyncUI components                                                │
│  - Bank selection modal (country picker, ASPSP list)                 │
│  - OAuth redirect flow trigger                                        │
│  - Consent expiry notification banner                                 │
│  - Manual sync button (per-account)                                   │
│                                                                       │
│  Calls: loot-core handlers via IPC bridge                             │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ IPC (worker bridge)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         loot-core (platform-agnostic)                │
│                                                                       │
│  packages/loot-core/src/server/accounts/sync.ts                      │
│  - syncAccount() routes on account.account_sync_source               │
│  - downloadEnableBankingTransactions() - NEW                         │
│  - processBankSyncDownload() - shared, unchanged                     │
│  - reconcileTransactions() - shared, unchanged                       │
│                                                                       │
│  packages/loot-core/src/types/models/account.ts                      │
│  - account_sync_source union: add 'enableBanking'                    │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ HTTP POST (X-ACTUAL-TOKEN auth)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    sync-server (Express)                              │
│                                                                       │
│  packages/sync-server/src/app.ts                                     │
│  - Mounts /enablebanking → enableBankingApp.handlers                 │
│                                                                       │
│  packages/sync-server/src/app-enablebanking/ (NEW MODULE)            │
│  ├── app-enablebanking.js      Express routes                        │
│  ├── enablebanking-service.js  API client (JWT + RSA)               │
│  ├── enablebanking.types.ts    TypeScript types                      │
│  ├── errors.js                 Custom error classes                  │
│  ├── utils.js                  Normalization helpers                 │
│  └── banks/                    Per-ASPSP overrides (optional)        │
│      └── bank.interface.ts     Adapter interface                     │
│                                                                       │
│  Scheduler (NEW)                                                      │
│  - node-cron inside sync-server process                              │
│  - Calls sync for all enable-banking accounts 4x/day                │
│  - Reads account list from sync-server DB                            │
│  - Writes consent expiry warnings to notification table              │
└──────────────────────┬───────────────────────────────────────────────┘
                       │ HTTPS (JWT Bearer, RSA-signed)
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                    Enable Banking API                                 │
│                    https://api.enablebanking.com                     │
│                                                                       │
│  GET  /aspsps?country=XX         - List available banks              │
│  POST /auth                       - Initiate bank OAuth redirect     │
│  POST /sessions                   - Exchange code for session        │
│  GET  /sessions/{id}              - Session status + account UIDs    │
│  GET  /accounts/{uid}/details     - Account metadata                │
│  GET  /accounts/{uid}/balances    - Current balances                 │
│  GET  /accounts/{uid}/transactions - Transactions (with pagination)  │
└──────────────────────────────────────────────────────────────────────┘
```

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `desktop-client` BankSync UI | Render bank picker, trigger OAuth flow, show consent warnings, show sync status | loot-core handlers via IPC bridge |
| `loot-core` sync.ts | Route sync calls per provider, delegate to processBankSyncDownload, own transaction reconciliation | sync-server Enable Banking endpoints (HTTP POST), SQLite DB (via loot-core DB layer) |
| `loot-core` types/models/account.ts | Type system: extend account_sync_source union with 'enableBanking' | Consumed by all other packages |
| `sync-server` app.ts | Mount /enablebanking route module | app-enablebanking module |
| `sync-server` app-enablebanking/app-enablebanking.js | Express routes: /status, /link, /get-banks, /get-accounts, /transactions, /delete-account | enablebanking-service.js, loot-core (via HTTP caller) |
| `sync-server` app-enablebanking/enablebanking-service.js | JWT generation (RSA), Enable Banking API calls, token caching, consent state storage | Enable Banking REST API |
| `sync-server` scheduler.js (new) | Cron: trigger sync for all enable-banking accounts 4x/day, check consent expiry | app-enablebanking routes or direct service calls |
| Enable Banking API | OAuth bank redirect, session creation, AIS data (accounts, balances, transactions) | Bank ASPSPs via PSD2 |

## Data Flow

### Initial Setup (one-time per bank)

```
User opens "Link bank" UI
  → desktop-client calls loot-core handler: 'enablebanking/get-banks' with country code
  → loot-core POSTs to sync-server /enablebanking/get-banks
  → sync-server calls Enable Banking GET /aspsps?country=XX
  → Returns bank list to UI (ASPSP name, id, logo)

User selects bank
  → desktop-client calls loot-core handler: 'enablebanking/create-auth'
  → loot-core POSTs to sync-server /enablebanking/link
  → sync-server calls Enable Banking POST /auth (with redirect_url pointing back to sync-server)
  → Returns redirect URL to desktop-client
  → desktop-client opens redirect URL in browser tab

User authenticates with bank
  → Bank redirects to sync-server callback URL with auth code
  → sync-server calls Enable Banking POST /sessions with auth code
  → Enable Banking returns session_id + account UIDs + access validity
  → sync-server stores: session_id, account UIDs, valid_until, ASPSP id in local DB
  → sync-server redirects user back to desktop-client with success signal

User maps Enable Banking accounts to Actual accounts
  → desktop-client calls loot-core handler: 'enablebanking/get-accounts'
  → loot-core POSTs to sync-server /enablebanking/get-accounts
  → sync-server calls Enable Banking GET /accounts/{uid}/details for each UID
  → Returns normalized account list (IBAN, name, currency)
  → User selects which accounts to track
  → loot-core writes account rows with account_sync_source = 'enableBanking'
```

### Scheduled Sync (4x/day)

```
node-cron fires (e.g., every 6 hours)
  → scheduler iterates all accounts where account_sync_source = 'enableBanking'
  → For each account:
      sync-server GET /accounts/{uid}/transactions?date_from={startDate}
      sync-server GET /accounts/{uid}/balances
      → POST to loot-core trigger or call sync handler directly
  → loot-core downloadEnableBankingTransactions()
      → normalizes transactions (booking date, amount, currency, payee, notes)
      → calls processBankSyncDownload()
      → reconcileTransactions() - fuzzy-matches against existing records
      → batchUpdateTransactions() - writes to SQLite
  → scheduler checks valid_until for each session
      → if < 14 days remaining: write consent_expiry_warning to notifications table
```

### Consent Renewal (every ~90 days)

```
User sees in-app notification: "Bank consent expires in X days"
  → Clicks "Renew consent"
  → desktop-client triggers same OAuth flow as Initial Setup
  → New session_id replaces old one in sync-server DB
  → Sync resumes without data loss (transactions already stored in SQLite)
```

### Manual Sync (user-triggered)

```
User clicks sync button on account
  → Same as Scheduled Sync but for one account, immediate
  → No cron involvement
```

## Patterns to Follow

### Pattern 1: Two-File Provider Module

Every sync provider in sync-server uses this pattern:
- `app-{provider}.js` - Express route definitions, error mapping, request/response shaping
- `{provider}-service.js` - API client logic, authentication, external HTTP calls

Do NOT merge these. Route logic and API client logic have different change reasons.

**Example structure (modeled on GoCardless):**
```typescript
// app-enablebanking.js - routes only
app.post('/transactions', handleError(async (req, res) => {
  const { sessionId, accountId, startDate } = req.body;
  const data = await enableBankingService.getTransactions(sessionId, accountId, startDate);
  res.json({ status: 'ok', data });
}));

// enablebanking-service.js - API client only
async getTransactions(sessionId, accountId, startDate) {
  const jwt = this.generateJWT();  // RSA-signed
  const response = await axios.get(
    `${API_BASE}/accounts/${accountId}/transactions`,
    { headers: { Authorization: `Bearer ${jwt}` }, params: { date_from: startDate } }
  );
  return this.normalizeTransactions(response.data.transactions);
}
```

### Pattern 2: JWT Generation Per Request

Enable Banking uses short-lived JWTs (max 24 hours, recommend 1 hour). Generate a new JWT for every API call or cache with a TTL. Do NOT store a long-lived token.

```typescript
generateJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600,  // 1 hour
  };
  return jwt.sign(payload, this.rsaPrivateKey, {
    algorithm: 'RS256',
    keyid: this.applicationId,
  });
}
```

### Pattern 3: NormalizedTransaction Shape

loot-core expects this shape from `downloadEnableBankingTransactions()`:
```typescript
{
  transactions: {
    booked: NormalizedTransaction[],
    pending: NormalizedTransaction[],
  },
  startingBalance: number,    // in minor units (cents)
  currentBalance: number,     // in minor units (cents)
}

// NormalizedTransaction fields loot-core reads:
{
  transaction_id: string,   // used for dedup (importId)
  date: string,             // YYYY-MM-DD
  amount: number,           // in minor units, negative = debit
  payee_name: string,       // creditorName or debtorName
  notes: string,            // remittanceInformationUnstructured
}
```

### Pattern 4: account_sync_source Extension

The `account_sync_source` union type must be extended to include `'enableBanking'`. This is the single schema change required in loot-core.

```typescript
// packages/loot-core/src/types/models/account.ts
type AccountSyncSource = 'goCardless' | 'simpleFin' | 'pluggyai' | 'enableBanking';
```

And in `sync.ts`:
```typescript
// Add a fourth branch in syncAccount():
} else if (acctRow.account_sync_source === 'enableBanking') {
  const res = await downloadEnableBankingTransactions(userId, acctId, acctRow.bank_id, startDate);
  // ...
}
```

### Pattern 5: Scheduled Sync via node-cron

Native scheduling inside sync-server is preferable to an external Docker sidecar because:
- Single container to manage
- Direct access to sync-server's DB (session storage, account list)
- No external auth needed

```typescript
// packages/sync-server/src/scheduler.js (new file)
import cron from 'node-cron';

// 4x/day: midnight, 6am, noon, 6pm
cron.schedule('0 0,6,12,18 * * *', async () => {
  const accounts = await db.all(
    "SELECT * FROM accounts WHERE account_sync_source = 'enableBanking' AND closed = 0"
  );
  for (const account of accounts) {
    await triggerEnableBankingSync(account);
    await checkConsentExpiry(account);
  }
});
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using the GoCardless Route for Enable Banking

**What:** Reusing or modifying `/gocardless` endpoints to handle Enable Banking
**Why bad:** Different session model (Enable Banking sessions vs GoCardless requisitions), different auth (RSA JWT vs API key), diverges over time, breaks GoCardless for existing users
**Instead:** New `app-enablebanking` module, mounted at `/enablebanking`, mirrors the GoCardless pattern structurally but is fully independent

### Anti-Pattern 2: Storing the RSA Private Key in Environment Variables as Plaintext String

**What:** `ENABLE_BANKING_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----...`
**Why bad:** Multi-line env vars are fragile in Docker Compose, MSYS mangles them, some tools truncate
**Instead:** Store as a file path: `ENABLE_BANKING_PRIVATE_KEY_PATH=/run/secrets/eb_rsa_key`. Mount the key file as a Docker secret or bind mount. Read the file at startup.

### Anti-Pattern 3: Polling Enable Banking API More Than 4x/Day

**What:** More frequent scheduled syncs or syncing per user action without debounce
**Why bad:** PSD2 allows max 4 API calls/day per account per bank. Exceeding triggers rate limit errors, may result in session revocation
**Instead:** Enforce a minimum 6-hour gap between syncs per account in the scheduler. Manual sync button should check last_sync timestamp and skip if < 6 hours ago.

### Anti-Pattern 4: Triggering Sync from loot-core via the Same HTTP Path as the Frontend

**What:** Scheduler in loot-core calling the sync-server's public HTTP API on a cron
**Why bad:** loot-core is platform-agnostic - it runs in a web worker, not a server process. Cron cannot run in a browser context.
**Instead:** Scheduler lives in sync-server. It calls Enable Banking API directly via enablebanking-service.js, then uses the same loot-core processing by publishing to the existing sync mechanism.

### Anti-Pattern 5: Per-Bank Adapter Files for Enable Banking (at first)

**What:** Creating banks/ subdirectory with per-ASPSP overrides immediately
**Why bad:** Enable Banking normalizes data better than GoCardless across ASPSPs. A generic normalizer handles 95% of cases. Per-bank files add complexity before you know they're needed.
**Instead:** Start with a single generic normalizer. Add per-ASPSP overrides only when a specific bank's data format requires it.

## Where New Code Lives in the Monorepo

```
packages/
  sync-server/
    src/
      app-enablebanking/           ← NEW: complete new directory
        app-enablebanking.js       ← Express routes (mirrors app-gocardless.js)
        enablebanking-service.js   ← API client with JWT/RSA auth
        enablebanking.types.ts     ← TypeScript types for Enable Banking data
        errors.js                  ← Custom error classes
        utils.js                   ← Transaction/account normalization
        banks/                     ← DEFER: per-ASPSP overrides, only if needed
          bank.interface.ts
      app.ts                       ← MODIFY: mount /enablebanking route
      scheduler.js                 ← NEW: node-cron for 4x/day sync

  loot-core/
    src/
      server/
        accounts/
          sync.ts                  ← MODIFY: add 'enableBanking' branch in syncAccount()
                                             add downloadEnableBankingTransactions()
      types/
        models/
          account.ts               ← MODIFY: add 'enableBanking' to account_sync_source union

  desktop-client/
    src/
      components/
        banksync/                  ← MODIFY: existing GoCardless UI components
          EnableBankingLink.tsx    ← NEW: bank selection + OAuth trigger UI
          ConsentExpiryBanner.tsx  ← NEW: consent renewal notification
          EnableBankingSettings.tsx ← NEW: per-account sync settings
```

## Suggested Build Order

Dependencies between components dictate this order:

**Step 1: Enable Banking API client and routes (sync-server)**
Build first because loot-core depends on this HTTP interface being defined.
- `enablebanking-service.js` (JWT generation, API calls to Enable Banking)
- `app-enablebanking.js` (Express routes: /status, /get-banks, /link, /get-accounts, /transactions)
- Mount in `app.ts`
- Test with Enable Banking sandbox (Mock ASPSP)

**Step 2: loot-core sync extension**
Depends on Step 1's route contract being stable.
- Extend `account_sync_source` type to include `'enableBanking'`
- Add `downloadEnableBankingTransactions()` to `sync.ts`
- Add `'enableBanking'` branch to `syncAccount()`
- Verify processBankSyncDownload() works with Enable Banking normalized data (no changes expected)

**Step 3: Scheduled sync (sync-server)**
Depends on Steps 1 and 2 being functional end-to-end.
- Add `node-cron` dependency
- Implement `scheduler.js` with 4x/day cadence
- Add consent expiry checking (flag sessions with < 14 days remaining)
- Add notification storage for expiry warnings

**Step 4: UI components (desktop-client)**
Depends on loot-core handlers from Steps 1-2 being complete.
- Bank selection modal with country picker and ASPSP list
- OAuth redirect trigger and callback handling
- Account mapping UI (link Enable Banking accounts to Actual accounts)
- Consent expiry notification banner (reads from notifications table)

**Step 5: PWA hardening (desktop-client)**
Independent of Steps 1-4 (can be done in parallel or after).
- Verify existing `site.webmanifest` and `vite-plugin-pwa` config are sufficient
- Service worker build currently disabled in vite.config.mts due to offline support issues - investigate and fix
- Test PWA install on mobile Chrome and Safari

**Step 6: Docker Compose + HTTPS**
Independent of all above (infrastructure). Required for PWA installability.
- Docker Compose with sync-server + desktop-client containers
- RSA key mount as Docker secret
- HTTPS termination (Caddy recommended: automatic cert management)

## Scalability Considerations

This is a single-user personal deployment. Scalability concerns are minimal but two are worth noting:

| Concern | At current scale (1 user) | If scaled |
|---------|--------------------------|-----------|
| PSD2 rate limit (4x/day) | Fully respected by scheduler | Unchanged - PSD2 limit is per-account, not per-instance |
| Consent management | Manual renewal via in-app notification | Would need automated re-consent flow |
| Session storage | In-memory or sync-server local DB | Would need shared DB (Redis/Postgres) for multi-instance |
| RSA key management | Single file mount | Would need secrets manager (Vault, AWS KMS) |

## Key Findings from Research

**GoCardless adapter is now in sync-server, not loot-core.** The `actual-server` repo was archived in February 2025. All bank sync adapters now live in `packages/sync-server/src/app-gocardless/`. This is where Enable Banking goes.

**Actual Budget already has PWA infrastructure.** The `desktop-client` has `site.webmanifest`, maskable icons, screenshots, and `vite-plugin-pwa` configured. The service worker build is disabled due to offline issues but the scaffolding exists. This reduces PWA work significantly.

**account_sync_source is a typed union.** Adding Enable Banking requires modifying exactly one type definition in loot-core plus one branch in `syncAccount()`. The rest of transaction processing (reconciliation, dedup, rule application) is shared and unchanged.

**Scheduled sync is not built in.** GitHub issue #3831 confirms native scheduled sync is a feature request, not yet shipped. External tools exist (actual-auto-sync Docker sidecar), but implementing it inside sync-server via node-cron is cleaner for a fork.

**Enable Banking consent expiry differs from GoCardless.** GoCardless requisitions expire at 90 days. Enable Banking uses a `valid_until` field set at session creation time (configurable, max varies per bank but typically 90 days per PSD2). This must be stored and monitored.

## Sources

- Actual Budget monorepo, `packages/sync-server/src/app-gocardless/`: [github.com/actualbudget/actual](https://github.com/actualbudget/actual)
- GoCardless adapter README: [github.com/actualbudget/actual/blob/master/packages/sync-server/src/app-gocardless/README.md](https://github.com/actualbudget/actual/blob/master/packages/sync-server/src/app-gocardless/README.md)
- loot-core sync.ts: [github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/accounts/sync.ts](https://github.com/actualbudget/actual/blob/master/packages/loot-core/src/server/accounts/sync.ts)
- Enable Banking API Quick Start: [enablebanking.com/docs/api/quick-start/](https://enablebanking.com/docs/api/quick-start/)
- Enable Banking API Reference: [enablebanking.com/docs/api/reference/](https://enablebanking.com/docs/api/reference/)
- Enable Banking Sandbox: [enablebanking.com/docs/api/sandbox/](https://enablebanking.com/docs/api/sandbox/)
- actual-auto-sync (external scheduler reference): [github.com/seriouslag/actual-auto-sync](https://github.com/seriouslag/actual-auto-sync)
- Actual Budget releases (PWA history): [actualbudget.org/docs/releases/](https://actualbudget.org/docs/releases/)
- Scheduled sync feature request: [github.com/actualbudget/actual/issues/3831](https://github.com/actualbudget/actual/issues/3831)
