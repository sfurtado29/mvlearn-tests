// Which .env keys and saved session belong to each role. The project's `role` option (see
// playwright.config.js) picks one; tests get the credentials through tests/fixtures.js.
import { AUTH_FILE, MANAGER_AUTH_FILE } from '../../target.js';

export const ROLES = {
  user: { usernameVar: 'APP_USERNAME', passwordVar: 'APP_PASSWORD', authFile: AUTH_FILE },
  manager: { usernameVar: 'MANAGER_USERNAME', passwordVar: 'MANAGER_PASSWORD', authFile: MANAGER_AUTH_FILE },
};

/**
 * The role's credentials from .env, or null when they are not set.
 * @param {string} role
 * @returns {{ username: string, password: string } | null}
 */
export function credentialsFor(role) {
  const entry = ROLES[role];
  if (!entry) throw new Error(`Unknown role "${role}". Known roles: ${Object.keys(ROLES).join(', ')}.`);
  const username = process.env[entry.usernameVar]?.trim();
  const password = process.env[entry.passwordVar];
  return username && password ? { username, password } : null;
}
