# Load test: browser probes and baselines

A **probe** is one real browser, one account, playing the **full course** (all 7 sections) like a
learner and timing every step. Baselines run probes with no other load; the hybrid load test later
runs the same probes next to k6 virtual users and compares the two.

Plan (agreed 2026-10-14): baseline-1, then baseline-10 (dev, browsers only); later the hybrid load
test with 100 learners = 20 browser probes (20%) + 80 k6 users.

## Course v1 and v2

Dev and staging now run the client's **v2** package (Articulate Rise, SCORM 2004; staging since
2026-10-27); v1 was Storyline, SCORM 1.2. The site's version is `courseVersion` in
`tests/data/site.js` (or `COURSE_VERSION`), and the load test follows it:

| | v1 (Storyline) | v2 (Rise) |
|---|---|---|
| Browser probe | `tests/user/load/probe.spec.js` | `tests/user/load/probe-v2.spec.js` (the other one skips) |
| Probe accounts | reused: every run chooses **Restart** | **one run per account**: Rise has no Restart and a completed course cannot be launched again, so every run needs fresh `LOAD_PROBE_POOL` accounts (the probe fails at once on a used one) |
| Resume check | after the course: relaunch → "End" | after Lesson 01: Exit activity → relaunch → "Introduction: Turning and Passing" |
| Full course, 1 probe | ~32 min | ~15 min (dev, no load) |
| k6 saves | SCORM 1.2 elements (`cmi.core.lesson_status`, …) | SCORM 2004 elements (`cmi.completion_status`, `cmi.exit`, `cmi.session_time` "PT60S", `cmi.suspend_data`) |

Everything else (runners, results, summary, hybrid run) is the same. The v2 course itself is
described in docs/scorm-notes-v2.md.

## Setup (.env)

```
LOAD_PROBE_POOL="probe1:pass1;probe2:pass2;..."   # accounts used for nothing else
LOAD_PROBES=                                     # optional: run only the first N
LOAD_ALLOW_HOST=dev-mvlearn.verificient.com      # probes refuse non-staging hosts otherwise
```

- v1: every probe chooses **Restart** in the course, so accounts can be reused run after run.
  v2: **fresh accounts for every run** (see above). They must not be the APP account or SCORM_POOL
  accounts.
- Quote the whole value if a password contains `#`.

## Run

PowerShell, from the project folder:

```
$env:LOAD_PROBES='1';  $env:LOAD_STEP='baseline-1';  npm run load:probe
$env:LOAD_PROBES='10'; $env:LOAD_STEP='baseline-10'; npm run load:probe
```

- `LOAD_PROBES` = how many browsers (and parallel workers).
- `LOAD_STEP` = label stored in the results (baseline-1, baseline-10, hybrid-100, …).
- `LOAD_RUN_ID` = results folder name (default: date-time + label).
- `LOAD_BASELINE=<run id>` = compare against an earlier run in the summary.
- A full-course probe takes about 32 minutes.

Probes never run with `npm test`, `test:smoke`, `test:regression` or `test:scorm-full`: the user
project ignores `tests/user/load/` unless `LOAD_PROBE_RUN=1`, which only `npm run load:probe` sets.

## Results

`test-logs/load/<run id>/`:

| File | Content |
|---|---|
| `probe-<user>.json` | One per probe: passed/failed + error, every step timing (ms, start, end), every SCORM save (response time, status), HTTP errors ≥ 400, console and page errors, checks (lesson_status, resumedAt). Written even when the journey fails. |
| `machine.json` | This PC: CPU % and used RAM every 5 s, average/max CPU, RAM per browser. |
| `summary.md` / `summary.json` | Per step: count, p50, p95, max; completion, save and resume success rates; error counts; comparison with the baseline if given. |

Re-summarise any run: `npm run load:summary -- test-logs/load/<run> [--baseline test-logs/load/<other run>]`.

### What is timed

