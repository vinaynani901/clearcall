import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/Shared';
import { ShieldCheck } from '../components/Icons';
import { api } from '../api/client';

export default function PostNormalCallNudge() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const receiverName = state?.receiverName || 'this candidate';
  const jobRole = state?.jobRole || '';

  const setAlwaysUseClearCall = async () => {
    await api.updateCallDisplaySettings({ defaultCallType: 'clearcall' });
    navigate('/employer/dashboard');
  };

  return (
    <>
      <StatusBar />
      <div className="screen screen-centered" style={{ flex: 1 }}>
        <div className="muted" style={{ opacity: 0.5, fontSize: 15, marginBottom: 24 }}>
          {receiverName} {jobRole && `· ${jobRole}`}
        </div>

        <ShieldCheck size={56} color="#1e3a8a" />
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 20, marginBottom: 8, lineHeight: 1.3 }}>
          Next time use a ClearCall Verified Call
        </div>
        <p className="muted small" style={{ marginBottom: 32, maxWidth: 300 }}>
          So candidates know exactly who is calling and answer with confidence.
        </p>

        <div className="stack" style={{ width: '100%' }}>
          <button className="btn btn-primary" onClick={setAlwaysUseClearCall}>Always Use ClearCall Verified</button>
          <button className="btn btn-grey" onClick={() => navigate('/employer/dashboard')}>Got It</button>
        </div>
        <div className="hint-text center" style={{ marginTop: 16 }}>You can change this in settings.</div>
      </div>
    </>
  );
}
