// Quiz answer key: section → start of the question text → correct option letter.
// Filled manually by playing the quiz. A wrong answer shows "Incorrect."; "Try Again" returns
// to the same question.
// Discovery mode (QUIZ_DISCOVER=1, build account only) writes newly found answers to
// quiz-answers.discovered.json next to this file; they are merged in below. Review them and
// move them into QUIZ_ANSWERS when convenient.
import fs from 'fs';

export const QUIZ_ANSWERS = {
  'Managing Your Speed': {
    'Basic speed law says': 'B',
    // Section 1 has 4 questions; all verified on dev 2026-10-12 (Q3, Q4 by discovery on xts_user8).
    'On a two-lane undivided highway the maximum speed limit is': 'C', // 55 MPH
    'What is the speed limit when a vehicle is driving within 500 feet of a school': 'B',
    'You should use your headlights when the vehicle is operated from': 'A',
  },
  // 3 questions; found by discovery on xts_user8, 2026-10-12/13 (Q1's text read from the run video).
  'Turning and Passing': {
    'You may pass on the right if you are driving on an open highway': 'A', // two or more lanes your way
    'At what point can you enter the bike lane to make a right turn?': 'C',
    'When making a right turn, what lane should you complete your turn in?': 'C',
  },
  'Right-of-Way': {
    // "Practice Right-of-Way" picture questions ("Click to select who has the right-of-way…"; same
    // text on every scenario): "[<scenario picture>]" → badge number.
    // Scenario 1 (yellow car, oncoming blue car, pedestrian): 3, the pedestrian (seen 2026-10-13).
    '[M3_140a-1.png]': '3',
    // Scenario 2 (yellow car at a stop line, blue car on the through road): 1, the blue car.
    '[M3_140b-1.png]': '1',
    '[M3_140c-1.png]': '1',
    // End of Section Quiz (slides "Question 4"-"Question 6"; the scenarios use 1-3). Discovery, 2026-10-13.
    'Pedestrians have the right-of-way': 'A',
    'Who has the right-of-way at an intersection with no traffic control?': 'B',
    'If you arrive at an intersection with stop signs at all corners at the same time as another vehicle': 'B',
  },
  'Alcohol and Drugs': {
    // "Practice Measuring BAC" / "BAC Quiz <n>": values from the BAC table; several questions per
    // slide. Found by discovery on xts_user8, 2026-10-13 (stored by position; A = first choice).
    'What is the predicted BAC level for a male that consumes one drink and weighs 140 lbs?': 'B', // .04
    'What is the predicted BAC level for a male that consumes two drinks and weighs 160 lbs?': 'C', // .07
    'What is the predicted BAC level for a female that consumes two drinks and weighs 160 lbs?': 'A', // .08
    // End of Section Quiz (its slides also hold a placeholder paragraph "0000000000000000000").
    'The maximum blood alcohol concentration (BAC) for an adult is': 'B', // .08% (Q1, text read from video)
    'Blood alcohol concentration is specific and influenced by these factors': 'C',
    'If you have an open container of alcohol in your vehicle it is legal for it to be': 'C',
  },
  // Discovery on xts_user7, 2026-10-13 (Q3's text recovered from the run's trace).
  'Protecting Yourself and Your Passengers': {
    'The laws on seat belts require': 'B',
    'If you have to run into a store for no more than five minutes': 'A', // illegal to leave a child ≤ 6
    'When is it legal for a person to drive a vehicle loaded with property?': 'A', // load secure, no hazard
  },
  // Discovery on xts_user7, 2026-10-13.
  'Law Enforcement Stops': {
    'The driver of a stopped vehicle must produce a driver license, proof of insurance, and vehicle registration or the officer': 'A',
    'New 2020 law affecting traffic stops allow': 'A',
    'If a law enforcement officer signals you to pull over, you can acknowledge their presence by': 'B',
  },
  // Discovery on xts_user7, 2026-10-13.
  Signs: {
    'A red and white triangular sign is a': 'B',
    'A white rectangular sign with black or red print indicates the following': 'B',
    'A five-sided yellow sign with a point at the top means': 'C',
  },
};

export const DISCOVERED_FILE = new URL('./quiz-answers.discovered.json', import.meta.url);

function readDiscovered() {
  try {
    return JSON.parse(fs.readFileSync(DISCOVERED_FILE, 'utf8'));
  } catch {
    return {};
  }
}

const normalize = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * The correct letter for a question, or undefined when it is not in the key.
 * @param {string} section
 * @param {string} question full question text
 */
export function answerFor(section, question) {
  const discovered = readDiscovered();
  const text = normalize(question);
  const lookup = (entries) => {
    const match = Object.keys(entries).find((start) => text.startsWith(normalize(start)));
    return match === undefined ? undefined : entries[match];
  };
  // The given section first; then every section, in case the caller's section is off (questions
  // are unique across the course).
  const sections = [section, ...new Set([...Object.keys(QUIZ_ANSWERS), ...Object.keys(discovered)])];
  for (const name of sections) {
    const letter = lookup({ ...discovered[name], ...QUIZ_ANSWERS[name] });
    if (letter !== undefined) return letter;
  }
  return undefined;
}

/**
 * Save a discovered answer (keyed by the full question text).
 * @param {string} section
 * @param {string} question
 * @param {string} letter
 */
export function saveDiscovered(section, question, letter) {
  const all = readDiscovered();
  all[section] = { ...all[section], [normalize(question)]: letter };
  fs.writeFileSync(DISCOVERED_FILE, `${JSON.stringify(all, null, 2)}\n`);
}
