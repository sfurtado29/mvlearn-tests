// Content of the course package the site runs, one folder per version under tests/data/courses/
// (outline.js, quiz-answers.js, practice.js):
//   v1: the original package (Storyline; dev and staging until the client's update of 2026-10).
//   v2: the client's new package (Rise; dev from 2026-10, staging from 2026-10-27).
// Chosen by courseVersion in tests/data/site.js; COURSE_VERSION=<v> (env or .env) overrides it,
// e.g. once staging gets the new package. Import course content from here, not from the folders.
import { COURSE } from './site.js';
import * as v1Outline from './courses/v1/outline.js';
import * as v1Answers from './courses/v1/quiz-answers.js';
import * as v1Practice from './courses/v1/practice.js';
import * as v2Outline from './courses/v2/outline.js';
import * as v2Answers from './courses/v2/quiz-answers.js';

const VERSIONS = {
  v1: { ...v1Outline, ...v1Answers, ...v1Practice },
  // answerFor(question) gives the answer's text here, not a letter as in v1.
  v2: { ...v2Outline, ...v2Answers },
};

export const COURSE_VERSION = (process.env.COURSE_VERSION?.trim() || COURSE.courseVersion).toLowerCase();
if (!VERSIONS[COURSE_VERSION]) {
  throw new Error(`Unknown course version "${COURSE_VERSION}". Known: ${Object.keys(VERSIONS).join(', ')}.`);
}

/** Answer key file of this version, for messages. */
export const ANSWERS_FILE = `tests/data/courses/${COURSE_VERSION}/quiz-answers.js`;

// v1 only: SECTION_1_SLIDES, QUIZ_MENU_ITEM, saveDiscovered, practiceHandlers.
// v2 only: LESSONS, AUDIO_LESSONS, SORTING. answerFor, SCORM_VERSION: both (see VERSIONS).
export const {
  SCORM_VERSION,
  SECTIONS,
  SECTION_1_SLIDES,
  QUIZ_MENU_ITEM,
  answerFor,
  saveDiscovered,
  practiceHandlers,
  LESSONS,
  AUDIO_LESSONS,
  SORTING,
} = VERSIONS[COURSE_VERSION];
