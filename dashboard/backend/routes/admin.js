const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Class = require('../models/Class');
const TimetableEntry = require('../models/TimetableEntry');
const Session = require('../models/Session');
const Recommendation = require('../models/Recommendation');
const authMiddleware = require('../middleware/auth');
const { ROOM, DAYS, SLOTS, SUBJECTS } = require('../data/timetable');

router.use(authMiddleware);

// Helper: admin-only gate
function requireAdmin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ message: 'Admin only' });
    return false;
  }
  return true;
}

/* ════════════════════════════════════════════════════════════════════════
 *  CLASS MANAGEMENT
 *  Add a new class / section.  Lists active classes (DB + seeded 6A-6D).
 * ════════════════════════════════════════════════════════════════════════ */

router.get('/classes', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const dbClasses = await Class.find({}).sort({ section: 1 });

    // Merge with seeded sections from data/timetable.js so the Admin sees
    // the existing 6A/6B/6C/6D rows even before they create any new ones.
    const seeded = Object.entries(ROOM || {}).map(([section, room]) => ({
      section, room, seeded: true,
      semester: 'VI', department: 'Computer Science & Engineering',
    }));
    const seenSections = new Set(dbClasses.map(c => c.section));
    const merged = [
      ...dbClasses.map(c => ({ ...c.toObject(), seeded: false })),
      ...seeded.filter(s => !seenSections.has(s.section)),
    ].sort((a, b) => a.section.localeCompare(b.section));

    res.json(merged);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/classes', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const { section, semester, department, room } = req.body;
    if (!section || !section.trim()) {
      return res.status(400).json({ message: 'Section is required (e.g. "6E", "7A")' });
    }
    const sectionUpper = section.trim().toUpperCase();

    // Block dupes against both the DB and the seeded ROOM map
    const existing = await Class.findOne({ section: sectionUpper });
    if (existing) {
      return res.status(409).json({ message: `Section ${sectionUpper} already exists` });
    }
    if (ROOM && ROOM[sectionUpper]) {
      return res.status(409).json({ message: `Section ${sectionUpper} already exists in the seed timetable` });
    }

    const newClass = new Class({
      section: sectionUpper,
      semester: semester || 'VI',
      department: department || 'Computer Science & Engineering',
      room: room || '',
    });
    await newClass.save();
    res.status(201).json(newClass);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/classes/:section', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const section = req.params.section.toUpperCase();
    if (ROOM && ROOM[section]) {
      return res.status(403).json({
        message: `Section ${section} is part of the official seed timetable and cannot be deleted.`,
      });
    }
    const deleted = await Class.findOneAndDelete({ section });
    if (!deleted) return res.status(404).json({ message: 'Section not found' });
    // Cascade — drop the per-section timetable entries
    await TimetableEntry.deleteMany({ section });
    res.json({ message: `Section ${section} deleted` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ════════════════════════════════════════════════════════════════════════
 *  TIMETABLE ENTRY MANAGEMENT
 *  Lets Admin add subject + faculty rows for any (section, day, slotIdx).
 *  These add to the seeded timetable rather than replace it.
 * ════════════════════════════════════════════════════════════════════════ */

router.get('/timetable-entries', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const q = {};
    if (req.query.section) q.section = req.query.section.toUpperCase();
    const docs = await TimetableEntry.find(q).sort({ section: 1, day: 1, slotIdx: 1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/timetable-entries', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const {
      section, day, slotIdx,
      subjectShort, subjectCode, subjectName, category,
      facultyCodes,
    } = req.body;

    if (!section || !day || slotIdx === undefined || !subjectShort || !category) {
      return res.status(400).json({
        message: 'section, day, slotIdx, subjectShort and category are required',
      });
    }

    const upperSection = section.toUpperCase();
    const upperDay = day.toUpperCase();
    if (!DAYS.includes(upperDay)) {
      return res.status(400).json({ message: `day must be one of: ${DAYS.join(', ')}` });
    }
    if (slotIdx < 0 || slotIdx >= SLOTS.length) {
      return res.status(400).json({ message: `slotIdx must be 0-${SLOTS.length - 1}` });
    }

    // Faculty codes: normalize and de-dup
    const codes = (facultyCodes || [])
      .map(c => String(c).trim().toUpperCase())
      .filter(Boolean);

    // Allow upsert so admin can overwrite a slot
    const entry = await TimetableEntry.findOneAndUpdate(
      { section: upperSection, day: upperDay, slotIdx: Number(slotIdx) },
      {
        section: upperSection, day: upperDay, slotIdx: Number(slotIdx),
        subjectShort: subjectShort.toUpperCase(),
        subjectCode: (subjectCode || '').toUpperCase(),
        subjectName: subjectName || subjectShort,
        category,
        facultyCodes: codes,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.status(201).json(entry);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

router.delete('/timetable-entries/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const deleted = await TimetableEntry.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Entry not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reference data for the Admin Dashboard
router.get('/timetable-meta', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({
    days: DAYS,
    slots: SLOTS,
    subjects: SUBJECTS,    // The base subject catalogue (admin can override per-row anyway)
  });
});

/* ════════════════════════════════════════════════════════════════════════
 *  USER MANAGEMENT  —  Edit/Delete teachers and HODs
 * ════════════════════════════════════════════════════════════════════════ */

router.get('/users', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const role = req.query.role;  // 'teacher' | 'hod' (optional)
    const q = role ? { role } : { role: { $in: ['teacher', 'hod'] } };
    const users = await User.find(q)
      .select('name email department role facultyCode subjects createdAt')
      .sort({ role: 1, name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot delete the Admin account' });
    }
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: `${user.role.toUpperCase()} "${user.name}" deleted` });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.put('/users/:id', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.status(403).json({ message: 'Cannot edit the Admin account' });
    }
    const { name, email, department, facultyCode } = req.body;
    if (name) user.name = name;
    if (email) user.email = email;
    if (department !== undefined) user.department = department;
    if (facultyCode !== undefined) user.facultyCode = facultyCode ? facultyCode.toUpperCase() : null;
    await user.save();
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', detail: err.message });
  }
});

module.exports = router;
