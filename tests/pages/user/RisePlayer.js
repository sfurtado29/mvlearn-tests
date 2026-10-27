import { CoursePage } from './CoursePage.js';

// Buttons that move the learner forward: CONTINUE blocks inside a lesson (they reveal the blocks
// below them) and the button at the end of a lesson. "next lesson" is a guess from Rise's defaults.
const FORWARD = /^\s*(continue|next lesson)\s*$/i;
const START = /^\s*(start|resume) course\s*$/i;

/** @typedef {{ question: string, answer: string, attempts: number, expected: string | undefined }} Answer */
/** @typedef {{ categories: string[], cards: Record<string, string> }} SortingActivity */
/** @typedef {{ card: string, category: string, attempts: number, expected: string | undefined }} Sorted */

const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

// The functions below run in the page on a question block (see answerQuestions), so each is
// self-contained.

/** @param {Element} block @returns {{ question: string, options: string[] }} */
function readQuestion(block) {
  const label = (radio) =>
    (radio.labels?.[0]?.innerText || radio.closest('label')?.innerText || radio.getAttribute('aria-label') || '')
      .replace(/\s+/g, ' ')
      .trim();
  const options = [...block.querySelectorAll('input[type="radio"], [role="radio"]')].map(label);
  const text = block.innerText.replace(/requires a correct answer to continue/gi, '').replace(/\s+/g, ' ').trim();
  const end = options[0] ? text.indexOf(options[0]) : -1;
  // Without an audio player's time and speed ("0:06 1x"), seen after the BAC questions.
  const question = (end > 0 ? text.slice(0, end) : text.slice(0, 200)).replace(/\s*\d+:\d{2}\s*\d+(\.\d+)?x\s*$/, '');
  return { question: question.trim(), options };
}

/** Select option `index` (a click on the radio itself) and report whether it is now checked. */
function selectOption(block, index) {
  const radio = /** @type {HTMLInputElement | undefined} */ (
    block.querySelectorAll('input[type="radio"], [role="radio"]')[index]
  );
  if (!radio) return false;
  const isChecked = () => radio.checked || radio.getAttribute('aria-checked') === 'true';
  if (!isChecked()) radio.click();
  return isChecked();
}

/**
 * Card stacks (runs in the page on the "<n> of <total>" counter; self-contained, like every
 * function passed to evaluate). The current card is the group named like the counter ("1 of 5"),
 * holding groups "Front of card" / "Back of card", each with its own "Play" button; the arrow is
 * "Go to next slide" (dev 2026-10-27).
 *   state:     'playing' / 'stopped' from the side's audio button ("Pause" while playing), null if none
 *   flip-mark: mark the card's "Click to flip" buttons, so flipCards() leaves them alone
 *   intro-state / intro-play: the block's own narration, the nearest "Audio player" group outside
 *     the "Flashcard carousel" region (pressed from code: no card involved)
 * Flipping, Play on a card and "Go to next slide" are real mouse clicks, in playCardStack().
 * @param {Element} counter
 * @param {{ action: 'state' | 'flip-mark' | 'intro-state' | 'intro-play', side?: string }} args
 */
function cardStack(counter, { action, side }) {
  const nameOf = (el) =>
    (
      el.getAttribute('aria-label') ??
      (el.getAttribute('aria-labelledby') ?? '')
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? '')
        .join(' ')
    ).trim();
  const label = (b) => (b.getAttribute('aria-label') ?? b.innerText).trim();
  const groups = (root, name) => [...root.querySelectorAll('[role="group"]')].filter((g) => nameOf(g) === name);
  const card = groups(document, counter.textContent.trim())[0];
  if (action.startsWith('intro-')) {
    // The nearest "Audio player" group outside the carousel, searching up a few levels.
    const carousel = counter.closest('[role="region"]');
    let player;
    for (let el = carousel?.parentElement, level = 0; el && !player && level < 6; el = el.parentElement, level++) {
      player = groups(el, 'Audio player').find((g) => !carousel?.contains(g));
    }
    const button = [...(player?.querySelectorAll('button') ?? [])].find((b) => /^(play|pause|replay)$/i.test(label(b)));
    if (action === 'intro-play') {
      if (button && !/^pause$/i.test(label(button))) button.click();
      return null;
    }
    return button ? (/^pause$/i.test(label(button)) ? 'playing' : 'stopped') : null;
  }
  if (!card) throw new Error(`Card stack: no card group "${counter.textContent.trim()}"`);
  if (action === 'flip-mark') {
    // So flipCards() leaves the stack's cards alone.
    for (const b of card.querySelectorAll('button')) if (/^Click to flip/i.test(label(b))) b.setAttribute('data-pw-flipped', '');
    return null;
  }
  const sideGroup = groups(card, side ?? '')[0];
  const audio = [...(sideGroup?.querySelectorAll('button') ?? [])].find((b) => /^(play|pause|replay)$/i.test(label(b)));
  return audio ? (/^pause$/i.test(label(audio)) ? 'playing' : 'stopped') : null;
}

