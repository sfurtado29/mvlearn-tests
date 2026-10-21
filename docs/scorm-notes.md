# SCORM player notes (P3 spike findings, dev)

Verified on 2026-10-06 against https://dev-mvlearn.verificient.com with the main APP account
(no SCORM_USERNAME set). Spike: `npx playwright test --grep @spike [--headed]`
(tests/regression/scorm.spike.spec.js). It passed headless and headed with identical timings.
These findings override the "facts" in docs/regression-prompts.md where they differ.

## Launch and resume prompt
- Course page link "Begin Course (English)" → same tab, URL `/mod/scorm/player.php?...`.
  The link still read "Begin Course" while the attempt was `incomplete`; "Continue (English)" was not seen.
- One iframe: `iframe[title="Driver's License Renewal Course"]`.
- From clicking the link to a usable player takes about 15–25 s on dev.
- With saved progress, a `dialog` (named after the course) shows buttons "Resume" and "Restart".
  It appears about 1 s after the iframe loads. `ScormPlayer.handleResumePrompt()` waits for
  either the dialog or a rendered slide, so it returns quickly on fresh accounts too.
- The prompt was shown on every relaunch, including right after Restart + Exit activity
  (`cmi.core.entry` = `resume`).

## Restart
- Restart resets **both** the bookmark and the menu ticks/locks. Right after Restart only
  "Welcome" is visited (and selected); every other item and section is locked. Seen on
  4 launches.

## Slide title
- Source: the visually hidden live region `#slide-label` inside the frame. Its text is
  `slide: <title>`, and `currentSlideTitle()` strips the prefix. It is empty until the first
  slide renders (`waitForSlide()`).
- The slide title can differ from the menu item: "Basic Speed Law (cont.)" sits under menu
  item "About Basic Speed Law". `selectedMenuTitle()` returns the menu item
  (`.cs-listitem.cs-selected[data-slide-title]`).
- The label changes **before** the new slide's content and before "next" is reset. Do not
  read slide content or "next" state right after the label changes.

## Advancing: timings and behaviour (corrected facts)
- "next" (`#next`) is disabled with `aria-disabled="true"` plus class `cs-disabled`. It is
  not the `disabled` attribute. Playwright's `isEnabled()` / `getByRole({ disabled })`
  respect this.
- **Most slides auto-advance** when their timeline ends. In section 1, only these needed a
  click:
  - "Welcome": "next" is enabled immediately, with no audio gating.
  - "Speed Limits Based on Location": in-slide "CONTINUE" (and "next") about 1 s after load.
    CONTINUE → "The Speed Limit & Weather Conditions" in about 1 s.

  Everything else moved on by itself. Leaving the player open moves the account forward
  without any clicks (drift risk). Exit the activity promptly.
- Measured times from one slide to the next (dev, headless and headed alike):

  | Slide | Seconds | How it moved on |
  |---|---|---|
  | Welcome → Introduction | 23 | click "next"; most of this is loading time |
  | Introduction | 10 | auto |
  | About Basic Speed Law | 14.5 | auto |
  | Basic Speed Law (cont.) | 25 | auto |
  | Speeding | 26 | auto |
  | Speed Limits | 15 | auto |
  | Speed Limits Based on Location | 1 | CONTINUE |

- "next" also becomes enabled at the moment an auto-advancing slide moves on. A late click
  would then land on the next slide. `advanceSlide()` handles this:
  - It only trusts "next" after it has stayed enabled for 1 s.
  - It clicks with a 5 s timeout and reports `action: 'auto'` if the slide moved on first.
  - It returns `{ from, to, action: 'next' | 'continue' | 'auto' }`.
- In-slide CONTINUE: the accessible `<button>` (`getByRole('main').getByRole('button',
  { name: /^continue$/i })`) is covered by its own drawn SVG shape. A normal click times out
  ("subtree intercepts pointer events"), so `click({ force: true })` is used. Verified: it
  advances.
