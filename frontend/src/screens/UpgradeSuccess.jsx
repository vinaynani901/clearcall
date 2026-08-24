import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';

export default function UpgradeSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { refresh } = usePlan();
  const [checking, setChecking] = useState(true);

  const isJobSeeker = user?.role === 'jobseeker';
  const homePath = isJobSeeker ? '/jobseeker/home' : '/employer/dashboard';

  useEffect(() => {
    // Refresh the plan to pick up the Stripe webhook update, then show
    // the success state regardless — the webhook may still be in-flight
    // but Stripe has confirmed the payment.
    refresh().catch(() => {}).finally(() => setChecking(false));
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#f8fafc' }}>
      <div className="card center" style={{ maxWidth: 420, width: '100%', padding: 40 }}>
        <div style={{
          width: 72, height: 72, borderRadius: '50%',
          background: 'rgba(16,185,129,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Payment Successful!</div>
        <div className="bold" style={{ fontSize: 16, color: '#10b981', marginBottom: 8 }}>Welcome to Premium</div>
        <p className="muted small" style={{ lineHeight: 1.6, marginBottom: 24 }}>
          {checking
            ? 'Confirming your plan upgrade…'
            : 'Your plan has been activated. You now have full access to all features included in your plan.'}
        </p>

        {checking && (
          <div className="center" style={{ marginBottom: 16 }}>
            <div className="spinner" style={{ width: 24, height: 24, borderWidth: 3 }} />
          </div>
        )}

        <button
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={checking}
          onClick={() => navigate(homePath)}
        >
          {checking ? 'Just a moment…' : 'Go to Dashboard'}
        </button>
      </div>
    </div>
  );
}