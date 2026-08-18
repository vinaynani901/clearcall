import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import FeatureLocked from '../components/FeatureLocked';
import { usePlan } from '../context/PlanContext';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

function StatCard({ label, value }) {
  return (
    <div className="card" style={{ flex: '1 1 160px', minWidth: 150 }}>
      <div className="muted xs" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  return status === 'active'
    ? <span className="badge badge-green">Active Now</span>
    : <span className="badge badge-grey-light">Offline</span>;
}

function RecruitersTab() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [recruiters, setRecruiters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [ownerOnly, setOwnerOnly] = useState(false);

  useEffect(() => {
    Promise.all([api.getPipelineSummary(), api.listPipelineRecruiters()])
      .then(([s, r]) => { setSummary(s); setRecruiters(r.recruiters || []); })
      .catch((err) => {
        if (err.status === 403 && /owner/i.test(err.message)) setOwnerOnly(true);
        else setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted small" style={{ padding: 20 }}>Loading pipeline…</div>;

  if (ownerOnly) {
    return (
      <div className="card center muted small" style={{ padding: 32 }}>
        Only the agency owner can view the combined recruiter pipeline. Your own calls and campaigns are on your regular Dashboard.
      </div>
    );
  }

  return (
    <>
      <ErrorBanner message={error} />
      <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Total Recruiters" value={summary?.totalRecruiters ?? 0} />
        <StatCard label="Active Today" value={summary?.activeToday ?? 0} />
        <StatCard label="Total Calls Today" value={summary?.totalCallsToday ?? 0} />
        <StatCard label="Interviews Booked Today" value={summary?.totalInterviewsToday ?? 0} />
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: 12 }}>Recruiter</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Email</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Calls Today</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Answer Rate</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Interviews Booked</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Campaigns Active</th>
              <th style={{ textAlign: 'left', padding: 12 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {recruiters.map((r) => (
              <tr
                key={r.userId}
                onClick={() => navigate(`/employer/pipeline/recruiters/${r.userId}`)}
                style={{ cursor: 'pointer', borderTop: '1px solid var(--grey-200)' }}
              >
                <td style={{ padding: 12, fontWeight: 700 }}>{r.name}{r.role === 'owner' ? ' (Owner)' : ''}</td>
                <td style={{ padding: 12 }} className="muted small">{r.email}</td>
                <td style={{ padding: 12 }}>{r.callsToday}</td>
                <td style={{ padding: 12 }}>{r.answerRate}%</td>
                <td style={{ padding: 12 }}>{r.interviewsToday}</td>
                <td style={{ padding: 12 }}>{r.campaignsActive}</td>
                <td style={{ padding: 12 }}><StatusBadge status={r.status} /></td>
              </tr>
            ))}
            {recruiters.length === 0 && (
              <tr><td colSpan={7} className="muted small center" style={{ padding: 24 }}>No recruiters on the team yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ConnectedJobSeekersTab() {
  const navigate = useNavigate();
  const [jobSeekers, setJobSeekers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listConnectedJobSeekers()
      .then((d) => setJobSeekers(d.jobSeekers || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="muted small" style={{ padding: 20 }}>Loading connected job seekers…</div>;

  return (
    <>
      <ErrorBanner message={error} />
      {jobSeekers.length === 0 && (
        <div className="card center muted small" style={{ padding: 32 }}>
          No job seekers have shared an access key with your agency yet.
        </div>
      )}
      {jobSeekers.map((js) => (
        <div key={js.jobseekerId} className="card row-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div className="bold">{js.displayName}</div>
            <div className="muted small">{js.profileType} • Connected {formatDate(js.connectedAt)}</div>
            <div className="muted small">{js.applicationsSubmitted} application{js.applicationsSubmitted === 1 ? '' : 's'} submitted on their behalf</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={() => navigate(`/employer/pipeline/connected/${js.jobseekerId}/profile`)}>
              View Profile
            </button>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => navigate(`/employer/pipeline/connected/${js.jobseekerId}/apply`)}>
              Apply for Jobs
            </button>
          </div>
        </div>
      ))}
    </>
  );
}

export default function AgencyPipeline() {
  const navigate = useNavigate();
  const { loading: planLoading, isLocked } = usePlan();
  const [tab, setTab] = useState('recruiters');

  if (!planLoading && isLocked('agency_pipeline')) {
    return (
      <>
        <StatusBar />
        <div className="screen">
          <TopHeader title="Pipeline" onBack={() => navigate('/employer/dashboard')} />
          <FeatureLocked title="Agency Pipeline is locked" message="This feature requires the Growth plan or above." />
        </div>
        <EmployerBottomNav active="dashboard" />
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Agency Pipeline" onBack={() => navigate('/employer/dashboard')} />

        <div className="row" style={{ gap: 8, marginBottom: 18 }}>
          <button className={`btn btn-sm ${tab === 'recruiters' ? 'btn-primary' : 'btn-grey'}`} style={{ width: 'auto' }} onClick={() => setTab('recruiters')}>
            Recruiters
          </button>
          <button className={`btn btn-sm ${tab === 'connected' ? 'btn-primary' : 'btn-grey'}`} style={{ width: 'auto' }} onClick={() => setTab('connected')}>
            Connected Job Seekers
          </button>
        </div>

        {tab === 'recruiters' ? <RecruitersTab /> : <ConnectedJobSeekersTab />}
      </div>
      <EmployerBottomNav active="dashboard" />
    </>
  );
}