/**
 * The audio of the step on screen in a process block (runs in the page on the block). The slides
 * are groups "1 of 8" ... "8 of 8" (introduction with START, then steps 1-7 on What to Do), each
 * with an "Audio player"; the slide on screen is the one not hidden from assistive technology.
 * Falls back to the player nearest the block's centre. 'state': 'playing' / 'stopped' ("Pause"
 * while playing), null if none; 'play': press Play.
 * @param {Element} block
 * @param {'state' | 'play'} action
 */
function stepAudio(block, action) {
  const nameOf = (el) => (el.getAttribute('aria-label') ?? '').trim();
  const label = (b) => (b.getAttribute('aria-label') ?? b.innerText).trim();
  const groups = [...block.querySelectorAll('[role="group"]')];
  const shown = (el) => !el.closest('[aria-hidden="true"], [inert]') && el.getBoundingClientRect().width > 2;
  const slide = groups.find((g) => /^\d+ of \d+$/.test(nameOf(g)) && shown(g));
  const b = block.getBoundingClientRect();
  const centre = b.left + b.width / 2;
  const distance = (g) => {
    const r = g.getBoundingClientRect();
    return Math.abs(r.left + r.width / 2 - centre);
  };
  const player = slide
    ? [...slide.querySelectorAll('[role="group"]')].find((g) => nameOf(g) === 'Audio player')
    : groups
        .filter((g) => nameOf(g) === 'Audio player' && g.getBoundingClientRect().width > 2)
        .sort((x, y) => distance(x) - distance(y))[0];
  const button = [...(player?.querySelectorAll('button') ?? [])].find((el) => /^(play|pause|replay)$/i.test(label(el)));
  if (action === 'play') {
    if (button && !/^pause$/i.test(label(button))) button.click();
    return null;
  }
  return button ? (/^pause$/i.test(label(button)) ? 'playing' : 'stopped') : null;
}

// Scenario blocks: everything below runs in the page on the scenario's element.

/**
 * The scene on screen: its prompt ("Scenario 1: Select who has ...") and choice texts (without
 * the number badge). Choices are the visible buttons that are not the scenario's own controls.
 * @returns {{ prompt: string, choices: string[] }}
 */
function readScene(block) {
  const controls = /^(continue|try again|start over|\d+(\.\d+)?x|[\d:]+)$/i;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 && !el.closest('[aria-hidden="true"]');
  };
  const choices = [...block.querySelectorAll('button')]
    .filter(shown)
    .map((b) => b.innerText.replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim())
    .filter((text) => text.length > 3 && !controls.test(text));
  const lines = block.innerText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !controls.test(line) && !/^\d+$/.test(line) && !choices.includes(line));
  return { prompt: lines.slice(0, 2).join(' '), choices };
}

/** Click the choice whose text (without the badge) is `text`. */
function clickChoice(block, text) {
  const button = [...block.querySelectorAll('button')].find(
    (b) => b.innerText.replace(/^\s*\d+\s*/, '').replace(/\s+/g, ' ').trim() === text,
  );
  if (!button) throw new Error(`Scenario choice "${text}" is gone`);
  button.click();
}

/**
 * After a choice: 'incorrect' when TRY AGAIN shows, 'correct' when a CONTINUE (next scene) or
 * "Scenario Complete!" shows, else null (still waiting).
 */
function sceneOutcome(block) {
  const visible = (b) => b.getBoundingClientRect().width > 2 && !b.closest('[aria-hidden="true"]');
  const buttons = [...block.querySelectorAll('button')].filter(visible).map((b) => b.innerText.trim());
  if (buttons.some((t) => /^try again$/i.test(t))) return 'incorrect';
  if (buttons.some((t) => /^continue$/i.test(t)) || /scenario complete/i.test(block.innerText)) return 'correct';
  return null;
}

/**
 * State of a sorting activity (runs in the course frame): whether the result shows, and the text
 * of the card on top of the pile: the first visible text of the activity that is not a category,
 * a placed card or the activity's own labels.
 * @param {{ categories: string[], placed: string[] }} args
 * @returns {{ done: boolean, card: string | undefined } | null} null when the activity is not shown
 */
function readSorting({ categories, placed }) {
  // Real size, so screen-reader-only text (1px boxes, e.g. drag instructions) is not taken for a card.
  const visibleLeaves = (root) =>
    [...root.querySelectorAll('*')].filter((el) => {
      const r = el.getBoundingClientRect();
      return el.children.length === 0 && el.textContent?.trim() && r.width > 2 && r.height > 2;
    });
  const first = visibleLeaves(document.body).find((el) => el.textContent.trim() === categories[0]);
  if (!first) return null;
  // The activity: the nearest ancestor of the first category box holding every category plus more text.
  let block = first.parentElement;
  const ignore = new Set([...categories, ...placed]);
  const others = (el) =>
    visibleLeaves(el)
      .map((leaf) => leaf.textContent.trim())
      .filter((text) => !ignore.has(text) && !/^(replay|\d+\s*\/\s*\d+ cards correct)$/i.test(text));
  while (block && !(categories.every((c) => block.innerText.includes(c)) && others(block).length)) {
    block = block.parentElement;
  }
  if (!block) return { done: false, card: undefined };
  return { done: /\d+\s*\/\s*\d+ cards correct/i.test(block.innerText), card: others(block)[0] };
}

