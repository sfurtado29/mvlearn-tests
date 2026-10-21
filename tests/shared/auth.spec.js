// Login and logout, run once per role (projects "user" and "manager"); the role's credentials
// come from tests/fixtures.js.
import { test, expect } from '../fixtures.js';
import { FrontPage } from '../pages/common/FrontPage.js';
import { LoginPage } from '../pages/common/LoginPage.js';
import { Header } from '../pages/common/Header.js';
import { DashboardPage } from '../pages/common/DashboardPage.js';
import { submitLogin } from '../helpers/login.js';

// Each test logs in on its own; logging out must never touch the role's saved session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Login & logout', { tag: ['@smoke', '@regression'] }, () => {
  test('S4 login via header link lands on dashboard', async ({ page, credentials }) => {
    await new FrontPage(page).goto();
    await new Header(page).loginLink.click();
    await expect(page).toHaveURL(/\/login\/index\.php/);

    await submitLogin(page, credentials);

    await expect(page).toHaveURL(/\/my\/$/);
    await expect(new DashboardPage(page).greeting).toBeVisible();
  });

  test('S7 logout ends the session', async ({ page, credentials }) => {
    await new LoginPage(page).goto();
    await submitLogin(page, credentials);
    await expect(page).toHaveURL(/\/my\/$/);

    const header = new Header(page);
    await header.logout();
    await expect(header.loginLink).toBeVisible();

    await page.goto('/my/');
    await expect(page).toHaveURL(/\/login\/index\.php/);
  });
});

test.describe('Logout', { tag: '@regression' }, () => {
  test('RA5 after logout, Back and reload do not show private pages', async ({ page, credentials }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await submitLogin(page, credentials);
    await expect(page).toHaveURL(/\/my\/$/);

    const header = new Header(page);
    await header.logout();
    await expect(header.loginLink).toBeVisible();

    await page.goBack();
    // Moodle may already be redirecting the restored page to login, which aborts the reload.
    await page.reload().catch((error) => {
      if (!/ERR_ABORTED/.test(error.message)) throw error;
    });
    await expect(loginPage.username.or(header.loginLink).first()).toBeVisible();
    await expect(new DashboardPage(page).heading).toBeHidden();
  });
});
