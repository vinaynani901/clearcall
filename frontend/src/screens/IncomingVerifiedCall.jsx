import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from '../components/Icons';
import { api } from '../api/client';
import { parseServerDate } from '../utils/date';

export default function IncomingVerifiedCall() {
  const { state } = useLocation();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [appliedBanner, setAppliedBanner] = useState(null);

  // Metadata arrives one of two ways: as navigation state (in-app flows —
  // make-call preview, and the foreground push listener in App.jsx, which
  // navigates here directly while the tab is already open), or as URL query
  // params (a background/cold-start push notification click — the service
  // worker can only open a URL, not hand off route state, so sw.js encodes
  // every field into the link itself). Falls back to a demo preview when
  // neither is present (e.g. opening this route directly while testing).
  // This screen must NEVER show a phone number — hideNumber/recruiterPhone
  // are intentionally not read or rendered anywhere below.
  const fromQuery = searchParams.get('companyName') ? {
    companyName: searchParams.get('companyName'),
    callerName: searchParams.get('callerName') || null,
    designation: searchParams.get('designation') || null,
    jobRole: searchParams.get('jobRole') || null,
    companyLogoUrl: searchParams.get('companyLogoUrl') || null,
    appliedDaysAgo: searchParams.get('appliedDaysAgo') !== null ? Number(searchParams.get('appliedDaysAgo')) : null,
  } : null;

  const meta = state?.metadata || fromQuery || {
    companyName: 'Bright Schools Group',
    callerName: 'Alice Principal',
    designation: 'Principal',
    jobRole: 'Year 5 Teacher',
  };

  useEffect(() => {
    // The push payload (Stage 8) already carries appliedDaysAgo computed
    // server-side against the applications table — use it directly when
    // present instead of a redundant client-side lookup.
    if (meta.appliedDaysAgo !== undefined && meta.appliedDaysAgo !== null) {
      setAppliedBanner(`You applied for this role ${meta.appliedDaysAgo === 0 ? 'today' : `${meta.appliedDaysAgo} day${meta.appliedDaysAgo === 1 ? '' : 's'} ago`}`);
      return;
    }
    if (!meta.companyName) return;
    api.listApplications({ q: meta.companyName }).then((d) => {
      const match = (d.applications || []).find((a) => a.company_name.toLowerCase() === meta.companyName.toLowerCase());
      if (match) {
        const days = Math.floor((Date.now() - parseServerDate(match.date_applied).getTime()) / 86400000);
        setAppliedBanner(`You applied for this role ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta.companyName, meta.appliedDaysAgo]);

  return (
    // Full-viewport dark navy overlay — this is what makes the screen read
    // as an urgent incoming-call takeover on both mobile (the card fills
    // the width edge to edge) and desktop (the card floats centered over
    // the dimmed backdrop, like a real incoming-call modal).
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(10, 18, 41, 0.94)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
    }}>
      <div style={{
        width: '100%', maxWidth: 420, maxHeight: '100%', overflow: 'hidden', borderRadius: 20,
        background: 'var(--white)', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        <div style={{ background: 'var(--green)', padding: '18px 20px', textAlign: 'center', color: 'white', flexShrink: 0 }}>
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <ShieldCheck size={22} color="#ffffff" />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.4 }}>VERIFIED EMPLOYER CALL</span>
          </div>
        </div>

        <div className="screen-centered" style={{ flex: 1, padding: '36px 24px', overflowY: 'auto' }}>
          {meta.companyLogoUrl ? (
            <img
              src={meta.companyLogoUrl} alt=""
              style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', marginBottom: 20, border: '1px solid var(--grey-200)' }}
            />
          ) : (
            <div style={{
              width: 84, height: 84, borderRadius: '50%', background: 'var(--grey-100)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 32, fontWeight: 800, color: 'var(--navy)', marginBottom: 20,
            }}>
              {meta.companyName ? meta.companyName[0].toUpperCase() : '?'}
            </div>
          )}

          <div style={{ fontWeight: 800, fontSize: 24, marginBottom: 8, lineHeight: 1.2, textAlign: 'center' }}>{meta.companyName}</div>
          {meta.callerName && <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 4 }}>{meta.callerName}</div>}
          {meta.designation && <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--grey-500)', marginBottom: 10 }}>{meta.designation}</div>}
          {meta.jobRole && <div style={{ fontSize: 14, color: 'var(--navy)', fontWeight: 700, textAlign: 'center' }}>Calling about: {meta.jobRole}</div>}

          {appliedBanner && (
            <div className="badge badge-green" style={{ marginTop: 16 }}>{appliedBanner}</div>
          )}
        </div>

        <div style={{ padding: '0 24px 12px', flexShrink: 0 }}>
          <div className="row" style={{ gap: 14 }}>
            <button
              className="btn btn-red"
              style={{ borderRadius: 999, padding: '18px', fontSize: 16, fontWeight: 800 }}
              onClick={() => navigate(-1)}
            >
              Decline
            </button>
            <button
              className="btn btn-green"
              style={{ borderRadius: 999, padding: '18px', fontSize: 16, fontWeight: 800 }}
              onClick={() => navigate('/success', { state: { message: `Call connected with ${meta.companyName}.`, continueTo: '/jobseeker/home' } })}
            >
              Answer
            </button>
          </div>
        </div>
        <div className="center xs muted" style={{ padding: '0 16px calc(16px + env(safe-area-inset-bottom))', flexShrink: 0 }}>
          This call is verified by ClearCall — ABN Confirmed
        </div>
      </div>
    </div>
  );
}
