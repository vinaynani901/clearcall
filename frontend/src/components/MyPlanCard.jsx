import { useNavigate } from 'react-router-dom';
import { CheckTick } from './Icons';
import { usePlan } from '../context/PlanContext';

const JOBSEEKER_BENEFITS = ['Unlimited application tracking', 'Resume builder', 'Gmail sync'];

function formatDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Job seeker Settings "My Plan" section (Stage 1) — a highlighted card at
// the top of the screen so plan status is never buried. Two very different
// shapes on purpose: free plan sells the upgrade, premium plan confirms
// what's already unlocked and when it renews.
export function JobSeekerMyPlanCard() {
  const navigate = useNavigate();
  const { plan, loading } = usePlan();
  if (loading || !plan) return null;

  const isPremium = plan.plan === 'premium';

  return (
    <div className="card mb-16" style={{ border: '2px solid var(--navy)', background: isPremium ? 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(30,58,138,0.04))' : undefined }}>
      <div className="row-between" style={{ marginBottom: isPremium ? 14 : 10 }}>
        <div>
          <div className="muted xs bold">MY PLAN</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{plan.planLabel || (isPremium ? 'Premium' : 'Free')}</div>
        </div>
        {isPremium && <span className="badge badge-green" style={{ fontSize: 13, padding: '6px 14px' }}>Premium</span>}
      </div>

      {isPremium ? (
        <>
          <div className="muted small" style={{ marginBottom: 16 }}>
            {plan.nextBillingDate
              ? `Your next billing date is ${formatDate(plan.nextBillingDate)}.`
              : 'Your subscription is active. Billing details will appear here once payments are live.'}
          </div>
          <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => navigate('/pricing/jobseeker')}>Manage Subscription</button>
        </>
      ) : (
        <>
          <div className="stack" style={{ gap: 6, marginBottom: 16 }}>
            {JOBSEEKER_BENEFITS.map((b) => (
              <div key={b} className="row small" style={{ gap: 8 }}><CheckTick size={15} /> {b}</div>
            ))}
          </div>
          <button className="btn btn-green" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => navigate('/pricing/jobseeker')}>
            Upgrade to Premium — $9.99/month
          </button>
        </>
      )}
    </div>
  );
}

// Employer Settings "My Plan" section (Stage 2) — plan, price, a compact
// usage summary (verified calls this month, the metric every employer plan
// shares), and an Upgrade button unless already on Enterprise.
export function EmployerMyPlanCard() {
  const navigate = useNavigate();
  const { plan, loading } = usePlan();
  if (loading || !plan) return null;

  const calls = (plan.usage || []).find((u) => u.feature === 'verified_calls_monthly_limit');
  const isEnterprise = plan.plan === 'enterprise';

  return (
    <div className="card mb-16" style={{ border: '2px solid var(--navy)' }}>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div>
          <div className="muted xs bold">MY PLAN</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 2 }}>{plan.planLabel}</div>
          <div className="muted small" style={{ marginTop: 2 }}>
            {plan.price ? `$${plan.price} / month` : 'Free'}
          </div>
        </div>
        {isEnterprise && <span className="badge badge-green" style={{ fontSize: 13, padding: '6px 14px' }}>Enterprise</span>}
      </div>

      {calls && (
        <div style={{ marginBottom: 16 }}>
          <div className="row-between small" style={{ marginBottom: 6 }}>
            <span>Verified calls this month</span>
            <span className="bold">{calls.limit ? `${calls.used} of ${calls.limit}` : `${calls.used} used`}</span>
          </div>
          {calls.limit && (
            <div style={{ height: 7, background: 'var(--grey-200)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${Math.min(calls.percent || 0, 100)}%`, borderRadius: 999,
                background: calls.atLimit ? '#ef4444' : calls.warning ? '#f59e0b' : 'var(--green)',
              }} />
            </div>
          )}
        </div>
      )}

      {!isEnterprise && (
        <button className="btn btn-green" style={{ width: 'auto', padding: '10px 24px' }} onClick={() => navigate('/pricing')}>
          Upgrade Plan
        </button>
      )}
    </div>
  );
}
