import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminStatCard, AdminBadge, AdminErrorBanner, AdminModal, AdminConfirmDialog } from '../components/AdminUI';
import AdminTable from '../components/AdminTable';
import PlanControlAutoApply from './PlanControlAutoApply';

const SECTIONS = [
  { key: 'editor', label: 'Plan Feature Editor' },
  { key: 'bulk', label: 'Bulk Plan Actions' },
  { key: 'pilots', label: 'Pilot Programs' },
  { key: 'history', label: 'Change History' },
  { key: 'autoApply', label: 'Auto Apply' },
];

const PLAN_TABS = [
  { key: 'employer_free', label: 'Free Employer' },
  { key: 'employer_starter', label: 'Starter' },
  { key: 'employer_growth', label: 'Growth' },
  { key: 'employer_enterprise', label: 'Enterprise' },
  { key: 'employer_enterprise_plus', label: 'Enterprise Plus' },
  { key: 'jobseeker_free', label: 'Free Job Seeker' },
  { key: 'jobseeker_premium', label: 'Premium Job Seeker' },
  { key: 'jobseeker_premium_plus', label: 'Premium Plus Job Seeker' },
  { key: 'global_billing', label: 'Global Billing' },
];

function fmtMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// --- Section 6: Live Plan Dashboard ---------------------------------------

