// End-to-end course journey, built in milestones (see docs/scorm-notes.md for player behaviour).
//
// Milestone 1 (this test) runs on the main APP account and is reversible: it always chooses
// Restart, never presses "BEGIN QUIZ" (passing a quiz cannot be undone), and ends with
// Restart + Exit activity so the account is left at the start of the course.
// The quiz, sections 2-7 and course completion will run only on fresh SCORM_POOL accounts.
//
// Tagged @scorm-full only (never @smoke / @regression); run with `npm run test:scorm-full`.
import { test, expect } from '../../fixtures.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { Header } from '../../pages/common/Header.js';
import { MyCoursesPage } from '../../pages/user/MyCoursesPage.js';
import { ScormPlayer } from '../../pages/user/ScormPlayer.js';
import { ScormQuiz } from '../../pages/user/ScormQuiz.js';
import { ScormPractice } from '../../pages/user/ScormPractice.js';
import { COURSE } from '../../data/site.js';
import { SECTIONS, SECTION_1_SLIDES, QUIZ_MENU_ITEM } from '../../data/course.js';
import { submitLogin } from '../../helpers/login.js';
import { getValue } from '../../helpers/scormApi.js';
import { getE2EAccount } from '../../helpers/accounts.js';
import { answerQuestion, readProgress, percent, currentSection, playSections } from '../../helpers/courseJourney.js';

// The journey logs in itself, like a real learner. Every click/fill gets a time limit, so an
// unexpected slide fails within a minute instead of waiting for the (very long) test timeout.
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000 });

const SECTION_1 = SECTIONS[0];
// Each advanceSlide() call moves one or more slides (auto-advance), so this is a generous cap.
const MAX_STEPS = 25;

