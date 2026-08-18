import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { adminApi } from '../api/adminClient';
import AdminTopBar from './AdminTopBar';
import { ShieldCheck } from '../../components/Icons';

const NAV_ITEMS = [
  { key: 'command-centre', label: 'Command Centre', icon: '🏠', path: '/admin' },
  { key: 'companies', label: 'Companies', icon: '🏢', path: '/admin/companies' },
  { key: 'jobseekers', label: 'Job Seekers', icon: '👤', path: '/admin/jobseekers' },
  { key: 'agents', label: 'Agents', icon: '🤝', path: '/admin/agents' },
  { key: 'verification-queue', label: 'Verification Queue', icon: '✅', path: '/admin/verification-queue', badgeKey: 'verification' },
  { key: 'scam-reports', label: 'Scam Reports', icon: '🚨', path: '/admin/scam-reports', badgeKey: 'scamReports' },
  { key: 'revenue', label: 'Revenue', icon: '💰', path: '/admin/revenue' },
  { key: 'plan-control', label: 'Plan Control', icon: '🧩', path: '/admin/plan-control' },
  { key: 'support-tickets', label: 'Support Tickets', icon: '🎫', path: '/admin/support-tickets', badgeKey: 'supportTickets' },
  { key: 'announcements', label: 'Announcements', icon: '📣', path: '/admin/announcements' },
  { key: 'system-health', label: 'System Health', icon: '📡', path: '/admin/system-health' },
  { key: 'ai-assistant', label: 'AI Assistant', icon: '🤖', path: '/admin/ai-assistant' },
];

export default function AdminLayout({ active, children }) {
  const navigate = useNavigate();
  const { admin, logout } = useAdminAuth();
  const [badges, setBadges] = useState({ verification: 0, scamReportsPending: 0, scamReportsUrgent: 0, supportTickets: 0 });

  useEffect(() => {
    adminApi.getVerificationQueueCount().then((d) => setBadges((b) => ({ ...b, verification: d.count }))).catch(() => {});
    adminApi.getScamReportCounts().then((d) => setBadges((b) => ({ ...b, scamReportsPending: d.pending, scamReportsUrgent: d.urgent }))).catch(() => {});
    adminApi.getSupportTicketCounts().then((d) => setBadges((b) => ({ ...b, supportTickets: d.open }))).catch(() => {});
  }, [active]);

  const doLogout = () => {
    logout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-shell-v2">
      <AdminTopBar />
      <div className="admin-shell">
        <aside className="admin-sidebar">
          <div className="admin-sidebar-logo">
            <span className="admin-sidebar-logo-mark"><ShieldCheck size={34} color="#3b82f6" /></span>
            <div>
              <div className="admin-sidebar-logo-title">ClearCall</div>
              <div className="admin-sidebar-logo-subtitle">Super Admin</div>
            </div>
          </div>

          <nav className="admin-sidebar-nav">
            {NAV_ITEMS.map((item) => {
              let badgeValue = null;
              if (item.badgeKey === 'verification' && badges.verification > 0) badgeValue = badges.verification;
              if (item.badgeKey === 'scamReports' && (badges.scamReportsPending > 0 || badges.scamReportsUrgent > 0)) {
                badgeValue = badges.scamReportsUrgent > 0 ? `${badges.scamReportsUrgent} urgent` : badges.scamReportsPending;
              }
              if (item.badgeKey === 'supportTickets' && badges.supportTickets > 0) badgeValue = badges.supportTickets;
              return (
                <button
                  key={item.key}
                  className={`admin-sidebar-link ${active === item.key ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                >
                  <span className="admin-sidebar-link-icon">{item.icon}</span>
                  <span className="admin-sidebar-link-label">{item.label}</span>
                  {badgeValue !== null && (
                    <span className={`admin-nav-badge ${item.badgeKey === 'scamReports' && badges.scamReportsUrgent > 0 ? 'urgent' : ''}`}>
                      {badgeValue}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="admin-sidebar-footer">
            <div className="admin-sidebar-profile">
              <div className="admin-sidebar-avatar">
                VN
                <span className="admin-sidebar-online-dot" title="Online" />
              </div>
              <div>
                <div className="admin-sidebar-profile-name">Vinay Nani</div>
                <div className="admin-sidebar-profile-title">Founder &amp; Admin</div>
              </div>
            </div>
            <div className="admin-sidebar-email" title={admin?.email}>{admin?.email}</div>
            <button className="admin-sidebar-logout" onClick={doLogout}>Log Out</button>
          </div>
        </aside>

        <main className="admin-main">{children}</main>
      </div>
    </div>
  );
}
