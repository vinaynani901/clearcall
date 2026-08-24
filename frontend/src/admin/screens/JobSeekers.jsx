import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminClient';
import AdminTable from '../components/AdminTable';
import AdminThreeDotMenu from '../components/AdminThreeDotMenu';
import { AdminBadge, AdminSidePanel, AdminModal, AdminConfirmDialog, AdminErrorBanner } from '../components/AdminUI';
import { formatDate, formatDateTime } from '../../utils/date';

const FILTER_TABS = [
  { key: 'all', label: 'All Job Seekers' },
  { key: 'active', label: 'Active' },
  { key: 'suspended', label: 'Suspended' },
  { key: 'looking', label: 'Looking For Work' },
];

const PLAN_BADGES = {
  free: <AdminBadge tone="grey">Free</AdminBadge>,
  premium: <AdminBadge tone="green">Premium</AdminBadge>,
  premium_plus: <AdminBadge tone="orange">Premium Plus</AdminBadge>,
};

function ChangePlanModal({ target, onClose, onChanged }) {
  const [plan, setPlan] = useState(target.plan || 'free');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await adminApi.changeJobseekerPlan(target.id, plan);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`Change plan for ${target.full_name}`} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Plan</label>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="free">Free</option>
          <option value="premium">Premium</option>
          <option value="premium_plus">Premium Plus</option>
        </select>
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving || plan === target.plan}>{saving ? 'Saving…' : 'Save Plan'}</button>
      </div>
    </AdminModal>
  );
}

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
      await adminApi.messageJobseeker(target.id, { subject: subject.trim(), message: message.trim() });
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminModal title={`Message ${target.full_name}`} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Subject</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} autoFocus />
      </div>
      <div className="admin-field">
        <label>Message</label>
        <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={sending}>Cancel</button>
        <button className="admin-btn admin-btn-primary" onClick={send} disabled={sending}>{sending ? 'Sending…' : 'Send Email'}</button>
      </div>
    </AdminModal>
  );
}

function CallHistoryPanel({ user, onClose }) {
  const [calls, setCalls] = useState(null);
  useEffect(() => { adminApi.getJobseekerCalls(user.id).then((d) => setCalls(d.calls)).catch(() => setCalls([])); }, [user.id]);
  return (
    <AdminSidePanel title={`Call History — ${user.full_name}`} onClose={onClose}>
      {calls === null ? 'Loading…' : calls.length === 0 ? (
        <div className="admin-table-empty">No calls received yet.</div>
      ) : calls.map((c) => (
        <div key={c.id} className="admin-detail-row" style={{ display: 'block', padding: '10px 0' }}>
          <div style={{ fontWeight: 700 }}>{c.call_type === 'clearcall' ? 'ClearCall Verified' : 'Normal Call'} · {c.call_status}</div>
          {c.company_name && <div style={{ fontSize: 12.5, color: 'var(--a-grey-500)', marginTop: 2 }}>{c.company_name}</div>}
          <div style={{ fontSize: 12, color: 'var(--a-grey-500)', marginTop: 2 }}>{formatDateTime(c.created_at)}</div>
        </div>
      ))}
    </AdminSidePanel>
  );
}

// Real job seeker profile — was previously wired to open CallHistoryPanel
// by mistake, so "View Profile" and "View Call History" showed the exact
// same thing. This pulls the actual account/profile fields from
// GET /api/admin/jobseekers/:id (name, contact info, resume, notification
// settings, Gmail connection, agent link, and the same tracked-applications
// / calls-received counts shown in the table).
function ProfilePanel({ user, onClose, onViewCalls }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { adminApi.getJobseeker(user.id).then((d) => setData(d.jobseeker)).catch((err) => setError(err.message)); }, [user.id]);

  if (!data) {
    return <AdminSidePanel title="Job Seeker Profile" onClose={onClose}><AdminErrorBanner message={error} />Loading…</AdminSidePanel>;
  }

  return (
    <AdminSidePanel title={data.full_name} onClose={onClose} wide>
      <div className="admin-detail-section">
        <div className="admin-detail-section-title">CONTACT</div>
        <div className="admin-detail-row"><span className="label">Email</span><span className="value">{data.email}</span></div>
        <div className="admin-detail-row"><span className="label">Phone</span><span className="value">{data.phone || '—'}</span></div>
        <div className="admin-detail-row"><span className="label">Joined</span><span className="value">{formatDate(data.created_at)}</span></div>
        <div className="admin-detail-row"><span className="label">Account Status</span><span className="value">{data.suspended ? <AdminBadge tone="red">Suspended</AdminBadge> : <AdminBadge tone="green">Active</AdminBadge>}</span></div>
        <div className="admin-detail-row"><span className="label">Looking For Work</span><span className="value">{data.looking_for_work ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="grey">No</AdminBadge>}</span></div>
        <div className="admin-detail-row"><span className="label">Profile Visibility</span><span className="value">{data.profile_visibility || '—'}</span></div>
      </div>

      <div className="admin-detail-section">
        <div className="admin-detail-section-title">ACTIVITY</div>
        <div className="admin-detail-row"><span className="label">Applications Tracked</span><span className="value">{data.applicationsTracked}</span></div>
        <div className="admin-detail-row">
          <span className="label">Calls Received</span>
          <span className="value">
            {data.callsReceived}{' '}
            {data.callsReceived > 0 && <button className="admin-btn admin-btn-outline admin-btn-sm" style={{ marginLeft: 8 }} onClick={() => onViewCalls(user)}>View</button>}
          </span>
        </div>
        <div className="admin-detail-row"><span className="label">Resume Uploaded</span><span className="value">{data.resume_filename ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="grey">No</AdminBadge>}</span></div>
        <div className="admin-detail-row"><span className="label">Gmail Connected</span><span className="value">{data.gmail_connected ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="grey">No</AdminBadge>}</span></div>
      </div>

      <div className="admin-detail-section">
        <div className="admin-detail-section-title">PLACEMENT AGENT</div>
        {data.agent ? (
          <div className="admin-detail-row"><span className="label">Connected To</span><span className="value">{data.agent.full_name} ({data.agent.agency_name})</span></div>
        ) : (
          <div className="admin-table-empty" style={{ padding: '12px 0' }}>Not connected to a placement agent.</div>
        )}
      </div>
    </AdminSidePanel>
  );
}

