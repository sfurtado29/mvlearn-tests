// Site administration (/admin/search.php), verified on dev as the Manager role. Each tab
// (General, Users, ..., Reports) is a role=tab; only the selected tab's links are visible.
export class SiteAdminPage {
  /** Links under the "Reports" heading of the Reports tab, in page order. */
  static REPORT_LINKS = [
    'Comments',
    'Backups',
    'Insights',
    'Logs',
    'Live logs',
    'Performance overview',
    'Security checks',
    'System status',
    'Event monitoring rules',
  ];

  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Site administration', level: 1 });
    this.main = page.getByRole('main');
    this.reportsTab = page.getByRole('tab', { name: 'Reports', exact: true });
    this.reportsHeading = this.main.getByRole('heading', { name: 'Reports', level: 4 });
    this.reportBuilderHeading = this.main.getByRole('heading', { name: 'Report builder', level: 4 });
  }

  async goto() {
    return this.page.goto('/admin/search.php');
  }

  /** @param {string} name a link on the selected tab, e.g. one of SiteAdminPage.REPORT_LINKS */
  link(name) {
    return this.main.getByRole('link', { name, exact: true });
  }
}
