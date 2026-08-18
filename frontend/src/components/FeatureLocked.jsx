import { useNavigate } from 'react-router-dom';
import { LockIcon } from './Icons';
import { usePlan } from '../context/PlanContext';

// Full-panel "locked feature" block — used in place of an entire screen's
// content (e.g. Campaign Manager for a free employer) rather than as a
// popup, since the person should still see the app shell/sidebar around it
// so they know exactly what they're missing and where they are.
export default function FeatureLocked({ title = 'This feature is locked', message, requiredPlanLabel }) {
  const navigate = useNavigate();
  const { pricingPath } = usePlan();

  return (
    <div className="card center" style={{ padding: '48px 32px', maxWidth: 480, margin: '40px auto' }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16, background: 'rgba(30,58,138,0.08)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px',
      }}>
        <LockIcon size={26} color="#1e3a8a" />
      </div>
      <div className="bold" style={{ fontSize: 18, marginBottom: 8 }}>{title}</div>
      <p className="muted small" style={{ margin: '0 0 24px', lineHeight: 1.6 }}>
        {message || `This feature requires the ${requiredPlanLabel || 'Starter'} plan or above.`}
      </p>
      <button className="btn btn-green" style={{ width: 'auto', padding: '10px 28px' }} onClick={() => navigate(pricingPath)}>
        Upgrade Now
      </button>
    </div>
  );
}
