// End-to-end journey through the v2 course package (Articulate Rise, dev from 2026-10). See
// docs/scorm-notes-v2.md. The v1 (Storyline) journey is in course-completion.spec.js.
//
// Runs on the SCORM test account (SCORM_USERNAME, else the main APP account) and resumes wherever
// that account stopped. Rise keeps completed lessons; there is no known way to reset them yet.
//
// Tagged @scorm-full only; run with `npm run test:scorm-full -- course-v2`.
import { test, expect } from '../../fixtures.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { Header } from '../../pages/common/Header.js';
import { MyCoursesPage } from '../../pages/user/MyCoursesPage.js';
import { RisePlayer } from '../../pages/user/RisePlayer.js';
import { COURSE } from '../../data/site.js';
import { COURSE_VERSION, LESSONS, AUDIO_LESSONS, SORTING, answerFor } from '../../data/course.js';
import { submitLogin } from '../../helpers/login.js';
import { getScormAccount } from '../../helpers/accounts.js';
import { getApiVersion, getValue } from '../../helpers/scormApi.js';

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000 });

// A lesson takes one CONTINUE per block group plus its end button; generous cap per lesson.
const MAX_STEPS_PER_LESSON = 30;
// The last page: CONTINUE, then the course is ended with its EXIT button (RisePlayer.finishCourse).
const FINAL_LESSON = 'Conclusion';

/**
 * The course's SCORM status, whichever API the package uses: 1.2 cmi.core.lesson_status or 2004
 * cmi.completion_status / cmi.success_status, with the API's last error. The v2 package is
 * SCORM 2004 (v1 was 1.2), so cmi.core.lesson_status reads "".
 * @param {import('@playwright/test').Page} page
 */
