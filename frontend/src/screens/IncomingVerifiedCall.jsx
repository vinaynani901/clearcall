import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck } from '../components/Icons';

export default function IncomingVerifiedCall() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [revealed, setRevealed] = useState(false);

  // In production this metadata arrives via a real-time push from the
  // backend (see services/twilio.js buildCallMetadataPush) the instant
  // Twilio connects the call. Here we read it from navigation state,
  // which is how the call history / make-call flow hands it off.
  const meta = state?.metadata || {
    companyName: 'Bright Schools Group',
    callerName: 'Alice Principal',
    designation: 'Principal',
    jobRole: 'Year 5 Teacher',
    hideNumber: true,
    recruiterPhone: '0400 111 222',
  };

  return (
    <div className="fullscreen-fixed" style={{ background: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--green)', padding: '18px 20px', textAlign: 'center', color: 'white' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <ShieldCheck size={22} color="#ffffff" />
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.4 }}>VERIFIED EMPLOYER CALL</span>
        </div>
      </div>

      <div className="screen-centered" style={{ flex: 1, padding: '40px 24px' }}>
        <div style={{
          width: 84, height: 84, borderRadius: 20, background: 'var(--grey-100)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 32, fontWeight: 800, color: 'var(--navy)', marginBottom: 20,
        }}>
          {meta.companyName ? meta.companyName[0] : '?'}
        </div>

        <div style={{ fontWeight: 800, fontSize: 24, marginBottom: 8, lineHeight: 1.2 }}>{meta.companyName}</div>
        {meta.callerName && <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{meta.callerName}</div>}
        {meta.designation && <div style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 700, marginBottom: 10 }}>{meta.designation}</div>}
        {meta.jobRole && <div style={{ fontSize: 14, fontStyle: 'italic', color: 'var(--grey-500)' }}>Calling about: {meta.jobRole}</div>}

        {!meta.hideNumber && (
          <button
            className="link small"
            style={{ marginTop: 16 }}
            onClick={() => setRevealed((r) => !r)}
          >
            {revealed ? meta.recruiterPhone : 'Tap to reveal direct number'}
          </button>
        )}
      </div>

      <div style={{ padding: '0 24px 12px' }}>
        <div className="row" style={{ gap: 14 }}>
          <button
            className="btn btn-red"
            style={{ borderRadius: 999, padding: '18px' }}
            onClick={() => navigate(-1)}
          >
            Decline
          </button>
          <button
            className="btn btn-green"
            style={{ borderRadius: 999, padding: '18px' }}
            onClick={() => navigate('/success', { state: { message: `Call connected with ${meta.companyName}.`, continueTo: '/jobseeker/home' } })}
          >
            Answer
          </button>
        </div>
      </div>
      <div className="center xs muted" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
        This call is verified by ClearCall — ABN Confirmed
      </div>
    </div>
  );
}
