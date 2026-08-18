import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner, ConfirmDialog } from '../components/Shared';
import { TrashIcon } from '../components/Icons';
import { api } from '../api/client';

export default function TagSetsList() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = () => api.listTagTemplates().then((d) => setTemplates(d.templates || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteTagTemplate(pendingDelete.id);
      setTemplates((ts) => ts.filter((t) => t.id !== pendingDelete.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Custom Tag Sets" onBack={() => navigate('/settings')} />

        <ErrorBanner message={error} />

        <p className="muted small mb-24">
          Build your own set of quick-tap tags — like visa status or trade licences — to use during calls in a campaign.
        </p>

        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : templates.length === 0 ? (
          <div className="card muted small mb-24">You haven't saved any custom tag sets yet.</div>
        ) : (
          <div className="stack mb-24">
            {templates.map((t) => (
              <div key={t.id} className="card">
                <div className="row-between mb-8">
                  <div className="bold" style={{ fontSize: 15 }}>{t.name}</div>
                  <span className="badge badge-blue">{t.tags.length} tag{t.tags.length === 1 ? '' : 's'}</span>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <button className="btn btn-outline btn-sm" style={{ width: 'auto', flex: 1 }} onClick={() => navigate(`/employer/tag-sets/${t.id}/edit`)}>
                    Edit
                  </button>
                  <button
                    className="btn btn-sm"
                    style={{ width: 'auto', flex: 1, background: 'rgba(239,68,68,0.1)', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    onClick={() => setPendingDelete(t)}
                  >
                    <TrashIcon size={15} /> Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary" onClick={() => navigate('/employer/tag-sets/new')}>
          Create New Tag Set
        </button>
      </div>

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this tag set?"
          message={`Are you sure you want to delete "${pendingDelete.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </>
  );
}
