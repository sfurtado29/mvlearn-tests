import { test, expect } from '@playwright/test';
import { FrontPage } from '../../pages/common/FrontPage.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { Header } from '../../pages/common/Header.js';
import { COURSE, SITE } from '../../data/site.js';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Public pages', { tag: '@smoke' }, () => {
  test('S1 front page shows available courses', async ({ page }) => {
    const frontPage = new FrontPage(page);
    const response = await frontPage.goto();

    expect(response?.ok()).toBeTruthy();
    await expect(page).toHaveTitle(new RegExp(`\\| ${SITE.shortName}$`));
    await expect(frontPage.availableCoursesHeading).toBeVisible();
    await expect(frontPage.courseLink(COURSE.name)).toBeVisible();
    await expect(frontPage.teacherLink(COURSE.teacher)).toBeVisible();
    await expect(new Header(page).loginLink).toBeVisible();
  });

  test('S2 login page shows the login form', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();

    await expect(loginPage.username).toBeVisible();
    await expect(loginPage.password).toBeVisible();
    await expect(loginPage.loginButton).toBeVisible();
  });

  test('S3 front and login pages have no JS errors or failed requests', async ({ page, baseURL }) => {
    const origin = new URL(String(baseURL)).origin;
    const problems = [];
    page.on('pageerror', (error) => problems.push(`pageerror on ${page.url()}: ${error.message}`));
    page.on('response', (response) => {
      if (response.status() >= 400 && new URL(response.url()).origin === origin) {
        problems.push(`HTTP ${response.status()} ${response.request().method()} ${response.url()}`);
      }
    });

    await new FrontPage(page).goto();
    await page.waitForLoadState('networkidle');
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await page.waitForLoadState('networkidle');

    expect(problems, `Problems found:\n${problems.join('\n')}`).toEqual([]);
  });
});
