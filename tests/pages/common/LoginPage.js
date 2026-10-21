export class LoginPage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.username = page.getByLabel('Username');
    this.password = page.getByLabel('Password');
    this.loginButton = page.getByRole('button', { name: 'Log in', exact: true });
    this.error = page.getByText('Invalid login, please try again');
    // Shown instead of logging in when the session behind the login form was lost (seen on staging).
    this.sessionTimedOut = page.getByText('Your session has timed out. Please log in again.');
    this.lostPasswordLink = page.getByRole('link', { name: 'Lost password?' });

    // Shown instead of the form when a logged-in user opens the login page.
    this.alreadyLoggedInDialog = page.getByRole('alertdialog', { name: 'Confirm' });
    this.alreadyLoggedInText = this.alreadyLoggedInDialog.getByText(/You are already logged in as .+, you need to log out/);
    this.alreadyLoggedInCancel = this.alreadyLoggedInDialog.getByRole('button', { name: 'Cancel' });
  }

  async goto() {
    return this.page.goto('/login/index.php');
  }

  /**
   * @param {string | undefined} username
   * @param {string | undefined} password
   */
  async login(username, password) {
    await this.username.fill(String(username));
    await this.password.fill(String(password));
    await this.loginButton.click();
  }
}
