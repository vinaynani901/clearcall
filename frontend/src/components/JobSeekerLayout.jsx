import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerTopBar from './JobSeekerTopBar';
import {
  HomeIcon, DocumentIcon, BriefcaseIcon, HandshakeIcon, ShieldCheck,
  ActivityIcon, ChatIcon, SettingsIcon, HelpIcon, RocketIcon, ProfileIcon, LockIcon,
} from './Icons';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import { api } from '../api/client';

function planBadgeLabel(plan) {
  if (!plan) return null;
  return plan.planLabel || (plan.plan === 'premium' ? 'Premium' : 'Free');
}

const NAV_ITEMS = [
  { key: 'home', label: 'Dashboard', path: '/jobseeker/home', icon: HomeIcon },
  { key: 'applications', label: 'My Applications', path: '/jobseeker/applications', icon: DocumentIcon },
  { key: 'jobs', label: 'Job Search', path: '/jobseeker/jobs', icon: BriefcaseIcon },
  { key: 'auto-apply', label: 'Auto Apply', path: '/jobseeker/auto-apply', icon: RocketIcon },
  { key: 'resume', label: 'Resume Builder', path: '/jobseeker/resume', icon: DocumentIcon, feature: 'resume_builder' },
  { key: 'agent', label: 'Placement Agent', path: '/jobseeker/agent', icon: HandshakeIcon },
  { key: 'calls', label: 'Call Protection', path: '/jobseeker/calls', icon: ShieldCheck },
  { key: 'activity', label: 'Activity Feed', path: '/jobseeker/activity', icon: ActivityIcon },
  { key: 'messages', label: 'Messages', path: '/jobseeker/messages', icon: ChatIcon },
  { key: 'settings', label: 'Settings', path: '/settings', icon: SettingsIcon },
  { key: 'help', label: 'Help and Support', path: '/help', icon: HelpIcon },
];

const MOBILE_NAV_ITEMS = [
  { key: 'home', label: 'Home', path: '/jobseeker/home', icon: HomeIcon },
  { key: 'applications', label: 'Applications', path: '/jobseeker/applications', icon: DocumentIcon },
  { key: 'jobs', label: 'Jobs', path: '/jobseeker/jobs', icon: BriefcaseIcon },
  { key: 'messages', label: 'Messages', path: '/jobseeker/messages', icon: ChatIcon },
  { key: 'profile', label: 'Profile', path: '/jobseeker/profile', icon: ProfileIcon },
];

function initials(name) {
  return String(name || '').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('') || 'U';
}

/**
 * Desktop/tablet/mobile shell for job seeker screens. Three tiers, all
 * scoped under jsk- classes so they're fully independent of the employer
 * side's .dashboard-sidebar (900px breakpoint) — see index.css "Job Seeker
 * v2 shell": <768 sidebar hidden (JobSeekerBottomNav takes over instead),
 * 768-1024 icon-only sidebar, >1024 full sidebar with labels.
 *
 * `rightRail` renders after `children` in DOM order so it naturally stacks
 * below the main column on tablet/mobile and moves beside it on desktop —
 * no separate mobile-only markup needed.
 */
export default function JobSeekerLayout({ active, children, rightRail }) {
  const navigate = useNavigate();
  const { user, avatarUrl } = useAuth();
  const { plan, isLocked } = usePlan();
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    // Combines unread ClearCall team messages (admin_messages) with unread
    // placement-agent chat messages, so the one nav badge reflects both.
    Promise.all([api.getMessages().catch(() => ({ unreadCount: 0 })), api.listConversations().catch(() => ({ conversations: [] }))])
      .then(([admin, chat]) => {
        const chatUnread = (chat.conversations || []).reduce((sum, c) => sum + (c.unreadCount || 0), 0);
        setUnreadMessages((admin.unreadCount || 0) + chatUnread);
      });
  }, [active]);

  return (
    <div className="jsk-shell">
      <JobSeekerTopBar />
      <div className="jsk-body">
        <aside className="jsk-sidebar">
          <nav className="jsk-sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const locked = item.feature && isLocked(item.feature);
              return (
                <button
                  key={item.key}
                  className={`jsk-sidebar-link ${active === item.key ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  title={locked ? `${item.label} — requires Premium` : item.label}
                >
                  <span className="jsk-sidebar-link-icon"><item.icon size={19} color={active === item.key ? '#1e3a8a' : '#64748b'} /></span>
                  <span className="jsk-sidebar-link-label">{item.label}</span>
                  {locked && <LockIcon size={12} color="#94a3b8" />}
                  {item.key === 'messages' && unreadMessages > 0 && <span className="jsk-nav-badge">{unreadMessages}</span>}
                </button>
              );
            })}
          </nav>

          <div className="jsk-sidebar-upgrade-card">
            <RocketIcon size={22} />
            <p className="jsk-sidebar-upgrade-text">Get more visibility and priority access to jobs</p>
            <button className="btn btn-green btn-sm" style={{ width: '100%' }} onClick={() => navigate('/pricing/jobseeker')}>Upgrade Now</button>
          </div>

          <button className="jsk-sidebar-profile" onClick={() => navigate('/jobseeker/profile')}>
            <div className="jsk-sidebar-avatar" style={avatarUrl ? { padding: 0, overflow: 'hidden' } : undefined}>
              {avatarUrl ? <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} /> : initials(user?.full_name)}
            </div>
            <div className="jsk-sidebar-profile-text">
              <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                <div className="jsk-sidebar-profile-name">{user?.full_name || 'Your Account'}</div>
                {plan && (
                  <span className={`badge ${plan.plan === 'premium' ? 'badge-green' : 'badge-grey-light'} xs`}>
                    {planBadgeLabel(plan)}
                  </span>
                )}
              </div>
              <div className="jsk-sidebar-profile-link">View Profile</div>
            </div>
          </button>
        </aside>

        <div className="jsk-main">
          <div className="jsk-main-col">{children}</div>
          {rightRail && <div className="jsk-rail">{rightRail}</div>}
        </div>
      </div>

      <nav className="jsk-bottom-nav">
        {MOBILE_NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            className={`bottom-nav-item ${active === item.key ? 'active' : ''}`}
            onClick={() => navigate(item.path)}
          >
            <span style={{ position: 'relative' }}>
              <item.icon active={active === item.key} />
              {item.key === 'messages' && unreadMessages > 0 && <span className="jsk-bottom-nav-badge">{unreadMessages > 9 ? '9+' : unreadMessages}</span>}
            </span>
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
