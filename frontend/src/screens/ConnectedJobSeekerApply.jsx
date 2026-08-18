import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner, InfoBox } from '../components/Shared';
import { api } from '../api/client';

function salaryText(job) {
  if (job.salaryRange) return job.salaryRange;
  return null;
}

export default function ConnectedJobSeekerApply() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [q, setQ] = useState('');
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [applyingId, setApplyingId] = useState(null);
  const [showExternal, setShowExternal] = useState(false);
  const [externalForm, setExternalForm] = useState({ companyName: '', jobTitle: '', jobDescription: '', salaryRange: '' });
  const [submittingExternal, setSubmittingExternal] = useState(false);

  const search = () => {
    setLoading(true);
    api.searchJobs({ q, verifiedOnly: 'true' })
      .then((d) => setJobs(d.clearcallJobs || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyOnBehalf = async (job) => {
    setApplyingId(job.id);
    setError('');
    try {
      await api.applyForConnectedJobSeeker(id, job.id);
      setToast(`Applied to ${job.title} on their behalf`);
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setApplyingId(null);
    }
  };

  const submitExternal = async (e) => {
    e.preventDefault();
    if (!externalForm.companyName.trim() || !externalForm.jobTitle.trim()) return;
    setSubmittingExternal(true);
    setError('');
    try {
      await api.applyExternalForConnectedJobSeeker(id, externalForm);
      setToast('External application logged and attributed to this job seeker');
      setTimeout(() => setToast(''), 2500);
      setExternalForm({ companyName: '', jobTitle: '', jobDescription: '', salaryRange: '' });
      setShowExternal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmittingExternal(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Apply for Jobs" onBack={() => navigate('/employer/pipeline')} />
        <ErrorBanner message={error} />
        <InfoBox>Applying here creates an application record attributed to this job seeker, and they're notified that your agency applied on their behalf.</InfoBox>

        <div className="row" style={{ gap: 8, marginBottom: 16 }}>
          <input
            placeholder="Search ClearCall Direct jobs…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            style={{ flex: 1 }}
          />
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={search}>Search</button>
        </div>

        {loading && <div className="muted small" style={{ padding: 20 }}>Loading jobs…</div>}

        {!loading && jobs.map((job) => (
          <div key={job.id} className="card row-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
            <div>
              {job.verified && <span className="badge badge-green" style={{ marginBottom: 6 }}>ClearCall Verified</span>}
              <div className="bold">{job.title}</div>
              <div className="muted small">{job.companyName} · {job.location}</div>
              {salaryText(job) && <div className="muted small">{salaryText(job)}</div>}
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} disabled={applyingId === job.id} onClick={() => applyOnBehalf(job)}>
              {applyingId === job.id ? 'Applying…' : 'Apply on Behalf'}
            </button>
          </div>
        ))}
        {!loading && jobs.length === 0 && (
          <div className="card center muted small" style={{ padding: 24 }}>No ClearCall Direct jobs matched your search.</div>
        )}

        <div className="card" style={{ marginTop: 20 }}>
          <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={() => setShowExternal((v) => !v)}>
            {showExternal ? 'Cancel' : 'Log an External Application'}
          </button>
          {showExternal && (
            <form onSubmit={submitExternal} className="stack" style={{ marginTop: 14 }}>
              <div className="field">
                <label>Company Name</label>
                <input required value={externalForm.companyName} onChange={(e) => setExternalForm((f) => ({ ...f, companyName: e.target.value }))} />
              </div>
              <div className="field">
                <label>Job Title</label>
                <input required value={externalForm.jobTitle} onChange={(e) => setExternalForm((f) => ({ ...f, jobTitle: e.target.value }))} />
              </div>
              <div className="field">
                <label>Salary Range (optional)</label>
                <input value={externalForm.salaryRange} onChange={(e) => setExternalForm((f) => ({ ...f, salaryRange: e.target.value }))} />
              </div>
              <div className="field">
                <label>Notes (optional)</label>
                <textarea rows={3} value={externalForm.jobDescription} onChange={(e) => setExternalForm((f) => ({ ...f, jobDescription: e.target.value }))} />
              </div>
              <button className="btn btn-primary" disabled={submittingExternal}>{submittingExternal ? 'Logging…' : 'Log Application'}</button>
            </form>
          )}
        </div>
      </div>
      <EmployerBottomNav active="dashboard" />
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
