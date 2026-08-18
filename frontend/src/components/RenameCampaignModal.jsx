import { useState } from 'react';
import { ErrorBanner } from './Shared';

export default function RenameCampaignModal({ campaign, onClose, onRenamed }) {
  const [name, setName] = useState(campaign.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onRenamed(name.trim());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 380, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 12 }}>Rename Campaign</div>
        <ErrorBanner message={error} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Campaign name"
          autoFocus
          style={{ width: '100%', border: '2px solid var(--grey-200)', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 20 }}
        />
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-grey" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={!name.trim() || saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
