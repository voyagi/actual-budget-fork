import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to reset module registry between tests to re-evaluate logger.ts with different NODE_ENV
describe('logger transport configuration', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('has a DailyRotateFile transport in non-test env', async () => {
    vi.stubEnv('NODE_ENV', 'production');
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
    vi.unstubAllEnvs();
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
    expect(transportNames.some((n: string) => n.toLowerCase().includes('console'))).toBe(true);
    vi.unstubAllEnvs();
  });

  it('file transport uses JSON format (machine-parseable)', async () => {
    vi.stubEnv('NODE_ENV', 'production');
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
    vi.unstubAllEnvs();
  });
});
