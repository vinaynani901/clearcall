import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function WorkEmailOtp() {
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const email = user?.email;

  const sendCode = async () => {
    setError('');
    try {
      await api.sendOtp(email);
      setSent(true);
      setResendCooldown(30);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { if (email) sendCode(); /* eslint-disable-next-line */ }, [email]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const verify = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.verifyOtp(email, code);
      await refresh();
      navigate('/success', { state: { message: 'Your work email is verified. Your ClearCall account is now active.', continueTo: '/employer/dashboard' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen screen-centered" style={{ flex: 1 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📧</div>
        <div style={{ fontWeight: 800, fontSize: 19, marginBottom: 6 }}>Verify Your Work Email</div>
        <div className="muted small" style={{ marginBottom: 24 }}>
          {sent ? 'We sent a 6-digit code to' : 'Sending a code to'} <strong>{email}</strong>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={verify} style={{ width: '100%' }}>
          <div className="field">
            <label>6-digit code</label>
            <input
              required
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              style={{ textAlign: 'center', letterSpacing: 8, fontWeight: 800, fontSize: 22 }}
            />
          </div>
          <button className="btn btn-primary" disabled={loading || code.length !== 6}>
            {loading ? 'Verifying...' : 'Verify Email'}
          </button>
        </form>

        <button
          className="link small"
          style={{ marginTop: 16 }}
          disabled={resendCooldown > 0}
          onClick={sendCode}
        >
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend code'}
        </button>

        <div className="muted xs" style={{ marginTop: 20, maxWidth: 300 }}>
          The code expires in 10 minutes. This verifies you are employed at this company.
        </div>
      </div>
    </>
  );
}
