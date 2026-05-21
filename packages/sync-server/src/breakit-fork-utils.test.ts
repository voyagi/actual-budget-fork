import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  _resetAlerter,
  acknowledgeAlert,
  getRecentAlerts,
  triggerAlert,
} from './util/alerter.js';
import {
  _resetMetrics,
  getBackupStats,
  getLatencyPercentiles,
  getSyncStats,
  recordBackupRun,
  recordLatency,
  recordSyncRun,
} from './util/metrics.js';

vi.mock('./util/logger.js', () => ({
  default: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    log: vi.fn(),
  },
}));

// ============================================================
// BREAKIT: metrics.ts
// ============================================================
describe('BREAKIT: metrics', () => {
  beforeEach(() => {
    _resetMetrics();
  });

  describe('Boundary Assault', () => {
    it('getLatencyPercentiles returns null on empty samples', () => {
      expect(getLatencyPercentiles()).toBeNull();
    });

    it('getLatencyPercentiles with a single sample returns that sample for all percentiles', () => {
      recordLatency(42);
      const result = getLatencyPercentiles()!;
      expect(result.p50).toBe(42);
      expect(result.p95).toBe(42);
      expect(result.p99).toBe(42);
    });

    it('recordLatency with zero', () => {
      recordLatency(0);
      const result = getLatencyPercentiles()!;
      expect(result.p50).toBe(0);
    });

    it('recordLatency with negative value', () => {
      recordLatency(-100);
      const result = getLatencyPercentiles()!;
      expect(result.p50).toBe(-100);
    });

    it('recordLatency with MAX_SAFE_INTEGER', () => {
      recordLatency(Number.MAX_SAFE_INTEGER);
      const result = getLatencyPercentiles()!;
      expect(result.p50).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('recordSyncRun with zero accounts and zero errors', () => {
      recordSyncRun(0, 0);
      const stats = getSyncStats();
      expect(stats.successRuns).toBe(1);
      expect(stats.failedRuns).toBe(0);
    });

    it('recordSyncRun with negative accounts', () => {
      recordSyncRun(-5, 0);
      const stats = getSyncStats();
      expect(stats.lastRunAccounts).toBe(-5);
    });

    it('recordBackupRun with zero size success', () => {
      recordBackupRun(0, true);
      const stats = getBackupStats();
      expect(stats.successRuns).toBe(1);
      expect(stats.lastRunSizeBytes).toBe(0);
    });
  });

  describe('Type Confusion', () => {
    it('recordLatency with NaN silently drops the sample', () => {
      recordLatency(NaN);
      // NaN is rejected by the Number.isFinite guard
      expect(getLatencyPercentiles()).toBeNull();
    });

    it('recordLatency with Infinity silently drops the sample', () => {
      recordLatency(Infinity);
      // Infinity is rejected by the Number.isFinite guard
      expect(getLatencyPercentiles()).toBeNull();
    });

    it('recordLatency with -Infinity silently drops the sample', () => {
      recordLatency(-Infinity);
      // -Infinity is rejected by the Number.isFinite guard
      expect(getLatencyPercentiles()).toBeNull();
    });

    it('NaN in latency samples is silently dropped, sort stays correct', () => {
      recordLatency(1);
      recordLatency(NaN);
      recordLatency(2);
      recordLatency(3);
      const result = getLatencyPercentiles()!;
      // NaN rejected by guard, only [1, 2, 3] remain
      expect(Number.isFinite(result.p50)).toBe(true);
      expect(Number.isFinite(result.p95)).toBe(true);
      expect(Number.isFinite(result.p99)).toBe(true);
    });
  });

  describe('Mutation Detectors', () => {
    it('recordSyncRun: errors === 0 means success, errors === 1 means failure', () => {
      recordSyncRun(10, 0);
      expect(getSyncStats().successRuns).toBe(1);
      expect(getSyncStats().failedRuns).toBe(0);

      recordSyncRun(10, 1);
      expect(getSyncStats().successRuns).toBe(1);
      expect(getSyncStats().failedRuns).toBe(1);
    });

    it('recordBackupRun: true means success, false means failure', () => {
      recordBackupRun(100, true);
      expect(getBackupStats().successRuns).toBe(1);
      expect(getBackupStats().failedRuns).toBe(0);

      recordBackupRun(100, false);
      expect(getBackupStats().successRuns).toBe(1);
      expect(getBackupStats().failedRuns).toBe(1);
    });
  });

  describe('State Corruption', () => {
    it('concurrent recordLatency calls do not lose samples', async () => {
      const promises = Array.from({ length: 100 }, (_, i) =>
        Promise.resolve().then(() => recordLatency(i)),
      );
      await Promise.all(promises);
      const result = getLatencyPercentiles()!;
      expect(result).toBeDefined();
    });

    it('concurrent recordSyncRun calls accumulate correctly', async () => {
      const promises = Array.from({ length: 50 }, () =>
        Promise.resolve().then(() => recordSyncRun(1, 0)),
      );
      await Promise.all(promises);
      const stats = getSyncStats();
      expect(stats.totalRuns).toBe(50);
      expect(stats.successRuns).toBe(50);
    });
  });

  describe('Resource Pressure', () => {
    it('recordLatency respects MAX_SAMPLES (1000) cap', () => {
      for (let i = 0; i < 1100; i++) {
        recordLatency(i);
      }
      const result = getLatencyPercentiles()!;
      // After 1100 inserts, oldest 100 should be evicted
      // p50 should be around the 600th remaining value
      expect(result.p50).toBeGreaterThanOrEqual(100);
    });

    it('getLatencyPercentiles with exactly MAX_SAMPLES', () => {
      for (let i = 0; i < 1000; i++) {
        recordLatency(i);
      }
      const result = getLatencyPercentiles()!;
      expect(result.p50).toBe(500);
      expect(result.p95).toBe(950);
      expect(result.p99).toBe(990);
    });
  });
});

// ============================================================
// BREAKIT: alerter.ts
// ============================================================
describe('BREAKIT: alerter', () => {
  beforeEach(() => {
    _resetAlerter();
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Boundary Assault', () => {
    it('triggerAlert with empty string event_type', async () => {
      await triggerAlert({
        event_type: '',
        message: 'test',
        severity: 'info',
      });
      const alerts = getRecentAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0].event_type).toBe('');
    });

    it('triggerAlert with empty message', async () => {
      await triggerAlert({
        event_type: 'test',
        message: '',
        severity: 'info',
      });
      expect(getRecentAlerts()).toHaveLength(1);
    });

    it('acknowledgeAlert with empty string id returns false', () => {
      expect(acknowledgeAlert('')).toBe(false);
    });
  });

  describe('Type Confusion', () => {
    it('triggerAlert severity accepts only valid union values at runtime', async () => {
      // Even though TS restricts this, runtime could receive anything via API
      await triggerAlert({
        event_type: 'test',
        message: 'msg',
        severity: 'invalid_severity' as 'info',
      });
      const alerts = getRecentAlerts();
      expect(alerts).toHaveLength(1);
      // The severity is stored as-is, no runtime validation
      expect(alerts[0].severity).toBe('invalid_severity');
    });
  });

  describe('Security Payloads', () => {
    it('XSS payload in message is stored raw (no sanitization)', async () => {
      await triggerAlert({
        event_type: 'xss_test',
        message: '<script>alert(document.cookie)</script>',
        severity: 'error',
      });
      const alerts = getRecentAlerts();
      expect(alerts[0].message).toBe(
        '<script>alert(document.cookie)</script>',
      );
    });

    it('SQL injection payload in event_type', async () => {
      await triggerAlert({
        event_type: "'; DROP TABLE alerts; --",
        message: 'test',
        severity: 'info',
      });
      const alerts = getRecentAlerts();
      expect(alerts[0].event_type).toBe("'; DROP TABLE alerts; --");
    });

    it('CRLF injection in message field sent to webhook', async () => {
      vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert');
      await triggerAlert({
        event_type: 'crlf',
        message: 'line1\r\nX-Injected: header',
        severity: 'info',
      });
      expect(fetch).toHaveBeenCalledOnce();
      const body = JSON.parse(
        (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
      );
      // The CRLF should be in the JSON string, not interpreted as HTTP headers
      expect(body.message).toBe('line1\r\nX-Injected: header');
    });
  });

  describe('Mutation Detectors', () => {
    it('cooldown boundary: alert at exactly COOLDOWN_MS should fire again', async () => {
      const now = 1000000000000;
      // triggerAlert calls Date.now() twice per invocation:
      // once for cooldown check, once for cooldowns.set
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)               // 1st alert: cooldown check
        .mockReturnValueOnce(now)               // 1st alert: cooldowns.set
        .mockReturnValueOnce(now + 3600000)     // 2nd alert: cooldown check (exactly 1h)
        .mockReturnValueOnce(now + 3600000);    // 2nd alert: cooldowns.set

      await triggerAlert({
        event_type: 'cooldown_test',
        message: 'first',
        severity: 'info',
      });
      await triggerAlert({
        event_type: 'cooldown_test',
        message: 'second',
        severity: 'info',
      });

      // At exactly COOLDOWN_MS, Date.now() - lastFired === COOLDOWN_MS
      // The check is `< COOLDOWN_MS` so exactly equal should NOT be suppressed
      const alerts = getRecentAlerts();
      expect(alerts).toHaveLength(2);
    });

    it('cooldown boundary: alert at COOLDOWN_MS - 1 should be suppressed', async () => {
      const now = 1000000000000;
      vi.spyOn(Date, 'now')
        .mockReturnValueOnce(now)               // 1st alert: cooldown check
        .mockReturnValueOnce(now)               // 1st alert: cooldowns.set
        .mockReturnValueOnce(now + 3599999)     // 2nd alert: cooldown check
        .mockReturnValueOnce(now + 3599999);    // 2nd alert: cooldowns.set

      await triggerAlert({
        event_type: 'cooldown_test2',
        message: 'first',
        severity: 'info',
      });
      await triggerAlert({
        event_type: 'cooldown_test2',
        message: 'second',
        severity: 'info',
      });

      expect(getRecentAlerts()).toHaveLength(1);
    });

    it('MAX_ALERTS boundary: exactly 50 alerts fills without eviction', async () => {
      for (let i = 0; i < 50; i++) {
        await triggerAlert({
          event_type: `fill_${i}`,
          message: `msg ${i}`,
          severity: 'info',
        });
      }
      expect(getRecentAlerts()).toHaveLength(50);
      expect(getRecentAlerts()[0].event_type).toBe('fill_0');
    });

    it('MAX_ALERTS + 1: evicts the oldest', async () => {
      for (let i = 0; i < 51; i++) {
        await triggerAlert({
          event_type: `fill_${i}`,
          message: `msg ${i}`,
          severity: 'info',
        });
      }
      const alerts = getRecentAlerts();
      expect(alerts).toHaveLength(50);
      expect(alerts[0].event_type).toBe('fill_1');
    });
  });

  describe('Fault Injection', () => {
    it('fetch throws TypeError (network down) - triggerAlert does not throw', async () => {
      vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      );
      await expect(
        triggerAlert({
          event_type: 'network_down',
          message: 'test',
          severity: 'error',
        }),
      ).resolves.toBeUndefined();
      // Alert should still be stored in memory despite webhook failure
      expect(getRecentAlerts()).toHaveLength(1);
    });

    it('fetch hangs beyond 5s timeout - triggerAlert does not hang', async () => {
      vi.stubEnv('ALERT_WEBHOOK_URL', 'https://hooks.example.com/alert');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError')),
      );
      await expect(
        triggerAlert({
          event_type: 'timeout',
          message: 'test',
          severity: 'error',
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('State Corruption', () => {
    it('concurrent alerts with different event_types all stored', async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        triggerAlert({
          event_type: `concurrent_${i}`,
          message: `msg ${i}`,
          severity: 'info',
        }),
      );
      await Promise.all(promises);
      expect(getRecentAlerts()).toHaveLength(20);
    });

    it('acknowledging during concurrent inserts does not corrupt state', async () => {
      // Pre-fill with one alert
      await triggerAlert({
        event_type: 'pre_fill',
        message: 'will ack',
        severity: 'info',
      });
      const [alert] = getRecentAlerts();

      // Concurrently add more AND acknowledge
      const addPromises = Array.from({ length: 10 }, (_, i) =>
        triggerAlert({
          event_type: `during_${i}`,
          message: `msg ${i}`,
          severity: 'info',
        }),
      );
      acknowledgeAlert(alert.id);
      await Promise.all(addPromises);

      // pre_fill should be gone
      const remaining = getRecentAlerts();
      expect(remaining.find((a) => a.event_type === 'pre_fill')).toBeUndefined();
    });
  });
});

// ============================================================
// BREAKIT: production-trust.ts (pure functions only)
// ============================================================

// We import the pure functions that don't need DB access.
// DB-dependent functions would need account-db mock which is complex.
import {
  isProductionTrustCondition,
  PRODUCTION_TRUST_CONDITIONS,
} from './util/production-trust.js';

// Access non-exported pure functions by importing the module and testing
// through the public API that uses them internally.
// For redactEvidence and serializeEvidence, we test through
// recordProductionTrustUntrusted which calls them.

describe('BREAKIT: production-trust (pure)', () => {
  describe('Boundary Assault', () => {
    it('isProductionTrustCondition with empty string returns false', () => {
      expect(isProductionTrustCondition('')).toBe(false);
    });

    it('isProductionTrustCondition with null returns false', () => {
      expect(isProductionTrustCondition(null)).toBe(false);
    });

    it('isProductionTrustCondition with undefined returns false', () => {
      expect(isProductionTrustCondition(undefined)).toBe(false);
    });

    it('isProductionTrustCondition with valid conditions returns true', () => {
      for (const condition of PRODUCTION_TRUST_CONDITIONS) {
        expect(isProductionTrustCondition(condition)).toBe(true);
      }
    });

    it('isProductionTrustCondition with close-but-wrong strings', () => {
      expect(isProductionTrustCondition('Access')).toBe(false);
      expect(isProductionTrustCondition('ACCESS')).toBe(false);
      expect(isProductionTrustCondition('access ')).toBe(false);
      expect(isProductionTrustCondition(' access')).toBe(false);
      expect(isProductionTrustCondition('bank_sync_')).toBe(false);
    });
  });

  describe('Type Confusion', () => {
    it('isProductionTrustCondition with number', () => {
      expect(isProductionTrustCondition(0)).toBe(false);
      expect(isProductionTrustCondition(1)).toBe(false);
    });

    it('isProductionTrustCondition with boolean', () => {
      expect(isProductionTrustCondition(true)).toBe(false);
      expect(isProductionTrustCondition(false)).toBe(false);
    });

    it('isProductionTrustCondition with object', () => {
      expect(isProductionTrustCondition({ toString: () => 'access' })).toBe(
        false,
      );
    });

    it('isProductionTrustCondition with array containing valid value', () => {
      expect(isProductionTrustCondition(['access'])).toBe(false);
    });
  });

  describe('Security Payloads', () => {
    it('isProductionTrustCondition rejects injection payloads', () => {
      expect(isProductionTrustCondition("' OR '1'='1")).toBe(false);
      expect(isProductionTrustCondition('access; DROP TABLE')).toBe(false);
      expect(isProductionTrustCondition('__proto__')).toBe(false);
      expect(isProductionTrustCondition('constructor')).toBe(false);
    });
  });

  describe('Mutation Detectors', () => {
    it('PRODUCTION_TRUST_CONDITIONS has exactly 4 entries', () => {
      expect(PRODUCTION_TRUST_CONDITIONS).toHaveLength(4);
    });

    it('each condition is unique', () => {
      const unique = new Set(PRODUCTION_TRUST_CONDITIONS);
      expect(unique.size).toBe(PRODUCTION_TRUST_CONDITIONS.length);
    });
  });
});

// ============================================================
// BREAKIT: scheduler.ts (applyJitter - pure function)
// ============================================================
import { applyJitter, syncAccountWithRetry } from './scheduler.js';

describe('BREAKIT: scheduler', () => {
  describe('applyJitter - Boundary Assault', () => {
    it('delay of 0 always returns 0 regardless of jitter fraction', () => {
      for (let i = 0; i < 20; i++) {
        expect(applyJitter(0, 0.5)).toBe(0);
      }
    });

    it('delay of -1 returns a value near -1', () => {
      const result = applyJitter(-1, 0.2);
      expect(result).toBeGreaterThanOrEqual(-2);
      expect(result).toBeLessThanOrEqual(0);
    });

    it('delay of MAX_SAFE_INTEGER does not overflow', () => {
      const result = applyJitter(Number.MAX_SAFE_INTEGER, 0.0);
      expect(Number.isFinite(result)).toBe(true);
    });
  });

  describe('applyJitter - Type Confusion', () => {
    it('NaN delay returns NaN', () => {
      const result = applyJitter(NaN, 0.2);
      expect(Number.isNaN(result)).toBe(true);
    });

    it('Infinity delay returns Infinity or NaN', () => {
      const result = applyJitter(Infinity, 0.2);
      // Math.round(Infinity * (1 + jitter)) = Infinity
      expect(result === Infinity || Number.isNaN(result)).toBe(true);
    });

    it('NaN jitterFraction produces NaN delay', () => {
      const result = applyJitter(1000, NaN);
      expect(Number.isNaN(result)).toBe(true);
    });
  });

  describe('applyJitter - Property Violations', () => {
    it('jitterFraction of 0 produces exactly the input delay', () => {
      for (let i = 0; i < 20; i++) {
        expect(applyJitter(5000, 0)).toBe(5000);
      }
    });

    it('result is within [delay * (1-frac), delay * (1+frac)]', () => {
      const delay = 1000;
      const frac = 0.2;
      for (let i = 0; i < 50; i++) {
        const result = applyJitter(delay, frac);
        expect(result).toBeGreaterThanOrEqual(Math.round(delay * (1 - frac)));
        expect(result).toBeLessThanOrEqual(Math.round(delay * (1 + frac)));
      }
    });
  });

  describe('applyJitter - Mutation Detectors', () => {
    it('jitterFraction of 1.0: result can be up to 2x the delay', () => {
      // With frac=1.0, jitter = random*2-1 in [-1,1], so result in [0, 2*delay]
      vi.spyOn(Math, 'random').mockReturnValue(1.0); // max jitter
      expect(applyJitter(1000, 1.0)).toBe(2000);
      vi.restoreAllMocks();
    });

    it('jitterFraction of 1.0: result can be 0', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.0); // min jitter
      expect(applyJitter(1000, 1.0)).toBe(0);
      vi.restoreAllMocks();
    });
  });

  describe('syncAccountWithRetry - Error Path Torture', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('immediate success on first call - no retries', async () => {
      const syncFn = vi.fn().mockResolvedValue(undefined);
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 3,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct');
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it('fails once then succeeds - one retry', async () => {
      const syncFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(undefined);
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 3,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct');
      expect(syncFn).toHaveBeenCalledTimes(2);
      expect(sleepFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).toHaveBeenCalledWith(100);
    });

    it('exhausts all retries then throws', async () => {
      const err = new Error('persistent');
      const syncFn = vi.fn().mockRejectedValue(err);
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 2,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await expect(
        syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
      ).rejects.toThrow('persistent');
      // 1 initial + 2 retries = 3 total calls
      expect(syncFn).toHaveBeenCalledTimes(3);
      expect(sleepFn).toHaveBeenCalledTimes(2);
    });

    it('maxRetries of 0 means only one attempt, no retries', async () => {
      const syncFn = vi.fn().mockRejectedValue(new Error('fail'));
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 0,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await expect(
        syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
      ).rejects.toThrow('fail');
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it('exponential backoff with maxDelay cap', async () => {
      const syncFn = vi.fn().mockRejectedValue(new Error('fail'));
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 4,
        initialDelay: 100,
        multiplier: 3,
        maxDelay: 500,
        jitterFraction: 0,
      };

      await expect(
        syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
      ).rejects.toThrow();

      // Delays: 100, 300, 500 (capped), 500 (capped)
      expect(sleepFn).toHaveBeenCalledTimes(4);
      expect(sleepFn.mock.calls[0][0]).toBe(100);
      expect(sleepFn.mock.calls[1][0]).toBe(300);
      expect(sleepFn.mock.calls[2][0]).toBe(500);
      expect(sleepFn.mock.calls[3][0]).toBe(500);
    });
  });

  describe('syncAccountWithRetry - Fault Injection', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('RateLimitError bypasses retry - propagates immediately', async () => {
      // We need to import the actual error class
      const { RateLimitError } = await import(
        './app-enablebanking/errors.js'
      );
      const syncFn = vi.fn().mockRejectedValue(new RateLimitError('429'));
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 5,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await expect(
        syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
      ).rejects.toThrow(RateLimitError);
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it('SessionExpiredError bypasses retry - propagates immediately', async () => {
      const { SessionExpiredError } = await import(
        './app-enablebanking/errors.js'
      );
      const syncFn = vi
        .fn()
        .mockRejectedValue(new SessionExpiredError('expired'));
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 5,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await expect(
        syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
      ).rejects.toThrow(SessionExpiredError);
      expect(syncFn).toHaveBeenCalledTimes(1);
      expect(sleepFn).not.toHaveBeenCalled();
    });

    it('non-Error thrown (string) is retried then propagated', async () => {
      const syncFn = vi.fn().mockRejectedValue('string error');
      const sleepFn = vi.fn().mockResolvedValue(undefined);
      const policy = {
        maxRetries: 1,
        initialDelay: 100,
        multiplier: 2,
        maxDelay: 1000,
        jitterFraction: 0,
      };

      await expect(
        syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
      ).rejects.toBe('string error');
      expect(syncFn).toHaveBeenCalledTimes(2);
    });
  });
});

// ============================================================
// ESCALATION: harder variants
// ============================================================
describe('ESCALATION: metrics', () => {
  beforeEach(() => {
    _resetMetrics();
  });

  it('latency percentiles with all-NaN samples returns null (all rejected)', () => {
    for (let i = 0; i < 10; i++) recordLatency(NaN);
    // All NaN samples are rejected by Number.isFinite guard
    expect(getLatencyPercentiles()).toBeNull();
  });

  it('latency percentiles with mix of NaN and finite keeps only finite', () => {
    for (let i = 0; i < 50; i++) recordLatency(i);
    for (let i = 0; i < 50; i++) recordLatency(NaN);
    const result = getLatencyPercentiles()!;
    // Only 50 finite values remain, NaN samples silently dropped
    expect(Number.isFinite(result.p50)).toBe(true);
  });

  it('latency percentiles with Infinity values dropped by guard', () => {
    for (let i = 0; i < 99; i++) recordLatency(i);
    recordLatency(Infinity);
    const result = getLatencyPercentiles()!;
    // Infinity is rejected, only 99 finite samples remain
    expect(Number.isFinite(result.p99)).toBe(true);
    expect(Number.isFinite(result.p50)).toBe(true);
  });

  it('latency percentiles with negative values', () => {
    for (let i = -50; i < 50; i++) recordLatency(i);
    const result = getLatencyPercentiles()!;
    expect(result.p50).toBeGreaterThanOrEqual(-1);
    expect(result.p50).toBeLessThanOrEqual(1);
  });

  it('recordSyncRun with NaN accounts does not produce finite stats', () => {
    recordSyncRun(NaN, NaN);
    const stats = getSyncStats();
    // NaN errors: errors === 0 is false (NaN !== 0), so it counts as failure
    expect(stats.failedRuns).toBe(1);
    // NaN accounts stored as-is
    expect(Number.isNaN(stats.lastRunAccounts)).toBe(true);
  });

  it('recordBackupRun with NaN size', () => {
    recordBackupRun(NaN, true);
    const stats = getBackupStats();
    expect(stats.successRuns).toBe(1);
    expect(Number.isNaN(stats.lastRunSizeBytes)).toBe(true);
  });
});

describe('ESCALATION: alerter', () => {
  beforeEach(() => {
    _resetAlerter();
    vi.unstubAllEnvs();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rapid-fire 100 unique alerts with concurrent acknowledges', async () => {
    // Fill to capacity
    for (let i = 0; i < 50; i++) {
      await triggerAlert({
        event_type: `rapid_${i}`,
        message: `msg ${i}`,
        severity: 'info',
      });
    }

    // Acknowledge half while adding more
    const alerts = getRecentAlerts();
    for (let i = 0; i < 25; i++) {
      acknowledgeAlert(alerts[i].id);
    }

    // Add 25 more
    for (let i = 50; i < 75; i++) {
      await triggerAlert({
        event_type: `rapid_${i}`,
        message: `msg ${i}`,
        severity: 'info',
      });
    }

    const remaining = getRecentAlerts();
    // Should have 25 surviving originals + 25 new = 50
    expect(remaining).toHaveLength(50);
  });

  it('alert with extremely long message (100KB) does not crash', async () => {
    await triggerAlert({
      event_type: 'long_msg',
      message: 'x'.repeat(100000),
      severity: 'info',
    });
    const alerts = getRecentAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].message).toHaveLength(100000);
  });

  it('alert with unicode and emoji in message', async () => {
    const msg = '日本語テスト 🚀🔥 Ñoño café résumé';
    await triggerAlert({
      event_type: 'unicode',
      message: msg,
      severity: 'info',
    });
    expect(getRecentAlerts()[0].message).toBe(msg);
  });

  it('alert with null bytes in event_type', async () => {
    await triggerAlert({
      event_type: 'null\x00byte',
      message: 'test',
      severity: 'info',
    });
    expect(getRecentAlerts()[0].event_type).toBe('null\x00byte');
  });
});

describe('ESCALATION: scheduler', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applyJitter with MAX_SAFE_INTEGER and high jitter may overflow', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1.0);
    const result = applyJitter(Number.MAX_SAFE_INTEGER, 0.5);
    // MAX_SAFE_INTEGER * 1.5 exceeds safe integer range
    expect(Number.isFinite(result)).toBe(true);
    // But precision is lost
    expect(Number.isSafeInteger(result)).toBe(false);
  });

  it('syncAccountWithRetry with negative maxRetries clamps to 0 (one attempt)', async () => {
    const syncFn = vi.fn().mockRejectedValue(new Error('fail'));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const policy = {
      maxRetries: -1,
      initialDelay: 100,
      multiplier: 2,
      maxDelay: 1000,
      jitterFraction: 0,
    };

    // Math.max(0, -1) = 0, so syncFn is called once (no retries)
    await expect(
      syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
    ).rejects.toThrow('fail');
    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('syncAccountWithRetry with NaN initialDelay', async () => {
    const syncFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue(undefined);
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const policy = {
      maxRetries: 1,
      initialDelay: NaN,
      multiplier: 2,
      maxDelay: 1000,
      jitterFraction: 0,
    };

    await syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct');
    // NaN delay is passed to sleepFn — should it be 0 or throw?
    expect(sleepFn).toHaveBeenCalledTimes(1);
    expect(Number.isNaN(sleepFn.mock.calls[0][0])).toBe(true);
  });

  it('syncAccountWithRetry with multiplier of 0 keeps delay at 0', async () => {
    const syncFn = vi.fn().mockRejectedValue(new Error('fail'));
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const policy = {
      maxRetries: 3,
      initialDelay: 1000,
      multiplier: 0,
      maxDelay: 10000,
      jitterFraction: 0,
    };

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, policy, 'test-acct'),
    ).rejects.toThrow();
    // First delay = 1000, then 1000*0=0, then 0*0=0
    expect(sleepFn.mock.calls[0][0]).toBe(1000);
    expect(sleepFn.mock.calls[1][0]).toBe(0);
    expect(sleepFn.mock.calls[2][0]).toBe(0);
  });
});

