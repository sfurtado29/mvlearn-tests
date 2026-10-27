// Verification spike for the SCORM building blocks (P3). Not a regression test: it only logs.
// Safety: always Restart, at most 3 advances per launch, never reaches the quiz.
import { test } from '@playwright/test';
import { ScormPlayer } from '../../pages/user/ScormPlayer.js';
import { CoursePage } from '../../pages/user/CoursePage.js';
import { LoginPage } from '../../pages/common/LoginPage.js';
import { COURSE } from '../../data/site.js';
import { getScormAccount } from '../../helpers/accounts.js';
import { getApiVersion, getValue } from '../../helpers/scormApi.js';
import { COURSE_VERSION } from '../../data/course.js';

const account = getScormAccount();
if (!account.isAppAccount) test.use({ storageState: { cookies: [], origins: [] } });

const seconds = (start) => ((Date.now() - start) / 1000).toFixed(1);

// Short fingerprint of cmi.suspend_data (Storyline's bookmark), so runs can be compared without
// logging the data itself.
const fingerprint = (text) => {
  let hash = 5381;
  for (const char of text) hash = ((hash * 33) ^ char.charCodeAt(0)) >>> 0;
  return `${text.length}:${hash.toString(16)}`;
};

test('SCORM player spike', { tag: '@spike' }, async ({ page }) => {
  // Storyline (v1) only.
  test.skip(COURSE_VERSION !== 'v1', `the site runs course ${COURSE_VERSION}, not v1`);
  test.setTimeout(10 * 60_000);
  const t0 = Date.now();
  const log = (...args) => console.log(`[spike ${seconds(t0)}s]`, ...args);
  const isDatamodel = (url) => /\/mod\/scorm\/datamodel\.php/.test(url);
  page.on('request', (request) => {
    if (isDatamodel(request.url())) log(`datamodel.php ${request.method()} sent`);
  });
  page.on('response', (response) => {
    if (isDatamodel(response.url())) log(`datamodel.php ${response.request().method()} ${response.status()}`);
  });
  page.on('requestfailed', (request) => {
    if (isDatamodel(request.url())) log(`datamodel.php ${request.method()} failed: ${request.failure()?.errorText}`);
  });
  page.on('pageerror', (error) => log('pageerror:', error.message));

  if (!account.isAppAccount) {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(account.username, account.password);
    await page.waitForURL(/\/my\/$/);
  }

  const player = new ScormPlayer(page);
  await new CoursePage(page).goto(COURSE.id);
  await player.launch();
  log('API version:', await getApiVersion(page));
  log('before prompt: lesson_status =', await getValue(page, 'cmi.core.lesson_status'));
  log('before prompt: entry =', await getValue(page, 'cmi.core.entry'));
  log('before prompt: suspend_data =', fingerprint(await getValue(page, 'cmi.suspend_data')));
  log('prompt shown (chose Restart):', await player.handleResumePrompt('restart'));
  log('title after restart:', await player.currentSlideTitle());
  await player.openMenu();
  log('menu right after restart:', JSON.stringify((await player.menuItems()).slice(0, 10)));

  for (let step = 1; step <= 3; step++) {
    const start = Date.now();
    const result = await player.advanceSlide();
    log(`advance ${step}: ${result.action} "${result.from}" -> "${result.to}" in ${seconds(start)}s`);
  }
  log('selected menu item:', await player.selectedMenuTitle());

  await player.openMenu();
  const items = (await player.menuItems()).slice(0, 10);
  for (const item of items) {
    log(`menu: ${item.title} | visited=${item.visited} locked=${item.locked} selected=${item.selected}`);
  }
  log('isVisited("Welcome") =', await player.isVisited('Welcome'));
  log('isLocked("End of Section Quiz") =', await player.isLocked('End of Section Quiz'));
  log('isLocked("Turning and Passing") =', await player.isLocked('Turning and Passing'));

  log('lesson_status =', await getValue(page, 'cmi.core.lesson_status'));
  log('lesson_location =', JSON.stringify(await getValue(page, 'cmi.core.lesson_location')));
  log('suspend_data before exit =', fingerprint(await getValue(page, 'cmi.suspend_data')));

  await player.exit();
  log('exited to', new URL(page.url()).pathname);

  await player.launch();
  log('relaunch: entry =', await getValue(page, 'cmi.core.entry'));
  log('relaunch: suspend_data =', fingerprint(await getValue(page, 'cmi.suspend_data')));
  log('relaunch: prompt shown (chose Restart):', await player.handleResumePrompt('restart'));
  log('relaunch: title =', await player.currentSlideTitle());
  await player.openMenu();
  log('relaunch: menu after Restart:', JSON.stringify((await player.menuItems()).slice(0, 10)));
  await player.exit();
  log('done');
});
