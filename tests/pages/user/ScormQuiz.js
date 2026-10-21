// End of Section Quiz inside the Storyline player, verified on dev (section 1, 2026-10-12):
// - Question slides are titled "Question <n>"; no menu item is highlighted on them.
// - Options are radios named "A. …", "B. …", "C. …". Selecting one answers at once (no Submit);
//   the same slide then shows "Correct!" + "Continue". Wrong: "Incorrect." + "Try Again" +
//   "Continue" — Continue after a wrong answer sends the learner back to review slides, so this
//   class never presses it then.
// - Like CONTINUE elsewhere, the accessible elements sit under drawn shapes: clicks use force.
// - Feedback is read from the accessibility tree: Storyline keeps hidden copies of the feedback
//   layers in the DOM (not in the tree), and on some slides (e.g. "Practice Measuring BAC") the
//   accessible text is clipped off-screen while a drawn copy is shown, so "visible" is unreliable.
import { expect } from '@playwright/test';

export class ScormQuiz {
  /** @param {import('./ScormPlayer.js').ScormPlayer} player */
  constructor(player) {
    this.player = player;
    this.main = player.frame.getByRole('main');
    this.options = this.main.getByRole('radio');
    // Usually "Continue"; section 2 question 2's feedback button is labelled "Correct" (seen
    // 2026-10-12, likely an authoring slip) but works the same.
    this.continueButton = this.main.getByRole('button', { name: /^(continue|correct)$/i });
    this.tryAgainButton = this.main.getByRole('button', { name: /^try again$/i });
  }

  /**
   * Feedback currently shown, from the accessibility tree.
   * @returns {Promise<'correct' | 'incorrect' | null>}
   */
  async feedbackState() {
    const tree = await this.main.ariaSnapshot().catch(() => '');
    if (/- paragraph: "?Correct!?"?\s*$/m.test(tree)) return 'correct';
    if (/- paragraph: "?Incorrect\.?"?\s*$/m.test(tree)) return 'incorrect';
    return null;
  }

  /**
   * Wait until "Correct" or "Incorrect" is shown, and return which.
   * @returns {Promise<'correct' | 'incorrect'>}
   */
  async waitForFeedback(timeout = 30_000) {
    /** @type {'correct' | 'incorrect' | null} */
    let state = null;
    await expect
      .poll(async () => (state = await this.feedbackState()), { timeout, message: 'feedback "Correct"/"Incorrect"' })
      .not.toBeNull();
    return /** @type {'correct' | 'incorrect'} */ (state);
  }

  /** Wait until no feedback is shown (e.g. after Try Again, or after a slide change). */
  async waitForNoFeedback(timeout = 30_000) {
    await expect.poll(() => this.feedbackState(), { timeout, message: 'feedback to clear' }).toBeNull();
  }

  /**
   * Click a button that Storyline may list twice (a hidden copy) or only as an off-screen
   * accessible element: the visible copy if there is one, else the first.
   * @param {import('@playwright/test').Locator} button
   */
  async clickButton(button) {
    const visible = button.filter({ visible: true });
    await this.player.activate((await visible.count()) ? visible.first() : button.first());
  }

  /** Whether the current slide is a quiz question ("Question <n>"). */
  async isQuestion() {
    return /^Question \d+$/.test(await this.player.currentSlideTitle());
  }

  /**
   * The question text, e.g. "Basic speed law says ________.": the last paragraph before the first
   * option. Slides also contain paragraphs named after drawn shapes ("Rectangle 1", "Group 1"),
   * sometimes before the question, so position is used rather than "first paragraph".
   */
  async questionText() {
    await this.options.first().waitFor({ state: 'attached' });
    return this.#readQuestion();
  }

