// [eb] Unit tests for syncAccountWithRetry exponential backoff helper.
// Tests use dependency injection (syncFn, sleepFn mocks) to avoid real DB/API calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  syncAccountWithRetry,
  applyJitter,
  type RetryPolicy,
} from './scheduler.js';
import {
  RateLimitError,
  SessionExpiredError,
} from './app-enablebanking/errors.js';

const testPolicy: RetryPolicy = {
  maxRetries: 3,
  initialDelay: 5000,
  multiplier: 2,
  maxDelay: 60000,
  jitterFraction: 0.2,
};

describe('applyJitter', () => {
  it('jitter keeps delay within +/-20% of nominal', () => {
    for (let i = 0; i < 50; i++) {
      const result = applyJitter(10000, 0.2);
      expect(result).toBeGreaterThanOrEqual(8000);
      expect(result).toBeLessThanOrEqual(12000);
    }
  });
});

describe('syncAccountWithRetry', () => {
  let syncFn: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let sleepFn: ReturnType<typeof vi.fn<(ms: number) => Promise<void>>>;

  beforeEach(() => {
    syncFn = vi.fn<() => Promise<void>>();
    sleepFn = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue(undefined);
  });

  it('succeeds on first attempt without retry', async () => {
    syncFn.mockResolvedValueOnce(undefined);

    await syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account');

    expect(syncFn).toHaveBeenCalledTimes(1);
    expect(sleepFn).not.toHaveBeenCalled();
  });

  it('retries up to maxRetries on transient errors then succeeds', async () => {
    const transientError = new Error('Network error');
    syncFn
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(undefined);

    await syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account');

    expect(syncFn).toHaveBeenCalledTimes(3);
    expect(sleepFn).toHaveBeenCalledTimes(2);
  });

  it('propagates error after all retries exhausted', async () => {
    const persistentError = new Error('Persistent failure');
    syncFn.mockRejectedValue(persistentError);

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account'),
    ).rejects.toThrow('Persistent failure');

    // 1 initial + 3 retries = 4 total calls
    expect(syncFn).toHaveBeenCalledTimes(4);
  });

  it('exponential backoff delays are approximately 5000, 10000, 20000', async () => {
    syncFn.mockRejectedValue(new Error('fail'));

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account'),
    ).rejects.toThrow();

    expect(sleepFn).toHaveBeenCalledTimes(3);
    const delays = sleepFn.mock.calls.map((call: unknown[]) => call[0] as number);

    // 1st sleep: nominal 5000, +/-20% -> 4000 to 6000
    expect(delays[0]).toBeGreaterThanOrEqual(4000);
    expect(delays[0]).toBeLessThanOrEqual(6000);

    // 2nd sleep: nominal 10000, +/-20% -> 8000 to 12000
    expect(delays[1]).toBeGreaterThanOrEqual(8000);
    expect(delays[1]).toBeLessThanOrEqual(12000);

    // 3rd sleep: nominal 20000, +/-20% -> 16000 to 24000
    expect(delays[2]).toBeGreaterThanOrEqual(16000);
    expect(delays[2]).toBeLessThanOrEqual(24000);
  });

  it('RateLimitError propagates immediately without sleeping', async () => {
    syncFn.mockRejectedValue(new RateLimitError('rate limited'));

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account'),
    ).rejects.toBeInstanceOf(RateLimitError);

    expect(sleepFn).not.toHaveBeenCalled();
    expect(syncFn).toHaveBeenCalledTimes(1);
  });

  it('SessionExpiredError propagates immediately without sleeping', async () => {
    syncFn.mockRejectedValue(new SessionExpiredError('session expired'));

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account'),
    ).rejects.toBeInstanceOf(SessionExpiredError);

    expect(sleepFn).not.toHaveBeenCalled();
    expect(syncFn).toHaveBeenCalledTimes(1);
  });

  it('delays are capped at maxDelay', async () => {
    const capPolicy: RetryPolicy = {
      maxRetries: 3,
      initialDelay: 50000,
      multiplier: 2,
      maxDelay: 60000,
      jitterFraction: 0.2,
    };
    syncFn.mockRejectedValue(new Error('fail'));

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, capPolicy, 'test-account'),
    ).rejects.toThrow();

    const delays = sleepFn.mock.calls.map((call: unknown[]) => call[0] as number);
    const maxWithJitter = 60000 * 1.2;
    for (const delay of delays) {
      expect(delay).toBeLessThanOrEqual(maxWithJitter);
    }
  });

  it('logs each retry attempt with attempt number and delay', async () => {
    // logger.info replaced console.log - spy on it to verify structured retry logs
    const loggerModule = await import('./util/logger.js');
    const loggerSpy = vi
      .spyOn(loggerModule.default, 'info')
      .mockImplementation(() => loggerModule.default);
    syncFn.mockRejectedValue(new Error('fail'));

    await expect(
      syncAccountWithRetry(syncFn, sleepFn, testPolicy, 'test-account'),
    ).rejects.toThrow();

    // Each call is (message, metadata) - filter for 'Retrying sync' calls
    const retryCalls = loggerSpy.mock.calls.filter(
      (args: unknown[]) => args[0] === 'Retrying sync',
    );

    // Should have 3 retry log entries (one per retry attempt)
    expect(retryCalls).toHaveLength(3);
    expect((retryCalls[0][1] as Record<string, unknown>).attempt).toBe(1);
    expect((retryCalls[1][1] as Record<string, unknown>).attempt).toBe(2);
    expect((retryCalls[2][1] as Record<string, unknown>).attempt).toBe(3);

    // Each log should include a numeric delayMs
    for (const call of retryCalls) {
      expect(
        typeof (call[1] as Record<string, unknown>).delayMs,
      ).toBe('number');
    }

    loggerSpy.mockRestore();
  });
});
