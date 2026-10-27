// k6 learner: the HTTP side of a learner taking the course, for the load test (docs/load-test.md).
// k6 does not run the course (Storyline in v1, Rise in v2); it sends the requests a browser sends
// and times the server's answers. The flow is the same for both packages; only the save's SCORM
// element names differ (LEARNER_SCORM_VERSION).
// Run through scripts/run-k6.js (npm run load:k6), which passes everything below as env vars and
// never puts credentials on the command line.
//
// Profiles (steady, hybrid, capacity steps, stress): see "Load profile" below.
//
// One iteration = one learner session:
//   GET login page (logintoken) → POST login (→ testsession) → Dashboard (sesskey) → My courses →
//   course page → SCORM player (view.php → player.php; SCORM data is embedded there) → loadSCO.php →
//   a progress save (POST datamodel.php) every LEARNER_SAVE_INTERVAL_S for LEARNER_SESSION_MINUTES → logout.
//
// Settings use the LEARNER_ prefix on purpose: k6 reads every K6_* environment variable as its own
// option (K6_VUS, K6_DURATION, …), which replaced the scenario below on the first run (2026-10-15).
//
// Verified on dev 2026-10-15 (1 VU, 5 min): login, player and saves 100% OK; the filler saves were
// stored (seen in the account's SCORM data). Login redirects, the embedded SCORM data and the
// attempt number were checked against the real player page.
//
// Accounts: LEARNER_POOL ("user:pass;user:pass"), one per VU ideally (VU n uses account n, wrapping
// around). These accounts' SCORM data is overwritten with filler: use them for nothing else.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import exec from 'k6/execution';
import { Rate, Counter } from 'k6/metrics';

const BASE = String(__ENV.BASE_URL || '').replace(/\/+$/, '');
const COURSE_ID = __ENV.LEARNER_COURSE_ID;
const SCORM_CMID = __ENV.LEARNER_SCORM_CMID;
const VUS = Number(__ENV.LEARNER_VUS || 1);
const RAMP = __ENV.LEARNER_RAMP || '1m';
const DURATION = __ENV.LEARNER_DURATION || '40m';
const SESSION_MINUTES = Number(__ENV.LEARNER_SESSION_MINUTES || 10);
const SAVE_INTERVAL_S = Number(__ENV.LEARNER_SAVE_INTERVAL_S || 60);
const SUSPEND_BYTES = Number(__ENV.LEARNER_SUSPEND_BYTES || 800);
// SCORM version of the course package (tests/data/courses/<v>/outline.js): the saves use its
// element names. v1 (Storyline) is 1.2, v2 (Rise) is 2004.
const SCORM_VERSION = __ENV.LEARNER_SCORM_VERSION || '1.2';
const OUT_DIR = __ENV.LEARNER_OUT_DIR || '.';
// Hybrid mode: each VU logs in ONCE and stays until this URL (served by scripts/run-hybrid.js on
// localhost) says {"stop":true}, i.e. until the browser probes have finished; then it logs out.
// Without it, VUs repeat sessions of LEARNER_SESSION_MINUTES for LEARNER_DURATION (k6 alone).
const STOP_URL = __ENV.LEARNER_STOP_URL || '';
const MAX_DURATION = __ENV.LEARNER_MAX_DURATION || '90m';
const STOP_CHECK_S = 5;

// Load profile (LEARNER_PROFILE, set by scripts/run-k6.js):
//   steady    ramp to LEARNER_VUS, hold LEARNER_DURATION (npm run load:k6)
//   hybrid    one session per VU until the browser probes finish (LEARNER_STOP_URL; load:hybrid)
//   capacity  LEARNER_LEVELS ("10,25,50,100"): ramp to each (LEARNER_RAMP) and hold it
//             (LEARNER_LEVEL_HOLD), one after another; results per level (load:capacity)
//   stress    the same, with levels rising until the server breaks: k6 stops itself when a level's
//             error rate reaches LEARNER_ABORT_ERROR_RATE or its login/player p95 reaches
//             LEARNER_ABORT_P95_MS (load:stress)
// In capacity and stress every request is tagged with the level being held or ramped to.
const PROFILE = STOP_URL ? 'hybrid' : __ENV.LEARNER_PROFILE || 'steady';
const LEVELED = PROFILE === 'capacity' || PROFILE === 'stress';
const LEVELS = String(__ENV.LEARNER_LEVELS || '')
  .split(',')
  .map(Number)
  .filter((n) => n > 0);