  /** The question currently shown, or '' when the slide shows no options (no waiting). */
  async #readQuestion() {
    const lines = (await this.main.ariaSnapshot().catch(() => '')).split('\n');
    if (!lines.some((line) => /^\s*- radio "/.test(line))) return '';
    const firstOption = lines.findIndex((line) => /^\s*- radio "/.test(line));
    const shapeName = /^(Rectangle|Group|Oval|Shape|Picture|Text Box|Scribble) ?\d*$/;
    const paragraphs = lines
      .slice(0, firstOption)
      .map((line) => /^\s*- paragraph: (.+)$/.exec(line)?.[1]?.replace(/^"(.*)"$/, '$1').trim())
      // Real text only: section 4's quiz has a placeholder paragraph "0000000000000000000".
      .filter((text) => text && text !== 'End of Section Quiz' && !shapeName.test(text) && /[a-z]{3}/i.test(text));
    return paragraphs.at(-1) ?? '';
  }

  /** @returns {Promise<{ letter: string, text: string }[]>} the lettered options in order */
  async optionList() {
    await this.options.first().waitFor({ state: 'attached' });
    // Accessible names, exactly as in the accessibility tree: lines like `- radio "A. …65 MPH"`.
    const snapshot = await this.main.ariaSnapshot();
    return [...snapshot.matchAll(/- radio "((\w)\..*)"/g)].map(([, text, letter]) => ({ letter, text }));
  }

  /**
   * Select the option with this letter and wait for the feedback.
   * @param {string} letter e.g. "B"
   * @returns {Promise<'correct' | 'incorrect'>}
   */
  async choose(letter) {
    // Feedback from the previous answer must be gone first, or it would be read as this answer's.
    await this.waitForNoFeedback();
    const option = this.main.getByRole('radio', { name: new RegExp(`^${letter}\\.`) });
    // A click right after the slide appears can be ignored (seen on section 4's Q3): retry it.
    const deadline = Date.now() + 60_000;
    for (;;) {
      await option.click({ force: true });
      const state = await this.waitForFeedback(5_000).catch(() => null);
      if (state) return state;
      if (Date.now() > deadline) throw new Error(`choose: no feedback after clicking option ${letter} for 1 min`);
    }
  }

  /** After a wrong answer: back to the same question, with the feedback gone. */
  async tryAgain() {
    await this.clickButton(this.tryAgainButton);
    await this.waitForNoFeedback();
    await this.options.first().waitFor({ state: 'attached', timeout: 30_000 });
  }

  /**
   * After a correct answer: Continue, then wait until the feedback is gone. Usually the slide
   * changes; some slides (e.g. "BAC Quiz 1") ask their next question on the same slide.
   */
  /**
   * @param {string} [answered] the question just answered. Pass it: it cannot be read here, since
   *   the feedback panel hides the options (and so the question) at this point.
   */
  async continueAfterCorrect(answered) {
    const from = await this.player.currentSlideTitle();
    await this.clickButton(this.continueButton);
    // The old slide's "Correct!" stays on screen until the next slide or question replaces it.
    await this.waitForNoFeedback(60_000);
    // Give a slide change a moment to show in the (visually hidden) label; not required.
    await this.player.frame
      .locator('#slide-label')
      .filter({ hasNotText: new RegExp(`^\\s*slide: ${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
      .waitFor({ state: 'attached', timeout: 5_000 })
      .catch(() => {});
    await this.player.waitForSlide();
    // The answered question's text can linger while the next one draws (sections 4 and 5: Q3 was
    // read with Q2's text), and there can be a moment with no options at all. Wait until a
    // different question is shown, or the slide is no longer a question slide (e.g. "End").
    // Picture scenarios repeat the same text: those simply wait out the 15 s.
    if (answered) {
      const moved = async () => {
        const question = await this.#readQuestion();
        if (question && question !== answered) return true;
        const title = await this.player.currentSlideTitle();
        return !question && title !== from && !/^Question \d+$/.test(title);
      };
      await expect
        .poll(moved, { timeout: 15_000, message: 'next question to replace the answered one' })
        .toBe(true)
        .catch(() => {});
    }
  }
}
