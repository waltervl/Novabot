import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/__tests__/**/*.test.ts',
      'src/cloud-api/__tests__/**/*.test.ts',
    ],
    environment: 'node',
    globalSetup: ['src/__tests__/globalSetup.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    // DB_PATH is set here so the test database module reads ':memory:' at
    // static import time. Setting it inside setup.ts is too late — ESM import
    // hoisting means db/database.ts loads before any statement in setup.ts
    // runs, and a missed :memory: flag means tests wipe the real novabot.db.
    env: {
      DB_PATH: ':memory:',
      // Override STORAGE_PATH so importStaging sessions created during tests
      // do not accumulate in ../data/imports across test runs.
      STORAGE_PATH: '/tmp/novabot-test-storage',
    },
    // All tests share one in-memory SQLite DB — must run sequentially
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
