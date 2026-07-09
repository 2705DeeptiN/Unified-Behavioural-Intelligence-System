/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  TIMETABLE DATA  (Semester VI — Sections 6A / 6B / 6C / 6D)
 *  Source: official Department of CSE timetable images (W.E.F: 17-02-2026)
 *  Term: 09.02.2026 → 30.05.2026
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  This single file is the source of truth for:
 *    • subject codes, names, categories (Theory / Tutorial / Lab)
 *    • faculty codes / names per subject per section
 *    • day-by-day, slot-by-slot schedule
 *
 *  Used by:
 *    • routes/timetable.js   → exposes endpoints to the frontend
 *    • routes/auth.js        → validates faculty code at register time
 *    • routes/subjects.js    → restricts which subjects a teacher can add
 *    • routes/sessions.js    → tags every analysis with class & subject
 */

// ── 1. SUBJECT CATALOGUE (codes & display names) ───────────────────────────
const SUBJECTS = [
  { code: 'AL61',   shortName: 'M&E',       fullName: 'Management & Entrepreneurship',                  category: 'Theory'    },
  { code: 'CS62',   shortName: 'CC&BD',     fullName: 'Cloud Computing and Big Data',                   category: 'Theory'    },
  { code: 'CSE631', shortName: 'DL',        fullName: 'Introduction to Deep Learning',                  category: 'Theory'    },
  { code: 'CSE633', shortName: 'LKP',       fullName: 'Linux Kernel Programming',                       category: 'Theory'    },
  { code: 'CSE635', shortName: 'BDA',       fullName: 'Block Chain and Distributed App Development',    category: 'Theory'    },
  { code: 'CSE641', shortName: 'DEVSECOPS', fullName: 'Introduction to DevSecOps',                      category: 'Theory'    },
  { code: 'CSL65',  shortName: 'PTS LAB',   fullName: 'Penetration Testing and Secure Systems Lab',     category: 'Lab'       },
  { code: 'CSL66',  shortName: 'USP LAB',   fullName: 'Unix System Programming Lab',                    category: 'Lab'       },
  { code: 'CSE631L',shortName: 'DL LAB',    fullName: 'Deep Learning Lab',                              category: 'Lab'       },
  { code: 'CSE633L',shortName: 'LKP LAB',   fullName: 'Linux Kernel Programming Lab',                   category: 'Lab'       },
  { code: 'CSE635L',shortName: 'BDA LAB',   fullName: 'Blockchain & DApp Development Lab',              category: 'Lab'       },
  { code: 'CSE641L',shortName: 'DEVSECOPS LAB', fullName: 'DevSecOps Lab',                              category: 'Lab'       },
  { code: 'CCBD-T', shortName: 'CC&BD TUT', fullName: 'Cloud Computing & Big Data Tutorial',            category: 'Tutorial'  },
];

const SUBJECT_BY_SHORT = Object.fromEntries(SUBJECTS.map(s => [s.shortName.toUpperCase(), s]));

// ── 2. FACULTY DIRECTORY (code → full name) ────────────────────────────────
//   These codes appear in the timetable cells. Every teacher who registers
//   must supply a faculty code that exists in this list.
const FACULTY = {
  // Section 6A
  SM:  'Swetha M',
  UT:  'Dr. Uzma Taj',
  SCS: 'Soumya C S',
  NSB: 'Nandini S B',
  APK: 'Dr. Parkavi A',
  BG:  'Brunda G',
  US:  'Uzma Sulthana',
  SK:  'Sahil Kumar Jamwal',
  DPK: 'Deepika P K',
  ASB: 'Ashwin S B',
  VCD: 'Vincent C D',
  JGR: 'Dr. Geetha J',
  CP:  'Chandrika Prasad',
  MA:  'Manjusha A',
  // Section 6B
  PK:  'Priya K',
  MG:  'Dr. Mallegowda M',
  JSM: 'Dr. Jamuna S Murthy',
  SV:  'Suma V',
  // Section 6C
  VGS: 'Veena G S',
  MRC: 'Dr. Manjula R Chougala',
  DBM: 'Dr. B Mahanand',
  // Section 6D
  SB:  'Sushma B',
  // BDA section split
  RDFSBN: 'Dr. RDF-SBN',
  RDFYKS: 'Dr. RDF-YKS',
  RDFBD:  'Dr. RDF-BD',
  // Others / shared lab faculty
  VCD2: 'Vincent C D',
};