function PlanBar({ label, count, max, color, avgTeamSize }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="admin-row-between" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
        <span style={{ fontWeight: 700 }}>{label}</span>
        <span style={{ color: '#64748b' }}>
          {count}
          {avgTeamSize !== undefined && avgTeamSize !== null && <span style={{ marginLeft: 8 }}>· avg team {avgTeamSize}</span>}
        </span>
      </div>
      <div style={{ height: 10, background: '#eef2f7', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.max(pct, count > 0 ? 4 : 0)}%`, background: color, borderRadius: 999 }} />
      </div>
    </div>
  );
}

function LiveDashboard() {
  const [summary, setSummary] = useState(null);

  useEffect(() => { adminApi.getPlanControlSummary().then(setSummary).catch(() => {}); }, []);
  if (!summary) return null;

  const maxEmployer = Math.max(1, ...summary.employerPlans.map((p) => p.count));
  const maxJobseeker = Math.max(1, ...summary.jobseekerPlans.map((p) => p.count));
  const colors = ['#94a3b8', '#3b82f6', '#10b981', '#7c3aed', '#f59e0b'];

  return (
    <div className="admin-card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16 }}>Live Plan Dashboard</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        <AdminStatCard label="Monthly Recurring Revenue" value={fmtMoney(summary.mrr)} sub={`Employers ${fmtMoney(summary.employerMrr)} · Job seekers ${fmtMoney(summary.jobseekerMrr)}`} tone="green" />
        <AdminStatCard label="Companies on Pilot" value={summary.pilotCount} tone="navy" />
        <AdminStatCard label="Approaching Usage Limit (80%+)" value={summary.approachingLimitCount} tone={summary.approachingLimitCount > 0 ? 'orange' : 'grey'} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#64748b', marginBottom: 10 }}>EMPLOYERS BY PLAN</div>
          {summary.employerPlans.map((p, i) => <PlanBar key={p.plan} label={p.label} count={p.count} max={maxEmployer} color={colors[i % colors.length]} avgTeamSize={p.avgTeamSize} />)}
        </div>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: '#64748b', marginBottom: 10 }}>JOB SEEKERS BY PLAN</div>
          {summary.jobseekerPlans.map((p, i) => <PlanBar key={p.plan} label={p.label} count={p.count} max={maxJobseeker} color={colors[i % colors.length]} />)}
        </div>
      </div>
    </div>
  );
}

// --- Section 1: Plan Feature Editor ---------------------------------------

function ToggleButton({ value, onChange }) {
  return (
    <button
      className={`admin-btn admin-btn-sm ${value ? 'admin-btn-green' : 'admin-btn-outline'}`}
      style={{ width: 64 }}
      onClick={() => onChange(!value)}
    >
      {value ? 'ON' : 'OFF'}
    </button>
  );
}

function PlanFeatureEditor() {
  const [data, setData] = useState(null);
  const [activePlan, setActivePlan] = useState('employer_free');
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMsg, setSavedMsg] = useState('');

  const load = () => adminApi.getPlanLimits().then((d) => { setData(d); setDraft({}); }).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  if (!data) return <div className="admin-card muted">Loading…</div>;

  // Three feature sets share this one editor: employer plans, job seeker
  // plans, and the single "global_billing" pseudo-plan (extra_member_price
  // — the one usage-based setting that isn't per-plan, see planFeatures.js).
  const isGlobalBilling = activePlan === (data.globalBillingPlanKey || 'global_billing');
  const isJobseekerPlan = !isGlobalBilling && activePlan.startsWith('jobseeker');
  const features = isGlobalBilling ? (data.featuresGlobalBilling || []) : isJobseekerPlan ? data.featuresJobseeker : data.featuresEmployer;
  const currentValues = { ...data.plans[activePlan], ...(draft[activePlan] || {}) };

  const setValue = (featureKey, value) => {
    setSavedMsg('');
    setDraft((d) => ({ ...d, [activePlan]: { ...(d[activePlan] || {}), [featureKey]: value } }));
  };

  const hasChanges = Object.keys(draft[activePlan] || {}).length > 0;

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await adminApi.savePlanLimits(activePlan, draft[activePlan]);
      setSavedMsg('Saved — new limits apply immediately to everyone on this plan.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="admin-tabs" style={{ flexWrap: 'wrap' }}>
        {PLAN_TABS.map((t) => (
          <button key={t.key} className={`admin-tab ${activePlan === t.key ? 'active' : ''}`} onClick={() => setActivePlan(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-card">
        <AdminErrorBanner message={error} />
        {savedMsg && <div style={{ background: '#ecfdf5', color: '#047857', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>{savedMsg}</div>}

        <table className="admin-table">
          <thead>
            <tr><th>Feature</th><th>Description</th><th style={{ width: 160 }}>Value</th></tr>
          </thead>
          <tbody>
            {features.map((f) => {
              const val = currentValues[f.key];
              return (
                <tr key={f.key}>
                  <td style={{ fontWeight: 700 }}>{f.label}</td>
                  <td className="muted" style={{ fontSize: 12.5 }}>{f.description}</td>
                  <td>
                    {f.type === 'boolean' ? (
                      <ToggleButton value={val === true} onChange={(v) => setValue(f.key, v)} />
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={val === 'unlimited' ? 'unlimited' : val}
                          onChange={(e) => setValue(f.key, e.target.value)}
                          style={{ width: 90, padding: '6px 8px', border: '1.5px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
                        />
                        <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setValue(f.key, 'unlimited')}>∞</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ marginTop: 16 }}>
          <button className="admin-btn admin-btn-primary" disabled={!hasChanges || saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Section 3: Bulk Plan Actions -----------------------------------------

const BULK_ACTIONS = [
  { key: 'plan_free', label: 'Change plan to Free' },
  { key: 'plan_starter', label: 'Change plan to Starter' },
  { key: 'plan_growth', label: 'Change plan to Growth' },
  { key: 'plan_enterprise', label: 'Change plan to Enterprise' },
  { key: 'plan_enterprise_plus', label: 'Change plan to Enterprise Plus' },
  { key: 'pilot_enable', label: 'Enable pilot program' },
  { key: 'pilot_disable', label: 'Disable pilot program' },
  { key: 'reset_usage', label: 'Reset monthly usage counts' },
  { key: 'send_expiry_reminder', label: 'Send plan expiry reminder email' },
  { key: 'increase_member_limit', label: 'Increase member limit by 5' },
  { key: 'reset_member_limit', label: 'Reset member limit to plan default' },
];

function BulkPlanActions() {
  const [companies, setCompanies] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [action, setAction] = useState('plan_starter');
  const [months, setMonths] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => { adminApi.listCompanies().then((d) => setCompanies(d.companies || [])).catch(() => {}); }, []);

  const toggle = (id) => setSelected((s) => { const next = new Set(s); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => setSelected((s) => (s.size === companies.length ? new Set() : new Set(companies.map((c) => c.id))));

  const apply = async () => {
    if (selected.size === 0) { setError('Select at least one company.'); return; }
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await adminApi.bulkPlanAction([...selected], action, action === 'pilot_enable' ? months : undefined);
      setResult(res);
      setSelected(new Set());
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const columns = [
    { key: 'select', label: '', render: (c) => <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} /> },
    { key: 'name', label: 'Company', sortable: true },
    { key: 'plan', label: 'Plan', sortable: true, render: (c) => <AdminBadge tone={c.plan === 'free' ? 'grey' : 'navy'}>{c.plan}{c.is_pilot ? ' (pilot)' : ''}</AdminBadge> },
    { key: 'work_email', label: 'Email' },
  ];

  return (
    <div className="admin-card">
      <AdminErrorBanner message={error} />
      {result && (
        <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>
          {result.succeeded} succeeded, {result.failed} failed{result.errors?.length ? ` — ${result.errors.slice(0, 3).join('; ')}` : ''}
        </div>
      )}

      <div className="admin-row" style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
        <select value={action} onChange={(e) => setAction(e.target.value)} style={{ padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}>
          {BULK_ACTIONS.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        {action === 'pilot_enable' && (
          <input
            type="number" min={1} value={months} onChange={(e) => setMonths(e.target.value)}
            style={{ width: 70, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
            title="Months"
          />
        )}
        {action === 'pilot_enable' && <span className="muted" style={{ fontSize: 12.5 }}>months</span>}
        <button className="admin-btn admin-btn-primary" disabled={busy} onClick={apply}>{busy ? 'Applying…' : `Apply to ${selected.size} selected`}</button>
        <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={toggleAll}>{selected.size === companies.length ? 'Deselect All' : 'Select All'}</button>
      </div>

      <AdminTable columns={columns} rows={companies} csvFilename="companies.csv" emptyMessage="No companies yet." />
    </div>
  );
}

// --- Section 4: Pilot Program Manager --------------------------------------

function StartPilotModal({ onClose, onStarted }) {
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const [plan, setPlan] = useState('growth');
  const [weeks, setWeeks] = useState(4);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { adminApi.listCompanies().then((d) => setCompanies(d.companies || [])).catch(() => {}); }, []);

  const submit = async () => {
    if (!companyId) { setError('Choose a company.'); return; }
    setBusy(true); setError('');
    try {
      await adminApi.startPlanControlPilot({ companyId, plan, weeks: Number(weeks) });
      onStarted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal title="Start New Pilot" onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Company</label>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
          <option value="">Select a company…</option>
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="admin-field">
        <label>Plan during pilot</label>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>
      <div className="admin-field">
        <label>Duration (weeks)</label>
        <input type="number" min={1} value={weeks} onChange={(e) => setWeeks(e.target.value)} />
      </div>
      <button className="admin-btn admin-btn-primary" disabled={busy} onClick={submit} style={{ width: '100%' }}>
        {busy ? 'Starting…' : 'Start Pilot'}
      </button>
    </AdminModal>
  );
}

function PilotPrograms() {
  const [pilots, setPilots] = useState([]);
  const [showStart, setShowStart] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => adminApi.listPlanControlPilots('active').then((d) => setPilots(d.pilots || [])).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const extend = async (id) => {
    setBusyId(id);
    try { await adminApi.extendPilot(id, 4); await load(); } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };
  const convert = async (id) => {
    setBusyId(id);
    try { await adminApi.convertPilot(id); await load(); } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };
  const doEnd = async () => {
    if (!confirmEnd) return;
    setBusyId(confirmEnd.id);
    try { await adminApi.endPilot(confirmEnd.id); await load(); } catch (err) { setError(err.message); } finally { setBusyId(null); setConfirmEnd(null); }
  };

  return (
    <div className="admin-card">
      <AdminErrorBanner message={error} />
      <div style={{ marginBottom: 16 }}>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowStart(true)}>Start New Pilot</button>
      </div>

      {pilots.length === 0 ? (
        <div className="admin-table-empty">No companies are currently on a pilot.</div>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Company</th><th>Plan Granted</th><th>Start</th><th>End</th><th>Days Left</th><th>Usage</th><th></th>
            </tr>
          </thead>
          <tbody>
            {pilots.map((p) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 700 }}>{p.companyName}</td>
                <td><AdminBadge tone="navy">{p.planGranted}</AdminBadge></td>
                <td className="muted" style={{ fontSize: 12.5 }}>{new Date(p.startDate).toLocaleDateString('en-AU')}</td>
                <td className="muted" style={{ fontSize: 12.5 }}>{new Date(p.endDate).toLocaleDateString('en-AU')}</td>
                <td><AdminBadge tone={p.daysRemaining <= 7 ? 'orange' : 'green'}>{p.daysRemaining}d</AdminBadge></td>
                <td className="muted" style={{ fontSize: 12.5 }}>
                  {(p.usage || []).map((u) => `${u.label}: ${u.used}${u.limit ? `/${u.limit}` : ''}`).join(' · ') || '—'}
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={busyId === p.id} onClick={() => extend(p.id)}>Extend</button>
                    <button className="admin-btn admin-btn-green admin-btn-sm" disabled={busyId === p.id} onClick={() => convert(p.id)}>Convert to Paid</button>
                    <button className="admin-btn admin-btn-danger admin-btn-sm" disabled={busyId === p.id} onClick={() => setConfirmEnd(p)}>End Now</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showStart && <StartPilotModal onClose={() => setShowStart(false)} onStarted={() => { setShowStart(false); load(); }} />}
      {confirmEnd && (
        <AdminConfirmDialog
          title="End this pilot now?"
          message={`${confirmEnd.companyName} will drop to the Free plan immediately and receive a thank-you email inviting them to subscribe.`}
          confirmLabel="End Pilot"
          danger
          onConfirm={doEnd}
          onCancel={() => setConfirmEnd(null)}
        />
      )}
    </div>
  );
}

// --- Section 5: Feature Change History -------------------------------------

function ChangeHistory() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => { adminApi.getPlanChangeLog(300).then((d) => setRows(d.changes || [])).catch((err) => setError(err.message)); }, []);

  const columns = [
    { key: 'changed_at', label: 'When', sortable: true, render: (r) => new Date(r.changed_at.replace(' ', 'T')).toLocaleString('en-AU') },
    { key: 'entity_type', label: 'Scope', render: (r) => <AdminBadge tone="grey">{r.entity_type}</AdminBadge> },
    { key: 'entity_id', label: 'Entity' },
    { key: 'feature_name', label: 'Feature', sortable: true },
    { key: 'old_value', label: 'Old Value', render: (r) => r.old_value ?? '—' },
    { key: 'new_value', label: 'New Value', render: (r) => r.new_value ?? '—' },
    { key: 'changed_by_admin_id', label: 'Changed By' },
  ];

  return (
    <div className="admin-card">
      <AdminErrorBanner message={error} />
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 12 }}>Permanent audit trail — every plan/feature change ever made through this portal. Cannot be edited or deleted.</p>
      <AdminTable columns={columns} rows={rows} csvFilename="plan-change-log.csv" emptyMessage="No changes logged yet." />
    </div>
  );
}

// --- Root ------------------------------------------------------------------

export default function PlanControl() {
  const [section, setSection] = useState('editor');

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Plan Control</h1>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>Manage plans, features, pilots, and overrides across the whole platform.</p>
        </div>
      </div>

      <LiveDashboard />

      <div className="admin-tabs">
        {SECTIONS.map((s) => (
          <button key={s.key} className={`admin-tab ${section === s.key ? 'active' : ''}`} onClick={() => setSection(s.key)}>{s.label}</button>
        ))}
      </div>

      {section === 'editor' && <PlanFeatureEditor />}
      {section === 'bulk' && <BulkPlanActions />}
      {section === 'pilots' && <PilotPrograms />}
      {section === 'history' && <ChangeHistory />}
      {section === 'autoApply' && <PlanControlAutoApply />}
    </div>
  );
}
