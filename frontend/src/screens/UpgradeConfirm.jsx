import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import EmployerLayout from '../components/EmployerLayout';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { ErrorBanner } from '../components/Shared';
import { CheckTick } from '../components/Icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';

const EMPLOYER_UNLOCKS = {
  starter: ['Campaign manager', 'File upload up to 50 candidates', '3 custom tag sets', '3 work profiles', 'Results export', '2 job postings/month', '200 verified calls/month'],
  growth: ['Everything in Starter', 'File upload up to 500 candidates', '10 custom tag sets', '10 work profiles', 'Advance SMS to candidates', 'Agency pipeline', 'Up to 5 recruiter sub-accounts', 'Job seeker connection', '10 job postings/month', '500 verified calls/month'],
  enterprise: ['Everything in Growth', 'Unlimited verified calls', 'Unlimited everything', 'Priority support', 'SDK access'],
};

const JOBSEEKER_UNLOCKS = {
  premium: ['Unlimited tracked applications', 'Full call history', '5 resume uploads', '3 agent connections', '5 access keys', 'Resume builder', 'Gmail sync', 'Priority listings'],
};

export default function UpgradeConfirm() {
  const { plan: planKey } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { refresh } = usePlan();
  const isJobSeeker = location.state?.isJobSeeker ?? user?.role === 'jobseeker';

  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const load = isJobSeeker ? api.getJobseekerPricing : api.getEmployerPricing;
    load().then((d) => setPlans(d.plans || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [isJobSeeker]);

  const plan = plans.find((p) => p.key === planKey);
  const unlocks = (isJobSeeker ? JOBSEEKER_UNLOCKS : EMPLOYER_UNLOCKS)[planKey] || [];

  const proceed = async () => {
    setBusy(true);
    setError('');
    try {
      // Prepend role prefix to match Stripe PLANS keys (e.g. "premium" -> "jobseeker_premium")
      const fullPlanKey = (isJobSeeker ? 'jobseeker_' : 'employer_') + planKey;
      const data = await api.createCheckout(fullPlanKey, user.id, isJobSeeker ? 'jobseeker' : 'employer');
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const Layout = isJobSeeker ? JobSeekerLayout : EmployerLayout;
  const layoutProps = isJobSeeker ? { active: 'pricing' } : { active: 'pricing', wide: false };
  const homePath = isJobSeeker ? '/jobseeker/home' : '/employer/dashboard';
  const pricingPath = isJobSeeker ? '/pricing/jobseeker' : '/pricing';

  return (
    <Layout {...layoutProps}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        {loading ? (
          <div className="muted small center" style={{ padding: 40 }}>Loading…</div>
        ) : !plan ? (
          <ErrorBanner message="We couldn't find that plan." />
        ) : confirmed ? (
          <div className="card center" style={{ padding: 32 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(16,185,129,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <CheckTick size={26} />
            </div>
            <div className="bold" style={{ fontSize: 18, marginBottom: 8 }}>You're on the list for {plan.label}</div>
            <p className="muted small" style={{ lineHeight: 1.6, marginBottom: 20 }}>
              Your plan upgrade has been submitted. Once payment is confirmed you will have access to all {plan.label} features automatically.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate(homePath)}>Back to Dashboard</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 28 }}>
            <button className="link small" style={{ marginBottom: 16 }} onClick={() => navigate(pricingPath)}>← Back to Plans</button>
            <div className="muted xs bold">UPGRADING TO</div>
            <div style={{ fontSize: 24, fontWeight: 800, margin: '4px 0 2px' }}>{plan.label} Plan</div>
            <div className="muted small" style={{ marginBottom: 20 }}>${plan.price} / month</div>

            <div className="bold small" style={{ marginBottom: 10 }}>You'll unlock:</div>
            <div className="stack" style={{ gap: 8, marginBottom: 24 }}>
              {unlocks.map((u) => (
                <div key={u} className="row small" style={{ gap: 8 }}>
                  <CheckTick size={15} /> {u}
                </div>
              ))}
            </div>

            <ErrorBanner message={error} />

            <button className="btn btn-green" style={{ width: '100%' }} disabled={busy} onClick={proceed}>
              {busy ? (
                <span className="row" style={{ gap: 8, justifyContent: 'center' }}>
                  <span className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} />
                  Processing…
                </span>
              ) : (
                'Proceed to Payment'
              )}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}