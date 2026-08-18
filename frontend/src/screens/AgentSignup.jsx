import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner, InfoBox } from '../components/Shared';
import AuthShell from '../components/AuthShell';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AgentSignup() {
  const navigate = useNavigate();
  const { loginWithToken, setAgent } = useAuth();
  const [form, setForm] = useState({
    agencyName: '', fullName: '', email: '', phone: '', abn: '', password: '', confirm: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
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
      const data = await api.signupAgent({
        agencyName: form.agencyName,
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        abn: form.abn ? form.abn.replace(/\s/g, '') : undefined,
        password: form.password,
      });
      await loginWithToken(data.token, data.user, null, data.agent);
      setAgent(data.agent);
      navigate('/agent/dashboard');
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
        <TopHeader title="Recruitment Agency Sign Up" />
        <ErrorBanner message={error} />
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Agency name</label>
            <input required value={form.agencyName} onChange={update('agencyName')} placeholder="Talent Partners Recruitment" />
          </div>
          <div className="field">
            <label>Your full name</label>
            <input required value={form.fullName} onChange={update('fullName')} placeholder="Jordan Recruiter" />
          </div>
          <div className="field">
            <label>Email address</label>
            <input required type="email" value={form.email} onChange={update('email')} placeholder="jordan@youragency.com.au" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input required value={form.phone} onChange={update('phone')} placeholder="04XX XXX XXX" />
          </div>
          <div className="field">
            <label>ABN (optional)</label>
            <input value={form.abn} onChange={update('abn')} placeholder="11 digit ABN" maxLength={14} />
            <div className="hint-text">Adding your ABN now speeds up verification later.</div>
          </div>
          <div className="field">
            <label>Password</label>
            <input required type="password" value={form.password} onChange={update('password')} placeholder="At least 8 characters" />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input required type="password" value={form.confirm} onChange={update('confirm')} />
          </div>

          <InfoBox>Agency accounts are reviewed by ClearCall before they're marked as verified.</InfoBox>

          <button className="btn btn-primary" disabled={loading}>{loading ? 'Registering...' : 'Register Agency'}</button>
        </form>
        <div className="center" style={{ marginTop: 20 }}>
          <span className="small muted">Already have an account? </span>
          <button className="link small" onClick={() => navigate('/login/agent')}>Log In</button>
        </div>
      </div>
    </AuthShell>
  );
}
