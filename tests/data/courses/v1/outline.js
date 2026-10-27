// Storyline menu of the English course, from docs/scorm-notes.md (verified on dev for section 1;
// the slide lists of sections 2-7 are not known yet).
export const SECTIONS = [
  'Managing Your Speed',
  'Turning and Passing',
  'Right-of-Way',
  'Alcohol and Drugs',
  'Protecting Yourself and Your Passengers',
  'Law Enforcement Stops',
  'Signs',
];

/** Menu items of section 1, in order, up to (not including) its quiz. */
export const SECTION_1_SLIDES = [
  'Introduction',
  'About Basic Speed Law',
  'Speeding',
  'Speed Limits',
  'Speed Limits Based on Location',
  'The Speed Limit & Weather Conditions',
  'The Speed Limit & Road Conditions',
  'The Speed Limit & Curves',
];

/** Menu item of every section's quiz (the title repeats across sections). */
export const QUIZ_MENU_ITEM = 'End of Section Quiz';

/** SCORM version of the package (window.API); the k6 learner's saves use its element names. */
export const SCORM_VERSION = '1.2';
