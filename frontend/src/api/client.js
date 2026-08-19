const BASE = '/api';

function getToken() {
  return localStorage.getItem('clearcall_token');
}

export function setToken(token) {
  if (token) localStorage.setItem('clearcall_token', token);
  else localStorage.removeItem('clearcall_token');
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch() itself only rejects for a genuine network failure (offline,
    // DNS, server unreachable, CORS) — every HTTP-level error (4xx/5xx)
    // resolves normally and is handled below instead. Normalize this into
    // the same friendly-message Error shape every screen already expects,
    // so a dropped connection shows "You appear to be offline..." instead
    // of a raw "Failed to fetch" or a blank screen.
    const error = new Error('You appear to be offline, or the server could not be reached. Please check your connection and try again.');
    error.status = 0;
    error.network = true;
    throw error;
  }

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

export const api = {
  // auth
  signupJobseeker: (payload) => request('/auth/signup/jobseeker', { method: 'POST', body: payload, auth: false }),
  signupJobseekerGoogle: (payload) => request('/auth/signup/jobseeker/google', { method: 'POST', body: payload, auth: false }),
  signupEmployer: (payload) => request('/auth/signup/employer', { method: 'POST', body: payload, auth: false }),
  signupAgent: (payload) => request('/auth/signup/agent', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),
  deleteAccount: (password) => request('/auth/delete-account', { method: 'POST', body: { password } }),
  me: () => request('/auth/me'),
  sendOtp: (email, purpose) => request('/auth/send-otp', { method: 'POST', body: { email, purpose }, auth: false }),
  verifyOtp: (email, code, purpose) => request('/auth/verify-otp', { method: 'POST', body: { email, code, purpose }, auth: false }),

  // abn
  verifyAbn: (payload) => request('/abn/verify', { method: 'POST', body: payload }),
  lookupAbn: (abn) => request('/abn/lookup', { method: 'POST', body: { abn }, auth: false }),

  // company
  getCompanyProfile: () => request('/company/profile'),
  updateCompanyProfile: (payload) => request('/company/profile', { method: 'PUT', body: payload }),
  getCompany: (id) => request(`/company/${id}`),

  // work profiles
  listWorkProfiles: () => request('/work-profiles'),
  createWorkProfile: (payload) => request('/work-profiles', { method: 'POST', body: payload }),
  activateWorkProfile: (id) => request(`/work-profiles/${id}/activate`, { method: 'PUT' }),

  // calls
  initiateCall: (payload) => request('/calls/initiate', { method: 'POST', body: payload }),
  updateCallStatus: (id, payload) => request(`/calls/${id}/status`, { method: 'PUT', body: payload }),
  updateCallOutcome: (id, payload) => request(`/calls/${id}/outcome`, { method: 'PUT', body: payload }),
  callHistory: (filter) => request(`/calls/history${filter && filter !== 'all' ? `?filter=${filter}` : ''}`),
  getVoiceToken: () => request('/calls/voice-token'),

  // reports
  submitReport: (payload) => request('/reports', { method: 'POST', body: payload }),

  // support tickets
  createTicket: (payload) => request('/support/tickets', { method: 'POST', body: payload }),
  listTickets: () => request('/support/tickets'),
  getTicket: (id) => request(`/support/tickets/${id}`),
  replyTicket: (id, message) => request(`/support/tickets/${id}/reply`, { method: 'POST', body: { message } }),

  // announcements
  getActiveAnnouncements: () => request('/announcements/active'),

  // push notifications
  getVapidPublicKey: () => request('/push/vapid-public-key', { auth: false }),
  subscribePush: (subscription) => request('/push/subscribe', { method: 'POST', body: subscription }),
  unsubscribePush: (endpoint) => request('/push/unsubscribe', { method: 'POST', body: { endpoint } }),

  // settings
  getCallDisplaySettings: () => request('/settings/call-display'),
  updateCallDisplaySettings: (payload) => request('/settings/call-display', { method: 'PUT', body: payload }),

  // campaigns
  getDefaultTags: () => request('/campaigns/default-tags'),
  getStarterTagSets: () => request('/campaigns/starter-tag-sets'),
  listTagTemplates: () => request('/campaigns/tag-templates'),
  createTagTemplate: (payload) => request('/campaigns/tag-templates', { method: 'POST', body: payload }),
  updateTagTemplate: (id, payload) => request(`/campaigns/tag-templates/${id}`, { method: 'PUT', body: payload }),
  deleteTagTemplate: (id) => request(`/campaigns/tag-templates/${id}`, { method: 'DELETE' }),
  listCampaigns: () => request('/campaigns'),
  getCampaign: (id) => request(`/campaigns/${id}`),
  createCampaign: (payload) => request('/campaigns', { method: 'POST', body: payload }),
  renameCampaign: (id, name) => request(`/campaigns/${id}`, { method: 'PUT', body: { name } }),
  deleteCampaign: (id) => request(`/campaigns/${id}`, { method: 'DELETE' }),
  updateCampaignCandidate: (campaignId, candidateId, payload) =>
    request(`/campaigns/${campaignId}/candidates/${candidateId}`, { method: 'PUT', body: payload }),
  skipCandidate: (campaignId, candidateId) =>
    request(`/campaigns/${campaignId}/candidates/${candidateId}/skip`, { method: 'PUT' }),
  removeCandidate: (campaignId, candidateId) =>
    request(`/campaigns/${campaignId}/candidates/${candidateId}`, { method: 'DELETE' }),
  getCallbacksDue: () => request('/campaigns/callbacks/due'),
  sendCandidateSms: (campaignId, candidateId) => request(`/campaigns/${campaignId}/candidates/${candidateId}/sms`, { method: 'POST' }),
  getEmployerDashboard: () => request('/dashboard/employer'),
  downloadCampaignResults: (id) => downloadFile(`/campaigns/${id}/results.xlsx`, 'ClearCall Results.xlsx'),
  downloadCampaignCallbacks: (id) => downloadFile(`/campaigns/${id}/callbacks.xlsx`, 'ClearCall Callbacks Due.xlsx'),

  // job seeker calls
  receivedCalls: () => request('/calls/received'),

  // job applications
  listApplications: (params) => request(`/applications${qs(params)}`),
  getApplication: (id) => request(`/applications/${id}`),
  updateApplication: (id, payload) => request(`/applications/${id}`, { method: 'PUT', body: payload }),
  deleteApplication: (id) => request(`/applications/${id}`, { method: 'DELETE' }),

  // jobs
  searchJobs: (params) => request(`/jobs${qs(params)}`),
  listIndustries: () => request('/jobs/meta/industries'),
  getJob: (id) => request(`/jobs/${id}`),
  applyToJob: (id) => request(`/jobs/${id}/apply`, { method: 'POST' }),
  applyToExternalJob: (payload) => request('/jobs/apply-external', { method: 'POST', body: payload }),
  listBookmarks: () => request('/jobs/me/bookmarks'),
  addBookmark: (payload) => request('/jobs/me/bookmarks', { method: 'POST', body: payload }),
  removeBookmark: (id) => request(`/jobs/me/bookmarks/${id}`, { method: 'DELETE' }),

  // job seeker profile / dashboard / settings
  getJobseekerDashboard: () => request('/jobseeker/dashboard'),
  getJobseekerActivity: (params) => request(`/jobseeker/activity${qs(params)}`),
  getNotifications: (limit) => request(`/jobseeker/notifications${qs({ limit })}`),
  markNotificationRead: (id) => request(`/jobseeker/notifications/${id}/read`, { method: 'PUT' }),
  markAllNotificationsRead: () => request('/jobseeker/notifications/read-all', { method: 'PUT' }),
  getJobseekerProfile: () => request('/jobseeker/profile'),
  updateJobseekerProfile: (payload) => request('/jobseeker/profile', { method: 'PUT', body: payload }),
  getNotificationSettings: () => request('/jobseeker/notification-settings'),
  updateNotificationSettings: (payload) => request('/jobseeker/notification-settings', { method: 'PUT', body: payload }),
  updatePrivacySettings: (payload) => request('/jobseeker/privacy', { method: 'PUT', body: payload }),
  getGmailStatus: () => request('/jobseeker/gmail/status'),
  authorizeGmail: () => request('/gmail/authorize'),
  syncGmail: () => request('/gmail/sync', { method: 'POST' }),
  disconnectGmail: () => request('/jobseeker/gmail/disconnect', { method: 'POST' }),
  getMessages: () => request('/jobseeker/messages'),
  markMessageRead: (id) => request(`/jobseeker/messages/${id}/read`, { method: 'PUT' }),
  getMyAgent: () => request('/jobseeker/agent'),
  listAvailableAgents: (search) => request(`/jobseeker/agents/available${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  connectAgent: (agentUserId) => request('/jobseeker/agent/connect', { method: 'POST', body: { agentUserId } }),
  disconnectAgent: (agentUserId) => request(`/jobseeker/agent${agentUserId ? `/${agentUserId}` : ''}`, { method: 'DELETE' }),
  getAgentApplications: () => request('/jobseeker/agent/applications'),

  // resume
  uploadResume: (file) => uploadFile('/jobseeker/resume', file),
  deleteResume: () => request('/jobseeker/resume', { method: 'DELETE' }),
  downloadResume: (filename) => downloadFile('/jobseeker/resume', filename || 'resume'),

  // profile photo
  uploadAvatar: (file) => uploadFile('/jobseeker/avatar', file, 'avatar'),
  deleteAvatar: () => request('/jobseeker/avatar', { method: 'DELETE' }),
  getAvatarObjectUrl: () => fetchBlobUrl('/jobseeker/avatar'),

  // resume builder
  listResumes: () => request('/resumes'),
  getResume: (id) => request(`/resumes/${id}`),
  createResume: (payload) => request('/resumes', { method: 'POST', body: payload }),
  updateResume: (id, payload) => request(`/resumes/${id}`, { method: 'PUT', body: payload }),
  deleteResumeBuilt: (id) => request(`/resumes/${id}`, { method: 'DELETE' }),
  setProfileResume: (id) => request(`/resumes/${id}/set-profile`, { method: 'POST' }),
  setProfileResumeUploaded: () => request('/jobseeker/resume/set-profile', { method: 'POST' }),
  downloadResumePdf: (id, name) => downloadFile(`/resumes/${id}/pdf`, `${name || 'resume'}.pdf`),
  downloadResumeDocx: (id, name) => downloadFile(`/resumes/${id}/docx`, `${name || 'resume'}.docx`),

  // placement agent access keys
  listAccessKeys: () => request('/access-keys'),
  createAccessKey: (payload) => request('/access-keys', { method: 'POST', body: payload }),
  revokeAccessKey: (id) => request(`/access-keys/${id}`, { method: 'DELETE' }),

  // agent chat (Messages screen)
  listConversations: () => request('/messages/conversations'),
  getConversation: (userId) => request(`/messages/${userId}`),
  sendChatMessage: (receiverId, content) => request('/messages', { method: 'POST', body: { receiverId, content } }),
  markConversationRead: (userId) => request(`/messages/${userId}/read`, { method: 'PUT' }),

  // billing (Part 9 — monthly billing summaries)
  getMyInvoices: () => request('/billing/invoices'),

  // plans / feature flags
  getEmployerPricing: () => request('/plans/employer'),
  getJobseekerPricing: () => request('/plans/jobseeker'),
  getMyPlan: () => request('/plans/my'),
  selectPlan: (plan) => request('/plans/select', { method: 'POST', body: { plan } }),

  // employer team / member invitations (Part 6/7 — every plan, not just agency recruiters)
  getTeam: () => request('/team'),
  inviteRecruiter: (payload) => request('/team/invite', { method: 'POST', body: payload }),
  resendInvitation: (id) => request(`/team/invitations/${id}/resend`, { method: 'POST' }),
  revokeInvitation: (id) => request(`/team/invitations/${id}`, { method: 'DELETE' }),
  deactivateRecruiter: (memberId) => request(`/team/${memberId}/deactivate`, { method: 'PUT' }),
  reactivateRecruiter: (memberId) => request(`/team/${memberId}/reactivate`, { method: 'PUT' }),
  removeRecruiter: (memberId) => request(`/team/${memberId}`, { method: 'DELETE' }),

  // team invitation acceptance (public, no auth token yet) — used by /invite/accept/:token
  getRecruiterInvite: (token) => request(`/recruiter-invite/${token}`, { auth: false }),
  activateRecruiterInvite: (token, password, fullName) => request(`/recruiter-invite/${token}/activate`, { method: 'POST', body: { password, fullName }, auth: false }),

  // agency pipeline (Plan Control Stage 3)
  getPipelineSummary: () => request('/pipeline/summary'),
  listPipelineRecruiters: () => request('/pipeline/recruiters'),
  getPipelineRecruiterDetail: (userId) => request(`/pipeline/recruiters/${userId}`),

  // connected job seekers (Plan Control Stage 5)
  listConnectedJobSeekers: () => request('/pipeline/connected-job-seekers'),
  getConnectedJobSeekerProfile: (id) => request(`/pipeline/connected-job-seekers/${id}/profile`),
  applyForConnectedJobSeeker: (id, jobId) => request(`/pipeline/connected-job-seekers/${id}/apply`, { method: 'POST', body: { jobId } }),
  applyExternalForConnectedJobSeeker: (id, payload) => request(`/pipeline/connected-job-seekers/${id}/apply-external`, { method: 'POST', body: payload }),

  // employer job postings (Plan Control Stage 6)
  listMyJobPostings: () => request('/jobs/employer/mine'),
  createJobPosting: (payload) => request('/jobs/employer', { method: 'POST', body: payload }),
  updateJobPosting: (id, payload) => request(`/jobs/employer/${id}`, { method: 'PUT', body: payload }),
  closeJobPosting: (id) => request(`/jobs/employer/${id}/close`, { method: 'POST' }),
  deleteJobPosting: (id) => request(`/jobs/employer/${id}`, { method: 'DELETE' }),
  getJobPostingApplications: (id) => request(`/jobs/employer/${id}/applications`),

  // Auto Apply (job seeker — preferences, slots, stats, resume-used lookup)
  getAutoApplyPreferences: () => request('/auto-apply/preferences'),
  saveAutoApplyPreferences: (payload) => request('/auto-apply/preferences', { method: 'PUT', body: payload }),
  getAutoApplyStats: () => request('/auto-apply/stats'),
  getResumeVersion: (id) => request(`/auto-apply/resume-version/${id}`),
};

function qs(params) {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (entries.length === 0) return '';
  return `?${new URLSearchParams(entries).toString()}`;
}

async function uploadFile(path, file, fieldName = 'resume') {
  const token = getToken();
  const formData = new FormData();
  formData.append(fieldName, file);
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) {
    const error = new Error(data.error || 'Upload failed. Please try again.');
    error.status = res.status;
    throw error;
  }
  return data;
}

// Fetches a protected image (e.g. profile photo) with the auth header and
// returns a local blob: URL an <img> tag can use directly — a plain <img src>
// can't carry an Authorization header itself. Returns null if none exists.
async function fetchBlobUrl(path) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return null;
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

async function downloadFile(path, fallbackName) {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = 'Could not download the file.';
    try { msg = (await res.json()).error || msg; } catch { /* non-JSON error body */ }
    throw new Error(msg);
  }
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match ? match[1] : fallbackName;
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
