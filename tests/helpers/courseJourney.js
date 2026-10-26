// Plays the Storyline course: quiz answering, every practice slide, and the section loop.
// Shared by the E2E course test (tests/user/e2e/course-completion.spec.js) and the load-test
// probe (tests/user/load/probe.spec.js). See docs/scorm-notes.md for how each slide works.
//
// Optional `timer` hook (the probe passes one; E2E tests do not, so nothing changes for them):
//   timer.time(step, fn, details) runs fn and records how long it took; `details` is an object or
//   a function of fn's result. timer.mark(event, details) records an instant event.
import { expect, test } from '@playwright/test';
import { MyCoursesPage } from '../pages/user/MyCoursesPage.js';
import { CoursePage } from '../pages/user/CoursePage.js';
import { ScormPractice } from '../pages/user/ScormPractice.js';
import { COURSE } from '../data/site.js';
import { SECTIONS, ANSWERS_FILE, answerFor, saveDiscovered, practiceHandlers } from '../data/course.js';

/** @typedef {import('../pages/user/ScormPlayer.js').ScormPlayer} ScormPlayer */
/** @typedef {import('../pages/user/ScormQuiz.js').ScormQuiz} ScormQuiz */
/**
 * @typedef {{
 *   time: <T>(step: string, fn: () => Promise<T>, details?: object | ((result: T) => object)) => Promise<T>,
 *   mark: (event: string, details?: object) => void,
 * }} Timer
 */

/** @type {Timer} */
export const NO_TIMER = { time: (_step, fn) => fn(), mark: () => {} };

/**
 * Answers the question on screen correctly and continues: from the answer key, or with
 * QUIZ_DISCOVER=1 by trying A, B, C… with "Try Again" after each wrong answer (never "Continue",
 * which sends the learner back to review slides). Discovered answers are saved to
 * tests/data/courses/<v>/quiz-answers.discovered.json.
 * @param {ScormPlayer} player
 * @param {ScormQuiz} quiz
 * @param {string} section
 * @param {(...args: unknown[]) => void} log
 * @param {Timer} [timer]
 */
export async function answerQuestion(player, quiz, section, log, timer = NO_TIMER) {
  const slide = await player.currentSlideTitle();
  const question = await quiz.questionText();
  const options = await quiz.optionList();
  // No lettered options: a picture question (click a numbered badge), e.g. "Practice Right-of-Way".
  if (!options.length) return answerPictureQuestion(player, quiz, section, log, timer);
  const known = answerFor(section, question);
  if (known) {
    const result = await timer.time('quiz_answer', () => quiz.choose(known), { section, slide, question, answer: known });
    expect(result, `answer key says ${known} for "${question}"`).toBe('correct');
    log(`${slide}: ${known} (from key) — ${question}`);
  } else {
    expect(
      process.env.QUIZ_DISCOVER === '1',
      `Not in the answer key (section "${section}"):\n  ${question}\n  ${options.map((o) => o.text).join('\n  ')}\n` +
        `Add it to ${ANSWERS_FILE}, or rerun with QUIZ_DISCOVER=1 on the build account.`,
    ).toBe(true);
    let found;
    for (const { letter } of options) {
      if ((await quiz.choose(letter)) === 'correct') {
        found = letter;
        break;
      }
      log(`${slide}: ${letter} is wrong, Try Again`);
      await quiz.tryAgain();
    }
    expect(found, `no option was correct for "${question}"`).toBeTruthy();
    saveDiscovered(section, question, String(found));
    log(`${slide}: ${found} (DISCOVERED, saved) — ${question}`);
  }
  await quiz.continueAfterCorrect(question);
}

/**
 * Picture question: click the numbered badge ("circle<n>.png") with a real mouse click. The question
 * text repeats across scenarios, so the key is "[<scenario picture>]". Same key and
 * discovery rules as answerQuestion; Try Again after each wrong badge.
 * @param {ScormPlayer} player
 * @param {ScormQuiz} quiz
 * @param {string} section
 * @param {(...args: unknown[]) => void} log
 * @param {Timer} [timer]
 */
