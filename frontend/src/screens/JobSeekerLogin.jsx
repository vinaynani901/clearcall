import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import AuthShell from '../components/AuthShell';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function JobSeekerLogin() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ email, password });
      await loginWithToken(data.token, data.user, null);
      navigate('/jobseeker/home');
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
        <TopHeader title="Job Seeker Login" />
        <ErrorBanner message={error} />
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@email.com" />
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
          <span className="small muted">New here? </span>
          <button className="link small" onClick={() => navigate('/signup/jobseeker')}>Sign Up</button>
        </div>
        <div className="center" style={{ marginTop: 8 }}>
          <span className="small muted">Signing in as an employer? </span>
          <button className="link small" onClick={() => navigate('/login/employer')}>Employer Login</button>
        </div>
      </div>
    </AuthShell>
  );
}
