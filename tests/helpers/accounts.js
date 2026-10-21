// Account helpers. Values come from .env; never log the passwords.

/**
 * Account used for the repeatable SCORM tests. Falls back to the main APP account.
 * When `isAppAccount` is true, tests may reuse the shared storageState session.
 * @returns {{ username: string, password: string, isAppAccount: boolean }}
 */
export function getScormAccount() {
  const username = process.env.SCORM_USERNAME?.trim();
  const password = process.env.SCORM_PASSWORD;
  if (username && password) {
    return { username, password, isAppAccount: username === process.env.APP_USERNAME?.trim() };
  }
  return {
    username: String(process.env.APP_USERNAME).trim(),
    password: String(process.env.APP_PASSWORD),
    isAppAccount: true,
  };
}

/**
 * The SCORM_POOL account named by E2E_ACCOUNT (a username), or null when E2E_ACCOUNT is not set.
 * Throws if the name is not in SCORM_POOL, so a typo never falls back to another account.
 * @returns {{ username: string, password: string } | null}
 */
export function getE2EAccount() {
  const wanted = process.env.E2E_ACCOUNT?.trim();
  if (!wanted) return null;
  const account = getPoolAccounts().find((entry) => entry.username === wanted);
  if (!account) throw new Error(`E2E_ACCOUNT "${wanted}" is not in SCORM_POOL.`);
  return account;
}

/**
 * Fresh accounts for the account-consuming SCORM suite, from SCORM_POOL="user1:pass1;user2:pass2".
 * Returns [] when SCORM_POOL is empty. Passwords may contain ':' (only the first one splits).
 * @returns {{ username: string, password: string }[]}
 */
export function getPoolAccounts() {
  return parsePool('SCORM_POOL');
}

/**
 * Accounts for the load-test browser probes, from LOAD_PROBE_POOL (same format as SCORM_POOL).
 * Kept separate from SCORM_POOL and the APP account: probes Restart the course on every run.
 * @returns {{ username: string, password: string }[]}
 */
export function getProbeAccounts() {
  return parsePool('LOAD_PROBE_POOL');
}

/**
 * Parses "user1:pass1;user2:pass2" from the named env var. Passwords may contain ':' (only the
 * first one splits).
 * @param {string} name
 * @returns {{ username: string, password: string }[]}
 */
function parsePool(name) {
  return String(process.env[name] ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const index = entry.indexOf(':');
      if (index <= 0 || index === entry.length - 1) {
        throw new Error(`${name} entries must look like "username:password", separated by ";".`);
      }
      return { username: entry.slice(0, index).trim(), password: entry.slice(index + 1) };
    });
}
