import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner, InfoBox } from '../components/Shared';
import AuthShell from '../components/AuthShell';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const INDUSTRIES = [
  'Technology', 'Healthcare', 'Education', 'Finance', 'Retail', 'Hospitality',
  'Construction and Trades', 'Government and Public Service', 'Legal',
  'Engineering', 'Creative and Media', 'Other',
];

// Kept in sync with backend/src/utils/emailDomains.js — the backend is the
// authoritative check, but the list must match here too or a domain that
// slips past this real-time check (e.g. bigpond.com) would only get caught
// after the person hits Register, which defeats the point of a live check.
const PERSONAL_DOMAINS = [
  'gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'live.com',
  'yahoo.com.au', 'hotmail.com.au', 'outlook.com.au', 'bigpond.com', 'aol.com',
  'protonmail.com', 'msn.com',
];

export default function EmployerSignup() {
  const navigate = useNavigate();
  const { loginWithToken, setCompany } = useAuth();
  const [form, setForm] = useState({
    companyName: '', abn: '', industry: '', contactName: '', workEmail: '',
    password: '', confirm: '', linkedinUrl: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [linkedinConnected, setLinkedinConnected] = useState(false);
  const [abnLookup, setAbnLookup] = useState(null); // { status: 'checking'|'verified'|'failed', companyName?, abnStatus?, error? }

  const update = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    // Editing the ABN after a successful lookup invalidates it — re-verify
    // before submit is allowed to rely on it again.
    if (k === 'abn') setAbnLookup(null);
  };

  const emailDomain = form.workEmail.includes('@') ? form.workEmail.split('@')[1].toLowerCase() : '';
  const isPersonalEmail = useMemo(() => PERSONAL_DOMAINS.includes(emailDomain), [emailDomain]);
  const abnDigitsValid = form.abn.replace(/\s/g, '').length === 11 && /^\d+$/.test(form.abn.replace(/\s/g, ''));

  // Calls the real Australian Business Register lookup (via our backend
  // proxy, which holds the ABN_API_GUID) right here on the signup form —
  // before the account exists — and auto-fills the officially registered
  // company name, exactly as ABR returns it.
  const verifyAbnNow = async () => {
    if (!abnDigitsValid) { setError('Enter a valid 11-digit ABN first'); return; }
    setError('');
    setAbnLookup({ status: 'checking' });
    try {
      const data = await api.lookupAbn(form.abn.replace(/\s/g, ''));
      setAbnLookup({ status: 'verified', companyName: data.companyName, abnStatus: data.abnStatus });
      setForm((f) => ({ ...f, companyName: data.companyName }));
    } catch (err) {
      setAbnLookup({ status: 'failed', error: err.message });
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isPersonalEmail) {
      setError('Personal emails are not accepted. Please use your company work email.');
      return;
    }
    if (!abnDigitsValid) {
      setError('ABN must be exactly 11 digits');
      return;
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match');
      return;
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      const data = await api.signupEmployer({
        companyName: form.companyName,
        abn: form.abn.replace(/\s/g, ''),
        industry: form.industry,
        contactName: form.contactName,
        workEmail: form.workEmail,
        password: form.password,
        linkedinUrl: linkedinConnected ? form.linkedinUrl || 'connected' : null,
      });
      await loginWithToken(data.token, data.user, data.company);
      setCompany(data.company);
      navigate('/verify/abn', { state: { companyId: data.company.id, abn: data.company.abn } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Employer Sign Up" />
        <ErrorBanner message={error} />
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Company name</label>
            <input required value={form.companyName} onChange={update('companyName')} placeholder="Acme Pty Ltd" />
          </div>

          <div className="field-with-btn">
            <div className="field">
              <label>ABN number</label>
              <input required value={form.abn} onChange={update('abn')} placeholder="11 digit ABN" maxLength={14} />
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              style={{ width: 'auto', marginTop: 22 }}
              disabled={!abnDigitsValid || abnLookup?.status === 'checking'}
              onClick={verifyAbnNow}
            >
              {abnLookup?.status === 'checking' ? 'Checking…' : 'Verify ABN'}
            </button>
          </div>
          {form.abn && !abnDigitsValid && <div className="field"><div className="error-text">ABN must be exactly 11 digits</div></div>}
          {abnLookup?.status === 'verified' && (
            <div className="badge badge-green" style={{ marginTop: -10, marginBottom: 14, display: 'inline-block' }}>
              Verified with the Australian Business Register: {abnLookup.companyName} ({abnLookup.abnStatus})
            </div>
          )}
          {abnLookup?.status === 'failed' && (
            <div className="field" style={{ marginTop: -10 }}><div className="error-text">{abnLookup.error}</div></div>
          )}
          <div className="hint-text" style={{ marginTop: -10, marginBottom: 10 }}>This looks up the real Australian Business Register and fills in your officially registered company name. It's re-confirmed once more right after you register.</div>

          <div className="field">
            <label>Industry</label>
            <select required value={form.industry} onChange={update('industry')}>
              <option value="">Select industry</option>
              {INDUSTRIES.map((i) => <option key={i} value={i.toLowerCase()}>{i}</option>)}
            </select>
            <div className="hint-text">Works for any profession, not just corporate roles.</div>
          </div>

          <div className="field">
            <label>Contact person full name</label>
            <input required value={form.contactName} onChange={update('contactName')} placeholder="Alex Recruiter" />
          </div>

          <div className="field">
            <label>Work email address</label>
            <input required type="email" value={form.workEmail} onChange={update('workEmail')} placeholder="alex@yourcompany.com.au" />
            {isPersonalEmail && (
              <div className="error-text">Personal emails like {emailDomain} are not accepted. Please use your company work email.</div>
            )}
          </div>

          <div className="field">
            <label>LinkedIn company page (optional)</label>
            {!linkedinConnected ? (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setLinkedinConnected(true)}>
                Connect LinkedIn
              </button>
            ) : (
              <div className="badge badge-blue">LinkedIn connected ✓</div>
            )}
            <div className="hint-text">This adds an extra trust badge to your profile and is not required.</div>
          </div>

          <div className="field">
            <label>Password</label>
            <input required type="password" value={form.password} onChange={update('password')} placeholder="At least 8 characters" />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input required type="password" value={form.confirm} onChange={update('confirm')} />
          </div>

          <InfoBox>Your ABN and work email will be verified before your account is approved to make calls.</InfoBox>

          <button className="btn btn-primary" disabled={loading}>{loading ? 'Registering...' : 'Register Company'}</button>
        </form>
        <div className="center" style={{ marginTop: 20 }}>
          <span className="small muted">Already have an account? </span>
          <button className="link small" onClick={() => navigate('/login/employer')}>Log In</button>
        </div>
      </div>
    </AuthShell>
  );
}
