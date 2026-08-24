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
  const [maintenance, setMaintenance] = useState({ enabled: false, message: '', endTime: '' });
  const [maintenanceMsg, setMaintenanceMsg] = useState('');
  const [maintenanceEnd, setMaintenanceEnd] = useState('');
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceBanner, setMaintenanceBanner] = useState(false);

  const load = () => adminApi.getSystemHealth().then(setData).catch((err) => setError(err.message));
  const loadMaintenance = () => adminApi.getMaintenanceStatus().then((s) => {
    setMaintenance({ enabled: s.maintenanceMode, message: s.message, endTime: s.estimatedEndTime });
    setMaintenanceBanner(s.maintenanceMode);
  }).catch(() => {});

  useEffect(() => {
    load();
    loadMaintenance();
    const t = setInterval(() => { load(); loadMaintenance(); }, 30000);
    return () => clearInterval(t);
  }, []);

  const handleToggleMaintenance = async () => {
    setMaintenanceSaving(true);
    setError('');
    try {
      const newEnabled = !maintenance.enabled;
      await adminApi.setMaintenance(newEnabled, maintenanceMsg, maintenanceEnd);
      setMaintenance({ enabled: newEnabled, message: maintenanceMsg, endTime: maintenanceEnd });
      setMaintenanceBanner(newEnabled);
    } catch (err) {
      setError(err.message);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">System Health</div>
          <div className="admin-page-subtitle">Live service configuration checks and database stats — no external monitoring service is connected, so this only reports what the API itself can verify.</div>
        </div>
      </div>

      <AdminErrorBanner message={error} />

      {maintenanceBanner && (
        <div style={{ background: '#dc2626', color: '#fff', padding: '10px 16px', borderRadius: 8, marginBottom: 16, fontWeight: 700, fontSize: 13, textAlign: 'center' }}>
          ⚠ MAINTENANCE MODE ACTIVE — {maintenance.message || 'All non-admin API requests will receive 503 responses.'}
        </div>
      )}

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

      <div className="admin-card" style={{ marginBottom: 20 }}>
        <div className="admin-detail-section-title" style={{ marginBottom: 14 }}>MAINTENANCE MODE</div>
        <div className="admin-row" style={{ gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="admin-field" style={{ flex: 2, minWidth: 200 }}>
            <label>Maintenance message</label>
            <input value={maintenanceMsg} onChange={(e) => setMaintenanceMsg(e.target.value)} placeholder="e.g. We are performing scheduled upgrades…" />
          </div>
          <div className="admin-field" style={{ flex: 1, minWidth: 140 }}>
            <label>Estimated back online</label>
            <input type="datetime-local" value={maintenanceEnd} onChange={(e) => setMaintenanceEnd(e.target.value)} />
          </div>
          <div className="admin-field" style={{ flex: 0 }}>
            <button
              className={`admin-btn ${maintenance.enabled ? 'admin-btn' : 'admin-btn-primary'}`}
              onClick={handleToggleMaintenance}
              disabled={maintenanceSaving || (!maintenance.enabled && !maintenanceMsg.trim())}
              style={{ marginTop: 24, padding: '9px 20px' }}
            >
              {maintenanceSaving ? 'Saving…' : (maintenance.enabled ? 'Disable Maintenance' : 'Enable Maintenance')}
            </button>
          </div>
        </div>
        <div className="admin-row" style={{ gap: 10, alignItems: 'center', marginTop: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: maintenance.enabled ? '#dc2626' : '#64748b' }}>
            {maintenance.enabled ? '● ACTIVE' : '○ OFF'}
          </span>
          {maintenance.enabled && (
            <span className="admin-row" style={{ gap: 8, fontSize: 12.5, color: 'var(--a-grey-500)' }}>
              <span>Message: {maintenance.message || '(default)'}</span>
              {maintenance.endTime && <span>· Back online: {maintenance.endTime}</span>}
            </span>
          )}
        </div>
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
