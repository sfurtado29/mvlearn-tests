// Practice slides of the v1 course package (staging; dev until the client's update of 2026-10):
// handlers by slide title, used by playSections in tests/helpers/courseJourney.js. Each ends
// after Continue on "Correct!". See docs/scorm-notes.md for how each slide works.
import { expect } from '@playwright/test';

/** @typedef {import('../../../pages/user/ScormPlayer.js').ScormPlayer} ScormPlayer */
/** @typedef {import('../../../pages/user/ScormQuiz.js').ScormQuiz} ScormQuiz */
/** @typedef {import('../../../pages/user/ScormPractice.js').ScormPractice} ScormPractice */

/**
 * @param {{
 *   player: ScormPlayer,
 *   quiz: ScormQuiz,
 *   practice: ScormPractice,
 *   main: import('@playwright/test').Locator,
 *   log: (...args: unknown[]) => void,
 *   answerQuestion: () => Promise<unknown>,
 *   answerPictureQuestion: () => Promise<unknown>,
 * }} context the answer functions answer the slide on screen (key / discovery, current section)
 * @returns {Record<string, () => Promise<unknown>>}
 */
export function practiceHandlers({ player, quiz, practice, main, log, answerQuestion, answerPictureQuestion }) {
  /**
   * Lane practice: tries the lanes in `order` (Try Again after each wrong one) and continues on
   * "Correct!"; then checks the correct lane was `expected`.
   * @param {string} slide @param {number[]} lanes @param {number[]} order @param {number} expected
   */
  const lanePractice = async (slide, lanes, order, expected) => {
    let correct;
    for (const lane of order) {
      await practice.dragRedCarToLane(lane, lanes);
      if ((await practice.submit()) === 'correct') {
        correct = lane;
        break;
      }
      log(`${slide}: lane ${lane} is wrong, Try Again`);
      await practice.tryAgain();
    }
    expect(correct, `${slide}: no lane was correct`).toBeTruthy();
    log(`${slide}: lane ${correct} is correct`);
    expect.soft(correct, `${slide}: correct lane`).toBe(expected);
    await quiz.continueAfterCorrect();
  };

  return {
    // Section 2 "Practice Choosing a Lane". Slide 1 tries the wrong lane first to cover Try Again.
    'Click & Drag 1': () => lanePractice('Click & Drag 1', [1, 3], [3, 1], 1), // pass the yellow car
    'Click & Drag 3': () => lanePractice('Click & Drag 3', [1, 2, 3], [3, 1, 2], 3), // exit the freeway

    // Section 3 topic slide (tiles Passing, Signs, Crosswalks, Sidewalks, Patience): click tiles
    // until CONTINUE is available, then continue. In the first run CONTINUE was there at once.
    'Right-of-Way': async () => {
      const continueButton = main.getByRole('button', { name: /^continue$/i }).filter({ visible: true });
      for (const tile of ['Passing', 'Signs', 'Crosswalks', 'Sidewalks', 'Patience']) {
        if (await continueButton.first().isVisible()) break;
        const label = main.getByText(tile, { exact: true }).filter({ visible: true }).first();
        if (!(await label.count())) continue;
        await practice.mouseClick(label);
        log(`Right-of-Way: clicked tile "${tile}"`);
        await continueButton.first().waitFor({ timeout: 5_000 }).catch(() => {});
      }
      const result = await player.advanceSlide();
      log(`Right-of-Way: ${result.action} "${result.from}" -> "${result.to}"`);
    },

    // Section 3 "Click to select who has the right-of-way" (you drive the yellow car): 3, the
    // pedestrian → "Correct! … pedestrians have the right-of-way …". A click, not a drag.
    // Its first scenario is titled like this; the following ones are "Question <n>" and reach
    // answerPictureQuestion through the quiz path. All use the key in quiz-answers.js.
    'Practice Right-of-Way': () => answerPictureQuestion(),

    // Section 4: "What is the predicted BAC level for …?" (values from the BAC table). This slide
    // and "BAC Quiz <n>" may ask several questions on the same slide: the radio branch in
    // playSections answers each one as it appears.
    'Practice Measuring BAC': () => answerQuestion(),

    // Section 6 "Practice What to Do During an Enforcement Stop": drag the three loose steps into
    // the empty slots (2-5 are pre-filled), then Submit. Order confirmed by the user 2026-10-13:
    // 1 right turn signal, 2 right shoulder, 3 out of traffic, 4 well-lit area, 5 phone/radio off,
    // 6 roll window down, 7 hands in clear view.
    'Practice What to Do': async () => {
      const anchors = { 2: 'Move your vehicle to the right shoulder.', 3: 'Pull your vehicle out of the path of traffic.' };
      const placements = { 'Turn on your right turn signal.': 1, 'Roll your window down.': 6, 'Place your hands in clear view.': 7 };
      log(`Practice What to Do: ${await practice.dragStepsToSlots(placements, anchors)}`);
      expect(await practice.submit(), 'steps in the confirmed order').toBe('correct');
      await quiz.continueAfterCorrect();
    },

    // Section 7 "Practice Identifying Regulatory Signs": drag each blue label below its sign.
    // The two "no turn" signs are only named …070_B / …070_D: B is the top one (U-turn) by layout;
    // if that is wrong, Try Again with the two swapped.
    'Practice Identifying Regulatory Signs': async () => {
      const fixed = { 'Come to a complete stop': 'DMV_M7_030_stop.png', 'Do not enter against traffic': 'DMV_M7_050_wrongWay.png' };
      const attempts = [
        { ...fixed, 'No U-Turn': 'DMV_M7_070_B.png', 'No Right turn': 'DMV_M7_070_D.png' },
        { ...fixed, 'No U-Turn': 'DMV_M7_070_D.png', 'No Right turn': 'DMV_M7_070_B.png' },
      ];
      for (const [index, placements] of attempts.entries()) {
        log(`Regulatory signs: ${await practice.dragLabelsBelowImages(placements)}`);
        const outcome = await practice.submit();
        log(`Regulatory signs: attempt ${index + 1} ${outcome}`);
        if (outcome === 'correct') {
          expect.soft(index, 'B = No U-Turn, D = No Right turn').toBe(0);
          return quiz.continueAfterCorrect();
        }
        await practice.tryAgain();
      }
      throw new Error('Regulatory signs: neither matching was accepted (see the positions logged)');
    },

    // Section 7 "Practice Identifying Warning Signs": six signs in a 2×3 grid, image names A-F in
    // no useful order, so labels are matched to grid positions (as seen 2026-10-13).
    'Practice Identifying Warning Signs': async () => {
      const grid = await practice.imageGrid(/^DMV_M7_110_[A-F]\.png$/);
      log(`Warning signs grid: ${JSON.stringify(grid)}`);
      expect(grid.map((row) => row.length), 'two rows of three signs').toEqual([3, 3]);
      const placements = {
        'Slippery when wet': grid[0][0],
        'Two way traffic': grid[0][1],
        'Stop ahead': grid[0][2],
        'Traffic signal ahead': grid[1][0],
        'Sharp turn': grid[1][1],
        Crossroad: grid[1][2],
      };
      log(`Warning signs: ${await practice.dragLabelsBelowImages(placements)}`);
      expect(await practice.submit(), 'warning signs matched by position').toBe('correct');
      await quiz.continueAfterCorrect();
    },
  };
}