const LEVEL_HOLD = __ENV.LEARNER_LEVEL_HOLD || '5m';
const ABORT_ERROR_RATE = Number(__ENV.LEARNER_ABORT_ERROR_RATE || 0.1);
const ABORT_P95_MS = Number(__ENV.LEARNER_ABORT_P95_MS || 10_000);
/** Requests whose p95 per level is reported (and, in stress, can stop the run: login and player). */
const KEY_NAMES = ['login_submit', 'player', 'save'];

/** Level schedule: when each ramp / hold ends (seconds from the start) and its level. */
const SCHEDULE = [];
{
  let t = 0;
  for (const level of LEVELS) {
    t += toSeconds(RAMP);
    SCHEDULE.push({ endS: t, level });
    t += toSeconds(LEVEL_HOLD);
    SCHEDULE.push({ endS: t, level });
  }
}
/** The level being held or ramped to right now. */
function currentLevel() {
  const s = exec.instance.currentTestRunDuration / 1000;
  return (SCHEDULE.find((entry) => s < entry.endS) ?? SCHEDULE[SCHEDULE.length - 1]).level;
}
/** Tag this VU's next requests with the current level (capacity / stress only). */
function markLevel() {
  if (LEVELED) exec.vu.metrics.tags.level = String(currentLevel());
}

// Accounts: LEARNER_POOL ("user:pass;user:pass"), or LEARNER_POOL_FILE (absolute path, set by
// scripts/run-k6.js from LOAD_K6_POOL_FILE): one account per line, "username,password" in a .csv
// (header line skipped), else "username:password"; blank lines and # comments ignored. The runner
// has already checked the file's format.
function readPool() {
  const file = __ENV.LEARNER_POOL_FILE || '';
  if (!file) {
    return String(__ENV.LEARNER_POOL || '')
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf(':');
        return { username: entry.slice(0, index).trim(), password: entry.slice(index + 1) };
      });
  }
  const separator = /\.csv$/i.test(file) ? ',' : ':';
  return open(file)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !/^username\s*,\s*password$/i.test(line))
    .map((line) => {
      const index = line.indexOf(separator);
      return { username: line.slice(0, index).trim(), password: line.slice(index + 1).trim().replace(/^"(.*)"$/, '$1') };
    });
}
const ACCOUNTS = readPool();

/** Request names (k6 tag "name"); each gets its own line in the summary. */
const NAMES = [
  'login_page',
  'login_submit',
  'dashboard',
  'my_courses',
  'course_page',
  'player',
  'load_sco',
  'save',
  'logout',
];

// Per-name thresholds that always pass: they only make k6 report each request type separately.
const perName = {};
for (const name of NAMES) {
  perName[`http_req_duration{name:${name}}`] = ['max>=0'];
  perName[`http_req_waiting{name:${name}}`] = ['max>=0'];
  perName[`http_req_failed{name:${name}}`] = ['rate>=0'];
  perName[`http_reqs{name:${name}}`] = ['count>=0'];
}

