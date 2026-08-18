import { useNavigate } from 'react-router-dom';
import EmployerTopBar from './EmployerTopBar';
import { ChevronDownIcon, LockIcon } from './Icons';
import { usePlan } from '../context/PlanContext';

const NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard', path: '/employer/dashboard' },
  { key: 'make-call', label: 'Make a Call', path: '/employer/make-call' },
  { key: 'campaigns', label: 'Campaigns', path: '/employer/campaigns', feature: 'campaign_manager' },
  { key: 'work-profiles', label: 'Work Profiles', path: '/employer/work-profiles', chevron: true },
  { key: 'calls', label: 'Call History', path: '/employer/calls' },
  { key: 'pipeline', label: 'Pipeline', path: '/employer/pipeline', feature: 'agency_pipeline' },
  { key: 'job-postings', label: 'Post a Job', path: '/employer/job-postings', feature: 'job_postings_monthly_limit' },
  { key: 'contacts', label: 'Contacts', path: '/employer/contacts' },
  { key: 'call-display-settings', label: 'Call Display', path: '/employer/call-display-settings' },
  { key: 'reports', label: 'Reports and Insights', path: '/employer/reports' },
  { key: 'settings', label: 'Settings', path: '/settings' },
  { key: 'help', label: 'Help and Support', path: '/help' },
];

// Small "which plan am I on" indicator shown at the top of the sidebar —
// spec: employers should always know their plan status at a glance without
// having to open Settings.
function PlanBadge() {
  const navigate = useNavigate();
  const { plan } = usePlan();
  if (!plan) return null;
  const isFree = plan.plan === 'free';
  return (
    <button
      onClick={() => navigate('/settings')}
      className={`badge ${isFree ? 'badge-grey-light' : 'badge-green'}`}
      style={{ margin: '0 20px 14px', border: 'none', cursor: 'pointer', width: 'fit-content' }}
    >
      {plan.planLabel || (isFree ? 'Free' : plan.plan)} Plan
    </button>
  );
}

/**
 * Desktop/tablet shell for employer-facing screens: a persistent top bar
 * (brand, verification pill, notifications, user menu) plus a dark sidebar
 * nav, both inert below the 900px breakpoint — mobile keeps using each
 * screen's own StatusBar/EmployerBottomNav exactly as before.
 *
 * `wide` widens the content column for list-heavy screens (Dashboard, Call
 * History, Work Profiles) that benefit from a two-column grid; form-heavy
 * screens (Make a Call, Call Display Settings, Settings) stay narrower for
 * readability.
 */
export default function EmployerLayout({ active, wide, children }) {
  const navigate = useNavigate();
  const { isLocked } = usePlan();

  return (
    <div className="employer-app-shell">
      <EmployerTopBar />
      <div className="dashboard-layout">
        <aside className="dashboard-sidebar">
          <PlanBadge />
          <nav className="sidebar-nav">
            {NAV_ITEMS.map((item) => {
              const locked = item.feature && isLocked(item.feature);
              return (
                <button
                  key={item.key}
                  className={`sidebar-link ${active === item.key ? 'active' : ''}`}
                  onClick={() => navigate(item.path)}
                  title={locked ? 'Requires an upgrade — click to see plans' : undefined}
                >
                  <span className="row" style={{ gap: 6 }}>
                    {item.label}
                    {locked && <LockIcon size={12} color={active === item.key ? '#fff' : '#94a3b8'} />}
                  </span>
                  {item.chevron && <ChevronDownIcon size={13} color={active === item.key ? '#fff' : '#94a3b8'} />}
                </button>
              );
            })}
          </nav>

          <div className="sidebar-upgrade-card">
            <div className="bold small" style={{ color: '#fff', marginBottom: 4 }}>Upgrade to Pro</div>
            <p className="xs" style={{ color: '#c7d2fe', margin: '0 0 12px', lineHeight: 1.4 }}>
              Unlock unlimited campaigns, advanced insights, and priority support.
            </p>
            <button className="btn btn-green btn-sm" style={{ width: '100%' }} onClick={() => navigate('/pricing')}>
              Upgrade Now
            </button>
          </div>
          <div className="sidebar-copyright">© {new Date().getFullYear()} ClearCall. All rights reserved.</div>
        </aside>
        <div className={`dashboard-main ${wide ? 'dashboard-main--wide' : ''}`}>{children}</div>
      </div>
    </div>
  );
}
