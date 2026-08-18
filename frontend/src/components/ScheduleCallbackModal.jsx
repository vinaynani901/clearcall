import { useState } from 'react';
import { ErrorBanner } from './Shared';

// Shared "when would you like to call back {name}?" date+time picker,
// reused by the three-dot menu's "Schedule Callback" action wherever it
// appears (dashboard queue rows, recent calls, call history).
export default function ScheduleCallbackModal({ name, onClose, onConfirm }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (!date || !time) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(new Date(`${date}T${time}`).toISOString());
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 380, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>When would you like to call back {name}?</div>
        <ErrorBanner message={error} />
        <div className="row" style={{ gap: 10, marginBottom: 20 }}>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ flex: 1, border: '2px solid var(--grey-200)', borderRadius: 10, padding: 10, fontSize: 14 }} />
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={{ flex: 1, border: '2px solid var(--grey-200)', borderRadius: 10, padding: 10, fontSize: 14 }} />
        </div>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-grey" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={confirm} disabled={!date || !time || saving}>
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
}