// Per-level submetrics. In stress they are the stop conditions (k6 aborts the run when one fails;
// evaluated per level, so an earlier level's good numbers do not hide a later level's bad ones).
const perLevel = {};
for (const level of LEVELED ? LEVELS : []) {
  const stop = PROFILE === 'stress';
  perLevel[`http_req_duration{level:${level}}`] = ['max>=0'];
  perLevel[`http_reqs{level:${level}}`] = ['count>=0'];
  perLevel[`http_req_failed{level:${level}}`] = stop
    ? [{ threshold: `rate<${ABORT_ERROR_RATE}`, abortOnFail: true, delayAbortEval: '30s' }]
    : ['rate>=0'];
  for (const name of KEY_NAMES) {
    perLevel[`http_req_duration{level:${level},name:${name}}`] =
      stop && name !== 'save'
        ? [{ threshold: `p(95)<${ABORT_P95_MS}`, abortOnFail: true, delayAbortEval: '30s' }]
        : ['max>=0'];
  }
}

/** @returns {object} the k6 scenario of this profile */
function scenario() {
  if (PROFILE === 'hybrid') {
    // One long session per VU, ended by the stop signal (or MAX_DURATION as a safety net).
    return { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: MAX_DURATION };
  }
  const stages = LEVELED
    ? [
        ...LEVELS.flatMap((level) => [
          { duration: RAMP, target: level },
          { duration: LEVEL_HOLD, target: level },
        ]),
        { duration: '30s', target: 0 },
      ]
    : [
        { duration: RAMP, target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ];
  return { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '2m', gracefulStop: '2m' };
}

export const options = {
  scenarios: { learners: scenario() },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'max'],
  thresholds: { ...perName, ...perLevel },
};

const loginOk = new Rate('learner_login_ok');
const playerOk = new Rate('learner_player_ok');
const saveOk = new Rate('learner_save_ok');
const sessionOk = new Rate('learner_session_ok');
const saves = new Counter('learner_saves');

export function setup() {
  if (!BASE) fail('BASE_URL is not set (run through scripts/run-k6.js)');
  if (!ACCOUNTS.length) fail('No k6 accounts: set LOAD_K6_POOL or LOAD_K6_POOL_FILE in .env');
  if (!COURSE_ID || !SCORM_CMID) fail('LEARNER_COURSE_ID / LEARNER_SCORM_CMID are not set');
  if (!['1.2', '2004'].includes(SCORM_VERSION)) fail(`LEARNER_SCORM_VERSION "${SCORM_VERSION}": use 1.2 or 2004`);
  if (LEVELED && !LEVELS.length) fail(`${PROFILE}: LEARNER_LEVELS is empty (e.g. "10,25,50,100")`);
  const peak = LEVELED ? Math.max(...LEVELS) : VUS;
  if (ACCOUNTS.length < peak) {
    console.warn(`Only ${ACCOUNTS.length} k6 accounts for ${peak} VUs: some VUs share an account.`);
  }
}

