// Runs the k6 learner script (k6/learner.js) against the target site. See docs/load-test.md.
// Usage: npm run load:k6 | load:capacity | load:stress  (= node scripts/run-k6.js [capacity|stress])
//   LOAD_K6_VUS       virtual users (default 1)
//   LOAD_K6_DURATION  how long to hold that load after the ramp (default 40m: a probe journey ~31m)
//   LOAD_K6_RAMP      ramp-up time to reach the VUs, or each level (default 1m)
//   LOAD_K6_SESSION_MINUTES  minutes each simulated learner stays in the course (default 10)
//   LOAD_STEP / LOAD_RUN_ID  label and results folder, shared with the probes in a hybrid run
// Capacity steps (load:capacity): hold each level in turn, results per level.
//   LOAD_K6_LEVELS      VU levels (default "10,25,50,100")
//   LOAD_K6_LEVEL_HOLD  how long to hold each level after its ramp (default 5m)
// Stress (load:stress): rising levels until the server breaks; k6 stops itself at the first level
// with too many errors or too slow login/player. May take staging down: needs LOAD_STRESS_CONFIRM=yes.
//   LOAD_K6_STRESS_START / _STEP / _MAX  levels (default 25 / 25 / 500 VUs)
//   LOAD_K6_LEVEL_HOLD  per level (default 2m for stress)
//   LOAD_K6_ABORT_ERROR_RATE  stop when a level's errors reach this share (default 0.1 = 10%)
//   LOAD_K6_ABORT_P95_MS      stop when a level's login or player p95 reaches this (default 10000)
// Accounts: LOAD_K6_POOL in .env ("user:pass;user:pass"), separate from LOAD_PROBE_POOL,
// SCORM_POOL and the APP account. Credentials are passed to k6 as environment variables only.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TARGET } from '../target.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { COURSE } = await import('../tests/data/site.js');
// The course package's SCORM version (1.2 for v1, 2004 for v2) decides the saves' element names.
const { COURSE_VERSION, SCORM_VERSION } = await import('../tests/data/course.js');

const usernames = (name) =>
  String(process.env[name] ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.slice(0, entry.indexOf(':')).trim().toLowerCase());

// k6 accounts from a file, for big pools (hundreds of accounts do not fit an .env line, and Windows
// limits a variable to ~32k characters): LOAD_K6_POOL_FILE=secrets/k6-accounts.csv, one account per
// line, "username,password" in a .csv (an optional "username,password" header is skipped), else
// "username:password". Blank lines and lines starting with # are ignored. Replaces LOAD_K6_POOL.
const poolFile = process.env.LOAD_K6_POOL_FILE?.trim();
if (poolFile) {
  const file = path.resolve(ROOT, poolFile);
  if (!fs.existsSync(file)) {
    console.error(`LOAD_K6_POOL_FILE: ${poolFile} not found.`);
    process.exit(1);
  }
  const separator = /\.csv$/i.test(file) ? ',' : ':';
  const entries = [];
  for (const [index, raw] of fs.readFileSync(file, 'utf8').split(/\r?\n/).entries()) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^username\s*,\s*password$/i.test(line)) continue;
    const at = line.indexOf(separator);
    const username = at > 0 ? line.slice(0, at).trim() : '';
    const password = at > 0 ? line.slice(at + 1).trim().replace(/^"(.*)"$/, '$1') : '';
    // The accounts reach k6 as "user:pass;user:pass": a ";" in a password would split it.
    if (!username || !password || password.includes(';')) {
      console.error(`LOAD_K6_POOL_FILE line ${index + 1}: expected "username${separator}password" (no ";" in the password).`);
      process.exit(1);
    }
    entries.push(`${username}:${password}`);
  }
  process.env.LOAD_K6_POOL = entries.join(';');
}

// --- profile -----------------------------------------------------------------------------------
// The first argument picks it; anything after is passed to k6.
const PROFILES = ['capacity', 'stress'];
const args = process.argv.slice(2);
const profile = PROFILES.includes(args[0]) ? /** @type {string} */ (args.shift()) : 'steady';
/** @type {number[]} */
let levels = [];
if (profile === 'capacity') {
  levels = String(process.env.LOAD_K6_LEVELS || '10,25,50,100')
    .split(',')
    .map(Number)
    .filter((n) => n > 0);
} else if (profile === 'stress') {
  const start = Number(process.env.LOAD_K6_STRESS_START) || 25;
  const step = Number(process.env.LOAD_K6_STRESS_STEP) || 25;
  const max = Number(process.env.LOAD_K6_STRESS_MAX) || 500;
  for (let n = start; n <= max; n += step) levels.push(n);
}
if (profile !== 'steady' && !levels.length) {
  console.error(`${profile}: no levels (check LOAD_K6_LEVELS or LOAD_K6_STRESS_*).`);
  process.exit(1);
}
const levelHold = process.env.LOAD_K6_LEVEL_HOLD || (profile === 'stress' ? '2m' : '5m');

