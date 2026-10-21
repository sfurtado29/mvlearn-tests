// Reads the SCORM runtime API that Moodle exposes on the top player page (/mod/scorm/player.php).
// On dev the package is SCORM 1.2 (window.API); window.API_1484_11 is supported as a fallback.
// SCORM 1.2 keys used so far: cmi.core.lesson_status, cmi.core.lesson_location, cmi.core.entry,
// cmi.suspend_data (Storyline keeps its bookmark there). See docs/scorm-notes.md.

/**
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<'1.2' | '2004' | null>}
 */
export async function getApiVersion(page) {
  return page.evaluate(() => {
    if (window.API) return '1.2';
    if (window.API_1484_11) return '2004';
    return null;
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} key e.g. 'cmi.core.lesson_status'
 * @returns {Promise<string>}
 */
export async function getValue(page, key) {
  return page.evaluate((cmiKey) => {
    if (window.API) return String(window.API.LMSGetValue(cmiKey));
    if (window.API_1484_11) return String(window.API_1484_11.GetValue(cmiKey));
    throw new Error('No SCORM API (window.API or window.API_1484_11) on this page');
  }, key);
}

/**
 * Resolves on the next progress save (POST /mod/scorm/datamodel.php). Start waiting before the
 * action that triggers it. Storyline commits about once a minute and on exit, not on every slide.
 * @param {import('@playwright/test').Page} page
 * @param {{ timeout?: number }} [options]
 */
export async function waitForSave(page, { timeout = 90_000 } = {}) {
  return page.waitForResponse(
    (response) => /\/mod\/scorm\/datamodel\.php/.test(response.url()) && response.request().method() === 'POST',
    { timeout },
  );
}
