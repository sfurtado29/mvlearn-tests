import { COURSE } from '../../data/site.js';

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Menu treeitem accessible names are "<title>" plus an optional state suffix, e.g.
// "Welcome visited", "End locked", "Speeding visited, locked". Verified on dev.
const STATE_SUFFIX = '(?: (?:visited, locked|visited|locked))?';

/**
 * Articulate Storyline 360 player inside Moodle's SCORM player page (one iframe).
 * See docs/scorm-notes.md for how each locator was verified.
 */
export class ScormPlayer {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.iframe = page.locator('iframe[title="Driver\'s License Renewal Course"]');
    this.frame = this.iframe.contentFrame();

    // Moodle, outside the iframe.
    this.launchLink = page.getByRole('region', { name: 'Content' }).getByRole('link', { name: COURSE.launchLinkName });
    this.exitActivityLink = page.getByRole('link', { name: 'Exit activity' });

    // Resume prompt: a dialog with "Resume" / "Restart" shown on launch when progress exists.
    this.resumeButton = this.frame.getByRole('button', { name: 'Resume', exact: true });
    this.restartButton = this.frame.getByRole('button', { name: 'Restart', exact: true });

    // Player controls. "next"/"previous" are disabled via aria-disabled="true" (class cs-disabled).
    this.nextButton = this.frame.getByRole('button', { name: 'next', exact: true });
    this.previousButton = this.frame.getByRole('button', { name: 'previous', exact: true });
    this.replayButton = this.frame.getByRole('button', { name: 'replay', exact: true });
    this.playPauseButton = this.frame.getByRole('button', { name: 'play/pause', exact: true });
    this.exitButton = this.frame.getByRole('button', { name: 'Exit', exact: true });
    // In-slide button whose accessible element sits under its own drawn shape; see advanceSlide().
    this.continueButton = this.frame.getByRole('main').getByRole('button', { name: /^continue$/i });
    // Quiz intro slide button. Pressing it starts the quiz; quiz results cannot be undone.
    this.beginQuizButton = this.frame.getByRole('main').getByRole('button', { name: /begin quiz/i });

    // "Sidebar Toggle" is the hamburger; at desktop width the sidebar starts expanded.
    this.menuButton = this.frame.getByRole('button', { name: 'Sidebar Toggle' });
    this.menuTab = this.frame.getByRole('tab', { name: 'Menu', exact: true });
    this.transcriptTab = this.frame.getByRole('tab', { name: 'Transcript', exact: true });
    this.menuTree = this.frame.getByRole('tree', { name: 'Menu' });

