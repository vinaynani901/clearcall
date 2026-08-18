import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner, InfoBox } from '../components/Shared';
import AuthShell from '../components/AuthShell';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const PERSONAL_DOMAINS = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'live.com', 'yahoo.com.au'];

export default function EmployerLogin() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const domain = email.includes('@') ? email.split('@')[1].toLowerCase() : '';
  const isPersonal = useMemo(() => PERSONAL_DOMAINS.includes(domain), [domain]);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (isPersonal) {
      setError('Only company work emails are accepted for employer login.');
      return;
    }
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      await loginWithToken(data.token, data.user, data.company);
      navigate('/employer/dashboard');
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
        <TopHeader title="Employer Login" />
        <ErrorBanner message={error} />
        <InfoBox>
          Only company work emails are accepted. Your work email verifies your employment every time you log in.
        </InfoBox>
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Work email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="alex@yourcompany.com.au" />
            {isPersonal && <div className="error-text">Personal emails like {domain} are not accepted for employer accounts.</div>}
          </div>
          <div className="field">
            <label>Password</label>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div style={{ textAlign: 'right', marginTop: -8 }}>
            <button type="button" className="link small">Forgot Password?</button>
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
        </form>
        <div className="center" style={{ marginTop: 20 }}>
          <span className="small muted">New company? </span>
          <button className="link small" onClick={() => navigate('/signup/employer')}>Register</button>
        </div>
        <div className="center" style={{ marginTop: 8 }}>
          <span className="small muted">Signing in as a job seeker? </span>
          <button className="link small" onClick={() => navigate('/login/jobseeker')}>Job Seeker Login</button>
        </div>
      </div>
    </AuthShell>
  );
}
