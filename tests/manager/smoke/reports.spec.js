// Read-only: opens pages and checks content; never clicks report actions (Security checks,
// Performance overview and Insights can start work on the server).
import { test, expect } from '../../fixtures.js';
import { Header } from '../../pages/common/Header.js';
import { DashboardPage } from '../../pages/common/DashboardPage.js';
import { SiteAdminPage } from '../../pages/manager/SiteAdminPage.js';

test.describe('Site administration > Reports', { tag: '@smoke' }, () => {
  test('MS1 Reports tab lists every report', async ({ page }) => {
    await new DashboardPage(page).goto();
    await new Header(page).siteAdminTab.click();
    await expect(page).toHaveURL(/\/admin\/search\.php/);

    const admin = new SiteAdminPage(page);
    await expect(admin.heading).toBeVisible();
    await admin.reportsTab.click();
    await expect(admin.reportsTab).toHaveAttribute('aria-selected', 'true');
    await expect(admin.reportsHeading).toBeVisible();

    // Soft, so one run lists every missing link.
    for (const name of SiteAdminPage.REPORT_LINKS) {
      await expect.soft(admin.link(name), `"${name}" link`).toBeVisible();
    }
    await expect(admin.reportBuilderHeading).toBeVisible();
    await expect(admin.link('Custom reports')).toBeVisible();
  });
});
