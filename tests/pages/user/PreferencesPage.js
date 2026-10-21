// User menu → Preferences (/user/preferences.php). Read-only: tests open the linked pages but
// never submit their forms (Edit profile, Change password, ... would change the account).
export class PreferencesPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.main = page.getByRole('main');
    this.heading = this.main.getByRole('heading', { name: 'Preferences', level: 2 });
  }

  async goto() {
    return this.page.goto('/user/preferences.php');
  }

  /** @param {string} name e.g. "Edit profile" */
  link(name) {
    return this.main.getByRole('link', { name, exact: true });
  }
}
