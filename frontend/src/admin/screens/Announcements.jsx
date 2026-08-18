import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminBadge, AdminModal, AdminConfirmDialog, AdminErrorBanner } from '../components/AdminUI';
import { formatDate } from '../../utils/date';

const AUDIENCE_LABEL = { all: 'Everyone', employer: 'Employers', jobseeker: 'Job Seekers', agent: 'Agents' };

function AnnouncementModal({ target, onClose, onSaved }) {
  const isEdit = !!target;
  const [form, setForm] = useState({
    title: target?.title || '',
    body: target?.body || '',
    audience: target?.audience || 'all',
    startDate: target?.start_date ? target.start_date.slice(0, 10) : '',
    endDate: target?.end_date ? target.end_date.slice(0, 10) : '',
    active: target ? !!target.active : true,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) { setError('Title and body are required.'); return; }
    setSaving(true);
    setError('');
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      audience: form.audience,
      startDate: form.startDate || null,
      endDate: form.endDate || null,
      active: form.active,
    };
    try {
      if (isEdit) await adminApi.updateAnnouncement(target.id, payload);
      else await adminApi.createAnnouncement(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminModal title={isEdit ? 'Edit Announcement' : 'New Announcement'} onClose={onClose}>
      <AdminErrorBanner message={error} />
      <div className="admin-field">
        <label>Title</label>
        <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
      </div>
      <div className="admin-field">
        <label>Body</label>
        <textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
      </div>
      <div className="admin-field">
        <label>Audience</label>
        <select value={form.audience} onChange={(e) => setForm((f) => ({ ...f, audience: e.target.value }))}>
          {Object.entries(AUDIENCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="admin-row" style={{ gap: 12 }}>
        <div className="admin-field" style={{ flex: 1 }}>
          <label>Start date (optional)</label>
          <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </div>
        <div className="admin-field" style={{ flex: 1 }}>
          <label>End date (optional)</label>
          <input type="date" value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </div>
      </div>
      <label className="admin-row" style={{ gap: 8, fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>
        <input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        Active (visible to its audience right now)
      </label>
      <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
        <button className="admin-btn admin-btn-outline" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="admin-btn admin-btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Announcement'}</button>
      </div>
    </AdminModal>
  );
}

export default function Announcements() {
  const [announcements, setAnnouncements] = useState([]);
  const [editTarget, setEditTarget] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.listAnnouncements().then((d) => setAnnouncements(d.announcements)).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const runAction = async (fn) => {
    setError('');
    try { await fn(); load(); } catch (err) { setError(err.message); }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Announcements</div>
          <div className="admin-page-subtitle">Shown as a dismissible banner to the selected audience inside the app.</div>
        </div>
        <button className="admin-btn admin-btn-primary" onClick={() => setShowNew(true)}>+ New Announcement</button>
      </div>

      <AdminErrorBanner message={error} />

      {announcements.length === 0 ? (
        <div className="admin-card admin-table-empty">No announcements yet. Create one to message your users in-app.</div>
      ) : (
        announcements.map((a) => (
          <div key={a.id} className="admin-vq-entry">
            <div className="admin-row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{a.title}</div>
                <div style={{ fontSize: 13, color: 'var(--a-grey-500)', marginTop: 4 }}>{a.body}</div>
              </div>
              <AdminBadge tone={a.active ? 'green' : 'grey'}>{a.active ? 'Active' : 'Inactive'}</AdminBadge>
            </div>
            <div style={{ marginTop: 12 }}>
              <div className="admin-detail-row"><span className="label">Audience</span><span className="value">{AUDIENCE_LABEL[a.audience] || a.audience}</span></div>
              <div className="admin-detail-row"><span className="label">Window</span><span className="value">{a.start_date ? formatDate(a.start_date) : 'No start'} — {a.end_date ? formatDate(a.end_date) : 'No end'}</span></div>
              <div className="admin-detail-row"><span className="label">Created</span><span className="value">{formatDate(a.created_at)}</span></div>
            </div>
            <div className="admin-row" style={{ gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setEditTarget(a)}>Edit</button>
              <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => runAction(() => adminApi.toggleAnnouncement(a.id))}>{a.active ? 'Deactivate' : 'Activate'}</button>
              <button className="admin-btn admin-btn-danger admin-btn-sm" onClick={() => setConfirmTarget(a)}>Delete</button>
            </div>
          </div>
        ))
      )}

      {(showNew || editTarget) && (
        <AnnouncementModal
          target={editTarget}
          onClose={() => { setShowNew(false); setEditTarget(null); }}
          onSaved={() => { setShowNew(false); setEditTarget(null); load(); }}
        />
      )}

      {confirmTarget && (
        <AdminConfirmDialog
          title="Delete this announcement?"
          message={`This permanently deletes "${confirmTarget.title}". This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onCancel={() => setConfirmTarget(null)}
          onConfirm={() => { const a = confirmTarget; setConfirmTarget(null); runAction(() => adminApi.deleteAnnouncement(a.id)); }}
        />
      )}
    </div>
  );
}
