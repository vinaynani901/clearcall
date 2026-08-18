import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import EmployerLayout from '../components/EmployerLayout';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { CheckTick, CrossIcon } from '../components/Icons';
import { ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Human-readable rows for each plan card — order matches the spec's own
// listing per role. Values are pulled live from the plan's `limits` object
// (fed by the DB-backed plan_limits table, so admin edits show up here
// automatically without any change to this file).
// team_members_limit is deliberately first — the spec calls for team
// member count to be the first feature shown on every employer plan card.
const EMPLOYER_ROWS = [
  { key: 'team_members_limit', label: 'Team members', kind: 'count' },
  { key: 'verified_calls_monthly_limit', label: 'Verified calls per month', kind: 'count' },
  { key: 'campaign_manager', label: 'Campaign manager', kind: 'bool' },
  { key: 'file_upload_max_candidates', label: 'File upload (candidates)', kind: 'count' },
  { key: 'custom_tag_sets_limit', label: 'Custom tag sets', kind: 'count' },
  { key: 'work_profiles_limit', label: 'Work profiles', kind: 'count' },
  { key: 'advance_sms', label: 'Advance SMS to candidates', kind: 'bool' },
  { key: 'results_export', label: 'Results export', kind: 'bool' },
  { key: 'agency_pipeline', label: 'Agency pipeline', kind: 'bool' },
  { key: 'recruiter_sub_accounts_limit', label: 'Recruiter sub-accounts', kind: 'count' },
  { key: 'job_seeker_connection', label: 'Job seeker connection', kind: 'bool' },
  { key: 'job_postings_monthly_limit', label: 'Job postings per month', kind: 'count' },
  { key: 'priority_support', label: 'Priority support', kind: 'bool' },
  { key: 'sdk_access', label: 'SDK access', kind: 'bool' },
  { key: 'dedicated_account_manager', label: 'Dedicated account manager', kind: 'bool' },
];

const JOBSEEKER_ROWS = [
  { key: 'auto_apply_slots_per_day', label: 'Auto-apply slots per day', kind: 'count' },
  { key: 'applications_limit', label: 'Tracked applications', kind: 'count' },
  { key: 'call_history_limit', label: 'Call history', kind: 'count', callHistory: true },
  { key: 'resume_uploads_limit', label: 'Resume uploads', kind: 'count' },
  { key: 'agent_connections_limit', label: 'Agent connections', kind: 'count' },
  { key: 'access_keys_limit', label: 'Access keys', kind: 'count' },
  { key: 'resume_builder', label: 'Resume builder', kind: 'bool' },
  { key: 'gmail_sync', label: 'Gmail sync', kind: 'bool' },
  { key: 'priority_listings', label: 'Priority listings', kind: 'bool' },
  { key: 'ai_resume_tailoring', label: 'AI resume tailoring at apply time', kind: 'bool' },
  { key: 'instant_priority_apply', label: 'Instant priority apply', kind: 'bool' },
  { key: 'advanced_match_scoring', label: 'Advanced match scoring', kind: 'bool' },
];

function formatCell(value, row) {
  if (value === false) return <CrossIcon />;
  if (value === true) return <CheckTick />;
  if (value === 'unlimited') return <span className="small bold" style={{ color: 'var(--green-dark, #059669)' }}>Unlimited</span>;
  if (row.callHistory && typeof value === 'number') return <span className="small">Last {value} calls</span>;
  return <span className="small">{value}</span>;
}

function PlanCard({ plan, rows, isJobSeeker, onSelect, busy }) {
  const isContactUs = plan.price === null;
  return (
    <div
      className="card"
      style={{
        flex: '1 1 220px', minWidth: 220, position: 'relative',
        border: plan.isCurrent ? '2px solid var(--navy)' : '1px solid var(--grey-200)',
        padding: 24,
      }}
    >
      {plan.mostPopular && (
        <span className="badge badge-green xs" style={{ position: 'absolute', top: -12, left: 20 }}>Most Popular</span>
      )}
      <div className="bold" style={{ fontSize: 18 }}>{plan.label}</div>
      <div style={{ margin: '10px 0 18px' }}>
        {isContactUs ? (
          <span style={{ fontSize: 22, fontWeight: 800 }}>Custom Pricing</span>
        ) : (
          <>
            <span style={{ fontSize: 30, fontWeight: 800 }}>${plan.price}</span>
            <span className="muted small">{plan.price > 0 ? ' / month' : ''}</span>
          </>
        )}
      </div>
      <button
        className={plan.isCurrent ? 'btn btn-grey' : 'btn btn-primary'}
        style={{ width: '100%', marginBottom: 20 }}
        disabled={plan.isCurrent || busy}
        onClick={() => onSelect(plan)}
      >
        {plan.isCurrent ? 'Current Plan' : isContactUs ? 'Contact Us' : 'Get Started'}
      </button>
      <div className="stack" style={{ gap: 10 }}>
        {rows.map((row) => (
          <div key={row.key} className="row-between" style={{ gap: 8 }}>
            <span className="muted small">{row.label}</span>
            {formatCell(plan.limits[row.key], row)}
          </div>
        ))}
      </div>
      {!isJobSeeker && !isContactUs && (
        <div className="stack" style={{ gap: 4, marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--grey-200)' }}>
          <span className="muted xs">Need more members — add extras at $10 per member per month.</span>
          <span className="muted xs">Need more calls — extra calls from $0.05 to $0.10 each depending on plan.</span>
        </div>
      )}
    </div>
  );
}

function PricingBody({ isJobSeeker }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const load = isJobSeeker ? api.getJobseekerPricing : api.getEmployerPricing;
    load().then((d) => setPlans(d.plans || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [isJobSeeker]);

  const rows = isJobSeeker ? JOBSEEKER_ROWS : EMPLOYER_ROWS;
  const decorated = plans.map((p) => ({ ...p, mostPopular: !isJobSeeker && p.key === 'growth' }));

  const onSelect = (plan) => {
    if (plan.price === 0) {
      // Free plan has nothing to "select" — nothing to pay, nothing to
      // confirm. Just send them back to their dashboard.
      navigate(isJobSeeker ? '/jobseeker/home' : '/employer/dashboard');
      return;
    }
    if (plan.price === null) {
      // Enterprise Plus is Contact Us / custom-quote pricing — there's
      // nothing to "upgrade to" automatically, so this routes to the real
      // Help & Support screen rather than a fake sales-contact flow.
      navigate('/help');
      return;
    }
    navigate(`/upgrade/${plan.key}`, { state: { isJobSeeker } });
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <div className="center mb-24" style={{ maxWidth: 640, margin: '0 auto 32px' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>
          {isJobSeeker ? 'Get more from your job search' : 'Plans built for how you hire'}
        </h1>
        <p className="muted small">
          {isJobSeeker
            ? 'Unlock unlimited application tracking, resume building, and priority visibility with Premium.'
            : 'Start free, upgrade as your calling volume and team grow. No lock-in contracts.'}
        </p>
      </div>
      <ErrorBanner message={error} />
      {loading ? (
        <div className="muted small center" style={{ padding: 40 }}>Loading plans…</div>
      ) : (
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', alignItems: 'stretch', justifyContent: 'center' }}>
          {decorated.map((plan) => (
            <PlanCard key={plan.key} plan={plan} rows={rows} isJobSeeker={isJobSeeker} onSelect={onSelect} busy={busy} />
          ))}
        </div>
      )}
    </div>
  );
}

export function EmployerPricing() {
  return (
    <EmployerLayout active="pricing" wide>
      <PricingBody isJobSeeker={false} />
    </EmployerLayout>
  );
}

export function JobSeekerPricing() {
  return (
    <JobSeekerLayout active="pricing">
      <PricingBody isJobSeeker />
    </JobSeekerLayout>
  );
}
