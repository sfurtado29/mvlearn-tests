// Quiz answer key of the v2 package: start of the question text → start of the correct answer's
// text (Rise knowledge checks; by text, not position, in case the options are shuffled).
// "Requires a correct answer to continue"; a wrong answer can be taken again, so questions not in
// the key are answered by trying the options in order (RisePlayer.answerQuestions); the test logs
// the answer found, to be copied in here.
export const QUIZ_ANSWERS = {
  // End of Lesson Quiz: Managing Your Speed (4 questions; v1 had the same ones).
  'Basic Speed Law says': 'never drive faster than is safe for current conditions', // dev 2026-10-26
  // Seen on dev 2026-10-26 (65 MPH: "Incorrect"); the answer is v1's C.
  'On a two-lane undivided highway the maximum speed limit is': '55 MPH',
  // Found by trying, dev 2026-10-26 (Q3: 15 MPH was "Incorrect").
  'What is the speed limit when a vehicle is driving within 500 feet of a school': '25 MPH',
  'You should use your headlights when the vehicle is operated from': '30 minutes after sunset to 30 minutes before sunrise',

  // End of Lesson Quiz: Turning and Passing: three questions, although its instructions say four.
  // Q1 from the user's screenshot (v1's A); Q2, Q3 found by trying on dev 2026-10-27.
  'You may pass on the right if you are driving on an open highway': '...which is clearly marked for two or more lanes',
  'At what point can you enter the bike lane to make a right turn?': '200 feet from the turn',
  'When making a right turn, what lane should you complete your turn in?': 'The same curbside lane on the right',

  // Practice Right-of-Way: scenario block, 3 scenes. The prompt read starts with the scene
  // picture's description, then "Scenario <n>: Select who has the right-of-way ...". Scene 1 from
  // the user; scenes 2 and 3 by trying (first choice), dev 2026-10-27; same as v1's badges 3, 1, 1.
  'A driver in a yellow vehicle with an oncoming car and pedestrian': 'The pedestrian has right-of-way',
  'A driver in a yellow vehicle at a T Intersection': 'The oncoming car has right-of-way',
  // Accepted although the scene describes a vehicle to the right arriving at the same time, and
  // the lesson's quiz (below) says the vehicle to your right has the right-of-way.
  'A driver in a yellow vehicle at an Intersection with vehicle to your right': 'The car on your left has the right of way',

  // End of Lesson Quiz: Right-of-Way: 3 questions, found by trying on dev 2026-10-27.
  'Pedestrians have the right-of-way': '...in marked or unmarked crosswalks',
  'Who has the right-of-way at an intersection with no traffic control?': 'The vehicle already in the intersection',
  'If you arrive at an intersection with stops signs at all corners': 'The vehicle to your right',

  // Practice Measuring BAC: values from the page's BAC table (user's screenshot 2026-10-27).
  // Q1 seen in v2; the other two are v1's questions, in case v2 asks them too.
  'What is the predicted BAC level for a male that consumes one drink and weighs 140 lbs?': '0.04%',
  'What is the predicted BAC level for a male that consumes two drinks and weighs 160 lbs?': '0.07%',
  'What is the predicted BAC level for a female that consumes two drinks and weighs 160 lbs?': '0.08%',

  // End of Lesson Quiz: Alcohol and Drugs: 3 questions. Q1 from the user's screenshot (v1's B);
  // Q2, Q3 found by trying on dev 2026-10-27.
  'The maximum blood alcohol concentration (BAC) for an adult is': '0.08%',
  'Blood alcohol concentration is specific and influenced by these factors': 'Body weight and gender',
  'If you have an open container of alcohol in your vehicle it is legal for it to be': 'in the trunk of the car',

  // End of Lesson Quiz: Protecting Yourself and Your Passengers: 3 questions. Q1 from the user's
  // screenshot (v1's B); Q2, Q3 by trying on dev 2026-10-27 (both the first option, as in v1).
  'The laws on seat belts require': 'A driver to have their seat belt fastened while the passenger will also need',
  'If you have to run into a store for no more than 5 minutes': 'It is illegal to leave a child six years old or younger',
  'When is it legal for a person to drive a vehicle loaded with property?': 'When the load is secure',

  // End of Lesson Quiz: Law Enforcement Stops: 3 questions, found by trying on dev 2026-10-27.
  'The driver of a stopped vehicle must produce a valid': '...can perform a limited search of your vehicle',
  'Laws affecting traffic stops allow': "...you to use your personal device to record a law enforcement officer's actions",
  'If a law enforcement officer signals to pull you over': '...turning on your right turn signal',

  // Practice Identifying Regulatory / Warning Signs: scenario blocks whose scenes all have the
  // same prompt, so the answers are listed in scene order. Found by trying on dev 2026-10-27.
  'Identify the Regulatory Sign by selecting': ['Wrong Way', 'Stop Sign', 'No U Turn', 'No Right Turn'],
  'Identify the Warning Sign by selecting': [
    'Two Way Traffic',
    'Slippery When Wet',
    'Stop Sign Ahead',
    'Traffic Signal',
    'Sharp Turn',
    'Crossroad Ahead',
  ],

  // End of Lesson Quiz; Signs: 3 questions, found by trying on dev 2026-10-27.
  // Not just "...yield sign": a wrong option starts that way too (full run, 2026-10-27).
  'A red and white triangular sign is a': '...yield sign. It means that you should allow other vehicles',
  'A white rectangular sign with black or red print indicates': 'It indicates the rules of the road',
  'A five-sided yellow with a point at the top means': '...you are driving in a school zone',
};

/**
 * Drag-and-drop sorting activities: the categories (as their boxes read) and card text → category.
 * A card dropped on the wrong category is not accepted and can be dropped again; the score
 * ("6/9 Cards Correct") counts first drops. Cards not in the key are tried category by category
 * (RisePlayer.sortCards); the test logs the category found, to be copied in here.
 */
export const SORTING = [
  {
    // Choosing a Lane: 9 cards, all sorted on dev 2026-10-27 (sxts_user3; the others found by trying).
    categories: ['Lane 1 (Left)', 'Lane 2 (Center)', 'Lane 3 (Right)'],
    cards: {
      'Passing a slower-moving vehicle': 'Lane 1 (Left)',
      'Taking an exit situated on the left side of the road': 'Lane 1 (Left)',
      'Avoiding merging traffic while not actively passing anyone': 'Lane 2 (Center)',
      'Cruising or traveling a long distance': 'Lane 2 (Center)',
      'Maintaining the smoothest flow of traffic': 'Lane 2 (Center)',
      'Preparing to make a right turn at an upcoming intersection': 'Lane 3 (Right)',
      'Preparing to take a standard off-ramp exit': 'Lane 3 (Right)',
      'Driving at a slower speed than the rest of traffic': 'Lane 3 (Right)',
      'Entering the highway from an on-ramp': 'Lane 3 (Right)',
    },
  },
];

const normalize = (text) => text.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Start of the correct answer's text, or undefined when the question is not in the key.
 * @param {string} question full question text
 * @param {number} [occurrence] how many times this question was asked before (0-based), for
 *   entries listing answers in scene order
 */
export function answerFor(question, occurrence = 0) {
  const text = normalize(question);
  const match = Object.keys(QUIZ_ANSWERS).find((start) => text.startsWith(normalize(start)));
  if (match === undefined) return undefined;
  const answer = QUIZ_ANSWERS[match];
  return Array.isArray(answer) ? answer[occurrence] : answer;
}
