# MVLearn regression: implementation prompts

How to use:
- Use **one new Claude chat per prompt**, in order: P3 → P4 → P5 → P6. P4 can run in parallel with P3.
- Copy everything inside the ```` fence of a prompt into the chat.
- After each prompt finishes, check its report. Run `npm run test:smoke` to make sure nothing broke.

Before you start:
| Prompt | Needs |
|---|---|
| P3 | `.env` pointing at dev (`BASE_URL=https://dev-mvlearn.verificient.com`), main account in APP_* |
| P4 | Nothing extra |
| P5 | P3 finished, `docs/scorm-notes.md` exists |
| P6 | P5 finished, `SCORM_POOL` in `.env` with 3–5 fresh accounts, `tests/data/quiz-answers.js` filled for section 1 (or use discovery mode) |

---

## P3 — Preparation (SCORM building blocks)

````
You are working in d:\MVLearn, a Playwright (JS, ESM) project testing MVLearn, a Moodle 4.x LMS.
Smoke tests S1–S12 exist in tests/smoke/ and pass. This task (P3) prepares the project for
regression testing, including the SCORM lesson player. Read every file under d:\MVLearn
(excluding node_modules, playwright-report, test-results) before changing anything.
Target site for this task: DEV (BASE_URL=https://dev-mvlearn.verificient.com).

## Hard rules
- Never print, log or hardcode credentials. Never edit .env (tell the user what to add).
- Do not change smoke tests except removing the parked S13 (task 6). `npm run test:smoke`
  must still pass at the end.
- SCORM safety: the test account must NOT reach the quiz. In this task never press
  "BEGIN QUIZ", never answer a quiz question, and advance at most 3 slides per launch.
  Always choose "Restart" when the Resume/Restart prompt appears.
- Verify every selector against the live dev site before relying on it (ariaSnapshot of
  the frame, or `npx playwright codegen`). Prefer getByRole. No waitForTimeout.

## Facts about the SCORM player (from a manual recording on dev)
- Course page launch link: "Begin Course (English)". It opens the player in the same tab.
- Player is Articulate Storyline 360 (modern player) in ONE iframe:
  page.frameLocator('iframe[title="Driver\'s License Renewal Course"]')
- On launch with existing progress a prompt shows buttons "Resume" and "Restart".
- Player buttons (inside the iframe): "next", "previous", "replay", play/pause, volume,
  "Exit" (top right). Hamburger menu → tabs MENU / TRANSCRIPT.
- Moodle link OUTSIDE the iframe: "Exit activity" → back to the course page.
- "next" is DISABLED until the slide's audio/timeline finishes (can take a while).
- Some slides have their own in-slide "CONTINUE"/"Continue" button that must be clicked
  to move on (e.g. "Speed Limits Based on Location", "Turning in Specific Situations").
  It is clickable immediately.
- MENU tree: "Welcome", then sections ("Managing Your Speed" with slides Introduction,
  About Basic Speed Law, Speeding, Speed Limits, Speed Limits Based on Location,
  The Speed Limit & Weather Conditions, The Speed Limit & Road Conditions,
  The Speed Limit & Curves, End of Section Quiz, End), then "Turning and Passing",
  "Right-of-Way", "Alcohol and Drugs", "Protecting Yourself and Your Passengers",
  "Law Enforcement Stops", … Visited items show a check mark; unreached items show a
  lock and cannot be opened.
- Moodle's SCORM API object lives on the top Moodle page (window.API for SCORM 1.2 or
  window.API_1484_11 for 2004). Confirm which one. Progress is saved via POST requests to
  /mod/scorm/datamodel.php.
- Reference recording: scorm-recording.js in the project root (contains a real password;
  see task 7). Lines with clicks on "slide navigation", ".slide-object" and "#focus-sink"
  were accidental; ignore them.

## Tasks
1. tests/data/site.js → environment-aware. Keep the exported COURSE shape, choose values by
   new URL(process.env.BASE_URL).hostname, throw a clear error for an unknown host:
   - dev-mvlearn.verificient.com: name 'License Renewal Course', teacher 'Admin User',
     englishScormId 2
   - st-mvlearn.verificient.com: name 'License Renwal Course' (typo is real), teacher
     'Mvlearn Admin', englishScormId 6
   Add launchLinkName: 'Begin Course (English)' (verified on dev; mark staging unverified).
   Make sure smoke S12 still passes with the new data.
