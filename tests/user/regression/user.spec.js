import { test, expect } from '@playwright/test';
import { PreferencesPage } from '../../pages/user/PreferencesPage.js';
import { GradesPage } from '../../pages/user/GradesPage.js';
import { COURSE } from '../../data/site.js';

// Group H: what a learner needs in their user area, verified on dev and staging (2026-10-09).
// Only the items that belong to a learner are tested here. Items still being decided by the
// team (Reports, Private files, Participants, Competencies, Blogs, Badges, ...) are listed in
// docs/setup-config-checks.md and deliberately not tested as "should be there".
// Read-only: forms are opened, never submitted.

// Preferences links a learner needs, the page each opens, and something that proves it loaded.
const LEARNER_PREFERENCES = [
  { link: 'Edit profile', url: /\/user\/edit\.php/, proof: (page) => page.getByRole('textbox', { name: 'First name' }) },
  { link: 'Change password', url: /\/login\/change_password\.php/, proof: (page) => page.getByLabel('Current password') },
  { link: 'Preferred language', url: /\/user\/language\.php/, proof: (page) => page.getByRole('heading', { name: 'Preferred language', level: 2 }) },
  { link: 'Calendar preferences', url: /\/user\/calendar\.php/, proof: (page) => page.getByRole('heading', { name: 'Calendar preferences', level: 2 }) },
  { link: 'Message preferences', url: /\/message\/edit\.php/, proof: (page) => page.getByRole('heading', { name: 'Message preferences', level: 2 }) },
  { link: 'Notification preferences', url: /\/message\/notificationpreferences\.php/, proof: (page) => page.getByRole('heading', { name: 'Notification preferences', level: 2 }) },
];

test.describe('User area (learner)', { tag: '@regression' }, () => {
  for (const { link, url, proof } of LEARNER_PREFERENCES) {
    test(`RH1 Preferences → "${link}" opens its page`, async ({ page }) => {
      const preferences = new PreferencesPage(page);
      await preferences.goto();
      await expect(preferences.heading).toBeVisible();

      await preferences.link(link).click();
      await expect(page).toHaveURL(url);
      await expect(proof(page)).toBeVisible();
    });
  }

  test.describe('course grade report', () => {
    /** @type {GradesPage} */
    let grades;

    // Grades overview → the course → its grade report, as a learner would get there.
    test.beforeEach(async ({ page }) => {
      grades = new GradesPage(page);
      await grades.gotoOverview();
      await grades.courseLink(COURSE.name).click();
      await expect(page).toHaveURL(new RegExp(`/course/user\\.php\\?mode=grade&id=${COURSE.id}&user=\\d+`));
      await expect(grades.courseReportHeading).toBeVisible();
    });

    test('RH2 course tabs "Course" and "Grades" lead to the course and its grades', async ({ page }) => {
      await grades.courseTab('Course').click();
      await expect(page).toHaveURL(new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
      await expect(page.getByRole('heading', { name: COURSE.name, level: 1 })).toBeVisible();

      await page.goBack();
      await grades.courseTab('Grades').click();
      await expect(page).toHaveURL(/\/grade\/report\//);
      // This page has no "Grades" sub-heading; the grade table proves it loaded.
      await expect(grades.column('Grade item')).toBeVisible();
    });

    test('RH3 grade report lists the three language versions and the course total', async () => {
      for (const column of ['Grade item', 'Grade', 'Range', 'Percentage']) {
        await expect(grades.column(column)).toBeVisible();
      }
      for (const language of ['English', 'Spanish', 'Chinese']) {
        await expect(grades.gradeItem(language)).toBeVisible();
      }
      // English points to the course's English SCORM activity.
      await expect(grades.gradeItem('English')).toHaveAttribute(
        'href',
        new RegExp(`/mod/scorm/view\\.php\\?id=${COURSE.englishScormId}$`),
      );
      await expect(grades.gradeTable.getByText('Course total').first()).toBeVisible();
      // Grades change as SCORM tests run: values are not asserted.
    });
  });
});