// ── 3. SUBJECT-TEACHER MAPPING PER SECTION ─────────────────────────────────
//   Lists, per section, who teaches what. Lab entries may have multiple
//   faculty (rotation) — any one of them legitimately "handles" that lab.
const SECTION_FACULTY = {
  '6A': {
    'M&E':       ['SM'],
    'CC&BD':     ['UT'],
    'DL':        ['SCS'],
    'LKP':       ['NSB'],
    'BDA':       ['UT', 'APK'],
    'DEVSECOPS': ['BG'],
    'PTS LAB':   ['US', 'SK', 'SM', 'DPK'],
    'USP LAB':   ['APK', 'ASB', 'VCD'],
    'DL LAB':    ['SCS'],
    'LKP LAB':   ['NSB', 'VCD', 'RDFBD'],
    'BDA LAB':   ['APK', 'ASB', 'RDFYKS'],
    'DEVSECOPS LAB': ['BG', 'SCS', 'RDFSBN'],
    'CC&BD TUT': ['UT'],
  },
  '6B': {
    'M&E':       ['PK'],
    'CC&BD':     ['MG'],
    'DL':        ['SCS'],
    'LKP':       ['NSB'],
    'BDA':       ['UT', 'APK'],
    'DEVSECOPS': ['US'],
    'PTS LAB':   ['SV', 'US', 'CP', 'SM'],
    'USP LAB':   ['PK', 'CP', 'SK'],
    'DL LAB':    ['SCS'],
    'LKP LAB':   ['NSB', 'VCD', 'RDFBD'],
    'BDA LAB':   ['APK', 'ASB', 'RDFYKS'],
    'DEVSECOPS LAB': ['US', 'MG', 'RDFBD'],
    'CC&BD TUT': ['MG', 'JSM'],
  },
  '6C': {
    'M&E':       ['VGS'],
    'CC&BD':     ['MRC'],
    'DL':        ['SCS'],
    'LKP':       ['NSB'],
    'BDA':       ['UT', 'APK'],
    'DEVSECOPS': ['JGR'],
    'PTS LAB':   ['JGR', 'SV', 'SM', 'BG'],
    'USP LAB':   ['DBM', 'DPK', 'VGS'],
    'DL LAB':    ['SCS'],
    'LKP LAB':   ['NSB', 'VCD', 'RDFBD'],
    'BDA LAB':   ['APK', 'ASB', 'RDFYKS'],
    'DEVSECOPS LAB': ['JGR', 'BG', 'RDFSBN'],
    'CC&BD TUT': ['MRC', 'NSB'],
  },
  '6D': {
    'M&E':       ['SK'],
    'CC&BD':     ['JSM'],
    'DL':        ['SCS'],
    'LKP':       ['NSB'],
    'BDA':       ['UT', 'APK'],
    'DEVSECOPS': ['US'],
    'PTS LAB':   ['JGR', 'CP', 'SK', 'BG'],
    'USP LAB':   ['SB', 'APK', 'SCS'],
    'DL LAB':    ['SCS'],
    'LKP LAB':   ['NSB', 'VCD', 'RDFBD'],
    'BDA LAB':   ['APK', 'ASB', 'RDFYKS'],
    'DEVSECOPS LAB': ['US', 'JSM', 'RDFYKS'],
    'CC&BD TUT': ['JSM', 'DBM'],
  },
};

// ── 4. SLOT DEFINITIONS  (HH:MM 24-hr) ─────────────────────────────────────
//   Index = slot index used in the SCHEDULE table below.
const SLOTS = [
  { idx: 0, start: '09:00', end: '09:55', label: '9.00 – 9.55' },
  { idx: 1, start: '09:55', end: '10:50', label: '9.55 – 10.50' },
  { idx: 2, start: '11:05', end: '12:00', label: '11.05 – 12.00' },
  { idx: 3, start: '12:00', end: '12:55', label: '12.00 – 12.55' },
  // BREAK
  { idx: 4, start: '13:45', end: '14:40', label: '1.45 – 2.40' },
  { idx: 5, start: '14:40', end: '15:35', label: '2.40 – 3.35' },
  { idx: 6, start: '15:35', end: '16:30', label: '3.35 – 4.30' },
];
const DAYS = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

