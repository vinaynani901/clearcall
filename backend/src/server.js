require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

require('./db'); // initialises schema on boot

const authRoutes = require('./routes/auth');
const abnRoutes = require('./routes/abn');
const companyRoutes = require('./routes/company');
const workProfileRoutes = require('./routes/workProfiles');
const callRoutes = require('./routes/calls');
const reportRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'ClearCall API', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/abn', abnRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/work-profiles', workProfileRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);

// Serve built frontend in production
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`ClearCall API listening on port ${PORT}`);
});

module.exports = app;
