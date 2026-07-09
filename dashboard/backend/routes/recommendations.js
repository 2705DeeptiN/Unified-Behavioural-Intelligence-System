const express = require('express');
const router = express.Router();
const Recommendation = require('../models/Recommendation');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

/**
 * Create a recommendation.  Called automatically by the AnalysisModal
 * after a session is saved, but also reachable manually.  Body:
 *   sessionId, section, subjectShort, subjectName, subjectCode, category,
 *   dominantEmotion, advice, hodNote, severity,
 *   distractedPct, distractionReasons
 */
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name facultyCode role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const {
      sessionId, section, subjectShort, subjectName, subjectCode, category,
      dominantEmotion, advice, hodNote, severity,
      distractedPct, distractionReasons,
      teacherFacultyCode,
    } = req.body;

    if (!section || !category || !advice || !hodNote) {
      return res.status(400).json({ message: 'section, category, advice and hodNote are required' });
    }

    // Resolve teacher (HOD-issued recs may attribute to a different teacher)
    let resolvedFaculty = user.facultyCode;
    let resolvedTeacherName = user.name;
    let resolvedTeacherId = user._id;
    if (user.role === 'hod' && teacherFacultyCode) {
      const registered = await User.findOne({ facultyCode: teacherFacultyCode.toUpperCase() });
      if (registered) {
        resolvedFaculty = registered.facultyCode;
        resolvedTeacherName = registered.name;
        resolvedTeacherId = registered._id;
      } else {
        resolvedFaculty = teacherFacultyCode.toUpperCase();
      }
    }

    if (!resolvedFaculty) {
      return res.status(400).json({ message: 'Cannot create recommendation without a faculty code' });
    }

    const doc = new Recommendation({
      sessionId: sessionId || undefined,
      teacherId: resolvedTeacherId,
      teacherName: resolvedTeacherName,
      facultyCode: resolvedFaculty,
      section, subjectShort, subjectName, subjectCode, category,
      dominantEmotion: dominantEmotion || '',
      advice, hodNote,
      severity: severity || 'info',
      distractedPct: distractedPct || 0,
      distractionReasons: distractionReasons || [],
    });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/recommendations/my
 * Logged-in teacher: returns recommendations attributed to them.
 */
router.get('/my', async (req, res) => {
  try {
    const docs = await Recommendation.find({ teacherId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * GET /api/recommendations  (HOD)
 * All recommendations across all teachers. Filterable by section / facultyCode.
 */
router.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'hod' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'HOD or Admin only' });
    }
    const q = {};
    if (req.query.section) q.section = req.query.section;
    if (req.query.facultyCode) q.facultyCode = req.query.facultyCode.toUpperCase();
    if (req.query.unack === 'true') q.acknowledged = false;
    const docs = await Recommendation.find(q).sort({ createdAt: -1 }).limit(200);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * Mark a recommendation as acknowledged (HOD has read it).
 */
router.patch('/:id/ack', async (req, res) => {
  try {
    if (req.user.role !== 'hod' && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'HOD or Admin only' });
    }
    const updated = await Recommendation.findByIdAndUpdate(
      req.params.id,
      { acknowledged: true },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: 'Recommendation not found' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
