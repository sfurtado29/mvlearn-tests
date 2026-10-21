# MVLearn regression test plan

Regression answers one question: **did a change break anything that used to work?**

It runs after smoke tests pass and before performance testing:

```
Smoke (~3 min) → Regression (~20 min, +45 min full SCORM) → k6 performance
"is it alive?"   "does everything still work?"              "is it fast and stable under load?"
```

- **Target:** dev (`dev-mvlearn.verificient.com`) for now. Staging is supported through `tests/data/site.js`.
- **Tool:** Playwright (JavaScript). Tests live in `tests/regression/`.
- **Implementation prompts:** `docs/regression-prompts.md` (P4, P5 and P6).
- **SCORM player facts:** `docs/scorm-notes.md`.

---

## A. Login & session (main account, read-only)

| ID | Test |
|---|---|
| RA1 | Empty username/password does not log you in |
| RA2 | An unknown username shows the generic error |
| RA3 | Opening a deep link while logged out → login → back to that page |
| RA4 | A logged-in user opening the login page sees "already logged in" |
| RA5 | After logout, browser Back does not show private pages |
| RA6 | Lost session (cookies cleared) → sent to login |
| RA7 | "Forgotten password" page loads (never submitted) |
| RA8 | The same user logged in from two browsers at once |

**Why it's needed:**
- Login is the front door. If it breaks, nobody can learn.
- RA5 and RA6 cover basic security.
- RA8 also matters for performance testing. If Moodle kicks out the earlier session when the same user logs in again, k6 virtual users cannot share accounts.

## B. Dashboard (main account, read-only)

- Timeline: date filter, sort, search.
- Calendar: next/previous month, full calendar page, import/export page.
- Side panel (block drawer) opens, closes, and stays that way after a reload.
- "Recently accessed items" is skipped on dev, because that block doesn't exist there.

**Why it's needed:** the Dashboard is the first page a learner sees after login. Moodle updates and theme changes often break these widgets without anyone noticing.

## C. My courses (main account, read-only)

- Course card and its progress label.
- Filters: All, In progress, Future, Past, and so on.
- Sort and view modes: card, list, summary.
- Search: a match and a no-match case.

**Why it's needed:** this is how learners find their course. If the course disappears from a filter or from search, learners think they have lost access.

## D. Header & user area (main account, read-only)

- Notifications popover and the "See all" page (nothing is marked as read).
- Messaging drawer sections and search.
- Pages in the user menu: Profile, Grades, Calendar, Private files, Reports, Preferences.
- The Grades overview lists the course and opens the course grade report.

**Why it's needed:** the header is on every screen. Grades is where a learner sees their result.

## E. Course page (main account, read-only)

- The course loads with its sections.
- "Begin Course (English)" points to the right SCORM activity. It is never clicked here.
- Completion information is shown.
- The breadcrumb leads back to My courses.
- A wrong course id shows a clean error page.

**Why it's needed:** the course page is the way into the lesson. A wrong link sends learners into the wrong language version, or nowhere.

## F. SCORM lesson, repeatable (main account; never takes the quiz)

| ID | Test |
|---|---|
| RF1 | Player opens and the first slide shows (formerly smoke S13) |
| RF2 | Progress is saved to Moodle (`datamodel.php` returns 200; `lesson_status` is set) |
| RF3 | next/previous work; next stays locked until the slide finishes |
| RF4 | "Exit" and "Exit activity" return to the course |
| RF5 | **Resume returns to the same slide** |
| RF6 | Closing the tab suddenly does not lose progress |
| RF7 | **Later slides and sections are locked** |
| RF9 | Visited slides show a ✓ in the menu |
| RF10 | The Transcript tab shows text |
| RF11 | No errors and no failed saves while the lesson plays |

**Why it's needed:** this is the actual product. People renew their driver's licence by completing these lessons.
- If Resume breaks, learners lose their place and complain.
- If the locks break, learners can skip required content. That is a compliance and legal risk.
- If saves fail, progress is lost silently. Nobody sees it until a learner complains.

Safety rules:
- Every test starts with **Restart**. Restart resets the lesson position and the menu locks.
- Every test moves only a few slides and never opens the quiz.
- A drift guard stops the run if the account gets close to the quiz.

## S. Session timeout (main account)

The session is lost mid-lesson → the learner is sent to login → after logging in again, Resume brings back the saved progress.

**Why it's needed:** learners spend 20–40 minutes in a lesson. Losing a session must never mean losing progress.

## G. SCORM full (fresh account; slow; run before releases)

| ID | Test |
|---|---|
| RG1 | Wrong answer → **Try Again** → the same question again |
| RG2 | Wrong answer → **Continue** → sent back to the review slide |
| RG3 | All answers correct → "The lesson on Managing Your Speed is complete" |
| RG4 | Section 2 unlocks and stays unlocked after relaunch; Moodle progress and Grades update |
| RG5 | Section 2 drag and drop: wrong lane → Try Again; correct lane → "Correct!" |
| RG6 | Whole course, all 7 sections (manual or rare runs only) |

**Why it's needed:** this proves a learner can actually **finish** a lesson and that the course records it. If completion breaks, nobody can renew their licence. That is the most serious possible failure, and only these tests reach that far.

Notes:
- **Answer key:** `tests/data/quiz-answers.js`. Q1 ("Basic speed law says…") → B. The rest is filled in manually, or by discovery mode (`QUIZ_DISCOVER=1`).
- **Account:** only one fresh account is available. Still to be verified: whether Restart makes this group repeatable on that account. The fallback is an admin deleting the user's SCORM attempts after each run.

---

## How and when it runs

| Command | Groups | Time | When |
|---|---|---|---|
| `npm run test:smoke` | Smoke S1–S12 | ~3 min | Every deploy |
| `npm run test:regression` | A–F + S | ~20 min | Every deploy, after smoke passes |
| `npm run test:scorm-full` | G | ~45 min | Before releases |

Each run produces an HTML report (`npx playwright show-report`) with screenshots, video and traces for every failure. Reports can contain typed credentials, so do not share them outside the team.

## Flakiness

A flaky test sometimes passes and sometimes fails when nothing has changed.

| Group | Flake check |
|---|---|
| A–E | `--repeat-each=3` |
| F + S | `--repeat-each=2`, one worker. Slides play in real time, so waiting for next is the main risk |
| G | Not repeated, because each run consumes account progress. Watched across real runs instead |

Planned (P7, optional):
- a `test:flaky` script,
- retries that mark tests as "flaky" instead of passing them silently,
- a `@quarantine` tag for unstable tests until they are fixed.

## Why automate regression

- **Changes break things quietly:** Moodle upgrades, plugins, themes, server settings, a new SCORM package.
- **Manual regression is slow.** About 45 checks plus real-time lessons take hours per build. Automated, they take about 20 minutes.
- **People skip steps.** Repetitive manual runs miss checks like "lesson 2 still locked" or "resume lands on the same slide".
- **It sees what a person can't:** progress saves reaching Moodle, hidden script errors, two sessions at once.
- **It gates performance testing.** k6 should only run on a build already proven to work for one user.
- Manual testing stays for new features, content quality (text, audio, visuals) and full-course runs.

## Status

| Step | Status |
|---|---|
| P1–P2 Foundation + smoke S1–S12 | ✅ Done |
| P3 SCORM building blocks + spike (`docs/scorm-notes.md`) | ✅ Done |
| P4 Groups A–E | ⏳ Prompt ready |
| P5 Group F + S | ⏳ Prompt ready |
| P6 Group G | ⏳ Prompt to be updated for a single fresh account |
| P7 Flake hardening | Optional |
