const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isValidFacultyCode, facultyName } = require('../data/timetable');
const { isValidFacultyCodeMerged } = require('../data/timetable-merged');

/**
 * Simple, easy-to-remember secret codes for registration.
 * Teachers / HODs / Admins must each present the matching code at sign-up.
 */
const SECRET_KEYS = {
  teacher: 'teacher123',
  hod:     'hod123',
  admin:   'admin123',
};

const attemptTracker = {};

router.post('/register', async (req, res) => {
  const { name, email, password, department, role, secretKey, facultyCode } = req.body;

  if (!['teacher', 'hod', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }

  // Department is mandatory for teacher & HOD, optional for admin
  let normalisedDept = '';
  if (role !== 'admin') {
    if (!department || typeof department !== 'string' || !department.trim()) {
      return res.status(400).json({ message: 'Department is required' });
    }
    normalisedDept = department.trim();
  }

  // ── Faculty-code validation ────────────────────────────────────────────
  // Teachers MUST supply a valid faculty code that exists in the timetable.
  // HODs MUST also supply one, since they too teach some classes.
  // Admins are not bound to any timetable row, so faculty code is ignored.
  let normalisedFacultyCode = null;
  if (role === 'teacher' || role === 'hod') {
    const hasCode = facultyCode && typeof facultyCode === 'string' && facultyCode.trim();

    // Teachers MUST supply a faculty code. HODs MAY supply one — an HOD
    // can also be a teacher, but an HOD who does not teach any class can
    // register without a faculty code.
    if (role === 'teacher' && !hasCode) {
      return res.status(400).json({
        message: 'Faculty code is required for teachers.',
      });
    }

    if (hasCode) {
      const code = facultyCode.trim().toUpperCase();
      // Validate against the COMBINED timetable (seeded + Admin-added),
      // so a faculty code the Admin added through Manage Timetable is
      // accepted here too.
      const valid = await isValidFacultyCodeMerged(code);
      if (!valid) {
        return res.status(400).json({
          message: `Faculty code "${code}" not found in the timetable ` +
                   `(seeded or Admin-added). Ask your Admin to add a slot ` +
                   `with this faculty code first.`,
        });
      }
      normalisedFacultyCode = code;
    }
  }

  // ── One HOD per department ─────────────────────────────────────────────
  if (role === 'hod') {
    const existingHod = await User.findOne({ role: 'hod', department: normalisedDept });
    if (existingHod) {
      return res.status(409).json({
        message: `Department "${normalisedDept}" already has a registered HOD (${existingHod.name}). ` +
                 `Each department can have only one HOD.`,
      });
    }
  }

  // ── One Admin total (system-wide) ──────────────────────────────────────
  // Admin is a system-level role; we permit only one.
  if (role === 'admin') {
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(409).json({
        message: `An Admin account already exists (${existingAdmin.name}). ` +
                 `Only one Admin is allowed in the system.`,
      });
    }
  }

  // ── Secret-key gate ────────────────────────────────────────────────────
  const trackerKey = `${email}_${role}`;
  if (!attemptTracker[trackerKey]) attemptTracker[trackerKey] = 0;

  if (attemptTracker[trackerKey] >= 2) {
    return res.status(403).json({ message: 'Max secret key attempts exceeded' });
  }

  if (secretKey !== SECRET_KEYS[role]) {
    attemptTracker[trackerKey]++;
    const remaining = 2 - attemptTracker[trackerKey];
    return res.status(401).json({ message: `Invalid secret key. ${remaining} attempt(s) left` });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      name, email, password: hashed,
      department: normalisedDept,
      role,
      facultyCode: normalisedFacultyCode,
    });
    await user.save();

    delete attemptTracker[trackerKey];
    res.status(201).json({
      message: 'Registered successfully',
      facultyCode: normalisedFacultyCode,
      timetableName: normalisedFacultyCode ? facultyName(normalisedFacultyCode) : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      {
        id: user._id,
        role: user.role,
        name: user.name,
        department: user.department,
        facultyCode: user.facultyCode || null,
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      role: user.role,
      name: user.name,
      facultyCode: user.facultyCode || null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ── Departments list (for Register dropdown) ───────────────────────────────
router.get('/departments', (req, res) => {
  res.json([
    'Computer Science & Engineering',
    'Information Science & Engineering',
    'Electronics & Communication Engineering',
    'Electrical & Electronics Engineering',
    'Mechanical Engineering',
    'Civil Engineering',
    'Artificial Intelligence & Machine Learning',
    'Data Science',
    'Biotechnology',
    'Chemical Engineering',
    'Mathematics',
    'Physics',
    'Chemistry',
  ]);
});

module.exports = router;