async function scormStatus(page) {
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

test.describe('Course journey v2 (E2E)', { tag: '@scorm-full' }, () => {
  test.skip(COURSE_VERSION !== 'v2', `the site runs course ${COURSE_VERSION}, not v2`);
  test.describe.configure({ timeout: 60 * 60_000 });

  // E2E_UNTIL_LESSON: the last lesson to complete (a LESSONS title; the first one if it repeats),
  // default the last one known.
  // Each lesson: scroll to the end, flip any flip cards, answer any questions (key first, else
  // option by option), press CONTINUE; repeat until the next lesson opens. Audio is never played
  // (not required). Stops with the visible buttons listed when no CONTINUE shows up.
  test('V2-E2E1 lessons by scroll + CONTINUE until E2E_UNTIL_LESSON → logout', async ({ page }) => {
    const account = getScormAccount();
    const until = process.env.E2E_UNTIL_LESSON?.trim() || LESSONS.at(-1);
    expect(LESSONS, 'E2E_UNTIL_LESSON must be a title from tests/data/courses/v2/outline.js').toContain(until);
    const t0 = Date.now();
    const log = (...args) => console.log(`[V2-E2E1 ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...args);
    const header = new Header(page);
    const player = new RisePlayer(page);

    await test.step(`log in as ${account.username}`, async () => {
      await new LoginPage(page).goto();
      await submitLogin(page, account);
      // Dashboard, or My courses for an account whose home page is set to it (sxts_user2 on dev, 2026-10-26).
      await expect(page).toHaveURL(/\/my\/(courses\.php)?$/);
    });

    await test.step('open the course from My courses', async () => {
      const myCourses = new MyCoursesPage(page);
      await myCourses.goto();
      await myCourses.courseLink(COURSE.name).first().click();
      await expect(page).toHaveURL(new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
    });

    // A finished course has no language cards, only "The language course is completed. Please go
    // through these completed courses link" (/theme/mvlearn/completed.php; sxts_user3 after
    // reaching Conclusion, dev 2026-10-27).
    const completedNote = page.getByText(/The language course is completed/);
    await expect(completedNote.or(player.launchLink).first(), 'launch link or "course is completed"').toBeVisible({
      timeout: 30_000,
    });
    if (await completedNote.isVisible()) {
      await test.step('course already completed: check the progress, log out', async () => {
        log('course page:', (await completedNote.innerText()).trim());
        await expect(page.getByRole('link', { name: 'link', exact: true })).toHaveAttribute(
          'href',
          new RegExp(`/theme/mvlearn/completed\\.php\\?id=${COURSE.id}$`),
        );
        // Only My courses: readProgress() also wants the English card's progress bar, which a
        // completed course page does not have.
        const myCourses = new MyCoursesPage(page);
        await myCourses.goto();
        const label = (await myCourses.progressLabel.first().textContent())?.replace(/\s+/g, ' ').trim();
        log('My courses progress:', label);
        expect.soft(String(label), 'My courses for a completed course').toMatch(/100% complete/);
        await header.logout();
        await expect(page).toHaveURL(/\/login\/index\.php/);
      });
      test.info().annotations.push({ type: 'note', description: 'Course already completed: nothing to play.' });
      return;
    }

    await test.step('launch English, leave the cover page if shown', async () => {
      await player.launch();
      log('cover page button pressed:', await player.start());
      log('starting at lesson:', await player.currentLesson(), `| ${await player.progress()}% complete`);
    });

    await test.step(`play lessons until "${until}" is complete`, async () => {
      // Where the learner is: "Lesson <n> of 80" in the header, as an index into LESSONS (titles
      // repeat, e.g. "Turning" in Lessons 02 and 03), checked against the sidebar title.
      const position = async () => {
        const header = await player.lessonPosition();
        expect(header, 'lesson header "Lesson <n> of <total>"').toBeTruthy();
        return /** @type {{ number: number }} */ (header).number - 1;
      };
      const untilIndex = LESSONS.indexOf(until);
      // Scenes with the same prompt (the sign practices) take their answers in order. A run that
      // resumes in the middle of such a page would be off by the scenes already done: the key's
      // answer is then refused and found by trying, with a soft failure.
      const asked = new Map();
      const keyFor = (question) => {
        const occurrence = asked.get(question) ?? 0;
        asked.set(question, occurrence + 1);
        return answerFor(question, occurrence);
      };
      try {
        let index = await position();
        let lesson = await player.currentLesson();
        expect(index, `starting lesson "${lesson}" (#${index + 1}) is not in the outline yet`).toBeLessThan(LESSONS.length);
        expect(lesson, `lesson #${index + 1} in the outline`).toBe(LESSONS[index]);
        if (index > untilIndex) {
          log(`already past "${until}", nothing to play`);
          return;
        }
        for (let step = 1; ; step++) {
          if (lesson === FINAL_LESSON) break; // finished in the next step
          expect(step, `"${lesson}" not finished within ${MAX_STEPS_PER_LESSON} steps`).toBeLessThanOrEqual(
            MAX_STEPS_PER_LESSON,
          );
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
          if (result.action === 'continue') {
            log(`"${lesson}" step ${step}: ${result.label}`);
            continue;
          }
          const next = await player.currentLesson();
          log(`"${lesson}" done (${result.label}) -> "${next}" | ${await player.progress()}% complete`);
          if (index === untilIndex) break;
          const nextIndex = await position();
          expect(nextIndex, `lesson number after "${lesson}"`).toBe(index + 1);
          expect(next, `the lesson after "${lesson}"`).toBe(LESSONS[nextIndex]);
          index = nextIndex;
          lesson = next;
          step = 0;
        }
      } catch (error) {
        for (const line of player.stackLog) log(line);
        // Discovery aid: the course DOM is not known yet, so keep it for writing the next handler.
        await test.info().attach('course-frame.html', { body: (await player.frame?.content()) ?? '', contentType: 'text/html' });
        throw error;
      }
    });

    let finished = false;
    if (until === FINAL_LESSON) {
      await test.step(`"${FINAL_LESSON}": course complete, EXIT`, async () => {
        expect(await player.currentLesson(), 'on the last page').toBe(FINAL_LESSON);
        log(`"${FINAL_LESSON}": pressed CONTINUE ${await player.continueToExit()} time(s) to reach EXIT`);
        expect.soft(await player.progress(), 'sidebar progress with EXIT shown').toBe(100);
        // SCORM 2004: "completed" by now. After EXIT the course has terminated the session and
        // reads fail (error 123), so the status is checked before (full run, 2026-10-27).
        const status = await scormStatus(page);
        log('SCORM status before EXIT:', JSON.stringify(status));
        expect.soft(status.status, 'SCORM status on the last page').toMatch(/^(completed|passed)$/);
        await player.finishCourse();
        log('SCORM status after EXIT (session ended):', JSON.stringify(await scormStatus(page)));
        finished = true;
      });
    }

    await test.step('exit and log out', async () => {
      // The course's EXIT may already have left the player (not seen yet).
      if (/\/mod\/scorm\/player\.php/.test(page.url())) await player.exit();
      if (finished) {
        // readProgress() was written for v1's course page; report rather than stop if it fails.
        // The course page then only says "The language course is completed" (no progress bar).
        await expect.soft(page.getByText(/The language course is completed/), 'course page after the course').toBeVisible();
        const myCourses = new MyCoursesPage(page);
        await myCourses.goto();
        const label = (await myCourses.progressLabel.first().textContent())?.replace(/\s+/g, ' ').trim();
        log('My courses progress after the course:', label);
        expect.soft(String(label), 'My courses after the whole course').toMatch(/100% complete/);
      }
      await header.logout();
      // Dev's redesigned logout lands on the login page, which has no "Log in" link (2026-10-26).
      await expect(page).toHaveURL(/\/login\/index\.php/);
      await page.goto('/my/');
      await expect(page, 'logged out: /my/ asks for a login').toHaveURL(/\/login\/index\.php/);
      log(`logged out; journey took ${((Date.now() - t0) / 60_000).toFixed(1)} min`);
    });
  });
});
