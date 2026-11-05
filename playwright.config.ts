import { defineConfig, devices } from '@playwright/test';

// The smallest screen the app supports.
const viewport = { width: 1024, height: 768 };
const port = 5199;
const baseURL = `http://localhost:${String(port)}`;
const onCi = process.env.CI !== undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: onCi,
  retries: 0,
  reporter: onCi ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport } },
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport } },
    { name: 'msedge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport } },
  ],
  webServer: {
    // The dev server: the read seam the tests use exists only in development builds.
    command: `pnpm exec vite --port ${String(port)} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
