// WARNING: on both dev and staging, /mod/scorm/view.php may redirect straight into the SCORM
// player (the activity skips its entry page). Opening it launches the package, so do not call
// goto() from read-only tests.
export class ScormPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.enterButton = page.getByRole('button', { name: 'Enter' });
    this.exitActivityLink = page.getByRole('link', { name: 'Exit activity' });
  }

  /** @param {number} id */
  async goto(id) {
    return this.page.goto(`/mod/scorm/view.php?id=${id}`);
  }
}
