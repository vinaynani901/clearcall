import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

const STATUS_META = {
  awaiting: { label: 'Awaiting Response', className: 'badge-blue' },
  interview: { label: 'Interview', className: 'badge-amber' },
  offer: { label: 'Offer', className: 'badge-green' },
  rejected: { label: 'Rejected', className: 'badge-red' },
  withdrawn: { label: 'Withdrawn', className: 'badge-grey' },
};

export default function JobPostingApplicants() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getJobPostingApplications(id)
      .then((d) => setApplications(d.applications || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Applications" onBack={() => navigate('/employer/job-postings')} />
        <ErrorBanner message={error} />

        {loading && <div className="muted small" style={{ padding: 20 }}>Loading…</div>}

        {!loading && applications.length === 0 && (
          <div className="card center muted small" style={{ padding: 32 }}>No applications received yet.</div>
        )}

        {applications.map((a) => {
          const meta = STATUS_META[a.status] || STATUS_META.awaiting;
          return (
            <div key={a.id} className="card row-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="bold">{a.applicantName}</div>
                <div className="muted small">{a.applicantEmail}{a.applicantPhone ? ` · ${a.applicantPhone}` : ''}</div>
                <div className="muted xs">Applied {formatDate(a.appliedAt)}{a.source === 'agent' ? ' · via placement agent' : ''}</div>
              </div>
              <span className={`badge ${meta.className}`}>{meta.label}</span>
            </div>
          );
        })}
      </div>
      <EmployerBottomNav active="settings" />
    </>
  );
}
