export default {
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
    globalSetup: ['./vitest.globalSetup.js'],
    globals: true,
    coverage: {
      enabled: false,
      provider: 'v8',
      include: [
        'src/app-enablebanking/**',
        'src/scheduler.ts',
        'src/util/alerter.ts',
        'src/util/metrics.ts',
        'src/util/audit.ts',
        'src/util/logger.ts',
      ],
      exclude: ['**/node_modules/**', '**/dist/**', '**/build/**'],
      thresholds: {
        lines: 60,
      },
      reporter: ['text', 'lcov'],
    },
    maxWorkers: 2,
  },
};
