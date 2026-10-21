// Manager role: Site administration > Reports tab. Every report opens without a permission error and
// shows its content. Read-only: only links, the Reports tab and "Get these logs" (a GET search) are
// clicked; never Disable, Add a new rule, New report, Pause live updates or a check's action link.
import { test, expect } from '../../fixtures.js';
import { SiteAdminPage } from '../../pages/manager/SiteAdminPage.js';

// Link on the Reports tab, the page it opens and something that proves its content loaded.
// Verified on dev (Moodle 4.5) as the Manager role on 2026-10-13.
const REPORT_PAGES = [
  {
    link: 'Comments',
    url: /\/comment\/index\.php/,
    heading: 'Comments',
    content: (main) => main.getByRole('table').or(main.getByText('Nothing to display')).first(),
  },
  {
    link: 'Backups',
    url: /\/report\/backups\/index\.php/,
    heading: 'Last execution log',
    content: (main) => main.getByRole('columnheader', { name: 'Next backup' }),
  },
  {
    link: 'Insights',
    url: /\/report\/insights\/insights\.php\?contextid=1/,
    // Insights has no h2; its h1 is the context name.
    heading: { name: 'System', level: 1 },
    content: (main) => main.getByText('No insights reported').or(main.getByRole('table')).first(),
  },
  {
    link: 'Logs',
    url: /\/report\/log\/index\.php/,
    heading: 'Logs',
    content: (main) => main.getByRole('button', { name: 'Get these logs' }),
  },
  {
    link: 'Live logs',
    url: /\/report\/loglive\/index\.php/,
    heading: 'Live logs',
    content: (main) => main.getByRole('columnheader', { name: 'Event name' }),
  },
  {
    link: 'Performance overview',
    url: /\/report\/performance\/index\.php/,
    heading: 'Performance overview',
    content: (main) => main.getByRole('columnheader', { name: 'Check', exact: true }),
  },
  {
    link: 'Security checks',
    url: /\/report\/security\/index\.php/,
    heading: 'Security checks',
    content: (main) => main.getByRole('columnheader', { name: 'Check', exact: true }),
  },
  {
    link: 'System status',
    url: /\/report\/status\/index\.php/,
    heading: 'System status',
    content: (main) => main.getByRole('columnheader', { name: 'Check', exact: true }),
  },
  {
    link: 'Event monitoring rules',
    url: /\/admin\/tool\/monitor\/managerules\.php\?courseid=0/,
    heading: 'Event monitoring rules',
    content: (main) => main.getByText(/Event monitoring is currently (enabled|disabled)/),
  },
  {
    link: 'Report builder',
    url: /\/admin\/category\.php\?category=reportbuilder/,
    heading: 'Category: Report builder',
    content: (main) => main.getByRole('link', { name: 'Custom reports', exact: true }),
  },
  {
    link: 'Custom reports',
    url: /\/reportbuilder\/index\.php/,
    heading: 'Custom reports',
    content: (main) => main.getByRole('button', { name: 'New report' }),
  },
];

// Pages built from Moodle's check API: one row per check, Status / Check / Summary / Action.
const CHECK_PAGES = REPORT_PAGES.filter(({ link }) =>
  ['Performance overview', 'Security checks', 'System status'].includes(link),
);
const CHECK_STATUSES = ['OK', 'Info', 'N/A', 'Unknown', 'Warning', 'Error', 'Critical'];

/** Moodle's "no permission" page, or a stack-trace error page. */
const accessError = (page) =>
  page.getByText(/do not currently have permissions|Access denied|Sorry, the requested page could not be found/);

test.describe('Site administration > Reports (Manager)', { tag: '@regression' }, () => {
  test.describe.configure({ timeout: 60_000 });

  /** @type {SiteAdminPage} */
  let admin;

  test.beforeEach(async ({ page }) => {
    admin = new SiteAdminPage(page);
    await admin.goto();
    await expect(admin.heading).toBeVisible();
    await admin.reportsTab.click();
    await expect(admin.reportsTab).toHaveAttribute('aria-selected', 'true');
  });

  for (const { link, url, heading, content } of REPORT_PAGES) {
    test(`MR1 "${link}" opens and shows its content`, async ({ page }) => {
      await admin.link(link).click();

      await expect(page).toHaveURL(url);
      await expect(accessError(page)).toHaveCount(0);
      const headingOptions = typeof heading === 'string' ? { name: heading, level: 2 } : heading;
      await expect(page.getByRole('heading', { ...headingOptions, exact: true })).toBeVisible();
      await expect(content(admin.main)).toBeVisible();
    });
  }

  test('MR2 Logs: "Get these logs" lists site log entries', async ({ page }) => {
    await admin.link('Logs').click();
    await expect(admin.main.getByRole('combobox', { name: 'Select a course' })).toHaveValue('1');
    await admin.main.getByRole('button', { name: 'Get these logs' }).click();

    await expect(page).toHaveURL(/\/report\/log\/index\.php\?chooselog=1/);
    for (const column of ['Time', 'User full name', 'Event name', 'Description', 'IP address']) {
      await expect.soft(admin.main.getByRole('columnheader', { name: column, exact: true }), `"${column}" column`).toBeVisible();
    }
    // The Manager's own login for this run is always logged.
    await expect(admin.main.getByRole('table').locator('tbody tr').first()).toBeVisible();
  });

  test('MR3 Live logs shows the past hour, including this Manager session', async () => {
    await admin.link('Live logs').click();
    await expect(admin.main.getByText('Live logs from the past hour')).toBeVisible();
    await expect(admin.main.getByRole('table').locator('tbody tr').first()).toBeVisible();
  });

  for (const { link } of CHECK_PAGES) {
    // Warnings and errors are site configuration findings, not test failures: they are recorded as
    // annotations and an attachment (HTML report) for the results doc.
    test(`MR4 "${link}" lists checks with a status each`, async () => {
      await admin.link(link).click();
      for (const column of ['Status', 'Check', 'Summary', 'Action']) {
        await expect(admin.main.getByRole('columnheader', { name: column, exact: true })).toBeVisible();
      }

      const rows = await admin.main
        .getByRole('table')
        .locator('tbody tr')
        .evaluateAll((trs) => trs.map((tr) => ({ status: tr.cells[0]?.innerText.trim(), check: tr.cells[1]?.innerText.trim() })));
      expect(rows.length, 'number of checks').toBeGreaterThan(0);
      for (const { status, check } of rows) {
        expect.soft(CHECK_STATUSES, `status of "${check}"`).toContain(status);
      }

      const findings = rows.filter(({ status }) => ['Warning', 'Error', 'Critical'].includes(status));
      for (const { status, check } of findings) {
        test.info().annotations.push({ type: `${link}: ${status}`, description: check });
      }
      await test.info().attach(`${link} checks.txt`, {
        body: rows.map(({ status, check }) => `${status.padEnd(8)} ${check}`).join('\n'),
        contentType: 'text/plain',
      });
    });
  }
});
