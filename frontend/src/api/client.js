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

export const api = {
  // auth
  signupJobseeker: (payload) => request('/auth/signup/jobseeker', { method: 'POST', body: payload, auth: false }),
  signupEmployer: (payload) => request('/auth/signup/employer', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  changePassword: (payload) => request('/auth/change-password', { method: 'POST', body: payload }),
  me: () => request('/auth/me'),
  sendOtp: (email) => request('/auth/send-otp', { method: 'POST', body: { email }, auth: false }),
  verifyOtp: (email, code) => request('/auth/verify-otp', { method: 'POST', body: { email, code }, auth: false }),

  // abn
  verifyAbn: (payload) => request('/abn/verify', { method: 'POST', body: payload }),

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
  callHistory: (filter) => request(`/calls/history${filter && filter !== 'all' ? `?filter=${filter}` : ''}`),

  // reports
  submitReport: (payload) => request('/reports', { method: 'POST', body: payload }),

  // settings
  getCallDisplaySettings: () => request('/settings/call-display'),
  updateCallDisplaySettings: (payload) => request('/settings/call-display', { method: 'PUT', body: payload }),
};
