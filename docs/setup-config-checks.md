# MVLearn setup and configuration: learner view

**Purpose:** list everything a learner sees in their user area, and split it into:
- **Part A: belongs to a learner.** Tested automatically on every regression run.
- **Part B: needs a team decision.** It may not belong in a learner's view. Not tested as "should be there" until the team decides.

**Checked on:** dev ("XTS SH") and staging ("XTS User"), 2026-10-09. Both sites behave the same. Read-only: pages were opened, no form was submitted.

## Part A: belongs to a learner (tested)

| Area | Item | What the test checks | Test |
|---|---|---|---|
| User menu | Profile | Opens the profile page | RD3 |
| User menu | Grades | Opens "Courses I am taking" | RD3 |
| User menu | Calendar | Opens the calendar | RD3 |
| User menu | Preferences | Opens the Preferences page | RD3 |
| User menu | Log out | Logs out | Smoke S7, RA5 |
| Preferences | Edit profile | Opens the profile form (First name field shown) | RH1 |
| Preferences | Change password | Opens the form (Current password field shown) | RH1 |
| Preferences | Preferred language | Opens "Preferred language" | RH1 |
| Preferences | Calendar preferences | Opens "Calendar preferences" | RH1 |
| Preferences | Message preferences | Opens "Message preferences" | RH1 |
| Preferences | Notification preferences | Opens "Notification preferences" | RH1 |
| Course tabs | Course | Leads to the course page | RH2 |
| Course tabs | Grades | Leads to the course grade report | RH2 |
| Grade report | English, Spanish, Chinese items and Course total; columns Grade item, Grade, Range, Percentage | All shown; English links to the English SCORM activity | RH3 |
| Grades overview | Lists the course; opens its grade report | | RD4 |

Forms are never submitted. Grade values are not checked, because they change as the lesson is played.

## Part B: needs a team decision (not tested yet)

| # | Area | Item | What a learner sees today | Why it may not belong | If it should go |
|---|---|---|---|---|---|
| 1 | User menu | **Reports** | "Custom reports", currently "Nothing to display", filed under Administration | Admin-style tool; a report shared too widely would expose data to every learner | Remove `moodle/reportbuilder:view` from the Authenticated user role |
| 2 | User menu | **Private files** | Personal file storage (Add, Create folder) | The course has no file uploads | Remove `moodle/user:manageownfiles` from the Authenticated user role |
| 3 | Course tabs | **Participants** | List of everyone enrolled: **29 participants** on dev | **Privacy:** learners can see who else is renewing their licence | Remove `moodle/course:viewparticipants` from the Student role |
| 4 | Course tabs | **Competencies** | "Course competencies" page | The course does not use competencies | Disable competencies (Site administration → Advanced features) |
| 5 | Preferences | **Blogs:** Blog preferences, External blogs, Register an external blog | Blog settings; a learner can link an outside blog into the site | Not part of the course; external blogs bring outside content in | Disable blogs (Advanced features → Enable blogs) |
| 6 | Preferences | **Badges:** Manage badges, Badge preferences, Backpack settings | Badge pages | Only useful if the course awards badges | Disable badges (Advanced features → Enable badges) |
| 7 | Preferences | **Forum preferences** | Forum settings | The course has no forums | Usually left on; low priority |
| 8 | Preferences | **Editor preferences** | Text editor choice | Learners don't write content in this course | Usually left on; low priority |
| 9 | Preferences | **Content bank preferences** | Content bank settings | A content-authoring tool for teachers | Remove content bank capabilities from the Authenticated user role |
| 10 | Notification preferences | Assignment and Feedback notification settings | Settings for activity types the course does not use | Clutter, harmless | Low priority |
| 11 | Grade report | **Weighting:** English 100 %, Spanish 0 % (Empty), Chinese 0 % (Empty) on staging | A learner who completes the Spanish or Chinese version gets 0 towards the course total | May be a grading mistake | Confirm with the course owner how completion in each language should count |
| 12 | Preferences | **Change password** | Form with Current/New password | The staging login page also offers "CA DMV ST Login". If learners sign in through that, a Moodle password may not apply | Confirm which login learners use |
| 13 | Dashboard | **"Edit mode" switch and "Customise this page"** | Learners can add, move and remove blocks on their own Dashboard | A learner can remove Timeline or Calendar and miss deadlines; Dashboards drift from the standard layout. On 9 Oct 2026 the staging test account's Calendar block was moved this way and broke a test until it was reset | Remove `moodle/my:manageblocks` from the Authenticated user role |

**Once the team decides:**
- **Kept** items move to Part A and get a test that they are present and work.
- **Removed** items get a test that they are **absent**, so they cannot quietly come back.

## Related findings
- Error pages show debug info and PHP stack traces on dev **and staging**: `docs/regression-results.md`, Finding 2.
- Intermittent login problem ("Invalid login" on dev, "Your session has timed out" on staging) with the correct password: `docs/regression-results.md`, Finding 1.

## Decisions requested
For each item in Part B, please answer **keep** or **remove**, and who owns the change (site admin or course owner).
