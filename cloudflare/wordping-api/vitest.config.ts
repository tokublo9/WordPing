import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    restoreMocks: true,
    // The Worker logs a structured line per request. Keep it out of the test
    // report — assertions about logging are made explicitly, by spying.
    onConsoleLog: () => false,
  },
});
