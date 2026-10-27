# SCORM player notes, v2 course package (dev, client update 2026-10)

From screenshots of dev shared on 2026-10-26; not yet checked against the DOM. v1 (Storyline,
slide by slide) is in docs/scorm-notes.md. v2 looks like **Articulate Rise**: each lesson is one
scrolling page of blocks, with a sidebar menu.

## Launch
- Course title in the package: "California Driver's License Renewal Course [EN_US FINAL]".
- Moodle's "Exit activity" button is still above the frame; the package has its own
  "EXIT COURSE" (top right).
- **Cover page** (seen on another user's login, likely an account with no progress): a split
  banner (photo left, blue panel right with the title and a **START COURSE** button), then the
  DMV logo and an "Introduction:" paragraph below. No sidebar. Other launches opened straight
  into the lesson view, so the journey must handle both: click START COURSE if it is there.

## Menu (sidebar)
- Header: the course title and a progress bar "<n>% COMPLETE" (16% after the two Introduction
  items).
- Items, with a blue tick when complete:
  - INTRODUCTION: Course Navigation, Welcome and Objectives
  - LESSON 01: MANAGING YOUR SPEED
  - LESSON 02: TURNING AND PASSING
  - LESSON 03: RIGHT-OF-WAY
  - LESSON 04: ALCOHOL AND DRUGS
  - LESSON 05: PROTECTING YOURSELF AND YOUR PASSENGERS
  - LESSON 06: LAW ENFORCEMENT STOPS
  - LESSON 07: SIGNS
  - END OF COURSE / CONCLUSION
- The ☰ button (top left) opens/closes the sidebar.
- The Welcome text says each lesson and its knowledge check must be completed before the next
  topic: later lessons are probably locked (to confirm).

## Lesson pages
- Header banner with the lesson/page title, then text, lists and other blocks; long pages
  scroll ("Welcome and Learning Objectives", "How to Pass" in Lesson 02).
- **Audio narration players** on many blocks. **Not mandatory** (confirmed by the user): the
  tests do not play them.
- "Course Navigation": a labeled graphic (markers 1-6 and "i") explaining the controls, then a
  **CONTINUE** button. In Rise a CONTINUE block usually hides the blocks below it until clicked.

## Playing a lesson (confirmed by the user up to Lesson 01 "Speed Limits")
- Introduction (Course Navigation, Welcome and Objectives) and Lesson 01 (Introduction: Managing
  Your Speed, About Basic Speed Law, Speeding, Speed Limits): **scroll to the end, press
  CONTINUE**. Nothing else is required.
- **"Speed Limit Based on Location"**: six flip cards; CONTINUE shows only after every card is
  flipped. Each card has groups "Front of card" / "Back of card", each with a button "Click to
  flip <image alt / back text>". `RisePlayer.flipCards()` clicks each card once (passed on dev
  2026-10-26, sxts_user3).
- Speed Limit and Weather / Road Conditions / Curves: scroll + CONTINUE.
- **End of Lesson Quiz: Managing Your Speed**: "Instructions" + CONTINUE, then four Rise
  knowledge checks ("Knowledge check: Multiple choice"), revealed one below the other, each
  "Requires a correct answer to continue", with a CONTINUE after each. Options are radios; SUBMIT
  shows "Correct" or "Incorrect" + **TAKE AGAIN**. The question card covers TAKE AGAIN (mouse
  clicks are intercepted), so it is pressed directly; options are selected on the radio itself
  (a click by position missed on a question still sliding in). Answers in
  `tests/data/courses/v2/quiz-answers.js`. Lesson 01 passed end to end on dev 2026-10-26
  (sxts_user3), landing on "Introduction: Turning and Passing" at 14%.
- The quiz page ends with "Congratulations! Lesson Complete" + CONTINUE, which opens Lesson 02.
- **Choosing a Lane** (Lesson 02):
  labeled graphic (markers i and 1-4; "Complete the content above before moving on" until all are
  opened) → CONTINUE → CONTINUE → exercise instructions + CONTINUE → **sorting activity**: a pile
  of 9 cards ("Passing a slower-moving vehicle", ...) dragged into Lane 1 (Left) / Lane 2
  (Center) / Lane 3 (Right). A wrong lane does not take the card (drop it again elsewhere). When
  all are placed: "<n>/9 Cards Correct" + REPLAY, and CONTINUE shows whatever the score.
  Code: `RisePlayer.clickMarkers()`, `RisePlayer.sortCards()`, key `SORTING` in quiz-answers.js.
- **How to Pass**: scroll + CONTINUE. **Passing**: process block "Procedure to Pass" (START, steps
  1-6, a final ✓, ‹ › arrows); locked until the ✓ is reached, then CONTINUE. START is
  `block-process-card__start-btn`; the cards slide side by side, so Playwright calls the buttons
  "outside of the viewport" and `RisePlayer.stepThrough()` presses them directly (START + 6 × next).
