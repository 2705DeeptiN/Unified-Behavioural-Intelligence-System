const mongoose = require('mongoose');

/**
 * Subjects now record:
 *   • code     — official subject code (e.g. "CS62")
 *   • name     — full subject name
 *   • category — Theory | Tutorial | Lab
 *   • section  — class section the teacher handles for this subject
 *
 * section is no longer hardcoded because the Admin can now create new
 * sections through the Admin Dashboard. Validation happens at the route
 * level against the active sections in the Class collection.
 */
const subjectSchema = new mongoose.Schema({
  code:     { type: String, required: true },
  name:     { type: String, required: true },
  category: { type: String, enum: ['Theory', 'Tutorial', 'Lab'], required: true },
  section:  { type: String, required: true },
});

const userSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  email:       { type: String, required: true, unique: true },
  password:    { type: String, required: true },
  department:  { type: String, default: '' },        // optional for admin
  role:        { type: String, enum: ['teacher', 'hod', 'admin'], required: true },

  // Faculty code links the user to the timetable. REQUIRED for teachers and
  // for HODs (since the HOD also teaches some classes). Optional for admin.
  facultyCode: { type: String, default: null },

  subjects:    { type: [subjectSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
