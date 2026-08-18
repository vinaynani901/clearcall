import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { formatDate, formatDateTime } from '../utils/date';

const CALL_STATUS_META = {
  answered: { label: 'Answered', className: 'badge-green' },
  declined: { label: 'Declined', className: 'badge-red' },
  missed: { label: 'Missed', className: 'badge-grey' },
  initiated: { label: 'In Progress', className: 'badge-blue' },
};

export default function RecruiterDetail() {
  const navigate = useNavigate();
  const { userId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getPipelineRecruiterDetail(userId)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title={data?.recruiter?.name || 'Recruiter'} onBack={() => navigate('/employer/pipeline')} />
        <ErrorBanner message={error} />

        {loading && <div className="muted small" style={{ padding: 20 }}>Loading…</div>}

        {data && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="bold" style={{ fontSize: 16 }}>{data.recruiter.name}</div>
              <div className="muted small">{data.recruiter.email}</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <span className={`badge ${data.recruiter.role === 'owner' ? 'badge-blue' : 'badge-grey-light'}`}>
                  {data.recruiter.role === 'owner' ? 'Agency Owner' : 'Recruiter'}
                </span>
                {data.recruiter.deactivated && <span className="badge badge-red">Deactivated</span>}
              </div>
            </div>

            <div className="bold small" style={{ marginBottom: 8 }}>Campaign Activity</div>
            <div className="card" style={{ padding: 0, marginBottom: 20, overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 10 }}>Campaign</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((c) => (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--grey-200)' }}>
                      <td style={{ padding: 10 }}>{c.name}</td>
                      <td style={{ padding: 10 }} className="muted small">{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                  {data.campaigns.length === 0 && (
                    <tr><td colSpan={2} className="muted small center" style={{ padding: 18 }}>No campaigns yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bold small" style={{ marginBottom: 8 }}>Call History</div>
            <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: 10 }}>Candidate</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Status</th>
                    <th style={{ textAlign: 'left', padding: 10 }}>Called</th>
                  </tr>
                </thead>
                <tbody>
                  {data.calls.map((c) => {
                    const meta = CALL_STATUS_META[c.call_status] || CALL_STATUS_META.initiated;
                    return (
                      <tr key={c.id} style={{ borderTop: '1px solid var(--grey-200)' }}>
                        <td style={{ padding: 10 }}>{c.receiver_name || c.receiver_phone}</td>
                        <td style={{ padding: 10 }}><span className={`badge ${meta.className}`}>{meta.label}</span></td>
                        <td style={{ padding: 10 }} className="muted small">{formatDateTime(c.created_at)}</td>
                      </tr>
                    );
                  })}
                  {data.calls.length === 0 && (
                    <tr><td colSpan={3} className="muted small center" style={{ padding: 18 }}>No calls yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <EmployerBottomNav active="dashboard" />
    </>
  );
}
