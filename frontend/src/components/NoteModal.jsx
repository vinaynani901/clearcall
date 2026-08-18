import { useState } from 'react';
import { ErrorBanner } from './Shared';
import { api } from '../api/client';

// Shared "Add Note" modal used by the three-dot menu wherever a candidate
// row appears (dashboard queue/recent calls, campaign candidate list,
// call history). `candidate` needs { id, campaignId, name }.
export default function NoteModal({ candidate, onClose, onSaved }) {
  const [notes, setNotes] = useState(candidate.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateCampaignCandidate(candidate.campaignId, candidate.id, { notes });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 420, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>Add a note for {candidate.name}</div>
        <ErrorBanner message={error} />
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add context for the next call…"
          style={{ width: '100%', border: '2px solid var(--grey-200)', borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}
          autoFocus
        />
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-grey" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Note'}</button>
        </div>
      </div>
    </div>
  );
}
