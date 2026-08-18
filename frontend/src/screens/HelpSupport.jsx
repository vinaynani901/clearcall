import { useEffect, useState } from 'react';
import { StatusBar, TopHeader, ErrorBanner, InfoBox } from '../components/Shared';
import { api } from '../api/client';
import { formatDateTime } from '../utils/date';

const FAQS = [
  { q: 'How does verification work?', a: 'Every employer must verify their Australian Business Number (ABN) against the government business register, and confirm their work email, before they can make any calls.' },
  { q: 'What if I receive an unverified call?', a: 'You will see a red warning screen instead of the usual verified screen. Proceed with caution, and decline and report it if anything feels suspicious.' },
  { q: 'How do I report a suspicious call?', a: 'Open Call History, find the call, and tap Report. Choose a reason and add any details — our team reviews every report.' },
  { q: 'Is my number private?', a: 'Yes. Job seekers never share a number to receive calls. Employers can hide their number by default in Call Display Settings — it stays hidden from receivers unless the employer chooses otherwise.' },
  { q: 'Can I use ClearCall for any profession?', a: 'Yes. ClearCall works for any organisation calling about a job or professional role — schools, hospitals, construction companies, government departments, and more.' },
  { q: 'How do I add a second work profile?', a: 'Go to Settings > My Work Profiles > Add Another Work Profile. Each profile needs its own ABN verification.' },
];

const CATEGORIES = [
  { value: 'general', label: 'General question' },
  { value: 'billing', label: 'Billing' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'account', label: 'Account' },
  { value: 'report_followup', label: 'Follow-up on a report' },
];

const STATUS_LABEL = { open: 'Open', in_progress: 'In Progress', closed: 'Closed' };

function TicketThread({ ticket, onUpdated }) {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const sendReply = async () => {
    if (!reply.trim()) return;
    setSending(true);
    setError('');
    try {
      const data = await api.replyTicket(ticket.id, reply.trim());
      setReply('');
      onUpdated(data.ticket);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card mb-8">
      <div className="row-between mb-8">
        <div className="bold small">{ticket.subject}</div>
        <span className={`badge ${ticket.status === 'closed' ? 'badge-grey' : ticket.status === 'in_progress' ? 'badge-blue' : 'badge-green'}`}>
          {STATUS_LABEL[ticket.status]}
        </span>
      </div>
      <div className="stack" style={{ gap: 8, marginBottom: 10 }}>
        {ticket.messages.map((m) => (
          <div key={m.id} style={{ background: m.sender_type === 'admin' ? 'var(--grey-100)' : 'transparent', padding: m.sender_type === 'admin' ? '8px 10px' : 0, borderRadius: 8 }}>
            <div className="muted xs bold">{m.sender_type === 'admin' ? 'ClearCall Support' : 'You'} · {formatDateTime(m.created_at)}</div>
            <div className="small" style={{ marginTop: 2 }}>{m.message}</div>
          </div>
        ))}
      </div>
      <ErrorBanner message={error} />
      <div className="field-with-btn">
        <div className="field" style={{ marginBottom: 0 }}>
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add a reply…" />
        </div>
        <button type="button" className="btn btn-outline btn-sm" style={{ width: 'auto' }} disabled={sending || !reply.trim()} onClick={sendReply}>
          {sending ? 'Sending…' : 'Reply'}
        </button>
      </div>
    </div>
  );
}

export default function HelpSupport() {
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState('');
  const [tickets, setTickets] = useState([]);
  const [ticketsLoaded, setTicketsLoaded] = useState(false);

  const loadTickets = () => api.listTickets().then((d) => { setTickets(d.tickets); setTicketsLoaded(true); }).catch(() => setTicketsLoaded(true));

  useEffect(() => { loadTickets(); }, []);

  const filtered = FAQS.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()));

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2000);
  };

  const submitTicket = async (e) => {
    e.preventDefault();
    setError('');
    if (!subject.trim() || !message.trim()) {
      setError('Subject and message are required.');
      return;
    }
    setLoading(true);
    try {
      await api.createTicket({ subject: subject.trim(), message: message.trim(), category });
      setSubject('');
      setMessage('');
      setCategory('general');
      setShowForm(false);
      showToast('Support ticket submitted');
      loadTickets();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const refreshOneTicket = (updated) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Help and Support" />

        <div className="field">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search FAQs…" />
        </div>

        <div className="stack mb-24">
          {filtered.map((f, i) => (
            <details key={i} className="card">
              <summary style={{ fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>{f.q}</summary>
              <p className="muted small" style={{ marginTop: 10, marginBottom: 0 }}>{f.a}</p>
            </details>
          ))}
        </div>

        {ticketsLoaded && tickets.length > 0 && (
          <div className="mb-24">
            <h3 style={{ fontSize: 15, marginBottom: 10 }}>Your Support Tickets</h3>
            {tickets.map((t) => (
              <TicketThread key={t.id} ticket={{ ...t, messages: t.messages || [] }} onUpdated={refreshOneTicket} />
            ))}
          </div>
        )}

        {showForm ? (
          <div className="card mb-24">
            <ErrorBanner message={error} />
            <form onSubmit={submitTicket} className="stack">
              <div className="field">
                <label>Subject</label>
                <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="What's this about?" />
              </div>
              <div className="field">
                <label>Category</label>
                <select value={category} onChange={(e) => setCategory(e.target.value)}>
                  {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Message</label>
                <textarea required rows={5} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Tell us what's going on…" />
              </div>
              <InfoBox>Our team reviews every ticket and replies here — you can keep replying in this thread.</InfoBox>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-outline" onClick={() => setShowForm(false)}>Cancel</button>
                <button className="btn btn-primary" disabled={loading} style={{ flex: 1 }}>{loading ? 'Submitting...' : 'Submit Ticket'}</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="stack">
            <button className="btn btn-outline" onClick={() => setShowForm(true)}>Contact Support</button>
            <button className="btn btn-grey" onClick={() => showToast('Live Chat — coming soon')}>Live Chat</button>
          </div>
        )}
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
