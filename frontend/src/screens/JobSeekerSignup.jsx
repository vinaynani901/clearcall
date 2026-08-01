import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function JobSeekerSignup() {
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '', confirm: '' });
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
      const data = await api.signupJobseeker({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
      });
      await loginWithToken(data.token, data.user, null);
      navigate('/jobseeker/home');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Job Seeker Sign Up" />
        <ErrorBanner message={error} />
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Full name</label>
            <input required value={form.fullName} onChange={update('fullName')} placeholder="Jane Citizen" />
          </div>
          <div className="field">
            <label>Email address</label>
            <input required type="email" value={form.email} onChange={update('email')} placeholder="jane@email.com" />
          </div>
          <div className="field">
            <label>Phone number</label>
            <input required type="tel" value={form.phone} onChange={update('phone')} placeholder="0400 111 222" />
          </div>
          <div className="field">
            <label>Password</label>
            <input required type="password" value={form.password} onChange={update('password')} placeholder="At least 8 characters" />
          </div>
          <div className="field">
            <label>Confirm password</label>
            <input required type="password" value={form.confirm} onChange={update('confirm')} />
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Creating account...' : 'Sign Up'}</button>
        </form>
        <div className="center" style={{ marginTop: 20 }}>
          <span className="small muted">Already have an account? </span>
          <button className="link small" onClick={() => navigate('/login/jobseeker')}>Log In</button>
        </div>
      </div>
    </>
  );
}
