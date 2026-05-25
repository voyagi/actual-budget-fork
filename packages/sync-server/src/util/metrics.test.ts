import { describe, it, expect, beforeEach } from 'vitest';

import {
  recordLatency,
  getLatencyPercentiles,
  recordSyncRun,
  getSyncStats,
  _resetMetrics,
} from './metrics.js';

describe('metrics collector', () => {
  beforeEach(() => {
    _resetMetrics();
  });

  describe('getLatencyPercentiles', () => {
    it('returns null when no samples have been recorded', () => {
      expect(getLatencyPercentiles()).toBeNull();
    });

    it('returns p50/p95/p99 after recording samples', () => {
      // Record 100 samples: 1ms through 100ms
      for (let i = 1; i <= 100; i++) {
        recordLatency(i);
      }
      const result = getLatencyPercentiles();
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('p50');
      expect(result).toHaveProperty('p95');
      expect(result).toHaveProperty('p99');
      // p50 should be around the median
      expect(result!.p50).toBeGreaterThanOrEqual(49);
      expect(result!.p50).toBeLessThanOrEqual(51);
      // p99 should be near the top
      expect(result!.p99).toBeGreaterThanOrEqual(98);
    });
  });

  describe('fixed-size eviction', () => {
    it('never exceeds MAX_SAMPLES (1000) and evicts oldest', () => {
      // Record 1100 samples
      for (let i = 1; i <= 1100; i++) {
        recordLatency(i);
      }
      const result = getLatencyPercentiles();
      expect(result).not.toBeNull();
      // p50 of samples 101-1100 (sorted) should be around 600, not around 50
      expect(result!.p50).toBeGreaterThanOrEqual(550);
    });
  });

  describe('recordSyncRun', () => {
    it('increments totalRuns and tracks success/failure counts', () => {
      recordSyncRun(5, 0); // success
      recordSyncRun(3, 1); // failure
      recordSyncRun(2, 0); // success

      const stats = getSyncStats();
      expect(stats.totalRuns).toBe(3);
      expect(stats.successRuns).toBe(2);
      expect(stats.failedRuns).toBe(1);
    });

    it('getSyncStats returns correct lastRunAt timestamp and lastRunAccounts', () => {
      const before = Date.now();
      recordSyncRun(7, 0);
      const after = Date.now();

      const stats = getSyncStats();
      expect(stats.lastRunAt).toBeGreaterThanOrEqual(before);
      expect(stats.lastRunAt).toBeLessThanOrEqual(after);
      expect(stats.lastRunAccounts).toBe(7);
      expect(stats.lastRunErrors).toBe(0);
    });
  });
});