export default function JobSeekers() {
  const [jobseekers, setJobseekers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [profileTarget, setProfileTarget] = useState(null);
  const [messageTarget, setMessageTarget] = useState(null);
  const [callsTarget, setCallsTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [changePlanTarget, setChangePlanTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.listJobseekers().then((d) => setJobseekers(d.jobseekers)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = jobseekers;
    if (filter === 'active') list = list.filter((u) => !u.suspended);
    else if (filter === 'suspended') list = list.filter((u) => u.suspended);
    else if (filter === 'looking') list = list.filter((u) => u.looking_for_work);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((u) => u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
    }
    return list;
  }, [jobseekers, filter, search]);

  const runAction = async (fn) => {
    setError('');
    try { await fn(); load(); } catch (err) { setError(err.message); }
  };

  const menuFor = (u) => [
    { label: 'View Profile', onClick: () => setProfileTarget(u) },
    { label: 'View Call History', onClick: () => setCallsTarget(u) },
    { label: 'Change Plan', onClick: () => setChangePlanTarget(u) },
    u.suspended
      ? { label: 'Unsuspend Account', onClick: () => runAction(() => adminApi.unsuspendJobseeker(u.id)) }
      : { label: 'Suspend Account', onClick: () => runAction(() => adminApi.suspendJobseeker(u.id)) },
    { label: 'Send Message', onClick: () => setMessageTarget(u) },
    { label: 'Delete Account', danger: true, onClick: () => setConfirmTarget(u) },
  ];

  const columns = [
    { key: 'full_name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'plan', label: 'Plan', sortable: true, render: (u) => PLAN_BADGES[u.plan] || <AdminBadge tone="grey">{u.plan || 'free'}</AdminBadge>, csv: (u) => u.plan || 'free' },
    { key: 'created_at', label: 'Date Joined', sortable: true, render: (u) => formatDate(u.created_at), csv: (u) => u.created_at },
    { key: 'suspended', label: 'Status', sortable: true, render: (u) => (u.suspended ? <AdminBadge tone="red">Suspended</AdminBadge> : <AdminBadge tone="green">Active</AdminBadge>), csv: (u) => (u.suspended ? 'Suspended' : 'Active') },
    { key: 'applicationsTracked', label: 'Applications Tracked', sortable: true },
    { key: 'callsReceived', label: 'Calls Received', sortable: true },
    { key: 'agentConnections', label: 'Agent Connections', sortable: true },
    { key: 'actions', label: 'Actions', render: (u) => <AdminThreeDotMenu options={menuFor(u)} /> },
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Job Seekers</div>
        </div>
        <div className="admin-search-input" style={{ width: 280 }}>
          <span className="icon">🔎</span>
          <input placeholder="Search by name or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="admin-tabs" style={{ marginBottom: 16 }}>
        {FILTER_TABS.map((t) => (
          <button key={t.key} className={`admin-tab ${filter === t.key ? 'active' : ''}`} onClick={() => setFilter(t.key)}>{t.label}</button>
        ))}
      </div>

      <AdminErrorBanner message={error} />

      <AdminTable columns={columns} rows={filtered} csvFilename="jobseekers.csv" emptyMessage="No job seekers match this filter." />

      {profileTarget && <ProfilePanel user={profileTarget} onClose={() => setProfileTarget(null)} onViewCalls={(u) => { setProfileTarget(null); setCallsTarget(u); }} />}
      {callsTarget && <CallHistoryPanel user={callsTarget} onClose={() => setCallsTarget(null)} />}
      {messageTarget && <MessageModal target={messageTarget} onClose={() => setMessageTarget(null)} onSent={() => setMessageTarget(null)} />}
      {changePlanTarget && (
        <ChangePlanModal
          target={changePlanTarget}
          onClose={() => setChangePlanTarget(null)}
          onChanged={() => { setChangePlanTarget(null); load(); }}
        />
      )}
      {confirmTarget && (
        <AdminConfirmDialog
          title="Delete this job seeker?"
          message={`This permanently deletes ${confirmTarget.full_name}'s account. This cannot be undone.`}
          confirmLabel="Delete Account"
          danger
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => { const u = confirmTarget; setConfirmTarget(null); runAction(() => adminApi.deleteJobseeker(u.id)); }}
        />
      )}
    </div>
  );
}
