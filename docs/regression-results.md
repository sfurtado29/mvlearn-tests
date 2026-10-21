# MVLearn regression tests: status and results

**Environment:** dev (`https://dev-mvlearn.verificient.com`)
**Test account:** main APP account (shown in Moodle as "XTS SH")
**Tool:** Playwright (JavaScript). Tests are in `tests/regression/`; the plan is `docs/regression-plan.md`.
**Runs:** 2026-10-06 to 2026-10-09
**Run logs:** every run since 2026-10-09 has a timestamped log in `test-logs/<date_time>/` (`run.log`, `results.json`, failure screenshots and videos). Kept forever; not committed to git.

## Summary

| Group | Area | Tests | Result |
|---|---|---|---|
| A | Login & session | 8 | 8 passed |
| B | Dashboard | 6 | 6 passed |
| C | My courses | 4 | 4 passed |
| D | Header & user area | 10 | 9 passed, 1 skipped (no language menu on dev) |
| E | Course page | 5 | 4 passed, 1 known failure (stack trace on error page) |
| **Total** | | **33** | **31 passed, 1 skipped, 1 known failure** |

- **Flake check:** the whole suite was run 3 times in a row (`--repeat-each=3`).
  - Last full run: 96 passed, 1 failed, 3 skipped. The failure was dev rejecting the correct password, see Finding 1.
  - After a fix to RA3, the login tests passed 25 of 25 over 3 repeats.
  - 2026-10-09: the four tests that log in with the real account (RA3, RA5, RA6, RA8) ran 15 times each: 61 of 61 passed, with no rejected logins.
- **Final runs on 2026-10-09:**
  - `npm run test:regression`, started 14:31:04 IST: 32 passed, 1 known failure (RE4b), 1 skipped (RD5). Log: `test-logs/2026-10-09_14-31-04/run.log`.
  - `npm run test:smoke`, started 14:19:33 IST: 13 of 13 passed. Log: `test-logs/2026-10-09_14-19-33/run.log`.
- **Staging, 2026-10-09** (`npm run staging:smoke` / `npm run staging:regression`):
  - Smoke: 13 of 13 passed after S1 learned staging's page title ("Home | STMV").
  - Regression, started 16:13:58 IST: 32 passed, 1 known failure (RE4b, stack traces), 1 skipped (RD5). Log: `test-logs/2026-10-09_16-13-58/run.log`.
  - Fixed for staging: the site short name (page title, logo link) now comes from `tests/data/site.js`. RE1 accepts both "Begin Course (English)" and "Continue (English)", because the label depends on the account's progress.
- **Not started:** groups F, S and G (SCORM lesson tests, session timeout, quiz/completion). These are prompts P5 and P6.


## Results per test

### A. Login & session (`auth.spec.js`)
Each test uses its own fresh browser, so the shared login session is never logged out.
Negative tests only use made-up usernames.

| ID | What it checks | Result |
|---|---|---|
| RA1 | Empty username and password does not log you in; `/my/` still sends you to login | Passed |
| RA2 | An unknown username shows "Invalid login, please try again" | Passed |
| RA3 | Opening `/my/courses.php` or the course page while logged out → login → back on that page | Passed |
| RA4 | A logged-in user opening the login page sees "You are already logged in…"; Cancel returns to the Dashboard | Passed |
| RA5 | After logout, browser Back + reload does not show private pages | Passed |
| RA6 | Session lost (cookies cleared) → sent to the login page | Passed |
| RA7 | "Lost password?" page loads with its username and email fields (never submitted) | Passed |
| RA8 | The same user logged in from two browsers at once: both sessions stay valid | Passed |

RA8 matters for performance testing: Moodle does **not** end the first session when the same user logs in again, so k6 virtual users can share an account.

### B. Dashboard (`dashboard.spec.js`)
These tests change saved user settings. Each one records the starting value and restores it afterwards. They run one after another.

| ID | What it checks | Result |
|---|---|---|
| RB1 | Timeline date filter: All, Overdue, Next 7 days, Next 30 days, Next 3 months, Next 6 months. The label updates and the list or "No activities require action" shows. | Passed |
| RB2 | Timeline sort: by dates and by courses | Passed |
| RB3 | Timeline search: a nonsense search shows "No activities require action"; clearing it restores the list | Passed |
| RB4 | Calendar block: next and previous month; "Full calendar" page; "Import or export calendars" page | Passed |
| RB5 | "Recently accessed items" is shown | Passed |
| RB6 | The side panel (block drawer) stays open or closed after a page reload | Passed |

RB5: the plan expected this block to be missing on dev. It exists, inside the side panel, so it is tested.

### C. My courses (`mycourses.spec.js`)
These tests also change saved settings (filter, sort, view) and restore them.

| ID | What it checks | Result |
|---|---|---|
| RC1 | The course card links to the course and shows a progress label in the form "N% complete" | Passed |
| RC2 | Every filter (All, In progress, Future, Past, Starred, Removed from view) shows the course or the empty state | Passed |
| RC3 | Both sort options and all three views (Card, List, Summary) show the course | Passed |
| RC4 | Search: part of the course name finds it; a nonsense search finds nothing | Passed |

### D. Header & user area (`header.spec.js`)
Read-only: nothing is marked as read, sent or saved.

