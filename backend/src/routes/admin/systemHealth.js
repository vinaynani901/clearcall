const express = require('express');
const db = require('../../db');

const router = express.Router();

function serviceConfigured(...envVars) {
  return envVars.every((v) => v && !v.startsWith('your-'));
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(' ');
}

// GET /api/admin/system-health — real, non-fabricated status: service
// configuration checks (same source of truth as Command Centre), live DB
// row counts, and process-level uptime/memory. There's no external logging
// or monitoring service wired up, so this deliberately doesn't invent
// metrics (error rates, latency percentiles, etc.) it can't actually measure.
router.get('/', (req, res) => {
  const services = [
    { name: 'Railway Server', status: 'operational', detail: `Node ${process.version}` },
    { name: 'Database (SQLite)', status: 'operational', detail: process.env.DATABASE_PATH || './clearcall.db' },
    { name: 'Twilio (Voice Calling)', status: serviceConfigured(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) ? 'operational' : 'down', detail: serviceConfigured(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN) ? 'Credentials configured' : 'Missing credentials' },
    { name: 'Resend (Email)', status: serviceConfigured(process.env.RESEND_API_KEY) ? 'operational' : 'down', detail: serviceConfigured(process.env.RESEND_API_KEY) ? 'API key configured' : 'Missing API key' },
    { name: 'ABN Lookup API', status: serviceConfigured(process.env.ABN_API_GUID) ? 'operational' : 'down', detail: serviceConfigured(process.env.ABN_API_GUID) ? 'GUID configured' : 'Missing GUID' },
  ];

  const tableCounts = {};
  const tables = ['users', 'companies', 'agents', 'calls', 'campaigns', 'campaign_candidates', 'reports', 'support_tickets', 'announcements'];
  for (const t of tables) {
    try {
      tableCounts[t] = db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get().n;
    } catch {
      tableCounts[t] = null; // table doesn't exist on this DB version — skip rather than fake a number
    }
  }

  const mem = process.memoryUsage();

  res.json({
    generatedAt: new Date().toISOString(),
    services,
    allOperational: services.every((s) => s.status === 'operational'),
    process: {
      uptimeSeconds: process.uptime(),
      uptimeLabel: formatUptime(process.uptime()),
      nodeVersion: process.version,
      memoryUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      memoryTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    tableCounts,
  });
});

module.exports = router;
