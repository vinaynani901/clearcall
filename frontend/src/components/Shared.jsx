import { useNavigate } from 'react-router-dom';
import { HomeIcon, CallsIcon, ProfileIcon, SettingsIcon, CandidatesIcon } from './Icons';

export function StatusBar({ dark }) {
  return <div className={`status-bar ${dark ? 'dark' : ''}`} />;
}

export function TopHeader({ title, onBack }) {
  const navigate = useNavigate();
  return (
    <div className="top-header">
      <button className="back-btn" onClick={onBack || (() => navigate(-1))} aria-label="Back">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="#334155" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <h1>{title}</h1>
      <div style={{ width: 36 }} />
    </div>
  );
}

export function JobSeekerBottomNav({ active }) {
  const navigate = useNavigate();
  const items = [
    { key: 'home', label: 'Home', icon: HomeIcon, path: '/jobseeker/home' },
    { key: 'auto-apply', label: 'Auto Apply', icon: CallsIcon, path: '/jobseeker/auto-apply' },
    { key: 'jobs', label: 'Jobs', icon: CallsIcon, path: '/jobseeker/jobs' },
    { key: 'calls', label: 'Calls', icon: CallsIcon, path: '/jobseeker/calls' },
    { key: 'profile', label: 'Profile', icon: ProfileIcon, path: '/jobseeker/profile' },
    { key: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings' },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <button
          key={it.key}
          className={`bottom-nav-item ${active === it.key ? 'active' : ''}`}
          onClick={() => navigate(it.path)}
        >
          <it.icon active={active === it.key} />
          {it.label}
        </button>
      ))}
    </nav>
  );
}

export function EmployerBottomNav({ active }) {
  const navigate = useNavigate();
  const items = [
    { key: 'dashboard', label: 'Dashboard', icon: HomeIcon, path: '/employer/dashboard' },
    { key: 'calls', label: 'Calls', icon: CallsIcon, path: '/employer/make-call' },
    { key: 'candidates', label: 'Campaigns', icon: CandidatesIcon, path: '/employer/campaigns' },
    { key: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings' },
  ];
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <button
          key={it.key}
          className={`bottom-nav-item ${active === it.key ? 'active' : ''}`}
          onClick={() => navigate(it.path)}
        >
          <it.icon active={active === it.key} />
          {it.label}
        </button>
      ))}
    </nav>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div style={{
      background: 'rgba(239,68,68,0.1)',
      border: '1px solid rgba(239,68,68,0.3)',
      color: '#dc2626',
      padding: '12px 14px',
      borderRadius: 10,
      fontSize: 13,
      fontWeight: 600,
      marginBottom: 16,
    }}>
      {message}
    </div>
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', onConfirm, onCancel }) {
  return (
    <div className="sheet-backdrop" onClick={onCancel}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 360, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>{title}</div>
        <p className="muted small" style={{ margin: '0 0 20px' }}>{message}</p>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-grey" onClick={onCancel}>Cancel</button>
          <button className="btn btn-red" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function InfoBox({ children }) {
  return (
    <div style={{
      background: 'rgba(30,58,138,0.06)',
      border: '1px solid rgba(30,58,138,0.15)',
      color: '#1e3a8a',
      padding: '14px',
      borderRadius: 12,
      fontSize: 13,
      lineHeight: 1.5,
      marginBottom: 16,
    }}>
      {children}
    </div>
  );
}
