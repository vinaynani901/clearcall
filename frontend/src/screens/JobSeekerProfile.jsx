import { StatusBar, JobSeekerBottomNav } from '../components/Shared';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function JobSeekerProfile() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 20 }}>My Profile</h1>

        <div className="screen-centered mb-24">
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>
            {user?.full_name ? user.full_name[0] : '?'}
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, marginTop: 12 }}>{user?.full_name}</div>
          <div className="muted small">{user?.email}</div>
        </div>

        <div className="card mb-24">
          <div className="row-between small mb-8"><span className="muted">Phone</span><span className="bold">{user?.phone || '—'}</span></div>
          <div className="row-between small"><span className="muted">Member since</span><span className="bold">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span></div>
        </div>

        <div className="card mb-16">
          <div className="muted xs bold mb-8">TRY THE VERIFIED CALL SCREEN</div>
          <div className="stack">
            <button
              className="btn btn-green btn-sm"
              onClick={() => navigate('/call/incoming-verified', {
                state: { metadata: { companyName: 'Bright Schools Group', callerName: 'Alice Principal', designation: 'Principal', jobRole: 'Year 5 Teacher', hideNumber: true } },
              })}
            >
              Simulate Verified Call
            </button>
            <button
              className="btn btn-grey btn-sm"
              onClick={() => navigate('/call/incoming-unverified', { state: { phone: '+61 400 999 888' } })}
            >
              Simulate Unverified Call
            </button>
          </div>
        </div>
      </div>
      <JobSeekerBottomNav active="profile" />
    </>
  );
}
