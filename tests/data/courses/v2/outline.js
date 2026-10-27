// Rise sidebar of the v2 course package (dev, client update 2026-10), read from the course frame
// on 2026-10-26; see docs/scorm-notes-v2.md. Each sidebar item is a lesson page ("Lesson 7 of 80"
// in its header); the headings group them. Built one lesson at a time.
export const SECTIONS = [
  'Lesson 01: Managing Your Speed',
  'Lesson 02: Turning and Passing',
  'Lesson 03: Right-of-Way',
  'Lesson 04: Alcohol and Drugs',
  'Lesson 05: Protecting Yourself and Your Passengers',
  'Lesson 06: Law Enforcement Stops',
  'Lesson 07: signs',
];

/**
 * Sidebar items in order, as far as the tests can play them (confirmed by the user 2026-10-26):
 * scroll to the end and press CONTINUE; before that, flip every flip card, click every marker of
 * labeled graphics, step through process blocks, sort drag-and-drop cards and answer questions.
 */
export const LESSONS = [
  'Course Navigation',
  'Welcome and Objectives',
  'Introduction: Managing Your Speed',
  'About Basic Speed Law',
  'Speeding',
  'Speed Limits',
  'Speed Limit Based on Location', // 6 flip cards; CONTINUE shows only after all are flipped
  'Speed Limit and Weather Conditions',
  'Speed Limit and Road Conditions',
  'Speed Limit and Curves',
  // Instructions + CONTINUE, then 4 multiple-choice questions, one below the other, each
  // "Requires a correct answer to continue" (SUBMIT; wrong answers may be taken again).
  'End of Lesson Quiz: Managing Your Speed', // ends with "Lesson Complete" + CONTINUE
  'Introduction: Turning and Passing',
  'Choosing a Lane', // markers i and 1-4, CONTINUEs, then 9 cards dragged into Lane 1/2/3
  'How to Pass',
  'Passing', // process "Procedure to Pass": START, steps 1-6, ✓; then CONTINUE
  'Passing on the Right',
  'Being Passed',
  'Turning', // again in Lesson 03: the test goes by position ("Lesson <n> of 80"), not title
  'Turning Left',
  'To Make a Left Turn',
  'Turning Right',
  'To Make a Right Turn',
  'Turning in Specific Situations', // flip cards, all must be flipped before CONTINUE
  'End of Lesson Quiz: Turning and Passing', // as Lesson 01's quiz

  // Lesson 03: Right-of-Way
  'Introduction: Right-of-Way',
  'About Right-of-Way',
  'About Pedestrians',
  'Crosswalks',
  'Intersections',
  'T Intersections',
  'Stop Signs at All Corners',
  // Scenario block: intro + CONTINUE, 3 scenes (choice, TRY AGAIN if wrong, CONTINUE), "Scenario
  // Complete!", then CONTINUE.
  'Practice Right-of-Way',
  'Turning',
  'Divided Highways',
  'Mountain Roads',
  'End of Lesson Quiz: Right-of-Way', // as Lesson 01's quiz

  // Lesson 04: Alcohol and Drugs (several CONTINUEs per page)
  'Introduction: Alcohol and Drugs',
  'Alcohol and Drugs',
  'Using Alcohol or Cannabis While Driving',
  'About Blood Alcohol Concentration',
  'Measuring BAC',
  // Instructions + CONTINUE, then quiz-style questions read off a BAC table (image), SUBMIT
  'Practice Measuring BAC',
  'About Administrative Per Se',
  'DUI Arrests',
  'Consequences of DUI',
  'If You Are Suspected of DUI',
  'Consequences of Driving with an Illegal BAC',
  'Drivers Under 21', // flip cards, all flipped before CONTINUE
  'End of Lesson Quiz: Alcohol and Drugs', // as Lesson 01's quiz

  // Lesson 05: Protecting Yourself and Your Passengers
  'Introduction: Protecting Yourself and Your Passengers',
  'About Seat Belts',
  'Wearing Your Seat Belt', // 3 flip cards
  'Child Restraint System and Safety Seats',
  'About Airbags',
  'Unattended Children',
  'Unattended Pets',
  // Stack of 5 flip cards shown one at a time ("4 of 5"): the narration and the audio of both
  // sides of every card are played before CONTINUE shows (RisePlayer.playCardStack)
  'Heat Related Dangers',
  'Vehicle Loads',
  'End of Lesson Quiz: Protecting Yourself and Your Passengers', // as Lesson 01's quiz

  // Lesson 06: Law Enforcement Stops
  'Introduction: Law Enforcement Stops',
  'Law Enforcement Stops',
  'What to Do', // steps 1-7, each step's audio played before CONTINUE (AUDIO_LESSONS)
  'Know Your Rights',
  'Providing identification',
  'A Promise to Appeear', // the sidebar's spelling
  'End of Lesson Quiz: Law Enforcement Stops', // as Lesson 01's quiz

  // Lesson 07: Signs
  'Introduction: Signs',
  'About Regulatory Signs',
  'Stop Signs',
  'Yield Signs',
  'DO NOT ENTER and WRONG WAY Signs',
  'White Regulatory Signs',
  // Scenario block like Practice Right-of-Way: intro + CONTINUE, then scenes "Identify the
  // Regulatory Sign" (a sign in the picture) with numbered choices
  'Practice Identifying Regulatory Signs',
  'About Warning Signs',
  'Railroad Crossings',
  'School Zones',
  'Warning Signs',
  // Scenario block as above, for warning signs (a right choice: "Great job! You are correct." + CONTINUE)
  'Practice Identifying Warning Signs',
  'End of Lesson Quiz; Signs', // as Lesson 01's quiz (the sidebar writes ";")

  // End of Course: "Congratulations!", COMPLETE SURVEY (never pressed) and EXIT; no CONTINUE.
  // The test finishes here: EXIT, then Moodle's Exit activity.
  'Conclusion',
];

/**
 * Lessons whose step blocks need each step's audio played to the end before CONTINUE shows
 * (user, 2026-10-27). Elsewhere the audio is skipped (it is not required, and slow). Card stacks
 * (Heat Related Dangers) always play theirs.
 */
export const AUDIO_LESSONS = ['What to Do'];
