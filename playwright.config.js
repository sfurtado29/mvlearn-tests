// @ts-check
import { defineConfig, devices } from '@playwright/test';
// Loads .env and, for TARGET=staging, switches BASE_URL/APP_* to the STAGING_* values.
import { AUTH_FILE, MANAGER_AUTH_FILE } from './target.js';

const missing = ['BASE_URL', 'APP_USERNAME', 'APP_PASSWORD'].filter((key) => !process.env[key]?.trim());
if (missing.length) {
  throw new Error(`Missing required env vars: ${missing.join(', ')}. Copy .env.example to .env and fill them in.`);
}

// Strip trailing slashes so relative paths like '/my/' never produce '//my/'.
const baseURL = String(process.env.BASE_URL).trim().replace(/\/+$/, '');

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // run-log-reporter keeps a timestamped log + results per run in test-logs/ (never deleted).
  reporter: [['list'], ['html', { open: 'never' }], ['./reporters/run-log-reporter.js']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // One project per role. The folder decides the role (tests/user, tests/manager; tests/shared runs
  // in both), the tag decides the kind (@smoke, @regression). `role` is read by tests/fixtures.js.
  projects: [
    {
      name: 'setup-user',
      testMatch: '**/setup/user.setup.js',
    },
    {
      name: 'setup-manager',
      testMatch: '**/setup/manager.setup.js',
    },
    {
      name: 'user',
      testMatch: ['**/user/**/*.spec.js', '**/shared/**/*.spec.js'],
      // Load-test probes run only through `npm run load:probe` (which sets LOAD_PROBE_RUN=1), never
      // with npm test, test:smoke, test:regression or test:scorm-full.
      testIgnore: process.env.LOAD_PROBE_RUN === '1' ? [] : ['**/user/load/**'],
      use: {
        ...devices['Desktop Chrome'],
        role: 'user',
        storageState: AUTH_FILE,
        // Storyline only enables "next" after a slide's audio ends; blocked autoplay would stall it.
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
      dependencies: ['setup-user'],
    },
    {
      name: 'manager',
      testMatch: ['**/manager/**/*.spec.js', '**/shared/**/*.spec.js'],
      use: {
        ...devices['Desktop Chrome'],
        role: 'manager',
        storageState: MANAGER_AUTH_FILE,
      },
      dependencies: ['setup-manager'],
    },
  ],
});
