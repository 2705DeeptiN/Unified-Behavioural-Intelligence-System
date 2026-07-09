const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Session = require('../models/Session');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { facultyName, isValidFacultyCode } = require('../data/timetable');

router.use(authMiddleware);

/* ───────────────────────────────────────────────────────────────────────
 *  Performance label helper.
 * ─────────────────────────────────────────────────────────────────────── */
function performanceLabel(score) {
  if (score === null || score === undefined || isNaN(score)) return '—';
  if (score >= 80) return 'EXCELLENT';
  if (score >= 65) return 'GOOD';
  if (score >= 50) return 'AVERAGE';
  return 'NEEDS IMPROVEMENT';
}

/* Extract a single engagement number from a structured payload. */
/* Extract a single engagement number from a structured payload.
 *
 * IMPORTANT: 0% is a REAL result (a fully not-attentive class), not
 * "missing data". We only return null when the field is genuinely absent,
 * so a 0% session is correctly included in averages — e.g. three sessions
 * of 100%, 0%, 0% average to 33.3%, not 100%.
 */
function pickEngagement(structured) {
  const s = structured || {};
  if (typeof s.attentive_pct === 'number') return s.attentive_pct;
  if (typeof s.focused_pct   === 'number') return s.focused_pct;
  if (typeof s.enthu_pct     === 'number') return s.enthu_pct;
  return null;
}

/* ───────────────────────────────────────────────────────────────────────
 *  POST /api/sessions  — persists one analysis result.
 * ─────────────────────────────────────────────────────────────────────── */
