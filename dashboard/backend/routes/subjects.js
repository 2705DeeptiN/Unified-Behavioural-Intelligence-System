const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Class = require('../models/Class');
const authMiddleware = require('../middleware/auth');
const { subjectsForFacultyMerged } = require('../data/timetable-merged');

router.use(authMiddleware);

/* GET /api/subjects   — the logged-in user's registered subjects */
router.get('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('subjects facultyCode');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.subjects);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* POST /api/subjects   — add a subject (must match timetable allowlist) */
router.post('/', async (req, res) => {
  const { code, name, category, section } = req.body;
  if (!code || !name || !category || !section) {
    return res.status(400).json({ message: 'Code, name, category and section are required' });
  }
  if (!['Theory', 'Tutorial', 'Lab'].includes(category)) {
    return res.status(400).json({ message: 'Invalid category' });
  }
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Teachers AND HODs are bound to the timetable (HODs also teach now).
    // Admin is excluded since admin doesn't add subjects.
    if (user.role === 'teacher' || user.role === 'hod') {
      if (!user.facultyCode) {
        return res.status(400).json({
          message: 'You do not have a faculty code linked to your account. ' +
                   'Please re-register with a valid faculty code.',
        });
      }
      const allowed = await subjectsForFacultyMerged(user.facultyCode);
      const match = allowed.find(s =>
        (s.code === code || s.shortName === code) && s.sections.includes(section));
      if (!match) {
        return res.status(403).json({
          message: `Per the timetable, you do not teach "${code}" in section ${section}. ` +
                   `You can only add subjects listed in your timetable.`,
        });
      }
      if (match.category !== category) {
        return res.status(400).json({
          message: `Category mismatch: timetable lists this subject as ${match.category}.`,
        });
      }
    }

    const dup = user.subjects.find(s =>
      s.code.toLowerCase() === code.toLowerCase() && s.section === section);
    if (dup) {
      return res.status(400).json({ message: 'You have already added this subject for this section' });
    }
    user.subjects.push({ code, name, category, section });
    await user.save();
    const added = user.subjects[user.subjects.length - 1];
    res.status(201).json(added);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* DELETE /api/subjects/:subId  — remove a subject */
router.delete('/:subId', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const sub = user.subjects.id(req.params.subId);
    if (!sub) return res.status(404).json({ message: 'Subject not found' });
    sub.deleteOne();
    await user.save();
    res.json({ message: 'Removed' });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/subjects/allowed — list (subject, section) pairs the
   logged-in user (teacher or HOD) is officially allowed to add. */
router.get('/allowed', async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (user.role === 'admin') {
      return res.json({ facultyCode: null, allowed: [] });
    }
    if (!user.facultyCode) {
      return res.json({ facultyCode: null, allowed: [] });
    }
    const allowed = await subjectsForFacultyMerged(user.facultyCode);
    res.json({ facultyCode: user.facultyCode, allowed });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
