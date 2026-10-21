// Summarises a load-probe run (test-logs/load/<run>/probe-*.json) and optionally compares it with a
// baseline run. Usage: node scripts/load-probe-summary.js <runDir> [--baseline <runDir>]
// Writes summary.json and summary.md into <runDir> and prints the Markdown.
import fs from 'fs';
import path from 'path';

const [runDirArg, ...rest] = process.argv.slice(2);
if (!runDirArg) {
  console.error('Usage: node scripts/load-probe-summary.js <runDir> [--baseline <runDir>]');
  process.exit(1);
}
const baselineDir = rest.includes('--baseline') ? rest[rest.indexOf('--baseline') + 1] : undefined;

/**
 * Rows of the summary table, in the order the journey happens:
 *   login → open_course → launch → section_1 … section_7 → wait_save → exit → resume → logout.
 * section_N is the time to complete section N; the rows slide, practice, begin_quiz, quiz_answer
 * and save are the individual actions inside the sections (all sections together). journey is
 * the whole run. Anything else recorded is listed at the end.
 */
const STEP_ORDER = [
  'login',
  'open_course',
  'launch',
  'section_1',
  'section_2',
  'section_3',
  'section_4',
  'section_5',
  'section_6',
  'section_7',
  'slide',
  'practice',
  'begin_quiz',
  'quiz_answer',
  'save',
  'wait_save',
  'exit',
  'resume',
  'logout',
  'journey',
];

/** @param {number[]} values @param {number} p 0-100 */
function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(rank, 0), sorted.length - 1)];
}

/** @param {string} dir */
function summarise(dir) {
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^probe-.+\.json$/.test(f)) : [];
  if (!files.length) throw new Error(`No probe-*.json files in ${dir}`);
  const probes = files.map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
  /** @type {Record<string, number[]>} */
  const samples = {};
  const add = (step, ms) => {
    if (typeof ms !== 'number') return;
    (samples[step] ??= []).push(ms);
  };
  let saves = 0;
  let savesOk = 0;
  let resumeTried = 0;
  let resumeOk = 0;
  /** @type {Record<string, number>} */
  const httpErrors = {};
  /** Errors from other websites (e.g. staging's logout redirect to the DMV sign-on). */
  /** @type {Record<string, number>} */
  const externalHttpErrors = {};
  let consoleErrors = 0;
  let pageErrors = 0;
  /** @type {Record<string, number>} */
  const pageErrorTexts = {};
  for (const probe of probes) {
    for (const t of probe.timings ?? []) if (t.ok) add(t.step, t.ms);
    for (const s of probe.saves ?? []) {
      saves++;
      if (s.ok) savesOk++;
      add('save', s.ms);
    }
    // Section durations from the "section_complete" marks (time since the previous one / the launch).
    const launchEnd = (probe.timings ?? []).find((t) => t.step === 'launch' && t.ok);
    let previous = launchEnd ? Date.parse(launchEnd.end) : null;
    for (const mark of (probe.marks ?? []).filter((m) => m.event === 'section_complete')) {
      const at = Date.parse(mark.at);
      if (previous !== null) add(`section_${mark.number}`, at - previous);
      previous = at;
    }
    if (probe.passed) add('journey', probe.durationMs);
    if (probe.checks && 'resumedAt' in probe.checks) {
      resumeTried++;
      if (probe.checks.resumedAt === 'End') resumeOk++;
    }
    for (const e of probe.httpErrors ?? []) {
      const key = `${e.status} ${e.statusText} ${e.method} ${e.path}`.replace(/\s+/g, ' ').trim();
      // Older files have no "external" flag: decide by host.
      const external = e.external ?? !String(e.path).startsWith(probe.host);
      const bucket = external ? externalHttpErrors : httpErrors;
      bucket[key] = (bucket[key] ?? 0) + 1;
    }
    consoleErrors += (probe.consoleErrors ?? []).length;
    pageErrors += (probe.pageErrors ?? []).length;
    for (const e of probe.pageErrors ?? []) pageErrorTexts[e.text] = (pageErrorTexts[e.text] ?? 0) + 1;
  }
  const steps = [...STEP_ORDER.filter((s) => samples[s]), ...Object.keys(samples).filter((s) => !STEP_ORDER.includes(s))];
  const machineFile = path.join(dir, 'machine.json');
  return {
    run: path.basename(dir),
    label: probes[0]?.step,
    host: probes[0]?.host,
    probes: probes.length,
    passed: probes.filter((p) => p.passed).length,
    completionRate: probes.filter((p) => p.passed).length / probes.length,
    saveSuccessRate: saves ? savesOk / saves : null,
    saves,
    resumeSuccessRate: resumeTried ? resumeOk / resumeTried : null,
    resumeTried,
    failures: probes.filter((p) => !p.passed).map((p) => ({ username: p.username, error: p.error })),
    steps: Object.fromEntries(
      steps.map((step) => {
        const v = samples[step];
        return [step, { count: v.length, p50: percentile(v, 50), p95: percentile(v, 95), max: Math.max(...v) }];
      }),
    ),
    errors: { http: httpErrors, httpExternal: externalHttpErrors, console: consoleErrors, page: pageErrors, pageTexts: pageErrorTexts },
    machine: fs.existsSync(machineFile) ? JSON.parse(fs.readFileSync(machineFile, 'utf8')) : null,
  };
}

