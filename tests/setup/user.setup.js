import { test as setup, expect } from '@playwright/test';
import { LoginPage } from '../pages/common/LoginPage.js';
import { AUTH_FILE as authFile } from '../../target.js';

setup('authenticate', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(process.env.APP_USERNAME, process.env.APP_PASSWORD);
  await expect(page).toHaveURL(/\/my\/$/);
  await page.context().storageState({ path: authFile });
});
