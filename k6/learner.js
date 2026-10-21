// k6 learner: the HTTP side of a learner taking the course, for the load test (docs/load-test.md).
// k6 does not run Storyline; it sends the requests a browser sends and times the server's answers.
// Run through scripts/run-k6.js (npm run load:k6), which passes everything below as env vars and
// never puts credentials on the command line.
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
const OUT_DIR = __ENV.LEARNER_OUT_DIR || '.';
// Hybrid mode: each VU logs in ONCE and stays until this URL (served by scripts/run-hybrid.js on
// localhost) says {"stop":true}, i.e. until the browser probes have finished; then it logs out.
// Without it, VUs repeat sessions of LEARNER_SESSION_MINUTES for LEARNER_DURATION (k6 alone).
const STOP_URL = __ENV.LEARNER_STOP_URL || '';
const MAX_DURATION = __ENV.LEARNER_MAX_DURATION || '90m';
const STOP_CHECK_S = 5;

const ACCOUNTS = String(__ENV.LEARNER_POOL || '')
  .split(';')
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
    const index = entry.indexOf(':');
    return { username: entry.slice(0, index).trim(), password: entry.slice(index + 1) };
  });

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

export const options = {
  scenarios: {
    learners: STOP_URL
      ? // One long session per VU, ended by the stop signal (or MAX_DURATION as a safety net).
        { executor: 'per-vu-iterations', vus: VUS, iterations: 1, maxDuration: MAX_DURATION }
      : {
          executor: 'ramping-vus',
          startVUs: 0,
          stages: [
            { duration: RAMP, target: VUS },
            { duration: DURATION, target: VUS },
            { duration: '30s', target: 0 },
          ],
          gracefulRampDown: '2m',
          gracefulStop: '2m',
        },
  },
  summaryTrendStats: ['avg', 'min', 'med', 'p(95)', 'max'],
  thresholds: perName,
};

const loginOk = new Rate('learner_login_ok');
const playerOk = new Rate('learner_player_ok');
const saveOk = new Rate('learner_save_ok');
const sessionOk = new Rate('learner_session_ok');
const saves = new Counter('learner_saves');

export function setup() {
  if (!BASE) fail('BASE_URL is not set (run through scripts/run-k6.js)');
  if (!ACCOUNTS.length) fail('LEARNER_POOL is empty: add LOAD_K6_POOL to .env');
  if (!COURSE_ID || !SCORM_CMID) fail('LEARNER_COURSE_ID / LEARNER_SCORM_CMID are not set');
  if (ACCOUNTS.length < VUS) {
    console.warn(`Only ${ACCOUNTS.length} k6 accounts for ${VUS} VUs: some VUs share an account.`);
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
/** "90s" / "1m" / "1h" → seconds. */
const toSeconds = (text) => {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(String(text).trim());
  if (!match) return 60;
  const value = Number(match[1]);
  return { ms: value / 1000, s: value, m: value * 60, h: value * 3600 }[match[2] || 's'];
};
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
    const dashboard = /\/my\/(\?|#|$)/.test(next);
    login = http.get(next, { redirects: 0, tags: { name: dashboard ? 'dashboard' : 'login_submit' } });
  }
  const loggedIn = check(login, {
    'login: lands on the Dashboard': (r) => r.status === 200 && /\/my\/(\?|#|$)/.test(r.url),
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
    const res = http.post(
      `${BASE}/mod/scorm/datamodel.php`,
      {
        id: SCORM_CMID,
        a,
        sesskey,
        attempt,
        scoid,
        // SCORM 1.2 element names with "." written as "__" (Moodle's datamodel.php format).
        cmi__core__lesson_status: 'incomplete',
        cmi__core__exit: 'suspend',
        cmi__core__session_time: scormTime(SAVE_INTERVAL_S),
        cmi__suspend_data: filler,
      },
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
export function handleSummary(data) {
  const metric = (key) => (data.metrics[key] ? data.metrics[key].values : null);
  const sec = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(ms < 10_000 ? 3 : 1)} s` : '–');
  const pct = (rate) => (typeof rate === 'number' ? `${Math.round(rate * 100)}%` : '–');
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
  const mode = STOP_URL ? 'one session per VU, until the browser probes finished' : `${DURATION}, ${SESSION_MINUTES}-min sessions`;
  const result = {
    vus: VUS,
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
  const md = [
    `# k6 summary (${VUS} VU${VUS === 1 ? '' : 's'}, ${mode}${result.runMinutes ? `; ran ${result.runMinutes} min` : ''})`,
    '',
    '| | |',
    '|---|---|',
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
