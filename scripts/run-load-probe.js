// Runs the load-test browser probes (tests/user/load/probe.spec.js) and watches this machine.
// Usage: npm run load:probe [-- extra playwright args]
//   LOAD_PROBES   how many probes (first N of LOAD_PROBE_POOL); default all. Also the worker count.
//   LOAD_STEP     label for the run, e.g. baseline-1, baseline-10, hybrid-100 (default probe-<N>).
//   LOAD_RUN_ID   results folder name under test-logs/load/ (default: timestamp + label).
//   LOAD_BASELINE a previous run id to compare against in the summary.
//   LOAD_CPU_LIMIT  CPU % that counts as overloaded (default 80); LOAD_CPU_ABORT=1 stops the run when
//                   it stays above that for 3 samples in a row (15 s).
// Writes test-logs/load/<run>/machine.json (CPU/RAM samples) and summary.json / summary.md.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

const poolSize = String(process.env.LOAD_PROBE_POOL ?? '').split(';').map((e) => e.trim()).filter(Boolean).length;
const probes = Number(process.env.LOAD_PROBES) || poolSize;
if (!probes) {
  console.error('No probes: add LOAD_PROBE_POOL to .env (see .env.example and docs/load-test.md).');
  process.exit(1);
}
const label = process.env.LOAD_STEP?.trim() || `probe-${probes}`;
const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
const runId = process.env.LOAD_RUN_ID?.trim() || `${stamp}_${label}`;
const dir = path.join(ROOT, 'test-logs', 'load', runId);
fs.mkdirSync(dir, { recursive: true });
const cpuLimit = Number(process.env.LOAD_CPU_LIMIT) || 80;
const abortOnCpu = process.env.LOAD_CPU_ABORT === '1';

console.log(`Load probe run "${runId}": ${probes} probe(s), label ${label}, results in ${path.relative(ROOT, dir)}`);

// --- machine sampling ------------------------------------------------------------------------
const cpuTotals = () =>
  os.cpus().reduce(
    (sum, cpu) => {
      const t = cpu.times;
      sum.idle += t.idle;
      sum.total += t.user + t.nice + t.sys + t.idle + t.irq;
      return sum;
    },
    { idle: 0, total: 0 },
  );
const usedMb = () => Math.round((os.totalmem() - os.freemem()) / 1024 / 1024);
const machine = {
  cpus: os.cpus().length,
  cpuModel: os.cpus()[0]?.model,
  totalMemMb: Math.round(os.totalmem() / 1024 / 1024),
  usedMemBeforeMb: usedMb(),
  cpuLimit,
  samples: /** @type {{ at: string, cpu: number, usedMemMb: number }[]} */ ([]),
};
let previous = cpuTotals();
let overLimitStreak = 0;
let aborted = false;
const sampler = setInterval(() => {
  const current = cpuTotals();
  const total = current.total - previous.total;
  const cpu = total > 0 ? Math.round(100 * (1 - (current.idle - previous.idle) / total)) : 0;
  previous = current;
  machine.samples.push({ at: new Date().toISOString(), cpu, usedMemMb: usedMb() });
  overLimitStreak = cpu > cpuLimit ? overLimitStreak + 1 : 0;
  if (overLimitStreak === 3) {
    console.warn(`\n!! CPU above ${cpuLimit}% for 15 s (now ${cpu}%): this machine is a bottleneck; timings are not trustworthy.`);
    if (abortOnCpu && !aborted) {
      aborted = true;
      console.warn('!! LOAD_CPU_ABORT=1: stopping the run.');
      killTree(child.pid);
    }
  }
}, 5_000);

/** @param {number | undefined} pid */
function killTree(pid) {
  if (!pid) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(pid), '/T', '/F']);
  else process.kill(-pid, 'SIGTERM');
}

// --- run the probes --------------------------------------------------------------------------
const args = [
  'playwright',
  'test',
  '--project=user',
  '--no-deps',
  '--grep',
  '@load-probe',
  `--workers=${probes}`,
  ...process.argv.slice(2),
];
const child = spawn('npx', args, {
  stdio: 'inherit',
  shell: true,
  detached: process.platform !== 'win32',
  env: { ...process.env, LOAD_PROBE_RUN: '1', LOAD_PROBES: String(probes), LOAD_STEP: label, LOAD_RUN_ID: runId },
});

child.on('exit', (code) => {
  clearInterval(sampler);
  const cpus = machine.samples.map((s) => s.cpu);
  const peakMem = Math.max(machine.usedMemBeforeMb, ...machine.samples.map((s) => s.usedMemMb));
  const result = {
    ...machine,
    probes,
    aborted,
    cpuMax: cpus.length ? Math.max(...cpus) : null,
    cpuAvg: cpus.length ? Math.round(cpus.reduce((a, b) => a + b, 0) / cpus.length) : null,
    usedMemPeakMb: peakMem,
    // Rough per-browser cost: extra memory at the peak, divided by the number of browsers.
    memPerBrowserMb: Math.round((peakMem - machine.usedMemBeforeMb) / probes),
  };
  fs.writeFileSync(path.join(dir, 'machine.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `\nMachine: CPU avg ${result.cpuAvg}% / max ${result.cpuMax}% (limit ${cpuLimit}%), RAM +${peakMem - machine.usedMemBeforeMb} MB at peak` +
      ` (~${result.memPerBrowserMb} MB per browser).`,
  );

  const summaryArgs = [path.join(ROOT, 'scripts', 'load-probe-summary.js'), dir];
  if (process.env.LOAD_BASELINE?.trim()) summaryArgs.push('--baseline', path.join(ROOT, 'test-logs', 'load', process.env.LOAD_BASELINE.trim()));
  spawnSync(process.execPath, summaryArgs, { stdio: 'inherit' });
  process.exit(code ?? 1);
});
