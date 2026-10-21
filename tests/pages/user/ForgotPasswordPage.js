// Never submit this form from tests: it sends a reset email.
export class ForgotPasswordPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.main = page.getByRole('main');
    this.usernameField = this.main.getByRole('group', { name: 'Search by username' }).getByRole('textbox', { name: 'Username' });
    this.emailField = this.main.getByRole('group', { name: 'Search by email address' }).getByRole('textbox', { name: 'Email address' });
  }

  async goto() {
    return this.page.goto('/login/forgot_password.php');
  }
}