router.post('/', async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('name facultyCode role');
    if (!user) return res.status(404).json({ message: 'User not found' });

    const {
      subjectCode, subjectName, subjectShort, category, section,
      analysisType, runMode, structured, verdict, videoName,
      teacherFacultyCode,
    } = req.body;

    if (!analysisType || !section || !category) {
      return res.status(400).json({ message: 'analysisType, section and category are required' });
    }

    let resolvedFacultyCode = user.facultyCode || null;
    let resolvedTeacherName = user.name;
    let resolvedTeacherId   = user._id;

    // HOD analysing on behalf of a teacher.
    if (user.role === 'hod') {
      const tfc = teacherFacultyCode && String(teacherFacultyCode).trim();
      const tnm = req.body.teacherName && String(req.body.teacherName).trim();

      if (tfc) {
        resolvedFacultyCode = tfc.toUpperCase();
        const registered = await User.findOne({
          role: { $in: ['teacher', 'hod'] }, facultyCode: resolvedFacultyCode,
        }).select('name _id');
        if (registered) {
          resolvedTeacherName = registered.name;
          resolvedTeacherId   = registered._id;
        } else {
          resolvedTeacherName = facultyName(resolvedFacultyCode) || resolvedFacultyCode;
          resolvedTeacherId   = null;
        }
      } else if (tnm) {
        // No faculty code for the chosen teacher (common for an
        // "Analyse Teacher" run). Save against the teacher's NAME and
        // derive a stable code from it so reports still group correctly.
        const registered = await User.findOne({
          role: { $in: ['teacher', 'hod'] }, name: tnm,
        }).select('name _id facultyCode');
        if (registered) {
          resolvedTeacherName = registered.name;
          resolvedTeacherId   = registered._id;
          resolvedFacultyCode = registered.facultyCode
            || tnm.toUpperCase().replace(/\s+/g, '_');
        } else {
          resolvedTeacherName = tnm;
          resolvedTeacherId   = null;
          resolvedFacultyCode = tnm.toUpperCase().replace(/\s+/g, '_');
        }
      }
    }

    // Last resort — never block a save just because no faculty code
    // could be resolved; fall back to a name-derived code.
    if (!resolvedFacultyCode) {
      resolvedFacultyCode = (resolvedTeacherName || 'UNKNOWN')
        .toUpperCase().replace(/\s+/g, '_');
    }

    // Was this analysis run BY an HOD on behalf of / about a teacher?
    // (HOD "Analyse Teacher" on a subject.) Such reports belong in the
    // HOD's view only — they must NOT appear in the teacher's own
    // "Previous Class Report".
    const analysedByHod = (user.role === 'hod'
      && (analysisType === 'teacher'
          || (teacherFacultyCode && String(teacherFacultyCode).trim())
          || (req.body.teacherName && String(req.body.teacherName).trim())));

    const doc = new Session({
      teacherId:   resolvedTeacherId,
      teacherName: resolvedTeacherName,
      facultyCode: resolvedFacultyCode,
      subjectCode, subjectName, subjectShort, category, section,
      analysisType, runMode: analysedByHod ? 'hod' : (runMode || 'manual'),
      analysedByHod: !!analysedByHod,
      ownerId: analysedByHod ? req.user.id : resolvedTeacherId,
      structured: structured || {}, verdict: verdict || '',
      videoName: videoName || '',
    });
    await doc.save();
    res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/my  — sessions belonging to the logged-in teacher.
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/my', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    // A teacher's own report excludes analyses that an HOD ran ABOUT them
    // (HOD "Analyse Teacher"). Those live only in the HOD's view.
    const docs = await Session.find({
      teacherId: req.user.id,
      analysedByHod: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .limit(limit);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions  (HOD-only) — filterable list.
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/', requireRole('hod'), async (req, res) => {
  try {
    const q = {};
    if (req.query.section)      q.section      = req.query.section.toUpperCase();
    if (req.query.subjectCode)  q.subjectCode  = req.query.subjectCode;
    if (req.query.subjectShort) q.subjectShort = req.query.subjectShort;
    if (req.query.facultyCode)  q.facultyCode  = req.query.facultyCode.toUpperCase();
    if (req.query.category)     q.category     = req.query.category;
    if (req.query.analysisType) q.analysisType = req.query.analysisType;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);

    const docs = await Session.find(q).sort({ createdAt: -1 }).limit(limit);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  DYNAMIC PICKER ENDPOINTS  (HOD-only)
 *
 *  These power the HOD's "ask first" dialogs. Everything is derived live
 *  from the Session collection — nothing is hardcoded. As new analyses are
 *  saved, these lists grow automatically.
 * ─────────────────────────────────────────────────────────────────────── */

/* GET /api/sessions/options/subjects
 * Distinct subjects that actually have at least one (student) analysis.
 * Used by: Class-wise Analysis (pick a subject) and Teacher-wise (pick a
 * subject) dialogs.
 * → [{ subjectCode, subjectShort, subjectName, category, sections[], sessions }]
 */
router.get('/options/subjects', requireRole('hod'), async (req, res) => {
  try {
    const docs = await Session.find({ analysisType: { $ne: 'teacher' } })
      .select('subjectCode subjectShort subjectName category section');
    const map = {};
    for (const d of docs) {
      const key = (d.subjectCode || d.subjectShort || d.subjectName || '').toUpperCase();
      if (!key) continue;
      if (!map[key]) map[key] = {
        subjectCode:  d.subjectCode  || '',
        subjectShort: d.subjectShort || d.subjectName || key,
        subjectName:  d.subjectName  || d.subjectShort || key,
        category:     d.category || '',
        sections:     new Set(),
        sessions:     0,
      };
      map[key].sessions++;
      if (d.section) map[key].sections.add(d.section);
    }
    const out = Object.values(map)
      .map(s => ({ ...s, sections: [...s.sections].sort() }))
      .sort((a, b) => (a.subjectName || '').localeCompare(b.subjectName || ''));
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/sessions/options/classes
 * Distinct sections that have at least one analysis.
 * Used by: Subject-wise Analysis (pick a class) dialog.
 * → [{ section, sessions }]
 */
router.get('/options/classes', requireRole('hod'), async (req, res) => {
  try {
    const docs = await Session.find({ analysisType: { $ne: 'teacher' } }).select('section');
    const map = {};
    for (const d of docs) {
      if (!d.section) continue;
      map[d.section] = (map[d.section] || 0) + 1;
    }
    const out = Object.keys(map).sort()
      .map(section => ({ section, sessions: map[section] }));
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* GET /api/sessions/options/teachers
 * Distinct teachers that have at least one analysis attributed to them.
 * Used by: Teacher-wise Analysis (pick a teacher) dialog.
 * → [{ facultyCode, teacherName, sessions }]
 */
router.get('/options/teachers', requireRole('hod'), async (req, res) => {
  try {
    const docs = await Session.find({}).select('facultyCode teacherName');
    const map = {};
    for (const d of docs) {
      const key = (d.facultyCode || d.teacherName || '').toUpperCase();
      if (!key) continue;
      if (!map[key]) map[key] = {
        facultyCode: d.facultyCode || '',
        teacherName: d.teacherName || key,
        sessions: 0,
      };
      map[key].sessions++;
    }
    const out = Object.values(map)
      .sort((a, b) => (a.teacherName || '').localeCompare(b.teacherName || ''));
    res.json(out);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/class    (HOD-only)
 *  Overall student performance per section (all subjects combined).
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/class', requireRole('hod'), async (req, res) => {
  try {
    const docs = await Session.find({ analysisType: { $ne: 'teacher' } })
      .sort({ createdAt: -1 });

    const byClass = {};
    for (const d of docs) {
      const sec = d.section;
      if (!byClass[sec]) byClass[sec] = {
        section: sec, sessions: 0,
        attentiveAcc: 0, attentiveN: 0,
        focusedAcc: 0,   focusedN: 0,
        engagementAcc: 0, engagementN: 0,
        lastUpdated: d.createdAt,
      };
      const b = byClass[sec];
      b.sessions++;
      const s = d.structured || {};
      if (typeof s.attentive_pct === 'number') { b.attentiveAcc += s.attentive_pct; b.attentiveN++; }
      if (typeof s.focused_pct   === 'number') { b.focusedAcc   += s.focused_pct;   b.focusedN++; }
      const eng = pickEngagement(s);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      if (d.createdAt > b.lastUpdated) b.lastUpdated = d.createdAt;
    }

    const out = Object.values(byClass).map(b => {
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      return {
        section:       b.section,
        sessions:      b.sessions,
        avgAttentive:  b.attentiveN ? +(b.attentiveAcc / b.attentiveN).toFixed(1) : null,
        avgFocused:    b.focusedN   ? +(b.focusedAcc   / b.focusedN).toFixed(1)   : null,
        avgEngagement,
        performance:   performanceLabel(avgEngagement),
        lastUpdated:   b.lastUpdated,
      };
    }).sort((a, b) => a.section.localeCompare(b.section));

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/class-by-subject?subjectCode=..&subjectShort=..
 *  (HOD-only)
 *
 *  CLASS-WISE ANALYSIS for ONE subject. Returns one row per SECTION that
 *  has an analysis of that subject, so the HOD can compare how the same
 *  subject is doing across 6A / 6B / 6C / 6D.
 *
 *  → { subject:{...}, rows:[{ section, sessions, avgAttentive, avgFocused,
 *      avgEngagement, performance, facultyCodes[], teacherNames[],
 *      latestVerdict, lastUpdated }] }
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/class-by-subject', requireRole('hod'), async (req, res) => {
  try {
    const subjectCode  = (req.query.subjectCode  || '').trim();
    const subjectShort = (req.query.subjectShort || '').trim();
    if (!subjectCode && !subjectShort) {
      return res.status(400).json({ message: 'subjectCode or subjectShort required' });
    }

    const q = { analysisType: { $ne: 'teacher' } };
    if (subjectCode)  q.subjectCode  = subjectCode;
    if (subjectShort) q.subjectShort = subjectShort;

    const docs = await Session.find(q).sort({ createdAt: -1 });

    let subjectMeta = { subjectCode, subjectShort, subjectName: subjectShort || subjectCode, category: '' };
    if (docs.length) {
      subjectMeta = {
        subjectCode:  docs[0].subjectCode  || subjectCode,
        subjectShort: docs[0].subjectShort || subjectShort,
        subjectName:  docs[0].subjectName  || docs[0].subjectShort || subjectShort || subjectCode,
        category:     docs[0].category || '',
      };
    }

    const bySection = {};
    for (const d of docs) {
      const sec = d.section || '—';
      if (!bySection[sec]) bySection[sec] = {
        section: sec, sessions: 0,
        attentiveAcc: 0, attentiveN: 0,
        focusedAcc: 0, focusedN: 0,
        engagementAcc: 0, engagementN: 0,
        facultyCodes: new Set(),
        teacherNames: new Set(),
        latestVerdict: '', latestAt: null,
        lastUpdated: d.createdAt,
      };
      const b = bySection[sec];
      b.sessions++;
      const s = d.structured || {};
      if (typeof s.attentive_pct === 'number') { b.attentiveAcc += s.attentive_pct; b.attentiveN++; }
      if (typeof s.focused_pct   === 'number') { b.focusedAcc   += s.focused_pct;   b.focusedN++; }
      const eng = pickEngagement(s);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      if (d.facultyCode) b.facultyCodes.add(d.facultyCode);
      if (d.teacherName) b.teacherNames.add(d.teacherName);
      if (!b.latestAt || d.createdAt > b.latestAt) {
        b.latestAt = d.createdAt;
        b.latestVerdict = d.verdict || '';
      }
      if (d.createdAt > b.lastUpdated) b.lastUpdated = d.createdAt;
    }

    const rows = Object.values(bySection).map(b => {
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      return {
        section:       b.section,
        sessions:      b.sessions,
        avgAttentive:  b.attentiveN ? +(b.attentiveAcc / b.attentiveN).toFixed(1) : null,
        avgFocused:    b.focusedN   ? +(b.focusedAcc   / b.focusedN).toFixed(1)   : null,
        avgEngagement,
        performance:   performanceLabel(avgEngagement),
        facultyCodes:  [...b.facultyCodes].sort(),
        teacherNames:  [...b.teacherNames].sort(),
        latestVerdict: b.latestVerdict,
        lastUpdated:   b.lastUpdated,
      };
    }).sort((a, b) => a.section.localeCompare(b.section));

    res.json({ subject: subjectMeta, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/subject    (HOD-only)
 *  Overall student performance per subject (all sections combined).
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/subject', requireRole('hod'), async (req, res) => {
  try {
    const docs = await Session.find({ analysisType: { $ne: 'teacher' } })
      .sort({ createdAt: -1 });

    const bySubject = {};
    for (const d of docs) {
      const key = d.subjectCode || d.subjectShort || d.subjectName;
      if (!key) continue;

      if (!bySubject[key]) bySubject[key] = {
        key,
        subjectCode:  d.subjectCode || '',
        subjectName:  d.subjectName  || d.subjectShort || key,
        subjectShort: d.subjectShort || d.subjectName  || key,
        category:     d.category,
        sessions: 0,
        engagementAcc: 0, engagementN: 0,
        sections: new Set(),
        lastUpdated: d.createdAt,
      };
      const b = bySubject[key];
      b.sessions++;
      const eng = pickEngagement(d.structured);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      b.sections.add(d.section);
      if (d.createdAt > b.lastUpdated) b.lastUpdated = d.createdAt;
    }

    const out = Object.values(bySubject).map(b => {
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      return {
        subjectCode:   b.subjectCode,
        subjectName:   b.subjectName,
        subjectShort:  b.subjectShort,
        category:      b.category,
        sessions:      b.sessions,
        avgEngagement,
        performance:   performanceLabel(avgEngagement),
        sections:      [...b.sections].sort(),
        lastUpdated:   b.lastUpdated,
      };
    }).sort((a, b) => (a.subjectCode || a.subjectShort || '').localeCompare(b.subjectCode || b.subjectShort || ''));

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/subject-by-class?section=6A   (HOD-only)
 *
 *  SUBJECT-WISE ANALYSIS for ONE class/section. Returns one row per
 *  SUBJECT analysed in that section.
 *
 *  → { section, rows:[{ subjectCode, subjectShort, subjectName, category,
 *      sessions, avgAttentive, avgFocused, avgEngagement, performance,
 *      facultyCodes[], teacherNames[], latestVerdict, lastUpdated }] }
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/subject-by-class', requireRole('hod'), async (req, res) => {
  try {
    const section = (req.query.section || '').trim().toUpperCase();
    if (!section) return res.status(400).json({ message: 'section required' });

    const docs = await Session.find({
      analysisType: { $ne: 'teacher' }, section,
    }).sort({ createdAt: -1 });

    const bySubject = {};
    for (const d of docs) {
      const key = d.subjectCode || d.subjectShort || d.subjectName;
      if (!key) continue;
      if (!bySubject[key]) bySubject[key] = {
        subjectCode:  d.subjectCode  || '',
        subjectShort: d.subjectShort || d.subjectName || key,
        subjectName:  d.subjectName  || d.subjectShort || key,
        category:     d.category || '',
        sessions: 0,
        attentiveAcc: 0, attentiveN: 0,
        focusedAcc: 0, focusedN: 0,
        engagementAcc: 0, engagementN: 0,
        facultyCodes: new Set(),
        teacherNames: new Set(),
        latestVerdict: '', latestAt: null,
        lastUpdated: d.createdAt,
      };
      const b = bySubject[key];
      b.sessions++;
      const s = d.structured || {};
      if (typeof s.attentive_pct === 'number') { b.attentiveAcc += s.attentive_pct; b.attentiveN++; }
      if (typeof s.focused_pct   === 'number') { b.focusedAcc   += s.focused_pct;   b.focusedN++; }
      const eng = pickEngagement(s);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      if (d.facultyCode) b.facultyCodes.add(d.facultyCode);
      if (d.teacherName) b.teacherNames.add(d.teacherName);
      if (!b.latestAt || d.createdAt > b.latestAt) {
        b.latestAt = d.createdAt;
        b.latestVerdict = d.verdict || '';
      }
      if (d.createdAt > b.lastUpdated) b.lastUpdated = d.createdAt;
    }

    const rows = Object.values(bySubject).map(b => {
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      return {
        subjectCode:   b.subjectCode,
        subjectShort:  b.subjectShort,
        subjectName:   b.subjectName,
        category:      b.category,
        sessions:      b.sessions,
        avgAttentive:  b.attentiveN ? +(b.attentiveAcc / b.attentiveN).toFixed(1) : null,
        avgFocused:    b.focusedN   ? +(b.focusedAcc   / b.focusedN).toFixed(1)   : null,
        avgEngagement,
        performance:   performanceLabel(avgEngagement),
        facultyCodes:  [...b.facultyCodes].sort(),
        teacherNames:  [...b.teacherNames].sort(),
        latestVerdict: b.latestVerdict,
        lastUpdated:   b.lastUpdated,
      };
    }).sort((a, b) => (a.subjectName || '').localeCompare(b.subjectName || ''));

    res.json({ section, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/teacher    (HOD-only)
 *  Overall teacher performance across every class they teach.
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/teacher', requireRole('hod'), async (req, res) => {
  try {
    const docs = await Session.find({}).sort({ createdAt: -1 });

    const byTeacher = {};
    for (const d of docs) {
      const key = d.facultyCode;
      if (!key) continue;

      if (!byTeacher[key]) byTeacher[key] = {
        facultyCode: d.facultyCode,
        teacherName: d.teacherName,
        sessions: 0,
        enthuAcc: 0, enthuN: 0,
        engagementAcc: 0, engagementN: 0,
        lastUpdated: d.createdAt,
      };
      const b = byTeacher[key];
      b.sessions++;
      const s = d.structured || {};
      if (typeof s.enthu_pct === 'number' && s.enthu_pct > 0) {
        b.enthuAcc += s.enthu_pct; b.enthuN++;
      }
      const eng = pickEngagement(s);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      if (d.createdAt > b.lastUpdated) b.lastUpdated = d.createdAt;
    }

    const out = Object.values(byTeacher).map(b => {
      const avgEnthu      = b.enthuN      ? +(b.enthuAcc      / b.enthuN     ).toFixed(1) : null;
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      let overall = null;
      if (avgEnthu !== null && avgEngagement !== null) {
        overall = +((avgEnthu * 0.6 + avgEngagement * 0.4)).toFixed(1);
      } else if (avgEnthu !== null) {
        overall = avgEnthu;
      } else if (avgEngagement !== null) {
        overall = avgEngagement;
      }
      return {
        facultyCode: b.facultyCode,
        teacherName: b.teacherName,
        sessions:    b.sessions,
        avgEnthu,
        avgEngagement,
        overallScore: overall,
        performance:  performanceLabel(overall),
        lastUpdated:  b.lastUpdated,
      };
    }).sort((a, b) => (b.overallScore || 0) - (a.overallScore || 0));

    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/teacher-by-name?facultyCode=US   (HOD-only)
 *
 *  TEACHER-WISE ANALYSIS for ONE teacher. Returns one row per SUBJECT that
 *  teacher has been analysed in, so the HOD sees how the teacher performs
 *  across all the subjects they handle.
 *
 *  → { teacher:{ facultyCode, teacherName }, rows:[{ subjectCode,
 *      subjectShort, subjectName, category, section, sessions,
 *      avgEngagement, performance, lastUpdated }] }
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/teacher-by-name', requireRole('hod'), async (req, res) => {
  try {
    const facultyCode = (req.query.facultyCode || '').trim().toUpperCase();
    const teacherName = (req.query.teacherName || '').trim();
    if (!facultyCode && !teacherName) {
      return res.status(400).json({ message: 'facultyCode or teacherName required' });
    }

    const q = {};
    if (facultyCode) q.facultyCode = facultyCode;
    else             q.teacherName = teacherName;

    const docs = await Session.find(q).sort({ createdAt: -1 });

    let teacherMeta = { facultyCode, teacherName };
    if (docs.length) {
      teacherMeta = {
        facultyCode: docs[0].facultyCode || facultyCode,
        teacherName: docs[0].teacherName || teacherName,
      };
    }

    // group by subject + section so each subject the teacher takes shows up
    const bySubject = {};
    for (const d of docs) {
      const key = `${d.subjectCode || d.subjectShort || d.subjectName || '—'}::${d.section || '—'}`;
      if (!bySubject[key]) bySubject[key] = {
        subjectCode:  d.subjectCode  || '',
        subjectShort: d.subjectShort || d.subjectName || key,
        subjectName:  d.subjectName  || d.subjectShort || key,
        category:     d.category || '',
        section:      d.section || '—',
        sessions: 0,
        enthuAcc: 0, enthuN: 0,
        engagementAcc: 0, engagementN: 0,
        latestVerdict: '', latestAt: null,
        lastUpdated: d.createdAt,
      };
      const b = bySubject[key];
      b.sessions++;
      const s = d.structured || {};
      if (typeof s.enthu_pct === 'number' && s.enthu_pct > 0) { b.enthuAcc += s.enthu_pct; b.enthuN++; }
      const eng = pickEngagement(s);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      if (!b.latestAt || d.createdAt > b.latestAt) {
        b.latestAt = d.createdAt;
        b.latestVerdict = d.verdict || '';
      }
      if (d.createdAt > b.lastUpdated) b.lastUpdated = d.createdAt;
    }

    const rows = Object.values(bySubject).map(b => {
      const avgEnthu      = b.enthuN      ? +(b.enthuAcc      / b.enthuN     ).toFixed(1) : null;
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      let score = null;
      if (avgEnthu !== null && avgEngagement !== null) {
        score = +((avgEnthu * 0.6 + avgEngagement * 0.4)).toFixed(1);
      } else if (avgEnthu !== null)      score = avgEnthu;
      else if (avgEngagement !== null)   score = avgEngagement;
      return {
        subjectCode:   b.subjectCode,
        subjectShort:  b.subjectShort,
        subjectName:   b.subjectName,
        category:      b.category,
        section:       b.section,
        sessions:      b.sessions,
        avgEnthu,
        avgEngagement,
        score,
        performance:   performanceLabel(score),
        latestVerdict: b.latestVerdict,
        lastUpdated:   b.lastUpdated,
      };
    }).sort((a, b) => (b.score || 0) - (a.score || 0));

    res.json({ teacher: teacherMeta, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────────────────────────────────────────────────────────────────────
 *  GET /api/sessions/aggregate/by-subject-faculty?subjectCode=..   (HOD-only)
 *
 *  TEACHER-WISE ANALYSIS for ONE subject. Returns one row per faculty
 *  member who has been analysed teaching that subject, so the HOD can
 *  compare every teacher running the same subject.
 * ─────────────────────────────────────────────────────────────────────── */
router.get('/aggregate/by-subject-faculty', requireRole('hod'), async (req, res) => {
  try {
    const subjectCode  = (req.query.subjectCode  || '').trim();
    const subjectShort = (req.query.subjectShort || '').trim();
    if (!subjectCode && !subjectShort) {
      return res.status(400).json({ message: 'subjectCode or subjectShort required' });
    }

    const q = { analysisType: { $ne: 'teacher' } };
    if (subjectCode)  q.subjectCode  = subjectCode;
    if (subjectShort) q.subjectShort = subjectShort;

    const docs = await Session.find(q).sort({ createdAt: -1 });

    let subjectMeta = { subjectCode, subjectShort, subjectName: subjectShort || subjectCode };
    if (docs.length) {
      subjectMeta = {
        subjectCode:  docs[0].subjectCode  || subjectCode,
        subjectShort: docs[0].subjectShort || subjectShort,
        subjectName:  docs[0].subjectName  || docs[0].subjectShort || subjectShort || subjectCode,
      };
    }

    const byFac = {};
    for (const d of docs) {
      const key = (d.facultyCode || d.teacherName || 'UNKNOWN').toUpperCase();
      if (!byFac[key]) byFac[key] = {
        facultyCode:  d.facultyCode || '',
        teacherName:  d.teacherName  || '',
        sessions:     0,
        attentiveAcc: 0, attentiveN: 0,
        focusedAcc:   0, focusedN:   0,
        engagementAcc: 0, engagementN: 0,
        sections:     new Set(),
        latestVerdict: '',
        latestAt:      null,
        latestReasons: [],
      };
      const b = byFac[key];
      b.sessions++;
      const s = d.structured || {};
      if (typeof s.attentive_pct === 'number') { b.attentiveAcc += s.attentive_pct; b.attentiveN++; }
      if (typeof s.focused_pct   === 'number') { b.focusedAcc   += s.focused_pct;   b.focusedN++;   }
      const eng = pickEngagement(s);
      if (eng !== null) { b.engagementAcc += eng; b.engagementN++; }
      if (d.section) b.sections.add(d.section);
      if (!b.latestAt || d.createdAt > b.latestAt) {
        b.latestAt      = d.createdAt;
        b.latestVerdict = d.verdict || '';
        b.latestReasons = Array.isArray(s.reasons) ? s.reasons.slice(0, 4) : [];
      }
    }

    const rows = Object.values(byFac).map(b => {
      const avgEngagement = b.engagementN ? +(b.engagementAcc / b.engagementN).toFixed(1) : null;
      return {
        facultyCode:    b.facultyCode,
        teacherName:    b.teacherName,
        sessions:       b.sessions,
        avgAttentive:   b.attentiveN ? +(b.attentiveAcc / b.attentiveN).toFixed(1) : null,
        avgFocused:     b.focusedN   ? +(b.focusedAcc   / b.focusedN).toFixed(1)   : null,
        avgEngagement,
        performance:    performanceLabel(avgEngagement),
        sections:       [...b.sections].sort(),
        latestVerdict:  b.latestVerdict,
        latestAt:       b.latestAt,
        latestReasons:  b.latestReasons,
      };
    }).sort((a, b) => (b.avgEngagement || 0) - (a.avgEngagement || 0));

    res.json({ subject: subjectMeta, rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
