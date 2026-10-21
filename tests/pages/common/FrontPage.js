export class FrontPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.main = page.getByRole('main');
    this.siteHeading = page.getByRole('banner').getByRole('heading', { level: 1 });
    this.availableCoursesHeading = this.main.getByRole('heading', { name: 'Available courses' });
  }

  async goto() {
    return this.page.goto('/');
  }

  /** @param {string} name */
  courseLink(name) {
    return this.main.getByRole('link', { name, exact: true });
  }

  /** @param {string} name */
  teacherLink(name) {
    return this.main.getByRole('link', { name, exact: true });
  }
}
