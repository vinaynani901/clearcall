import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminStatCard, AdminErrorBanner } from '../components/AdminUI';
import { formatTime } from '../../utils/date';

const TABLE_LABEL = {
  users: 'Users',
  companies: 'Companies',
  agents: 'Agents',
  calls: 'Calls',
  campaigns: 'Campaigns',
  campaign_candidates: 'Campaign Candidates',
  reports: 'Reports',
  support_tickets: 'Support Tickets',
  announcements: 'Announcements',
};

export default function SystemHealth() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.getSystemHealth().then(setData).catch((err) => setError(err.message));
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">System Health</div>
          <div className="admin-page-subtitle">Live service configuration checks and database stats — no external monitoring service is connected, so this only reports what the API itself can verify.</div>
        </div>
      </div>

      <AdminErrorBanner message={error} />

      {data && !data.allOperational && (
        <div className="admin-error-banner" style={{ marginBottom: 16 }}>One or more services are missing configuration. See details below.</div>
      )}

      <div className="admin-health-bar" style={{ marginBottom: 20 }}>
        {(data?.services || []).map((s) => (
          <div key={s.name} className="admin-health-pill" title={s.detail}>
            <span className={`admin-health-dot ${s.status}`} />
            {s.name} — {s.status === 'operational' ? 'Operational' : 'Down'}
          </div>
        ))}
      </div>

      <div className="admin-stats-grid">
        <AdminStatCard label="Process Uptime" value={data?.process.uptimeLabel ?? '—'} />
        <AdminStatCard label="Node Version" value={data?.process.nodeVersion ?? '—'} />
        <AdminStatCard label="Memory Used" value={data ? `${data.process.memoryUsedMb} MB` : '—'} sub={data ? `of ${data.process.memoryTotalMb} MB heap` : ''} />
        <AdminStatCard label="Last Checked" value={data ? formatTime(data.generatedAt, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'} sub="Auto-refreshes every 30s" />
      </div>

      <div className="admin-card">
        <div className="admin-detail-section-title" style={{ marginBottom: 14 }}>DATABASE ROW COUNTS</div>
        {!data ? (
          <div className="admin-table-empty">Loading…</div>
        ) : (
          Object.entries(data.tableCounts).map(([table, count]) => (
            <div key={table} className="admin-detail-row">
              <span className="label">{TABLE_LABEL[table] || table}</span>
              <span className="value">{count === null ? 'unavailable' : count.toLocaleString('en-AU')}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
