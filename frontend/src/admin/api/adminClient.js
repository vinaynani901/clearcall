// Completely separate API client from ../../api/client.js — different
// base path, different token storage key, never shares a token with the
// regular employer/job seeker session.
const BASE = '/api/admin';
const TOKEN_KEY = 'clearcall_admin_token';

export function getAdminToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    const error = new Error(data.error || 'Something went wrong. Please try again.');
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export const adminApi = {
  login: (email, password) => request('/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => request('/me'),
  logout: () => request('/logout', { method: 'POST' }),

  commandCentre: () => request('/command-centre'),
  commandCentreActivity: (limit) => request(`/command-centre/activity${limit ? `?limit=${limit}` : ''}`),
  scamHotspots: () => request('/command-centre/scam-hotspots'),
  revenue: () => request('/revenue'),
  listInvoices: (month) => request(`/revenue/invoices${month ? `?month=${month}` : ''}`),
  generateInvoices: (month) => request('/revenue/invoices/generate', { method: 'POST', body: { month } }),

  listCompanies: () => request('/companies'),
  getCompany: (id) => request(`/companies/${id}`),
  getCompanyCalls: (id) => request(`/companies/${id}/calls`),
  getCompanyReports: (id) => request(`/companies/${id}/reports`),
  approveCompany: (id) => request(`/companies/${id}/approve`, { method: 'PUT' }),
  changeCompanyPlan: (id, plan) => request(`/companies/${id}/plan`, { method: 'PUT', body: { plan } }),
  suspendCompany: (id) => request(`/companies/${id}/suspend`, { method: 'PUT' }),
  unsuspendCompany: (id) => request(`/companies/${id}/unsuspend`, { method: 'PUT' }),
  messageCompany: (id, payload) => request(`/companies/${id}/message`, { method: 'POST', body: payload }),
  deleteCompany: (id) => request(`/companies/${id}`, { method: 'DELETE' }),
  listPilots: () => request('/companies/pilots'),
  startPilot: (id, payload) => request(`/companies/${id}/pilot/start`, { method: 'PUT', body: payload }),
  getPilotReport: (id) => request(`/companies/${id}/pilot-report`),

  listJobseekers: () => request('/jobseekers'),
  getJobseeker: (id) => request(`/jobseekers/${id}`),
  getJobseekerCalls: (id) => request(`/jobseekers/${id}/calls`),
  messageJobseeker: (id, payload) => request(`/jobseekers/${id}/message`, { method: 'POST', body: payload }),
  changeJobseekerPlan: (id, plan) => request(`/jobseekers/${id}/plan`, { method: 'PUT', body: { plan } }),
  suspendJobseeker: (id) => request(`/jobseekers/${id}/suspend`, { method: 'PUT' }),
  unsuspendJobseeker: (id) => request(`/jobseekers/${id}/unsuspend`, { method: 'PUT' }),
  deleteJobseeker: (id) => request(`/jobseekers/${id}`, { method: 'DELETE' }),

  getVerificationQueue: () => request('/verification-queue'),
  getVerificationQueueCount: () => request('/verification-queue/count'),
  approveVerification: (id) => request(`/verification-queue/${id}/approve`, { method: 'PUT' }),
  rejectVerification: (id, reason) => request(`/verification-queue/${id}/reject`, { method: 'PUT', body: { reason } }),
  holdVerification: (id, note) => request(`/verification-queue/${id}/hold`, { method: 'PUT', body: { note } }),

  listAgents: () => request('/agents'),
  getAgent: (id) => request(`/agents/${id}`),
  approveAgent: (id) => request(`/agents/${id}/approve`, { method: 'PUT' }),
  suspendAgent: (id) => request(`/agents/${id}/suspend`, { method: 'PUT' }),
  unsuspendAgent: (id) => request(`/agents/${id}/unsuspend`, { method: 'PUT' }),
  messageAgent: (id, payload) => request(`/agents/${id}/message`, { method: 'POST', body: payload }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: 'DELETE' }),

  listScamReports: () => request('/scam-reports'),
  getScamReportCounts: () => request('/scam-reports/counts'),
  investigateReport: (id) => request(`/scam-reports/${id}/investigate`, { method: 'PUT' }),
  suspendReportedCompany: (id) => request(`/scam-reports/${id}/suspend-company`, { method: 'PUT' }),
  clearReport: (id) => request(`/scam-reports/${id}/clear`, { method: 'PUT' }),
  resolveReport: (id, adminNote) => request(`/scam-reports/${id}/resolve`, { method: 'PUT', body: { adminNote } }),
  getScamwatchPrefill: (id) => request(`/scam-reports/${id}/scamwatch`),

  listSupportTickets: () => request('/support-tickets'),
  getSupportTicketCounts: () => request('/support-tickets/counts'),
  getSupportTicket: (id) => request(`/support-tickets/${id}`),
  replySupportTicket: (id, message) => request(`/support-tickets/${id}/reply`, { method: 'POST', body: { message } }),
  setSupportTicketStatus: (id, status) => request(`/support-tickets/${id}/status`, { method: 'PUT', body: { status } }),
  setSupportTicketPriority: (id, priority) => request(`/support-tickets/${id}/priority`, { method: 'PUT', body: { priority } }),

  listAnnouncements: () => request('/announcements'),
  createAnnouncement: (payload) => request('/announcements', { method: 'POST', body: payload }),
  updateAnnouncement: (id, payload) => request(`/announcements/${id}`, { method: 'PUT', body: payload }),
  toggleAnnouncement: (id) => request(`/announcements/${id}/toggle`, { method: 'PUT' }),
  deleteAnnouncement: (id) => request(`/announcements/${id}`, { method: 'DELETE' }),

  getSystemHealth: () => request('/system-health'),

  // Maintenance mode
  getMaintenanceStatus: () => request('/maintenance/status'),
  setMaintenance: (enabled, message, estimatedEndTime) => request('/maintenance/enable', { method: 'POST', body: { enabled, message, estimatedEndTime } }),

  getAiAssistantStatus: () => request('/ai-assistant/status'),
  sendAiAssistantMessage: (messages) => request('/ai-assistant/chat', { method: 'POST', body: { messages } }),

  // Plan Control portal
  getPlanLimits: () => request('/plan-control/limits'),
  savePlanLimits: (planKey, changes) => request(`/plan-control/limits/${planKey}`, { method: 'PUT', body: { changes } }),
  bulkPlanAction: (companyIds, action, months) => request('/plan-control/bulk', { method: 'POST', body: { companyIds, action, months } }),
  listPlanControlPilots: (status) => request(`/plan-control/pilots${status ? `?status=${status}` : ''}`),
  startPlanControlPilot: (payload) => request('/plan-control/pilots', { method: 'POST', body: payload }),
  extendPilot: (id, weeks) => request(`/plan-control/pilots/${id}/extend`, { method: 'PUT', body: { weeks } }),
  endPilot: (id) => request(`/plan-control/pilots/${id}/end`, { method: 'PUT' }),
  convertPilot: (id, plan) => request(`/plan-control/pilots/${id}/convert`, { method: 'PUT', body: { plan } }),
  getPlanChangeLog: (limit) => request(`/plan-control/change-log${limit ? `?limit=${limit}` : ''}`),
  getPlanControlSummary: () => request('/plan-control/summary'),
  getCompanyFeatureOverrides: (id) => request(`/companies/${id}/feature-overrides`),
  setCompanyFeatureOverride: (id, featureName, value) => request(`/companies/${id}/feature-overrides`, { method: 'PUT', body: { featureName, value } }),
  clearCompanyFeatureOverride: (id, featureName) => request(`/companies/${id}/feature-overrides/${featureName}`, { method: 'DELETE' }),

  // Auto Apply engine (Part 8) + AI Configuration (Part 10)
  getAutoApplyStats: () => request('/auto-apply/stats'),
  getAutoApplySettings: () => request('/auto-apply/settings'),
  saveAutoApplySettings: (payload) => request('/auto-apply/settings', { method: 'PUT', body: payload }),
  runAutoApplyNow: () => request('/auto-apply/run-now', { method: 'POST' }),
  getAutoApplyLog: (limit) => request(`/auto-apply/log${limit ? `?limit=${limit}` : ''}`),
  getAutoApplyJobseekerHistory: (userId) => request(`/auto-apply/jobseeker/${userId}`),
  getAiConfig: () => request('/auto-apply/ai-config'),
  setAiProvider: (provider) => request('/auto-apply/ai-config/provider', { method: 'PUT', body: { provider } }),
  testAiProvider: (provider) => request(`/auto-apply/ai-config/test/${provider}`, { method: 'POST' }),
};
