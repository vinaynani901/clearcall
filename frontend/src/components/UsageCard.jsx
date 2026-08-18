import { useNavigate } from 'react-router-dom';
import { usePlan } from '../context/PlanContext';

// Employer dashboard "usage vs plan limits" card — one progress row per
// metered feature (verified calls, campaigns, candidates uploaded, job
// postings), each turning orange at 80% and red once the limit is hit.
// Job seekers get their own compact version further down this file.
function Row({ label, used, limit, percent, warning, atLimit }) {
  const unlimited = limit === null || limit === undefined || limit === 'unlimited' || limit === Infinity;
  const barColor = atLimit ? '#ef4444' : warning ? '#f59e0b' : 'var(--green)';
  return (
    <div style={{ marginBottom: 14 }}>
      <div className="row-between small" style={{ marginBottom: 6 }}>
        <span>{label}</span>
        <span className="bold">{unlimited ? `${used} used` : `${used} of ${limit}`}</span>
      </div>
      {!unlimited && (
        <div style={{ height: 7, background: 'var(--grey-200)', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(percent || 0, 100)}%`, background: barColor, borderRadius: 999 }} />
        </div>
      )}
    </div>
  );
}

// Dashboard-top banner — shown only for the Free plan once verified calls
// have hit the monthly limit, since Free is the one plan that still hard
// blocks (see checkVerifiedCallLimit in services/featureFlags.js). Paid
// plans never block — they switch to overage billing instead, surfaced in
// the Usage card below rather than a blocking banner here.
export function VerifiedCallsLimitBanner() {
  const navigate = useNavigate();
  const { plan, pricingPath } = usePlan();
  if (!plan || plan.entityType !== 'company' || plan.plan !== 'free') return null;
  const metric = plan.billing?.calls;
  if (!metric || !metric.atLimit) return null;

  const message = `You have used all ${metric.limit} free verified calls this month. Upgrade to continue making verified calls.`;

  return (
    <div className="row-between" style={{
      background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
      borderRadius: 12, padding: '14px 16px', marginBottom: 16, flexWrap: 'wrap', gap: 12,
    }}>
      <span className="small bold" style={{ color: '#b91c1c' }}>{message}</span>
      <button className="btn btn-green btn-sm" style={{ width: 'auto' }} onClick={() => navigate(pricingPath)}>Upgrade Now</button>
    </div>
  );
}

export default function UsageCard() {
  const navigate = useNavigate();
  const { plan, pricingPath } = usePlan();

  if (!plan || plan.entityType !== 'company') return null;
  const billing = plan.billing;

  // Every other metered metric (campaigns, candidates uploaded, job
  // postings) still comes from plan.usage as before — verified calls is
  // pulled out and shown separately below because it's the one metric with
  // real overage billing (Part 3/4): past its included limit it keeps
  // counting up instead of freezing at 100%, and shows a charge instead of
  // just "limit reached".
  const otherUsage = (plan.usage || []).filter((u) => u.feature !== 'verified_calls_monthly_limit');

  const callsWarning = billing?.calls?.warning;
  const callsAtLimit = billing?.calls?.atLimit;
  const teamWarning = billing?.team?.warning;
  const teamAtLimit = billing?.team?.atLimit;
  const otherWarning = otherUsage.some((u) => u.warning || u.atLimit);
  const anyWarning = callsWarning || callsAtLimit || teamWarning || teamAtLimit || otherWarning;
  const anyAtLimit = callsAtLimit || teamAtLimit || otherUsage.some((u) => u.atLimit);

  return (
    <div className="card mb-16">
      <div className="row-between mb-12">
        <span className="bold small">Plan Usage — {plan.plan?.[0]?.toUpperCase()}{plan.plan?.slice(1)} Plan</span>
        {anyWarning && (
          <span className={`badge ${anyAtLimit ? 'badge-red' : 'badge-amber'} xs`}>
            {anyAtLimit ? 'Limit reached' : 'Approaching limit'}
          </span>
        )}
      </div>

      {billing && (
        <>
          <Row label="Verified Calls" used={billing.calls.used} limit={billing.calls.limit} percent={billing.calls.percent} warning={callsWarning} atLimit={callsAtLimit} />
          {callsAtLimit && billing.calls.extraCallPrice > 0 && (
            <p className="small" style={{ color: '#b91c1c', marginTop: -8, marginBottom: 14 }}>
              Additional calls are being charged at the extra call rate for your plan (${billing.calls.extraCallPrice.toFixed(2)}/call). {billing.calls.overageCount} extra call{billing.calls.overageCount === 1 ? '' : 's'} so far — ${billing.calls.overageCharge.toFixed(2)}.
            </p>
          )}

          <Row label="Team Members" used={billing.team.used} limit={billing.team.limit} percent={billing.team.percent} warning={teamWarning} atLimit={teamAtLimit} />
          {teamAtLimit && billing.team.extraMemberPrice > 0 && billing.team.extraCount > 0 && (
            <p className="small" style={{ color: '#b91c1c', marginTop: -8, marginBottom: 14 }}>
              {billing.team.extraCount} extra member{billing.team.extraCount === 1 ? '' : 's'} being charged at ${billing.team.extraMemberPrice.toFixed(2)}/member/month — ${billing.team.extraCharge.toFixed(2)}.
            </p>
          )}

          {billing.estimatedExtraCharge > 0 && (
            <div className="row-between small" style={{ marginBottom: 14, padding: '8px 10px', background: 'var(--grey-100)', borderRadius: 8 }}>
              <span>Estimated extra charges this month</span>
              <span className="bold">${billing.estimatedExtraCharge.toFixed(2)}</span>
            </div>
          )}
        </>
      )}

      {otherUsage.map((u) => (
        <Row key={u.key} label={u.label} used={u.used} limit={u.limit} percent={u.percent} warning={u.warning} atLimit={u.atLimit} />
      ))}

      {anyWarning && (
        <button className="btn btn-green btn-sm" style={{ width: '100%', marginTop: 4 }} onClick={() => navigate(pricingPath)}>
          Upgrade Now
        </button>
      )}
    </div>
  );
}
