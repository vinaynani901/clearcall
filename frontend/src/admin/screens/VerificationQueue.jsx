import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminBadge, AdminModal, AdminErrorBanner } from '../components/AdminUI';
import { formatDate } from '../../utils/date';

function RejectModal({ entry, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    if (!reason.trim()) { setError('A rejection reason is required.'); return; }
    setSaving(true);
    setError('');
    try {
      await adminApi.rejectVerification(entry.id, reason.trim());
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`Reject ${entry.companyName}`} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Rejection reason (sent to the applicant by email)</label>
        <textarea rows={4} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. ABN could not be matched to the company name provided…" autoFocus />
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-btn admin-btn-danger" onClick={submit} disabled={saving}>{saving ? 'Sending…' : 'Reject & Send Email'}</button>
      </div>
    </AdminModal>
  );
}

function HoldModal({ entry, onClose, onDone }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await adminApi.holdVerification(entry.id, note.trim());
      onDone();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={`Hold ${entry.companyName}`} onClose={onClose}>
      <div className="admin-field">
        <label>Note (internal only)</label>
        <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Waiting on a clearer photo of ABN documentation…" autoFocus />
      </div>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-btn admin-btn-orange" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Hold with Note'}</button>
      </div>
    </AdminModal>
  );
}

export default function VerificationQueue() {
  const [queue, setQueue] = useState([]);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [holdTarget, setHoldTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.getVerificationQueue().then((d) => setQueue(d.queue)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const approve = async (entry) => {
    setError('');
    try { await adminApi.approveVerification(entry.id); load(); } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Verification Queue</div>
          <div className="admin-page-subtitle">{queue.length} compan{queue.length === 1 ? 'y' : 'ies'} waiting for review, oldest first.</div>
        </div>
      </div>

      <AdminErrorBanner message={error} />

      {queue.length === 0 ? (
        <div className="admin-card admin-table-empty">The verification queue is empty — nothing waiting for review.</div>
      ) : (
        queue.map((entry) => (
          <div key={entry.id} className="admin-vq-entry">
            <div className="admin-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>{entry.companyName}</div>
                <div style={{ fontSize: 13, color: 'var(--a-grey-500)', marginTop: 2 }}>ABN {entry.abn}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--a-grey-400)' }}>Applied {formatDate(entry.appliedAt)}</div>
            </div>

            <div className="admin-detail-row"><span className="label">ABN Registration Date</span><span className="value">{entry.abnRegistrationDate ? formatDate(entry.abnRegistrationDate) : '—'}</span></div>
            <div className="admin-detail-row"><span className="label">ABN Age</span><span className="value">{entry.abnAgeMonths !== null ? `${entry.abnAgeMonths} month${entry.abnAgeMonths === 1 ? '' : 's'}` : '—'}</span></div>
            <div className="admin-detail-row"><span className="label">Work Email</span><span className="value">{entry.workEmail} {entry.workEmailVerified ? <AdminBadge tone="green">Confirmed</AdminBadge> : <AdminBadge tone="orange">Unconfirmed</AdminBadge>}</span></div>
            <div className="admin-detail-row"><span className="label">Domain Age</span><span className="value">Not available — no domain intelligence service connected</span></div>

            {entry.flags.length > 0 && (
              <div className="admin-vq-flags">
                {entry.flags.map((f) => <AdminBadge key={f} tone="yellow">{f}</AdminBadge>)}
              </div>
            )}

            <div className="admin-row" style={{ gap: 10, marginTop: 16 }}>
              <button className="admin-btn admin-btn-green" onClick={() => approve(entry)}>Approve</button>
              <button className="admin-btn admin-btn-danger" onClick={() => setRejectTarget(entry)}>Reject</button>
              <button className="admin-btn admin-btn-orange" onClick={() => setHoldTarget(entry)}>Hold</button>
            </div>
          </div>
        ))
      )}

      {rejectTarget && <RejectModal entry={rejectTarget} onClose={() => setRejectTarget(null)} onDone={() => { setRejectTarget(null); load(); }} />}
      {holdTarget && <HoldModal entry={holdTarget} onClose={() => setHoldTarget(null)} onDone={() => { setHoldTarget(null); load(); }} />}
    </div>
  );
}
