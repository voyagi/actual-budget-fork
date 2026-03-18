const MAX_SAMPLES = 1000;
const latencySamples: number[] = [];

export function recordLatency(ms: number): void {
  if (latencySamples.length >= MAX_SAMPLES) latencySamples.shift();
  latencySamples.push(ms);
}

export function getLatencyPercentiles(): {
  p50: number;
  p95: number;
  p99: number;
} | null {
  if (latencySamples.length === 0) return null;
  const sorted = [...latencySamples].sort((a, b) => a - b);
  const p = (pct: number) =>
    sorted[Math.floor((sorted.length * pct) / 100)] ?? sorted[sorted.length - 1];
  return { p50: p(50), p95: p(95), p99: p(99) };
}

const syncStats = {
  totalRuns: 0,
  successRuns: 0,
  failedRuns: 0,
  lastRunAt: null as number | null,
  lastRunAccounts: 0,
  lastRunErrors: 0,
};

export function recordSyncRun(accounts: number, errors: number): void {
  syncStats.totalRuns++;
  if (errors === 0) syncStats.successRuns++;
  else syncStats.failedRuns++;
  syncStats.lastRunAt = Date.now();
  syncStats.lastRunAccounts = accounts;
  syncStats.lastRunErrors = errors;
}

export function getSyncStats() {
  return { ...syncStats };
}

// For testing: reset all module-level state
export function _resetMetrics(): void {
  latencySamples.length = 0;
  syncStats.totalRuns = 0;
  syncStats.successRuns = 0;
  syncStats.failedRuns = 0;
  syncStats.lastRunAt = null;
  syncStats.lastRunAccounts = 0;
  syncStats.lastRunErrors = 0;
}
