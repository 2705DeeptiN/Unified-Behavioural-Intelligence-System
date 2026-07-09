const mongoose = require('mongoose');

/**
 * A single timetable cell — one section, one day, one slot.
 *
 *   section       : "6A" / "6B" / etc.
 *   day           : MONDAY .. SATURDAY  (enum)
 *   slotIdx       : 0-based slot index within the day (0..6 for 7 daily slots)
 *   subjectShort  : "DL", "BDA", "CC&BD", "PTS LAB", etc.
 *   subjectCode   : optional formal code, e.g. "CSE631"
 *   subjectName   : human-readable name, e.g. "Deep Learning"
 *   category      : Theory / Tutorial / Lab
 *   facultyCodes  : array of one or more faculty short codes assigned to
 *                   this slot (labs often have several faculty rotating)
 *
 * Slot times are derived globally from the slotIdx — see SLOTS in
 * data/timetable.js. The Admin only fills the subject + faculty for each
 * (section, day, slotIdx) cell.
 */
const timetableEntrySchema = new mongoose.Schema({
  section:       { type: String, required: true, index: true },
  day:           { type: String, required: true,
                   enum: ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'] },
  slotIdx:       { type: Number, required: true, min: 0, max: 6 },

  subjectShort:  { type: String, required: true },
  subjectCode:   { type: String, default: '' },
  subjectName:   { type: String, default: '' },
  category:      { type: String, enum: ['Theory', 'Tutorial', 'Lab'], required: true },

  facultyCodes:  { type: [String], default: [] },   // ["SM"] or ["US","SK","SM","DPK"]
}, { timestamps: true });

// One subject can occupy only one slot per section / day / time
timetableEntrySchema.index({ section: 1, day: 1, slotIdx: 1 }, { unique: true });

module.exports = mongoose.model('TimetableEntry', timetableEntrySchema);
