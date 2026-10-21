import { SITE } from '../../data/site.js';

export class CoursePage {
  /** @param {import('@playwright/test').Page} page */
  constructor(page) {
    this.page = page;
    this.content = page.getByRole('region', { name: 'Content' });
    // This course uses a custom layout: no breadcrumb, course index or completion block. Each
    // language is an <article> card with a progress bar and a launch link.
    this.languageHeading = this.content.getByRole('heading', { name: 'Select your preferred course language:', level: 2 });
    this.languageCards = this.content.getByRole('article');
    // The site logo is the only navigation link on the course page; it leads to the dashboard.
    this.siteLogoLink = page.getByRole('navigation', { name: 'Site navigation' }).getByRole('link', { name: SITE.shortName, exact: true });

    // Moodle error page (e.g. unknown course id).
    this.errorMain = page.getByRole('main');
    this.notFoundMessage = this.errorMain.getByText("Can't find data record in database table course.");
    this.errorContinueButton = this.errorMain.getByRole('button', { name: 'Continue' });
    this.stackTrace = this.errorMain.getByRole('alert').filter({ hasText: 'Stack trace:' });
  }

  /** @param {number} id */
  async goto(id) {
    return this.page.goto(`/course/view.php?id=${id}`);
  }

  /** @param {string} name */
  title(name) {
    return this.content.getByRole('heading', { name, level: 1 });
  }

  /**
   * Language card link, e.g. "Begin Course (English)" or "Continue (English)" depending on progress.
   * On staging the language includes the course name: "Begin Course (License Renewal Course(English))"
   * (seen 2026-10-21), so the link only has to end with "<language>)" plus any extra ")".
   * @param {string} language
   */
  languageLink(language) {
    return this.content.getByRole('link', { name: new RegExp(`\\b${language}\\)+$`) });
  }

  /**
   * Language card: "Language: English" on dev, "Language: License Renewal Course(English)" on staging.
   * @param {string} language
   */
  languageCard(language) {
    return this.languageCards.filter({ hasText: new RegExp(`Language:.*\\b${language}\\b`) });
  }

  /** Progress bar of a language card; its accessible name is like "0% complete". */
  languageProgress(language) {
    return this.languageCard(language).getByRole('progressbar');
  }
}
