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
import { COURSE_VERSION, LESSONS } from '../../data/course.js';
import { submitLogin } from '../../helpers/login.js';
import { getScormAccount } from '../../helpers/accounts.js';
import { FINAL_LESSON, playLessons, scormStatus } from '../../helpers/riseJourney.js';

test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000 });

test.describe('Course journey v2 (E2E)', { tag: '@scorm-full' }, () => {
  test.skip(COURSE_VERSION !== 'v2', `the site runs course ${COURSE_VERSION}, not v2`);
  test.describe.configure({ timeout: 60 * 60_000 });

  // E2E_UNTIL_LESSON: the last lesson to complete (a LESSONS title; the first one if it repeats),
  // default the last one, Conclusion (then the course is ended with EXIT).
  // Each page as in tests/helpers/riseJourney.js playLessons(). Stops with the visible buttons
  // listed when no CONTINUE shows up.
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
      try {
        await playLessons({ player, until, log });
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