2. tests/helpers/accounts.js:
   - getScormAccount(): SCORM_USERNAME/SCORM_PASSWORD if set, else APP_USERNAME/APP_PASSWORD.
     When it equals the APP account, tests may reuse the shared storageState.
   - getPoolAccounts(): parse SCORM_POOL="user1:pass1;user2:pass2" (may be empty;
     used later in P6).
   Add SCORM_USERNAME, SCORM_PASSWORD, SCORM_POOL (empty) to .env.example with comments.
3. playwright.config.js: in the chromium project add
   launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
   (Storyline only enables "next" after the audio finishes; blocked autoplay would stall it).
   Add npm script "test:scorm-full": "playwright test --grep @scorm-full --workers=1".
   Make sure `test:regression` (--grep @regression) does NOT match @scorm-full tests.
4. tests/pages/ScormPlayer.js (page object, no assertions):
   - frame, nextButton, previousButton, replayButton, exitButton, resumeButton,
     restartButton, menuButton, menuTab, transcriptTab, exitActivityLink (outside frame)
   - launch(): from the course page click COURSE.launchLinkName, wait for the iframe
   - handleResumePrompt(choice = 'restart'): if the prompt appears within a short time,
     click it; otherwise continue. Return whether a prompt was shown.
   - currentSlideTitle(): reliable way to read the current slide's title (find one,
     e.g. the selected menu item, an aria-label on the slide, or the slide heading)
   - advanceSlide(): if an in-slide "Continue"/"CONTINUE" button is visible+enabled click
     it; else wait (long timeout, e.g. 120s) for "next" to be enabled and click it; then
     wait until currentSlideTitle() changes. Never click twice for one step.
   - goToSlide(title, maxSteps): loop advanceSlide() until the title matches
     (used later; enforce maxSteps)
   - openMenu(), closeMenu(), menuItem(name), isLocked(name) / isVisited(name)
     (find how lock and check icons are exposed: aria, class, or icon element)
   - exit(): click Moodle "Exit activity"
5. tests/helpers/scormApi.js:
   - getValue(page, key): page.evaluate on the TOP page using the detected API object
   - waitForSave(page): page.waitForResponse(/\/mod\/scorm\/datamodel\.php/)
6. tests/smoke/course.spec.js: delete the parked `test.fixme('S13 …')`. S13 now lives in
   regression.
7. Move scorm-recording.js to docs/scorm-recording.js and replace the password string in
   the .fill(...) call with '***'. Do not echo the password anywhere.
8. tests/data/quiz-answers.js: export an object keyed by section, then by question text
   (start of the question is enough to match), value = correct option letter. Seed:
   'Managing Your Speed': { 'Basic speed law says': 'B' }. Add a comment: filled manually by
   playing the quiz; a wrong answer → "Incorrect." → "Try Again" returns to the question.
9. Verification spike: tests/regression/scorm.spike.spec.js tagged @spike (not @regression),
   using the SCORM account:
   launch → handleResumePrompt('restart') → log title → advanceSlide() x3 logging each
   title and time taken → open menu, log visited/locked state of the first 10 items →
   log the SCORM API type and cmi lesson status/location → Exit activity → relaunch →
   log whether a Resume/Restart prompt appears and what title shows.
   Run it HEADLESS and HEADED (`npx playwright test --grep @spike [--headed]`).
10. Write the spike findings to docs/scorm-notes.md (later prompts read this file):
   autoplay result, seconds per slide, how title/locks/ticks are detected, SCORM API
   version + cmi keys used, whether Restart resets bookmark AND ticks/locks, any corrected facts.

## Report back (final message)
- Files created/changed/deleted.
- Summary of docs/scorm-notes.md.
- `npm run test:smoke` result.
- What the user must add to .env.
Out of scope: writing regression tests (that is P4–P6), quiz, k6.
````

---

## P4 — Regression groups A–E (Moodle pages, main account)

````
You are working in d:\MVLearn, a Playwright (JS, ESM) project testing MVLearn, a Moodle 4.x LMS
(Boost theme). Smoke tests S1–S12 exist in tests/smoke/ with page objects in tests/pages/,
data in tests/data/site.js, and a setup project that saves a logged-in storageState.
Read every file under d:\MVLearn (excluding node_modules, playwright-report, test-results)
before changing anything. Target site: whatever BASE_URL in .env is (currently dev).

Task: write regression groups A–E in tests/regression/, every test tagged @regression.

## Hard rules
- Main account (APP_*) only. Read-only: never star/hide courses, never mark notifications
  read, never send messages, never change profile, never submit "forgot password".
- Some UI choices are saved as Moodle user preferences (Timeline filter/sort, My courses
  grouping/sort/view, block drawer state, language). Record the starting value and RESTORE
  it in afterEach/finally.
