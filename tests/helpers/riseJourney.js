// Shared steps of the v2 (Rise) course journey: the E2E test (tests/user/e2e/course-v2.spec.js)
// and the load-test probe (tests/user/load/probe-v2.spec.js). See docs/scorm-notes-v2.md.
//
// Timing: like tests/helpers/courseJourney.js, an optional `timer` (the probe's ProbeRecorder)
// records each lesson page as step "page" and marks "section_complete" after each lesson's quiz.
import { expect } from '@playwright/test';
import { LESSONS, AUDIO_LESSONS, SORTING, answerFor } from '../data/course.js';
import { getApiVersion, getValue } from './scormApi.js';

/** @typedef {import('../pages/user/RisePlayer.js').RisePlayer} RisePlayer */
/**
 * @typedef {{
 *   time: <T>(step: string, fn: () => Promise<T>, details?: object) => Promise<T>,
 *   mark: (event: string, details?: object) => void,
 * }} Timer
 */

/** @type {Timer} */
export const NO_TIMER = { time: (_step, fn) => fn(), mark: () => {} };

// A lesson takes one CONTINUE per block group plus its end button; generous cap per lesson.
const MAX_STEPS_PER_LESSON = 30;
/** The last page: CONTINUE, then the course is ended with its EXIT button (RisePlayer.finishCourse). */
export const FINAL_LESSON = 'Conclusion';
const isQuiz = (title) => /^End of Lesson Quiz/.test(title);

/**
 * The course's SCORM status, whichever API the package uses: 1.2 cmi.core.lesson_status or 2004
 * cmi.completion_status / cmi.success_status, with the API's last error. The v2 package is
 * SCORM 2004 (v1 was 1.2), so cmi.core.lesson_status reads "".
 * @param {import('@playwright/test').Page} page
 */
export async function scormStatus(page) {
  const version = await getApiVersion(page);
  const read = (key) => getValue(page, key).catch((error) => `(error: ${error.message})`);
  const lastError = () =>
    page.evaluate(() =>
      window.API ? String(window.API.LMSGetLastError()) : String(window.API_1484_11?.GetLastError() ?? ''),
    );
  if (version === '2004') {
    const completion = await read('cmi.completion_status');
    return { version, status: completion, success: await read('cmi.success_status'), lastError: await lastError() };
  }
  return { version, status: await read('cmi.core.lesson_status'), lastError: await lastError() };
}

/**
 * Plays lesson pages from the current one until `until` is complete (the next page has opened),
 * or until FINAL_LESSON is reached (it has no next page; see RisePlayer.finishCourse).
 * Each page: scroll to the end, flip cards, click markers, step through process blocks (with
 * their audio on AUDIO_LESSONS), sort cards, answer questions (key first, else option by option),
 * press CONTINUE; repeat until the next page opens.
 * Where the learner is comes from "Lesson <n> of 80" in the header, as an index into LESSONS
 * (titles repeat, e.g. "Turning" in Lessons 02 and 03), checked against the sidebar title.
 * @param {{
 *   player: RisePlayer,
 *   until: string,
 *   log: (...args: unknown[]) => void,
 *   timer?: Timer,
 * }} options
 * @returns {Promise<{ lesson: string, index: number }>} the page the learner is on afterwards
 */
export async function playLessons({ player, until, log, timer = NO_TIMER }) {
  const position = async () => {
    const header = await player.lessonPosition();
    expect(header, 'lesson header "Lesson <n> of <total>"').toBeTruthy();
    return /** @type {{ number: number }} */ (header).number - 1;
  };
  const untilIndex = LESSONS.indexOf(until);
  expect(untilIndex, `"${until}" is not in tests/data/courses/v2/outline.js`).toBeGreaterThanOrEqual(0);
  // Scenes with the same prompt (the sign practices) take their answers in order. A run that
  // resumes in the middle of such a page would be off by the scenes already done: the key's
  // answer is then refused and found by trying, with a soft failure.
  const asked = new Map();
  const keyFor = (question) => {
    const occurrence = asked.get(question) ?? 0;
    asked.set(question, occurrence + 1);
    return answerFor(question, occurrence);
  };

  /** One page, until the next page opens. @param {string} lesson @returns {Promise<string>} the last button's label */
  const playPage = async (lesson) => {
    for (let step = 1; ; step++) {
      expect(step, `"${lesson}" not finished within ${MAX_STEPS_PER_LESSON} steps`).toBeLessThanOrEqual(MAX_STEPS_PER_LESSON);
      const result = await player.advance({ answerFor: keyFor, sorting: SORTING, playAudio: AUDIO_LESSONS.includes(lesson) });
      if (result.audio) log(`"${lesson}": played ${result.audio} audio clip(s)`);
      if (result.flipped) log(`"${lesson}": flipped ${result.flipped} card(s)`);
      if (result.markers) log(`"${lesson}": clicked ${result.markers} marker(s)`);
      if (result.steps) log(`"${lesson}": pressed START / next ${result.steps} time(s)`);
      for (const { question, answer, attempts, expected } of result.answers) {
        log(`"${lesson}" Q: ${question}\n    A: ${answer} (attempt ${attempts}${expected ? '' : ', not in the key'})`);
        if (expected) expect.soft(attempts, `key answer for "${question}" was accepted`).toBe(1);
      }
      for (const { card, category, attempts, expected } of result.sorted) {
        log(`"${lesson}" card "${card}" -> ${category} (attempt ${attempts}${expected ? '' : ', not in the key'})`);
        if (expected) expect.soft(attempts, `key category for card "${card}" was accepted`).toBe(1);
      }
      if (result.action === 'next-lesson') return result.label;
      log(`"${lesson}" step ${step}: ${result.label}`);
    }
  };

  let index = await position();
  let lesson = await player.currentLesson();
  expect(index, `starting lesson "${lesson}" (#${index + 1}) is not in the outline yet`).toBeLessThan(LESSONS.length);
  expect(lesson, `lesson #${index + 1} in the outline`).toBe(LESSONS[index]);
  if (index > untilIndex) {
    log(`already past "${until}", nothing to play`);
    return { lesson, index };
  }
  while (lesson !== FINAL_LESSON) {
    const label = await timer.time('page', () => playPage(lesson), { lesson, number: index + 1 });
    if (isQuiz(lesson)) {
      const number = LESSONS.slice(0, index + 1).filter(isQuiz).length;
      timer.mark('section_complete', { section: lesson, number });
    }
    const next = await player.currentLesson();
    log(`"${lesson}" done (${label}) -> "${next}" | ${await player.progress()}% complete`);
    const nextIndex = await position();
    expect(nextIndex, `lesson number after "${lesson}"`).toBe(index + 1);
    expect(next, `the lesson after "${lesson}"`).toBe(LESSONS[nextIndex]);
    const done = index === untilIndex;
    index = nextIndex;
    lesson = /** @type {string} */ (next);
    if (done) break;
  }
  return { lesson, index };
}
