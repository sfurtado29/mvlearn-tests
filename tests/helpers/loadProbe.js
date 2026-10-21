// Records what one load-test browser probe experienced: step timings, every SCORM save, HTTP
// errors, console errors and page errors. Written to test-logs/load/<LOAD_RUN_ID>/probe-<user>.json.
// See docs/load-test.md. Never records credentials.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Page errors that are harmless noise (see docs/scorm-notes.md). */
const IGNORED_PAGE_ERRORS = [/The play\(\) request was interrupted by a call to pause\(\)/];

const isDatamodel = (url) => /\/mod\/scorm\/datamodel\.php/.test(url);

/** Run id shared by every probe of one run: LOAD_RUN_ID, else the current minute. */
export function loadRunId() {
  const fromEnv = process.env.LOAD_RUN_ID?.trim();
  if (fromEnv) return fromEnv;
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `manual-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
}

/** Folder of a run's results. */
export function runDir(runId = loadRunId()) {
  return path.join(ROOT, 'test-logs', 'load', runId);
}

export class ProbeRecorder {
  /**
   * @param {{ username: string, host: string }} options
   */
  constructor({ username, host }) {
    this.t0 = Date.now();
    this.data = {
      runId: loadRunId(),
      step: process.env.LOAD_STEP?.trim() || 'unlabelled',
      username,
      host,
      passed: false,
      error: null,
      startedAt: new Date(this.t0).toISOString(),
      finishedAt: null,
      durationMs: null,
      /** @type {{ step: string, ms: number, start: string, end: string, ok: boolean, [key: string]: unknown }[]} */
      timings: [],
      /** @type {{ event: string, at: string, msFromStart: number, [key: string]: unknown }[]} */
      marks: [],
      /** @type {{ at: string, ms: number | null, status: number | string, ok: boolean }[]} */
      saves: [],
      /** @type {{ at: string, method: string, path: string, status: number, statusText: string }[]} */
      httpErrors: [],
      /** @type {{ at: string, text: string }[]} */
      consoleErrors: [],
      /** @type {{ at: string, text: string }[]} */
      pageErrors: [],
      /** @type {Record<string, unknown>} */
      checks: {},
    };
  }

  /**
   * Run `fn`, recording its duration under `step` (also when it throws).
   * @template T
   * @param {string} step
   * @param {() => Promise<T>} fn
   * @param {object | ((result: T) => object)} [details]
   * @returns {Promise<T>}
   */
  async time(step, fn, details = {}) {
    const start = Date.now();
    let result;
    let ok = false;
    try {
      result = await fn();
      ok = true;
      return result;
    } finally {
      const end = Date.now();
      let extra = {};
      try {
        extra = typeof details === 'function' ? (ok ? details(result) : {}) : details;
      } catch {
        extra = {};
      }
      this.data.timings.push({
        step,
        ms: end - start,
        start: new Date(start).toISOString(),
        end: new Date(end).toISOString(),
        ok,
        ...extra,
      });
    }
  }

  /**
   * Record an instant event (e.g. a section completed).
   * @param {string} event
   * @param {object} [details]
   */
  mark(event, details = {}) {
    const now = Date.now();
    this.data.marks.push({ event, at: new Date(now).toISOString(), msFromStart: now - this.t0, ...details });
  }

  /**
   * @param {string} name
   * @param {unknown} value
   */
  check(name, value) {
    this.data.checks[name] = value;
  }

  /**
   * Listen to the page: SCORM saves (response time + status), HTTP errors (>= 400), console errors
   * and page errors.
   * @param {import('@playwright/test').Page} page
   */
  listen(page) {
    const at = () => new Date().toISOString();
    page.on('requestfinished', async (request) => {
      if (!isDatamodel(request.url()) || request.method() !== 'POST') return;
      const response = await request.response().catch(() => null);
      const timing = request.timing();
      const ms = timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : null;
      const status = response?.status() ?? 'no response';
      this.data.saves.push({ at: at(), ms, status, ok: typeof status === 'number' && status < 400 });
    });
    page.on('requestfailed', (request) => {
      if (!isDatamodel(request.url()) || request.method() !== 'POST') return;
      this.data.saves.push({ at: at(), ms: null, status: request.failure()?.errorText ?? 'failed', ok: false });
    });
    page.on('response', (response) => {
      if (response.status() < 400) return;
      const url = new URL(response.url());
      this.data.httpErrors.push({
        at: at(),
        method: response.request().method(),
        path: `${url.host}${url.pathname}`,
        status: response.status(),
        statusText: response.statusText(),
        // Another website, e.g. staging's logout redirect to the DMV single sign-on (403, 2026-10-21):
        // reported separately so it is not counted as an error of the site under test.
        external: url.hostname !== this.data.host,
      });
    });
    page.on('console', (message) => {
      if (message.type() === 'error') this.data.consoleErrors.push({ at: at(), text: message.text().slice(0, 500) });
    });
    page.on('pageerror', (error) => {
      if (IGNORED_PAGE_ERRORS.some((pattern) => pattern.test(error.message))) return;
      this.data.pageErrors.push({ at: at(), text: error.message.slice(0, 500) });
    });
  }

  /** @param {unknown} error */
  fail(error) {
    this.data.passed = false;
    this.data.error = String(error instanceof Error ? error.message : error).split('\n').slice(0, 6).join('\n');
  }

  pass() {
    this.data.passed = true;
  }

  /** Write the JSON (always, also after a failure). Returns the file path. */
  write() {
    const end = Date.now();
    this.data.finishedAt = new Date(end).toISOString();
    this.data.durationMs = end - this.t0;
    const dir = runDir(this.data.runId);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `probe-${this.data.username.replace(/[^\w.-]/g, '_')}.json`);
    fs.writeFileSync(file, `${JSON.stringify(this.data, null, 2)}\n`);
    return file;
  }
}
