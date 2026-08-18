import { useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/Shared';
import { ShieldCheck } from '../components/Icons';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { useAuth } from '../context/AuthContext';

const PLAN_LABELS = { free: 'Free', starter: 'Starter', growth: 'Growth', enterprise: 'Enterprise' };

export default function AgentDashboard() {
  const { user, agent, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = () => {
    logout();
    navigate('/signup');
  };

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <AnnouncementBanner />
        <div className="row-between mb-24">
          <div>
            <div className="muted small">Welcome back,</div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>{user?.full_name?.split(' ')[0] || 'there'}</div>
          </div>
          <ShieldCheck size={36} color="#1e3a8a" />
        </div>

        <div className="card mb-24">
          <div className="row-between mb-8">
            <div style={{ fontWeight: 800, fontSize: 16 }}>{agent?.agency_name || 'Your Agency'}</div>
            <span className={`badge ${agent?.abn_verified ? 'badge-green' : 'badge-grey'}`}>
              {agent?.abn_verified ? 'ABN Verified' : 'Not Verified'}
            </span>
          </div>
          <div className="muted small">Plan: {PLAN_LABELS[agent?.plan] || 'Free'}</div>
          <div className="muted small">Active clients: {agent?.active_clients ?? 0}</div>
          <div className="muted small">Successful placements: {agent?.successful_placements ?? 0}</div>
        </div>

        <div className="card muted small" style={{ marginBottom: 24 }}>
          Client management, candidate placements, and verified calling tools for agencies are coming soon.
          Your account is set up and ready for when they launch.
        </div>

        <button className="btn btn-outline" onClick={doLogout}>Log Out</button>
      </div>
    </>
  );
}