// ── 5. SCHEDULE TABLES (one row per day, columns are slots) ────────────────
//   Each cell is { subject, faculty[] } where `subject` is the shortName key
//   into SUBJECT_BY_SHORT and `faculty` is a list of faculty codes.
//   Special value `null` = free slot / break / non-teaching.
//
//   For multi-subject combo cells (e.g. "S1-BDA, S2-BDA" in same slot), we
//   record both — the lookup picks the entry that matches the teacher.

function cell(subject, faculty) {
  if (!subject) return null;
  return Array.isArray(faculty)
    ? { entries: [{ subject, faculty: faculty }] }
    : { entries: [{ subject, faculty: [faculty] }] };
}
function combo(entries) {
  return { entries: entries.map(([s, f]) => ({ subject: s, faculty: Array.isArray(f) ? f : [f] })) };
}
const FREE = null;

// ── 6A ──────────────────────────────────────────────────────────────────────
const SCHEDULE_6A = {
  MONDAY: [
    cell('DEVSECOPS', ['BG']),
    cell('CC&BD', ['UT']),
    cell('USP LAB', ['APK', 'ASB', 'VCD']), cell('USP LAB', ['APK', 'ASB', 'VCD']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  TUESDAY: [
    cell('PTS LAB', ['US', 'SK', 'SM', 'DPK']), cell('PTS LAB', ['US', 'SK', 'SM', 'DPK']),
    cell('CC&BD TUT', ['UT']), cell('CC&BD TUT', ['UT']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  WEDNESDAY: [
    cell('DEVSECOPS', ['BG']), cell('DEVSECOPS', ['BG']),
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('M&E', ['SM']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  THURSDAY: [
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('M&E', ['SM']),
    cell('DEVSECOPS', ['BG']),
    cell('CC&BD', ['UT']),
    cell('MINI PROJECT', ['JGR', 'CP', 'MA']), FREE, FREE,
  ],
  FRIDAY: [
    cell('CC&BD', ['UT']), cell('M&E', ['SM']),
    cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']), cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']),
    FREE, FREE, FREE,
  ],
  SATURDAY: [
    cell('TSEC', ['JGR', 'BG', 'UT']), cell('TSEC', ['JGR', 'BG', 'UT']),
    FREE, FREE, FREE, FREE, FREE,
  ],
};

// ── 6B ──────────────────────────────────────────────────────────────────────
const SCHEDULE_6B = {
  MONDAY: [
    cell('M&E', ['PK']), cell('CC&BD', ['MG']),
    cell('USP LAB', ['PK', 'CP', 'SK']), cell('USP LAB', ['PK', 'CP', 'SK']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  TUESDAY: [
    cell('CC&BD TUT', ['MG', 'JSM']), cell('CC&BD TUT', ['MG', 'JSM']),
    cell('M&E', ['PK']), cell('DEVSECOPS', ['US']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  WEDNESDAY: [
    cell('DEVSECOPS LAB', ['US', 'MG', 'RDFBD']), cell('DEVSECOPS LAB', ['US', 'MG', 'RDFBD']),
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('CC&BD', ['MG']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  THURSDAY: [
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('DEVSECOPS', ['US']),
    cell('PTS LAB', ['SV', 'US', 'CP', 'SM']), cell('PTS LAB', ['SV', 'US', 'CP', 'SM']),
    cell('MINI PROJECT', ['JGR', 'CP', 'MA']), FREE, FREE,
  ],
  FRIDAY: [
    cell('CC&BD', ['MG']), cell('M&E', ['PK']),
    cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']), cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']),
    FREE, FREE, FREE,
  ],
  SATURDAY: [
    cell('TSEC', ['JGR', 'BG', 'UT']), cell('TSEC', ['JGR', 'BG', 'UT']),
    FREE, FREE, FREE, FREE, FREE,
  ],
};

// ── 6C ──────────────────────────────────────────────────────────────────────
const SCHEDULE_6C = {
  MONDAY: [
    cell('USP LAB', ['DBM', 'DPK', 'VGS']), cell('USP LAB', ['DBM', 'DPK', 'VGS']),
    cell('DEVSECOPS LAB', ['JGR', 'BG', 'RDFSBN']), cell('DEVSECOPS LAB', ['JGR', 'BG', 'RDFSBN']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  TUESDAY: [
    cell('M&E', ['VGS']), cell('CC&BD', ['MRC']),
    cell('PTS LAB', ['JGR', 'SV', 'SM', 'BG']), cell('PTS LAB', ['JGR', 'SV', 'SM', 'BG']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  WEDNESDAY: [
    cell('CC&BD', ['MRC']), cell('M&E', ['VGS']),
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('DEVSECOPS', ['JGR']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  THURSDAY: [
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('DEVSECOPS', ['JGR']),
    cell('CC&BD TUT', ['MRC', 'NSB']), cell('CC&BD TUT', ['MRC', 'NSB']),
    cell('MINI PROJECT', ['JGR', 'CP', 'MA']), FREE, FREE,
  ],
  FRIDAY: [
    cell('CC&BD', ['MRC']), cell('M&E', ['VGS']),
    cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']), cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']),
    FREE, FREE, FREE,
  ],
  SATURDAY: [
    cell('TSEC', ['JGR', 'BG', 'UT']), cell('TSEC', ['JGR', 'BG', 'UT']),
    FREE, FREE, FREE, FREE, FREE,
  ],
};

// ── 6D ──────────────────────────────────────────────────────────────────────
const SCHEDULE_6D = {
  MONDAY: [
    cell('DEVSECOPS LAB', ['US', 'JSM', 'RDFYKS']), cell('DEVSECOPS LAB', ['US', 'JSM', 'RDFYKS']),
    cell('CC&BD', ['JSM']), cell('DEVSECOPS', ['US']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  TUESDAY: [
    cell('USP LAB', ['SB', 'APK', 'SCS']), cell('USP LAB', ['SB', 'APK', 'SCS']),
    cell('CC&BD', ['JSM']), cell('M&E', ['SK']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  WEDNESDAY: [
    cell('M&E', ['SK']), cell('CC&BD', ['JSM']),
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('DEVSECOPS', ['US']),
    FREE, cell('MINI PROJECT', ['JGR', 'CP', 'MA']), cell('MINI PROJECT', ['JGR', 'CP', 'MA']),
  ],
  THURSDAY: [
    combo([['BDA', ['UT', 'APK']], ['LKP', ['NSB']], ['DL', ['SCS']]]),
    cell('M&E', ['SK']),
    cell('CC&BD TUT', ['JSM', 'DBM']), cell('CC&BD TUT', ['JSM', 'DBM']),
    cell('MINI PROJECT', ['JGR', 'CP', 'MA']), FREE, FREE,
  ],
  FRIDAY: [
    cell('PTS LAB', ['JGR', 'CP', 'SK', 'BG']), cell('PTS LAB', ['JGR', 'CP', 'SK', 'BG']),
    cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']), cell('BDA LAB', ['APK', 'ASB', 'RDFYKS']),
    FREE, FREE, FREE,
  ],
  SATURDAY: [
    cell('TSEC', ['JGR', 'BG', 'UT']), cell('TSEC', ['JGR', 'BG', 'UT']),
    FREE, FREE, FREE, FREE, FREE,
  ],
};

const SCHEDULE = { '6A': SCHEDULE_6A, '6B': SCHEDULE_6B, '6C': SCHEDULE_6C, '6D': SCHEDULE_6D };

const ROOM = { '6A': 'LHC-206', '6B': 'LHC-207', '6C': 'LHC-208', '6D': 'LHC-211' };

// ── 7. PUBLIC LOOKUP HELPERS ───────────────────────────────────────────────

/** Get the list of all faculty codes that exist anywhere in the timetable. */
function allFacultyCodes() { return Object.keys(FACULTY); }

/** Get faculty full name from code. */
function facultyName(code) { return FACULTY[code] || null; }

/** Check whether a code is a real faculty code. */
function isValidFacultyCode(code) { return Boolean(FACULTY[code]); }

/**
 * For a faculty code, return every subject they teach + the sections they
 * teach it in.   Returns: [{ subject: {...}, sections: ['6A','6B'] }, ...]
 */
function subjectsForFaculty(code) {
  const map = new Map();          // shortName -> Set<section>
  for (const section of Object.keys(SECTION_FACULTY)) {
    for (const [shortName, codes] of Object.entries(SECTION_FACULTY[section])) {
      if (codes.includes(code)) {
        if (!map.has(shortName)) map.set(shortName, new Set());
        map.get(shortName).add(section);
      }
    }
  }
  const out = [];
  for (const [shortName, set] of map.entries()) {
    const meta = SUBJECT_BY_SHORT[shortName.toUpperCase()];
    if (!meta) continue;
    out.push({
      code: meta.code,
      shortName: meta.shortName,
      fullName: meta.fullName,
      category: meta.category,
      sections: [...set].sort(),
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

/** Sections a faculty member teaches in. */
function sectionsForFaculty(code) {
  const set = new Set();
  for (const section of Object.keys(SECTION_FACULTY)) {
    for (const codes of Object.values(SECTION_FACULTY[section])) {
      if (codes.includes(code)) set.add(section);
    }
  }
  return [...set].sort();
}

/**
 * Given { facultyCode, day, time }   →  { section, subject, slotLabel }  or null
 * day is DOW string (e.g. "MONDAY"). time is HH:MM 24-hour.
 *
 * Picks the slot (if any) that contains `time` AND has the faculty teaching it
 * in any section. If the same teacher teaches multiple sections in that slot
 * (rare), the first match wins.
 */
function currentSlot(facultyCode, day, time) {
  day = (day || '').toUpperCase();
  if (!DAYS.includes(day)) return null;

  // Determine which slot the time falls into
  const slotIdx = SLOTS.findIndex(s => time >= s.start && time < s.end);
  if (slotIdx === -1) return null;

  for (const section of Object.keys(SCHEDULE)) {
    const row = SCHEDULE[section][day];
    if (!row) continue;
    const cellAt = row[slotIdx];
    if (!cellAt) continue;
    for (const entry of cellAt.entries) {
      if (entry.faculty.includes(facultyCode)) {
        return {
          section,
          subjectShort: entry.subject,
          slotIdx,
          slotLabel: SLOTS[slotIdx].label,
          day,
        };
      }
    }
  }
  return null;
}

/** Full schedule for a section (useful for HOD analytics). */
function scheduleForSection(section) { return SCHEDULE[section] || null; }

/** Every faculty currently teaching (across all sections) at day/time.
 *  Returns a list of { facultyCode, facultyName, section, subjectShort,
 *  subjectName, category, slotLabel } — one per (teacher, section, subject)
 *  pairing in the current slot. Used by the HOD "Analyse Real-time Teacher".
 */
function allTeachingNow(day, time) {
  day = (day || '').toUpperCase();
  const out = [];
  if (!DAYS.includes(day)) return out;
  const slotIdx = SLOTS.findIndex(s => time >= s.start && time < s.end);
  if (slotIdx === -1) return out;

  for (const section of Object.keys(SCHEDULE)) {
    const row = SCHEDULE[section][day];
    if (!row) continue;
    const cellAt = row[slotIdx];
    if (!cellAt) continue;
    for (const entry of cellAt.entries) {
      const meta = SUBJECT_BY_SHORT[(entry.subject || '').toUpperCase()];
      for (const fc of entry.faculty) {
        out.push({
          facultyCode:  fc,
          facultyName:  FACULTY[fc] || fc,
          section,
          subjectShort: entry.subject,
          subjectName:  meta ? meta.fullName : entry.subject,
          category:     meta ? meta.category : 'Theory',
          slotLabel:    SLOTS[slotIdx].label,
        });
      }
    }
  }
  return out;
}

/** Convenience: list every (section,subject,faculty) triple in the timetable. */
function allAssignments() {
  const out = [];
  for (const section of Object.keys(SECTION_FACULTY)) {
    for (const [shortName, codes] of Object.entries(SECTION_FACULTY[section])) {
      for (const code of codes) {
        out.push({ section, subjectShort: shortName, facultyCode: code });
      }
    }
  }
  return out;
}

module.exports = {
  SUBJECTS,
  SUBJECT_BY_SHORT,
  FACULTY,
  SECTION_FACULTY,
  SCHEDULE,
  SLOTS,
  DAYS,
  ROOM,
  allFacultyCodes,
  facultyName,
  isValidFacultyCode,
  subjectsForFaculty,
  sectionsForFaculty,
  currentSlot,
  scheduleForSection,
  allTeachingNow,
  allAssignments,
};
