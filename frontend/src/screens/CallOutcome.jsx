import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { ShieldCheck, PhoneIcon } from '../components/Icons';
import { OUTCOME_OPTIONS } from '../utils/outcomes';
import { api } from '../api/client';

// Shown right after a manually-placed (non-campaign) Make a Call ends —
// Part 3 of the "restore Make a Call" spec: "After the call the employer
// sees the call outcome screen where they can select the result." Campaign
// calls already have their own richer version of this (CampaignCallPanel's
// right-hand "Save and Next" panel, with tags + callback scheduling); this
// is the lightweight ad-hoc equivalent for calls placed straight from Make
// a Call, using the exact same OUTCOME_OPTIONS set for a consistent list
// across the whole app.
export default function CallOutcome() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const callId = state?.callId;
  const receiverName = state?.receiverName || 'this call';
  const jobRole = state?.jobRole || '';
  const callType = state?.callType || 'clearcall';
  const nudgeAfter = !!state?.nudgeAfter; // normal calls still get the "try ClearCall Verified next time" nudge

  const [outcome, setOutcome] = useState(null);
  const [note, setNote] = useState(state?.note || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const finish = () => {
    if (nudgeAfter) {
      navigate('/call/post-nudge', { state: { receiverName, jobRole } });
    } else {
      navigate('/success', {
        state: { message: `Outcome saved for your call with ${receiverName}.`, continueTo: '/employer/dashboard' },
      });
    }
  };

  const save = async () => {
    if (!outcome) {
      setError('Please select a call outcome.');
      return;
    }
    if (!callId) {
      finish();
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api.updateCallOutcome(callId, { outcome, note });
      finish();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const skip = () => finish();

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Call Outcome" />

        <div className="card mb-24">
          <div className="row" style={{ gap: 10 }}>
            {callType === 'clearcall' ? <ShieldCheck size={28} color="#10b981" /> : <PhoneIcon size={24} color="#64748b" />}
            <div>
              <div className="bold" style={{ fontSize: 16 }}>{receiverName}</div>
              {jobRole && <div className="muted small">{jobRole}</div>}
            </div>
          </div>
        </div>

        <ErrorBanner message={error} />

        <div className="muted xs bold mb-8">HOW DID THE CALL GO?</div>
        <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {OUTCOME_OPTIONS.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => { setOutcome(o.label); if (error) setError(''); }}
              className={`tag-chip ${outcome === o.label ? 'active-outcome' : ''}`}
            >
              {o.emoji} {o.label}
            </button>
          ))}
        </div>

        <div className="field">
          <label>Note</label>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any extra context for this call" />
        </div>

        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Save Outcome'}
        </button>
        <button className="btn btn-grey" style={{ marginTop: 10 }} onClick={skip} disabled={saving}>
          Skip for now
        </button>
      </div>
    </>
  );
}