- **Counting advances:** because of auto-advance, "N advances" ≠ "N slides". Three
  `advanceSlide()` calls from Welcome reached anything from "Basic Speed Law (cont.)" to
  "Speed Limits" (3–5 slides). Use title checks (`goToSlide`) rather than counting slides.

## Section 1 up to the quiz (E2E1, 2026-10-12, dev, main APP account)
- Welcome → quiz intro took 10 `advanceSlide()` steps, about 3 min of slides (4.6 min for the whole
  test including login, reset and logout).
- Besides "Speed Limits Based on Location", **"The Speed Limit & Weather Conditions"** also needs
  the in-slide CONTINUE (about 33 s after load). Road Conditions and Curves auto-advance.
- "The Speed Limit & Curves" auto-advances into the quiz intro. Its slide label and menu item are
  both **"End of Section Quiz"**. `ScormPlayer.beginQuizButton` (main → button /begin quiz/i)
  is visible there. The intro did not auto-advance while the test checked it.
- `lesson_status` stayed `incomplete` at the quiz intro. Restart + Exit afterwards locked the quiz
  again, so the account was left at the start of the course.

## Section 1 quiz (E2E2, 2026-10-12, dev, build account xts_user8)
- 4 questions, slides "Question 1"–"Question 4". Options are radios "A. …"–"C. …". Selecting one
  answers at once; the same slide shows "Correct!" + Continue, or "Incorrect." + "Try Again" +
  Continue. Try Again returns to the same question. Answers: B, C, B, A (tests/data/quiz-answers.js).
- Storyline keeps hidden copies of the feedback layers in the DOM, and the old slide's "Correct!"
  stays visible briefly after Continue. `ScormQuiz` only counts visible feedback and waits for it
  to clear.
- After Q4 the slide is "End" with "The lesson on Managing Your Speed is complete." (the sidebar
  transcript repeats the sentence: scope lookups to `main`).
- At that point: `lesson_status` still `incomplete`, `score.raw` empty, "Turning and Passing"
  still locked (probably unlocks after Continue on "End"; not tried yet). Course page and
  My courses both still **0%** after Exit activity. A relaunch resumed at "End" with section 1
  visited, so the pass was saved: the bar apparently does not count sections (open question
  for the client).
- Closing the browser without Exit activity lost the last ~minute (resumed at Q3 after Q3–Q4
  had been answered).
- CORRECTION (13 Oct): the SCORM report's "last access" column shows the time the report is
  viewed (every xts row showed 12:29 UTC when opened at 12:29 UTC). The "all accounts updated in
  the same minute" seen on 12 Oct was that, not an outside reset.

## Section 5 "Protecting Yourself and Your Passengers" (E2E3, 2026-10-13, dev, xts_user7)
- Introduction → About Seat Belts → Seat Belts → Wearing Your Seatbelt → Child Restraint System &
  Safety Seats (CONTINUE) → About Airbags → Unattended Children → Unattended Pets → Heat Related
  Dangers (CONTINUE) → Vehicle Loads → quiz (3 questions: B, A, A) → End. No practice slides.
- Q3's text lingered from Q2 for a moment after Continue (also in section 4); `continueAfterCorrect`
  now waits for a different question or a non-question slide.

## Section 6 "Law Enforcement Stops" (E2E3, 2026-10-13, dev, xts_user7)
- Introduction → Law Enforcement Stops → What to Do → What to Do During an Enforcement Stop - 2/3/4
  → **"Practice What to Do"** → Know Your Rights → Providing Identification → Your Rights During An
  Enforcement Stop - 2…7 → A Promise to Appear → quiz (3 questions: A, A, B) → End.
- "Practice What to Do During an Enforcement Stop": ordering drag-and-drop, 7 slots, 2-5 pre-filled.
  Order (confirmed by the user): 1 Turn on your right turn signal, 2 Move to the right shoulder,
  3 Pull out of the path of traffic, 4 Stop in a well-lit area, 5 End phone calls / radio off,
  6 Roll your window down, 7 Place your hands in clear view. Text labels dragged with page.mouse;
  slot positions derived from the pre-filled slots 2 and 3 (`ScormPractice.dragStepsToSlots`).