| Step | From → to |
|---|---|
| login | open login page → Dashboard |
| open_course | My courses → course page shown |
| launch | click English → first slide shown (v1: includes choosing Restart; v2: START COURSE on the cover) |
| section_1 … section_7 | time to complete each section (v2: each lesson, up to the end of its quiz) |
| slide | v1: each slide change (mostly narration time) |
| practice | v1: each practice slide (drag-and-drop, picture/choice questions, tiles) |
| begin_quiz | v1: BEGIN QUIZ → first question shown |
| quiz_answer | v1: click an answer → "Correct" shown |
| page | v2: each lesson page, first block → next page open (includes required audio: Heat Related Dangers ~1.5 min, What to Do ~2 min) |
| save | server response time of every POST /mod/scorm/datamodel.php |
| wait_save | v1: after the course, wait for the next progress save |
| finish | v2: Conclusion page CONTINUE → EXIT |
| exit | Exit activity → course page |
| resume | relaunch → resumed page shown (v1: must be "End"; v2: must be Lesson 02's first page) |
| logout | Log out → logged out |
| journey | whole run |

## k6 (server load) and the hybrid run

`k6/learner.js` sends the requests a learner's browser sends, without running the course:
login page → login (POST, then Moodle's `testsession` redirect) → Dashboard → My courses → course
page → SCORM player (`view.php` → `player.php`, which embeds the SCORM data) → `loadSCO.php` → a
progress save (POST `datamodel.php`) every 60 s for 10 minutes → logout, then again with a fresh
login. Each request type is timed separately (`login_page`, `login_submit`, `dashboard`,
`my_courses`, `course_page`, `player`, `load_sco`, `save`, `logout`).

**Status (2026-10-15):** first run on dev, 1 VU for 5 min: Login, Player and Saves 100% OK, saves
0.28 s (same as the browser's). The saved filler data was confirmed in the account's SCORM data.
k6 does not download the course's media/HTML files (the browser probes do).

### Accounts (.env)

```
LOAD_K6_POOL="k6user1:pass1;k6user2:pass2;..."   # one per VU ideally
```

For big pools, put the accounts in a file instead (it replaces `LOAD_K6_POOL`):
```
LOAD_K6_POOL_FILE=secrets/k6-accounts.csv
```
One account per line: `username,password` in a `.csv` (a `username,password` header line is
skipped), otherwise `username:password`; blank lines and `#` lines are ignored; no `;` in a
password. `/secrets/` is git-ignored. k6 reads the file itself (a thousand accounts in one
environment variable come near Windows' ~32k-character limit), and VU n uses line n, so a 50-user
run uses the first 50 accounts. Every account must exist on the site and be enrolled in the course;
one that is not (or that gets a first-login page) shows up as a lower "Login OK" rate.

Separate from `LOAD_PROBE_POOL`, `SCORM_POOL` and the APP account (the runner refuses overlaps):
k6 overwrites their SCORM progress with filler, so a browser would not resume them sensibly.
The saves use the SCORM version of the site's course (`SCORM_VERSION` in
`tests/data/courses/<v>/outline.js`, passed to k6 as `LEARNER_SCORM_VERSION`); `k6-summary.md` shows
which. The 2004 element names were taken from Moodle's `mod/scorm/datamodels/scorm_13.js` on dev
(2026-10-27). **First v2 run, staging 2026-10-27** (1 VU, 5 min, sxts_user7): login, player, saves
(5) and sessions 100% OK; saves 0.47 s median, every request type under 1 s. Not yet checked: the
filler in the k6 account's SCORM data (Moodle answered "true" to every save).

### Commands (PowerShell)

k6 alone (e.g. the server-side view at 1 and 10 users):
```
$env:LOAD_K6_VUS='1';  $env:LOAD_STEP='k6-1';  $env:LOAD_K6_DURATION='15m'; npm run load:k6
$env:LOAD_K6_VUS='10'; $env:LOAD_STEP='k6-10'; $env:LOAD_K6_DURATION='15m'; npm run load:k6
```

Hybrid (k6 + browser probes at the same time, one results folder):
```
$env:LOAD_K6_VUS='1';  $env:LOAD_PROBES='1';  $env:LOAD_STEP='hybrid-2';  $env:LOAD_BASELINE='baseline-1_run1';  npm run load:hybrid
$env:LOAD_K6_VUS='10'; $env:LOAD_PROBES='10'; $env:LOAD_STEP='hybrid-20'; $env:LOAD_BASELINE='baseline-10_run1'; npm run load:hybrid
# later, the agreed load test (100 learners, 20% browsers):
$env:LOAD_K6_VUS='80'; $env:LOAD_PROBES='20'; $env:LOAD_STEP='hybrid-100'; $env:LOAD_BASELINE='<20-probe baseline>'; npm run load:hybrid
```

In a hybrid run **each k6 user logs in once and stays for exactly as long as the browsers run**:

```
k6:       log in ──── a save every minute ─────────────────── log out, stop
browser:        start (after 120 s) ── full course ~31 min ── done
```

The hybrid runner serves a tiny stop flag on `127.0.0.1` (only this machine). k6 users check it
every 5 s; when the browsers finish it turns to "stop", they log out and k6 ends. If the runner
dies, the flag disappears and k6 stops too; `LOAD_K6_MAX_DURATION` (90m) is a last safety limit.
k6 users log in spread over `LOAD_K6_RAMP`, and the browsers start after `LOAD_HYBRID_WARMUP_S`, so
all k6 users are already logged in and saving when the browsers start.

| Variable | Meaning | Default |
|---|---|---|
| `LOAD_K6_VUS` | k6 virtual users | 1 |
| `LOAD_K6_RAMP` | time over which the k6 users log in | 1m |
| `LOAD_HYBRID_WARMUP_S` | delay before the browsers start | 120 |
| `LOAD_K6_MAX_DURATION` | safety limit for k6 in a hybrid run | 90m |
| `LOAD_K6_DURATION` | k6 alone only: time at full load after the ramp | 40m |
| `LOAD_K6_SESSION_MINUTES` | k6 alone only: minutes per session (sessions repeat) | 10 |

Results in `test-logs/load/<run id>/`: the probe files (as above) plus `k6-summary.md` /
`k6-summary.json`: per request type count, median, p95, max, time to first byte, error rate; overall
requests per second; Login / Player / Saves / Sessions OK rates.

### Capacity steps and stress (pure HTTP)

Both use the same k6 learner (login → My courses → course → player → a save every minute →
logout); only the number of users over time changes. "Pure HTTP finds the limits, hybrid confirms
that learners can still finish the course within them."

**Capacity steps**: hold each level in turn, to find where response times start rising:
```
$env:LOAD_K6_LEVELS='10,25,50,100'; $env:LOAD_K6_LEVEL_HOLD='5m'; npm run load:capacity
```
Each level: `LOAD_K6_RAMP` (1m) to reach it, then `LOAD_K6_LEVEL_HOLD` (5m), so 4 levels ≈ 24 min.

**Stress**: levels keep rising until the server breaks; k6 stops itself at the first level whose
error rate reaches `LOAD_K6_ABORT_ERROR_RATE` (0.1 = 10%) or whose login or player p95 reaches
`LOAD_K6_ABORT_P95_MS` (10000). **It may take staging down for everyone**: agree a time with the
server team. It refuses to start without `LOAD_STRESS_CONFIRM=yes`:
```
$env:LOAD_STRESS_CONFIRM='yes'; $env:LOAD_K6_STRESS_START='25'; $env:LOAD_K6_STRESS_STEP='25'; $env:LOAD_K6_STRESS_MAX='500'; npm run load:stress
```
Each level: 1m ramp + `LOAD_K6_LEVEL_HOLD` (2m for stress). Stopping at a limit is the expected end
(k6 exit 99); the runner reports it as the breaking point and exits 0.

| Variable | Meaning | Default |
|---|---|---|
| `LOAD_K6_LEVELS` | capacity: the VU levels | 10,25,50,100 |
| `LOAD_K6_STRESS_START` / `_STEP` / `_MAX` | stress: the VU levels | 25 / 25 / 500 |
| `LOAD_K6_LEVEL_HOLD` | time at each level after its ramp | 5m (capacity), 2m (stress) |
| `LOAD_K6_ABORT_ERROR_RATE` | stress: stop at this error share in a level | 0.1 |
| `LOAD_K6_ABORT_P95_MS` | stress: stop at this login / player p95 in a level | 10000 |
| `LOAD_STRESS_CONFIRM` | stress: must be `yes` | – |

`k6-summary.md` then starts with a table per level (requests, requests/s, errors, p50 and p95 of all
requests, p95 of login, player and save) and three lines: the highest level reached, the highest
healthy level (below both limits) and the first level whose p95 is over twice the first level's.
Requests are tagged with the level being held or ramped to, so a level includes its ramp. Peak
users need accounts: one per VU at the highest level (`LOAD_K6_POOL_FILE`); with fewer, VUs share
accounts, which is not what real load looks like (the runner warns).
These two modes have not been run against a site yet (only checked with `k6 inspect`). The GCP
wrapper (`scripts/gcp/load.sh`) does not have them; on Linux run the npm commands directly.

## Staging notes (2026-10-21)

- Course data verified on staging as sxts_user1: course id 2, "License Renewal Course" (the old
  "Renwal" typo is fixed), English SCORM id 6, launch link "Begin Course (License Renewal
  Course(English))". The full course played on staging exactly as on dev (30.8 min, 34/34 saves,
  resume at End, SCORM completed).
- **Finding for the client:** on staging, Log out redirects to the DMV single sign-on
  `wsi2st.dmv.ca.gov/isam/sps/auth`, which answered **403 "Request blocked" (CloudFront)** from our
  network. The MVLearn session does end, but the learner lands on a DMV error page.
- Because of this, the probe checks logout by opening `/my/` afterwards (must show the login page),
  k6 does not follow the logout redirect off the site, and errors from other websites are listed
  separately in `summary.md`.

## Installing k6

- **This PC:** k6 v1.7.1 is installed (`C:\Program Files\k6`). Check with `k6 version`.
- **Another Windows PC:** `winget install k6 --source winget` (or the MSI from grafana.com/docs/k6).
- **Linux / GCP VM (Debian/Ubuntu):**
  ```
  sudo gpg -k
  sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
  echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
  sudo apt-get update && sudo apt-get install k6
  ```
- Browsers (Playwright) on a fresh machine: `npm ci` then `npx playwright install --with-deps chromium`.

## Running on GCP

The same tests and scripts run on a Linux VM inside a Docker image (`Dockerfile.load`: Playwright
1.63.0 + Chromium + k6 1.7.1 + this project). No separate copy of the code: fixes apply to both.
**Status (2026-10-15): written, not yet built or run.**

### Size the VM

One browser probe needs ~1.5 vCPU and ~1.7 GB RAM (measured on the Windows PC, 2026-10-14); k6
users are light. Keep CPU under 80% (the runner warns).

| Run | Browsers | Suggested machine |
|---|---|---|
| baseline-2, hybrid-10 (8 k6 + 2) | 2 | `e2-standard-8` (8 vCPU, 32 GB) |
| baseline-10 | 10 | `c2-standard-30` (30 vCPU, 120 GB) |
| hybrid-100 (80 k6 + 20) | 20 | `c2-standard-60` (60 vCPU, 240 GB), or split with `--shard` over two VMs |

### 1. Create the VM (from your PC, gcloud CLI)

```
gcloud compute instances create mvlearn-load ^
  --zone=<zone near the learners> --machine-type=e2-standard-8 ^
  --image-family=ubuntu-2404-lts-amd64 --image-project=ubuntu-os-cloud --boot-disk-size=50GB
```

Before anything else: **can the VM reach dev?** From the VM: `curl -sI https://dev-mvlearn.verificient.com/login/index.php`
should answer `HTTP/2 200`. If dev only allows office/VPN addresses, ask for the VM's external IP
to be allowed.

### 2. Copy the project and set up (once)

From your PC (PowerShell, in the project folder): copy everything except `node_modules` and results,
plus `.env` separately:
```
gcloud compute scp --recurse --zone=<zone> D:\MVLearn\* mvlearn-load:~/MVLearn/
```
(If that copies `node_modules` too, zip the folder without it first. `.env` must arrive, but must
never be committed anywhere.)

On the VM (`gcloud compute ssh mvlearn-load --zone=<zone>`):
```
cd ~/MVLearn
bash scripts/gcp/setup-vm.sh      # installs Docker; then log out and back in
```

### 3. Run (on the VM)

Same variables as on Windows, written bash-style before the command:
```
LOAD_PROBES=1 LOAD_STEP=baseline-1 LOAD_RUN_ID=gcp-baseline-1_run1 bash scripts/gcp/load.sh probe
LOAD_K6_VUS=1 LOAD_STEP=k6-check LOAD_K6_DURATION=5m bash scripts/gcp/load.sh k6
LOAD_K6_VUS=8 LOAD_PROBES=2 LOAD_STEP=hybrid-10 LOAD_RUN_ID=gcp-hybrid-10_run1 LOAD_BASELINE=gcp-baseline-2_run1 bash scripts/gcp/load.sh hybrid
```

- The first run builds the image (a few minutes). After changing code, add `REBUILD=1`.
- The run continues in the background if SSH disconnects. `docker logs -f mvlearn-<run id>` to watch.
- **Run the baselines on the VM too.** Timings depend on where the browser is; only compare runs made
  from the same machine/location (a GCP hybrid run against a GCP baseline).

### 4. Get the results and stop paying

```
gcloud compute scp --recurse --zone=<zone> mvlearn-load:~/MVLearn/test-logs/load D:\MVLearn\test-logs\gcp-load
gcloud compute instances stop mvlearn-load --zone=<zone>      # keeps the disk; delete when finished:
gcloud compute instances delete mvlearn-load --zone=<zone>
```

### Things to verify on the first GCP run

1. Chromium on Linux plays the course audio (the slides auto-advance when the narration ends). If
   probes get stuck on audio-gated slides, report it: the autoplay flag in playwright.config.js may
   need a Linux companion flag.
2. The machine check reports the VM's CPU (inside Docker it sees the VM's cores).
3. Files written into `test-logs` from the container are owned by root on the VM; `sudo chown -R $USER test-logs` if needed.

