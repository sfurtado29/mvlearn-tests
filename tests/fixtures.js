// Role-aware test: specs under tests/shared/ and tests/manager/ import { test, expect } from here.
// `role` is set per project in playwright.config.js ('user' or 'manager').
import { test as base } from '@playwright/test';
import { ROLES, credentialsFor } from './data/roles.js';

export { expect } from '@playwright/test';

export const test = base.extend({
  role: ['user', { option: true }],

  credentials: async ({ role }, use) => {
    await use(credentialsFor(role));
  },

  // Skips (rather than fails) every test of a role whose credentials are not in .env.
  // Runs before `page`, so the missing saved session file is never opened.
  requireCredentials: [
    async ({ role, credentials }, use, testInfo) => {
      const { usernameVar, passwordVar } = ROLES[role];
      testInfo.skip(!credentials, `${usernameVar} / ${passwordVar} are not set in .env`);
      await use();
    },
    { auto: true },
  ],
});
