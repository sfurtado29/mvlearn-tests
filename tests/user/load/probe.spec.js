// Load-test browser probe: one real browser, one LOAD_PROBE_POOL account, playing the full course
// and recording how long each step takes (tests/helpers/loadProbe.js). One test per account, so
// --workers runs them in parallel and --shard can split them. Tagged @load-probe ONLY; the user
// project ignores it unless LOAD_PROBE_RUN=1 (set by `npm run load:probe`). See docs/load-test.md.
//
// Journey: log in → My courses → course page → launch English, Restart → sections 1-7 (all
// practices, every quiz answered from tests/data/courses/<v>/quiz-answers.js, no discovery) → wait for one
// progress save → Exit activity → relaunch, Resume, check it resumes at "End" → Exit → log out.
import { test, expect } from '@playwright/test';
import { TARGET } from '../../../target.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { Header } from '../../pages/common/Header.js';
import { MyCoursesPage } from '../../pages/user/MyCoursesPage.js';
import { CoursePage } from '../../pages/user/CoursePage.js';
import { ScormPlayer } from '../../pages/user/ScormPlayer.js';
import { ScormQuiz } from '../../pages/user/ScormQuiz.js';
import { ScormPractice } from '../../pages/user/ScormPractice.js';
import { COURSE } from '../../data/site.js';
import { COURSE_VERSION, SECTIONS } from '../../data/course.js';
import { submitLogin } from '../../helpers/login.js';
import { getValue, waitForSave } from '../../helpers/scormApi.js';
import { getProbeAccounts } from '../../helpers/accounts.js';
import { currentSection, playSections } from '../../helpers/courseJourney.js';
import { ProbeRecorder } from '../../helpers/loadProbe.js';

const limit = Number(process.env.LOAD_PROBES) || undefined;
const accounts = getProbeAccounts().slice(0, limit);

// Probes run against staging only, unless LOAD_ALLOW_HOST names the host on purpose.
const host = new URL(String(process.env.BASE_URL)).hostname;
const allowedHost = TARGET === 'staging' || host === process.env.LOAD_ALLOW_HOST?.trim();

// Fresh login for every probe; every click/fill gets a time limit. No video or trace (top level:
// Playwright requires it): recording a 35-minute session costs a lot of CPU on this machine (1 probe
// with both: CPU avg 63%, max 91%, 2026-10-14) and would distort the timings; the probe's JSON plus
// a failure screenshot is enough.
test.use({ storageState: { cookies: [], origins: [] }, actionTimeout: 60_000, video: 'off', trace: 'off' });

test.describe('Load probe', { tag: '@load-probe' }, () => {
  // Storyline (v1) only; the v2 (Rise) probe is probe-v2.spec.js.
  test.skip(COURSE_VERSION !== 'v1', `the site runs course ${COURSE_VERSION}, not v1`);
  // Group level, so fixture teardown (video/trace) also gets the long timeout.
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
      const header = new Header(page);
      const coursePage = new CoursePage(page);
      const player = new ScormPlayer(page);
      const quiz = new ScormQuiz(player);
      const practice = new ScormPractice(player);
      // The language link's text changes with progress ("Begin Course" / "Continue"); match "(English)".
      const launchLink = coursePage.languageLink('English');

      try {
        expect(
          allowedHost,
          `Load probes run on staging only. Host "${host}" is not staging; to use it on purpose set LOAD_ALLOW_HOST=${host}`,
        ).toBe(true);

        await rec.time('login', async () => {
          await new LoginPage(page).goto();
          await submitLogin(page, account);
          await expect(page).toHaveURL(/\/my\/$/);
        });

        await rec.time('open_course', async () => {
          const myCourses = new MyCoursesPage(page);
          await myCourses.goto();
          await myCourses.courseLink(COURSE.name).first().click();
          await expect(coursePage.title(COURSE.name)).toBeVisible();
        });

        // Click until the first slide renders (includes choosing Restart on the resume prompt).
        await rec.time('launch', async () => {
          await player.launch(launchLink);
          rec.check('resumePromptAtLaunch', await player.handleResumePrompt('restart'));
          await player.waitForSlide();
        });
        await expect.poll(() => player.selectedMenuTitle(), { message: 'Restart lands on Welcome' }).toBe('Welcome');
        const section = await currentSection(player);
        rec.check('startSection', section);
        log('starting at Welcome, section:', section);

        await playSections({ player, quiz, practice, section, until: SECTIONS.length, log, timer: rec });
        const lessonStatus = await getValue(page, 'cmi.core.lesson_status');
        rec.check('lessonStatus', lessonStatus);
        expect(lessonStatus, 'SCORM status after the whole course').toBe('completed');

        // One progress save after the course is complete (Storyline commits about once a minute).
        await rec.time('wait_save', () => waitForSave(page, { timeout: 120_000 }), (response) => ({
          status: response.status(),
        }));

        await rec.time('exit', () => player.exit());

        // Relaunch until the resumed slide renders; it must not fall back to Welcome.
        await rec.time('resume', async () => {
          await player.launch(launchLink);
          rec.check('resumePromptOnRelaunch', await player.handleResumePrompt('resume'));
          await player.waitForSlide();
        });
        const resumedAt = await player.currentSlideTitle();
        rec.check('resumedAt', resumedAt);
        expect(resumedAt, 'resumes where the learner left (not Welcome)').toBe('End');

        await rec.time('exit', () => player.exit());
        // Logged out = the site's session is gone: /my/ must send us to the login page. Where Log out
        // itself lands differs: dev shows the front page; staging redirects to the DMV single sign-on
        // (wsi2st.dmv.ca.gov), which answered 403 "Request blocked" from our network (2026-10-21).
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