/**
 * The feedback label shown: a visible element whose whole text is "Correct" or "Incorrect" (the
 * options' "Correctly selected" and the "Requires a correct answer" note do not match).
 * @returns {'correct' | 'incorrect' | null}
 */
function feedbackIn(block) {
  const label = [...block.querySelectorAll('*')].find(
    (el) =>
      el.children.length === 0 &&
      /^(correct|incorrect)$/i.test(el.textContent?.trim() ?? '') &&
      el.getClientRects().length > 0 &&
      !el.closest('[aria-hidden="true"]'),
  );
  return label ? /** @type {'correct' | 'incorrect'} */ (label.textContent.trim().toLowerCase()) : null;
}

/** The block's visible button whose text matches `pattern` (case-insensitive), or null. */
function buttonIn(block, pattern) {
  const re = new RegExp(pattern, 'i');
  return (
    [...block.querySelectorAll('button')].find((b) => re.test(b.innerText.trim()) && b.getClientRects().length > 0) ?? null
  );
}

/**
 * Articulate Rise 360 course (v2 package) inside Moodle's SCORM player. Unlike Storyline (v1,
 * ScormPlayer.js) each lesson is one scrolling page; the sidebar lists the lessons.
 * From screenshots of dev (2026-10-26): the locators are text based until the DOM is checked.
 * See docs/scorm-notes-v2.md.
 */
export class RisePlayer {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    /** Rise's own document; set by launch(). @type {import('@playwright/test').Frame | undefined} */
    this.frame = undefined;
    /** What playCardStack() / stepThrough() saw per audio clip, for the test to log. @type {string[]} */
    this.stackLog = [];
    /** Audio clips played by stepThrough(). */
    this.audioPlayed = 0;