## Server checks (SSH)

Read-only scripts in `scripts/server/` (no sudo needed, nothing installed or changed, no passwords
printed):

| Script | Run on | Gives |
|---|---|---|
| `moodle-check.sh` | Moodle server | Size, services, PHP-FPM / web server / DB / cache settings, Moodle version and config, cron, limits |
| `k6-check.sh` | k6 machine | Size, limits, tools, how it reaches the site (private network? timings, headers, route) |
| `server-monitor.sh start\|stop\|status` | both, during a test | CPU load, memory, PHP-FPM/Apache workers, web and DB connections every 5 s (`~/loadmon/`) |

From PowerShell (`$M` / `$K` = the SSH logins, e.g. `ubuntu@10.0.0.5`; add `-i <key>` if needed):
```
scp scripts\server\moodle-check.sh scripts\server\server-monitor.sh "${M}:~/"
ssh $M "bash ~/moodle-check.sh"
scp "${M}:~/mvlearn-check-*.txt" test-logs\server\
```
Write `"${M}:~/"`, not `"$M:~/"`: PowerShell reads `$M:` as a drive name.

## The machine check

Many browsers on one PC can make the PC the bottleneck, which slows the timings for reasons that
have nothing to do with the server. The runner samples CPU every 5 s and warns when it stays above
80% for 15 s (`LOAD_CPU_LIMIT` to change, `LOAD_CPU_ABORT=1` to stop the run then). Check
`machine.json` / the summary's "This machine" row after baseline-10: if CPU went above 80%, run fewer
browsers per PC (split with `--shard`) before trusting the numbers.
