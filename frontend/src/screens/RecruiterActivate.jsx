import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import AuthShell from '../components/AuthShell';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Invitation acceptance welcome screen (Part 7). Mounted at the canonical
// /invite/accept/:token route and also kept at the older /recruiter/
// activate/:token path for any links already sent before this screen was
// generalized from agency-only recruiters to every plan's team invites.
export default function RecruiterActivate() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { loginWithToken } = useAuth();
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getRecruiterInvite(token)
      .then((data) => { setInvite(data); setFullName(data.invitedName || ''); })
      .catch((err) => setLoadError(err.message));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!fullName.trim()) { setError('Please enter your name'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirm) { setError('Passwords do not match'); return; }
    setError('');
    setLoading(true);
    try {
      const data = await api.activateRecruiterInvite(token, password, fullName.trim());
      await loginWithToken(data.token, data.user);
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
        <TopHeader title="You're Invited" onBack={() => navigate('/')} />

        {loadError && (
          <div className="card center" style={{ padding: 24 }}>
            <div className="bold" style={{ marginBottom: 6 }}>This invitation link isn't valid</div>
            <p className="muted small">{loadError}</p>
            <p className="muted small">Ask the person who invited you to send a new invitation.</p>
          </div>
        )}

        {invite && !loadError && (
          <>
            <div className="card" style={{ marginBottom: 20, textAlign: 'center', padding: '24px 20px' }}>
              <div style={{ fontSize: 15 }}>
                {invite.inviterName ? <><strong>{invite.inviterName}</strong> has invited you</> : 'You have been invited'} to join
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, margin: '6px 0' }}>{invite.companyName}</div>
              <div style={{ fontSize: 13 }}>on ClearCall as <span className="badge badge-blue">{invite.invitedRole}</span></div>
            </div>

            <ErrorBanner message={error} />
            <form onSubmit={submit} className="stack">
              <div className="field">
                <label>Your Name</label>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div className="field">
                <label>Work Email</label>
                <input value={invite.invitedEmail} disabled />
              </div>
              <div className="field">
                <label>Create Password</label>
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>
              <div className="field">
                <label>Confirm Password</label>
                <input required type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <button className="btn btn-primary" disabled={loading}>{loading ? 'Creating your account…' : 'Create Account & Join'}</button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  );
}
