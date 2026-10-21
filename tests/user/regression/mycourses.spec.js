import { test, expect } from '@playwright/test';
import { MyCoursesPage } from '../../pages/user/MyCoursesPage.js';
import { COURSE } from '../../data/site.js';

// Grouping, sort and view mode are saved as user preferences: record and restore them.
// Serial: the tests share those preferences.
test.describe('My courses', { tag: '@regression' }, () => {
  test.describe.configure({ mode: 'serial', timeout: 90_000 });

  /** @type {MyCoursesPage} */
  let myCourses;
  /** @type {{ grouping: string, sorting: string, display: string }} */
  let original;

  test.beforeEach(async ({ page }) => {
    myCourses = new MyCoursesPage(page);
    await myCourses.goto();
    await expect(myCourses.groupingButton).toBeVisible();
    original = {
      grouping: await myCourses.groupingLabel(),
      sorting: await myCourses.sortingLabel(),
      display: await myCourses.displayLabel(),
    };
  });

  test.afterEach(async () => {
    if ((await myCourses.groupingLabel()) !== original.grouping) await myCourses.selectGrouping(original.grouping);
    if ((await myCourses.sortingLabel()) !== original.sorting) await myCourses.selectSorting(original.sorting);
    if ((await myCourses.displayLabel()) !== original.display) await myCourses.selectDisplay(original.display);
    await expect(myCourses.groupingButton).toContainText(original.grouping);
    await expect(myCourses.sortingButton).toContainText(original.sorting);
    await expect(myCourses.displayButton).toContainText(original.display);
  });

  test('RC1 course card links to the course and shows a progress label', async () => {
    if (original.grouping !== 'All') await myCourses.selectGrouping('All');
    const link = myCourses.courseLink(COURSE.name).first();
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
    // Progress changes as SCORM tests run: check the format only.
    if (await myCourses.progressLabel.count()) {
      await expect(myCourses.progressLabel.first()).toHaveText(/\d+% complete/);
    }
  });

  test('RC2 every grouping filter shows the course or the empty state', async () => {
    for (const grouping of MyCoursesPage.GROUPINGS) {
      await test.step(grouping, async () => {
        await myCourses.selectGrouping(grouping);
        await expect(myCourses.groupingButton).toContainText(grouping);
        await expect(myCourses.courseOrEmpty(COURSE.name)).toBeVisible();
      });
    }
    await myCourses.selectGrouping('All');
    await expect(myCourses.courseLink(COURSE.name).first()).toBeVisible();
  });

  test('RC3 sort options and view modes render the course', async () => {
    if (original.grouping !== 'All') await myCourses.selectGrouping('All');
    for (const sorting of MyCoursesPage.SORTS) {
      await test.step(sorting, async () => {
        await myCourses.selectSorting(sorting);
        await expect(myCourses.sortingButton).toContainText(sorting);
        await expect(myCourses.courseLink(COURSE.name).first()).toBeVisible();
      });
    }
    for (const display of MyCoursesPage.DISPLAYS) {
      await test.step(display, async () => {
        await myCourses.selectDisplay(display);
        await expect(myCourses.displayButton).toContainText(display);
        await expect(myCourses.courseLink(COURSE.name).first()).toBeVisible();
      });
    }
  });

  test('RC4 search: part of the name matches, nonsense shows no courses', async () => {
    if (original.grouping !== 'All') await myCourses.selectGrouping('All');
    const part = COURSE.name.split(' ')[1];

    await myCourses.searchBox.fill(part);
    await expect(myCourses.courseLink(COURSE.name).first()).toBeVisible();

    await myCourses.searchBox.fill('zzqx-no-such-course');
    await expect(myCourses.emptyState).toBeVisible();
    await expect(myCourses.courseLink(COURSE.name)).toHaveCount(0);

    await myCourses.clearSearchButton.click();
    await expect(myCourses.courseLink(COURSE.name).first()).toBeVisible();
  });
});
