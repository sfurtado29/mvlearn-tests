export class Header {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.nav = page.getByRole('navigation', { name: 'Site navigation' });

    this.homeTab = this.nav.getByRole('menuitem', { name: 'Home', exact: true });
    this.dashboardTab = this.nav.getByRole('menuitem', { name: 'Dashboard', exact: true });
    this.myCoursesTab = this.nav.getByRole('menuitem', { name: 'My courses', exact: true });
    // Manager only.
    this.siteAdminTab = this.nav.getByRole('menuitem', { name: 'Site administration', exact: true });
    this.loginLink = this.nav.getByRole('link', { name: 'Log in', exact: true });

    // Label includes the unread count, e.g. "Show notification window with 1 new notifications".
    this.notificationsButton = page.getByRole('button', { name: /Show notification window/ });
    this.notificationsPopover = page.getByRole('dialog', { name: 'Notification window' });
    // Read-only links; never click a notification itself (that marks it as read).
    this.notificationsSeeAll = this.notificationsPopover.getByRole('link', { name: 'See all' });
    this.notificationPreferencesLink = this.notificationsPopover.getByRole('link', { name: 'Notification preferences' });
    this.notificationsCloseButton = this.notificationsPopover.getByRole('button', { name: 'Close' });

    this.messagingButton = page.getByRole('button', { name: 'Toggle messaging drawer' });
    this.messagingDrawer = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Messaging', exact: true }) });
    this.messagingCloseLink = this.messagingDrawer.getByRole('link', { name: 'Close', exact: true });
    this.messagingSearch = this.messagingDrawer.getByRole('textbox', { name: 'Search' });
    this.messagingPerformSearch = this.messagingDrawer.getByRole('button', { name: 'Perform search' });

    this.userMenuButton = page.getByRole('button', { name: 'User menu' });
    this.userMenu = page.getByRole('menu', { name: 'User' });
    this.logoutItem = this.userMenu.getByRole('menuitem', { name: 'Log out' });

    // Not present on dev (single language). Kept so a test can detect it.
    this.languageMenuButton = this.nav.getByRole('button', { name: /^Language/ });
  }

  /**
   * Messaging drawer section toggle: "Starred", "Group" or "Private". Once loaded, the name
   * includes a count, e.g. "Private 0 total conversations".
   * @param {string} name
   */
  messagingSection(name) {
    return this.messagingDrawer.getByRole('button', { name: new RegExp(`^${name}( \\d+ total conversations?)?$`) });
  }

  /** @param {string} name e.g. "Profile", "Grades", "Preferences" */
  userMenuItem(name) {
    return this.userMenu.getByRole('menuitem', { name, exact: true });
  }

  async logout() {
    await this.userMenuButton.click();
    await this.logoutItem.click();
  }
}