- The stale-question bug (Q3 read with Q2's text in sections 4-6) came from reading the question
  after answering, when the feedback panel hides it. The answering code now passes the question
  to `continueAfterCorrect`.

## Section 7 "Signs" and course completion (E2E3, 2026-10-13, dev, xts_user7)
- Introduction → About Regulatory Signs → Stop Signs → Yield Signs → Wrong Way & Do Not Enter Signs
  → White Regulatory Signs → **"Practice Identifying Regulatory Signs"** → About Warning Signs →
  Railroad Crossing → School Zone → Warning Signs → **"Practice Identifying Warning Signs"** → quiz
  (3 questions: B, B, C) → End.
- Both practices: drag each blue label into the empty box ~30 px below its sign, then Submit.
  Regulatory: stop → DMV_M7_030_stop, wrong way → DMV_M7_050_wrongWay, No U-Turn → DMV_M7_070_B,
  No Right turn → DMV_M7_070_D. Warning signs (names A-F, matched by grid position): top row
  Slippery when wet / Two way traffic / Stop ahead, bottom row Traffic signal ahead / Sharp turn /
  Crossroad.
- **After section 7: `lesson_status` = `completed`, My courses and course page = 100% complete.**
  So progress is all-or-nothing (0% through sections 1-6), by design — not a bug. E2E3 now asserts
  this when run to section 7.

## Full course in one go (2026-10-13, dev, xts_user9) — PASSED
- E2E3 with `E2E_ACCOUNT=xts_user9 E2E_UNTIL_SECTION=7 E2E_RESTART=1`: login → My courses → course →
  launch English → Restart → sections 1-7 (all slides, all practices, all quizzes from the key, no
  discovery) → `lesson_status` completed → My courses and course page 100% → Exit activity →
  logout → /my/ redirects to login. One session, 31.8 min.
- Caveat: xts_user9 had done sections 1-2 in an earlier failed run; Restart cleared the course's
  saved state, but Moodle's attempt record predates this run.
- Run it again (PowerShell):
  `$env:E2E_ACCOUNT='<pool user>'; $env:E2E_UNTIL_SECTION='7'; $env:E2E_RESTART='1'; npx playwright test --project=user -g E2E3 --workers=1`
  Leave out E2E_RESTART for a never-started account. Avoid `--trace on` (a 30-min trace is huge);
  the default keeps trace + video on failure.
- Storyline buttons whose accessible copy has no area on screen (seen on the "Right-of-Way" tile
  slide's CONTINUE) are activated with focus + Enter after a 5 s click attempt (`ScormPlayer.activate`).

## OPEN: saved progress ignored (seen twice, cause unknown)
- xts_user8 (12 Oct, after passing section 1) and xts_user7 + xts_user8 (13 Oct afternoon, after
  sections 1-3 / 1-4) later launched with **no Resume prompt, at Welcome, all sections locked**,
  although `cmi.suspend_data` was still stored (762 chars for xts_user8, well under SCORM 1.2's
  4096) and `cmi.core.entry` = `resume`. Previous runs had ended with Exit activity.
- Course log (as manager) shows no course/SCORM update on 13 Oct, so a re-published package is
  not confirmed. Ask the client/devs whether the dev package or SCORM settings changed.

## Section 2 "Turning and Passing" (E2E3, 2026-10-12/13, dev, xts_user8)
- "End" of section 1 → Continue → Introduction → Choosing a Lane → **"Click & Drag 1"** →
  **"Click & Drag 3"** (no "Click & Drag 2" seen) → How to Pass … Turning in Specific Situations
  (all auto-advance; about 3.5 min) → End of Section Quiz (3 questions) → End.
- Click & Drag slides: identical images "M2 Updated Art 12-4-20 car.png" = the draggable red car
  (leftmost) + one faded target per lane. Only real mouse movement works (`page.mouse` with steps,
  `ScormPractice.dragRedCarToLane`). Slide 1 targets lanes 1 and 3 (pass the yellow car: **lane 1**;
  lane 3 → "Incorrect. Lane 3 is used to enter or exit traffic."). Slide 3 targets lanes 1-3 (exit
  the freeway: **lane 3**). Submit with no car placed → "Please move the car on to one of the three
  lanes and try again." Try Again puts the car back.
- Quiz slides contain shape-named paragraphs ("Rectangle 1") before the question:
  `ScormQuiz.questionText()` takes the last real paragraph before the first option.
- **Q2's feedback button reads "Correct" instead of "Continue"** (heading "Correct" without "!").
  Works the same; likely an authoring slip worth reporting.
- On resume the menu can show the current section as "locked" and highlight nothing; a section
  shows "visited" only once complete. Progress bars stayed 0% after section 2 too.
- E2E tests set `actionTimeout: 60_000`: a click on a missing button once hung for the full 2 h.

## Section 3 "Right-of-Way" (E2E3, 2026-10-13, dev, xts_user8)
- Introduction → About Right-of-Way → About Pedestrians → Pedestrians → **"Right-of-Way"** (topic
  tiles Passing / Signs / Crosswalks / Sidewalks / Patience; clicking a tile shows more; CONTINUE
  was available at once in our run) → Crosswalks → Intersections → T Intersections → Stop Signs at
  all Corners → **"Practice Right-of-Way"** → Turning → Divided Highways → Mountain Roads → quiz.
- "Practice Right-of-Way" is a series of **picture questions**: "Click to select who has the
  right-of-way…", numbered badges `circle<n>.png` over a scenario picture `M3_140a/b/c-1.png`; the
  first slide is titled "Practice Right-of-Way", the next "Question 2", "Question 3". A real mouse
  click on the badge answers (no drag, no Submit); the hotspot works only after the narration.
  Feedback "Correct!" + Continue / "Incorrect" + Try Again. Answers: a → 3 (pedestrian), b → 1, c → 1.
  The question text is identical (and is drawn after the badges), so the key is just
  "[<scenario picture>]".
- Verified from 0% on a fresh account (xts_user7, 2026-10-13): sections 1-3 with every answer
  from the key, no discovery. 1 stop on the first scenario (key format, since fixed); resumed there.
- The End of Section Quiz continues the numbering: "Question 4"-"Question 6" (A, B, B).
- The "complete" sentence says **"Right of Way"** (no hyphens); section names are compared loosely.
- Hidden radios: the picture questions' radios are invisible `<input type="radio">`; "next" on
  these slides exists but has no box on screen, so "next" only counts when it is visible.

## Section 4 "Alcohol and Drugs" (E2E3, 2026-10-13, dev, xts_user8)
- Introduction → Alcohol & Drugs → Using Alcohol or Cannabis While Driving → "Untitled" → About
  Blood Alcohol Concentration → About Blood and Alcohol Concentration → Measuring BAC →
  **"Practice Measuring BAC"** → **"BAC Quiz 1"** → About Administrative Per Se → DUI Arrests →
  Consequences of DUI → Alcohol & Drugs → Consequences of Driving with an Illegal BAC →
  Speed Limits Based on Location (reused slide, CONTINUE) → quiz (3 questions) → End.
- BAC practice: "What is the predicted BAC level for a <male/female> that consumes <n> drink(s)
  and weighs <w> lbs?" with options A/B/C read from the BAC table. **Several questions on the same
  slide**: after Correct + Continue the next question replaces it, the slide title stays. So
  Continue waits for the feedback to clear, not for a new slide.
- Feedback on these slides: the accessible "Incorrect." is clipped off-screen and a drawn copy is
  shown, so feedback is read from the accessibility tree (also used for all quizzes now).
- The quiz slides contain a placeholder paragraph "0000000000000000000"; question text must
  contain words.
- Progress bars still 0% after 4 of 7 sections.

## Menu, ticks and locks
- Hamburger = button "Sidebar Toggle" (`aria-expanded`). At Desktop Chrome size
  (1280×720) the sidebar is open by default. The tabs are `tab "Menu"` and
  `tab "Transcript"`, mixed case.
- Tree: `tree "Menu"`, `treeitem` per section and slide. The state is the **suffix of the
  accessible name**: `"<title>"`, `"<title> visited"`, `"<title> locked"`, or
  `"<title> visited, locked"`. Icons are `.visitedIcon` / `.lockedIcon` / `.lockedViewedIcon`
  (aria-hidden), toggled by classes `cs-viewed`, `cs-unvisited`, `cs-restricted`.
- An unlocked section with no visits has a bare name (e.g. "Managing Your Speed" once you are
  inside it). The current slide is marked "visited" as soon as it is shown.
- Only the current section is expanded. Slides of collapsed sections are in the DOM but
  hidden, and when hidden their accessible name also contains the aria-hidden text. That is
  why `isLocked()` / `isVisited()` match the exact `data-slide-title` attribute. They work for
  collapsed items. `menuItem()` (role-based) finds visible items only.
- Titles repeat across sections: "Introduction", "Turning", "End of Section Quiz", "End",
  "Alcohol & Drugs", and even "Speed Limits Based on Location" (also under "Alcohol and
  Drugs"). Pass `{ section: 'Managing Your Speed' }` to scope a lookup. Without it, the first
  match (section 1) wins.
- Full tree order: Welcome; Managing Your Speed (Introduction, About Basic Speed Law,
  Speeding, Speed Limits, Speed Limits Based on Location, The Speed Limit & Weather
  Conditions, The Speed Limit & Road Conditions, The Speed Limit & Curves, End of Section
  Quiz, End); Turning and Passing; Right-of-Way; Alcohol and Drugs; Protecting Yourself and
  Your Passengers; Law Enforcement Stops; **Signs** (the 7th section, missing from the
  original facts).
- Clicking a locked item, the player's own "Exit" button and the Transcript tab were **not**
  exercised in P3.

## SCORM API and saving
- **SCORM 1.2**: `window.API` on the top Moodle page. `window.API_1484_11` is undefined.
  Helpers are in tests/helpers/scormApi.js (`getApiVersion`, `getValue`, `waitForSave`).
- Keys:
  - `cmi.core.lesson_status`: `incomplete` throughout (also right after Restart).
  - `cmi.core.lesson_location`: **always empty**. Storyline does not use it.
  - `cmi.suspend_data`: Storyline's bookmark and visited state (about 200–260 chars,
    compressed). Compare it as a whole; do not parse it.
  - `cmi.core.entry`: `resume` on every relaunch.
- Saves: `POST /mod/scorm/datamodel.php` → 200. These were **not** sent on each slide
  change. They came roughly once a minute (about 55–60 s after launch, then about 60 s
  apart; sometimes 2 back to back).
- On "Exit activity" Playwright saw **no** datamodel.php request. The data was still
  persisted: the suspend_data fingerprint before exit equalled the one at relaunch and
  differed from the previous run's value. So:
  - Tests that need a save without exiting must wait for the periodic POST
    (`waitForSave`, default timeout 90 s).
  - Tests that only need persistence can rely on Exit activity.

## Autoplay
- The chromium project now launches with `--autoplay-policy=no-user-gesture-required`.
  Audio-gated slides played and auto-advanced in both headless and headed runs.
- A headless check **without** the flag also worked, because clicking Restart counts as a
  user gesture. Keep the flag as a safety net (e.g. for flows without a prior click).

## Noise to filter in health checks
- `pageerror: The play() request was interrupted by a call to pause()`: thrown by Storyline
  on the Moodle page about 9 s into "Introduction" on every run. Harmless; P5's RF11 must
  ignore it.

## Test-run hygiene
- `npm test` / plain `npx playwright test` also runs the @spike test (about 1.5 min, one SCORM
  launch). `npm run test:smoke` and `npm run test:regression` do not.
- `@scorm-full` tests must not also carry `@regression`. `--grep @regression` matches the tag
  text only, so `@scorm-full` alone is safe.
- State left on dev after P3: the APP account's attempt is `incomplete`, with the bookmark in
  "About Basic Speed Law" (section 1, well before the quiz). Every later test starts with
  Restart anyway.
