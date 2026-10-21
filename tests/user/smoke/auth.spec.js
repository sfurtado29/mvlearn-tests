import { test, expect } from '@playwright/test';
import { FrontPage } from '../../pages/common/FrontPage.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { COURSE } from '../../data/site.js';

// Login via header link (S4) and logout (S7) live in tests/shared/auth.spec.js and run for every role.
// These tests log in on their own and must never touch the shared storageState session.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication', { tag: '@smoke' }, () => {
  test('S5 login via course card returns to the course', async ({ page }) => {
    const frontPage = new FrontPage(page);
    await frontPage.goto();
    await frontPage.courseLink(COURSE.name).click();
    await expect(page).toHaveURL(/\/login\/index\.php/);

    await new LoginPage(page).login(process.env.APP_USERNAME, process.env.APP_PASSWORD);

    await expect(page).toHaveURL(new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
  });

  test('S6 wrong password shows an error', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    // Exactly one failed attempt per run, to stay well clear of account lockout.
    await loginPage.login(process.env.APP_USERNAME, 'not-the-real-password-smoke-test');

    await expect(loginPage.error).toBeVisible();
    await expect(page).toHaveURL(/\/login\/index\.php/);
  });
});
