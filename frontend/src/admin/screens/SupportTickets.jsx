import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminClient';
import AdminTable from '../components/AdminTable';
import { AdminBadge, AdminSidePanel, AdminErrorBanner } from '../components/AdminUI';
import { formatDateTime } from '../../utils/date';

const STATUS_TABS = [
  { key: 'open_and_progress', label: 'Open' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];
const STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', closed: 'Closed' };
const PRIORITY_TONE = { urgent: 'red', high: 'red', normal: 'navy', low: 'grey' };
const ROLE_LABEL = { employer: 'Employer', jobseeker: 'Job Seeker', agent: 'Agent' };

function TicketPanel({ ticketId, onClose, onChanged }) {
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => adminApi.getSupportTicket(ticketId).then(setTicket).catch((err) => setError(err.message));
  useEffect(() => { load(); }, [ticketId]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setError('');
    try {
      await adminApi.replySupportTicket(ticketId, reply.trim());
      setReply('');
      load();
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (status) => {
    try { await adminApi.setSupportTicketStatus(ticketId, status); load(); onChanged(); } catch (err) { setError(err.message); }
  };
  const changePriority = async (priority) => {
    try { await adminApi.setSupportTicketPriority(ticketId, priority); load(); onChanged(); } catch (err) { setError(err.message); }
  };

  if (!ticket?.ticket) {
    return <AdminSidePanel title="Ticket" onClose={onClose} wide><AdminErrorBanner message={error} />Loading…</AdminSidePanel>;
  }
  const t = ticket.ticket;

  return (
    <AdminSidePanel title={t.subject} onClose={onClose} wide>
      <div className="admin-detail-section">
        <div className="admin-detail-row"><span className="label">From</span><span className="value">{t.userName} ({ROLE_LABEL[t.userRole] || t.userRole})</span></div>
        <div className="admin-detail-row"><span className="label">Email</span><span className="value">{t.userEmail}</span></div>
        <div className="admin-detail-row"><span className="label">Category</span><span className="value">{t.category}</span></div>
        <div className="admin-detail-row">
          <span className="label">Status</span>
          <select value={t.status} onChange={(e) => changeStatus(e.target.value)} style={{ width: 160 }}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="admin-detail-row">
          <span className="label">Priority</span>
          <select value={t.priority} onChange={(e) => changePriority(e.target.value)} style={{ width: 160 }}>
            {['low', 'normal', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      <div className="admin-detail-section">
        <div className="admin-detail-section-title">CONVERSATION</div>
        {(t.messages || []).map((m) => (
          <div key={m.id} className="admin-detail-row" style={{ display: 'block', padding: '10px 0' }}>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>{m.sender_type === 'admin' ? 'ClearCall Support (You)' : t.userName}</div>
            <div style={{ fontSize: 13, marginTop: 3 }}>{m.message}</div>
            <div style={{ fontSize: 11, color: 'var(--a-grey-400)', marginTop: 4 }}>{formatDateTime(m.created_at)}</div>
          </div>
        ))}
      </div>

      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Reply</label>
        <textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Write a reply — this is also emailed to the user…" />
      </div>
      <button className="admin-btn admin-btn-primary" disabled={sending || !reply.trim()} onClick={sendReply}>{sending ? 'Sending…' : 'Send Reply'}</button>
    </AdminSidePanel>
  );
}

export default function SupportTickets() {
  const [tickets, setTickets] = useState([]);
  const [tab, setTab] = useState('open_and_progress');
  const [search, setSearch] = useState('');
  const [panelId, setPanelId] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.listSupportTickets().then((d) => setTickets(d.tickets)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let list = tickets;
    if (tab === 'open_and_progress') list = list.filter((t) => t.status !== 'closed');
    else if (tab === 'closed') list = list.filter((t) => t.status === 'closed');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.subject.toLowerCase().includes(q) || t.userName.toLowerCase().includes(q) || t.userEmail.toLowerCase().includes(q));
    }
    return list;
  }, [tickets, tab, search]);

  const columns = [
    { key: 'subject', label: 'Subject', sortable: true },
    { key: 'userName', label: 'From', sortable: true, render: (t) => `${t.userName} (${ROLE_LABEL[t.userRole] || t.userRole})` },
    { key: 'category', label: 'Category', sortable: true },
    { key: 'priority', label: 'Priority', sortable: true, render: (t) => <AdminBadge tone={PRIORITY_TONE[t.priority] || 'grey'}>{t.priority}</AdminBadge> },
    { key: 'status', label: 'Status', sortable: true, render: (t) => <AdminBadge tone={t.status === 'closed' ? 'grey' : t.status === 'in_progress' ? 'navy' : 'green'}>{STATUS_LABEL[t.status]}</AdminBadge> },
    { key: 'messageCount', label: 'Messages', sortable: true },
    { key: 'updated_at', label: 'Last Updated', sortable: true, render: (t) => formatDateTime(t.updated_at), csv: (t) => t.updated_at },
    { key: 'actions', label: 'Actions', render: (t) => <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setPanelId(t.id)}>View / Reply</button> },
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Support Tickets</div>
        </div>
        <div className="admin-search-input" style={{ width: 280 }}>
          <span className="icon">🔎</span>
          <input placeholder="Search by subject or user…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <AdminErrorBanner message={error} />

      <div className="admin-tabs">
        {STATUS_TABS.map((t) => (
          <button key={t.key} className={`admin-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <AdminTable columns={columns} rows={filtered} csvFilename="support-tickets.csv" emptyMessage="No tickets in this view." />

      {panelId && <TicketPanel ticketId={panelId} onClose={() => setPanelId(null)} onChanged={load} />}
    </div>
  );
}