- Never log out of the shared storageState session. Tests that log in/out must use a clean
  context: test.use({ storageState: { cookies: [], origins: [] } }) and log in themselves.
- Failed logins: only ever use a made-up username for negative tests (never the real
  username with a wrong password; smoke S6 already does that once).
- Do NOT open the SCORM player ("Begin Course (English)"). Check its href only.
- Do not assert exact progress %, notification counts, or "Recently accessed" contents:
  SCORM tests on the same account change them. Assert format/presence instead.
- Verify every selector on the live site first (ariaSnapshot / codegen). Prefer getByRole.
  No waitForTimeout. If a feature does not exist on this site, use test.skip with a reason
  instead of guessing.
- Reuse/extend existing page objects; keep them assertion-free.

## Group A: auth.spec.js (clean context)
- RA1 Empty username and password → still on /login/index.php, no session (/my/ → login).
- RA2 Made-up username + any password → "Invalid login, please try again".
- RA3 Deep link while logged out: goto('/my/courses.php') → login page → log in →
  lands on /my/courses.php. Same for /course/view.php?id=COURSE.id.
- RA4 Logged in, open /login/index.php → Moodle's "already logged in" page (verify text);
  click Cancel, not Log out.
- RA5 Log in, log out, page.goBack(), reload → protected content not shown (login or
  front page with "Log in").
- RA6 Log in, context.clearCookies(), goto('/my/') → login page.
- RA7 "Forgotten your username or password?" link → page loads with its search fields.
  Do not submit.
