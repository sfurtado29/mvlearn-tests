import { test, expect } from '@playwright/test';
import { Header } from '../../pages/common/Header.js';
import { FrontPage } from '../../pages/common/FrontPage.js';
import { DashboardPage } from '../../pages/common/DashboardPage.js';
import { MyCoursesPage } from '../../pages/user/MyCoursesPage.js';
import { COURSE } from '../../data/site.js';

test.describe('Navigation', { tag: '@smoke' }, () => {
  test.beforeEach(async ({ page }) => {
    await new DashboardPage(page).goto();
  });

  test('S8 Home tab shows the site front page', async ({ page }) => {
    await new Header(page).homeTab.click();

    await expect(page).toHaveURL(/\?redirect=0/);
    await expect(new FrontPage(page).courseLink(COURSE.name)).toBeVisible();
  });

  test('S9 Dashboard tab shows the dashboard', async ({ page }) => {
    const header = new Header(page);
    await header.homeTab.click();
    await expect(page).toHaveURL(/\?redirect=0/);
    await header.dashboardTab.click();

    const dashboard = new DashboardPage(page);
    await expect(page).toHaveURL(/\/my\/$/);
    await expect(dashboard.heading).toBeVisible();
    await expect(dashboard.timeline).toBeVisible();
  });

  test('S10 My courses tab lists the course', async ({ page }) => {
    await new Header(page).myCoursesTab.click();

    await expect(page).toHaveURL(/\/my\/courses\.php/);
    await expect(new MyCoursesPage(page).courseLink(COURSE.name)).toBeVisible();
  });

  test('S11 header menus open and close', async ({ page }) => {
    const header = new Header(page);

    await test.step('user menu shows Log out', async () => {
      await header.userMenuButton.click();
      await expect(header.logoutItem).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(header.logoutItem).toBeHidden();
    });

    await test.step('notifications popover', async () => {
      await header.notificationsButton.click();
      await expect(header.notificationsPopover).toBeVisible();
      await header.notificationsButton.click();
      await expect(header.notificationsPopover).toBeHidden();
    });

    await test.step('messaging drawer', async () => {
      await header.messagingButton.click();
      await expect(header.messagingDrawer).toBeVisible();
      await header.messagingCloseLink.click();
      await expect(header.messagingDrawer).toBeHidden();
    });
  });
});
