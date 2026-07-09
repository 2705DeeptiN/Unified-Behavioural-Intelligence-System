const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const seeded = require('../data/timetable');
const {
  currentSlotMerged,
  scheduleForSectionMerged,
  isValidFacultyCodeMerged,
  subjectsForFacultyMerged,
} = require('../data/timetable-merged');

const { facultyName, SLOTS, DAYS, ROOM, SUBJECT_BY_SHORT } = seeded;

router.use(authMiddleware);

/* GET /api/timetable/current
 * Returns the current scheduled slot for the logged-in user (teacher or HOD).
 * Reads both seeded and Admin-added entries.
 */
router.get('/current', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('facultyCode role');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.facultyCode) {
      return res.json({ slot: null, reason: 'no faculty code linked' });
    }

    const now = new Date();
    const dayNames = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const day = (req.query.day || dayNames[now.getDay()]).toUpperCase();
    const time = req.query.time
      || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const slot = await currentSlotMerged(user.facultyCode, day, time);
    if (!slot) {
      return res.json({
        slot: null, now: time, day,
        reason: 'No class scheduled in this slot for your faculty code',
      });
    }

    const subjMeta = SUBJECT_BY_SHORT[slot.subjectShort.toUpperCase()];
    res.json({
      now: time, day,
      slot: {
        ...slot,
        subjectCode: subjMeta ? subjMeta.code : null,
        subjectName: subjMeta ? subjMeta.fullName : slot.subjectShort,
        category:    subjMeta ? subjMeta.category : 'Theory',
        room:        ROOM[slot.section] || null,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/timetable/teaching-now
 * Returns every teacher currently taking a class right now (across all
 * sections), so the HOD can pick which live teacher to analyse. */
router.get('/teaching-now', async (req, res) => {
  try {
    const now = new Date();
    const dayNames = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
    const day  = (req.query.day || dayNames[now.getDay()]).toUpperCase();
    const time = req.query.time
      || `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const list = seeded.allTeachingNow(day, time) || [];
    res.json({ now: time, day, teaching: list });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/timetable/section/:section — full week schedule */
router.get('/section/:section', async (req, res) => {
  try {
    const section = req.params.section.toUpperCase();
    const schedule = await scheduleForSectionMerged(section);
    if (!schedule) return res.status(404).json({ message: 'Section not found' });

    const resolved = {};
    for (const day of DAYS) {
      resolved[day] = (schedule[day] || []).map(cell => {
        if (!cell) return null;
        return {
          entries: cell.entries.map(e => {
            const meta = SUBJECT_BY_SHORT[(e.subject || '').toUpperCase()];
            return {
              subjectShort: e.subject,
              subjectCode:  e.subjectCode || meta?.code || null,
              subjectName:  e.subjectName || meta?.fullName || e.subject,
              category:     e.category   || meta?.category || 'Theory',
              facultyCodes: e.faculty,
              facultyNames: (e.faculty || []).map(c => facultyName(c) || c),
            };
          }),
        };
      });
    }
    res.json({
      section,
      room:     ROOM[section] || null,
      slots:    SLOTS,
      days:     DAYS,
      schedule: resolved,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/timetable/registered-teachers — used by HOD's Teacher Analysis */
router.get('/registered-teachers', async (req, res) => {
  try {
    // Include both teachers AND HODs (because HODs teach too in the new model)
    const teachers = await User.find({ role: { $in: ['teacher', 'hod'] } })
      .select('name facultyCode subjects email role');

    // ?all=1 → include teachers even if they have no (valid) faculty code.
    // Used by the "Analyse Teacher" flow, which must list every teacher.
    const includeAll = req.query.all === '1' || req.query.all === 'true';

    const out = [];
    for (const t of teachers) {
      if (!t.facultyCode) {
        if (!includeAll) continue;
      } else {
        const isValid = await isValidFacultyCodeMerged(t.facultyCode);
        if (!isValid && !includeAll) continue;
      }
      out.push({
        _id:           t._id,
        name:          t.name,
        email:         t.email,
        role:          t.role,
        facultyCode:   t.facultyCode || '',
        timetableName: t.facultyCode ? (facultyName(t.facultyCode) || t.facultyCode) : t.name,
        subjects:      t.subjects.map(s => ({
          code: s.code, name: s.name, category: s.category, section: s.section,
        })),
        sections:      [...new Set(t.subjects.map(s => s.section))].sort(),
      });
    }
    res.json({ teachers: out });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/timetable/subjects-for/:facultyCode
 * Returns the subjects a given faculty code teaches, from the combined
 * (seeded + Admin-added) timetable. Used by the HOD's "Analyse Teacher"
 * flow so it can list which subject the live teacher analysis is for.
 */
router.get('/subjects-for/:facultyCode', async (req, res) => {
  try {
    const code = (req.params.facultyCode || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ message: 'facultyCode required' });
    const subjects = await subjectsForFacultyMerged(code);
    res.json({
      facultyCode: code,
      teacherName: facultyName(code) || code,
      subjects: subjects.map(s => ({
        code:      s.code,
        shortName: s.shortName,
        fullName:  s.fullName,
        category:  s.category,
        sections:  s.sections,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
