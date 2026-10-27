// Environment-specific content, chosen by the BASE_URL hostname.
// Dev values were verified against the live dev site; staging values on 2026-10-21.
const SITES = {
  'dev-mvlearn.verificient.com': {
    id: 2,
    name: 'License Renewal Course',
    teacher: 'Admin User',
    englishScormId: 2,
    launchLinkName: 'Begin Course (English)',
    // Course package (tests/data/course.js). Dev has the client's new package (Rise) since 2026-10.
    courseVersion: 'v2',
  },
  'st-mvlearn.verificient.com': {
    // All verified on staging 2026-10-21 (as sxts_user1). The old "Renwal" typo has been fixed.
    id: 2,
    name: 'License Renewal Course',
    teacher: 'Mvlearn Admin',
    englishScormId: 6,
    // Staging's language names include the course name: "License Renewal Course(English)".
    launchLinkName: 'Begin Course (License Renewal Course(English))',
    courseVersion: 'v1',
  },
};

const hostname = new URL(String(process.env.BASE_URL)).hostname;
if (!SITES[hostname]) {
  throw new Error(
    `No site data for host "${hostname}" (from BASE_URL). Known hosts: ${Object.keys(SITES).join(', ')}. ` +
      'Add an entry to tests/data/site.js.',
  );
}

export const COURSE = SITES[hostname];

// Known site-wide behaviour that tests must account for.
const SITE_FLAGS = {
  // shortName: Moodle's site short name, used in page titles ("Home | DMVLearn") and the logo link.
  // showsStackTraces: debug display is on, so error pages show "Debug info" and a PHP stack trace.
  'dev-mvlearn.verificient.com': { shortName: 'DMVLearn', showsStackTraces: true },
  // Title "Home | STMV" seen 2026-10-09; stack traces reported by the team on 2026-10-08.
  'st-mvlearn.verificient.com': { shortName: 'STMV', showsStackTraces: true },
};

export const SITE = SITE_FLAGS[hostname];
