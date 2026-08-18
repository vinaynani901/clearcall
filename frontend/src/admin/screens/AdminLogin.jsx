import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { ShieldCheck } from '../../components/Icons';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { login } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-screen">
      <form className="admin-login-card" onSubmit={submit}>
        <div className="admin-login-logo">
          <ShieldCheck size={44} color="#1e3a8a" />
          <div>
            <div className="admin-login-title">ClearCall</div>
            <div className="admin-login-subtitle">Super Admin Panel</div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <div className="admin-field">
          <label>Admin email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@clearcall.com.au"
            autoFocus
          />
        </div>
        <div className="admin-field">
          <label>Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="admin-btn admin-btn-primary" disabled={loading} style={{ width: '100%', marginTop: 8 }}>
          {loading ? 'Signing in…' : 'Sign In'}
        </button>

        <div className="admin-login-note">
          This is a private, internal ClearCall tool. Unauthorised access attempts are logged.
        </div>
      </form>
    </div>
  );
}