// --- checks ------------------------------------------------------------------------------------
const host = new URL(String(process.env.BASE_URL)).hostname;
if (profile === 'stress' && process.env.LOAD_STRESS_CONFIRM !== 'yes') {
  console.error(
    `The stress test raises the load on ${host} until it breaks and may take it down for everyone.\n` +
      'Agree a time with the server team, then run it with LOAD_STRESS_CONFIRM=yes.',
  );
  process.exit(1);
}
if (!(TARGET === 'staging' || host === process.env.LOAD_ALLOW_HOST?.trim())) {
  console.error(`Load tests run on staging only. Host "${host}" is not staging; to use it on purpose set LOAD_ALLOW_HOST=${host}`);
  process.exit(1);
}
const k6Users = usernames('LOAD_K6_POOL');
if (!k6Users.length) {
  console.error('LOAD_K6_POOL is empty: add k6 accounts to .env, or LOAD_K6_POOL_FILE (see docs/load-test.md).');
  process.exit(1);
}
const reserved = new Set([
  ...usernames('LOAD_PROBE_POOL'),
  ...usernames('SCORM_POOL'),
  String(process.env.APP_USERNAME ?? '').trim().toLowerCase(),
]);
const clash = k6Users.filter((name) => reserved.has(name));
if (clash.length) {
  console.error(`LOAD_K6_POOL must not reuse probe, SCORM_POOL or APP accounts: ${clash.join(', ')}`);
  process.exit(1);
}
if (spawnSync('k6', ['version'], { shell: true }).status !== 0) {
  console.error('k6 is not installed or not on PATH. See docs/load-test.md ("Installing k6").');
  process.exit(1);
}

// --- run ---------------------------------------------------------------------------------------
const vus = profile === 'steady' ? Number(process.env.LOAD_K6_VUS) || 1 : Math.max(...levels);
const label = process.env.LOAD_STEP?.trim() || (profile === 'steady' ? `k6-${vus}` : `k6-${profile}-${vus}`);
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const runId = process.env.LOAD_RUN_ID?.trim() || `${stamp}_${label}`;
const outDir = path.join(ROOT, 'test-logs', 'load', runId);
fs.mkdirSync(outDir, { recursive: true });
if (k6Users.length < vus) {
  console.warn(
    `Note: ${k6Users.length} k6 accounts for ${vus} VUs; some VUs will share an account (the same learner logged in` +
      ' several times at once, which is not what real load looks like). Add accounts to LOAD_K6_POOL for big runs.',
  );
}
const ramp = process.env.LOAD_K6_RAMP || '1m';
const plan =
  profile === 'steady'
    ? `${vus} VU(s)`
    : `${profile}: levels ${levels.join(', ')} VUs, ${ramp} ramp + ${levelHold} hold each` +
      ` (up to ${Math.round((levels.length * (minutes(ramp) + minutes(levelHold)) + 0.5) * 10) / 10} min)`;
console.log(
  `k6 run "${runId}": ${plan} on ${host}, course ${COURSE_VERSION} (SCORM ${SCORM_VERSION}), results in ${path.relative(ROOT, outDir)}`,
);

/** "90s" / "2m" / "1h" → minutes. @param {string} text */
function minutes(text) {
  const match = /^(\d+(?:\.\d+)?)(s|m|h)?$/.exec(text.trim());
  if (!match) return 1;
  return Number(match[1]) * { s: 1 / 60, m: 1, h: 60 }[match[2] || 's'];
}

// Only what k6 needs: no other passwords or pools from .env reach the k6 process, and no K6_*
// variables (k6 would read them as its own options and drop the script's scenario).
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/PASSWORD|_POOL$|^STAGING_|^K6_/.test(key)),
);
Object.assign(env, {
  BASE_URL: String(process.env.BASE_URL).trim(),
  // With a pool file, k6 reads the file itself (LEARNER_POOL_FILE): a thousand accounts in one
  // variable come near Windows' ~32k-character limit. Otherwise only as many accounts as the run's
  // peak VUs (VU n uses account n).
  LEARNER_POOL: poolFile
    ? ''
    : String(process.env.LOAD_K6_POOL)
        .split(';')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .slice(0, vus)
        .join(';'),
  LEARNER_POOL_FILE: poolFile ? path.resolve(ROOT, poolFile) : '',
  LEARNER_VUS: String(vus),
  LEARNER_RAMP: ramp,
  LEARNER_PROFILE: profile,
  LEARNER_LEVELS: levels.join(','),
  LEARNER_LEVEL_HOLD: levelHold,
  LEARNER_ABORT_ERROR_RATE: process.env.LOAD_K6_ABORT_ERROR_RATE || '0.1',
  LEARNER_ABORT_P95_MS: process.env.LOAD_K6_ABORT_P95_MS || '10000',
  LEARNER_DURATION: process.env.LOAD_K6_DURATION || '40m',
  LEARNER_SESSION_MINUTES: process.env.LOAD_K6_SESSION_MINUTES || '10',
  LEARNER_COURSE_ID: String(COURSE.id),
  LEARNER_SCORM_CMID: String(COURSE.englishScormId),
  LEARNER_SCORM_VERSION: SCORM_VERSION,
  LEARNER_OUT_DIR: outDir,
  // Set by scripts/run-hybrid.js: VUs stay logged in until the browser probes finish.
  LEARNER_STOP_URL: process.env.LOAD_K6_STOP_URL || '',
  LEARNER_MAX_DURATION: process.env.LOAD_K6_MAX_DURATION || '90m',
});

const child = spawn('k6', ['run', path.join(ROOT, 'k6', 'learner.js'), ...args], {
  stdio: 'inherit',
  shell: true,
  env,
});
child.on('exit', (code) => {
  const summary = path.relative(ROOT, path.join(outDir, 'k6-summary.md'));
  // 99 = a threshold with abortOnFail failed: for stress that is the breaking point it looks for.
  if (profile === 'stress' && code === 99) {
    console.log(`\nStress test stopped at the breaking point (a level went over the limits). Summary: ${summary}`);
    process.exit(0);
  }
  console.log(`\nk6 finished (exit ${code}). Summary: ${summary}`);
  process.exit(code ?? 1);
});
