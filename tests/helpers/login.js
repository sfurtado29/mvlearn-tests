import { LoginPage } from '../pages/common/LoginPage.js';

/**
 * Submits the login form (already open) and waits until the browser has left the login page.
 * Dev intermittently answers "Invalid login" to the correct password (about 2 in 75 logins;
 * not caused by parallel logins). Never retried: each rejection counts as a failed login.
 * @param {import('@playwright/test').Page} page
 * @param {{ username: string, password: string } | null} credentials
 */
export async function submitLogin(page, credentials) {
  if (!credentials) throw new Error('No credentials given to submitLogin');
  const loginPage = new LoginPage(page);
  await loginPage.login(credentials.username, credentials.password);
  const outcome = await Promise.race([
    page.waitForURL((url) => !url.pathname.startsWith('/login/'), { timeout: 45_000 }).then(() => 'in', () => 'timeout'),
    loginPage.error.waitFor({ timeout: 45_000 }).then(() => 'rejected', () => 'timeout'),
    loginPage.sessionTimedOut.waitFor({ timeout: 45_000 }).then(() => 'session-lost', () => 'timeout'),
  ]);
  if (outcome === 'rejected') {
    throw new Error(
      'The site rejected the password ("Invalid login"). Check the .env value (quote it if it contains #); ' +
        'on dev this is also a known intermittent issue, so rerun the test once.',
    );
  }
  if (outcome === 'session-lost') {
    throw new Error(
      'The site answered "Your session has timed out" right after the login page loaded (session lost ' +
        'between loading the form and submitting it). Known intermittent issue; rerun the test.',
    );
  }
  if (outcome === 'timeout') throw new Error('Login did not finish within 45 s');
}
