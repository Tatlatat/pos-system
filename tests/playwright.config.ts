import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './scenarios',
  timeout: 120000,          // 2 min per test
  retries: 0,               // no retries for stress tests
  workers: 1,               // tests run sequentially (stress tests manage their own concurrency)
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results.json' }],
  ],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
    },
  },
});