const think = (min, max) => sleep(min + Math.random() * (max - min));
const decode = (text) => text.replace(/&amp;/g, '&');
/** @param {string} body @param {RegExp} re */
const first = (body, re) => {
  const match = re.exec(String(body || ''));
  return match ? match[1] : null;
};
/** Query parameters of a URL or query string. */
function params(urlOrQuery) {
  const query = String(urlOrQuery).split('?').pop();
  const out = {};
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (key) out[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  }
  return out;
}
/** SCORM 1.2 time "HHHH:MM:SS.SS". */
const scormTime = (seconds) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(4, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.00`;
};
const filler = 'k6'.repeat(Math.ceil(SUSPEND_BYTES / 2)).slice(0, SUSPEND_BYTES);
/**
 * The SCORM elements of one save, in Moodle's datamodel.php format ("." written as "__"; the same
 * for 2004, checked in Moodle's datamodels/scorm_13.js on dev, 2026-10-27).
 *   1.2:  cmi.core.lesson_status, cmi.core.exit, cmi.core.session_time "HHHH:MM:SS.SS", cmi.suspend_data
 *   2004: cmi.completion_status, cmi.exit, cmi.session_time ISO 8601 "PT60S", cmi.suspend_data
 */
const saveElements = () =>
  SCORM_VERSION === '2004'
    ? {
        cmi__completion_status: 'incomplete',
        cmi__exit: 'suspend',
        cmi__session_time: `PT${SAVE_INTERVAL_S}S`,
        cmi__suspend_data: filler,
      }
    : {
        cmi__core__lesson_status: 'incomplete',
        cmi__core__exit: 'suspend',
        cmi__core__session_time: scormTime(SAVE_INTERVAL_S),
        cmi__suspend_data: filler,
      };
/** "90s" / "1m" / "1h" → seconds. A function declaration: the level schedule above uses it. */
function toSeconds(text) {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(text).trim());
  if (!match) return 60;
  const value = Number(match[1]);
  return { ms: value / 1000, s: value, m: value * 60, h: value * 3600 }[match[2] || 's'];
}
/**
 * Hybrid mode: true once the runner says stop. If the runner's flag cannot be reached any more
 * (it stopped or crashed), stop too rather than run until MAX_DURATION.
 */
function stopRequested() {
  const res = http.get(STOP_URL, { tags: { name: 'control' }, timeout: '5s' });
  return res.status !== 200 || /"stop"\s*:\s*true/.test(String(res.body));
}

export default function () {
  const account = ACCOUNTS[(exec.vu.idInTest - 1) % ACCOUNTS.length];
  // Hybrid mode: spread the VUs' logins over LEARNER_RAMP instead of all at the same second.
  if (STOP_URL && VUS > 1) sleep(((exec.vu.idInTest - 1) * toSeconds(RAMP)) / VUS);
  // A fresh session every iteration, like a learner opening the site.
  http.cookieJar().clear(BASE);
  markLevel();

  // --- login -----------------------------------------------------------------------------------
  const loginPage = http.get(`${BASE}/login/index.php`, { tags: { name: 'login_page' } });
  const logintoken = first(loginPage.body, /name="logintoken"\s+value="([^"]+)"/);
  // Redirects are followed one by one, so the Dashboard gets its own timing. On dev (2026-10-15):
  // POST → 303 /login/index.php?testsession=… → 303 /my/ (both hops before /my/ count as login).
  let login = http.post(
    `${BASE}/login/index.php`,
    { username: account.username, password: account.password, logintoken: logintoken || '', anchor: '' },
    { redirects: 0, tags: { name: 'login_submit' } },
  );
  for (let hop = 0; hop < 5 && login.status >= 300 && login.status < 400; hop++) {
    const location = login.headers.Location || login.headers.location || '';
    const next = location.startsWith('http') ? location : `${BASE}${location}`;
    // The Dashboard, or My courses for an account whose home page is set to it (seen on dev, 2026-10-26).
    const dashboard = /\/my\/(courses\.php)?(\?|#|$)/.test(next);
    login = http.get(next, { redirects: 0, tags: { name: dashboard ? 'dashboard' : 'login_submit' } });
  }
  const loggedIn = check(login, {
    'login: lands on the Dashboard': (r) => r.status === 200 && /\/my\/(courses\.php)?(\?|#|$)/.test(r.url),
    'login: no "Invalid login"': (r) => !/Invalid login/.test(String(r.body)),
  });
  loginOk.add(loggedIn);
  if (!loggedIn) {
    sessionOk.add(false);
    think(5, 10);
    return;
  }
  const sesskey = first(login.body, /"sesskey":"([^"]+)"/);
  think(2, 5);

  // --- browse to the course --------------------------------------------------------------------
  check(http.get(`${BASE}/my/courses.php`, { tags: { name: 'my_courses' } }), { 'my courses: 200': (r) => r.status === 200 });
  think(2, 5);
  check(http.get(`${BASE}/course/view.php?id=${COURSE_ID}`, { tags: { name: 'course_page' } }), {
    'course page: 200': (r) => r.status === 200,
  });
  think(2, 5);

  // --- SCORM player ----------------------------------------------------------------------------
  // view.php redirects straight to player.php (the activity skips its entry page, see scorm-notes).
  let player = http.get(`${BASE}/mod/scorm/view.php?id=${SCORM_CMID}`, { tags: { name: 'player' } });
  if (!/\/mod\/scorm\/player\.php/.test(player.url)) {
    // Entry page shown instead: follow its link to player.php.
    const link = first(player.body, /href="([^"]*\/mod\/scorm\/player\.php[^"]*)"/);
    if (link) player = http.get(decode(link), { tags: { name: 'player' } });
  }
  const atPlayer = check(player, { 'player: player.php 200': (r) => r.status === 200 && /\/mod\/scorm\/player\.php/.test(r.url) });
  playerOk.add(atPlayer);
  if (!atPlayer || !sesskey) {
    sessionOk.add(false);
    logout(sesskey);
    return;
  }
  const playerParams = params(player.url);
  const a = playerParams.a;
  const scoid = playerParams.scoid;
  const currentorg = playerParams.currentorg || '';

  // On this Moodle the SCORM data is embedded in player.php (no loaddatamodel.php request, checked
  // 2026-10-15), and the page's JavaScript builds the content URL loadSCO.php?a=&scoid=&currentorg=.
  // The attempt number is in the page's table of contents ("…&attempt=1").
  const attempt = first(player.body, /[?&;]attempt=(\d+)/) || '1';
  http.get(`${BASE}/mod/scorm/loadSCO.php?a=${a}&scoid=${scoid}&currentorg=${encodeURIComponent(currentorg)}`, {
    tags: { name: 'load_sco' },
  });

  // --- learning: a progress save about once a minute, like Storyline ---------------------------
  // k6 alone: for SESSION_MINUTES. Hybrid: until the runner's stop signal (checked every 5 s).
  const sessionEnd = Date.now() + SESSION_MINUTES * 60_000;
  let nextSave = Date.now() + SAVE_INTERVAL_S * 1000;
  let allSavesOk = true;
  for (;;) {
    if (STOP_URL ? stopRequested() : Date.now() >= sessionEnd) break;
    const wait = (nextSave - Date.now()) / 1000;
    if (wait > 0) {
      sleep(STOP_URL ? Math.min(wait, STOP_CHECK_S) : wait);
      continue;
    }
    nextSave += SAVE_INTERVAL_S * 1000;
    markLevel();
    const res = http.post(
      `${BASE}/mod/scorm/datamodel.php`,
      { id: SCORM_CMID, a, sesskey, attempt, scoid, ...saveElements() },
      { tags: { name: 'save' } },
    );
    const ok = check(res, { 'save: accepted ("true")': (r) => r.status === 200 && /^\s*true/.test(String(r.body)) });
    saveOk.add(ok);
    saves.add(1);
    if (!ok) allSavesOk = false;
  }

  logout(sesskey);
  sessionOk.add(allSavesOk);
  if (!STOP_URL) think(3, 8);
}

/**
 * Log out. Redirects are followed only while they stay on the site under test: on staging, logout
 * redirects to the DMV single sign-on (wsi2st.dmv.ca.gov), which answered 403 from our network
 * (2026-10-21); that is not the site's error, and not load we want to put on the DMV.
 * @param {string | null} sesskey
 */
function logout(sesskey) {
  if (!sesskey) return;
  markLevel();
  const host = BASE.replace(/^https?:\/\//, '').split('/')[0];
  let res = http.get(`${BASE}/login/logout.php?sesskey=${sesskey}`, { redirects: 0, tags: { name: 'logout' } });
  for (let hop = 0; hop < 3 && res.status >= 300 && res.status < 400; hop++) {
    const location = res.headers.Location || res.headers.location || '';
    const next = location.startsWith('http') ? location : `${BASE}${location}`;
    if (next.replace(/^https?:\/\//, '').split('/')[0] !== host) break;
    res = http.get(next, { redirects: 0, tags: { name: 'logout' } });
  }
}

// --- summary -----------------------------------------------------------------------------------
const sec = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(ms < 10_000 ? 3 : 1)} s` : '–');
const pct = (rate) => (typeof rate === 'number' ? `${Math.round(rate * 100)}%` : '–');

