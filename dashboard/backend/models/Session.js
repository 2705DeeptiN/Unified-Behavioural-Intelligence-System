const mongoose = require('mongoose');

/**
 * One document = one analysis run.  Persisted so HOD and Teacher can browse
 * history later (class-wise / subject-wise / teacher-wise).
 *
 *   • teacherId      — Mongo _id of the User who ran the analysis (or whose
 *                       class was analysed by HOD)
 *   • teacherName    — denormalised for fast display
 *   • facultyCode    — short code from the timetable
 *   • subjectCode    — e.g. "CS62"
 *   • subjectName    — full name
 *   • subjectShort   — short label as in the timetable ("CC&BD", "DL", …)
 *   • category       — Theory | Tutorial | Lab | Teacher
 *   • section        — 6A / 6B / 6C / 6D
 *   • analysisType   — lab | theory | tutorial | teacher  (matches Flask endpoints)
 *   • runMode        — 'realtime' | 'manual' | 'hod'
 *   • structured     — JSON blob exactly as returned by Flask
 *                       (attentive_pct / focused_pct / enthu_pct etc.)
 *   • verdict        — short verdict label for table views
 *   • videoName      — which random video was used
 *   • createdAt      — auto
 */
const sessionSchema = new mongoose.Schema({
  teacherId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teacherName:  { type: String, required: true },
  // facultyCode is no longer strictly required — a teacher analysis can be
  // saved against a teacher who has no timetable faculty code. When absent
  // it is derived from the teacher name so reports still group correctly.
  facultyCode:  { type: String, default: '' },

  subjectCode:  { type: String },
  subjectName:  { type: String },
  subjectShort: { type: String },
  category:     { type: String, enum: ['Theory', 'Tutorial', 'Lab', 'Teacher'], required: true },
  // section is NOT restricted to a fixed enum — the Admin can create new
  // sections (4A, 7B, …) through Manage Timetable, and analyses for those
  // sections must be saveable too.
  section:      { type: String, required: true },

  analysisType: { type: String, enum: ['lab', 'theory', 'tutorial', 'teacher'], required: true },
  runMode:      { type: String, enum: ['realtime', 'manual', 'hod'], default: 'manual' },
  // True when an HOD ran an "Analyse Teacher" analysis ABOUT a teacher.
  // These belong in the HOD's view only, never the teacher's own report.
  analysedByHod: { type: Boolean, default: false },
  ownerId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  structured:   { type: mongoose.Schema.Types.Mixed },
  verdict:      { type: String, default: '' },
  videoName:    { type: String, default: '' },
}, { timestamps: true });

sessionSchema.index({ teacherId: 1, createdAt: -1 });
sessionSchema.index({ section: 1, createdAt: -1 });
sessionSchema.index({ subjectCode: 1, createdAt: -1 });

module.exports = mongoose.model('Session', sessionSchema);
