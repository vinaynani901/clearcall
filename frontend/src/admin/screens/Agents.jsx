import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminClient';
import AdminTable from '../components/AdminTable';
import AdminThreeDotMenu from '../components/AdminThreeDotMenu';
import { AdminBadge, AdminModal, AdminConfirmDialog, AdminErrorBanner } from '../components/AdminUI';
import { formatDate } from '../../utils/date';

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
      await adminApi.messageAgent(target.id, { subject: subject.trim(), message: message.trim() });
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminModal title={`Message ${target.agencyName}`} onClose={onClose}>
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

const FILTER_TABS = [
  { key: 'all', label: 'All Agents' },
  { key: 'verified', label: 'ABN Verified' },
  { key: 'unverified', label: 'Unverified' },
  { key: 'suspended', label: 'Suspended' },
];

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [messageTarget, setMessageTarget] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.listAgents().then((d) => setAgents(d.agents)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = agents;
    if (filter === 'verified') list = list.filter((a) => a.abnVerified);
    else if (filter === 'unverified') list = list.filter((a) => !a.abnVerified);
    else if (filter === 'suspended') list = list.filter((a) => a.suspended);
    if (!search.trim()) return list;
    const q = search.trim().toLowerCase();
    return list.filter((a) => a.agencyName.toLowerCase().includes(q) || a.email.toLowerCase().includes(q));
  }, [agents, filter, search]);

  const runAction = async (fn) => {
    setError('');
    try { await fn(); load(); } catch (err) { setError(err.message); }
  };

  const menuFor = (a) => [
    ...(!a.abnVerified ? [{ label: 'Approve / Verify ABN', onClick: () => runAction(() => adminApi.approveAgent(a.id)) }] : []),
    a.suspended
      ? { label: 'Unsuspend Account', onClick: () => runAction(() => adminApi.unsuspendAgent(a.id)) }
      : { label: 'Suspend Account', onClick: () => runAction(() => adminApi.suspendAgent(a.id)) },
    { label: 'Send Message', onClick: () => setMessageTarget(a) },
    { label: 'Delete Account', danger: true, onClick: () => setConfirmTarget(a) },
  ];

  const columns = [
    { key: 'agencyName', label: 'Agency Name', sortable: true },
    { key: 'fullName', label: 'Contact', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'planLabel', label: 'Plan', sortable: true },
    { key: 'abnVerified', label: 'ABN Verified', sortable: true, render: (a) => (a.abnVerified ? <AdminBadge tone="green">Yes</AdminBadge> : <AdminBadge tone="red">No</AdminBadge>), csv: (a) => (a.abnVerified ? 'Yes' : 'No') },
    { key: 'activeClients', label: 'Active Clients', sortable: true },
    { key: 'successfulPlacements', label: 'Placements', sortable: true },
    { key: 'suspended', label: 'Active', sortable: true, render: (a) => (a.suspended ? <AdminBadge tone="red">No</AdminBadge> : <AdminBadge tone="green">Yes</AdminBadge>), csv: (a) => (a.suspended ? 'No' : 'Yes') },
    { key: 'createdAt', label: 'Date Joined', sortable: true, render: (a) => formatDate(a.createdAt), csv: (a) => a.createdAt },
    { key: 'actions', label: 'Actions', render: (a) => <AdminThreeDotMenu options={menuFor(a)} /> },
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Agents</div>
          <div className="admin-page-subtitle">Recruitment agency accounts. Client management and placement tracking are still coming to the agent-facing app.</div>
        </div>
      </div>

      <div className="admin-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 4 }}>
        <div className="admin-tabs">
          {FILTER_TABS.map((t) => (
            <button key={t.key} className={`admin-tab ${filter === t.key ? 'active' : ''}`} onClick={() => setFilter(t.key)}>{t.label}</button>
          ))}
        </div>
        <div className="admin-search-input" style={{ width: 280 }}>
          <span className="icon">🔎</span>
          <input placeholder="Search by agency or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <AdminErrorBanner message={error} />

      <AdminTable columns={columns} rows={filtered} csvFilename="agents.csv" emptyMessage="No agents match your search." />

      {messageTarget && <MessageModal target={messageTarget} onClose={() => setMessageTarget(null)} onSent={() => { setMessageTarget(null); }} />}
      {confirmTarget && (
        <AdminConfirmDialog
          title="Delete this agent?"
          message={`This permanently deletes ${confirmTarget.agencyName}'s account. This cannot be undone.`}
          confirmLabel="Delete Account"
          danger
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => { const a = confirmTarget; setConfirmTarget(null); runAction(() => adminApi.deleteAgent(a.id)); }}
        />
      )}
    </div>
  );
}
