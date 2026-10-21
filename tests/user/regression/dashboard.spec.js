import { test, expect } from '@playwright/test';
import { DashboardPage } from '../../pages/common/DashboardPage.js';

// Timeline filter/sort and the block drawer state are saved as user preferences, so these tests
// record the starting value and restore it. Serial: they share those preferences.
test.describe('Dashboard', { tag: '@regression' }, () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  /** @type {DashboardPage} */
  let dashboard;

  test.beforeEach(async ({ page }) => {
    dashboard = new DashboardPage(page);
    await dashboard.goto();
    await expect(dashboard.timelineFilterButton).toBeVisible();
  });

  test('RB1 timeline date filter options', async () => {
    const original = await dashboard.timelineFilterLabel();
    try {
      for (const option of DashboardPage.TIMELINE_FILTERS) {
        await test.step(option, async () => {
          await dashboard.selectTimelineFilter(option);
          await expect(dashboard.timelineFilterButton).toHaveText(new RegExp(`^\\W*${option}\\W*$`));
          await expect(dashboard.timelineContent).toBeVisible();
        });
      }
    } finally {
      await dashboard.selectTimelineFilter(original);
      await expect(dashboard.timelineFilterButton).toContainText(original);
    }
  });

  test('RB2 timeline sort options', async () => {
    const original = await dashboard.timelineSortLabel();
    try {
      for (const option of DashboardPage.TIMELINE_SORTS) {
        await test.step(option, async () => {
          await dashboard.selectTimelineSort(option);
          await expect(dashboard.timelineSortButton).toContainText(option);
          await expect(dashboard.timelineContent).toBeVisible();
        });
      }
    } finally {
      await dashboard.selectTimelineSort(original);
      await expect(dashboard.timelineSortButton).toContainText(original);
    }
  });

  test('RB3 timeline search: no match, then clear', async () => {
    await dashboard.timelineSearch.fill('zzqx-no-such-activity');
    await expect(dashboard.timelineEmpty).toBeVisible();

    await dashboard.timelineClearSearch.click();
    await expect(dashboard.timelineSearch).toHaveValue('');
    await expect(dashboard.timelineContent).toBeVisible();
  });

  // The Calendar block can sit in the main area (dev) or in the side panel (staging since
  // 2026-10-09, moved by a user); blocks can be moved per user with "Customise this page".
  test('RB4 calendar block: month navigation, full calendar, import/export', async ({ page }) => {
    const wasOpen = await dashboard.isBlockDrawerOpen();
    const showCalendar = async () => {
      if (!(await dashboard.calendar.isVisible())) await dashboard.setBlockDrawer(true);
      await expect(dashboard.calendar, 'Calendar block not on the Dashboard or in the side panel').toBeVisible();
    };
    try {
      await showCalendar();
      const startMonth = (await dashboard.calendarMonthHeading.textContent())?.trim() ?? '';

      await dashboard.calendarNextMonth.click();
      await expect(dashboard.calendarMonthHeading).not.toHaveText(startMonth);
      await dashboard.calendarPreviousMonth.click();
      await expect(dashboard.calendarMonthHeading).toHaveText(startMonth);

      await dashboard.fullCalendarLink.click();
      await expect(page).toHaveURL(/\/calendar\/view\.php/);
      await expect(page.getByRole('heading', { name: 'Calendar', level: 1 })).toBeVisible();

      await dashboard.goto();
      await showCalendar();
      await dashboard.importExportLink.click();
      await expect(page).toHaveURL(/\/calendar\/managesubscriptions\.php/);
      await expect(page.getByRole('heading', { name: 'Import or export calendars', level: 2 })).toBeVisible();
    } finally {
      await dashboard.goto();
      await dashboard.setBlockDrawer(wasOpen);
    }
  });

  // The plan expected this block to be missing on dev; it exists inside the block drawer.
  test('RB5 "Recently accessed items" is shown in the block drawer', async () => {
    const wasOpen = await dashboard.isBlockDrawerOpen();
    try {
      await dashboard.setBlockDrawer(true);
      await expect(dashboard.recentlyAccessed).toBeVisible();
      // Items or the block's empty state; contents depend on other tests, so not asserted.
      await expect(
        dashboard.recentlyAccessed.getByRole('listitem').first().or(dashboard.recentlyAccessed.getByText(/No recent items/i)),
      ).toBeVisible();
    } finally {
      await dashboard.setBlockDrawer(wasOpen);
    }
  });

  test('RB6 block drawer state survives a reload', async ({ page }) => {
    const wasOpen = await dashboard.isBlockDrawerOpen();
    try {
      for (const open of [!wasOpen, wasOpen]) {
        await test.step(open ? 'open' : 'closed', async () => {
          await dashboard.setBlockDrawer(open);
          await page.reload();
          await expect(dashboard.timelineFilterButton).toBeVisible();
          if (open) await expect(dashboard.blockDrawer).toBeVisible();
          else await expect(dashboard.openBlockDrawerButton).toBeVisible();
        });
      }
    } finally {
      await dashboard.setBlockDrawer(wasOpen);
    }
  });
});
