// Practice (non-quiz) interactions inside the Storyline player, verified on dev 2026-10-12.
// Feedback, Try Again and Continue work like the quiz, so ScormQuiz's helpers are reused.
import { ScormQuiz } from './ScormQuiz.js';

export class ScormPractice {
  /** @param {import('./ScormPlayer.js').ScormPlayer} player */
  constructor(player) {
    this.player = player;
    this.feedback = new ScormQuiz(player);
    this.main = player.frame.getByRole('main');
    this.submitButton = this.main.getByRole('button', { name: 'Submit', exact: true });
  }

  /**
   * "Click & Drag <n>" (section 2, "Practice Choosing a Lane"). The identical car images are, left
   * to right: the draggable red car, then one faded target car per lane on the slide (slide 1:
   * lanes 1 and 3; slide 3: lanes 1, 2 and 3). Storyline only reacts to real mouse movement, so
   * this drags with page.mouse in small steps.
   * @param {number} lane lane number to drop on
   * @param {number[]} lanes the lane numbers of the targets on this slide, left to right
   */
  async dragRedCarToLane(lane, lanes) {
    const cars = this.main.getByRole('img', { name: 'M2 Updated Art 12-4-20 car.png' });
    await this.submitButton.waitFor({ timeout: 60_000 });
    const boxes = [];
    for (const car of await cars.all()) boxes.push(await car.boundingBox());
    if (boxes.length !== lanes.length + 1 || boxes.some((box) => !box)) {
      throw new Error(`expected ${lanes.length + 1} car images (red car + lanes ${lanes}), found ${boxes.length}`);
    }
    const [redCar, ...targets] = boxes.sort((a, b) => a.x - b.x).map((b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 }));
    const target = targets[lanes.indexOf(lane)];
    if (!target) throw new Error(`lane ${lane} is not on this slide (lanes ${lanes})`);
    const mouse = this.player.page.mouse;
    await mouse.move(redCar.x, redCar.y);
    await mouse.down();
    await mouse.move(target.x, target.y, { steps: 25 });
    await mouse.up();
  }

  /** After a wrong answer: back to the same practice (the dragged item returns to its start). */
  async tryAgain() {
    await this.feedback.clickButton(this.feedback.tryAgainButton);
    await this.feedback.waitForNoFeedback();
    // The radios of picture questions are invisible, so "attached" rather than "visible".
    await this.submitButton.or(this.choices.first()).first().waitFor({ state: 'attached', timeout: 30_000 });
  }

  /**
   * Picture questions (section 3 "Practice Right-of-Way" series, slides "Practice Right-of-Way" and
   * "Question <n>"): the numbers of the badges on the slide, from images "circle<n>.png".
   * @returns {Promise<number[]>}
   */
  async pictureNumbers() {
    const names = await this.main.getByRole('img', { name: /^circle\d+\.png$/ }).evaluateAll((images) =>
      images.map((image) => image.getAttribute('alt') ?? image.getAttribute('aria-label') ?? ''),
    );
    const numbers = (names.length ? names : (await this.main.ariaSnapshot()).match(/img "circle\d+\.png"/g) ?? [])
      .map((name) => Number(/circle(\d+)\.png/.exec(name)?.[1]))
      .filter((n) => !Number.isNaN(n));
    return [...new Set(numbers)].sort((a, b) => a - b);
  }

  /**
   * Name of the scenario picture (e.g. "M3_140b-1.png"). The question text is the same on every
   * scenario, so this is what tells them apart in the answer key.
   */
  async scenarioImage() {
    return /img "(M\d+_\d+[a-z]*-\d+\.png)"/.exec(await this.main.ariaSnapshot())?.[1] ?? 'unknown scenario';
  }

  /**
   * Clickable items of a click-to-reveal slide ("Practice Right-of-Way", section 3): radios (all
   * named e.g. "Scribble 4") laid over numbered pictures. They appear after the narration; clicking
   * one shows its explanation, and "next" appears once every item has been clicked.
   */
  get choices() {
    return this.main.getByRole('radio');
  }

  /**
   * Click every item of a click-to-reveal slide, waiting for the slide to change after each.
   * Returns early with the feedback if an item turns out to be a right/wrong choice instead.
   * @param {(...args: unknown[]) => void} log
   * @returns {Promise<'revealed' | 'correct' | 'incorrect'>}
   */
  async revealAll(log) {
    await this.choices.first().waitFor({ state: 'attached', timeout: 120_000 });
    const count = await this.choices.count();
    for (let index = 0; index < count; index++) {
      const before = await this.player.frame.locator('#slide main').innerText();
      await this.choices.nth(index).click({ force: true });
      // The explanation appears in place; wait until the slide content changes.
      await this.player.frame
        .locator('#slide main')
        .evaluate(
          (main, previous) =>
            new Promise((resolve) => {
              const done = () => main.innerText !== previous;
              if (done()) return resolve(true);
              const observer = new MutationObserver(() => done() && (observer.disconnect(), resolve(true)));
              observer.observe(main, { subtree: true, childList: true, characterData: true, attributes: true });
              setTimeout(() => (observer.disconnect(), resolve(false)), 15_000);
            }),
          before,
        )
        .catch(() => false);
      // Question slides show "Correct"/"Incorrect" a moment after the click: give it time.
      const state = await this.feedback.waitForFeedback(5_000).catch(() => null);
      if (state) return state;
      log(`  item ${index + 1}/${count} clicked`);
    }
    return 'revealed';
  }

  /** Centre of each visible choice, in DOM order, to tell which picture a choice index is. */
  async choicePositions() {
    const positions = [];
    for (const choice of await this.choices.all()) {
      const box = await choice.boundingBox();
      positions.push(box ? { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) } : null);
    }
    return positions;
  }

  /**
   * Select the choice at `index` (DOM order) and wait for the feedback.
   * @param {number} index
   * @returns {Promise<'correct' | 'incorrect'>}
   */
  async choose(index) {
    await this.feedback.waitForNoFeedback();
    const item = this.choices.nth(index);
    // The choice only reacts once the narration has finished: retry the click until feedback shows.
    const deadline = Date.now() + 180_000;
    for (;;) {
      await item.click({ force: true });
      const state = await this.feedback.waitForFeedback(5_000).catch(() => null);
      if (state) return state;
      if (Date.now() > deadline) throw new Error(`choose: no feedback after clicking choice ${index} for 3 min`);
    }
  }

  /**
   * Real mouse click on the centre of an element of the slide (Storyline hotspots ignore synthetic
   * clicks on their invisible inputs, but react to the mouse like a learner's click).
   * @param {import('@playwright/test').Locator} target
   */
  async mouseClick(target) {
    const box = await target.boundingBox();
    if (!box) throw new Error('mouseClick: element has no box on screen');
    await this.player.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  /**
   * Click-to-select practice: click the picture (e.g. "circle3.png", the "3" badge) until feedback
   * appears; the hotspot only becomes active once the narration ends, so it is retried.
   * @param {string} imageName accessible name of the image to click
   * @returns {Promise<'correct' | 'incorrect'>}
   */
  async selectPicture(imageName) {
    const picture = this.main.getByRole('img', { name: imageName }).first();
    await picture.waitFor({ timeout: 60_000 });
    await this.feedback.waitForNoFeedback();
    const deadline = Date.now() + 180_000;
    for (;;) {
      await this.mouseClick(picture);
      const state = await this.feedback.waitForFeedback(5_000).catch(() => null);
      if (state) return state;
      if (Date.now() > deadline) throw new Error(`selectPicture: no feedback after clicking "${imageName}" for 3 min`);
    }
  }

  /**
   * Ordering drag-and-drop ("Practice What to Do", section 6): drag step labels into numbered slots.
   * Slots are evenly spaced; their positions come from two slots that are already filled
   * (`anchors`: slot number → the text already in it). Real mouse movement, like the lane slides.
   * @param {Record<string, number>} placements step text → slot number
   * @param {Record<number, string>} anchors two pre-filled slots, e.g. { 2: 'Move your…', 3: 'Pull your…' }
   * @returns {Promise<string>} the positions used, for the log
   */
  async dragStepsToSlots(placements, anchors) {
    await this.submitButton.waitFor({ state: 'attached', timeout: 60_000 });
    const centre = async (text) => {
      const box = await this.main.getByText(text, { exact: true }).first().boundingBox();
      if (!box) throw new Error(`dragStepsToSlots: "${text}" has no box on screen`);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };
    const [[slotA, textA], [slotB, textB]] = Object.entries(anchors).map(([slot, text]) => [Number(slot), text]);
    const a = await centre(textA);
    const b = await centre(textB);
    const step = (b.y - a.y) / (slotB - slotA);
    const slotCentre = (slot) => ({ x: a.x, y: a.y + (slot - slotA) * step });
    const used = [];
    const mouse = this.player.page.mouse;
    for (const [text, slot] of Object.entries(placements)) {
      const from = await centre(text);
      const to = slotCentre(slot);
      used.push(`"${text}" (${Math.round(from.x)},${Math.round(from.y)}) → slot ${slot} (${Math.round(to.x)},${Math.round(to.y)})`);
      await mouse.move(from.x, from.y);
      await mouse.down();
      await mouse.move(to.x, to.y, { steps: 25 });
      await mouse.up();
    }
    return used.join('; ');
  }

  /**
   * Matching drag-and-drop ("Practice Identifying Regulatory Signs", section 7): drag each label
   * into the empty box just below its sign picture (about 30 px under the picture's bottom edge).
   * @param {Record<string, string>} placements label text → sign image name
   * @returns {Promise<string>} the positions used, for the log
   */
  async dragLabelsBelowImages(placements) {
    await this.submitButton.waitFor({ state: 'attached', timeout: 60_000 });
    const used = [];
    const mouse = this.player.page.mouse;
    for (const [text, image] of Object.entries(placements)) {
      const label = await this.main.getByText(text, { exact: true }).first().boundingBox();
      const sign = await this.main.getByRole('img', { name: image }).first().boundingBox();
      if (!label || !sign) throw new Error(`dragLabelsBelowImages: no box for "${text}" or "${image}"`);
      const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 };
      const to = { x: sign.x + sign.width / 2, y: sign.y + sign.height + 30 };
      used.push(`"${text}" → below ${image} (${Math.round(to.x)},${Math.round(to.y)})`);
      await mouse.move(from.x, from.y);
      await mouse.down();
      await mouse.move(to.x, to.y, { steps: 25 });
      await mouse.up();
    }
    return used.join('; ');
  }

  /**
   * Image names arranged as on screen: rows top to bottom, each row left to right. For slides
   * whose image names say nothing about the picture (e.g. warning signs "DMV_M7_110_A…F.png").
   * @param {RegExp} namePattern which images (by accessible name)
   * @returns {Promise<string[][]>}
   */
  async imageGrid(namePattern) {
    const images = this.main.getByRole('img', { name: namePattern });
    const found = [];
    for (const image of await images.all()) {
      const box = await image.boundingBox();
      const name = /img "([^"]+)"/.exec(await image.ariaSnapshot())?.[1];
      if (box && name) found.push({ name, x: box.x + box.width / 2, y: box.y + box.height / 2 });
    }
    found.sort((a, b) => a.y - b.y);
    /** @type {{ name: string, x: number, y: number }[][]} */
    const rows = [];
    for (const item of found) {
      const row = rows.at(-1);
      if (row && Math.abs(row[0].y - item.y) < 40) row.push(item);
      else rows.push([item]);
    }
    return rows.map((row) => row.sort((a, b) => a.x - b.x).map((item) => item.name));
  }

  /** @returns {Promise<'correct' | 'incorrect'>} */
  async submit() {
    await this.submitButton.click({ force: true });
    return this.feedback.waitForFeedback();
  }
}
