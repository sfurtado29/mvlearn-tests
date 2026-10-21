import { labelOf } from '../../helpers/ui.js';

export class DashboardPage {
  /** Timeline date filter options, verified on dev. */
  static TIMELINE_FILTERS = ['All', 'Overdue', 'Next 7 days', 'Next 30 days', 'Next 3 months', 'Next 6 months'];
  static TIMELINE_SORTS = ['Sort by dates', 'Sort by courses'];

  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Dashboard', level: 1 });
    this.greeting = page.getByRole('banner').getByText(/Hi, .+!/);
    // The dashboard has many regions; always target one by name.
    this.timeline = page.getByRole('region', { name: 'Timeline' });
    this.calendar = page.getByRole('region', { name: 'Calendar' });

    // Timeline. Filter and sort choices are saved as user preferences: restore them after a test.
    this.timelineFilterButton = this.timeline.getByRole('button', { name: 'Filter timeline by date' });
    this.timelineSortButton = this.timeline.getByRole('button', { name: 'Sort timeline items' });
    this.timelineSearch = this.timeline.getByRole('textbox', { name: 'Search by activity type or name' });
    this.timelineClearSearch = this.timeline.getByRole('button', { name: 'Clear search input' });
    // Each sort view (dates / courses) has its own copy of this text; only the active one is visible.
    this.timelineEmpty = this.timeline.getByText('No activities require action').filter({ visible: true });
    // Either an event (a link inside a list item) or the empty state.
    this.timelineContent = this.timelineEmpty
      .or(this.timeline.getByRole('listitem').getByRole('link').filter({ visible: true }))
      .first();

    // Calendar block. Month navigation is AJAX; the page URL does not change.
    this.calendarMonthHeading = this.calendar.getByRole('heading', { level: 4 });
    this.calendarNextMonth = this.calendar.getByRole('link', { name: /^Next month/ });
    this.calendarPreviousMonth = this.calendar.getByRole('link', { name: /^Previous month/ });
    this.fullCalendarLink = this.calendar.getByRole('link', { name: 'Full calendar' });
    this.importExportLink = this.calendar.getByRole('link', { name: 'Import or export calendars' });

    // Block drawer (right side). Its open/closed state is saved as a user preference.
    this.openBlockDrawerButton = page.getByRole('button', { name: 'Open block drawer' });
    this.closeBlockDrawerButton = page.getByRole('button', { name: 'Close block drawer' });
    this.blockDrawer = page.getByRole('complementary', { name: 'Blocks' });
    this.recentlyAccessed = this.blockDrawer.getByRole('region', { name: 'Recently accessed items' });
  }

  async goto() {
    return this.page.goto('/my/');
  }

  async timelineFilterLabel() {
    return labelOf(this.timelineFilterButton);
  }

  async timelineSortLabel() {
    return labelOf(this.timelineSortButton);
  }

  /** @param {string} label one of DashboardPage.TIMELINE_FILTERS */
  async selectTimelineFilter(label) {
    if ((await this.timelineFilterLabel()) === label) return;
    const saved = this.#preferenceSaved('block_timeline_user_filter_preference');
    await this.timelineFilterButton.click();
    await this.timeline.getByRole('menuitem', { name: `${label} filter option`, exact: true }).click();
    await saved;
  }

  /** @param {string} label one of DashboardPage.TIMELINE_SORTS */
  async selectTimelineSort(label) {
    if ((await this.timelineSortLabel()) === label) return;
    const saved = this.#preferenceSaved('block_timeline_user_sort_preference');
    await this.timelineSortButton.click();
    await this.timeline.getByRole('menuitem', { name: `${label} sort option`, exact: true }).click();
    await saved;
  }

  /**
   * Resolves when Moodle has saved the user preference (POST .../preferences/<name>). Without
   * this, a test can end or reload before the save and leave the account's setting changed.
   * @param {string} name
   */
  #preferenceSaved(name) {
    return this.page.waitForResponse(
      (response) => response.url().endsWith(`/preferences/${name}`) && response.request().method() === 'POST',
    );
  }

  async isBlockDrawerOpen() {
    return this.blockDrawer.isVisible();
  }

  /**
   * Opens or closes the block drawer and waits until the new state is saved, so a reload right
   * after shows it (POST .../preferences/drawer-open-block).
   * @param {boolean} open
   */
  async setBlockDrawer(open) {
    if ((await this.isBlockDrawerOpen()) === open) return;
    const saved = this.#preferenceSaved('drawer-open-block');
    await (open ? this.openBlockDrawerButton : this.closeBlockDrawerButton).click();
    await saved;
    await (open ? this.blockDrawer.waitFor() : this.blockDrawer.waitFor({ state: 'hidden' }));
  }
}