export async function answerPictureQuestion(player, quiz, section, log, timer = NO_TIMER) {
  const practice = new ScormPractice(player);
  const slide = await player.currentSlideTitle();
  await practice.choices.first().waitFor({ state: 'attached', timeout: 120_000 });
  const badges = practice.main.getByRole('img', { name: /^circle\d+\.png$/ });
  // Slides without numbered badges (e.g. "Practice Measuring BAC": click a value in a table)
  // are answered by choice position, keyed on their question text.
  if (!(await badges.count())) return answerChoiceQuestion(player, quiz, section, log, timer);
  // The badges and scenario picture draw a moment after the slide starts: read the key after them.
  await badges.first().waitFor({ timeout: 60_000 });
  // The question text is the same on every scenario (and may not be drawn yet): key on the picture.
  const key = `[${await practice.scenarioImage()}]`;
  const numbers = await practice.pictureNumbers();
  const known = answerFor(section, key);
  if (known) {
    const result = await timer.time('quiz_answer', () => practice.selectPicture(`circle${known}.png`), {
      section,
      slide,
      question: key,
      answer: known,
    });
    expect(result, `answer key says ${known} for "${key}"`).toBe('correct');
    log(`${slide}: ${known} (from key) — ${key}`);
  } else {
    expect(
      process.env.QUIZ_DISCOVER === '1',
      `Not in the answer key (section "${section}"): ${key}\n  badges: ${numbers.join(', ')}\n` +
        `Add it to ${ANSWERS_FILE}, or rerun with QUIZ_DISCOVER=1 on the build account.`,
    ).toBe(true);
    expect(numbers.length, `no numbered badges found for "${key}"`).toBeGreaterThan(0);
    let found;
    for (const number of numbers) {
      if ((await practice.selectPicture(`circle${number}.png`)) === 'correct') {
        found = number;
        break;
      }
      log(`${slide}: ${number} is wrong, Try Again`);
      await practice.tryAgain();
    }
    expect(found, `no badge was correct for "${key}"`).toBeTruthy();
    saveDiscovered(section, key, String(found));
    log(`${slide}: ${found} (DISCOVERED, saved) — ${key}`);
  }
  await quiz.continueAfterCorrect();
}

/**
 * Choice question without letters or badges (e.g. "Practice Measuring BAC"): the clickable items
 * (radios) in page order. Key: "<question> #" → choice index (0-based, page order). Same key and
 * discovery rules as answerQuestion; Try Again after each wrong choice.
 * @param {ScormPlayer} player
 * @param {ScormQuiz} quiz
 * @param {string} section
 * @param {(...args: unknown[]) => void} log
 * @param {Timer} [timer]
 */
export async function answerChoiceQuestion(player, quiz, section, log, timer = NO_TIMER) {
  const practice = new ScormPractice(player);
  const slide = await player.currentSlideTitle();
  // The question may be drawn after the choices: wait until it is more than the slide heading.
  await expect
    .poll(() => quiz.questionText(), { message: `question text on "${slide}"`, timeout: 60_000 })
    .not.toMatch(new RegExp(`^(${slide.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})?$`));
  const question = await quiz.questionText();
  const key = `${question} #`;
  const count = await practice.choices.count();
  // Stored by position ("<question> #" → index) or as a letter for the question (A = 0); the key's
  // prefix matching finds either through `key`.
  const stored = answerFor(section, key);
  const known = stored === undefined ? undefined : /^[A-H]$/.test(stored) ? String('ABCDEFGH'.indexOf(stored)) : stored;
  if (known !== undefined) {
    const result = await timer.time('quiz_answer', () => practice.choose(Number(known)), {
      section,
      slide,
      question,
      answer: `choice ${known}`,
    });
    expect(result, `answer key says choice ${known} for "${key}"`).toBe('correct');
    log(`${slide}: choice ${known} (from key) — ${key}`);
  } else {
    expect(
      process.env.QUIZ_DISCOVER === '1',
      `Not in the answer key (section "${section}"): ${key}\n  ${count} choices\n` +
        `Add it to ${ANSWERS_FILE}, or rerun with QUIZ_DISCOVER=1 on the build account.`,
    ).toBe(true);
    let found;
    for (let index = 0; index < count; index++) {
      if ((await practice.choose(index)) === 'correct') {
        found = index;
        break;
      }
      log(`${slide}: choice ${index} is wrong, Try Again`);
      await practice.tryAgain();
    }
    expect(found, `no choice was correct for "${key}"`).not.toBeUndefined();
    saveDiscovered(section, key, String(found));
    log(`${slide}: choice ${found} (DISCOVERED, saved) — ${key}`);
  }
  await quiz.continueAfterCorrect(question);
}

