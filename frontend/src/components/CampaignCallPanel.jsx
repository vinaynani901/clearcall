import { useState } from 'react';
import { ShieldCheck, MicIcon, HangUpIcon } from './Icons';
import { toAuLocal } from '../utils/phone';
import { resolveCandidateName } from '../utils/columnMapping';
import { OUTCOME_OPTIONS } from '../utils/outcomes';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

const MOBILE_COLLAPSED_FIELD_COUNT = 4;

/**
 * The two-column "candidate profile + live notes" screen shown while a
 * campaign call is connected (and after it ends, until the recruiter saves).
 * Left column is read-only reference; right column is where the recruiter
 * actually works. Two columns only on desktop/tablet (>=900px, driven by
 * the .campaign-call-panel CSS) — mobile stacks them, with the profile
 * collapsed to a few key fields behind "Show more".
 */
export default function CampaignCallPanel({
  candidate,
  tagOptions,
  seconds,
  callPhase,
  muted,
  onToggleMute,
  onHangUp,
  onSaveAndNext,
  saving,
}) {
  const [selectedTags, setSelectedTags] = useState([]);
  const [notes, setNotes] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [outcomeError, setOutcomeError] = useState('');
  const [showCallbackModal, setShowCallbackModal] = useState(false);
  const [callbackDate, setCallbackDate] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [showFullProfile, setShowFullProfile] = useState(false);

  const { name: displayName } = resolveCandidateName(candidate || {});
  const extraEntries = Object.entries(candidate?.extra_data || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const collapsedEntries = extraEntries.slice(0, MOBILE_COLLAPSED_FIELD_COUNT);
  const restEntries = extraEntries.slice(MOBILE_COLLAPSED_FIELD_COUNT);

  const toggleTag = (label) => {
    setSelectedTags((t) => (t.includes(label) ? t.filter((x) => x !== label) : [...t, label]));
  };

  const chooseOutcome = (label) => {
    setOutcome(label);
    if (outcomeError) setOutcomeError('');
  };

  // Step 3 — the actual database save. Called either directly (no callback
  // needed) or from the callback modal's Confirm/Skip actions.
  const performSave = (callbackAtIso) => {
    setShowCallbackModal(false);
    onSaveAndNext({ tags: selectedTags, notes, outcome, callbackAt: callbackAtIso });
  };

  // Step 1 — validate, then Step 2 — branch on Callback Requested.
  const handleSaveClick = () => {
    if (!outcome) {
      setOutcomeError('Please select a call outcome before saving.');
      return;
    }
    setOutcomeError('');
    if (outcome === 'Callback Requested') {
      setCallbackDate('');
      setCallbackTime('');
      setShowCallbackModal(true);
      return;
    }
    performSave(null);
  };

  const confirmCallback = () => {
    if (!callbackDate || !callbackTime) return;
    performSave(new Date(`${callbackDate}T${callbackTime}`).toISOString());
  };

  const skipCallback = () => performSave(null);

  return (
    <div className="screen" style={{ padding: '20px 20px 100px' }}>
      {/* Top bar — always visible regardless of column scrolling */}
      <div className="card mb-16" style={{ background: 'var(--navy)', color: '#fff' }}>
        <div className="row-between">
          <div className="row" style={{ gap: 10 }}>
            <ShieldCheck size={28} color="#10b981" />
            <div>
              <div className="bold" style={{ fontSize: 15 }}>{displayName}</div>
              <div style={{ fontSize: 12, color: '#c7d2fe' }}>
                {callPhase === 'in-call' ? formatTime(seconds) : callPhase === 'ended' ? 'Call ended' : callPhase}
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button
              className="call-control-btn"
              style={{ width: 44, height: 44, background: muted ? '#0f172a' : 'rgba(255,255,255,0.15)' }}
              onClick={onToggleMute}
              disabled={callPhase !== 'in-call'}
              aria-label={muted ? 'Unmute' : 'Mute'}
            >
              <MicIcon size={18} color="#ffffff" muted={muted} />
            </button>
            <button
              className="call-control-btn"
              style={{ width: 44, height: 44, background: 'var(--red)' }}
              onClick={onHangUp}
              aria-label="Hang up"
            >
              <HangUpIcon size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="campaign-call-panel">
        {/* Left column — read-only candidate reference */}
        <div className="campaign-call-left">
          <div className="card">
            <div className="bold" style={{ fontSize: 16, marginBottom: 2 }}>{displayName}</div>
            {candidate?.job_role && <div className="muted small mb-8">{candidate.job_role}</div>}
            <div className="row-between xs mb-8">
              <span className="muted">Phone</span>
              <span className="bold">{toAuLocal(candidate?.phone)}</span>
            </div>

            {collapsedEntries.map(([label, value]) => (
              <div className="row-between xs mb-8" key={label}>
                <span className="muted">{label}</span>
                <span className="bold" style={{ textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
              </div>
            ))}

            {restEntries.length > 0 && (
              <div className={showFullProfile ? '' : 'mobile-collapsed'}>
                {restEntries.map(([label, value]) => (
                  <div className="row-between xs mb-8" key={label}>
                    <span className="muted">{label}</span>
                    <span className="bold" style={{ textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            )}

            {restEntries.length > 0 && (
              <button className="link xs show-more-btn" onClick={() => setShowFullProfile((s) => !s)}>
                {showFullProfile ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        {/* Right column — where the recruiter actually works */}
        <div className="campaign-call-right">
          <div className="card mb-16">
            <div className="muted xs bold mb-8">QUICK TAGS</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {tagOptions.map((t) => (
                <button
                  key={t.label}
                  onClick={() => toggleTag(t.label)}
                  className={`tag-chip ${selectedTags.includes(t.label) ? 'active' : ''}`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card mb-16">
            <div className="muted xs bold mb-8">NOTES</div>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Visa expiry, salary expectation, preferred start date, anything relevant…"
              style={{ width: '100%', border: '2px solid var(--grey-200)', borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'inherit' }}
            />
          </div>

          <div className="card mb-16">
            <div className="muted xs bold mb-8">CALL OUTCOME</div>
            <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
              {OUTCOME_OPTIONS.map((t) => (
                <button
                  key={t.label}
                  onClick={() => chooseOutcome(t.label)}
                  className={`tag-chip ${outcome === t.label ? 'active-outcome' : ''}`}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          {outcomeError && (
            <div className="error-text center" style={{ marginBottom: 10 }}>{outcomeError}</div>
          )}

          <button className="btn btn-primary" onClick={handleSaveClick} disabled={saving}>
            {saving ? 'Saving…' : 'Save and Next'}
          </button>
        </div>
      </div>

      {showCallbackModal && (
        <div className="sheet-backdrop">
          <div className="sheet" style={{ borderRadius: 20, maxWidth: 380, margin: '0 auto' }}>
            <div className="bold" style={{ fontSize: 16, marginBottom: 16 }}>
              When would you like to call back {displayName}?
            </div>
            <div className="field">
              <label>Date</label>
              <input type="date" value={callbackDate} onChange={(e) => setCallbackDate(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Time</label>
              <input type="time" value={callbackTime} onChange={(e) => setCallbackTime(e.target.value)} />
            </div>
            <div className="row" style={{ gap: 10, marginTop: 20 }}>
              <button className="btn btn-grey" onClick={skipCallback} disabled={saving}>Skip</button>
              <button className="btn btn-primary" onClick={confirmCallback} disabled={!callbackDate || !callbackTime || saving}>
                {saving ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
