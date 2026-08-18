import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, BellIcon, ChevronDownIcon, PhoneIcon, DocumentIcon, CalendarIcon, RefreshIcon, StarIcon, KeyIcon, DeclineIcon, RocketIcon } from './Icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { timeAgo } from '../utils/date';
import ResumeUsedModal from './ResumeUsedModal';

function initials(name) {
  return String(name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'U';
}

const NOTIF_META = {
  verified_call: { icon: PhoneIcon, color: '#10b981' },
  application_update: { icon: RefreshIcon, color: '#f59e0b' },
  new_job_match: { icon: StarIcon, color: '#f59e0b' },
  agent_connected: { icon: KeyIcon, color: '#10b981' },
  key_revoked: { icon: KeyIcon, color: '#94a3b8' },
  application_rejected: { icon: DeclineIcon, color: '#ef4444' },
  auto_apply: { icon: RocketIcon, color: '#1e3a8a' },
  auto_apply_summary: { icon: RocketIcon, color: '#1e3a8a' },
};

export default function JobSeekerTopBar() {
  const navigate = useNavigate();
  const { user, avatarUrl, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [resumeModalId, setResumeModalId] = useState(null);
  const menuRef = useRef(null);
  const notifRef = useRef(null);

  const loadNotifications = () => {
    api.getNotifications(10).then((d) => {
      setNotifications(d.notifications || []);
      setUnreadCount(d.unreadCount || 0);
    }).catch(() => {});
  };

  useEffect(() => {
    loadNotifications();
    // Poll for new notifications every 30s so the badge count updates on
    // its own — no websocket layer yet, matches the same polling approach
    // used elsewhere in the job seeker app (dashboard auto-checks too).
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const openNotification = async (n) => {
    if (!n.read) {
      try { await api.markNotificationRead(n.id); } catch { /* non-fatal */ }
      setNotifications((list) => list.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
      setUnreadCount((c) => Math.max(0, c - 1));
    }
    setNotifOpen(false);
    if (n.link) navigate(n.link);
  };

  const markAllRead = async (e) => {
    e.stopPropagation();
    try { await api.markAllNotificationsRead(); } catch { /* non-fatal */ }
    setNotifications((list) => list.map((x) => ({ ...x, read: 1 })));
    setUnreadCount(0);
  };

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
    <div className="jsk-topbar">
      <div className="jsk-topbar-brand" onClick={() => navigate('/jobseeker/home')}>
        <ShieldCheck size={24} color="#1e3a8a" />
        <div>
          <div className="jsk-topbar-brand-name">ClearCall</div>
          <div className="jsk-topbar-brand-tagline">Verified. Trusted. Protected.</div>
        </div>
      </div>

      <div className="jsk-topbar-right">
        <div className="jsk-topbar-bell" ref={notifRef}>
          <button className="jsk-topbar-icon-btn" onClick={() => setNotifOpen((o) => !o)} aria-label="Notifications">
            <BellIcon size={19} />
            {unreadCount > 0 && <span className="jsk-topbar-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </button>
          {notifOpen && (
            <div className="jsk-topbar-dropdown" style={{ width: 320, padding: 0 }}>
              <div className="row-between" style={{ padding: '12px 14px 8px' }}>
                <span className="bold small">Notifications</span>
                {unreadCount > 0 && <button className="link xs" onClick={markAllRead}>Mark All as Read</button>}
              </div>
              {notifications.length === 0 ? (
                <div className="muted xs" style={{ padding: '8px 14px 16px' }}>Nothing new yet.</div>
              ) : (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {notifications.map((n) => {
                    const meta = NOTIF_META[n.type] || { icon: BellIcon, color: '#64748b' };
                    const Icon = meta.icon;
                    // The auto-apply notification carries a structured
                    // action_data payload (Part 5's two buttons: "View
                    // Application" and "View Resume Used") — every other
                    // notification type keeps the old single-click-through
                    // behaviour via `link`.
                    let actionData = null;
                    if (n.type === 'auto_apply' && n.action_data) {
                      try { actionData = JSON.parse(n.action_data); } catch { actionData = null; }
                    }
                    return (
                      <div
                        key={n.id}
                        className="jsk-topbar-dropdown-item"
                        style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', textAlign: 'left', background: n.read ? 'transparent' : 'rgba(59,130,246,0.05)' }}
                      >
                        <button
                          type="button"
                          style={{ display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                          onClick={() => openNotification(n)}
                        >
                          <span style={{ width: 28, height: 28, borderRadius: 8, background: `${meta.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Icon size={14} color={meta.color} />
                          </span>
                          <span style={{ flex: 1, minWidth: 0 }}>
                            <span className="small bold" style={{ display: 'block' }}>{n.title}</span>
                            <span className="muted xs" style={{ display: 'block' }}>{n.message}</span>
                            <span className="muted xs" style={{ display: 'block', marginTop: 2 }}>{timeAgo(n.created_at)}</span>
                          </span>
                          {!n.read && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--navy)', flexShrink: 0, marginTop: 4 }} />}
                        </button>
                        {actionData && (
                          <div className="row" style={{ gap: 8, paddingLeft: 38 }}>
                            <button type="button" className="link xs" onClick={() => openNotification(n)}>View Application</button>
                            <span className="muted xs">·</span>
                            <button
                              type="button"
                              className="link xs"
                              onClick={(e) => { e.stopPropagation(); setNotifOpen(false); setResumeModalId(actionData.resumeVersionId); }}
                            >
                              View Resume Used
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="jsk-topbar-user" ref={menuRef} onClick={() => setMenuOpen((o) => !o)}>
          <div className="jsk-topbar-avatar" style={avatarUrl ? { padding: 0, overflow: 'hidden' } : undefined}>
            {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initials(user?.full_name)}
          </div>
          <ChevronDownIcon size={13} />
          {menuOpen && (
            <div className="jsk-topbar-dropdown" style={{ right: 0, left: 'auto' }}>
              <button className="jsk-topbar-dropdown-item" onClick={() => navigate('/jobseeker/profile')}>View Profile</button>
              <button className="jsk-topbar-dropdown-item" onClick={() => navigate('/settings')}>Settings</button>
              <button className="jsk-topbar-dropdown-item" style={{ color: 'var(--red)' }} onClick={doLogout}>Log Out</button>
            </div>
          )}
        </div>
      </div>

      {resumeModalId && <ResumeUsedModal resumeVersionId={resumeModalId} onClose={() => setResumeModalId(null)} />}
    </div>
  );
}
