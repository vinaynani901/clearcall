import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminClient';
import AdminTable from '../components/AdminTable';
import AdminThreeDotMenu from '../components/AdminThreeDotMenu';
import { AdminBadge, AdminSidePanel, AdminModal, AdminConfirmDialog, AdminErrorBanner } from '../components/AdminUI';
import { PLAN_LABELS, PLANS } from '../planLabels';
import PilotReportView from '../components/PilotReportView';
import { formatDate } from '../../utils/date';

const FILTER_TABS = [
  { key: 'all', label: 'All Companies' },
  { key: 'pending', label: 'Pending Approval' },
  { key: 'verified', label: 'Verified' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'high-risk', label: 'High Risk' },
];

const SECTOR_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'recruitment', label: 'Recruitment' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'healthcare', label: 'Healthcare' },
  { key: 'construction', label: 'Construction' },
  { key: 'education', label: 'Education' },
  { key: 'retail', label: 'Retail' },
  { key: 'technology', label: 'Technology' },
  { key: 'other', label: 'Other' },
];

const SECTOR_COLORS = {
  recruitment: '#3b82f6',
  delivery: '#f59e0b',
  healthcare: '#ef4444',
  construction: '#f97316',
  education: '#8b5cf6',
  retail: '#ec4899',
  technology: '#10b981',
  other: '#6b7280',
};

function MessageModal({ target, onClose, onSent }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const send = async () => {
    if (!subject.trim() || !message.trim()) { setError('Subject and message are required.'); return; }
    setSending(true);
    setError('');
    try {
      await adminApi.messageCompany(target.id, { subject: subject.trim(), message: message.trim() });
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminModal title={`Message ${target.name}`} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject line" autoFocus />
      </div>
      <div className="admin-field">
        <label>Message</label>
        <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write your message…" />
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
        <button className="admin-btn admin-btn-primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send Email'}</button>
      </div>
    </AdminModal>
  );
}

function StartPilotModal({ target, onClose, onStarted }) {
  const [form, setForm] = useState({ startDate: new Date().toISOString().slice(0, 10), endDate: '', beforeCallVolume: '', beforeAnswerRate: '', beforeNotes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.startDate || !form.endDate) { setError('Start and end dates are required.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminApi.startPilot(target.id, {
        startDate: form.startDate,
        endDate: form.endDate,
        beforeCallVolume: Number(form.beforeCallVolume) || 0,
        beforeAnswerRate: Number(form.beforeAnswerRate) || 0,
        beforeNotes: form.beforeNotes,
      });
      onStarted();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`Start pilot for ${target.name}`} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-row" style={{ gap: 12 }}>
        <div className="admin-field" style={{ flex: 1 }}>
          <label>Pilot start date</label>
          <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div className="admin-field" style={{ flex: 1 }}>
          <label>Pilot end date</label>
          <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
      </div>
      <div className="admin-detail-section-title">BEFORE DATA (manually entered baseline)</div>
      <div className="admin-row" style={{ gap: 12 }}>
        <div className="admin-field" style={{ flex: 1 }}>
          <label>Baseline call volume / month</label>
          <input type="number" value={form.beforeCallVolume} onChange={(e) => setForm((f) => ({ ...f, beforeCallVolume: e.target.value }))} />
        </div>
        <div className="admin-field" style={{ flex: 1 }}>
          <label>Baseline answer rate (%)</label>
          <input type="number" value={form.beforeAnswerRate} onChange={(e) => setForm((f) => ({ ...f, beforeAnswerRate: e.target.value }))} />
        </div>
      </div>
      <div className="admin-field">
        <label>Notes</label>
        <textarea rows={3} value={form.beforeNotes} onChange={(e) => setForm((f) => ({ ...f, beforeNotes: e.target.value }))} placeholder="How this baseline was collected…" />
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Start Pilot'}</button>
      </div>
    </AdminModal>
  );
}

function ChangePlanModal({ target, onClose, onChanged }) {
  const [plan, setPlan] = useState(target.plan || 'free');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await adminApi.changeCompanyPlan(target.id, plan);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`Change plan for ${target.name}`} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Plan</label>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          {PLANS.map((p) => <option key={p} value={p}>{PLAN_LABELS[p]}</option>)}
        </select>
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving || plan === target.plan}>{saving ? 'Saving…' : 'Save Plan'}</button>
      </div>
    </AdminModal>
  );
}

