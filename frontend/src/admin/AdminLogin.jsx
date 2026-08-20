import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from './context/AdminAuthContext';
import './admin.css';

function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAdminAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await login(email, password);
      navigate('/admin');
    } catch (err) {
      setError(err.message || 'Failed to login');
      setIsLoading(false);
    }
  };

  return (
    <div className="admin-login-screen">
      <div className="admin-login-card">
        <div className="admin-login-logo">
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M12 2L4 5v6.09c0 5.05 3.41 9.76 8 10.91 4.59-1.15 8-5.86 8-10.91V5l-8-3z" />
          </svg>
          <div>
            <div className="admin-login-title">ClearCall</div>
            <div className="admin-login-subtitle">Super Admin</div>
          </div>
        </div>

        {error && <div className="admin-error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="admin-field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="admin@clearcall.com"
            />
          </div>

          <div className="admin-field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            className="admin-btn admin-btn-primary"
            disabled={isLoading}
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="admin-login-note">
          Only use this panel for administrative tasks. For support, contact your ClearCall
          account manager.
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;
