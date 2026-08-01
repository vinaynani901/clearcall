import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, JobSeekerBottomNav, EmployerBottomNav } from '../components/Shared';
import { useAuth } from '../context/AuthContext';

function Row({ label, onClick }) {
  return (
    <button className="row-between" style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', borderBottom: '1px solid var(--grey-200)', cursor: 'pointer', textAlign: 'left' }} onClick={onClick}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>{label}</span>
      <span className="muted">›</span>
    </button>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isEmployer = user?.role === 'employer';
  const [toast, setToast] = useState('');

  const doLogout = () => {
    logout();
    navigate('/signup');
  };

  const showToast = (label) => {
    setToast(`${label} — coming soon`);
    setTimeout(() => setToast(''), 2000);
  };

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Settings</h1>

        <div className="card" style={{ padding: '4px 16px' }}>
          {isEmployer && <Row label="My Work Profiles" onClick={() => navigate('/employer/work-profiles')} />}
          {isEmployer && <Row label="Call Display Settings" onClick={() => navigate('/employer/call-display-settings')} />}
          <Row label="Notifications" onClick={() => showToast('Notifications')} />
          <Row label="Privacy Settings" onClick={() => showToast('Privacy Settings')} />
          <Row label="Block a Company" onClick={() => showToast('Block a Company')} />
          <Row label="Reported Calls" onClick={() => navigate('/jobseeker/calls')} />
          <Row label="Change Password" onClick={() => navigate('/change-password')} />
          <Row label="Help and Support" onClick={() => navigate('/help')} />
          <Row label="Terms and Privacy Policy" onClick={() => navigate('/terms')} />
          <button className="row-between" style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', cursor: 'pointer', textAlign: 'left' }} onClick={doLogout}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>Log Out</span>
          </button>
        </div>
      </div>
      {isEmployer ? <EmployerBottomNav active="settings" /> : <JobSeekerBottomNav active="settings" />}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
