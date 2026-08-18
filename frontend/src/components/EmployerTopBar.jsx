import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, BellIcon, ChevronDownIcon } from './Icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatDateTime } from '../utils/date';

function formatAbn(abn) {
  const digits = String(abn || '').replace(/\D/g, '');
  if (digits.length !== 11) return abn || '';
  return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
}

function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export default function EmployerTopBar() {
  const navigate = useNavigate();
  const { user, company, logout } = useAuth();
  const [jobTitle, setJobTitle] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [callbacks, setCallbacks] = useState([]);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    api.listWorkProfiles().then((d) => {
      const active = (d.profiles || []).find((p) => p.is_active) || (d.profiles || [])[0];
      setJobTitle(active?.designation || '');
    }).catch(() => {});
    api.getCallbacksDue().then((d) => {
      setCallbacks(d.callbacks || []);
      setUnreadCount((d.callbacks || []).length);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const doLogout = () => {
    logout();
    navigate('/signup');
  };

  return (
    <div className="topbar">
      <div className="topbar-brand" onClick={() => navigate('/employer/dashboard')}>
        <ShieldCheck size={26} color="#1e3a8a" />
        <div>
          <div className="topbar-brand-name">ClearCall</div>
          <div className="topbar-brand-tagline">Verified Calls · Trusted Connections</div>
        </div>
      </div>

      <div className="topbar-right">
        <div className="topbar-pill" onClick={() => navigate('/settings')}>
          <ShieldCheck size={15} color="#059669" />
          <div className="topbar-pill-text">
            <span className="bold">{company?.name || 'Your Company'}</span>
            {company?.abn && <span className="muted"> · ABN {formatAbn(company.abn)}</span>}
          </div>
          <ChevronDownIcon size={13} color="#059669" />
        </div>

        <div className="topbar-bell" ref={notifRef}>
          <button className="topbar-icon-btn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
            <BellIcon size={19} />
            {unreadCount > 0 && <span className="topbar-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="topbar-dropdown">
              <div className="bold small" style={{ marginBottom: 8 }}>Callbacks Due</div>
              {callbacks.length === 0 ? (
                <div className="muted xs">You're all caught up.</div>
              ) : (
                callbacks.slice(0, 5).map((c) => (
                  <div
                    key={c.id}
                    className="topbar-dropdown-item"
                    onClick={() => { setNotifOpen(false); navigate(`/employer/campaigns/${c.campaign_id}/candidates/${c.id}`); }}
                  >
                    <span className="small bold">{c.name}</span>
                    <span className="muted xs">{formatDateTime(c.callback_at, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="topbar-user" ref={menuRef} onClick={() => setMenuOpen((o) => !o)}>
          <div className="topbar-avatar">{initials(user?.full_name) || 'U'}</div>
          <div className="topbar-user-text">
            <div className="small bold">{user?.full_name || 'User'}</div>
            {jobTitle && <div className="muted xs">{jobTitle}</div>}
          </div>
          <span className="topbar-user-chevron"><ChevronDownIcon size={13} /></span>

          {menuOpen && (
            <div className="topbar-dropdown" style={{ right: 0, left: 'auto' }}>
              {/* Company name + ABN — the pill next to it is hidden on mobile
                  to keep the top bar to a single row, so it's reachable here
                  instead (see .topbar-dropdown-company in index.css). */}
              <div className="topbar-dropdown-company" onClick={() => navigate('/settings')}>
                <ShieldCheck size={14} color="#059669" />
                <div className="topbar-pill-text">
                  <span className="bold">{company?.name || 'Your Company'}</span>
                  {company?.abn && <span className="muted"> · ABN {formatAbn(company.abn)}</span>}
                </div>
              </div>
              <button className="topbar-dropdown-item" onClick={() => navigate('/settings')}>Settings</button>
              <button className="topbar-dropdown-item" style={{ color: 'var(--red)' }} onClick={doLogout}>Log Out</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
