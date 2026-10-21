// Playwright reporter: one folder per run under test-logs/<timestamp>/, kept forever.
//   run.log       readable log: local timestamps, result and duration per test, first error line
//   results.json  the same data, machine-readable
//   artifacts/    copies of failure screenshots and videos (never traces: they can hold typed passwords)
// Any value of a *_PASSWORD env var (and SCORM_POOL passwords) is masked before writing.
import fs from 'fs';
import path from 'path';

const pad = (n, width = 2) => String(n).padStart(width, '0');

/** Local time like "2026-10-09 12:52:23". */
const stamp = (date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

/** UTC offset like "UTC+05:30". */
const utcOffset = (date) => {
  const minutes = -date.getTimezoneOffset();
  const sign = minutes >= 0 ? '+' : '-';
  return `UTC${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
};

// Continuation lines (command, Error, Reason, Saved) line up under the result column.
const INDENT = ' '.repeat(30);

const seconds = (ms) =>`${(ms / 1000).toFixed(1)}s`;
const stripAnsi = (text) => text.replace(/\u001b\[[0-9;]*m/g, '');

function secrets() {
  const values = Object.entries(process.env)
    .filter(([key, value]) => /PASSWORD$/.test(key) && value)
    .map(([, value]) => value);
  for (const entry of String(process.env.SCORM_POOL ?? '').split(';')) {
    const index = entry.indexOf(':');
    if (index > 0 && entry.slice(index + 1)) values.push(entry.slice(index + 1));
  }
  return values.sort((a, b) => b.length - a.length);
}

export default class RunLogReporter {
  constructor(options = {}) {
    this.rootDir = options.outputDir ?? 'test-logs';
    this.secrets = secrets();
    this.records = [];
    this.copies = [];
  }

  printsToStdio() {
    return false;
  }

  onBegin(config, suite) {
    this.start = new Date();
    const folderName = stamp(this.start).replace(' ', '_').replace(/:/g, '-');
    // Anchor logs at the project root (next to playwright.config.js).
    this.dir = path.resolve(path.dirname(config.configFile ?? config.rootDir), this.rootDir, folderName);
    fs.mkdirSync(path.join(this.dir, 'artifacts'), { recursive: true });
    this.logFile = path.join(this.dir, 'run.log');

    const host = (() => {
      try {
        return new URL(String(process.env.BASE_URL)).hostname;
      } catch {
        return 'unknown';
      }
    })();
    this.header = {
      start: stamp(this.start),
      timezone: utcOffset(this.start),
      environment: host,
      workers: config.workers,
      tests: suite.allTests().length,
      playwright: config.version,
      command: process.argv.slice(2).join(' '),
    };
    this.#write(`Times are local (${this.header.timezone}). Test lines: start time, end time, result, test, duration.`);
    this.#line(this.start, 'RUN START', `env=${host}  tests=${this.header.tests}  workers=${config.workers}`);
    this.#write(`${INDENT}command: ${this.header.command}`);
  }

  onTestEnd(test, result) {
    const outcome = test.outcome();
    const label =
      result.status === 'skipped'
        ? 'SKIPPED'
        : outcome === 'expected' && result.status !== 'passed'
          ? 'EXPECTED FAIL'
          : outcome === 'flaky' && result.status === 'passed'
            ? 'PASSED (after retry)'
            : result.status === 'passed'
              ? 'PASSED'
              : result.status === 'timedOut'
                ? 'TIMED OUT'
                : result.status.toUpperCase();
    const [, file, ...titles] = test.titlePath().filter(Boolean);
    const title = titles.join(' > ');
    const location = `${path.relative(process.cwd(), test.location.file)}:${test.location.line}`;
    const error = result.error
      ? this.#mask(stripAnsi(result.error.message ?? String(result.error.value ?? '')))
          .split('\n')[0]
          .replace(/^Error:\s*/, '')
      : '';
    const skipReason = test.annotations.find((a) => a.type === 'skip' || a.type === 'fixme')?.description ?? '';

    const artifacts = [];
    if (result.status !== 'passed' && result.status !== 'skipped') {
      for (const attachment of result.attachments) {
        if (!attachment.path || !['screenshot', 'video'].includes(attachment.name)) continue;
        const target = path.join(
          'artifacts',
          `${pad(this.records.length + 1, 3)}-${attachment.name}-${path.basename(attachment.path)}`,
        );
        artifacts.push(target.replace(/\\/g, '/'));
        this.copies.push({ from: attachment.path, to: path.join(this.dir, target) });
      }
    }

    const end = new Date(result.startTime.getTime() + result.duration);
    const record = {
      start: stamp(result.startTime),
      end: stamp(end),
      durationSeconds: Number((result.duration / 1000).toFixed(1)),
      result: label,
      title,
      file: file ?? '',
      location,
      project: test.parent.project()?.name ?? '',
      retry: result.retry,
      repeat: test.repeatEachIndex,
      error,
      skipReason,
      artifacts,
    };
    this.records.push(record);

    const repeat = test.repeatEachIndex ? ` [repeat ${test.repeatEachIndex}]` : '';
    const retry = result.retry ? ` [retry ${result.retry}]` : '';
    this.#line(result.startTime, label, `${title}${repeat}${retry}  (${seconds(result.duration)})  ${location}`, end);
    if (error) this.#write(`${INDENT}Error: ${error}`);
    if (skipReason) this.#write(`${INDENT}Reason: ${skipReason}`);
    for (const artifact of artifacts) this.#write(`${INDENT}Saved: ${artifact}`);
  }

  async onEnd(result) {
    for (const { from, to } of this.copies) {
      try {
        fs.copyFileSync(from, to);
      } catch {
        // The original may already be gone; the log still names it.
      }
    }
    const count = (name) => this.records.filter((r) => r.result === name).length;
    const summary = {
      passed: count('PASSED') + count('PASSED (after retry)'),
      failed: this.records.filter((r) => ['FAILED', 'TIMED OUT', 'INTERRUPTED'].includes(r.result)).length,
      expectedFailures: count('EXPECTED FAIL'),
      flaky: count('PASSED (after retry)'),
      skipped: count('SKIPPED'),
    };
    const end = new Date();
    this.#line(
      end,
      'RUN END',
      `${result.status.toUpperCase()}  passed=${summary.passed}  failed=${summary.failed}  ` +
        `expected-fail=${summary.expectedFailures}  flaky=${summary.flaky}  skipped=${summary.skipped}  ` +
        `(${seconds(result.duration)})`,
    );
    const json = {
      ...this.header,
      end: stamp(end),
      status: result.status,
      durationSeconds: Number((result.duration / 1000).toFixed(1)),
      summary,
      tests: this.records,
    };
    fs.writeFileSync(path.join(this.dir, 'results.json'), this.#mask(JSON.stringify(json, null, 2)));
    if (!this.copies.length) fs.rmSync(path.join(this.dir, 'artifacts'), { recursive: true, force: true });
    console.log(`\nRun log: ${path.relative(process.cwd(), this.logFile)}`);
  }

  /** "<start> [– <end time>]  LABEL  text"; run lines have no end time. */
  #line(date, label, text, end) {
    const until = end ? `-${stamp(end).slice(11)}` : '         ';
    this.#write(`${stamp(date)}${until}  ${label.padEnd(13)}  ${text}`);
  }

  #write(text) {
    fs.appendFileSync(this.logFile, `${this.#mask(text)}\n`);
  }

  #mask(text) {
    let masked = text;
    for (const secret of this.secrets) masked = masked.split(secret).join('***');
    return masked;
  }
}
