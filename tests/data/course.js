// Content of the course package the site runs, one folder per version under tests/data/courses/
// (outline.js, quiz-answers.js, practice.js):
//   v1: the original package (staging; dev until the client's update of 2026-10).
// Chosen by courseVersion in tests/data/site.js; COURSE_VERSION=<v> (env or .env) overrides it,
// e.g. once staging gets the new package. Import course content from here, not from the folders.
import { COURSE } from './site.js';
import * as v1Outline from './courses/v1/outline.js';
import * as v1Answers from './courses/v1/quiz-answers.js';
import * as v1Practice from './courses/v1/practice.js';

const VERSIONS = {
  v1: { ...v1Outline, ...v1Answers, ...v1Practice },
};

export const COURSE_VERSION = (process.env.COURSE_VERSION?.trim() || COURSE.courseVersion).toLowerCase();
if (!VERSIONS[COURSE_VERSION]) {
  throw new Error(`Unknown course version "${COURSE_VERSION}". Known: ${Object.keys(VERSIONS).join(', ')}.`);
}

/** Answer key file of this version, for messages. */
export const ANSWERS_FILE = `tests/data/courses/${COURSE_VERSION}/quiz-answers.js`;

export const { SECTIONS, SECTION_1_SLIDES, QUIZ_MENU_ITEM, answerFor, saveDiscovered, practiceHandlers } =
  VERSIONS[COURSE_VERSION];