    // Moodle, outside the course frames.
    // "Begin Course (English)" or, once there is progress, "Continue (English)".
    this.launchLink = new CoursePage(page).languageLink('English');
    this.exitActivityLink = page.getByRole('link', { name: 'Exit activity' });
  }

  /** Visible buttons/links that move forward, in page order. */
  get forwardButtons() {
    return this.#content.locator('button, a, [role="button"]').filter({ hasText: FORWARD }).filter({ visible: true });
  }

  /** START COURSE / RESUME COURSE on the cover page (seen for an account without progress). */
  get startButton() {
    return this.#content.locator('button, a, [role="button"]').filter({ hasText: START }).filter({ visible: true });
  }

  /**
   * From the course page, open the player (same tab) and find the frame holding the course. Rise
   * may sit in a frame nested inside Moodle's, so it is found by its content, not by a selector.
   * @param {import('@playwright/test').Locator} [link]
   */
  async launch(link = this.launchLink) {
    await link.click();
    await this.page.waitForURL(/\/mod\/scorm\/player\.php/);
    const deadline = Date.now() + 60_000;
    while (!this.frame) {
      for (const frame of this.page.frames()) {
        if (frame === this.page.mainFrame()) continue;
        const isCourse = await frame
          .evaluate(() => /(start|resume) course|exit course|\d+% complete/i.test(document.body?.innerText ?? ''))
          .catch(() => false);
        if (isCourse) this.frame = frame;
      }
      if (this.frame) break;
      if (Date.now() > deadline) throw new Error('Rise course not found in any frame within 60 s');
      await this.page.waitForTimeout(500);
    }
  }

  /**
   * Leave the cover page if it is shown (START COURSE / RESUME COURSE), and wait for a lesson.
   * @returns {Promise<string | null>} the text of the button pressed, or null when there was no cover
   */
  async start(timeout = 60_000) {
    const deadline = Date.now() + timeout;
    for (;;) {
      if (await this.startButton.count()) {
        const text = ((await this.startButton.first().textContent()) ?? '').trim();
        await this.startButton.first().click();
        await this.#waitFor(async () => (await this.lessonHash()).includes('/lessons/'), deadline, 'a lesson after the cover');
        return text;
      }
      if ((await this.lessonHash()).includes('/lessons/')) return null;
      if (Date.now() > deadline) throw new Error('Neither the cover page nor a lesson appeared');
      await this.page.waitForTimeout(500);
    }
  }

  /** Rise's route, e.g. "#/lessons/abc123"; "#/" or "" on the cover page. */
  async lessonHash() {
    return this.#content.evaluate(() => location.hash);
  }

  /**
   * Title of the current lesson as the sidebar shows it (the page header can differ: "Welcome and
   * Learning Objectives" sits under "Welcome and Objectives"). Found as the link to the current route.
   * @returns {Promise<string | null>}
   */
  async currentLesson() {
    return this.#content.evaluate(() => {
      const hash = location.hash;
      if (!hash.includes('/lessons/')) return null;
      const link = [...document.querySelectorAll('a[href]')].find(
        (a) => a.getAttribute('href')?.endsWith(hash) && a.textContent?.trim(),
      );
      return link ? link.innerText.split('\n')[0].trim() : null;
    });
  }

  /**
   * Position from the lesson header "Lesson 7 of 80" (1-based). Titles repeat ("Turning" is in
   * Lessons 02 and 03), so this, not the title, says where the learner is.
   * @returns {Promise<{ number: number, total: number } | null>}
   */
  async lessonPosition() {
    return this.#content.evaluate(() => {
      const match = /Lesson (\d+) of (\d+)/.exec(document.querySelector('main')?.innerText ?? '');
      return match ? { number: Number(match[1]), total: Number(match[2]) } : null;
    });
  }

  /** The sidebar's "<n>% COMPLETE", as a number, or NaN when not shown. */
  async progress() {
    const text = await this.#content.evaluate(() => /(\d+)% complete/i.exec(document.body.innerText)?.[1] ?? '');
    return Number(text || NaN);
  }

  /**
   * Scroll the lesson to its end, a screen at a time, so lazily shown blocks render and Rise counts
   * them as seen. Scrolls the largest scrollable element (the lesson, not the sidebar).
   */
  async scrollToEnd() {
    await this.#content.evaluate(async () => {
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const scroller = () =>
        [document.scrollingElement, ...document.querySelectorAll('*')]
          .filter((el) => el && el.scrollHeight > el.clientHeight + 10)
          .filter((el) => el === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(el).overflowY))
          .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
      let atEnd = 0;
      for (let step = 0; step < 200 && atEnd < 3; step++) {
        const el = scroller();
        if (!el) return;
        el.scrollBy(0, el.clientHeight * 0.8);
        await pause(200);
        atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 2 ? atEnd + 1 : 0;
      }
    });
  }

  /**
   * One step forward: scroll to the end of what is shown, flip any flip cards, click any markers, press the first
   * CONTINUE (or the lesson's end button), then wait until it took effect: the button went away
   * (the blocks below it were revealed) or another lesson opened.
   * Questions on the way are answered first (answerQuestions), cards sorted (sortCards).
   * @param {{
   *   timeout?: number,
   *   answerFor?: (question: string) => string | undefined,
   *   sorting?: SortingActivity[],
   *   playAudio?: boolean,
   * }} [options] timeout: how long to look for an enabled button; answerFor, sorting: the keys;
   *   playAudio: play each step's audio in step blocks (see stepThrough)
   * @returns {Promise<{
   *   action: 'continue' | 'next-lesson', label: string, flipped: number, audio: number,
   *   markers: number, steps: number, answers: Answer[], sorted: Sorted[],
   * }>}
   */
  async advance({ timeout = 60_000, answerFor, sorting = [], playAudio = false } = {}) {
    const before = await this.lessonHash();
    let deadline = Date.now() + timeout;
    let flipped = 0;
    let audio = 0;
    let markers = 0;
    let steps = 0;
    /** @type {Answer[]} */
    const answers = [];
    /** @type {Sorted[]} */
    const sorted = [];
    for (;;) {
      await this.scrollToEnd();
      // Before flipCards(): it would flip the stack's cards without their audio.
      const played = await this.playCardStack();
      audio += played;
      // Waiting for audio can take minutes: the time limit is for finding CONTINUE afterwards.
      if (played) deadline = Date.now() + timeout;
      flipped += await this.flipCards();
      markers += await this.clickMarkers();
      const stepAudioBefore = this.audioPlayed;
      steps += await this.stepThrough({ playAudio });
      if (this.audioPlayed > stepAudioBefore) {
        audio += this.audioPlayed - stepAudioBefore;
        deadline = Date.now() + timeout;
      }
      answers.push(...(await this.answerQuestions(answerFor)));
      answers.push(...(await this.answerScenario(answerFor)));
      for (const activity of sorting) sorted.push(...(await this.sortCards(activity)));
      const button = this.forwardButtons.first();
      if ((await button.count()) && (await button.isEnabled())) {
        const label = ((await button.textContent()) ?? '').trim();
        const handle = await button.elementHandle();
        await button.click();
        await this.#waitFor(
          async () => (await this.lessonHash()) !== before || !(await handle?.isVisible().catch(() => false)),
          Date.now() + 30_000,
          `"${label}" to take effect`,
        );
        const action = (await this.lessonHash()) !== before ? 'next-lesson' : 'continue';
        return { action, label, flipped, audio, markers, steps, answers, sorted };
      }
      if (Date.now() > deadline) {
        const state = (await button.count()) ? 'a CONTINUE that stays disabled' : 'no CONTINUE';
        throw new Error(
          `Stuck in "${await this.currentLesson()}": ${state} after ${timeout / 1000} s. ` +
            `Visible buttons: ${JSON.stringify(await this.visibleButtons())}`,
        );
      }
      await this.page.waitForTimeout(1_000);
    }
  }

  /**
   * Flip every flip card not flipped yet ("Speed Limit Based on Location": CONTINUE only appears
   * once all six are flipped). Each card has a "Front of card" and a "Back of card" group, each
   * with a button "Click to flip <image alt / back text>"; one click on the side showing flips it.
   * Both buttons of a flipped card are marked so later steps in the same lesson leave it alone.
   * @returns {Promise<number>} how many cards were flipped
   */
  async flipCards() {
    // Not the cards of a stack playCardStack() finished: Rise redraws them and loses their marks
    // (one was flipped again on Heat Related Dangers, 2026-10-27).
    const cards = this.#content
      .getByRole('button', { name: /^Click to flip/ })
      .filter({ visible: true })
      .and(this.#content.locator(':not([data-pw-flipped]):not([data-pw-done] *)'));
    let flipped = 0;
    while (await cards.count()) {
      // A handle, not the locator: once marked, the locator would move on to the next card.
      const side = await cards.first().elementHandle();
      if (!side) break;
      await side.scrollIntoViewIfNeeded();
      await side.click({ force: true });
      await side.evaluate((button) => {
        const card = button.closest('[role="group"]')?.parentElement ?? button;
        for (const el of card.querySelectorAll('button')) el.setAttribute('data-pw-flipped', '');
        button.setAttribute('data-pw-flipped', '');
      });
      flipped++;
      await this.page.waitForTimeout(700); // flip animation
    }
    return flipped;
  }

  /**
   * Play a stack of flip cards shown one at a time ("Heat Related Dangers": 5 cards, "4 of 5",
   * ‹ › arrows). CONTINUE appears only once the audio of both sides of every card has played
   * (user, 2026-10-27). Per card: play the front's audio to the end, flip, play the back's, next.
   * The current card is the group named like the "<n> of <total>" counter (see cardStack()).
   * "Play" becomes "Pause" while a clip plays.
   * @returns {Promise<number>} how many audio clips were played
   */
  async playCardStack() {
    // Not inside a carousel already played (marked on the carousel: Rise redraws the counter, and
    // a mark on it was lost, so the stack was played twice, 2026-10-27).
    // Only in flashcard carousels: step blocks ("What to Do") have "<n> of <total>" slides too.
    const counter = this.#content
      .getByRole('region', { name: 'Flashcard carousel', exact: true })
      .getByText(/^\s*\d+ of \d+\s*$/)
      .filter({ visible: true })
      .and(this.#content.locator(':not([data-pw-done] *)'))
      .first();
    if (!(await counter.count())) return 0;
    const total = Number(/of (\d+)/.exec(await counter.innerText())?.[1] ?? 0);
    const counterHandle = await counter.elementHandle();
    if (!counterHandle || !total) return 0;
    await counter.scrollIntoViewIfNeeded();
    let played = 0;

    // The block's own narration above the cards ("Explore each interactive card ...", 0:18). With
    // all 10 card clips played the stack stayed locked (dev 2026-10-27), so it is played too.
    const intro = () => counterHandle.evaluate(cardStack, { action: 'intro-state' });
    if ((await intro()) !== null) {
      const t0 = Date.now();
      await counterHandle.evaluate(cardStack, { action: 'intro-play' });
      await this.#waitFor(async () => (await intro()) === 'playing', Date.now() + 15_000, 'the stack narration to start');
      await this.#waitFor(async () => (await intro()) !== 'playing', Date.now() + 180_000, 'the stack narration to end');
      this.stackLog.push(`stack narration: stopped after ${Date.now() - t0} ms`);
      played++;
    }
    // Flip and next are real mouse clicks, not element.click(): with clicks from code every card
    // turned and every clip played, but the stack stayed locked (dev 2026-10-27).
    const cardGroup = (n) => this.#content.getByRole('group', { name: `${n} of ${total}`, exact: true });
    for (let card = 1; card <= total; card++) {
      for (const side of ['Front of card', 'Back of card']) {
        if (side === 'Back of card') {
          await counterHandle.evaluate(cardStack, { action: 'flip-mark' });
          await cardGroup(card)
            .getByRole('group', { name: 'Front of card', exact: true })
            .getByRole('button', { name: /^Click to flip/ })
            .click({ force: true });
          await this.page.waitForTimeout(800); // flip animation
        }
        const state = () => counterHandle.evaluate(cardStack, { action: 'state', side });
        if ((await state()) === null) throw new Error(`Card stack: no audio player on the ${side} of card ${card}/${total}`);
        const t0 = Date.now();
        // Pressed from code: a real click cannot reach the back's Play on the turned card
        // ("outside of the viewport"); the clips played fine this way before.
        await cardGroup(card)
          .getByRole('group', { name: side, exact: true })
          .getByRole('button', { name: 'Play', exact: true })
          .evaluate((b) => /** @type {HTMLElement} */ (b).click());
        await this.#waitFor(async () => (await state()) === 'playing', Date.now() + 15_000, `audio to start (card ${card}, ${side})`);
        const started = Date.now() - t0;
        await this.#waitFor(async () => (await state()) !== 'playing', Date.now() + 180_000, `audio to end (card ${card}, ${side})`);
        // Rise's audio is not in the page as <audio> elements, so the time is the only evidence.
        this.stackLog.push(`card ${card} ${side}: started after ${started} ms, stopped after ${Date.now() - t0} ms`);
        played++;
      }
      if (card < total) {
        await this.#content.getByRole('button', { name: 'Go to next slide', exact: true }).click();
        await this.page.waitForTimeout(800); // slide animation
      }
    }
    await counterHandle.evaluate((el) => (el.closest('[role="region"]') ?? el).setAttribute('data-pw-done', ''));
    return played;
  }

  /**
   * Click every marker of labeled graphics not clicked yet ("Choosing a Lane": markers i and 1-4
   * on a photo; "Complete the content above before moving on" until all are opened, then
   * CONTINUE). Each opens its text bubble; clicked markers are marked so later steps skip them.
   * Selectors are from Rise's usual markup, not yet checked on dev.
   * @returns {Promise<number>} how many markers were clicked
   */
  async clickMarkers() {
    const markers = this.#content
      .locator('button[class*="marker" i], [role="button"][class*="marker" i], button[aria-label^="marker" i]')
      .filter({ visible: true })
      .and(this.#content.locator(':not([data-pw-clicked])'));
    let clicked = 0;
    while (await markers.count()) {
      // A handle, not the locator: once marked, the locator would move on to the next marker.
      const marker = await markers.first().elementHandle();
      if (!marker) break;
      await marker.evaluate((el) => el.setAttribute('data-pw-clicked', ''));
      await marker.scrollIntoViewIfNeeded();
      // Pressed directly: an open bubble can cover the next marker.
      await marker.evaluate((el) => /** @type {HTMLElement} */ (el).click());
      clicked++;
      await this.page.waitForTimeout(500); // bubble animation
    }
    return clicked;
  }

  /**
   * Go through every step of a process block ("Passing": "Procedure to Pass" with START, steps
   * 1-6 and a final ✓; "Complete the content above before moving on" until the ✓ is reached):
   * START (`block-process-card__start-btn`) if shown, then the block's next arrow until it is
   * disabled or gone. Only inside process blocks: "Choosing a Lane" has other "next" buttons.
   * The cards sit side by side in a sliding strip, so Playwright sees the buttons as "outside of
   * the viewport" (dev 2026-10-27): they are pressed directly.
   * With `playAudio` ("What to Do": steps 1-7), each step's audio is played to the end before
   * moving on; the clips are counted in `audioPlayed`.
   * @param {{ playAudio?: boolean }} [options]
   * @returns {Promise<number>} how many times START / next was pressed
   */
  async stepThrough({ playAudio = false } = {}) {
    // Blocks gone through are marked (on the outermost element, the first match), so later
    // passes over the same page leave them alone.
    const process = this.#content.locator('[class*="block-process"]:not([data-pw-done]):not([data-pw-done] *)');
    const start = process.locator('[class*="start-btn"]').filter({ visible: true });
    const next = process.getByRole('button', { name: /next/i });
    const press = async (button) => {
      await button.evaluate((el) => /** @type {HTMLElement} */ (el).click());
      await this.page.waitForTimeout(700); // slide animation
    };
    // "What to Do": CONTINUE only after each step's audio has played (user, 2026-10-27).
    const playStep = async (step) => {
      const block = process.first();
      const state = () => block.evaluate(stepAudio, 'state');
      if (!playAudio || (await state()) === null) return;
      const t0 = Date.now();
      await block.evaluate(stepAudio, 'play');
      await this.#waitFor(async () => (await state()) === 'playing', Date.now() + 15_000, `step ${step} audio to start`);
      await this.#waitFor(async () => (await state()) !== 'playing', Date.now() + 180_000, `step ${step} audio to end`);
      this.stackLog.push(`step ${step}: audio stopped after ${Date.now() - t0} ms`);
      this.audioPlayed++;
    };
    let pressed = 0;
    if (!(await next.count())) return 0;
    if (await start.count()) {
      await playStep(0);
      await press(start.first());
      pressed++;
    }
    for (let step = 1; step <= 20; step++) {
      await playStep(step);
      const button = next.first();
      if (!(await button.count()) || !(await button.isVisible())) break;
      const disabled = await button.evaluate(
        (el) => /** @type {HTMLButtonElement} */ (el).disabled || el.getAttribute('aria-disabled') === 'true',
      );
      if (disabled) break;
      await press(button);
      pressed++;
    }
    await process.first().evaluate((el) => el.setAttribute('data-pw-done', ''));
    return pressed;
  }

  /**
   * Sort the cards of a drag-and-drop activity, if it is on screen and not finished ("Choosing a
   * Lane": 9 cards into Lane 1/2/3). The top card of the pile is dragged onto the key's category,
   * else onto each category in turn: a wrong category does not take the card, so it stays on top.
   * Done when the result "<n>/<total> Cards Correct" shows.
   * Card and pile markup is not checked on dev yet: the top card is found as the activity's text
   * that is neither a category nor a card already placed.
   * @param {SortingActivity} activity
   * @returns {Promise<Sorted[]>}
   */
  async sortCards(activity) {
    const zone = (category) => this.#content.getByText(category, { exact: true }).filter({ visible: true }).first();
    if (!(await zone(activity.categories[0]).count())) return [];
    /** @type {Sorted[]} */
    const sorted = [];
    const placed = new Set();
    for (let guard = 0; guard < 50; guard++) {
      const state = await this.#content.evaluate(readSorting, { categories: activity.categories, placed: [...placed] });
      if (!state || state.done || !state.card) return sorted;
      const card = state.card;
      const expected = activity.cards[card];
      const order = [...new Set([...(expected ? [expected] : []), ...activity.categories])];
      let accepted;
      let attempts = 0;
      for (const category of order) {
        attempts++;
        await this.#drag(this.#content.getByText(card, { exact: true }).filter({ visible: true }).first(), zone(category));
        await this.page.waitForTimeout(1_500); // drop / bounce-back animation
        const after = await this.#content.evaluate(readSorting, { categories: activity.categories, placed: [...placed] });
        if (after?.done || after?.card !== card) {
          accepted = category;
          break;
        }
      }
      if (!accepted) throw new Error(`Sorting: no category took the card "${card}" (tried ${order.join(', ')})`);
      placed.add(card);
      sorted.push({ card, category: accepted, attempts, expected });
    }
    throw new Error('Sorting: more than 50 cards, the activity seems to loop');
  }

  /**
   * Drag with the mouse in small steps (drag-and-drop libraries ignore a jump).
   * @param {import('@playwright/test').Locator} source
   * @param {import('@playwright/test').Locator} target
   */
  async #drag(source, target) {
    await target.scrollIntoViewIfNeeded();
    await source.scrollIntoViewIfNeeded();
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (!from || !to) throw new Error('Sorting: card or category not on screen');
    const [x, y] = [from.x + from.width / 2, from.y + from.height / 2];
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + 10, y + 10, { steps: 5 });
    await this.page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 });
    await this.page.waitForTimeout(200);
    await this.page.mouse.up();
  }

  /**
   * Answer the scene of a scenario block on screen ("Practice Right-of-Way": intro + CONTINUE, then
   * 3 scenes, each "Scenario <n>: Select who has the right-of-way ..." with numbered choices; a
   * wrong one shows "Incorrect: ..." + TRY AGAIN, a right one a CONTINUE to the next scene; at the
   * end "Scenario Complete!" + START OVER). Answers one scene and returns: its CONTINUE is pressed
   * by advance(). The key's choice first, then the others in order.
   * Choices are the scenario's visible buttons other than its controls; markup not yet checked.
   * @param {(question: string) => string | undefined} [answerFor] start of the right choice's text
   * @returns {Promise<Answer[]>}
   */
  async answerScenario(answerFor = () => undefined) {
    const scenario = this.#content.locator('[class*="scenario" i]').filter({ visible: true }).first();
    if (!(await scenario.count())) return [];
    const block = await scenario.elementHandle();
    if (!block) return [];
    const scene = await block.evaluate(readScene);
    if (!scene.choices.length) return [];
    const { prompt, choices } = scene;
    const expected = answerFor(prompt);
    const keyIndex = expected === undefined ? -1 : choices.findIndex((c) => normalize(c).startsWith(normalize(expected)));
    const order = [...new Set([...(keyIndex >= 0 ? [keyIndex] : []), ...choices.keys()])];
    let attempts = 0;
    for (const index of order) {
      attempts++;
      await block.evaluate(clickChoice, choices[index]);
      const outcome = await this.#waitFor(
        async () => (await block.evaluate(sceneOutcome)) !== null,
        Date.now() + 15_000,
        `feedback on the choice "${choices[index]}"`,
      ).then(() => block.evaluate(sceneOutcome));
      if (outcome === 'correct') return [{ question: prompt, answer: choices[index], attempts, expected }];
      // Pressed directly, like TAKE AGAIN on the quizzes.
      await block.evaluate((el) =>
        [...el.querySelectorAll('button')].find((b) => /^try again$/i.test(b.innerText.trim()))?.click(),
      );
      await this.#waitFor(
        async () => (await block.evaluate(readScene)).choices.length > 0,
        Date.now() + 10_000,
        'the choices after TRY AGAIN',
      );
    }
    throw new Error(`Scenario "${prompt}": none of ${JSON.stringify(choices)} was accepted`);
  }

  /**
   * Answer every visible question not answered yet (a quiz page shows them one below the other,
   * each "Requires a correct answer to continue"): the key's answer first, then the other options
   * in order, with TAKE AGAIN after a wrong one, until the feedback says correct.
   * @param {(question: string) => string | undefined} [answerFor] start of the correct option's text
   * @returns {Promise<Answer[]>}
   */
  async answerQuestions(answerFor = () => undefined) {
    const submits = this.#content
      .locator('button')
      .filter({ hasText: /^\s*submit\s*$/i })
      .filter({ visible: true })
      .and(this.#content.locator(':not([data-pw-answered])'));
    /** @type {Answer[]} */
    const answers = [];
    while (await submits.count()) {
      const submit = await submits.first().elementHandle();
      if (!submit) break;
      await submit.evaluate((b) => b.setAttribute('data-pw-answered', ''));
      // The question block: the nearest ancestor of SUBMIT that also holds the options.
      const block = await submit.evaluateHandle((b) => {
        let el = b.parentElement;
        while (el && !el.querySelector('input[type="radio"], [role="radio"]')) el = el.parentElement;
        return el ?? b.parentElement;
      });
      await block.scrollIntoViewIfNeeded();
      const { question, options } = await block.evaluate(readQuestion);
      const expected = answerFor(question);
      const keyIndex = expected === undefined ? -1 : options.findIndex((o) => normalize(o).startsWith(normalize(expected)));
      const order = [...(keyIndex >= 0 ? [keyIndex] : []), ...options.keys()].filter((i, n, all) => all.indexOf(i) === n);

      let correct;
      let attempts = 0;
      for (const index of order) {
        attempts++;
        // Selected directly on the radio: a newly revealed question is still moving into place, so
        // a click by position can miss (SUBMIT then says "Please answer the question", 2026-10-26).
        let selected = false;
        for (let tries = 0; tries < 5 && !selected; tries++) {
          if (tries) await this.page.waitForTimeout(500);
          selected = await block.evaluate(selectOption, index);
        }
        if (!selected) throw new Error(`Question "${question}": option "${options[index]}" could not be selected`);
        await (await block.evaluateHandle(buttonIn, '^submit$')).asElement()?.click();
        const outcome = await this.#waitForFeedback(block);
        if (outcome === 'correct') {
          correct = options[index];
          break;
        }
        const retry = (await block.evaluateHandle(buttonIn, '^(take again|try again|retry)$')).asElement();
        if (!retry) throw new Error(`Question "${question}": wrong answer and no TAKE AGAIN button`);
        // The question card covers TAKE AGAIN ("intercepts pointer events", dev 2026-10-26), so a
        // mouse click never lands: press it directly.
        await retry.evaluate((b) => /** @type {HTMLElement} */ (b).click());
        // Wait for the old feedback to go, so the next SUBMIT is not judged by it.
        const until = Date.now() + 5_000;
        while ((await block.evaluate(feedbackIn)) && Date.now() < until) await this.page.waitForTimeout(250);
      }
      if (correct === undefined) throw new Error(`Question "${question}": none of ${JSON.stringify(options)} was accepted`);
      answers.push({ question, answer: correct, attempts, expected });
    }
    return answers;
  }

  /** Text of every visible button in the course, for error messages. */
  async visibleButtons() {
    return this.#content
      .locator('button, [role="button"]')
      .filter({ visible: true })
      .evaluateAll((buttons) =>
        buttons.map((b) => (b.innerText || b.getAttribute('aria-label') || '').trim()).filter(Boolean),
      );
  }

  /** The course's EXIT on the last page; not "EXIT COURSE" (top right). */
  get courseExitButton() {
    return this.#content.getByRole('button', { name: 'EXIT', exact: true }).filter({ visible: true });
  }

  /**
   * On the last page ("Conclusion"): "Congratulations!" + CONTINUE first (at 99%), then COMPLETE
   * SURVEY and EXIT (dev 2026-10-27). Presses CONTINUE until EXIT shows.
   * @returns {Promise<number>} how many CONTINUEs were pressed
   */
  async continueToExit() {
    for (let pressed = 0; pressed < 10; pressed++) {
      await this.scrollToEnd();
      if (await this.courseExitButton.count()) return pressed;
      const button = this.forwardButtons.first();
      if (await button.count()) {
        await button.click();
        await this.page.waitForTimeout(1_500);
      } else {
        await this.page.waitForTimeout(1_000);
      }
    }
    throw new Error(`No EXIT on "${await this.currentLesson()}". Visible buttons: ${JSON.stringify(await this.visibleButtons())}`);
  }

  /**
   * Press the course's EXIT, which ends the course ("Your results and completion status will be
   * updated once this window is closed"). Never COMPLETE SURVEY.
   */
  async finishCourse() {
    await this.courseExitButton.first().click();
    // Rise saves and ends the attempt; give it a moment before leaving the player.
    await this.page.waitForTimeout(3_000);
  }

  /** Click Moodle's "Exit activity" (outside the frames) and wait for the course page. */
  async exit() {
    await this.exitActivityLink.click();
    await this.page.waitForURL(/\/course\/view\.php/);
  }

  get #content() {
    if (!this.frame) throw new Error('RisePlayer: call launch() first');
    return this.frame;
  }

  /**
   * Wait for the feedback label after SUBMIT ("Correct" / "Incorrect").
   * @param {import('@playwright/test').JSHandle} block
   * @returns {Promise<'correct' | 'incorrect'>}
   */
  async #waitForFeedback(block) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const outcome = await block.evaluate(feedbackIn);
      if (outcome) return outcome;
      if (Date.now() > deadline) {
        const text = await block.evaluate((el) => el.innerText.replace(/\s+/g, ' ').slice(0, 500));
        throw new Error(`No Correct/Incorrect feedback after SUBMIT. Question block: ${text}`);
      }
      await this.page.waitForTimeout(250);
    }
  }

  /**
   * @param {() => Promise<boolean>} check
   * @param {number} deadline
   * @param {string} what for the error message
   */
  async #waitFor(check, deadline, what) {
    while (!(await check())) {
      if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
      await this.page.waitForTimeout(250);
    }
  }
}