// Plan Control Section 2 — lives inside the Companies portal per spec:
// every employer feature with Feature Name / Plan Default / Override
// columns, an editable field, a highlighted indicator when an override is
// active, and a Reset to Plan Default button.
function FeatureOverridesSection({ companyId }) {
  const [features, setFeatures] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [busyKey, setBusyKey] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.getCompanyFeatureOverrides(companyId).then((d) => setFeatures(d.features)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [companyId]);

  if (!features) return null;

  const save = async (key) => {
    const value = drafts[key];
    if (value === undefined || value === '') return;
    setBusyKey(key);
    setError('');
    try {
      await adminApi.setCompanyFeatureOverride(companyId, key, value);
      setDrafts((d) => { const n = { ...d }; delete n[key]; return n; });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  const reset = async (key) => {
    setBusyKey(key);
    setError('');
    try {
      await adminApi.clearCompanyFeatureOverride(companyId, key);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="admin-detail-section">
      <div className="admin-detail-section-title">FEATURE OVERRIDES</div>
      <AdminErrorBanner message={error} />
      <table className="admin-table">
        <thead>
          <tr><th>Feature</th><th>Plan Default</th><th>Override</th><th></th></tr>
        </thead>
        <tbody>
          {features.map((f) => (
            <tr key={f.key} style={f.hasOverride ? { background: 'rgba(245,158,11,0.06)' } : undefined}>
              <td style={{ fontWeight: 700, fontSize: 12.5 }}>
                {f.label} {f.hasOverride && <AdminBadge tone="orange">Override active</AdminBadge>}
              </td>
              <td className="muted" style={{ fontSize: 12.5 }}>{String(f.planDefault)}</td>
              <td>
                <input
                  type="text"
                  placeholder={f.override !== null ? String(f.override) : 'No override'}
                  value={drafts[f.key] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                  style={{ width: 90, padding: '5px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 12.5 }}
                />
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={busyKey === f.key || !drafts[f.key]} onClick={() => save(f.key)}>Save</button>
                  {f.hasOverride && (
                    <button className="admin-btn admin-btn-sm" disabled={busyKey === f.key} onClick={() => reset(f.key)}>Reset</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompanyProfilePanel({ companyId, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.getCompany(companyId).then(setData).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [companyId]);

  if (!data) {
    return <AdminSidePanel title="Company Profile" onClose={onClose}><AdminErrorBanner message={error} />Loading…</AdminSidePanel>;
  }

  const { company, recruiters, totalCalls, reports } = data;

  return (
    <AdminSidePanel title={company.name} onClose={onClose} wide>
      <div className="admin-detail-section">
        <div className="admin-detail-section-title">COMPANY</div>
        <div className="admin-detail-row"><span className="label">ABN</span><span className="value">{company.abn}</span></div>
        <div className="admin-detail-row"><span className="label">Industry</span><span className="value">{company.industry || '—'}</span></div>
        <div className="admin-detail-row"><span className="label">Plan</span><span className="value">{PLAN_LABELS[company.plan] || company.plan}</span></div>
        <div className="admin-detail-row"><span className="label">ABN Verified</span><span className="value">{company.abn_verified ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="red">No</AdminBadge>}</span></div>
        <div className="admin-detail-row"><span className="label">Work Email</span><span className="value">{company.work_email}</span></div>
        <div className="admin-detail-row"><span className="label">Work Email Confirmed</span><span className="value">{company.email_verified ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="red">No</AdminBadge>}</span></div>
        <div className="admin-detail-row"><span className="label">Review Status</span><span className="value">{company.admin_review_status}</span></div>
        <div className="admin-detail-row"><span className="label">Suspended</span><span className="value">{company.suspension_status ? <AdminBadge tone="red">Yes</AdminBadge> : <AdminBadge tone="green">No</AdminBadge>}</span></div>
        <div className="admin-detail-row"><span className="label">Total Calls Made</span><span className="value">{totalCalls}</span></div>
        <div className="admin-detail-row"><span className="label">Joined</span><span className="value">{formatDate(company.created_at)}</span></div>
      </div>

      <div className="admin-detail-section">
        <div className="admin-detail-section-title">RECRUITERS ({recruiters.length})</div>
        {recruiters.length === 0 ? <div className="admin-table-empty" style={{ padding: '12px 0' }}>No recruiters yet.</div> : recruiters.map((r) => (
          <div key={r.id} className="admin-recruiter-row">
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{r.full_name}</div>
              <div style={{ fontSize: 12, color: 'var(--a-grey-500)' }}>{r.email}</div>
            </div>
            <AdminBadge tone={r.is_active ? 'green' : 'grey'}>{r.is_active ? 'Active' : 'Inactive'}</AdminBadge>
          </div>
        ))}
      </div>

      <FeatureOverridesSection companyId={company.id} />

      <div className="admin-detail-section">
        <div className="admin-detail-section-title">REPORT HISTORY ({reports.length})</div>
        {reports.length === 0 ? <div className="admin-table-empty" style={{ padding: '12px 0' }}>No reports against this company.</div> : reports.map((r) => (
          <div key={r.id} className="admin-detail-row" style={{ display: 'block', padding: '10px 0' }}>
            <div style={{ fontWeight: 700 }}>{r.reason}</div>
            {r.description && <div style={{ fontSize: 12.5, color: 'var(--a-grey-500)', marginTop: 2 }}>{r.description}</div>}
            <div style={{ fontSize: 11.5, color: 'var(--a-grey-400)', marginTop: 4 }}>{formatDate(r.created_at)} · {r.status}</div>
          </div>
        ))}
      </div>
    </AdminSidePanel>
  );
}

export default function Companies() {
  const [view, setView] = useState('all'); // all | pilots
  const [companies, setCompanies] = useState([]);
  const [pilots, setPilots] = useState([]);
  const [filter, setFilter] = useState('all');
  const [sectorFilter, setSectorFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [profileId, setProfileId] = useState(null);
  const [messageTarget, setMessageTarget] = useState(null);
  const [changePlanTarget, setChangePlanTarget] = useState(null);
  const [pilotStartTarget, setPilotStartTarget] = useState(null);
  const [pilotReportTarget, setPilotReportTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null); // { action, company }
  const [error, setError] = useState('');

  const loadCompanies = () => adminApi.listCompanies().then((d) => setCompanies(d.companies)).catch((err) => setError(err.message));
  const loadPilots = () => adminApi.listPilots().then((d) => setPilots(d.pilots)).catch((err) => setError(err.message));

  useEffect(() => { loadCompanies(); loadPilots(); }, []);

  const filtered = useMemo(() => {
    let list = companies;
    if (filter === 'pending') list = list.filter((c) => c.admin_review_status === 'pending');
    else if (filter === 'verified') list = list.filter((c) => c.abn_verified);
    else if (filter === 'suspended') list = list.filter((c) => c.suspension_status);
    else if (filter === 'high-risk') list = list.filter((c) => c.report_count >= 3);
    if (sectorFilter !== 'all') list = list.filter((c) => c.company_sector === sectorFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.abn.includes(q));
    }
    return list;
  }, [companies, filter, search]);

  const runAction = async (fn) => {
    setError('');
    try {
      await fn();
      loadCompanies();
    } catch (err) {
      setError(err.message);
    }
  };

  const menuFor = (c) => [
    { label: 'View Full Profile', onClick: () => setProfileId(c.id) },
    // The profile side panel already includes total calls made and the
    // full report history, so these two open the same panel rather than
    // duplicating separate table views.
    { label: 'View All Calls', onClick: () => setProfileId(c.id) },
    { label: 'View All Reports', onClick: () => setProfileId(c.id) },
    ...(c.admin_review_status !== 'approved' ? [{ label: 'Approve Account', onClick: () => runAction(() => adminApi.approveCompany(c.id)) }] : []),
    c.suspension_status
      ? { label: 'Unsuspend Account', onClick: () => runAction(() => adminApi.unsuspendCompany(c.id)) }
      : { label: 'Suspend Account', onClick: () => runAction(() => adminApi.suspendCompany(c.id)) },
    { label: 'Send Message', onClick: () => setMessageTarget(c) },
    { label: 'Change Plan', onClick: () => setChangePlanTarget(c) },
    ...(!c.is_pilot ? [{ label: 'Start Pilot Program', onClick: () => setPilotStartTarget(c) }] : []),
    { label: 'Delete Account', danger: true, onClick: () => setConfirmTarget(c) },
  ];

  const columns = [
    { key: 'name', label: 'Company Name', sortable: true },
    { key: 'abn', label: 'ABN', sortable: true },
    { key: 'industry', label: 'Industry', sortable: true, render: (c) => (
    <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
      {c.industry || '—'}
      {c.company_sector && (
        <span style={{
          display: 'inline-block', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700,
          color: '#fff', background: SECTOR_COLORS[c.company_sector] || '#6b7280',
        }}>{c.company_sector}</span>
      )}
    </span>
  ) },
    {
      key: 'plan', label: 'Plan', sortable: true,
      render: (c) => (
        <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
          {PLAN_LABELS[c.plan] || c.plan}
          {c.hasCustomRate && <AdminBadge tone="orange">Custom Rate</AdminBadge>}
          {c.hasCustomLimit && <AdminBadge tone="orange">Custom Limit</AdminBadge>}
        </span>
      ),
      csv: (c) => PLAN_LABELS[c.plan] || c.plan,
    },
    { key: 'abn_verified', label: 'Verified', sortable: true, render: (c) => (c.abn_verified ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="red">No</AdminBadge>), csv: (c) => (c.abn_verified ? 'Yes' : 'No') },
    { key: 'suspension_status', label: 'Active', sortable: true, render: (c) => (c.suspension_status ? <AdminBadge tone="red">No</AdminBadge> : <AdminBadge tone="green">Yes</AdminBadge>), csv: (c) => (c.suspension_status ? 'No' : 'Yes') },
    { key: 'callsThisMonth', label: 'Calls This Month', sortable: true },
    { key: 'report_count', label: 'Reports Against', sortable: true, render: (c) => (c.report_count >= 3 ? <AdminBadge tone="red">{c.report_count}</AdminBadge> : c.report_count) },
    { key: 'created_at', label: 'Date Joined', sortable: true, render: (c) => formatDate(c.created_at), csv: (c) => c.created_at },
    { key: 'actions', label: 'Actions', render: (c) => <AdminThreeDotMenu options={menuFor(c)} /> },
  ];

  const pilotColumns = [
    { key: 'name', label: 'Company Name', sortable: true },
    { key: 'pilot_start_date', label: 'Pilot Start', sortable: true, render: (c) => c.pilot_start_date ? formatDate(c.pilot_start_date) : '—' },
    { key: 'pilot_end_date', label: 'Pilot End', sortable: true, render: (c) => c.pilot_end_date ? formatDate(c.pilot_end_date) : '—' },
    { key: 'callsMade', label: 'Calls Made', sortable: true },
    { key: 'answerRate', label: 'Answer Rate', sortable: true, render: (c) => `${c.answerRate}%`, csv: (c) => `${c.answerRate}%` },
    { key: 'actions', label: 'Actions', render: (c) => <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setPilotReportTarget(c)}>Generate Impact Report</button> },
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Companies</div>
        </div>
        <div className="admin-tabs">
          <button className={`admin-tab ${view === 'all' ? 'active' : ''}`} onClick={() => setView('all')}>All Companies</button>
          <button className={`admin-tab ${view === 'pilots' ? 'active' : ''}`} onClick={() => setView('pilots')}>Pilot Programs</button>
        </div>
      </div>

      <AdminErrorBanner message={error} />

      {view === 'all' ? (
        <>
          <div className="admin-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
            <div className="admin-tabs">
              {FILTER_TABS.map((t) => (
                <button key={t.key} className={`admin-tab ${filter === t.key ? 'active' : ''}`} onClick={() => setFilter(t.key)}>{t.label}</button>
              ))}
            </div>
            <div className="admin-search-input" style={{ width: 280 }}>
              <span className="icon">🔎</span>
              <input placeholder="Search by name or ABN…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="admin-row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
            {SECTOR_FILTERS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSectorFilter(s.key)}
                style={{
                  padding: '4px 14px', borderRadius: 999, border: '1.5px solid',
                  borderColor: sectorFilter === s.key ? (SECTOR_COLORS[s.key] || '#3b82f6') : '#e2e8f0',
                  background: sectorFilter === s.key ? `${SECTOR_COLORS[s.key] || '#3b82f6'}15` : 'transparent',
                  color: sectorFilter === s.key ? (SECTOR_COLORS[s.key] || '#3b82f6') : '#64748b',
                  fontWeight: sectorFilter === s.key ? 700 : 500,
                  fontSize: 12.5, cursor: 'pointer', transition: 'all 0.15s',
                }}
              >{s.label}</button>
            ))}
          </div>

          <AdminTable
            columns={columns}
            rows={filtered}
            csvFilename="companies.csv"
            emptyMessage="No companies match this filter."
          />
        </>
      ) : (
        <AdminTable
          columns={pilotColumns}
          rows={pilots}
          csvFilename="pilot-companies.csv"
          emptyMessage="No companies are currently on a pilot program. Start one from a company's three-dot menu."
        />
      )}

      {profileId && <CompanyProfilePanel companyId={profileId} onClose={() => setProfileId(null)} />}

      {messageTarget && (
        <MessageModal
          target={messageTarget}
          onClose={() => setMessageTarget(null)}
          onSent={() => setMessageTarget(null)}
        />
      )}

      {changePlanTarget && (
        <ChangePlanModal
          target={changePlanTarget}
          onClose={() => setChangePlanTarget(null)}
          onChanged={() => { setChangePlanTarget(null); loadCompanies(); }}
        />
      )}

      {pilotStartTarget && (
        <StartPilotModal
          target={pilotStartTarget}
          onClose={() => setPilotStartTarget(null)}
          onStarted={() => { setPilotStartTarget(null); loadPilots(); loadCompanies(); }}
        />
      )}

      {pilotReportTarget && (
        <PilotReportView companyId={pilotReportTarget.id} onClose={() => setPilotReportTarget(null)} />
      )}

      {confirmTarget && (
        <AdminConfirmDialog
          title="Delete this company?"
          message={`This permanently deletes ${confirmTarget.name}'s company record and campaign data. Call history is kept for audit purposes. This cannot be undone.`}
          confirmLabel="Delete Account"
          danger
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => { const c = confirmTarget; setConfirmTarget(null); runAction(() => adminApi.deleteCompany(c.id)); }}
        />
      )}
    </div>
  );
}
