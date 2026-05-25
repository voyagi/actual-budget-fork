const MAX_SAMPLES = 1000;
const latencySamples = new Float64Array(MAX_SAMPLES);
let latencyWriteIdx = 0;
let latencyCount = 0;

export function recordLatency(ms: number): void {
  if (!Number.isFinite(ms)) return;
  latencySamples[latencyWriteIdx] = ms;
  latencyWriteIdx = (latencyWriteIdx + 1) % MAX_SAMPLES;
  if (latencyCount < MAX_SAMPLES) latencyCount++;
}

export function getLatencyPercentiles(): {
  p50: number;
  p95: number;
  p99: number;
} | null {
  if (latencyCount === 0) return null;
  const sorted = [...Array.from(latencySamples.subarray(0, latencyCount))].sort(
    (a, b) => a - b,
  );
  const p = (pct: number) =>
    sorted[Math.floor((sorted.length * pct) / 100)] ??
    sorted[sorted.length - 1];
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

const backupStats = {
  totalRuns: 0,
  successRuns: 0,
  failedRuns: 0,
  lastRunAt: null as number | null,
  lastRunSizeBytes: 0,
};

export function recordBackupRun(sizeBytes: number, success: boolean): void {
  backupStats.totalRuns++;
  if (success) backupStats.successRuns++;
  else backupStats.failedRuns++;
  backupStats.lastRunAt = Date.now();
  backupStats.lastRunSizeBytes = sizeBytes;
}

export function getBackupStats() {
  return { ...backupStats };
}

// For testing: reset all module-level state
export function _resetMetrics(): void {
  latencySamples.fill(0);
  latencyWriteIdx = 0;
  latencyCount = 0;
  syncStats.totalRuns = 0;
  syncStats.successRuns = 0;
  syncStats.failedRuns = 0;
  syncStats.lastRunAt = null;
  syncStats.lastRunAccounts = 0;
  syncStats.lastRunErrors = 0;
  backupStats.totalRuns = 0;
  backupStats.successRuns = 0;
  backupStats.failedRuns = 0;
  backupStats.lastRunAt = null;
  backupStats.lastRunSizeBytes = 0;
}
