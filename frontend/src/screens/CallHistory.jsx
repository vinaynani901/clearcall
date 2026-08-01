import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, JobSeekerBottomNav, EmployerBottomNav } from '../components/Shared';
import { PhoneIcon, ShieldCheck } from '../components/Icons';
import { api } from '../api/client';

export default function CallHistory({ role }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.callHistory(filter).then((d) => setCalls(d.calls || [])).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Call History</h1>

        <div className="pill-tabs">
          {[['all', 'All Calls'], ['clearcall', 'Verified Only'], ['normal', 'Normal Only']].map(([key, label]) => (
            <button key={key} className={`pill-tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : calls.length === 0 ? (
          <div className="card muted small">No calls to show yet.</div>
        ) : (
          <div className="stack">
            {calls.map((c) => (
              <div key={c.id} className="card">
                <div className="row-between mb-8">
                  <div
                    className="row"
                    style={{ cursor: c.call_type === 'clearcall' ? 'pointer' : 'default' }}
                    onClick={() => c.call_type === 'clearcall' && c.company_id && navigate(`/company/${c.company_id}`)}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grey-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {c.call_type === 'clearcall' ? <ShieldCheck size={22} color="#1e3a8a" /> : <PhoneIcon size={20} />}
                    </div>
                    <div>
                      <div className="bold small">{c.company_name || c.receiver_phone || c.receiver_name}</div>
                      {c.job_role && <div className="muted xs">{c.job_role}</div>}
                    </div>
                  </div>
                  <span className={`badge ${c.call_type === 'clearcall' ? 'badge-green' : 'badge-grey'}`}>
                    {c.call_type === 'clearcall' ? <><ShieldCheck size={12} color="#059669" /> ClearCall Verified</> : <><PhoneIcon size={11} /> Normal Call</>}
                  </span>
                </div>
                <div className="row-between xs muted">
                  <span>{new Date(c.created_at).toLocaleString()}</span>
                  <span>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : c.call_status}</span>
                </div>
                {c.call_type === 'normal' && (
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() => navigate('/report', { state: { callId: c.id, reportedPhone: c.receiver_phone } })}
                  >
                    Report
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {role === 'employer' ? <EmployerBottomNav active="calls" /> : <JobSeekerBottomNav active="calls" />}
    </>
  );
}
