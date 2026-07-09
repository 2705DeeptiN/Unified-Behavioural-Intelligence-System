/**
 * Helpers that combine the seeded data/timetable.js (the original RIT
 * Semester-VI CSE timetable for 6A/6B/6C/6D) with any TimetableEntry
 * documents the Admin has added through the Admin Dashboard.
 *
 * Used by routes/timetable.js — so /api/timetable/current and
 * /api/timetable/registered-teachers will reflect Admin edits.
 */
const TimetableEntry = require('../models/TimetableEntry');
const seeded = require('../data/timetable');

const { DAYS, SLOTS, FACULTY, SUBJECT_BY_SHORT } = seeded;

/**
 * Resolve the current slot for a given facultyCode using BOTH seeded and
 * DB-stored timetable entries.
 *
 * @returns null  if not scheduled, otherwise { section, subjectShort,
 *                slotIdx, slotLabel, day, source: 'seeded'|'db' }
 */
async function currentSlotMerged(facultyCode, day, time) {
  if (!facultyCode) return null;
  const code = facultyCode.toUpperCase();

  // First check the seeded helper (preserves all of 6A-6D's original rows)
  const seededHit = seeded.currentSlot(code, day, time);
  if (seededHit) return { ...seededHit, source: 'seeded' };

  // If nothing in the seed, look for an Admin-added DB entry matching this time
  const slotIdx = findSlotIdx(time);
  if (slotIdx === -1) return null;

  const dbEntry = await TimetableEntry.findOne({
    day: day.toUpperCase(),
    slotIdx,
    facultyCodes: code,
  });
  if (!dbEntry) return null;

  return {
    section:      dbEntry.section,
    subjectShort: dbEntry.subjectShort,
    slotIdx,
    slotLabel:    SLOTS[slotIdx],
    day:          day.toUpperCase(),
    source:       'db',
  };
}

/**
 * Pure helper: turn "HH:MM" into the active slot index (0..6) or -1
 * if it's break time / outside the day.
 *
 * SLOTS is an array of { idx, start, end, label }. We pre-compute the
 * minute-pair for each slot once at module load.
 */
const SLOT_WINDOWS = SLOTS.map(slot => [toMin(slot.start), toMin(slot.end)]);

function toMin(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = String(hhmm).split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function findSlotIdx(time) {
  if (!time) return -1;
  const t = toMin(String(time).includes(':') ? time : String(time).replace('.', ':'));
  for (let i = 0; i < SLOT_WINDOWS.length; i++) {
    const [a, b] = SLOT_WINDOWS[i];
    if (t >= a && t < b) return i;
  }
  return -1;
}

/**
 * Returns the full schedule of a section using seeded data first;
 * admin-added DB entries override seeded entries for the same cell.
 */
async function scheduleForSectionMerged(section) {
  const seededSchedule = seeded.scheduleForSection(section);
  const dbEntries = await TimetableEntry.find({ section: section.toUpperCase() });

  // Map DB entries by day/slot for quick lookup
  const dbMap = {};
  for (const e of dbEntries) {
    dbMap[`${e.day}-${e.slotIdx}`] = e;
  }

  // Compose final schedule (DB overrides seed for matching cells)
  const result = {};
  for (const day of DAYS) {
    result[day] = (seededSchedule?.[day] || []).map((cell, idx) => {
      const key = `${day}-${idx}`;
      if (dbMap[key]) {
        const e = dbMap[key];
        return {
          entries: [{
            subject:    e.subjectShort,
            subjectCode: e.subjectCode,
            subjectName: e.subjectName,
            category:    e.category,
            faculty:     e.facultyCodes,
            source: 'db',
          }],
        };
      }
      return cell;
    });
  }

  // Add days that don't exist in the seed (new sections from admin)
  for (const day of DAYS) {
    if (!result[day]) {
      result[day] = SLOTS.map((_, idx) => {
        const key = `${day}-${idx}`;
        if (dbMap[key]) {
          const e = dbMap[key];
          return {
            entries: [{
              subject:    e.subjectShort,
              subjectCode: e.subjectCode,
              subjectName: e.subjectName,
              category:    e.category,
              faculty:     e.facultyCodes,
              source: 'db',
            }],
          };
        }
        return null;
      });
    }
  }

  return result;
}

/**
 * Return the union of all faculty codes that are scheduled anywhere — both
 * in the seed and in the DB. Used to validate a registering user.
 */
async function allFacultyCodesMerged() {
  const seededCodes = Object.keys(FACULTY);
  const dbCodes = await TimetableEntry.distinct('facultyCodes');
  return [...new Set([...seededCodes, ...dbCodes])];
}

async function isValidFacultyCodeMerged(code) {
  if (!code) return false;
  if (seeded.isValidFacultyCode(code)) return true;
  const exists = await TimetableEntry.findOne({ facultyCodes: code.toUpperCase() });
  return !!exists;
}

/**
 * Returns the subjects/sections this faculty code teaches across the
 * combined timetable. Each entry shape:
 *   { code, shortName, fullName, category, sections: [...] }
 */
async function subjectsForFacultyMerged(facultyCode) {
  if (!facultyCode) return [];
  const code = facultyCode.toUpperCase();

  // Start with seeded
  const seededList = seeded.subjectsForFaculty(code) || [];
  const dbEntries = await TimetableEntry.find({ facultyCodes: code });

  // Group DB entries
  const dbBySubject = {};
  for (const e of dbEntries) {
    const key = e.subjectShort;
    if (!dbBySubject[key]) {
      dbBySubject[key] = {
        code: e.subjectCode || '',
        shortName: e.subjectShort,
        fullName: e.subjectName || e.subjectShort,
        category: e.category,
        sections: new Set(),
      };
    }
    dbBySubject[key].sections.add(e.section);
  }

  // Merge — DB augments seed
  const merged = {};
  for (const s of seededList) {
    merged[s.shortName] = {
      ...s,
      sections: [...s.sections],
    };
  }
  for (const key of Object.keys(dbBySubject)) {
    if (!merged[key]) {
      merged[key] = {
        ...dbBySubject[key],
        sections: [...dbBySubject[key].sections],
      };
    } else {
      merged[key].sections = [...new Set([...merged[key].sections, ...dbBySubject[key].sections])];
    }
  }

  return Object.values(merged);
}

module.exports = {
  currentSlotMerged,
  scheduleForSectionMerged,
  allFacultyCodesMerged,
  isValidFacultyCodeMerged,
  subjectsForFacultyMerged,
  // re-export pure helpers for callers that still want them
  DAYS, SLOTS, FACULTY, SUBJECT_BY_SHORT,
};