/**
 * Per level: requests, requests/s over the level's ramp + hold, error rate, p50 / p95 of all
 * requests and p95 of login, player and save. A level without requests was not reached.
 * @param {(key: string) => any} metric
 */
function levelRows(metric) {
  const seconds = toSeconds(RAMP) + toSeconds(LEVEL_HOLD);
  return LEVELS.map((level) => {
    const all = metric(`http_req_duration{level:${level}}`);
    const failed = metric(`http_req_failed{level:${level}}`);
    const count = metric(`http_reqs{level:${level}}`);
    const key = Object.fromEntries(
      KEY_NAMES.map((name) => {
        const m = metric(`http_req_duration{level:${level},name:${name}}`);
        return [name, m ? m['p(95)'] : null];
      }),
    );
    const requests = count ? count.count : 0;
    return {
      level,
      reached: requests > 0,
      requests,
      requestsPerSecond: requests / seconds,
      errorRate: failed ? failed.rate : null,
      p50: all ? all.med : null,
      p95: all ? all['p(95)'] : null,
      p95ByName: key,
    };
  });
}

/**
 * The verdict: the highest level that stayed healthy (errors and login/player p95 below the stop
 * limits) and the first level whose p95 was more than twice the first level's.
 * @param {ReturnType<typeof levelRows>} rows
 */