    // Visually hidden live region; its text is "slide: <slide title>".
    this.slideLabel = this.frame.locator('#slide-label');
  }

  /**
   * Press a Storyline button. Its accessible element sometimes has no clickable area on screen
   * (seen on CONTINUE of the "Right-of-Way" tile slide, 2026-10-13); then a click can never land,
   * so after 5 s it is focused and activated with Enter, as a keyboard user would.
   * @param {import('@playwright/test').Locator} button
   */
  async activate(button) {
    try {
      await button.click({ force: true, timeout: 5_000 });
    } catch {
      // The click often works and the slide moves on mid-click, so the button disappears and the
      // click reports a timeout (seen 2026-10-14). Gone = done; the caller waits for the change.
      if (!(await button.count())) return;
      await button.focus({ timeout: 5_000 }).catch(() => {});
      if (await button.count()) await this.page.keyboard.press('Enter');
    }
  }

  /**
   * From the course page, open the player (same tab) and wait for its iframe.
   * @param {import('@playwright/test').Locator} [link] the launch link; defaults to COURSE.launchLinkName
   *   (the probe passes the language link instead, whose text changes with progress)
   */
  async launch(link = this.launchLink) {
    await link.click();
    await this.page.waitForURL(/\/mod\/scorm\/player\.php/);
    await this.iframe.waitFor();
  }

  /**
   * If the Resume/Restart prompt appears before the first slide renders, choose `choice`.
   * @param {'restart' | 'resume'} [choice]
   * @param {number} [timeout] how long to wait for either the prompt or a slide
   * @returns {Promise<boolean>} whether the prompt was shown
   */
  async handleResumePrompt(choice = 'restart', timeout = 45_000) {
    const frame = await this.#contentFrame();
    const handle = await frame.waitForFunction(
      () => {
        const names = [...document.querySelectorAll('[role="dialog"] button, dialog button')].map((b) =>
          b.textContent.trim(),
        );
        if (names.includes('Restart')) return 'prompt';
        return document.querySelector('#slide-label')?.textContent?.trim() ? 'slide' : false;
      },
      undefined,
      { timeout, polling: 250 },
    );
    if ((await handle.jsonValue()) !== 'prompt') return false;
    // The prompt's buttons can be drawn just outside the viewport (seen 2026-10-15: "element is
    // outside of the viewport"), so a plain click may never land: activate() falls back to Enter.
    await this.activate(choice === 'resume' ? this.resumeButton : this.restartButton);
    await this.waitForSlide();
    return true;
  }

  /** Wait until a slide has rendered (the slide label is filled in). */
  async waitForSlide(timeout = 60_000) {
    const frame = await this.#contentFrame();
    await frame.waitForFunction(() => !!document.querySelector('#slide-label')?.textContent?.trim(), undefined, {
      timeout,
      polling: 250,
    });
  }

  /** Current slide title from the player's live region, e.g. "Basic Speed Law (cont.)". */
  async currentSlideTitle() {
    const text = (await this.slideLabel.textContent()) ?? '';
    return text.replace(/^slide:\s*/, '').trim();
  }

  /**
   * Title of the highlighted menu item (a slide can share one menu item with its "(cont.)" slides),
   * or null when none is highlighted (the case on quiz question slides).
   */
  async selectedMenuTitle() {
    return this.menuTree
      .locator('.cs-listitem.cs-selected')
      .getAttribute('data-slide-title', { timeout: 2_000 })
      .catch(() => null);
  }

  /**
   * Move one step forward: click the in-slide CONTINUE if shown, else wait for "next" to be enabled
   * and click it; then wait for the slide title to change. Slides also auto-advance when their
   * timeline ends; if that happens while waiting, nothing is clicked and the step counts as done.
   * With `stopAtRadio`, a slide showing radios (a click-to-select practice) also returns 'stopped'.
   * With `stopAtButton` (a case-insensitive regex source, e.g. 'begin quiz'), nothing is clicked if
   * the slide shows a button whose text matches; it returns `action: 'stopped'` instead. The check
   * runs at the moment of deciding to click, so slow-rendering content cannot slip past it.
   * @param {{ timeout?: number, stopAtButton?: string }} [options] timeout: how long to wait for
   *   CONTINUE/next to become available
   * @returns {Promise<{ from: string, to: string, action: 'continue' | 'next' | 'auto' | 'stopped' }>}
   */
  async advanceSlide({ timeout = 120_000, stopAtButton, stopAtRadio = false } = {}) {
    await this.waitForSlide();
    const from = await this.currentSlideTitle();
    const frame = await this.#contentFrame();
    const deadline = Date.now() + timeout;
    /** @type {'continue' | 'next' | 'auto' | 'stopped'} */
    let action;
    for (;;) {
      await frame.evaluate(() => {
        window.__pwNextEnabledSince = undefined;
      });
      const ready = await frame.waitForFunction(
        ({ fromLabel, stopPattern, stopRadio }) => {
          const label = document.querySelector('#slide-label')?.textContent?.trim();
          if (label && label !== fromLabel) return 'auto';
          const main = document.querySelector('#slide main');
          // Click-to-reveal / select slides: their items are radios (<input type="radio">), shown
          // after the narration.
          if (stopRadio && main?.querySelector('input[type="radio"], [role="radio"]')) return 'stopped';
          if (stopPattern) {
            const stop = new RegExp(stopPattern, 'i');
            if ([...(main?.querySelectorAll('button') ?? [])].some((b) => stop.test(b.textContent.trim()))) {
              return 'stopped';
            }
          }
          const cont = [...(main?.querySelectorAll('button') ?? [])].find(
            (b) => /^continue$/i.test(b.textContent.trim()) && !b.disabled && b.getAttribute('aria-disabled') !== 'true',
          );
          if (cont) return 'continue';
          // The label changes before "next" is reset for the new slide, so only trust "next" once
          // it has stayed enabled for a second.
          // Hidden "next" (e.g. on click-to-reveal slides until every item is clicked) is not "enabled".
          const next = document.querySelector('#next');
          const enabled =
            !!next &&
            next.getClientRects().length > 0 &&
            next.getAttribute('aria-disabled') !== 'true' &&
            !next.classList.contains('cs-disabled');
          if (!enabled) {
            window.__pwNextEnabledSince = undefined;
            return false;
          }
          window.__pwNextEnabledSince ??= Date.now();
          return Date.now() - window.__pwNextEnabledSince >= 1_000 ? 'next' : false;
        },
        { fromLabel: `slide: ${from}`, stopPattern: stopAtButton, stopRadio: stopAtRadio },
        { timeout: Math.max(deadline - Date.now(), 1), polling: 250 },
      );
      action = await ready.jsonValue();
      if (action === 'stopped') return { from, to: from, action };
      if (action === 'continue') {
        // The drawn button shape covers the accessible <button>; force clicks the same spot (or,
        // when the accessible button has no area on screen, Enter on it).
        await this.activate(this.continueButton.first());
        break;
      }
      if (action === 'auto') break;
      // "next" also enables the moment an auto-advancing slide moves on. If it got disabled again
      // before the click, the click never happens: re-check instead of clicking a later slide.
      try {
        await this.nextButton.click({ timeout: 5_000 });
        break;
      } catch (error) {
        if ((await this.slideLabel.textContent())?.trim() !== `slide: ${from}`) {
          action = 'auto';
          break;
        }
        if (Date.now() >= deadline) throw error;
      }
    }
    // Loading the next slide can take 20s+ on dev.
    await frame.waitForFunction(
      (fromLabel) => {
        const label = document.querySelector('#slide-label')?.textContent?.trim();
        return !!label && label !== fromLabel;
      },
      `slide: ${from}`,
      { timeout: 60_000, polling: 250 },
    );
    return { from, to: await this.currentSlideTitle(), action };
  }

  /**
   * Advance until the current slide title equals `title`.
   * @param {string} title
   * @param {number} maxSteps upper bound on advanceSlide() calls
   */
  async goToSlide(title, maxSteps) {
    for (let step = 0; step < maxSteps; step++) {
      if ((await this.currentSlideTitle()) === title) return;
      await this.advanceSlide();
    }
    if ((await this.currentSlideTitle()) !== title) {
      throw new Error(`goToSlide: "${title}" not reached within ${maxSteps} steps (at "${await this.currentSlideTitle()}")`);
    }
  }

  async openMenu() {
    if ((await this.menuButton.getAttribute('aria-expanded')) !== 'true') await this.menuButton.click();
    await this.menuTab.click();
    await this.menuTree.waitFor();
  }

  async closeMenu() {
    if ((await this.menuButton.getAttribute('aria-expanded')) === 'true') await this.menuButton.click();
  }

  async openTranscript() {
    if ((await this.menuButton.getAttribute('aria-expanded')) !== 'true') await this.menuButton.click();
    await this.transcriptTab.click();
  }

  /**
   * Menu treeitem by title, whatever its state. Titles repeat across sections ("Introduction",
   * "End of Section Quiz", "End", ...), so pass `section` to pick one; otherwise the first match wins.
   * Slides of a collapsed section are hidden (only the current section is expanded), so this
   * finds visible items only; isLocked()/isVisited() also work for hidden ones.
   * @param {string} name
   * @param {{ section?: string }} [options]
   */
  menuItem(name, { section } = {}) {
    const byName = (text) => ({ name: new RegExp(`^${escapeRegExp(text)}${STATE_SUFFIX}$`) });
    const scope = section ? this.menuTree.getByRole('treeitem', byName(section)).getByRole('group') : this.menuTree;
    return scope.getByRole('treeitem', byName(name)).first();
  }

  /**
   * @param {string} name
   * @param {{ section?: string }} [options]
   */
  async isLocked(name, options = {}) {
    return this.#hasState(name, options, /(^| )locked$/);
  }

  /**
   * @param {string} name
   * @param {{ section?: string }} [options]
   */
  async isVisited(name, options = {}) {
    return this.#hasState(name, options, /(^| )visited(, locked)?$/);
  }

  /**
   * Every treeitem currently in the menu, in order, with its state.
   * @returns {Promise<{ title: string, visited: boolean, locked: boolean, selected: boolean }[]>}
   */
  async menuItems() {
    return this.menuTree.locator('[role="treeitem"] > .cs-listitem').evaluateAll((items) =>
      items.map((item) => {
        const title = item.getAttribute('data-slide-title') ?? '';
        const state = (item.querySelector(':scope > span')?.textContent ?? '').trim().slice(title.length).trim();
        return {
          title,
          visited: state.startsWith('visited'),
          locked: state.endsWith('locked'),
          selected: item.classList.contains('cs-selected'),
        };
      }),
    );
  }

  /** Click Moodle's "Exit activity" (outside the iframe) and wait for the course page. */
  async exit() {
    await this.exitActivityLink.click();
    await this.page.waitForURL(/\/course\/view\.php/);
  }

  /**
   * @param {string} name
   * @param {{ section?: string }} options
   * @param {RegExp} suffix tested against the state part of the accessible name
   */
  async #hasState(name, { section }, suffix) {
    // Hidden items get a different accessible name (aria-hidden text is included), so match the
    // exact data-slide-title instead. The item's first <span> holds e.g. "Speeding visited".
    const title = (text) => `.cs-listitem[data-slide-title="${text.replace(/["\\]/g, '\\$&')}"]`;
    const scope = section
      ? this.menuTree.locator(`li[role="treeitem"]:has(> ${title(section)}) > [role="group"]`)
      : this.menuTree;
    const nameSpan = scope.locator(`li[role="treeitem"] > ${title(name)} > span`).first();
    const label = ((await nameSpan.textContent()) ?? '').trim();
    return suffix.test(label.slice(name.length).trim());
  }

  async #contentFrame() {
    const frame = await (await this.iframe.elementHandle())?.contentFrame();
    if (!frame) throw new Error('SCORM player iframe has no content frame');
    return frame;
  }
}