const sec = (ms) => (ms === null || ms === undefined ? '–' : `${(ms / 1000).toFixed(ms < 10_000 ? 2 : 1)} s`);
const pct = (r) => (r === null || r === undefined ? '–' : `${Math.round(r * 100)}%`);
const ratio = (now, before) => (now && before ? `×${(now / before).toFixed(1)}` : '');

const summary = summarise(runDirArg);
const baseline = baselineDir ? summarise(baselineDir) : null;

const md = [];
md.push(`# Load probe summary: ${summary.run}`);
md.push('');
md.push(`Label **${summary.label}**, host ${summary.host}, ${summary.probes} probe(s).`);
md.push('');
md.push('| | |');
md.push('|---|---|');
md.push(`| Completion | ${pct(summary.completionRate)} (${summary.passed}/${summary.probes}) |`);
md.push(`| Saves OK | ${pct(summary.saveSuccessRate)} (${summary.saves} saves) |`);
md.push(`| Resume OK | ${pct(summary.resumeSuccessRate)} (${summary.resumeTried} tried) |`);
md.push(`| HTTP errors (≥ 400) from ${summary.host} | ${Object.values(summary.errors.http).reduce((a, b) => a + b, 0)} |`);
md.push(`| HTTP errors from other websites | ${Object.values(summary.errors.httpExternal).reduce((a, b) => a + b, 0)} |`);
md.push(`| Console / page errors | ${summary.errors.console} / ${summary.errors.page} |`);
if (summary.machine) {
  md.push(
    `| This machine | CPU avg ${summary.machine.cpuAvg}% / max ${summary.machine.cpuMax}% (${summary.machine.cpus} cores), ` +
      `RAM ~${summary.machine.memPerBrowserMb} MB per browser |`,
  );
}
md.push('');
if (baseline) {
  md.push(`Compared with baseline **${baseline.label}** (${baseline.run}).`);
  md.push('');
}
md.push(
  baseline
    ? '| Step | Count | p50 | p95 | Max | p50 vs baseline | p95 vs baseline |'
    : '| Step | Count | p50 | p95 | Max |',
);
md.push(baseline ? '|---|---|---|---|---|---|---|' : '|---|---|---|---|---|');
for (const [step, s] of Object.entries(summary.steps)) {
  const row = `| ${step} | ${s.count} | ${sec(s.p50)} | ${sec(s.p95)} | ${sec(s.max)} |`;
  if (!baseline) {
    md.push(row);
    continue;
  }
  const b = baseline.steps[step];
  md.push(
    `${row} ${b ? `${sec(b.p50)} → ${sec(s.p50)} ${ratio(s.p50, b.p50)}` : '–'} | ${b ? `${sec(b.p95)} → ${sec(s.p95)} ${ratio(s.p95, b.p95)}` : '–'} |`,
  );
}
if (Object.keys(summary.errors.http).length) {
  md.push('');
  md.push('## HTTP errors');
  for (const [key, count] of Object.entries(summary.errors.http)) md.push(`- ${count} × ${key}`);
}
if (Object.keys(summary.errors.httpExternal).length) {
  md.push('');
  md.push('## HTTP errors from other websites (not the site under test)');
  for (const [key, count] of Object.entries(summary.errors.httpExternal)) md.push(`- ${count} × ${key}`);
}
if (Object.keys(summary.errors.pageTexts).length) {
  md.push('');
  md.push('## Page errors');
  for (const [text, count] of Object.entries(summary.errors.pageTexts)) md.push(`- ${count} × ${text}`);
}
if (summary.failures.length) {
  md.push('');
  md.push('## Failed probes');
  for (const f of summary.failures) md.push(`- ${f.username}: ${String(f.error).split('\n')[0]}`);
}
md.push('');
md.push('Notes: rows follow the journey. section_N = time to complete section N. slide, practice,');
md.push('begin_quiz, quiz_answer and save are the actions inside all sections ("slide" is mostly narration');
md.push('time, not server time; "save" is the server response time of each POST /mod/scorm/datamodel.php).');
md.push('journey = the whole run, for probes that passed.');

const text = md.join('\n');
fs.writeFileSync(path.join(runDirArg, 'summary.md'), `${text}\n`);
fs.writeFileSync(path.join(runDirArg, 'summary.json'), `${JSON.stringify({ ...summary, baseline: baseline?.run ?? null }, null, 2)}\n`);
console.log(`\n${text}\n`);
