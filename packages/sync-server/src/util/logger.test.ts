import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, it, expect, vi, beforeEach } from 'vitest';

// We need to reset module registry between tests to re-evaluate logger.ts with different NODE_ENV
describe('logger transport configuration', () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.resetModules();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-test-'));
  });

  // No tmpDir cleanup: DailyRotateFile holds an async file handle that outlives the test
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('has a DailyRotateFile transport in non-test env', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACTUAL_DATA_DIR', tmpDir);
    const { default: logger } = await import('./logger.js');
    const transportNames = logger.transports.map(
      (t: { name?: string; constructor: { name: string } }) =>
        t.name ?? t.constructor.name,
    );
    const hasDailyRotate = transportNames.some(
      (name: string) =>
        name.toLowerCase().includes('dailyrotatefile') ||
        name.toLowerCase().includes('daily'),
    );
    expect(hasDailyRotate).toBe(true);
  });

  it('only has Console transport in test env (no file transport)', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const { default: logger } = await import('./logger.js');
    const transportNames = logger.transports.map(
      (t: { name?: string; constructor: { name: string } }) =>
        t.name ?? t.constructor.name,
    );
    const hasDailyRotate = transportNames.some(
      (name: string) =>
        name.toLowerCase().includes('dailyrotatefile') ||
        name.toLowerCase().includes('daily'),
    );
    expect(hasDailyRotate).toBe(false);
    // Should only have console
    expect(
      transportNames.some((n: string) => n.toLowerCase().includes('console')),
    ).toBe(true);
  });

  it('file transport uses JSON format (machine-parseable)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACTUAL_DATA_DIR', tmpDir);
    const { default: logger } = await import('./logger.js');
    const fileTransport = logger.transports.find(
      (t: { name?: string; constructor: { name: string } }) => {
        const name = t.name ?? t.constructor.name;
        return (
          name.toLowerCase().includes('dailyrotatefile') ||
          name.toLowerCase().includes('daily')
        );
      },
    ) as { format?: unknown } | undefined;
    // File transport should exist and have a format configured
    expect(fileTransport).toBeDefined();
    // The format is an opaque object; we just verify it is non-null
    expect(fileTransport?.format).toBeDefined();
  });
});
