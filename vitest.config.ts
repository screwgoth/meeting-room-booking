import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Embedded Postgres init (initdb + start) needs generous hook timeouts.
    hookTimeout: 120_000,
    testTimeout: 60_000,
    // One worker: the integration suite owns a single embedded Postgres.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
