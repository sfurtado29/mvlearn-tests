import { test, expect } from '@playwright/test';
import { CoursePage } from '../../pages/user/CoursePage.js';
import { COURSE } from '../../data/site.js';

test.describe('Course', { tag: '@smoke' }, () => {
  test('S12 course page lists the English SCORM activity', async ({ page }) => {
    const coursePage = new CoursePage(page);
    await coursePage.goto(COURSE.id);

    await expect(coursePage.title(COURSE.name)).toBeVisible();
    // Check the link target only; following it would launch the SCORM player.
    await expect(coursePage.languageLink('English')).toHaveAttribute(
      'href',
      new RegExp(`/mod/scorm/view\\.php\\?id=${COURSE.englishScormId}$`),
    );
  });
});
