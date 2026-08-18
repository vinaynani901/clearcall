import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { adminApi } from '../api/adminClient';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

const TIME_FMT = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
const DATE_FMT = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

export default function AdminTopBar() {
  const { admin } = useAdminAuth();
  const navigate = useNavigate();
  const now = useClock();
  const [healthy, setHealthy] = useState(true);
  const [notifCount, setNotifCount] = useState(0);
  const [notifItems, setNotifItems] = useState([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef(null);

  useEffect(() => {
    const load = () => {
      adminApi.commandCentre().then((d) => setHealthy(d.healthPct >= 80)).catch(() => {});

      // Bell preview: a handful of the most attention-needing items across
      // the three queues that actually feed the badge count below, each
      // linking straight to its portal. Real data, not a static count with
      // nothing behind it.
      Promise.all([
        adminApi.getVerificationQueue().catch(() => ({ queue: [] })),
        adminApi.listScamReports().catch(() => ({ reports: [] })),
        adminApi.listSupportTickets().catch(() => ({ tickets: [] })),
      ]).then(([vq, scam, tickets]) => {
        const vqItems = (vq.queue || []).slice(0, 3).map((e) => ({
          key: `vq-${e.id}`, label: `${e.companyName} awaiting verification`, path: '/admin/verification-queue',
        }));
        const urgentReports = (scam.reports || []).filter((r) => r.status === 'pending' && r.priority === 'red').slice(0, 3).map((r) => ({
          key: `scam-${r.id}`, label: `Urgent scam report — ${r.reported_company_name || 'unknown number'}`, path: '/admin/scam-reports',
        }));
        const openTickets = (tickets.tickets || []).filter((t) => t.status === 'open').slice(0, 3).map((t) => ({
          key: `ticket-${t.id}`, label: `Open ticket — ${t.subject}`, path: '/admin/support-tickets',
        }));
        const items = [...urgentReports, ...vqItems, ...openTickets];
        setNotifItems(items);
        setNotifCount((vq.queue || []).length + urgentReports.length + (tickets.tickets || []).filter((t) => t.status !== 'closed').length);
      });
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    function onClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const goTo = (path) => { setNotifOpen(false); navigate(path); };

  const initials = 'VN'; // Vinay Nani — the platform's single hardcoded admin account

  return (
    <header className="admin-topbar">
      <div className="admin-topbar-status">
        <div className={`admin-topbar-status-row ${healthy ? '' : 'down'}`}>
          <span className="admin-topbar-pulse-dot" />
          <span className="admin-topbar-status-label">{healthy ? 'ALL SYSTEMS OPERATIONAL' : 'SERVICE DEGRADED'}</span>
        </div>
        <div className="admin-topbar-status-sub">Platform Status: {healthy ? 'Healthy' : 'Needs attention'}</div>
      </div>

      <div className="admin-topbar-right">
        <div className="admin-topbar-clock">
          <div className="admin-topbar-time">{TIME_FMT.format(now)} AEST</div>
          <div className="admin-topbar-date">{DATE_FMT.format(now)}</div>
        </div>

        <div className="admin-topbar-bell-wrap" ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="admin-topbar-bell"
            aria-label="Notifications"
            title={`${notifCount} item${notifCount === 1 ? '' : 's'} need attention`}
            onClick={() => setNotifOpen((o) => !o)}
          >
            🔔
            {notifCount > 0 && <span className="admin-topbar-bell-badge">{notifCount > 99 ? '99+' : notifCount}</span>}
          </button>
          {notifOpen && (
            <div className="admin-topbar-notif-dropdown">
              <div className="admin-topbar-notif-title">Needs Attention</div>
              {notifItems.length === 0 ? (
                <div className="admin-topbar-notif-empty">Nothing needs attention right now.</div>
              ) : (
                notifItems.map((item) => (
                  <button key={item.key} className="admin-topbar-notif-item" onClick={() => goTo(item.path)}>{item.label}</button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="admin-topbar-profile">
          <div className="admin-topbar-avatar">{initials}</div>
          <div>
            <div className="admin-topbar-profile-name">Vinay Nani</div>
            <div className="admin-topbar-profile-title">Founder &amp; Admin</div>
          </div>
        </div>
      </div>
    </header>
  );
}
