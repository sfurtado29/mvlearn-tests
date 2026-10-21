export class GradesPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.main = page.getByRole('main');
    // Grades overview (/grade/report/overview/index.php), opened from user menu → Grades.
    this.overviewHeading = this.main.getByRole('heading', { name: 'Courses I am taking', level: 2 });
    // Course grade report (/course/user.php?mode=grade&id=<course>&user=<user>).
    this.courseReportHeading = page.getByRole('heading', { name: 'Grades', level: 2 });
    this.gradeTable = this.main.getByRole('table').first();
    // Course tabs (Course, Participants, Grades, Competencies) shown above the course report.
    this.courseTabs = page.locator('.secondary-navigation');
  }

  async gotoOverview() {
    return this.page.goto('/grade/report/overview/index.php');
  }

  /** Course link in the overview table. @param {string} name */
  courseLink(name) {
    return this.main.getByRole('link', { name, exact: true });
  }

  /** @param {string} name e.g. "Course", "Grades" */
  courseTab(name) {
    return this.courseTabs.getByRole('menuitem', { name, exact: true });
  }

  /** @param {string} name column header, e.g. "Grade item" */
  column(name) {
    return this.gradeTable.getByRole('columnheader', { name, exact: true });
  }

  /** Grade item link in the course report, e.g. "English". @param {string} name */
  gradeItem(name) {
    return this.gradeTable.getByRole('link', { name, exact: true });
  }
}
