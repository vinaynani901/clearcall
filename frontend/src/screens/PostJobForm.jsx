import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { usePlan } from '../context/PlanContext';

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
];

const EMPTY = {
  title: '', description: '', industry: '', location: '', employmentType: 'full_time',
  salaryMin: '', salaryMax: '', skills: [], skillInput: '', applicationDeadline: '', contactRecruiter: '',
};

export default function PostJobForm() {
  const navigate = useNavigate();
  const { id } = useParams(); // present when editing
  const { refresh: refreshPlan } = usePlan();
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!id);

  useEffect(() => {
    if (!id) return;
    api.listMyJobPostings()
      .then((d) => {
        const job = (d.jobs || []).find((j) => j.id === id);
        if (job) {
          setForm({
            title: job.title, description: job.description || '', industry: job.industry || '',
            location: job.location || '', employmentType: job.employmentType || 'full_time',
            salaryMin: job.salaryMin ?? '', salaryMax: job.salaryMax ?? '', skills: job.skills || [], skillInput: '',
            applicationDeadline: job.applicationDeadline || '', contactRecruiter: job.contactRecruiter || '',
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const addSkill = () => {
    const v = form.skillInput.trim();
    if (!v) return;
    setForm((f) => ({ ...f, skills: [...f.skills, v], skillInput: '' }));
  };

  const removeSkill = (i) => setForm((f) => ({ ...f, skills: f.skills.filter((_, idx) => idx !== i) }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.description.trim()) return;
    setSaving(true);
    setError('');
    const payload = {
      title: form.title.trim(), description: form.description.trim(), industry: form.industry || null,
      location: form.location || null, employmentType: form.employmentType || null,
      salaryMin: form.salaryMin ? Number(form.salaryMin) : null, salaryMax: form.salaryMax ? Number(form.salaryMax) : null,
      skills: form.skills, applicationDeadline: form.applicationDeadline || null, contactRecruiter: form.contactRecruiter || null,
    };
    try {
      if (id) await api.updateJobPosting(id, payload);
      else await api.createJobPosting(payload);
      await refreshPlan();
      navigate('/employer/job-postings');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="muted small" style={{ padding: 20 }}>Loading…</div>;

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title={id ? 'Edit Job' : 'Post a Job'} onBack={() => navigate('/employer/job-postings')} />
        <ErrorBanner message={error} />

        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Job Title</label>
            <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Senior Recruitment Consultant" />
          </div>
          <div className="field">
            <label>Job Description</label>
            <textarea required rows={5} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Industry</label>
              <input value={form.industry} onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))} placeholder="e.g. Construction" />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Location</label>
              <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Sydney, NSW" />
            </div>
          </div>
          <div className="field">
            <label>Employment Type</label>
            <select value={form.employmentType} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}>
              {EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="row" style={{ gap: 10 }}>
            <div className="field" style={{ flex: 1 }}>
              <label>Salary Min ($/yr)</label>
              <input type="number" value={form.salaryMin} onChange={(e) => setForm((f) => ({ ...f, salaryMin: e.target.value }))} />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Salary Max ($/yr)</label>
              <input type="number" value={form.salaryMax} onChange={(e) => setForm((f) => ({ ...f, salaryMax: e.target.value }))} />
            </div>
          </div>

          <div className="field">
            <label>Skills Required</label>
            <div className="row" style={{ gap: 8 }}>
              <input
                value={form.skillInput}
                onChange={(e) => setForm((f) => ({ ...f, skillInput: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }}
                placeholder="Type a skill and press Enter"
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={addSkill}>Add</button>
            </div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {form.skills.map((s, i) => (
                <span key={i} className="badge badge-grey-light" style={{ cursor: 'pointer' }} onClick={() => removeSkill(i)}>{s} ✕</span>
              ))}
            </div>
          </div>

          <div className="field">
            <label>Application Deadline</label>
            <input type="date" value={form.applicationDeadline} onChange={(e) => setForm((f) => ({ ...f, applicationDeadline: e.target.value }))} />
          </div>
          <div className="field">
            <label>Contact Recruiter (optional)</label>
            <input value={form.contactRecruiter} onChange={(e) => setForm((f) => ({ ...f, contactRecruiter: e.target.value }))} placeholder="Name or email applicants should reach" />
          </div>

          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : id ? 'Save Changes' : 'Post Job'}</button>
        </form>
      </div>
      <EmployerBottomNav active="settings" />
    </>
  );
}
