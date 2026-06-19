import { defineConfig } from 'vitest/config';

// App tests cover the PURE utils in src/utils — parsing, mapping and selection
// logic that has caused regressions (e.g. mowingMapSelection). These have no
// react-native imports, so a plain node environment runs them with zero Metro/
// transpile setup. Screen/component tests would need jest-expo + RNTL; add that
// separately if we decide to test rendering.
// ponytail: mirrors server/vitest.config.ts — one runner across the repo.
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
