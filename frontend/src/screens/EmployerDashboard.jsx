import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, EmployerBottomNav } from '../components/Shared';
import { ShieldCheck } from '../components/Icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function EmployerDashboard() {
  const { company } = useAuth();
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.callHistory('all').then((d) => setCalls(d.calls || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1, paddingBottom: 12 }}>
        <div className="row mb-24">
          <div style={{ fontWeight: 800, fontSize: 20 }}>{company?.name || 'Your Company'}</div>
          {company?.suspension_status ? (
            <span className="badge badge-red">Suspended</span>
          ) : company?.under_review ? (
            <span className="badge badge-amber">Under Review</span>
          ) : company?.abn_verified ? (
            <span className="badge badge-green">Verified ✓</span>
          ) : (
            <span className="badge badge-grey">Pending Verification</span>
          )}
        </div>

        <button
          className="btn btn-primary mb-24"
          disabled={!company?.abn_verified || company?.suspension_status}
          onClick={() => navigate('/employer/make-call')}
        >
          <ShieldCheck size={20} /> Make a Verified Call
        </button>
        {!company?.abn_verified && (
          <div className="hint-text mb-16" style={{ marginTop: -16 }}>Complete ABN verification to unlock calling.</div>
        )}

        <div className="row-between mb-8">
          <h3 style={{ margin: 0, fontSize: 15 }}>Recent Calls</h3>
          <button className="link xs" onClick={() => navigate('/employer/calls')}>See all</button>
        </div>

        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : calls.length === 0 ? (
          <div className="card muted small">No calls made yet. Tap "Make a Verified Call" to get started.</div>
        ) : (
          <div className="stack">
            {calls.slice(0, 6).map((c) => (
              <div className="card row-between" key={c.id}>
                <div>
                  <div className="bold small">{c.receiver_name || c.receiver_phone}</div>
                  <div className="muted xs">{c.job_role || '—'} · {new Date(c.created_at).toLocaleDateString()}</div>
                </div>
                <span className={`badge ${c.call_type === 'clearcall' ? 'badge-green' : 'badge-grey'}`}>
                  {c.call_type === 'clearcall' ? 'Verified' : 'Normal'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
      <EmployerBottomNav active="dashboard" />
    </>
  );
}