- RA8 Two separate contexts log in with the same account; then both load /my/ fine.
  If the first session gets killed, fail with a clear message ("Moodle limits concurrent
  logins; matters for k6") rather than retrying.

## Group B: dashboard.spec.js (storageState)
- RB1 Timeline date filter: each option (verify list, e.g. All, Overdue, Next 7/30 days,
  Next 3/6 months) → button label updates, list or empty state "No activities require
  action" shown.
- RB2 Timeline sort: "Sort by dates" / "Sort by courses".
- RB3 Timeline search: nonsense text → empty state; clear → back to normal.
- RB4 Calendar block: next month → month heading changes; previous → back. "Full calendar"
  → /calendar/view.php loads. "Import or export calendars" page loads.
- RB5 "Recently accessed items" region visible (items OR its empty-state text).
- RB6 Block drawer close/open works and survives a reload. Restore original state.

## Group C: mycourses.spec.js (storageState)
- RC1 Course card for COURSE.name shows name and links to /course/view.php?id=COURSE.id;
  if a progress label exists it matches /\d+% complete/ (do not assert the number).
- RC2 Grouping filter: every option (verify list: All, In progress, Future, Past, Starred,
  Removed from view, …) → shows the course or the empty state without errors. Restore.
- RC3 Sort (Course name / Last accessed) and view mode (Card / List / Summary) each render
  the course. Restore.
- RC4 Search: part of COURSE.name → course shown; nonsense → no-courses state.

## Group D: header.spec.js (storageState)
- RD1 Notifications popover opens; "See all" → notifications page loads; notification
  preferences page loads. Do not mark anything read.
- RD2 Messaging drawer: Starred / Group / Private sections render; search opens; close.
- RD3 Each user-menu item that exists (Profile, Grades, Calendar, Private files, Reports,
  Preferences) → its page loads (URL + heading). Skip missing items with a reason.
- RD4 Grades overview lists COURSE.name; clicking it opens the course grade report.
- RD5 Language menu (only if more than one language) → switch, verify, switch back.

## Group E: course.spec.js (storageState)
- RE1 Course page: title, course index/sections, launch link COURSE.launchLinkName with href
  /mod/scorm/view.php?id=COURSE.englishScormId. Do not click it.
- RE2 Activity info (completion conditions / status) is displayed for the SCORM activity;
  assert presence, not values.
- RE3 Breadcrumb / "My courses" navigation returns to /my/courses.php.
- RE4 /course/view.php?id=999999 → Moodle error page (verify text), no PHP stack trace.

## Done when
- `npm run test:regression` passes, then `npx playwright test --grep @regression
  --repeat-each=2` passes with no flakes. `npm run test:smoke` still passes.
- Final message: files created/changed, test list with pass/fail/skip (+ skip reasons),
  any preference you had to restore, anything that behaved differently than described.
Out of scope: SCORM player (P5/P6), k6.
````

---

## P5 — Regression group F + session (SCORM, repeatable)

````
You are working in d:\MVLearn, a Playwright (JS, ESM) project testing MVLearn, a Moodle 4.x LMS
whose course content is an Articulate Storyline SCORM package. Read every file under
d:\MVLearn (excluding node_modules, playwright-report, test-results) before changing anything,
especially docs/scorm-notes.md (spike findings: these override any fact below),
tests/pages/ScormPlayer.js, tests/helpers/accounts.js, tests/helpers/scormApi.js.
Target site: BASE_URL in .env (currently dev).

Task: write the repeatable SCORM regression tests in tests/regression/scorm.spec.js and
tests/regression/session.spec.js, tagged @regression and @scorm.

## Hard rules
- Account: getScormAccount() (defaults to the main APP account). It must NEVER reach the
  quiz: never press "BEGIN QUIZ", never answer a question.
- Every test starts by launching and choosing "Restart" when prompted (unless the test is
  about Resume, in which case Restart first, set up its own position, then test Resume).
- Max 3 slide advances per test.
- Drift guard (beforeEach, after launch): open the menu; if "End of Section Quiz" is NOT
  locked, fail immediately with "SCORM account has drifted towards the quiz; rotate
  SCORM_USERNAME" (do not continue).
- afterEach: click Moodle "Exit activity" if the player is open, so the attempt is closed.
- test.describe.configure({ mode: 'serial' }); timeout ~5 min per test; slides play in real
  time, so use the long waits already in ScormPlayer.advanceSlide(). No waitForTimeout.
- If ScormPlayer is missing something, add it there (assertion-free), not in the spec.
- Never print credentials.

## Tests (scorm.spec.js)
- RF1 Launch (was smoke S13): course page → launch → iframe visible, player title
  "Driver's License Renewal Course", a slide title is shown, Moodle "Exit activity" visible.
- RF2 Progress saved: after launch + 1 advance, a datamodel.php POST returns 200 and the
  SCORM API lesson status is not "not attempted" (use the key/version from scorm-notes.md).
- RF3 Navigation: advance once → title changes; "previous" → previous title shown again.
  Also assert "next" is disabled right after a slide starts (unless that slide's audio is
  instant; if so, document it).
- RF4 Exit: Moodle "Exit activity" → /course/view.php?id=COURSE.id. Separately, the player's
  own "Exit" button: record what it does (per scorm-notes.md) and assert that.
- RF5 Resume: Restart, advance 2, note title, Exit activity, relaunch → Resume prompt shown →
  Resume → same title.
- RF6 Abrupt close: Restart, advance 1, wait for a save, close the page without Exit;
  new page → relaunch → Resume → same title.
- RF7 Locks: in the menu, "End of Section Quiz", "End" and the section "Turning and Passing"
  are locked; clicking a locked item does not change the current slide title.
- RF9 Ticks: after advancing past a slide, that slide's menu item shows as visited.
- RF10 Transcript: TRANSCRIPT tab shows non-empty text for the current slide.
- RF11 Health: during RF1–RF10 collect page errors on the Moodle page and any datamodel.php
  response that is not 200; assert none (one helper, used by all tests).

## Test (session.spec.js)
- RS1 Session lost mid-lesson: launch, Restart, advance 1, wait for a save, note title,
  clear cookies, try advanceSlide/next → then reload → expect Moodle login page. Log in
  again (getScormAccount), relaunch → Resume → title equals the last SAVED slide.
  Record in the report whether the player showed any error when the save failed.

## Done when
- `npx playwright test --grep @scorm` passes twice in a row headless (and once --headed).
- `npm run test:regression` and `npm run test:smoke` still pass.
- Final message: files changed, results per test, run time of the SCORM spec, anything that
  contradicted scorm-notes.md (and update that file).
Out of scope: quiz, section completion, drag and drop (P6), k6.
````

---

## P6 — Regression group G (SCORM full: quiz, completion, drag and drop)

````
You are working in d:\MVLearn, a Playwright (JS, ESM) project testing MVLearn, a Moodle 4.x LMS
whose course content is an Articulate Storyline SCORM package. Read every file under
d:\MVLearn (excluding node_modules, playwright-report, test-results) before changing anything,
especially docs/scorm-notes.md, tests/pages/ScormPlayer.js, tests/helpers/*.js,
tests/data/quiz-answers.js. Target site: BASE_URL in .env (currently dev).

Task: write the slow, account-consuming SCORM suite in tests/regression/scorm-full.spec.js,
tagged @scorm-full ONLY (it must not run with @regression). Run with `npm run test:scorm-full`.

## Accounts: pool, one per run
- Use getPoolAccounts() (SCORM_POOL in .env). Write tests/helpers/pool.js:
  pickFreshAccount(browser): for each account not listed in playwright/.pool-used.json
  (gitignore it): log in in a NEW context, open the course, launch the player. Fresh =
  no Resume/Restart prompt AND "Turning and Passing" locked in the menu. If not fresh,
  Exit activity, mark it used, try the next. Return { context, page, username }.
  Mark the chosen account used IMMEDIATELY (before the tests run).
- If no fresh account is left: skip the whole suite with "SCORM pool exhausted: add fresh
  accounts to SCORM_POOL".
- Never use the main APP account or SCORM_USERNAME here. Never print passwords.

## Quiz facts (from manual exploration)
- Before the quiz: slide "Now let's practice what you've learned with a few quiz questions."
  with a "BEGIN QUIZ" button.
- Section 1 ("Managing Your Speed") quiz has 4–5 single-choice questions. Options are big
  buttons whose text starts "A. ", "B. ", "C. ". Clicking an option submits it.
- Correct → slide with "Correct!", explanation, "Continue".
- Wrong → "Incorrect." + explanation, and two ways on:
  - "Try Again" → the same question again.
  - "Continue" → modal "You are about to exit the quiz and restart the module. Click
    continue to proceed." with "Continue" and a close (X) → jumps to the review slide for
    that topic (e.g. "Speed Limits Based on Location"); "next" enables after it plays and
    the learner goes through the slides back to the quiz.
- Section complete → slide "End of Section" with "Congratulations!" and "The lesson on
  Managing Your Speed is complete." and "Continue" (to the next section).
- Section 2 ("Turning and Passing") has drag-and-drop practice, e.g. "Practice Choosing a
  Lane": drag the red car into lane 1 or 3, press "Submit"; lane 1 → "Correct!" + Continue;
  wrong → Try Again.

## Answer key
- tests/data/quiz-answers.js maps section → question text (start) → letter.
- answerQuestion(section): read the question text; look it up; click the option whose text
  starts with "<letter>. ". If the question is NOT in the key: fail with a message that
  prints the full question text and its options, so a person can add it.
- Discovery mode (QUIZ_DISCOVER=1): for an unknown question, try A, then B, then C using
  "Try Again" after each wrong answer, and append the correct one to
  docs/quiz-answers-discovered.json for a person to copy into quiz-answers.js.

## Tests (one serial journey on one pool account; timeout ~45 min; workers 1)
test.describe.configure({ mode: 'serial' }), one browser context shared across the steps.
- Setup: pickFreshAccount → ScormPlayer.goToSlide to the "BEGIN QUIZ" slide (large maxSteps)
  → click "BEGIN QUIZ". Log the time this took.
- RG1 Try Again: on question 1 pick a wrong letter → "Incorrect." shown → "Try Again" →
  the same question text is shown again. Then answer it correctly → "Correct!" → Continue.
- RG2 Remediation: on question 2 pick a wrong letter → "Continue" → modal text shown →
  modal "Continue" → current slide is a learning slide (not the quiz) and "next" becomes
  enabled after it plays. Then goToSlide back to the quiz and continue.
  (If the quiz restarts from question 1, handle it: the answer key covers all questions.)
- RG3 Pass section 1: answer all remaining questions correctly → "End of Section" slide
  with "Managing Your Speed is complete".
- RG4 Persistence: Exit activity → relaunch → Resume; in the menu "Turning and Passing" is
  now unlocked and section 1 items are visited. Also record (before vs after) the course
  page activity status, the My courses progress label and the Grades entry; assert none got
  worse, and report what changed (Moodle may only mark completion at full course).
- RG5 Drag and drop: continue into section 2 → goToSlide "Practice Choosing a Lane" →
  drag the red car to lane 3 → Submit → wrong feedback → Try Again → drag to lane 1 →
  Submit → "Correct!". Try locator.dragTo first; if Storyline ignores it, use
  page.mouse down/move (with steps)/up inside the iframe's bounding box. If neither
  works, mark RG5 test.fixme with the reason and continue.
- RG6 Full course (all 7 sections): test.fixme placeholder with a comment; not run now.

## Done when
- One full `npm run test:scorm-full` run passes (it uses up one pool account).
- `npm run test:regression` and `npm run test:smoke` are unaffected.
- Final message: run time per step, which pool account was used (username only),
  questions missing from the key (if any), RG4 before/after values, RG5 outcome,
  and how many fresh pool accounts are left.
Out of scope: k6.
````
