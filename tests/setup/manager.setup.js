import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/common/LoginPage.js';
import { credentialsFor } from '../data/roles.js';
import { MANAGER_AUTH_FILE } from '../../target.js';

setup('authenticate as manager', async ({ page }) => {
  const credentials = credentialsFor('manager');
  setup.skip(!credentials, 'MANAGER_USERNAME / MANAGER_PASSWORD are not set in .env');

  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(credentials?.username, credentials?.password);
  await expect(page).toHaveURL(/\/my\/$/);
  await page.context().storageState({ path: MANAGER_AUTH_FILE });
});
