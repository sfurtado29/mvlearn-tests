// Small helpers for Moodle (Boost) UI controls.

export const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Visible label of a dropdown button, without Moodle's font-icon glyphs (private-use characters).
 * @param {import('@playwright/test').Locator} locator
 */
export async function labelOf(locator) {
  const text = (await locator.textContent()) ?? '';
  return text.replace(/[-]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Matches an option whose text is exactly `label`, ignoring icon glyphs and whitespace.
 * @param {string} label
 */
export const exactOption = (label) => new RegExp(`^[\\s\\uE000-\\uF8FF]*${escapeRegExp(label)}\\s*$`);
