import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Device } from '@twilio/voice-sdk';
import { StatusBar, TopHeader, ErrorBanner, EmployerBottomNav } from '../components/Shared';
import CallTypeSheet from '../components/CallTypeSheet';
import CampaignCallPanel from '../components/CampaignCallPanel';
import { ShieldCheck, MicIcon, HangUpIcon } from '../components/Icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = (totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// The 12 default outcome/tag labels double as the call_status enum's source
// data — map each to the DB's simpler call_status column so campaign rows
// stay queryable ("not_called" / "answered" / "no_answer" / "voicemail")
// while the richer label lives in outcome/tags.
function outcomeToCallStatus(outcome) {
  if (outcome === 'Not Answered') return 'no_answer';
  if (outcome === 'Went to Voicemail') return 'voicemail';
  if (outcome) return 'answered';
  return 'answered';
}

export default function MakeCall() {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useAuth();
  const prefill = location.state?.prefill;
  const campaignId = location.state?.campaignId || null;
  const candidateId = location.state?.candidateId || null;

  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState(() => ({
    receiverName: prefill?.receiverName || '',
    receiverPhone: prefill?.receiverPhone || '',
    jobRole: prefill?.jobRole || '',
    note: prefill?.note || '',
  }));
  const [showSheet, setShowSheet] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Active browser-call state (ClearCall Verified Call only)
  const [callPhase, setCallPhase] = useState(null); // null | connecting | ringing | in-call | ended
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const deviceRef = useRef(null);
  const activeCallRef = useRef(null);
  const timerRef = useRef(null);
  const callIdRef = useRef(null);

  // Campaign-call context — only populated when this screen was reached via
  // a candidate's "Call Now" button. Drives the two-column live notes panel.
  const [campaignCandidate, setCampaignCandidate] = useState(null);
  const [campaignTagOptions, setCampaignTagOptions] = useState([]);
  const [savingCampaign, setSavingCampaign] = useState(false);

  useEffect(() => {
    api.listWorkProfiles().then((d) => setProfiles(d.profiles || [])).catch(() => {});
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeCallRef.current) {
        try { activeCallRef.current.disconnect(); } catch { /* already gone */ }
      }
      if (deviceRef.current) {
        try { deviceRef.current.destroy(); } catch { /* already gone */ }
      }
    };
  }, []);

  useEffect(() => {
    if (!campaignId || !candidateId) return;
    api.getCampaign(campaignId).then((d) => {
      setCampaignTagOptions(d.campaign?.tags || []);
      for (const batch of d.batches || []) {
        const found = batch.candidates.find((c) => c.id === candidateId);
        if (found) { setCampaignCandidate(found); break; }
      }
    }).catch(() => {});
  }, [campaignId, candidateId]);

  const activeProfile = profiles.find((p) => p.is_active) || profiles[0];
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openSheet = (e) => {
    e.preventDefault();
    setError('');
    if (!form.receiverName || !form.receiverPhone || !form.jobRole) {
      setError('Please fill in the recipient name, phone number, and role.');
      return;
    }
    setShowSheet(true);
  };

  function startTimer() {
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  }

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function finishCall() {
    stopTimer();
    activeCallRef.current = null;
    setCallPhase('ended');
    // Campaign calls stay on this screen after hangup — the live notes
    // panel remains open so the recruiter can tag/note/pick an outcome
    // before "Save and Next" advances the queue. Ad-hoc calls behave as
    // before and drop straight to the success screen.
    if (campaignId && candidateId) return;
    // Ad-hoc (non-campaign) call — Part 3 of the "restore Make a Call"
    // spec: land on the Call Outcome screen so the employer can select the
    // result before moving on, rather than a plain "call ended" success page.
    navigate('/employer/call-outcome', {
      state: {
        callId: callIdRef.current,
        receiverName: form.receiverName,
        jobRole: form.jobRole,
        note: form.note,
        callType: 'clearcall',
      },
    });
  }

  async function handleSaveAndNext({ tags, notes, outcome, callbackAt }) {
    if (!campaignId || !candidateId) return;
    setSavingCampaign(true);
    setError('');
    try {
      await api.updateCampaignCandidate(campaignId, candidateId, {
        tags,
        notes,
        outcome,
        callStatus: outcomeToCallStatus(outcome),
        durationSeconds: seconds,
        callId: callIdRef.current,
        callbackAt: callbackAt || null,
      });

      const d = await api.getCampaign(campaignId);
      const todayIso = new Date().toISOString().slice(0, 10);
      const callableBatch = (d.batches || []).find((b) => b.call_date <= todayIso);
      const nextId = callableBatch?.candidates.find((c) => c.call_status === 'not_called')?.id;

      if (nextId) {
        navigate(`/employer/campaigns/${campaignId}`);
      } else {
        // This was the last candidate in today's queue — show the
        // end-of-day summary instead of the plain candidate list.
        navigate(`/employer/campaigns/${campaignId}/summary`, {
          state: { batchId: callableBatch?.id },
        });
      }
    } catch (err) {
      setError(err.message);
      setSavingCampaign(false);
    }
  }

  const handleCallType = async (type) => {
    setShowSheet(false);
    setError('');

    if (type !== 'clearcall') {
      setSubmitting(true);
      try {
        const { call } = await api.initiateCall({
          receiverPhone: form.receiverPhone,
          receiverName: form.receiverName,
          jobRole: form.jobRole,
          callType: type,
          note: form.note,
        });
        // Normal calls place no live in-browser audio connection, so the
        // outcome screen appears immediately — then, since this was a
        // Normal (unverified) Call, the existing "try ClearCall Verified
        // next time" nudge still follows afterwards.
        navigate('/employer/call-outcome', {
          state: {
            callId: call.id,
            receiverName: form.receiverName,
            jobRole: form.jobRole,
            note: form.note,
            callType: 'normal',
            nudgeAfter: true,
          },
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // ClearCall Verified Call — real browser call via Twilio Voice SDK.
    // The masked ClearCall number is always used as caller ID on Twilio's
    // side; nothing here ever sends the employer's own number or device.
    setSubmitting(true);
    setCallPhase('connecting');
    try {
      const { call } = await api.initiateCall({
        receiverPhone: form.receiverPhone,
        receiverName: form.receiverName,
        jobRole: form.jobRole,
        callType: type,
        note: form.note,
      });

      callIdRef.current = call.id;
      const { token } = await api.getVoiceToken();

      if (!deviceRef.current) {
        deviceRef.current = new Device(token, { logLevel: 'error' });
      } else {
        deviceRef.current.updateToken(token);
      }
      const device = deviceRef.current;
      if (device.state !== 'registered') {
        await device.register();
      }

      const twCall = await device.connect({
        params: { PhoneNumber: form.receiverPhone, CallId: call.id },
      });
      activeCallRef.current = twCall;

      twCall.on('ringing', () => setCallPhase('ringing'));
      twCall.on('accept', () => {
        setCallPhase('in-call');
        startTimer();
      });
      twCall.on('disconnect', finishCall);
      twCall.on('cancel', finishCall);
      twCall.on('reject', finishCall);
      twCall.on('error', (err) => {
        setError(err.message || 'The call could not be connected. Please try again.');
        stopTimer();
        activeCallRef.current = null;
        setCallPhase(null);
      });
    } catch (err) {
      setError(err.message || 'The call could not be started. Please check your connection and try again.');
      setCallPhase(null);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMute = () => {
    if (!activeCallRef.current) return;
    const next = !muted;
    activeCallRef.current.mute(next);
    setMuted(next);
  };

  const hangUp = () => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    } else {
      finishCall();
    }
  };

  if (callPhase && campaignId && candidateId && campaignCandidate) {
    return (
      <CampaignCallPanel
        candidate={campaignCandidate}
        tagOptions={campaignTagOptions}
        seconds={seconds}
        callPhase={callPhase}
        muted={muted}
        onToggleMute={toggleMute}
        onHangUp={hangUp}
        onSaveAndNext={handleSaveAndNext}
        saving={savingCampaign}
      />
    );
  }

  if (callPhase) {
    return (
      <div className="fullscreen-fixed" style={{ background: 'var(--navy)', display: 'flex', flexDirection: 'column', color: '#fff' }}>
        <div className="screen-centered" style={{ flex: 1, padding: '40px 24px' }}>
          <ShieldCheck size={48} color="#10b981" />
          <div className="muted xs bold" style={{ marginTop: 16, color: '#c7d2fe' }}>CLEARCALL VERIFIED CALL</div>
          <div style={{ fontWeight: 800, fontSize: 22, marginTop: 10 }}>{form.receiverName}</div>
          <div style={{ color: '#c7d2fe', fontSize: 14, marginTop: 4 }}>{form.jobRole}</div>
          <div style={{ marginTop: 28, fontSize: 16, fontWeight: 700, color: '#6ee7b7' }}>
            {callPhase === 'connecting' && 'Connecting…'}
            {callPhase === 'ringing' && 'Ringing…'}
            {callPhase === 'in-call' && formatTime(seconds)}
            {callPhase === 'ended' && 'Call ended'}
          </div>
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 32, paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>
          <button
            className="call-control-btn"
            onClick={toggleMute}
            disabled={callPhase !== 'in-call'}
            aria-label={muted ? 'Unmute' : 'Mute'}
            style={{ background: muted ? '#0f172a' : '#e2e8f0' }}
          >
            <MicIcon color={muted ? '#ffffff' : '#1e293b'} muted={muted} />
          </button>
          <button
            className="call-control-btn"
            onClick={hangUp}
            aria-label="Hang up"
            style={{ background: 'var(--red)' }}
          >
            <HangUpIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ paddingBottom: 90 }}>
        <TopHeader title="Make a Call" />

        <div className="pill-tabs" style={{ marginBottom: 16 }}>
          <button className="pill-tab active">New Call</button>
          <button className="pill-tab" onClick={() => navigate('/employer/calls')}>Call History</button>
        </div>

        <div className="card mb-24">
          <div className="row-between">
            <div>
              <div className="muted xs bold">ACTIVE WORK PROFILE</div>
              <div className="bold" style={{ fontSize: 15, marginTop: 2 }}>
                {activeProfile ? `${activeProfile.designation} · ${activeProfile.organisation}` : company?.name || 'No profile set'}
              </div>
            </div>
            <button className="link small" onClick={() => navigate('/employer/work-profiles')}>Switch Profile</button>
          </div>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={openSheet} className="stack">
          <div className="field">
            <label>Recipient name</label>
            <input required value={form.receiverName} onChange={update('receiverName')} placeholder="Jane Citizen" />
          </div>
          <div className="field">
            <label>Recipient phone number</label>
            <input required type="tel" value={form.receiverPhone} onChange={update('receiverPhone')} placeholder="0400 111 222" />
          </div>
          <div className="field">
            <label>Role you are calling about</label>
            <input required value={form.jobRole} onChange={update('jobRole')} placeholder="e.g. Year 5 Teacher, Registered Nurse, Site Supervisor, Software Developer" />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <textarea rows={3} value={form.note} onChange={update('note')} placeholder="Any extra context for this call" />
          </div>
          <button className="btn btn-primary" disabled={submitting}>{submitting ? 'Starting call...' : 'Call Now'}</button>
        </form>

        <div className="center" style={{ marginTop: 16 }}>
          <button className="link small" onClick={() => navigate('/employer/call-display-settings')}>
            Manage what is shown on every call
          </button>
        </div>
      </div>
      <EmployerBottomNav active="calls" />

      {showSheet && <CallTypeSheet onSelect={handleCallType} onClose={() => setShowSheet(false)} />}
    </>
  );
}
