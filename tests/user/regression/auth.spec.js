import { test, expect } from '@playwright/test';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { ForgotPasswordPage } from '../../pages/user/ForgotPasswordPage.js';
import { DashboardPage } from '../../pages/common/DashboardPage.js';
import { COURSE } from '../../data/site.js';
import { AUTH_FILE } from '../../../target.js';
import { submitLogin } from '../../helpers/login.js';
import { credentialsFor } from '../../data/roles.js';

// Clean context: these tests log in and out themselves and must never touch the shared session.
// Negative tests only use made-up usernames (smoke S6 already does the one real-username failure).
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Logs in with the APP account and waits until the browser has left the login page.
 * @param {import('@playwright/test').Page} page
 */
const loginAsApp = (page) => submitLogin(page, credentialsFor('user'));

test.describe('Login & session', { tag: '@regression' }, () => {
  // Several tests log in more than once.
  test.describe.configure({ timeout: 120_000 });

  test('RA1 empty username and password does not log in', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.loginButton.click();

    await expect(page).toHaveURL(/\/login\/index\.php/);
    await expect(loginPage.error).toBeVisible();
    await page.goto('/my/');
    await expect(page).toHaveURL(/\/login\/index\.php/);
  });

  test('RA2 unknown username shows the generic error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(`no-such-user-${Date.now()}`, 'not-a-real-password');

    await expect(loginPage.error).toBeVisible();
    await expect(page).toHaveURL(/\/login\/index\.php/);
  });

  test('RA3 deep link while logged out returns there after login', async ({ page, browser, baseURL }) => {
    await test.step('/my/courses.php', async () => {
      await page.goto('/my/courses.php');
      await expect(page).toHaveURL(/\/login\/index\.php/);
      await loginAsApp(page);
      await expect(page).toHaveURL(/\/my\/courses\.php$/);
    });

    await test.step('course page', async () => {
      // A separate logged-out browser, rather than clearing cookies in the first one.
      const context = await browser.newContext({ baseURL });
      try {
        const coursePage = await context.newPage();
        await coursePage.goto(`/course/view.php?id=${COURSE.id}`);
        await expect(coursePage).toHaveURL(/\/login\/index\.php/);
        await loginAsApp(coursePage);
        await expect(coursePage).toHaveURL(new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
      } finally {
        await context.close();
      }
    });
  });

  test('RA6 lost session (cookies cleared) sends you to login', async ({ page, context }) => {
    await new LoginPage(page).goto();
    await loginAsApp(page);
    await expect(page).toHaveURL(/\/my\/$/);

    // Leave Moodle first: its scripts on the open page react to the lost session and would
    // interrupt the next navigation (net::ERR_ABORTED).
    await page.goto('about:blank');
    await context.clearCookies();
    await page.goto('/my/');
    await expect(page).toHaveURL(/\/login\/index\.php/);
  });

  test('RA7 "Lost password?" page loads (never submitted)', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.lostPasswordLink.click();

    await expect(page).toHaveURL(/\/login\/forgot_password\.php/);
    const forgot = new ForgotPasswordPage(page);
    await expect(forgot.usernameField).toBeVisible();
    await expect(forgot.emailField).toBeVisible();
  });

  test('RA8 same user logged in from two browsers at once', async ({ browser, baseURL }) => {
    const contexts = await Promise.all([1, 2].map(() => browser.newContext({ baseURL })));
    try {
      const [first, second] = await Promise.all(contexts.map((c) => c.newPage()));
      for (const page of [first, second]) {
        await new LoginPage(page).goto();
        await loginAsApp(page);
        await expect(page).toHaveURL(/\/my\/$/);
      }

      for (const [label, page] of [['second', second], ['first', first]]) {
        await page.goto('/my/');
        expect(
          page.url(),
          `The ${label} session was ended by the other login: Moodle limits concurrent logins; matters for k6`,
        ).toMatch(/\/my\/$/);
        // The "Hi, …!" greeting only shows right after login, so check the heading instead.
        await expect(new DashboardPage(page).heading).toBeVisible();
      }
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });
});

test.describe('Login & session (shared session)', { tag: '@regression' }, () => {
  test.use({ storageState: AUTH_FILE });

  test('RA4 logged-in user opening the login page sees "already logged in"', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.alreadyLoggedInDialog).toBeVisible();
    await expect(loginPage.alreadyLoggedInText).toBeVisible();
    // Cancel, never "Log out": this is the shared session.
    await loginPage.alreadyLoggedInCancel.click();
    await expect(page).toHaveURL(/\/my\/$/);
  });
});
