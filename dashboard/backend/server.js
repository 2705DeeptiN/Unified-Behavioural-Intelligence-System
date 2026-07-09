require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const authRoutes        = require('./routes/auth');
const subjectRoutes     = require('./routes/subjects');
const timetableRoutes   = require('./routes/timetable');
const sessionRoutes     = require('./routes/sessions');
const adminRoutes       = require('./routes/admin');
const recommendRoutes   = require('./routes/recommendations');

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.log(err));

app.use('/api/auth',            authRoutes);
app.use('/api/subjects',        subjectRoutes);
app.use('/api/timetable',       timetableRoutes);
app.use('/api/sessions',        sessionRoutes);
app.use('/api/admin',           adminRoutes);
app.use('/api/recommendations', recommendRoutes);

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
