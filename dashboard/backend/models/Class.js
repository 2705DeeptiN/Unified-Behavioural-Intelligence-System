const mongoose = require('mongoose');

/**
 * A Class entry represents one section within a department/semester.
 * Admin creates these through the Admin Dashboard. Each class has a code
 * (e.g. "6A", "7B"), a semester, a department, and a room.
 */
const classSchema = new mongoose.Schema({
  section:    { type: String, required: true, unique: true },   // "6A", "6B", etc.
  semester:   { type: String, default: 'VI' },
  department: { type: String, default: 'Computer Science & Engineering' },
  room:       { type: String, default: '' },                    // LHC-206 etc.
}, { timestamps: true });

module.exports = mongoose.model('Class', classSchema);
