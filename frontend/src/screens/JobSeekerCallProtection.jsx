import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { ShieldCheck, PhoneIcon } from '../components/Icons';
import { api } from '../api/client';
import { formatCallTimestamp } from '../utils/date';

const STEPS = [
  {
    title: 'Step 1',
    body: 'Employer verifies their ABN and work email on ClearCall.',
  },
  {
    title: 'Step 2',
    body: 'They make a verified call to you.',
  },
  {
    title: 'Step 3',
    body: 'You see their company name and role before answering.',
  },
];

export default function JobSeekerCallProtection() {
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.receivedCalls().then((d) => setCalls(d.calls || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const previewCall = () => {
    navigate('/call/incoming-verified', {
      state: {
        metadata: {
          companyName: 'Bright Schools Group',
          callerName: 'Alice Principal',
          designation: 'Principal',
          jobRole: 'Year 5 Teacher',
          hideNumber: true,
        },
        preview: true,
      },
    });
  };

  return (
    <JobSeekerLayout active="calls">
      <div className="card center" style={{ padding: 32, marginBottom: 24 }}>
        <ShieldCheck size={64} color="#10b981" />
        <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--green-dark)', marginTop: 14 }}>You Are Protected</div>
        <div className="muted small" style={{ marginTop: 6, maxWidth: 420 }}>
          Every verified employer call you receive through ClearCall shows you exactly who's calling and why — before you ever answer.
        </div>
        <button className="btn btn-outline btn-sm" style={{ width: 'auto', marginTop: 18 }} onClick={previewCall}>
          Preview Incoming Call Screen
        </button>
      </div>

      <div className="jsk-section-header">
        <h3>How Protection Works</h3>
      </div>
      <div className="jsk-jobs-grid mb-24">
        {STEPS.map((s) => (
          <div key={s.title} className="card">
            <div className="bold small" style={{ marginBottom: 6 }}>{s.title}</div>
            <div className="muted small" style={{ lineHeight: 1.5 }}>{s.body}</div>
          </div>
        ))}
      </div>

      <div className="jsk-section-header">
        <h3>Your Call History</h3>
      </div>
      {loading ? (
        <div className="card muted small">Loading…</div>
      ) : calls.length === 0 ? (
        <div className="card jsk-empty-state">
          <ShieldCheck size={36} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>
            No verified calls received yet. When verified employers call you through ClearCall you will see exactly who is calling before you answer.
          </div>
        </div>
      ) : (
        <div className="stack">
          {calls.map((c) => {
            const isVerified = c.call_type === 'clearcall';
            const duration = c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : null;
            return (
            <div
              key={c.id}
              className="card row-between"
              style={{ cursor: isVerified && c.company_id ? 'pointer' : 'default' }}
              onClick={() => isVerified && c.company_id && navigate(`/company/${c.company_id}`)}
            >
              <div className="row">
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grey-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {isVerified ? <ShieldCheck size={20} color="#1e3a8a" /> : <PhoneIcon size={18} />}
                </div>
                <div>
                  <div className="bold small">{isVerified ? (c.company_name || 'Unknown employer') : 'Unknown Caller'}</div>
                  <div className="muted xs">
                    {isVerified ? (c.job_role || 'Role not specified') : 'Unverified caller'} · {formatCallTimestamp(c.created_at)}
                    {duration ? ` · ${duration}` : ''}
                  </div>
                </div>
              </div>
              <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                <span className={`badge ${isVerified ? 'badge-green' : 'badge-grey'}`}>
                  {isVerified ? 'Verified' : 'Unverified'}
                </span>
                {c.call_type === 'normal' && (
                  <button className="link xs" onClick={() => navigate('/report', { state: { callId: c.id } })}>Report</button>
                )}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </JobSeekerLayout>
  );
}
