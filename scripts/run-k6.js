// Runs the k6 learner script (k6/learner.js) against the target site. See docs/load-test.md.
// Usage: npm run load:k6
//   LOAD_K6_VUS       virtual users (default 1)
//   LOAD_K6_DURATION  how long to hold that load after the ramp (default 40m: a probe journey ~31m)
//   LOAD_K6_RAMP      ramp-up time to reach the VUs (default 1m)
//   LOAD_K6_SESSION_MINUTES  minutes each simulated learner stays in the course (default 10)
//   LOAD_STEP / LOAD_RUN_ID  label and results folder, shared with the probes in a hybrid run
// Accounts: LOAD_K6_POOL in .env ("user:pass;user:pass"), separate from LOAD_PROBE_POOL,
// SCORM_POOL and the APP account. Credentials are passed to k6 as environment variables only.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TARGET } from '../target.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { COURSE } = await import('../tests/data/site.js');

const usernames = (name) =>
  String(process.env[name] ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.slice(0, entry.indexOf(':')).trim().toLowerCase());

// --- checks ------------------------------------------------------------------------------------
const host = new URL(String(process.env.BASE_URL)).hostname;
if (!(TARGET === 'staging' || host === process.env.LOAD_ALLOW_HOST?.trim())) {
  console.error(`Load tests run on staging only. Host "${host}" is not staging; to use it on purpose set LOAD_ALLOW_HOST=${host}`);
  process.exit(1);
}
const k6Users = usernames('LOAD_K6_POOL');
if (!k6Users.length) {
  console.error('LOAD_K6_POOL is empty: add k6 accounts to .env (see .env.example).');
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
const vus = Number(process.env.LOAD_K6_VUS) || 1;
const label = process.env.LOAD_STEP?.trim() || `k6-${vus}`;
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const runId = process.env.LOAD_RUN_ID?.trim() || `${stamp}_${label}`;
const outDir = path.join(ROOT, 'test-logs', 'load', runId);
fs.mkdirSync(outDir, { recursive: true });
if (k6Users.length < vus) console.warn(`Note: ${k6Users.length} k6 accounts for ${vus} VUs; some VUs will share an account.`);
console.log(`k6 run "${runId}": ${vus} VU(s) on ${host}, results in ${path.relative(ROOT, outDir)}`);

// Only what k6 needs: no other passwords or pools from .env reach the k6 process, and no K6_*
// variables (k6 would read them as its own options and drop the script's scenario).
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !/PASSWORD|_POOL$|^STAGING_|^K6_/.test(key)),
);
Object.assign(env, {
  BASE_URL: String(process.env.BASE_URL).trim(),
  LEARNER_POOL: process.env.LOAD_K6_POOL,
  LEARNER_VUS: String(vus),
  LEARNER_RAMP: process.env.LOAD_K6_RAMP || '1m',
  LEARNER_DURATION: process.env.LOAD_K6_DURATION || '40m',
  LEARNER_SESSION_MINUTES: process.env.LOAD_K6_SESSION_MINUTES || '10',
  LEARNER_COURSE_ID: String(COURSE.id),
  LEARNER_SCORM_CMID: String(COURSE.englishScormId),
  LEARNER_OUT_DIR: outDir,
  // Set by scripts/run-hybrid.js: VUs stay logged in until the browser probes finish.
  LEARNER_STOP_URL: process.env.LOAD_K6_STOP_URL || '',
  LEARNER_MAX_DURATION: process.env.LOAD_K6_MAX_DURATION || '90m',
});

const child = spawn('k6', ['run', path.join(ROOT, 'k6', 'learner.js'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
  env,
});
child.on('exit', (code) => {
  console.log(`\nk6 finished (exit ${code}). Summary: ${path.relative(ROOT, path.join(outDir, 'k6-summary.md'))}`);
  process.exit(code ?? 1);
});