| ID | What it checks | Result |
|---|---|---|
| RD1 | Notifications popover opens; "See all" page and "Notification preferences" page load | Passed |
| RD2 | Messaging drawer: Starred, Group and Private sections; search opens; drawer closes | Passed |
| RD3 | User menu → Profile page loads | Passed |
| RD3 | User menu → Grades page loads | Passed |
| RD3 | User menu → Calendar page loads | Passed |
| RD3 | User menu → Private files page loads | Passed |
| RD3 | User menu → Reports page loads | Passed |
| RD3 | User menu → Preferences page loads | Passed |
| RD4 | Grades overview lists the course; clicking it opens the course grade report | Passed |
| RD5 | Language menu: switch and switch back | Skipped: dev has only one language |

### E. Course page (`course.spec.js`)
The "Begin Course (English)" link is never clicked here, because that would start the lesson.

| ID | What it checks | Result |
|---|---|---|
| RE1 | Course title, language cards, and the English link pointing to the right SCORM activity | Passed |
| RE2 | The English card shows a progress bar in the form "N% complete" | Passed |
| RE3 | From the course page back to My courses (via the logo; this page has no breadcrumb) | Passed |
| RE4 | A wrong course id shows Moodle's error page (HTTP 404, message, Continue button) | Passed |
| RE4b | The error page shows no PHP stack trace | **Known failure**, see Finding 2 |

RE4b is marked as an expected failure, so it does not turn the run red. When debug display is switched off, it will report "unexpectedly passed" and the marker can be removed.

## Findings

### 1. Correct password sometimes rejected (suspected bug)
- **What:** dev sometimes answers "Invalid login, please try again" to the **correct** password of the test account.
- **How often:**
  - 2026-10-08: about 5 times (3 confirmed by page snapshot) in roughly 100–120 logins. The screenshots from those runs were overwritten by later runs.
  - 2026-10-09: not reproduced, 0 in about 129 logins (runs started 12:42, 12:46 and 12:52 IST).
  - It is intermittent; the difference between the two days is unexplained.
  - **Staging, 2026-10-09 16:01 IST (RA5):** with the correct password, staging answered **"Your session has timed out. Please log in again."** right after the login page had loaded. Moodle shows this when the session behind the login form is gone by the time the form is submitted. This supports the "session lost between loading the page and logging in" cause, and shows staging is affected too. Screenshot and video: `test-logs/2026-10-09_16-00-49/artifacts/013-*`.
- **Ruled out:**
  - Simultaneous logins: 6 logins at the same moment all succeeded.
  - A wrong password: the same password works most of the time.
  - Account lockout: Moodle would show a different message.
- **Possible causes, to be confirmed:**
  - The login page's security token does not match the session. This can happen with several web servers behind a load balancer without shared sessions, or with a session store losing data.
  - An external login plugin (the site has SAML2) that sometimes fails.
  - A firewall or rate limiter.
  - Server slowness: logins took anywhere from under 2 s to 21 s.
- **Requested check:** an admin looks at Moodle logs (Site administration → Reports → Logs) for "User login failed" events on this account at the run times. Also confirm the server setup: number of web servers and the session store.
- **Test behaviour:** tests never retry a login, because each rejection counts as a failed login on the real account. They fail with a clear message instead.

### 2. Debug info and PHP stack traces on error pages (dev and staging)
- **Steps:** open `/course/view.php?id=999999`.
- **Actual:** the page shows "Debug info" (the SQL query) and "Stack trace" (server file paths and line numbers).
- **Expected:** only the error message and a Continue button.
- **Also present on staging** (reported by the team on 2026-10-08).
- **Risk:** information disclosure, a common security misconfiguration.
  - Anyone, even logged out, can trigger it and see internal paths, database queries and the Moodle version.
  - If production has the same setting, severity is high.
- **Fix:** Site administration → Development → Debugging → "Display debug messages" = No.

### 3. Test account may have more than learner rights (test setup)
- **What we saw:**
  - "XTS SH" sees "Edit mode" and "Customise this page" on the Dashboard.
  - Its user menu "Reports" item opens Administration → Custom reports.
- **Why it matters:** the regression tests are meant to see what a learner sees. With extra rights, tests could pass where a learner would be blocked, or see extra controls.
- **Request:** confirm the account's roles, or provide a plain learner account for automated tests.

## Issues fixed in the tests during these runs

| Problem | Fix |
|---|---|
| Login checks ran 5 s after clicking "Log in", but dev logins can take up to 21 s | Wait until the browser leaves the login page (up to 45 s) |
| RB6 reloaded the page before the side-panel setting was saved | Wait for the save request before reloading |
| The Timeline keeps a hidden copy of the empty-state text | Check visible text only |
| Messaging section names include counts ("Private 0 total conversations") | Match the start of the name |
| RA3's second login reused a browser after clearing its cookies | Use a fresh browser for the second step |
| RA6: after clearing cookies, Moodle's scripts interrupted the next page load | Leave the Moodle page before clearing cookies |

## Next steps
1. Add tests for the Preferences page links (read-only: each link opens its page, nothing is saved).
2. Login issue (Finding 1): an admin checks Moodle's logs for "User login failed" on this account on 7–8 Oct 2026 (IST), and the server team says whether anything changed on dev since. The tests save a screenshot, video and timestamp automatically if it happens again.
3. P5: SCORM lesson tests (group F) and session timeout (group S).
4. P6: quiz, completion and drag-and-drop (group G).
