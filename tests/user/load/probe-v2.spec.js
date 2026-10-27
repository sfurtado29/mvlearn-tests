// Load-test browser probe for the v2 course package (Articulate Rise): one real browser, one
// LOAD_PROBE_POOL account, playing the whole course and recording how long each step takes
// (tests/helpers/loadProbe.js). The v1 (Storyline) probe is probe.spec.js; each skips on a site
// running the other version. Tagged @load-probe ONLY; the user project ignores it unless
// LOAD_PROBE_RUN=1 (set by `npm run load:probe`). See docs/load-test.md.
//
// Journey: log in → My courses → course page → launch English (START COURSE on the cover) →
// Lesson 01 to its quiz → Exit activity → relaunch, check it resumes at Lesson 02 → the rest of
// the course → Conclusion: CONTINUE, EXIT → Exit activity → log out.
//
// ONE RUN PER ACCOUNT: Rise has no Restart, and a completed course cannot be launched again (the
// course page then only says "The language course is completed"). Every probe run needs fresh
// LOAD_PROBE_POOL accounts; the probe fails at once on an account that has started the course.
import { test, expect } from '@playwright/test';
import { TARGET } from '../../../target.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { Header } from '../../pages/common/Header.js';
import { MyCoursesPage } from '../../pages/user/MyCoursesPage.js';
import { CoursePage } from '../../pages/user/CoursePage.js';
import { RisePlayer } from '../../pages/user/RisePlayer.js';
import { COURSE } from '../../data/site.js';
import { COURSE_VERSION, LESSONS } from '../../data/course.js';
import { submitLogin } from '../../helpers/login.js';
import { getProbeAccounts } from '../../helpers/accounts.js';
import { FINAL_LESSON, playLessons, scormStatus } from '../../helpers/riseJourney.js';
import { ProbeRecorder } from '../../helpers/loadProbe.js';

const limit = Number(process.env.LOAD_PROBES) || undefined;
const accounts = getProbeAccounts().slice(0, limit);

// Probes run against staging only, unless LOAD_ALLOW_HOST names the host on purpose.
const host = new URL(String(process.env.BASE_URL)).hostname;
const allowedHost = TARGET === 'staging' || host === process.env.LOAD_ALLOW_HOST?.trim();

/** The last page of Lesson 01; the resume check follows it. */
const RESUME_AFTER = 'End of Lesson Quiz: Managing Your Speed';

// As probe.spec.js: fresh login, a time limit on every click, no video or trace (they would
// distort the timings).
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000, video: 'off', trace: 'off' });

test.describe('Load probe v2', { tag: '@load-probe' }, () => {
  test.skip(COURSE_VERSION !== 'v2', `the site runs course ${COURSE_VERSION}, not v2`);
  // Group level, so fixture teardown also gets the long timeout. A full v2 run takes ~15 min alone.
  test.describe.configure({ timeout: 90 * 60_000 });

  if (!accounts.length) {
    test('probe (no accounts)', () => {
      test.skip(true, 'Add LOAD_PROBE_POOL to .env (see .env.example)');
    });
  }

  for (const account of accounts) {
    test(`probe ${account.username}`, async ({ page }) => {
      const rec = new ProbeRecorder({ username: account.username, host });
      const t0 = Date.now();
      const log = (...args) => console.log(`[probe ${account.username} ${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...args);
      rec.listen(page);
      rec.check('courseVersion', COURSE_VERSION);
      const header = new Header(page);
      const coursePage = new CoursePage(page);
      const player = new RisePlayer(page);
      const launch = async (step) =>
        rec.time(step, async () => {
          await player.launch();
          return player.start();
        });

      try {
        expect(
          allowedHost,
          `Load probes run on staging only. Host "${host}" is not staging; to use it on purpose set LOAD_ALLOW_HOST=${host}`,
        ).toBe(true);

        await rec.time('login', async () => {
          await new LoginPage(page).goto();
          await submitLogin(page, account);
          await expect(page).toHaveURL(/\/my\/(courses\.php)?$/);
        });

        await rec.time('open_course', async () => {
          const myCourses = new MyCoursesPage(page);
          await myCourses.goto();
          await myCourses.courseLink(COURSE.name).first().click();
          await expect(coursePage.title(COURSE.name)).toBeVisible();
        });
        const completed = page.getByText(/The language course is completed/);
        await expect(completed.or(player.launchLink).first()).toBeVisible({ timeout: 30_000 });
        expect(
          await completed.isVisible(),
          `${account.username} has already completed the course: v2 probes need fresh accounts (Rise has no Restart)`,
        ).toBe(false);

        // Until the first lesson page shows (START COURSE on the cover page of a fresh account).
        rec.check('coverButton', await launch('launch'));
        const startedAt = await player.currentLesson();
        rec.check('startLesson', startedAt);
        expect(startedAt, `${account.username} has started the course already: v2 probes need fresh accounts`).toBe(LESSONS[0]);
        log('starting at', startedAt);

        await playLessons({ player, until: RESUME_AFTER, log, timer: rec });

        // Resume under load: leave after Lesson 01, come back, it must open at Lesson 02.
        await rec.time('exit', () => player.exit());
        player.frame = undefined;
        await launch('resume');
        const expected = LESSONS[LESSONS.indexOf(RESUME_AFTER) + 1];
        const resumedAt = await player.currentLesson();
        rec.check('resumeExpected', expected);
        rec.check('resumedAt', resumedAt);
        expect(resumedAt, 'resumes where the learner left').toBe(expected);

        await playLessons({ player, until: FINAL_LESSON, log, timer: rec });

        await rec.time('finish', async () => {
          await player.continueToExit();
          const status = await scormStatus(page);
          rec.check('completionStatus', status.status);
          expect(status.status, 'SCORM 2004 completion on the last page').toBe('completed');
          await player.finishCourse();
        });

        await rec.time('exit', async () => {
          if (/\/mod\/scorm\/player\.php/.test(page.url())) await player.exit();
        });
        // Logged out = the site's session is gone: /my/ must send us to the login page.
        await rec.time('logout', async () => {
          await header.logout();
          await page.waitForLoadState();
          rec.check('logoutLandedOn', new URL(page.url()).host);
        });
        await page.goto('/my/');
        await expect(page, 'session ended after logout').toHaveURL(/\/login\/index\.php/);
        rec.pass();
        log(`done in ${((Date.now() - t0) / 60_000).toFixed(1)} min`);
      } catch (error) {
        rec.fail(error);
        throw error;
      } finally {
        const file = rec.write();
        await test.info().attach('probe result', { path: file, contentType: 'application/json' });
      }
    });
  }
});
