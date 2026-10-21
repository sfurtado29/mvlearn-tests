import { test, expect } from '@playwright/test';
import { Header } from '../../pages/common/Header.js';
import { DashboardPage } from '../../pages/common/DashboardPage.js';
import { GradesPage } from '../../pages/user/GradesPage.js';
import { COURSE } from '../../data/site.js';

// Learner user-menu items and the page each opens, verified on dev and staging. Read-only.
// "Private files" and "Reports" are also in the menu, but whether learners should have them is
// still open (docs/setup-config-checks.md), so they are not tested as "should be there".
const USER_MENU_PAGES = [
  { item: 'Profile', url: /\/user\/profile\.php/, heading: { name: 'User profile', level: 2 } },
  { item: 'Grades', url: /\/grade\/report\/overview\/index\.php/, heading: { name: 'Courses I am taking', level: 2 } },
  { item: 'Calendar', url: /\/calendar\/view\.php/, heading: { name: 'Calendar', level: 1 } },
  { item: 'Preferences', url: /\/user\/preferences\.php/, heading: { name: 'Preferences', level: 2 } },
];

test.describe('Header & user area', { tag: '@regression' }, () => {
  test.describe.configure({ timeout: 60_000 });

  /** @type {Header} */
  let header;

  test.beforeEach(async ({ page }) => {
    await new DashboardPage(page).goto();
    header = new Header(page);
  });

  test('RD1 notifications: popover, See all, preferences (nothing marked read)', async ({ page }) => {
    await header.notificationsButton.click();
    await expect(header.notificationsPopover).toBeVisible();
    await expect(header.notificationsSeeAll).toBeVisible();
    await header.notificationsSeeAll.click();
    await expect(page).toHaveURL(/\/message\/output\/popup\/notifications\.php$/);
    await expect(page.getByRole('heading', { name: 'Notifications', level: 2 })).toBeVisible();

    await new DashboardPage(page).goto();
    await header.notificationsButton.click();
    await header.notificationPreferencesLink.click();
    await expect(page).toHaveURL(/\/message\/notificationpreferences\.php/);
    await expect(page.getByRole('heading', { name: 'Notification preferences', level: 2 })).toBeVisible();
  });

  test('RD2 messaging drawer: sections and search', async () => {
    await header.messagingButton.click();
    await expect(header.messagingDrawer).toBeVisible();
    for (const section of ['Starred', 'Group', 'Private']) {
      await expect(header.messagingSection(section)).toBeVisible();
    }

    await header.messagingSearch.click();
    await expect(header.messagingPerformSearch).toBeVisible();

    await header.messagingCloseLink.click();
    await expect(header.messagingDrawer).toBeHidden();
  });

  for (const { item, url, heading } of USER_MENU_PAGES) {
    test(`RD3 user menu "${item}" opens its page`, async ({ page }) => {
      await header.userMenuButton.click();
      const menuItem = header.userMenuItem(item);
      test.skip((await menuItem.count()) === 0, `"${item}" is not in the user menu on this site`);
      await menuItem.click();

      await expect(page).toHaveURL(url);
      await expect(page.getByRole('heading', heading)).toBeVisible();
    });
  }

  test('RD4 grades overview lists the course and opens its grade report', async ({ page }) => {
    const grades = new GradesPage(page);
    await grades.gotoOverview();
    await expect(grades.overviewHeading).toBeVisible();

    await grades.courseLink(COURSE.name).click();
    await expect(page).toHaveURL(new RegExp(`/course/user\\.php\\?mode=grade&id=${COURSE.id}&user=\\d+`));
    await expect(page.getByRole('heading', { name: COURSE.name, level: 1 })).toBeVisible();
    await expect(grades.courseReportHeading).toBeVisible();
  });

  test('RD5 language menu switches and switches back', async () => {
    test.skip((await header.languageMenuButton.count()) === 0, 'Only one language on this site: no language menu in the header');
    // If a language menu appears, implement: switch, verify, switch back (it is a user preference).
    test.fixme(true, 'Language menu found but not implemented yet');
  });
});
