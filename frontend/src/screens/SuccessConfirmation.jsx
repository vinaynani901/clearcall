import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/Shared';
import { CheckCircle } from '../components/Icons';

export default function SuccessConfirmation() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const message = state?.message || 'Done!';
  const continueTo = state?.continueTo || '/';

  return (
    <>
      <StatusBar />
      <div className="screen screen-centered" style={{ flex: 1 }}>
        <CheckCircle size={110} />
        <div style={{ fontWeight: 800, fontSize: 20, marginTop: 24, marginBottom: 32, lineHeight: 1.4, maxWidth: 320 }}>
          {message}
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(continueTo, { replace: true })}>
          Continue
        </button>
      </div>
    </>
  );
}
