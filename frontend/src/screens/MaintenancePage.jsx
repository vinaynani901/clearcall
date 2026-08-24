import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const BASE = '/api/admin';

async function fetchStatus() {
  try {
    const res = await fetch(`${BASE}/maintenance/status`);
    const data = await res.json();
    return data;
  } catch {
    return { maintenanceMode: true, message: 'Could not reach the server. Please try again.', estimatedEndTime: '' };
  }
}

export default function MaintenancePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState({ maintenanceMode: true, message: '', estimatedEndTime: '' });
  const [checking, setChecking] = useState(false);

  const check = async () => {
    setChecking(true);
    const s = await fetchStatus();
    setStatus(s);
    setChecking(false);
    if (!s.maintenanceMode) {
      window.location.href = '/';
    }
  };

  useEffect(() => {
    fetchStatus().then(setStatus);
    const t = setInterval(async () => {
      const s = await fetchStatus();
      setStatus(s);
      if (!s.maintenanceMode) {
        window.location.href = '/';
      }
    }, 30000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0d1526',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ marginBottom: 32 }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </div>
      <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 800, margin: '0 0 8px', textAlign: 'center' }}>We are under maintenance</h1>
      <p style={{ color: '#93a5d1', fontSize: 15, textAlign: 'center', maxWidth: 400, margin: '0 0 24px', lineHeight: 1.5 }}>
        {status.message || 'ClearCall is currently undergoing scheduled maintenance. We will be back shortly.'}
      </p>
      {status.estimatedEndTime && (
        <p style={{ color: '#60a5fa', fontSize: 14, textAlign: 'center', margin: '0 0 24px' }}>
          Estimated back online: {status.estimatedEndTime}
        </p>
      )}
      <button
        onClick={check}
        disabled={checking}
        style={{
          padding: '12px 32px',
          borderRadius: 8,
          border: '1.5px solid #3b82f6',
          background: 'transparent',
          color: '#3b82f6',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        {checking ? 'Checking…' : 'Retry'}
      </button>
      <p style={{ color: '#64748b', fontSize: 12, marginTop: 24 }}>Auto-retries every 30 seconds</p>
    </div>
  );
}