- Lesson 02 passed end to end on dev 2026-10-27 (sxts_user3, two runs): markers (5) and the 9
  sorting cards on Choosing a Lane, the process on Passing, 5 flip cards on Turning in Specific
  Situations, and the quiz (**3 questions**, although its instructions say four). Ends on
  "Introduction: Right-of-Way" at 30%.
- Passing on the Right, Being Passed, Turning, Turning Left, To Make a Left Turn, Turning Right,
  To Make a Right Turn: scroll + CONTINUE (some need scrolling between CONTINUEs).
  **Turning in Specific Situations**: flip cards, all flipped before CONTINUE.
- **End of Lesson Quiz: Turning and Passing**: same layout as Lesson 01's quiz.
- Lesson 03, Introduction: Right-of-Way to Stop Signs at All Corners: scroll + CONTINUE.
  **Practice Right-of-Way**: scenario block. Intro card + CONTINUE; 3 scenes, each "Scenario <n>:
  Select who has the right-of-way in the scenario if you are the driver of the yellow vehicle."
  with numbered choice bubbles (1 the oncoming car, 2 you, 3 the pedestrian in scene 1; answer:
  the pedestrian). Wrong: "Incorrect: ..." + TRY AGAIN; right: CONTINUE to the next scene. Then
  "Scenario Complete!" + START OVER, and the page's CONTINUE. Code: `RisePlayer.answerScenario()`.
  Passed on dev 2026-10-27 (sxts_user3), from Introduction: Right-of-Way to "Turning" at 40%.
  The scene prompt as read starts with the picture's description ("A driver in a yellow vehicle
  at ..."), so the key uses that. Scene 3 ("vehicle to your right arriving at the same time")
  accepts "The car on your left has the right of way." (choice 1; v1 also had 1), while the
  lesson's quiz accepts "The vehicle to your right." for arriving at an all-way stop at the same
  time: check the content with the client.
- Turning (Lesson 03), Divided Highways, Mountain Roads: scroll + CONTINUE.
- **End of Lesson Quiz: Right-of-Way**: same layout as Lesson 01's, 3 questions. Lesson 03 passed
  end to end on dev 2026-10-27 (sxts_user3, two runs), ending on "Introduction: Alcohol and
  Drugs" at 45%.
