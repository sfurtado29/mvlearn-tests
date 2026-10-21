import { test, expect } from '@playwright/test';
import { CoursePage } from '../../pages/user/CoursePage.js';
import { Header } from '../../pages/common/Header.js';
import { COURSE, SITE } from '../../data/site.js';

// Never click the launch link here: it starts the SCORM player.
test.describe('Course page', { tag: '@regression' }, () => {
  /** @type {CoursePage} */
  let coursePage;

  test.beforeEach(async ({ page }) => {
    coursePage = new CoursePage(page);
  });

  test('RE1 course page: title, language cards, English launch link', async () => {
    await coursePage.goto(COURSE.id);

    await expect(coursePage.title(COURSE.name)).toBeVisible();
    // This course has no section list or course index; its "sections" are the language cards.
    await expect(coursePage.languageHeading).toBeVisible();
    await expect(coursePage.languageCard('English')).toBeVisible();
    // The label depends on the account's progress: "Begin Course (English)" before the first
    // launch, "Continue (English)" after (seen on staging).
    const launchLink = coursePage.languageLink('English');
    await expect(launchLink).toHaveAccessibleName(/^(Begin Course|Continue) \(English\)$/);
    await expect(launchLink).toHaveAttribute('href', new RegExp(`/mod/scorm/view\\.php\\?id=${COURSE.englishScormId}$`));
  });

  test('RE2 progress is shown for the English activity', async () => {
    await coursePage.goto(COURSE.id);
    // Only the format: progress changes as SCORM tests run.
    await expect(coursePage.languageProgress('English')).toBeVisible();
    await expect(coursePage.languageProgress('English')).toHaveAccessibleName(/^\d+% complete$/);
  });

  // No breadcrumb on this course page: the logo (→ Dashboard) is the only way back.
  test('RE3 from the course page back to My courses', async ({ page }) => {
    await coursePage.goto(COURSE.id);
    await coursePage.siteLogoLink.click();
    await expect(page).toHaveURL(/\/my\/$/);

    await new Header(page).myCoursesTab.click();
    await expect(page).toHaveURL(/\/my\/courses\.php/);
  });

  test('RE4 unknown course id shows a Moodle error page', async () => {
    const response = await coursePage.goto(999999);
    expect(response?.status()).toBe(404);
    await expect(coursePage.notFoundMessage).toBeVisible();
    await expect(coursePage.errorContinueButton).toBeVisible();
  });

  test('RE4b error page shows no PHP stack trace', async () => {
    test.fail(SITE.showsStackTraces, 'Known: debug display is on, so error pages show a stack trace');
    await coursePage.goto(999999);
    await expect(coursePage.notFoundMessage).toBeVisible();
    await expect(coursePage.stackTrace).toHaveCount(0);
  });
});
