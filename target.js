// Which site the tests run against: TARGET=dev (default) or TARGET=staging, set in .env, on the
// command line, or by the dev:* / staging:* npm scripts (command line wins over .env).
// For staging, the STAGING_* values from .env are copied onto the standard names (BASE_URL,
// APP_USERNAME, ...) so every test and tests/data/site.js work unchanged. Imported by
// playwright.config.js, which Playwright loads in the main process and in every worker.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

export const TARGET = (process.env.TARGET ?? 'dev').trim().toLowerCase();
if (!['dev', 'staging'].includes(TARGET)) {
  throw new Error(`Unknown TARGET "${TARGET}". Use TARGET=dev or TARGET=staging.`);
}

if (TARGET === 'staging') {
  const missing = ['STAGING_BASE_URL', 'STAGING_APP_USERNAME', 'STAGING_APP_PASSWORD'].filter(
    (key) => !process.env[key]?.trim(),
  );
  if (missing.length) {
    throw new Error(`TARGET=staging needs these in .env: ${missing.join(', ')}.`);
  }
  for (const key of [
    'BASE_URL',
    'APP_USERNAME',
    'APP_PASSWORD',
    'SCORM_USERNAME',
    'SCORM_PASSWORD',
    'SCORM_POOL',
    'MANAGER_USERNAME',
    'MANAGER_PASSWORD',
  ]) {
    // Optional staging values default to empty, so dev accounts are never used on staging.
    process.env[key] = process.env[`STAGING_${key}`] ?? '';
  }
}

/** Saved login session, one file per site. */
export const AUTH_FILE = `playwright/.auth/user-${TARGET}.json`;

/** Saved Manager-role login session, one file per site. */
export const MANAGER_AUTH_FILE = `playwright/.auth/manager-${TARGET}.json`;
