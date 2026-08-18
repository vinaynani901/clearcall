import { useLocation, useNavigate } from 'react-router-dom';
import { WarningTriangle } from '../components/Icons';

export default function IncomingUnverifiedCall() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const phone = state?.phone || '+61 400 999 888';

  return (
    <div className="fullscreen-fixed" style={{ background: 'var(--white)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--red)', padding: '18px 20px', textAlign: 'center', color: 'white' }}>
        <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
          <WarningTriangle size={22} color="#ffffff" />
          <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: 0.4 }}>WARNING — UNVERIFIED CALLER</span>
        </div>
      </div>

      <div className="screen-centered" style={{ flex: 1, padding: '40px 24px' }}>
        <div style={{ fontWeight: 800, fontSize: 22, marginBottom: 16, color: 'var(--grey-500)' }}>Unknown Caller</div>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 320, textAlign: 'center' }}>
          This caller is not verified on ClearCall. Their identity has not been confirmed. Proceed with caution.
        </p>
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
            className="btn btn-grey"
            style={{ borderRadius: 999, padding: '18px' }}
            onClick={() => navigate('/success', { state: { message: 'Call answered. Stay alert for scam warning signs.', continueTo: '/jobseeker/home' } })}
          >
            Answer Anyway
          </button>
        </div>
      </div>
      <div className="center xs muted" style={{ padding: '0 16px 8px' }}>
        If this feels suspicious, decline and report it.
      </div>
      <div style={{ padding: '0 24px calc(16px + env(safe-area-inset-bottom))' }}>
        <button
          className="btn btn-outline"
          style={{ borderRadius: 999, color: 'var(--red)', borderColor: 'var(--red)' }}
          onClick={() => navigate('/report', { state: { reportedPhone: phone } })}
        >
          Report This Call
        </button>
      </div>
    </div>
  );
}
