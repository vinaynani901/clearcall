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
const campaignRoutes = require('./routes/campaigns');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');
const supportRoutes = require('./routes/support');
const announcementRoutes = require('./routes/announcements');
const pushRoutes = require('./routes/push');
const applicationRoutes = require('./routes/applications');
const jobRoutes = require('./routes/jobs');
const jobseekerRoutes = require('./routes/jobseeker');
const gmailAuthRoutes = require('./routes/gmailAuth');
const resumeRoutes = require('./routes/resumes');
const accessKeyRoutes = require('./routes/accessKeys');
const messageRoutes = require('./routes/messages');
const planRoutes = require('./routes/plans');
const teamRoutes = require('./routes/team');
const recruiterInviteRoutes = require('./routes/recruiterInvite');
const pipelineRoutes = require('./routes/pipeline');
const billingRoutes = require('./routes/billing');
const { startCallbackReminderScheduler } = require('./services/callbackReminders');
const { startPilotScheduler } = require('./services/pilotScheduler');
const { startBillingScheduler } = require('./services/billingScheduler');
const { startAutoApplyScheduler } = require('./services/autoApplyEngine');
const { startAutoApplyDailyTasksScheduler } = require('./services/autoApplyDailyTasks');
const autoApplyRoutes = require('./routes/autoApply');

const app = express();
const PORT = process.env.PORT || 3000;

// Railway terminates HTTPS and forwards over HTTP internally. Without this,
// req.protocol always reports "http", which breaks Twilio webhook signature
// verification (the signature is computed against the real https:// URL).
app.set('trust proxy', 1);

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
app.use('/api/campaigns', campaignRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/jobseeker', jobseekerRoutes);
app.use('/api/gmail', gmailAuthRoutes);
app.use('/api/resumes', resumeRoutes);
app.use('/api/access-keys', accessKeyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/recruiter-invite', recruiterInviteRoutes); // public — no authMiddleware, see routes/recruiterInvite.js
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/auto-apply', autoApplyRoutes);

// Serve built frontend in production
const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Central error handler — last-resort safety net for anything a route
// didn't catch itself. Routes that deliberately throw a controlled,
// user-facing error attach `.status` (e.g. 400/404/422) and their message is
// already written to be friendly, so that passes through as-is. Anything
// WITHOUT a `.status` is an unexpected bug (a real stack-trace-style JS
// error) — those never get shown to the user verbatim; the real error is
// still logged server-side for debugging, but the response is always the
// same friendly, human-readable message. No raw error text ever reaches
// the frontend.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  const message = err.status ? (err.message || 'Something went wrong. Please try again.') : 'Something went wrong on our end. Please try again in a moment.';
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  console.log(`ClearCall API listening on port ${PORT}`);
  startCallbackReminderScheduler();
  startPilotScheduler();
  startBillingScheduler();
  startAutoApplyScheduler();
  startAutoApplyDailyTasksScheduler();
});

module.exports = app;
