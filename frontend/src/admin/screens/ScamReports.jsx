import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminBadge, AdminModal, AdminErrorBanner } from '../components/AdminUI';
import { formatDateTime } from '../../utils/date';

const STATUS_LABEL = { pending: 'Pending', investigating: 'Investigating', cleared: 'Cleared', resolved: 'Resolved' };
const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'investigating', label: 'Investigating' },
  { key: 'cleared', label: 'Cleared' },
  { key: 'resolved', label: 'Resolved' },
];

function ScamwatchModal({ report, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => { adminApi.getScamwatchPrefill(report.id).then(setData).catch(() => {}); }, [report.id]);
  return (
    <AdminModal title="Report to Scamwatch" onClose={onClose} maxWidth={520}>
      {!data ? 'Loading…' : (
        <>
          <p style={{ fontSize: 13, color: 'var(--a-grey-500)', marginTop: 0 }}>
            Scamwatch has no public submission API, so this pre-fills the details for you to review and submit manually.
          </p>
          {Object.entries(data.prefill).map(([k, v]) => (
            <div key={k} className="admin-detail-row"><span className="label">{k}</span><span className="value">{v || '—'}</span></div>
          ))}
          <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <a className="admin-btn admin-btn-primary" href={data.scamwatchUrl} target="_blank" rel="noreferrer">Open Scamwatch ↗</a>
          </div>
        </>
      )}
    </AdminModal>
  );
}

export default function ScamReports() {
  const [reports, setReports] = useState([]);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [scamwatchTarget, setScamwatchTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.listScamReports().then((d) => setReports(d.reports)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const runAction = async (fn) => {
    setError('');
    try { await fn(); load(); } catch (err) { setError(err.message); }
  };

  const filtered = useMemo(() => {
    let list = reports;
    if (tab !== 'all') list = list.filter((r) => r.status === tab);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((r) =>
        (r.reported_company_name || '').toLowerCase().includes(q) ||
        (r.reported_phone || '').toLowerCase().includes(q) ||
        (r.reporter_name || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [reports, tab, search]);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Scam Reports</div>
          <div className="admin-page-subtitle">Sorted by priority, most urgent first.</div>
        </div>
        <div className="admin-search-input" style={{ width: 280 }}>
          <span className="icon">🔎</span>
          <input placeholder="Search by company, reporter, or reason…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="admin-tabs" style={{ marginBottom: 16 }}>
        {STATUS_TABS.map((t) => (
          <button key={t.key} className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <AdminErrorBanner message={error} />

      {filtered.length === 0 ? (
        <div className="admin-card admin-table-empty">{reports.length === 0 ? 'No scam reports have been submitted.' : 'No reports match this filter.'}</div>
      ) : (
        filtered.map((r) => (
          <div key={r.id} className="admin-vq-entry">
            <div className="admin-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="admin-row" style={{ gap: 10 }}>
                <AdminBadge tone={r.priority}>{r.priority === 'red' ? 'Financial Loss' : r.priority === 'orange' ? 'Personal Info' : r.priority === 'yellow' ? 'Suspicious' : 'General'}</AdminBadge>
                <span style={{ fontSize: 12, color: 'var(--a-grey-400)' }}>Report #{r.id.slice(-8).toUpperCase()}</span>
              </div>
              <AdminBadge tone={r.status === 'resolved' ? 'green' : r.status === 'cleared' ? 'grey' : r.status === 'investigating' ? 'navy' : 'orange'}>
                {STATUS_LABEL[r.status] || r.status}
              </AdminBadge>
            </div>

            <div style={{ marginTop: 12 }}>
              <div className="admin-detail-row"><span className="label">Reporter</span><span className="value">{r.reporter_name || 'Unknown'}</span></div>
              <div className="admin-detail-row"><span className="label">Reported Company / Number</span><span className="value">{r.reported_company_name || r.reported_phone || '—'}</span></div>
              <div className="admin-detail-row"><span className="label">Reason</span><span className="value">{r.reason}</span></div>
              {r.description && <div className="admin-detail-row"><span className="label">Description</span><span className="value" style={{ textAlign: 'right', maxWidth: 320 }}>{r.description}</span></div>}
              <div className="admin-detail-row"><span className="label">Submitted</span><span className="value">{formatDateTime(r.created_at)}</span></div>
            </div>

            <div className="admin-row" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => runAction(() => adminApi.investigateReport(r.id))}>Investigate</button>
              <button className="admin-btn admin-btn-danger admin-btn-sm" disabled={!r.reported_company_id} onClick={() => runAction(() => adminApi.suspendReportedCompany(r.id))}>Suspend Company</button>
              <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => runAction(() => adminApi.clearReport(r.id))}>Clear</button>
              <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setScamwatchTarget(r)}>Report to Scamwatch</button>
              <button className="admin-btn admin-btn-green admin-btn-sm" onClick={() => runAction(() => adminApi.resolveReport(r.id))}>Mark Resolved</button>
            </div>
          </div>
        ))
      )}

      {scamwatchTarget && <ScamwatchModal report={scamwatchTarget} onClose={() => setScamwatchTarget(null)} />}
    </div>
  );
}
