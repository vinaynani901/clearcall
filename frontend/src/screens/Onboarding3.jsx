import { useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/Shared';
import { ShieldCheck } from '../components/Icons';

function Illustration() {
  return (
    <svg width="220" height="190" viewBox="0 0 220 190" fill="none">
      <circle cx="110" cy="95" r="70" fill="#f1f5f9" />
      <rect x="60" y="35" width="100" height="150" rx="18" fill="#0f172a" />
      <rect x="68" y="50" width="84" height="120" rx="6" fill="#f8fafc" />
      <rect x="76" y="58" width="68" height="20" rx="4" fill="#10b981" />
      <text x="82" y="72" fontSize="9" fill="white" fontWeight="700">VERIFIED CALL</text>
      <circle cx="110" cy="105" r="16" fill="#e2e8f0" />
      <rect x="86" y="128" width="48" height="6" rx="3" fill="#334155" />
      <rect x="92" y="140" width="36" height="5" rx="2.5" fill="#94a3b8" />
      <rect x="76" y="152" width="26" height="14" rx="7" fill="#10b981" />
      <rect x="118" y="152" width="26" height="14" rx="7" fill="#ef4444" />
    </svg>
  );
}

export default function Onboarding3() {
  const navigate = useNavigate();
  return (
    <>
      <StatusBar />
      <div className="screen" style={{ justifyContent: 'space-between' }}>
        <div className="row-between">
          <div style={{ width: 36 }} />
          <button className="link small" onClick={() => navigate('/signup')}>Skip</button>
        </div>

        <div className="screen-centered" style={{ flex: 1 }}>
          <Illustration />
          <h1 style={{ fontSize: 26, fontWeight: 800, marginTop: 28, marginBottom: 12, lineHeight: 1.25 }}>
            Know Who Is Calling Before You Answer
          </h1>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 340 }}>
            When a verified employer calls, you see their company name, logo and the role they're calling about —
            never just a number.
          </p>
        </div>

        <div>
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginBottom: 20 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                width: i === 3 ? 24 : 8, height: 8, borderRadius: 999,
                background: i === 3 ? 'var(--navy)' : 'var(--grey-200)',
              }} />
            ))}
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/signup')}>
            <ShieldCheck size={18} color="#ffffff" /> Get Started
          </button>
        </div>
      </div>
    </>
  );
}
