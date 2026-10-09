import { defineConfig, devices } from '@playwright/test';

// End to end tests: a real browser clicking through the built store.
// The server runs with an in-memory database, demo payments and the email outbox,
// so it needs nothing outside this repository. Run `npm run build` before.
const PORT = 4310;
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ].map((project) => ({
    ...project,
    // on my machine it uses the Edge that is already installed instead of downloading Chromium
    use: { ...project.use, channel: process.env.CI ? undefined : 'msedge' },
  })),
  webServer: {
    command: 'node server/dist/server.js',
    url: `${URL}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      APP_URL: URL,
      PGLITE_DIR: 'memory://',
      SEED_SAMPLE_PRODUCTS: 'true',
    },
  },
});
