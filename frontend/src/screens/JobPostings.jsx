import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner, ConfirmDialog } from '../components/Shared';
import FeatureLocked from '../components/FeatureLocked';
import { usePlan } from '../context/PlanContext';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

const EMPLOYMENT_TYPE_LABELS = { full_time: 'Full Time', part_time: 'Part Time', casual: 'Casual', contract: 'Contract' };

export default function JobPostings() {
  const navigate = useNavigate();
  const { loading: planLoading, isLocked, plan } = usePlan();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState('');

  const load = () => api.listMyJobPostings().then((d) => setJobs(d.jobs || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const showToast = (label) => { setToast(label); setTimeout(() => setToast(''), 2200); };

  const close = async (job) => {
    setBusyId(job.id);
    try {
      await api.closeJobPosting(job.id);
      await load();
      showToast('Job posting closed');
    } catch (err) { setError(err.message); } finally { setBusyId(null); }
  };

  const remove = async () => {
    if (!pendingDelete) return;
    setBusyId(pendingDelete.id);
    try {
      await api.deleteJobPosting(pendingDelete.id);
      setJobs((js) => js.filter((j) => j.id !== pendingDelete.id));
      showToast('Job posting deleted');
    } catch (err) { setError(err.message); } finally { setBusyId(null); setPendingDelete(null); }
  };

  if (!planLoading && isLocked('job_postings_monthly_limit')) {
    return (
      <>
        <StatusBar />
        <div className="screen">
          <TopHeader title="My Job Postings" onBack={() => navigate('/employer/dashboard')} />
          <FeatureLocked title="Job Postings are locked" message="This feature requires the Starter plan or above." />
        </div>
        <EmployerBottomNav active="settings" />
      </>
    );
  }

  const postingsLimit = plan?.usage?.find((u) => u.feature === 'job_postings_monthly_limit');

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="My Job Postings" onBack={() => navigate('/employer/dashboard')} />
        <ErrorBanner message={error} />

        <div className="row-between" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
          <div className="muted small">
            {postingsLimit ? `${postingsLimit.used} of ${postingsLimit.limit === null ? 'unlimited' : postingsLimit.limit} jobs posted this month` : ''}
          </div>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => navigate('/employer/job-postings/new')}>
            Post a Job
          </button>
        </div>

        {loading && <div className="muted small" style={{ padding: 20 }}>Loading…</div>}

        {!loading && jobs.length === 0 && (
          <div className="card center muted small" style={{ padding: 32 }}>You haven't posted any jobs yet.</div>
        )}

        {jobs.map((job) => (
          <div key={job.id} className="card" style={{ marginBottom: 12 }}>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className="bold">{job.title}</span>
                  <span className={`badge ${job.status === 'active' ? 'badge-green' : 'badge-grey-light'}`}>{job.status === 'active' ? 'Active' : 'Closed'}</span>
                </div>
                <div className="muted small">
                  {job.location} {job.employmentType ? `· ${EMPLOYMENT_TYPE_LABELS[job.employmentType] || job.employmentType}` : ''}
                </div>
                <div className="muted small">{job.applicationCount} application{job.applicationCount === 1 ? '' : 's'} · Posted {formatDate(job.postedAt)}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={() => navigate(`/employer/job-postings/${job.id}/applications`)}>
                View Applications
              </button>
              <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={() => navigate(`/employer/job-postings/${job.id}/edit`)}>
                Edit
              </button>
              {job.status === 'active' && (
                <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} disabled={busyId === job.id} onClick={() => close(job)}>
                  Close
                </button>
              )}
              <button className="btn btn-red btn-sm" style={{ width: 'auto' }} disabled={busyId === job.id} onClick={() => setPendingDelete(job)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <EmployerBottomNav active="settings" />

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this job posting?"
          message={`"${pendingDelete.title}" and its listing will be permanently removed. Received applications stay in your applicants' own tracked history.`}
          confirmLabel="Delete"
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