function levelVerdict(rows) {
  const reached = rows.filter((row) => row.reached);
  const healthy = (row) =>
    (row.errorRate ?? 0) < ABORT_ERROR_RATE &&
    ['login_submit', 'player'].every((name) => (row.p95ByName[name] ?? 0) < ABORT_P95_MS);
  const lastHealthy = reached.filter(healthy).pop();
  const baseP95 = reached[0] ? reached[0].p95 : null;
  const firstSlower = baseP95 ? reached.find((row) => row.p95 > 2 * baseP95) : undefined;
  return {
    highestLevelReached: reached.length ? reached[reached.length - 1].level : null,
    highestHealthyLevel: lastHealthy ? lastHealthy.level : null,
    firstLevelTwiceAsSlow: firstSlower ? firstSlower.level : null,
    // Stress stops itself at the first unhealthy level; capacity simply runs every level.
    stoppedEarly: reached.length < rows.length,
  };
}

/** @param {ReturnType<typeof levelRows>} rows @param {any} result */
function levelMarkdown(rows, result) {
  return [
    '| Level (VUs) | Requests | Req/s | Errors | p50 | p95 | p95 login | p95 player | p95 save |',
    '|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) =>
      r.reached
        ? `| ${r.level} | ${r.requests} | ${r.requestsPerSecond.toFixed(2)} | ${pct(r.errorRate)} | ${sec(r.p50)} | ${sec(r.p95)} | ${sec(r.p95ByName.login_submit)} | ${sec(r.p95ByName.player)} | ${sec(r.p95ByName.save)} |`
        : `| ${r.level} | not reached | | | | | | | |`,
    ),
    '',
    `- Highest level reached: **${result.highestLevelReached ?? '–'} VUs**${result.stoppedEarly ? ' (stopped early)' : ''}`,
    `- Highest healthy level (errors < ${pct(ABORT_ERROR_RATE)}, login/player p95 < ${sec(ABORT_P95_MS)}): **${result.highestHealthyLevel ?? 'none'} VUs**`,
    `- First level with p95 over twice the first level's: **${result.firstLevelTwiceAsSlow ?? 'none'}**`,
    '',
    'Requests are tagged with the level being held or ramped to, so a level includes its ramp.',
    '',
  ];
}

