// Hybrid load test: k6 virtual users (server load) plus browser probes (learner experience), at the
// same time, into one results folder. See docs/load-test.md.
// Usage: npm run load:hybrid
//   LOAD_K6_VUS        k6 virtual users (e.g. 1, 8, 80)
//   LOAD_PROBES        browser probes (e.g. 1, 2, 20)
//   LOAD_STEP          label, e.g. hybrid-2, hybrid-10, hybrid-100 (default hybrid-<vus+probes>)
//   LOAD_RUN_ID        results folder (default: timestamp + label)
//   LOAD_K6_RAMP       time over which the k6 VUs log in (default 1m)
//   LOAD_HYBRID_WARMUP_S  seconds between starting k6 and starting the probes (default 120: all k6
//                      VUs logged in and saving before the browsers start)
//   LOAD_K6_MAX_DURATION  safety limit for k6 (default 90m)
//   LOAD_BASELINE      a browser-only baseline run id, for the probe summary comparison
//
// Each k6 VU logs in ONCE and stays (saving every minute) for exactly as long as the browsers run:
// this script serves a tiny stop flag on 127.0.0.1 (only this machine can reach it), which turns to
// "stop" when the probes finish; the VUs then log out and k6 ends. If this script dies, the flag
// disappears and k6 stops by itself.
// Results: probe-*.json, summary.md (probes, vs baseline), machine.json, k6-summary.md.
import { spawn } from 'child_process';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const vus = Number(process.env.LOAD_K6_VUS) || 1;
const probes = Number(process.env.LOAD_PROBES) || 1;
const label = process.env.LOAD_STEP?.trim() || `hybrid-${vus + probes}`;
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const runId = process.env.LOAD_RUN_ID?.trim() || `${stamp}_${label}`;
const warmupS = Number(process.env.LOAD_HYBRID_WARMUP_S ?? 120);

// --- stop flag for k6 --------------------------------------------------------------------------
let stop = false;
const flag = http.createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify({ stop }));
});
await new Promise((resolve) => flag.listen(0, '127.0.0.1', resolve));
const address = flag.address();
const stopUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}/stop`;

const env = {
  ...process.env,
  LOAD_K6_VUS: String(vus),
  LOAD_PROBES: String(probes),
  LOAD_STEP: label,
  LOAD_RUN_ID: runId,
  LOAD_K6_STOP_URL: stopUrl,
};

console.log(
  `Hybrid run "${runId}": ${vus} k6 VU(s) + ${probes} browser probe(s). k6 logs in first; the browsers start after ${warmupS} s;` +
    ' k6 stays until the browsers finish, then logs out.',
);

/** @param {string} script @returns {Promise<number>} exit code */
const run = (script) =>
  new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', script)], { stdio: 'inherit', env });
    child.on('exit', (code) => resolve(code ?? 1));
  });

const k6Done = run('run-k6.js');
await new Promise((resolve) => setTimeout(resolve, warmupS * 1000));
const probesCode = await run('run-load-probe.js');

console.log('\nBrowsers finished: telling k6 to log out and stop…');
stop = true;
const k6Code = await k6Done;
flag.close();

const dir = path.join('test-logs', 'load', runId);
console.log(`\nHybrid run done. Probes exit ${probesCode}, k6 exit ${k6Code}.`);
console.log(`  Learner experience: ${path.join(dir, 'summary.md')}`);
console.log(`  Server per request: ${path.join(dir, 'k6-summary.md')}`);
process.exit(probesCode || k6Code);
