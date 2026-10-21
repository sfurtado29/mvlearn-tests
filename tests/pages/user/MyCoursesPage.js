import { exactOption, labelOf } from '../../helpers/ui.js';

export class MyCoursesPage {
  /** Dropdown options, verified on dev. Choices are saved as user preferences: restore them. */
  static GROUPINGS = ['All', 'In progress', 'Future', 'Past', 'Starred', 'Removed from view'];
  static SORTS = ['Sort by course name', 'Sort by last accessed'];
  static DISPLAYS = ['Card', 'List', 'Summary'];

  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'My courses', level: 1 });
    // Course cards are loaded via AJAX inside this region.
    this.courseOverview = page.getByRole('region', { name: 'Course overview' });
    this.controls = this.courseOverview.getByRole('search', { name: 'Course overview controls' });
    this.groupingButton = this.controls.getByRole('button', { name: 'Grouping drop-down menu' });
    this.sortingButton = this.controls.getByRole('button', { name: 'Sorting drop-down menu' });
    this.displayButton = this.controls.getByRole('button', { name: 'Display drop-down menu' });
    this.searchBox = this.controls.getByRole('textbox', { name: 'Search courses' });
    this.clearSearchButton = this.controls.getByRole('button', { name: 'Clear search input' });
    this.emptyState = this.courseOverview.getByText(/^No courses/);
    this.progressLabel = this.courseOverview.getByText(/\d+% complete/);
  }

  async goto() {
    return this.page.goto('/my/courses.php');
  }

  /** @param {string} name */
  courseLink(name) {
    return this.courseOverview.getByRole('link', { name, exact: true });
  }

  /** The course link, or the "No courses" state if the current filter/search hides it. */
  courseOrEmpty(name) {
    return this.courseLink(name).first().or(this.emptyState);
  }

  async groupingLabel() {
    return labelOf(this.groupingButton);
  }

  async sortingLabel() {
    return labelOf(this.sortingButton);
  }

  async displayLabel() {
    return labelOf(this.displayButton);
  }

  /** @param {string} label one of MyCoursesPage.GROUPINGS */
  async selectGrouping(label) {
    await this.#select(this.groupingButton, 'Grouping drop-down menu', label);
  }

  /** @param {string} label one of MyCoursesPage.SORTS */
  async selectSorting(label) {
    await this.#select(this.sortingButton, 'Sorting drop-down menu', label);
  }

  /** @param {string} label one of MyCoursesPage.DISPLAYS */
  async selectDisplay(label) {
    await this.#select(this.displayButton, 'Display drop-down menu', label);
  }

  /**
   * @param {import('@playwright/test').Locator} button
   * @param {string} menuName
   * @param {string} label
   */
  async #select(button, menuName, label) {
    if ((await labelOf(button)) === label) return;
    // Wait for Moodle to save the choice (POST .../preferences/block_myoverview_user_..._preference),
    // so a restore at the end of a test really sticks.
    const saved = this.page.waitForResponse(
      (response) => /\/preferences\/block_myoverview_/.test(response.url()) && response.request().method() === 'POST',
    );
    await button.click();
    await this.controls
      .getByRole('menu', { name: menuName })
      .getByRole('menuitem')
      .filter({ hasText: exactOption(label) })
      .click();
    await saved;
  }
}