export function handleSummary(data) {
  const metric = (key) => (data.metrics[key] ? data.metrics[key].values : null);
  const rows = NAMES.map((name) => {
    const duration = metric(`http_req_duration{name:${name}}`);
    const waiting = metric(`http_req_waiting{name:${name}}`);
    const failed = metric(`http_req_failed{name:${name}}`);
    const count = metric(`http_reqs{name:${name}}`);
    return {
      name,
      count: count ? count.count : 0,
      med: duration ? duration.med : null,
      p95: duration ? duration['p(95)'] : null,
      max: duration ? duration.max : null,
      ttfbMed: waiting ? waiting.med : null,
      ttfbP95: waiting ? waiting['p(95)'] : null,
      errorRate: failed ? failed.rate : null,
    };
  });
  // Only requests to the site (not the hybrid runner's local stop-flag checks, tagged "control").
  const totalRequests = rows.reduce((sum, row) => sum + row.count, 0);
  const runSeconds = data.state && data.state.testRunDurationMs ? data.state.testRunDurationMs / 1000 : null;
  const mode = {
    hybrid: 'one session per VU, until the browser probes finished',
    steady: `${DURATION}, ${SESSION_MINUTES}-min sessions`,
    capacity: `capacity steps ${LEVELS.join(' → ')} VUs, ${RAMP} ramp + ${LEVEL_HOLD} hold each`,
    stress: `stress ${LEVELS[0]} → ${LEVELS[LEVELS.length - 1]} VUs, ${RAMP} ramp + ${LEVEL_HOLD} hold each, stops at ≥ ${pct(ABORT_ERROR_RATE)} errors or login/player p95 ≥ ${sec(ABORT_P95_MS)}`,
  }[PROFILE];
  const levels = LEVELED ? levelRows(metric) : [];
  const result = {
    profile: PROFILE,
    vus: VUS,
    scormVersion: SCORM_VERSION,
    levels,
    ...(LEVELED ? levelVerdict(levels) : {}),
    mode,
    runMinutes: runSeconds ? Math.round(runSeconds / 6) / 10 : null,
    duration: DURATION,
    sessionMinutes: STOP_URL ? null : SESSION_MINUTES,
    saveIntervalS: SAVE_INTERVAL_S,
    requestsPerSecond: runSeconds ? totalRequests / runSeconds : null,
    totalRequests,
    loginOk: metric('learner_login_ok') ? metric('learner_login_ok').rate : null,
    playerOk: metric('learner_player_ok') ? metric('learner_player_ok').rate : null,
    saveOk: metric('learner_save_ok') ? metric('learner_save_ok').rate : null,
    sessionOk: metric('learner_session_ok') ? metric('learner_session_ok').rate : null,
    saves: metric('learner_saves') ? metric('learner_saves').count : 0,
    requests: rows,
  };
  const heading = LEVELED ? `# k6 ${PROFILE} summary (${mode}` : `# k6 summary (${VUS} VU${VUS === 1 ? '' : 's'}, ${mode}`;
  const md = [
    `${heading}${result.runMinutes ? `; ran ${result.runMinutes} min` : ''})`,
    ...(LEVELED ? ['', ...levelMarkdown(levels, result)] : []),
    '',
    '| | |',
    '|---|---|',
    `| SCORM saves as | ${SCORM_VERSION} |`,
    `| Requests | ${result.totalRequests} (${result.requestsPerSecond ? result.requestsPerSecond.toFixed(2) : '–'}/s) |`,
    `| Login OK | ${pct(result.loginOk)} |`,
    `| Player OK | ${pct(result.playerOk)} |`,
    `| Saves OK | ${pct(result.saveOk)} (${result.saves} saves) |`,
    `| Sessions OK | ${pct(result.sessionOk)} |`,
    '',
    '| Request | Count | Median | p95 | Max | First byte median | First byte p95 | Errors |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.name} | ${r.count} | ${sec(r.med)} | ${sec(r.p95)} | ${sec(r.max)} | ${sec(r.ttfbMed)} | ${sec(r.ttfbP95)} | ${pct(r.errorRate)} |`,
    ),
    '',
    'Times are server response times per request (k6 does not render pages or run the course).',
  ].join('\n');
  return {
    [`${OUT_DIR}/k6-summary.json`]: JSON.stringify(result, null, 2),
    [`${OUT_DIR}/k6-summary.md`]: `${md}\n`,
    stdout: `\n${md}\n`,
  };
}