/**
 * Progress shown to the learner, from My courses and the course page (ends on the course page).
 * @param {import('@playwright/test').Page} page
 */
export async function readProgress(page) {
  const myCourses = new MyCoursesPage(page);
  // By URL: the course page has a custom layout without the My courses tab.
  await myCourses.goto();
  const myCoursesLabel = (await myCourses.progressLabel.first().textContent())?.replace(/\s+/g, ' ').trim();
  await myCourses.courseLink(COURSE.name).first().click();
  await expect(page).toHaveURL(new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
  const coursePage = await new CoursePage(page).languageProgress('English').getAttribute('aria-label');
  return { myCourses: myCoursesLabel, coursePage };
}

/** @param {string | null | undefined} label e.g. "35% complete" */
export const percent = (label) => Number(/(\d+)%/.exec(label ?? '')?.[1] ?? NaN);

/**
 * The section the learner is in: a section's menu item only shows "visited" once the section is
 * complete (on resume the menu may even show the current section as "locked"), so the current one
 * is the first not visited. Opens the menu.
 * @param {ScormPlayer} player
 * @returns {Promise<string | undefined>} undefined when every section is visited
 */
export async function currentSection(player) {
  await player.openMenu();
  for (const name of SECTIONS) {
    if (!(await player.isVisited(name))) return name;
  }
  return undefined;
}

/**
 * Plays the course from the current slide until section `until` (1-7) is complete: quizzes from
 * the key (or discovery), practice slides through the handlers below. A slide with a Submit
 * button or choices that has no handler stops the run, with its structure attached.
 * @param {{
 *   player: ScormPlayer,
 *   quiz: ScormQuiz,
 *   practice: ScormPractice,
 *   section: string | undefined,
 *   until: number,
 *   log: (...args: unknown[]) => void,
 *   timer?: Timer,
 * }} options
 */
export async function playSections({ player, quiz, practice, section: startSection, until, log, timer = NO_TIMER }) {
  const main = player.frame.getByRole('main');
  const sectionComplete = main.getByText(/The lesson on .+ is complete/).filter({ visible: true });
  let section = startSection;

  /**
   * Click-to-reveal slide: click every item (each shows its explanation), then move on. Radios are
   * still on the slide afterwards, so this advance must not stop at radios. If an item turns out to
   * be a right/wrong choice, it is answered as a question (key / discovery).
   * @param {string} slide
   */
  const revealPractice = async (slide) => {
    const outcome = await practice.revealAll(log);
    log(`${slide}: ${outcome}`);
    if (outcome === 'correct') return quiz.continueAfterCorrect();
    if (outcome === 'incorrect') {
      // It is a question after all: answer it with the key / discovery.
      await practice.tryAgain();
      return answerQuestion(player, quiz, String(section), log, timer);
    }
    const result = await player.advanceSlide({ stopAtButton: '^(submit|begin quiz)$' });
    log(`${slide}: ${result.action} "${result.from}" -> "${result.to}"`);
  };

  // Practice slides with a Submit button or choices, by slide title: tests/data/courses/<v>/practice.js.
  const PRACTICE = practiceHandlers({
    player,
    quiz,
    practice,
    main,
    log,
    answerQuestion: () => answerQuestion(player, quiz, String(section), log, timer),
    answerPictureQuestion: () => answerPictureQuestion(player, quiz, String(section), log, timer),
  });
  const handled = new Set();
  const runPractice = (slide, handler) => timer.time('practice', handler, { section, slide });

  const done = new Set();
  for (let step = 1; ; step++) {
    expect(step, 'more than 400 steps: the course seems to loop').toBeLessThanOrEqual(400);
    if (await quiz.isQuestion()) {
      await answerQuestion(player, quiz, String(section), log, timer);
      continue;
    }
    // "End" renders its text after the slide label changes; give it a moment before deciding.
    if ((await player.currentSlideTitle()) === 'End') {
      await sectionComplete.first().waitFor({ timeout: 15_000 }).catch(() => {});
    }
    if (await sectionComplete.count()) {
      const name = /The lesson on (.+?) is complete/.exec((await sectionComplete.first().textContent()) ?? '')?.[1] ?? '';
      if (!done.has(name)) {
        done.add(name);
        // The "complete" sentence spells some names differently ("Right of Way" vs "Right-of-Way").
        const plain = (text) => text.toLowerCase().replace(/&/g, 'and').replace(/[^a-z]+/g, ' ').trim();
        const index = SECTIONS.findIndex((known) => plain(known) === plain(name));
        log(`SECTION COMPLETE: ${name} (${index + 1}/${SECTIONS.length})`);
        expect(index, `unknown section name "${name}"`).toBeGreaterThanOrEqual(0);
        timer.mark('section_complete', { section: SECTIONS[index], number: index + 1 });
        if (index + 1 >= until) break;
        section = SECTIONS[index + 1];
      }
    }
    // Known interactive slides are handled by name, once, before any attempt to advance.
    const title = await player.currentSlideTitle();
    if (PRACTICE[title] && !handled.has(title)) {
      handled.add(title);
      await runPractice(title, PRACTICE[title]);
      continue;
    }
    const result = await timer.time(
      'slide',
      () => player.advanceSlide({ stopAtButton: '^(submit|begin quiz)$', stopAtRadio: true }),
      (r) => ({ section, from: r.from, to: r.to, action: r.action }),
    );
    log(`step ${step}: ${result.action} "${result.from}" -> "${result.to}" (menu: ${await player.selectedMenuTitle()})`);
    if (result.action !== 'stopped') continue;
    // "BEGIN QUIZ" may only exist as an off-screen accessible copy (like the BAC slides' text):
    // check that it is there, not that it is visible. It can also appear in the accessibility
    // tree a moment after the stop (section 3, 2026-10-13), so give it up to 10 s.
    const beginQuiz = await player.beginQuizButton
      .first()
      .waitFor({ state: 'attached', timeout: (await practice.choices.count()) ? 2_000 : 10_000 })
      .then(() => true, () => false);
    if (beginQuiz) {
      await timer.time(
        'begin_quiz',
        async () => {
          await quiz.clickButton(player.beginQuizButton);
          await quiz.options.first().waitFor({ state: 'attached', timeout: 60_000 });
        },
        { section },
      );
      log(`BEGIN QUIZ (${section})`);
      continue;
    }
    let handler = PRACTICE[result.from];
    if (!handler && (await practice.choices.count())) {
      // Radios with A/B/C options or numbered badges are a question (answered with the key, once
      // per question, even when a slide asks several); other radios are click-to-reveal items.
      const lettered = (await quiz.optionList()).length > 0;
      const badges = await main.getByRole('img', { name: /^circle\d+\.png$/ }).count();
      handler =
        lettered || badges
          ? () => answerQuestion(player, quiz, String(section), log, timer)
          : () => revealPractice(result.from);
    }
    if (!handler) {
      await test.info().attach(`unknown interactive slide "${result.from}"`, {
        body: await main.ariaSnapshot(),
        contentType: 'text/plain',
      });
      throw new Error(
        `Unknown interactive slide "${result.from}" in "${section}": add a handler to PRACTICE (structure attached).`,
      );
    }
    await runPractice(result.from, handler);
    log(`${result.from}: practice done`);
  }
}
