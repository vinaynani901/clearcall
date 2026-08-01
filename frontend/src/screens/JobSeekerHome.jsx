import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, JobSeekerBottomNav } from '../components/Shared';
import { ShieldCheck, PhoneIcon } from '../components/Icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function JobSeekerHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.callHistory('clearcall').then((d) => setCalls(d.calls || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const upcoming = calls.filter((c) => c.job_role && c.call_status === 'answered').slice(0, 3);

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1, paddingBottom: 12 }}>
        <div className="row-between mb-24">
          <div>
            <div className="muted small">Welcome back,</div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>{user?.full_name?.split(' ')[0] || 'there'}</div>
          </div>
          <ShieldCheck size={36} color="#1e3a8a" />
        </div>

        <div className="row-between mb-8">
          <h3 style={{ margin: 0, fontSize: 15 }}>Recent Verified Calls</h3>
          <button className="link xs" onClick={() => navigate('/jobseeker/calls')}>See all</button>
        </div>
        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : calls.length === 0 ? (
          <div className="card muted small">No verified calls yet. When a verified employer calls you, it will appear here.</div>
        ) : (
          <div className="stack mb-24">
            {calls.slice(0, 4).map((c) => (
              <div className="card row-between" key={c.id}>
                <div className="row">
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grey-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'var(--navy)' }}>
                    {c.company_name ? c.company_name[0] : '?'}
                  </div>
                  <div>
                    <div className="bold small">{c.company_name || 'Unknown company'}</div>
                    <div className="muted xs">{c.job_role || 'Role not specified'}</div>
                  </div>
                </div>
                <span className="badge badge-green">Verified</span>
              </div>
            ))}
          </div>
        )}

        <h3 style={{ marginBottom: 8, fontSize: 15 }}>Upcoming Interviews</h3>
        {upcoming.length === 0 ? (
          <div className="card muted small mb-24">No upcoming interviews scheduled.</div>
        ) : (
          <div className="stack mb-24">
            {upcoming.map((c) => (
              <div className="card" key={c.id}>
                <div className="bold small">{c.job_role}</div>
                <div className="muted xs">{c.company_name} · {new Date(c.created_at).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-outline mt-auto" onClick={() => navigate('/jobseeker/profile')}>Update My Profile</button>
      </div>
      <JobSeekerBottomNav active="home" />
    </>
  );
}