test.describe('Course journey (E2E)', { tag: '@scorm-full' }, () => {
  // Set at group level (not only test.setTimeout): fixture teardown, e.g. saving a long trace or
  // video, otherwise gets just the default 30 s (a full-course run failed that way, 2026-10-13).
  test.describe.configure({ timeout: 130 * 60_000 });

  test('E2E1 login → course → section 1 up to the quiz (not started) → logout', async ({ page, credentials }) => {
    test.setTimeout(25 * 60_000);
    const t0 = Date.now();
    const log = (...args) => console.log(`[E2E1 ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...args);
    const header = new Header(page);
    const player = new ScormPlayer(page);

    await test.step('log in', async () => {
      await new LoginPage(page).goto();
      await submitLogin(page, credentials);
      await expect(page).toHaveURL(/\/my\/$/);
    });

    await test.step('open the course from My courses', async () => {
      await header.myCoursesTab.click();
      await new MyCoursesPage(page).courseLink(COURSE.name).first().click();
      await expect(page).toHaveURL(new RegExp(`/course/view\\.php\\?id=${COURSE.id}$`));
    });

    await test.step('launch the English course from the start', async () => {
      await player.launch();
      log('resume prompt shown (chose Restart):', await player.handleResumePrompt('restart'));
      await expect.poll(() => player.selectedMenuTitle()).toBe('Welcome');
    });

    await test.step(`play "${SECTION_1}" up to its quiz, without starting it`, async () => {
      const allowed = ['Welcome', ...SECTION_1_SLIDES, QUIZ_MENU_ITEM];
      for (let step = 1; ; step++) {
        expect(step, `quiz intro not reached within ${MAX_STEPS} steps`).toBeLessThanOrEqual(MAX_STEPS);
        const result = await player.advanceSlide({ stopAtButton: 'begin quiz' });
        const menuTitle = await player.selectedMenuTitle();
        log(`step ${step}: ${result.action} "${result.from}" -> "${result.to}" (menu: ${menuTitle})`);
        if (result.action === 'stopped') break;
        // Moving past the quiz would mean it was skipped or started: stop the run at once.
        expect(allowed, `left section 1's path at menu item "${menuTitle}"`).toContain(menuTitle);
        // Never advance from the quiz item, even if the "BEGIN QUIZ" button was not recognised.
        if (menuTitle === QUIZ_MENU_ITEM) break;
      }
    });

    await test.step('quiz intro is shown and nothing was completed', async () => {
      await expect(player.beginQuizButton).toBeVisible();
      await expect.soft(page.getByRole('heading', { name: 'English' })).toBeVisible();
      expect.soft(await player.selectedMenuTitle()).toBe(QUIZ_MENU_ITEM);
      expect(await getValue(page, 'cmi.core.lesson_status')).toBe('incomplete');

      await player.openMenu();
      for (const slide of SECTION_1_SLIDES) {
        expect.soft(await player.isVisited(slide, { section: SECTION_1 }), `"${slide}" visited`).toBe(true);
      }
      expect(await player.isLocked(SECTIONS[1]), `"${SECTIONS[1]}" still locked`).toBe(true);
    });

    await test.step('exit, then put the account back at the start (Restart + Exit)', async () => {
      await player.exit();
      await player.launch();
      expect(await player.handleResumePrompt('restart'), 'resume prompt after progress').toBe(true);
      await player.openMenu();
      expect(await player.isLocked(QUIZ_MENU_ITEM, { section: SECTION_1 }), 'quiz locked again after Restart').toBe(true);
      await player.exit();
    });

    await test.step('log out', async () => {
      await header.logout();
      await expect(header.loginLink).toBeVisible();
      await page.goto('/my/');
      await expect(page).toHaveURL(/\/login\/index\.php/);
    });
  });

  // Milestone 2. PERMANENT for the account: passes the section 1 quiz. Runs only on the SCORM_POOL
  // account named by E2E_ACCOUNT; resumes wherever that account stopped (build-account friendly).
  // QUIZ_DISCOVER=1: unknown questions are tried A, B, C… with "Try Again" after each wrong answer
  // (never "Continue", which sends the learner back to review slides); answers found are saved to
  // tests/data/courses/<v>/quiz-answers.discovered.json.
  test('E2E2 pool account: section 1 quiz passed → End of Section → logout', async ({ page }) => {
    const account = getE2EAccount();
    test.skip(!account, 'Set E2E_ACCOUNT=<username from SCORM_POOL>, e.g. the build account');
    test.setTimeout(30 * 60_000);
    const t0 = Date.now();
    const log = (...args) => console.log(`[E2E2 ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...args);
    const header = new Header(page);
    const player = new ScormPlayer(page);
    const quiz = new ScormQuiz(player);
    const progress = {};
    const recordProgress = async (when) => {
      progress[when] = await readProgress(page);
      log(`progress ${when}:`, JSON.stringify(progress[when]));
    };

    await test.step(`log in as ${account?.username}`, async () => {
      await new LoginPage(page).goto();
      await submitLogin(page, account);
      await expect(page).toHaveURL(/\/my\/$/);
    });

    await test.step('record progress, open the course', () => recordProgress('before'));

    await test.step('launch English (resume where the account stopped)', async () => {
      await player.launch();
      log('resume prompt shown (chose Resume):', await player.handleResumePrompt('resume'));
      log('resumed at slide:', await player.currentSlideTitle());
    });

    await test.step(`play "${SECTION_1}" up to the first unanswered question`, async () => {
      const allowed = ['Welcome', ...SECTION_1_SLIDES, QUIZ_MENU_ITEM];
      for (let step = 1; !(await quiz.isQuestion()); step++) {
        expect(step, `quiz not reached within ${MAX_STEPS} steps`).toBeLessThanOrEqual(MAX_STEPS);
        if (await player.beginQuizButton.isVisible()) {
          await player.beginQuizButton.click({ force: true });
          await quiz.options.first().waitFor({ timeout: 60_000 });
          log('pressed BEGIN QUIZ');
          break;
        }
        const result = await player.advanceSlide({ stopAtButton: 'begin quiz' });
        const menuTitle = await player.selectedMenuTitle();
        log(`step ${step}: ${result.action} "${result.from}" -> "${result.to}" (menu: ${menuTitle})`);
        if (menuTitle) expect(allowed, `left section 1's path at menu item "${menuTitle}"`).toContain(menuTitle);
      }
    });

    await test.step('answer every question correctly', async () => {
      for (let count = 1; await quiz.isQuestion(); count++) {
        expect(count, 'more than 15 questions: the quiz seems to loop').toBeLessThanOrEqual(15);
        await answerQuestion(player, quiz, SECTION_1, log);
      }
    });

    await test.step(`"${SECTION_1}" is complete`, async () => {
      log('after the quiz, slide:', await player.currentSlideTitle());
      // Scoped to the slide: the sidebar transcript repeats the same sentence.
      await expect(player.frame.getByRole('main').getByText(new RegExp(`${SECTION_1} is complete`))).toBeVisible({
        timeout: 30_000,
      });
      log('lesson_status:', await getValue(page, 'cmi.core.lesson_status'), '| score.raw:', await getValue(page, 'cmi.core.score.raw'));
      await player.openMenu();
      log(`"${SECTIONS[1]}" locked:`, await player.isLocked(SECTIONS[1]));
    });

    await test.step('exit, record progress again', async () => {
      await player.exit();
      await recordProgress('after');
      test.info().annotations.push({ type: 'progress', description: JSON.stringify(progress) });
      expect.soft(percent(progress.after.coursePage), 'course page progress did not go down').toBeGreaterThanOrEqual(
        percent(progress.before.coursePage),
      );
    });

    await test.step('log out', async () => {
      await header.logout();
      await expect(header.loginLink).toBeVisible();
      await page.goto('/my/');
      await expect(page).toHaveURL(/\/login\/index\.php/);
    });
  });

  // Milestone 3+. PERMANENT for the account. Plays the course from wherever the E2E_ACCOUNT stopped,
  // section by section, until section E2E_UNTIL_SECTION (1-7, default 7) is complete:
  // quizzes as in E2E2, practice slides through tests/data/courses/<v>/practice.js. A slide with a Submit button that
  // has no handler stops the run, with its structure attached, so a handler can be added.
  test('E2E3 pool account: play sections until E2E_UNTIL_SECTION is complete → logout', async ({ page }) => {
    const account = getE2EAccount();
    test.skip(!account, 'Set E2E_ACCOUNT=<username from SCORM_POOL>, e.g. the build account');
    const until = Number(process.env.E2E_UNTIL_SECTION ?? SECTIONS.length);
    expect(until, 'E2E_UNTIL_SECTION must be 1-7').toBeGreaterThanOrEqual(1);
    expect(until, 'E2E_UNTIL_SECTION must be 1-7').toBeLessThanOrEqual(SECTIONS.length);
    test.setTimeout(120 * 60_000);
    const t0 = Date.now();
    const log = (...args) => console.log(`[E2E3 ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...args);
    const header = new Header(page);
    const player = new ScormPlayer(page);
    const quiz = new ScormQuiz(player);
    const practice = new ScormPractice(player);
    const progress = {};

    await test.step(`log in as ${account?.username}`, async () => {
      await new LoginPage(page).goto();
      await submitLogin(page, account);
      await expect(page).toHaveURL(/\/my\/$/);
    });

    await test.step('record progress, open the course', async () => {
      progress.before = await readProgress(page);
      log('progress before:', JSON.stringify(progress.before));
    });

    let section;
    // E2E_RESTART=1: choose "Restart" on the resume prompt, so the whole course is played from
    // Welcome in this one session (all sections locked again, saved position cleared).
    const restart = process.env.E2E_RESTART === '1';
    await test.step(`launch English (${restart ? 'restart from the beginning' : 'resume'}) and find the current section`, async () => {
      await player.launch();
      log(`resume prompt shown (chose ${restart ? 'Restart' : 'Resume'}):`, await player.handleResumePrompt(restart ? 'restart' : 'resume'));
      log('starting at slide:', await player.currentSlideTitle());
      if (restart) {
        await expect.poll(() => player.selectedMenuTitle(), { message: 'Restart lands on Welcome' }).toBe('Welcome');
      }
      section = await currentSection(player);
      log('current section:', section ?? '(all sections visited)');
    });

    await test.step(`play until "${SECTIONS[until - 1]}" is complete`, async () => {
      await playSections({ player, quiz, practice, section, until, log });
      const lessonStatus = await getValue(page, 'cmi.core.lesson_status');
      log('lesson_status:', lessonStatus, '| score.raw:', await getValue(page, 'cmi.core.score.raw'));
      // The course is complete only after the last section (seen 2026-10-13: "completed").
      if (until === SECTIONS.length) expect(lessonStatus, 'SCORM status after the last section').toBe('completed');
      else expect(lessonStatus, 'SCORM status before the last section').toBe('incomplete');
    });

    await test.step('exit, record progress again', async () => {
      await player.exit();
      progress.after = await readProgress(page);
      log('progress after:', JSON.stringify(progress.after));
      test.info().annotations.push({ type: 'progress', description: JSON.stringify(progress) });
      expect.soft(percent(progress.after.coursePage), 'course page progress did not go down').toBeGreaterThanOrEqual(
        percent(progress.before.coursePage),
      );
      // Progress is all-or-nothing: 0% until the whole course is complete, then 100% (seen 2026-10-13).
      if (until === SECTIONS.length) {
        expect(progress.after.coursePage, 'course page after the whole course').toBe('100% complete');
        expect(progress.after.myCourses, 'My courses after the whole course').toMatch(/100% complete/);
      }
    });

    await test.step('log out', async () => {
      await header.logout();
      await expect(header.loginLink).toBeVisible();
      await page.goto('/my/');
      await expect(page).toHaveURL(/\/login\/index\.php/);
      log(`logged out; journey took ${((Date.now() - t0) / 60_000).toFixed(1)} min`);
    });
  });
});
