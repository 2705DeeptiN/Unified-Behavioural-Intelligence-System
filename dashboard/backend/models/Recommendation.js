const mongoose = require('mongoose');

/**
 * A Recommendation row captures the actionable insight generated for a
 * teacher at the end of one analysis, and is also surfaced to the HOD.
 *
 *   sessionId     : the Session document this recommendation came from
 *   teacherId     : the teacher whose class produced it
 *   teacherName   : denormalised for fast display
 *   facultyCode   : ditto
 *   section       : 6A, 6B, etc.
 *   subjectShort  : "DL", "BDA" ...
 *   subjectName   : full name
 *   category      : Theory / Tutorial / Lab
 *   dominantEmotion : "Confused", "Disengaged", "Happy", etc.
 *   advice        : short pedagogical advice string shown to teacher
 *   hodNote       : longer note shown to HOD (provides context)
 *   severity      : "info" | "warning" | "critical"
 *   acknowledged  : has the HOD seen / dismissed it
 */
const recommendationSchema = new mongoose.Schema({
  sessionId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Session' },

  teacherId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  teacherName:   { type: String, required: true },
  facultyCode:   { type: String, required: true, index: true },

  section:       { type: String, required: true, index: true },
  subjectShort:  { type: String, default: '' },
  subjectName:   { type: String, default: '' },
  subjectCode:   { type: String, default: '' },
  category:      { type: String, enum: ['Theory', 'Tutorial', 'Lab'], required: true },

  dominantEmotion: { type: String, default: '' },
  advice:        { type: String, required: true },     // shown to teacher
  hodNote:       { type: String, required: true },     // longer, for HOD
  severity:      { type: String, enum: ['info','warning','critical'], default: 'info' },

  // distraction context — text-only reasons (no emojis), per spec
  distractedPct:    { type: Number, default: 0 },
  distractionReasons: { type: [String], default: [] },

  acknowledged:  { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Recommendation', recommendationSchema);