- Lesson 04, Introduction: Alcohol and Drugs to Measuring BAC: scroll + several CONTINUEs per page.
- **Practice Measuring BAC**: instructions + CONTINUE, then knowledge checks like the quizzes,
  each with a BAC table image (drinks × body weight, M/F rows) above options such as "0.04%".
  Three questions (the same as v1's), all answered from the key on dev 2026-10-27, ending on
  "About Administrative Per Se" at 53%.
- About Administrative Per Se to Consequences of Driving with an Illegal BAC: scroll + CONTINUE.
  **Drivers Under 21**: 6 flip cards. Then End of Lesson Quiz: Alcohol and Drugs (3 questions).
  Lesson 04 passed end to end on dev 2026-10-27 (sxts_user3, two runs), ending on
  "Introduction: Protecting Yourself and Your Passengers" at 61%.
- Lesson 05: **Wearing Your Seat Belt**: 3 flip cards ("Select each image below to identify the
  correctly fitted seat belt"). Other pages up to Unattended Pets: scroll + CONTINUE.
  **Heat Related Dangers**: a stack of 5 flip cards shown one at a time ("4 of 5", ‹ › arrows),
  each side with its own audio player; CONTINUE shows only after **the audio of both sides of
  every card has played** (the only place so far where audio is required). Markup: region
  "Flashcard carousel" with "Go to previous/next slide" and a counter "<n> of 5"; the current card
  is a group named like the counter, with groups "Front of card" / "Back of card", each with an
  "Audio player" group (button "Play", "Pause" while playing). Rise's audio is not in the page as
  `<audio>` elements. Passed on dev 2026-10-27 (sxts_user3, 71% after it) with
  `RisePlayer.playCardStack()`: the block's own narration above the cards (0:18) to the end, then
  per card Play front → wait for the end, flip (real mouse click), Play back → wait, "Go to next
  slide" (real mouse click). 11 clips, about 1.5 min. Not passing before: all 10 card clips
  played with flip/next pressed from code and without the narration (twice). Which of the two
  changes unlocked it is not known; both are kept.
- Vehicle Loads: scroll + CONTINUE. End of Lesson Quiz: Protecting Yourself and Your Passengers:
  same layout as Lesson 01's, 3 questions. Lesson 05 passed end to end on dev 2026-10-27
  (sxts_user3, several runs), ending on "Introduction: Law Enforcement Stops" at 74%.
- Lesson 06: Introduction, Law Enforcement Stops: scroll + CONTINUE. **What to Do**: step block
  like Passing's ("Step 5 / Roll your Windows Down", ‹ ›, pagination › 1-7), but CONTINUE shows
  only after **each step's audio** has played (user). Markup: region "Carousel" with "Go to slide
  Introduction / 1-7", "Go to previous/next slide", slides as groups "1 of 8" ... "8 of 8" (the
  hidden ones are hidden from assistive technology), each with an "Audio player"; START on the
  introduction. Listed in `AUDIO_LESSONS` (outline.js): `stepThrough({ playAudio })` plays the
  audio of the slide on screen to the end before each next: 8 clips, about 2 min.
  The slide groups "<n> of <total>" were first taken for a card stack's counter: playCardStack()
  now looks only inside a "Flashcard carousel" region.
- Know Your Rights, Providing identification (7 CONTINUEs), A Promise to Appeear (sidebar
  spelling): scroll + CONTINUE. End of Lesson Quiz: Law Enforcement Stops: same layout as Lesson
  01's, 3 questions. Lesson 06 passed end to end on dev 2026-10-27 (sxts_user3, two runs),
  ending on "Introduction: Signs" at 83%.
- Lesson 07, Introduction: Signs to White Regulatory Signs: scroll + CONTINUE. **Practice
  Identifying Regulatory Signs**: scenario block like Practice Right-of-Way. Intro "Let's practice
  identifying regulatory signs. Match each regulatory sign ... you must answer each exercise
  correctly to proceed." + CONTINUE; scenes "Identify the Regulatory Sign" with a sign in the
  picture and numbered choices (first scene: WRONG WAY sign; 1 Stop Sign, 2 Wrong Way, 3 U Turn
  Prohibited).
- About Warning Signs, Railroad Crossings, School Zones, Warning Signs: scroll + CONTINUE.
  **Practice Identifying Warning Signs**: the same kind of scenario block (e.g. a two-way traffic
  sign: "Two Way Traffic" → "Great job! You are correct." + CONTINUE).
- End of Lesson Quiz; Signs (sidebar spelling): same layout as Lesson 01's.
- **Practice Identifying Regulatory Signs** (4 scenes) / **Warning Signs** (6 scenes): every
  scene's prompt reads the same ("Identify the Regulatory Sign by selecting the correct
  description."), so their key entries list the answers in scene order.
- **Conclusion** (End of Course): reached by the quiz's CONTINUE, at **99%**. "Congratulations!
  You have successfully completed all the lessons ..." + CONTINUE; below it COMPLETE SURVEY (never
  pressed by the tests) and EXIT ("Your results and completion status will be updated once this
  window is closed"). The test presses CONTINUE until EXIT shows (`continueToExit()`), checks
  100%, logs the SCORM status, presses EXIT (`finishCourse()`), then Exit activity.
  On sxts_user3 (2026-10-27) only Exit activity was clicked on Conclusion (no EXIT), and Moodle
  still recorded the course as completed.
- **SCORM**: the v2 package is **SCORM 2004** (`window.API_1484_11`; v1 was 1.2). On Conclusion
  `cmi.completion_status` = "completed", `cmi.success_status` = "unknown". After EXIT the session
  is terminated: reads return "" with error 123.
- **Full run**: the whole course in one run on dev 2026-10-27 (sxts_user4, fresh): 14.1 min, cover
  page START COURSE → Conclusion EXIT → My courses "100% complete". All answers right first time
  except the Signs quiz's yield-sign question (key too short; fixed).
- **Completed course**: the course page has no language cards, only "The language course is
  completed. Please go through these completed courses link" (`/theme/mvlearn/completed.php?id=2`);
  My courses: "Course progress: 100% complete". V2-E2E1 checks this and stops when it starts on a
  completed account (passed, sxts_user3).
- Lesson 07 passed end to end on dev 2026-10-27 (sxts_user3). **The whole v2 course has been
  played through by the tests on sxts_user3** (lesson by lesson, 2026-10-26/27).
- Position: the test reads "Lesson <n> of 80" from the header (`RisePlayer.lessonPosition()`),
  since titles repeat ("Turning" in Lessons 02 and 03).
- Later lessons are locked: a disabled sidebar link with "This lesson is currently unavailable /
  Lessons must be completed in order". Each lesson's header shows "Lesson <n> of 80".
- Code: `tests/pages/user/RisePlayer.js` (`advance()` = scroll to the end + first visible
  CONTINUE), test `V2-E2E1` in `tests/user/e2e/course-v2.spec.js`, lesson order in
  `tests/data/courses/v2/outline.js`. Not yet run: the frame lookup, the `#/lessons/<id>` route
  and the sidebar title (link to the current route) are Rise defaults, not checked on dev.

## To find out
- Whether markers / other blocks must be opened before CONTINUE becomes usable.
- Knowledge checks: layout, Submit, correct / incorrect feedback, retry.
- Interactive blocks replacing v1's practice slides (lanes, right-of-way, signs, enforcement stop).
- End of a lesson: how to move to the next one, what "complete" looks like.
- Relaunch: resume prompt or straight back to the last place; when the cover page shows.
