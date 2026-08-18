import { useEffect, useRef, useState } from 'react';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { DocumentIcon } from '../components/Icons';
import { ErrorBanner, ConfirmDialog } from '../components/Shared';
import FeatureLocked from '../components/FeatureLocked';
import { usePlan } from '../context/PlanContext';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

const TEMPLATES = [
  { key: 'professional', label: 'Professional', blurb: 'Clean and traditional — safe for any industry.' },
  { key: 'modern', label: 'Modern', blurb: 'A bit more visual polish for creative or tech roles.' },
  { key: 'graduate', label: 'Graduate', blurb: 'Leads with education — built for early-career applicants.' },
];

function UploadIcon({ size = 28, color = '#1e3a8a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 16V4M12 4l-5 5M12 4l5 5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon({ size = 28, color = '#1e3a8a' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke={color} strokeWidth="2" />
    </svg>
  );
}

const EMPTY_RESUME = {
  name: 'Untitled Resume',
  template: 'professional',
  personalDetails: { fullName: '', email: '', phone: '', location: '' },
  summary: '',
  experience: [],
  education: [],
  skills: [],
  certifications: [],
};

function OptionCard({ icon, title, desc, onClick }) {
  return (
    <div className="card" style={{ cursor: 'pointer', textAlign: 'center', padding: 24 }} onClick={onClick}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(30,58,138,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
        {icon}
      </div>
      <div className="bold" style={{ marginBottom: 6 }}>{title}</div>
      <div className="muted small">{desc}</div>
    </div>
  );
}

// --- Builder form pieces -----------------------------------------------

function RepeatableSection({ title, items, setItems, fields, addLabel }) {
  const update = (i, key, val) => setItems(items.map((it, idx) => (idx === i ? { ...it, [key]: val } : it)));
  const remove = (i) => setItems(items.filter((_, idx) => idx !== i));
  const add = () => setItems([...items, Object.fromEntries(fields.map((f) => [f.key, '']))]);

  return (
    <div className="card mb-16">
      <div className="bold" style={{ marginBottom: 12 }}>{title}</div>
      {items.length === 0 && <div className="muted small" style={{ marginBottom: 12 }}>Nothing added yet.</div>}
      {items.map((item, i) => (
        <div key={i} style={{ border: '1px solid var(--grey-200)', borderRadius: 10, padding: 14, marginBottom: 10 }}>
          <div className="jsk-jobs-grid" style={{ gap: 10 }}>
            {fields.map((f) => (
              <div className="field" key={f.key} style={{ marginBottom: 0, gridColumn: f.wide ? '1 / -1' : undefined }}>
                <label>{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea rows={2} value={item[f.key] || ''} onChange={(e) => update(i, f.key, e.target.value)} placeholder={f.placeholder} />
                ) : (
                  <input value={item[f.key] || ''} onChange={(e) => update(i, f.key, e.target.value)} placeholder={f.placeholder} />
                )}
              </div>
            ))}
          </div>
          <button type="button" className="link xs" style={{ color: 'var(--red)', marginTop: 8 }} onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={add}>+ {addLabel}</button>
    </div>
  );
}

function ResumeBuilder({ resumeId, onClose, onSaved }) {
  const [resume, setResume] = useState(EMPTY_RESUME);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [skillsText, setSkillsText] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api.getResume(resumeId).then((d) => {
      setResume(d.resume);
      setSkillsText((d.resume.skills || []).join(', '));
    }).catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [resumeId]);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const skills = skillsText.split(',').map((s) => s.trim()).filter(Boolean);
      const { resume: updated } = await api.updateResume(resumeId, { ...resume, skills });
      setResume(updated);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="card muted small">Loading…</div>;

  const pd = resume.personalDetails || {};
  const setPd = (key, val) => setResume((r) => ({ ...r, personalDetails: { ...r.personalDetails, [key]: val } }));

  return (
    <div>
      <div className="jsk-section-header">
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={onClose}>← Back</button>
          <input
            value={resume.name}
            onChange={(e) => setResume((r) => ({ ...r, name: e.target.value }))}
            style={{ fontSize: 16, fontWeight: 800, border: 'none', background: 'transparent', outline: 'none' }}
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => setShowPreview(true)}>Preview</button>
          <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => api.downloadResumePdf(resumeId, resume.name)}>Download PDF</button>
          <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => api.downloadResumeDocx(resumeId, resume.name)}>Download Word</button>
          <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>

      <ErrorBanner message={error} />

      <div className="card mb-16">
        <div className="bold" style={{ marginBottom: 12 }}>Personal Details</div>
        <div className="jsk-jobs-grid" style={{ gap: 10 }}>
          <div className="field" style={{ marginBottom: 0 }}><label>Full name</label><input value={pd.fullName || ''} onChange={(e) => setPd('fullName', e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Email</label><input value={pd.email || ''} onChange={(e) => setPd('email', e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Phone</label><input value={pd.phone || ''} onChange={(e) => setPd('phone', e.target.value)} /></div>
          <div className="field" style={{ marginBottom: 0 }}><label>Location</label><input value={pd.location || ''} onChange={(e) => setPd('location', e.target.value)} /></div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="bold" style={{ marginBottom: 12 }}>Professional Summary</div>
        <textarea rows={4} value={resume.summary || ''} onChange={(e) => setResume((r) => ({ ...r, summary: e.target.value }))} placeholder="A few sentences about who you are and what you're looking for…" />
      </div>

      <RepeatableSection
        title="Work Experience"
        items={resume.experience || []}
        setItems={(items) => setResume((r) => ({ ...r, experience: items }))}
        addLabel="Add Role"
        fields={[
          { key: 'role', label: 'Job title', placeholder: 'Warehouse Assistant' },
          { key: 'company', label: 'Company', placeholder: 'Acme Pty Ltd' },
          { key: 'startDate', label: 'Start date', placeholder: 'Jan 2022' },
          { key: 'endDate', label: 'End date (blank = present)', placeholder: 'Present' },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'What you did…' },
        ]}
      />

      <RepeatableSection
        title="Education"
        items={resume.education || []}
        setItems={(items) => setResume((r) => ({ ...r, education: items }))}
        addLabel="Add Education"
        fields={[
          { key: 'qualification', label: 'Qualification', placeholder: 'Certificate III in Business' },
          { key: 'institution', label: 'Institution', placeholder: 'TAFE NSW' },
          { key: 'startDate', label: 'Start date', placeholder: '2021' },
          { key: 'endDate', label: 'End date', placeholder: '2022' },
        ]}
      />

      <div className="card mb-16">
        <div className="bold" style={{ marginBottom: 12 }}>Skills</div>
        <input value={skillsText} onChange={(e) => setSkillsText(e.target.value)} placeholder="Customer service, Forklift licence, Microsoft Excel…" />
        <div className="muted xs" style={{ marginTop: 6 }}>Separate skills with commas.</div>
      </div>

      <RepeatableSection
        title="Certifications"
        items={resume.certifications || []}
        setItems={(items) => setResume((r) => ({ ...r, certifications: items }))}
        addLabel="Add Certification"
        fields={[
          { key: 'name', label: 'Certification', placeholder: 'White Card' },
          { key: 'issuer', label: 'Issued by', placeholder: 'SafeWork NSW' },
          { key: 'year', label: 'Year', placeholder: '2023' },
        ]}
      />

      {showPreview && (
        <div className="sheet-backdrop" onClick={() => setShowPreview(false)}>
          <div className="sheet" style={{ borderRadius: 16, maxWidth: 560, margin: '0 auto', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>{pd.fullName || 'Your Name'}</div>
            <div className="muted small" style={{ marginBottom: 16 }}>{[pd.email, pd.phone, pd.location].filter(Boolean).join('  ·  ')}</div>
            {resume.summary && (<><div className="bold small" style={{ color: 'var(--navy)', marginBottom: 4 }}>Professional Summary</div><p className="small" style={{ marginBottom: 16 }}>{resume.summary}</p></>)}
            {resume.experience?.length > 0 && (
              <>
                <div className="bold small" style={{ color: 'var(--navy)', marginBottom: 6 }}>Work Experience</div>
                {resume.experience.map((e, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div className="small bold">{e.role} — {e.company}</div>
                    <div className="muted xs">{[e.startDate, e.endDate || 'Present'].filter(Boolean).join(' – ')}</div>
                    {e.description && <div className="small" style={{ marginTop: 2 }}>{e.description}</div>}
                  </div>
                ))}
              </>
            )}
            {resume.education?.length > 0 && (
              <>
                <div className="bold small" style={{ color: 'var(--navy)', marginBottom: 6 }}>Education</div>
                {resume.education.map((e, i) => (
                  <div key={i} style={{ marginBottom: 10 }}>
                    <div className="small bold">{e.qualification} — {e.institution}</div>
                    <div className="muted xs">{[e.startDate, e.endDate].filter(Boolean).join(' – ')}</div>
                  </div>
                ))}
              </>
            )}
            {(skillsText || '').trim() && (<><div className="bold small" style={{ color: 'var(--navy)', marginBottom: 6 }}>Skills</div><p className="small" style={{ marginBottom: 16 }}>{skillsText}</p></>)}
            {resume.certifications?.length > 0 && (
              <>
                <div className="bold small" style={{ color: 'var(--navy)', marginBottom: 6 }}>Certifications</div>
                {resume.certifications.map((c, i) => (
                  <div key={i} className="small" style={{ marginBottom: 4 }}>{c.name}{c.issuer ? ` — ${c.issuer}` : ''}{c.year ? ` (${c.year})` : ''}</div>
                ))}
              </>
            )}
            <button className="btn btn-grey" style={{ marginTop: 16 }} onClick={() => setShowPreview(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobSeekerResume() {
  const { isLocked } = usePlan();
  const [profile, setProfile] = useState(null);
  const [resumes, setResumes] = useState([]);
  const [view, setView] = useState('home'); // home | templates | builder
  const [activeResumeId, setActiveResumeId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const fileRef = useRef(null);

  const load = () => Promise.all([
    api.getJobseekerProfile().then((d) => setProfile(d.profile)),
    api.listResumes().then((d) => setResumes(d.resumes || [])),
  ]).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const onFileChosen = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await api.uploadResume(file);
      showToast('Resume uploaded');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeUploaded = async () => {
    try { await api.deleteResume(); load(); } catch (err) { setError(err.message); }
  };

  const createFromTemplate = async (template) => {
    try {
      const { resume } = await api.createResume({ name: `${template[0].toUpperCase()}${template.slice(1)} Resume`, template });
      setResumes((r) => [resume, ...r]);
      setActiveResumeId(resume.id);
      setView('builder');
    } catch (err) {
      setError(err.message);
    }
  };

  if (view === 'locked') {
    return (
      <JobSeekerLayout active="resume">
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>Resume Builder</h1>
        <FeatureLocked
          title="Resume Builder is a Premium feature"
          message="This feature requires the Premium plan"
        />
        <div className="center">
          <button className="link small" onClick={() => setView('home')}>← Back</button>
        </div>
      </JobSeekerLayout>
    );
  }

  if (view === 'builder' && activeResumeId) {
    return (
      <JobSeekerLayout active="resume">
        <ResumeBuilder resumeId={activeResumeId} onClose={() => { setView('home'); load(); }} onSaved={() => { showToast('Resume saved'); load(); }} />
        {toast && <div className="toast">{toast}</div>}
      </JobSeekerLayout>
    );
  }

  if (view === 'templates') {
    return (
      <JobSeekerLayout active="resume">
        <div className="jsk-section-header">
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Choose a Template</h1>
          <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={() => setView('home')}>← Back</button>
        </div>
        <div className="jsk-jobs-grid">
          {TEMPLATES.map((t) => (
            <div key={t.key} className="card" style={{ cursor: 'pointer', padding: 20 }} onClick={() => createFromTemplate(t.key)}>
              <div style={{ height: 120, borderRadius: 10, background: 'var(--grey-100)', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <DocumentIcon size={32} color="#94a3b8" />
              </div>
              <div className="bold" style={{ marginBottom: 4 }}>{t.label}</div>
              <div className="muted small">{t.blurb}</div>
            </div>
          ))}
        </div>
      </JobSeekerLayout>
    );
  }

  return (
    <JobSeekerLayout active="resume">
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>Resume Builder</h1>
      <ErrorBanner message={error} />

      <div className="jsk-jobs-grid mb-24">
        <OptionCard
          icon={<DocumentIcon size={26} color="#1e3a8a" />}
          title="Build from scratch"
          desc="Start with a blank template and fill in your details."
          onClick={() => (isLocked('resume_builder') ? setView('locked') : createFromTemplate('professional'))}
        />
        <OptionCard
          icon={<UploadIcon size={26} color="#1e3a8a" />}
          title="Upload existing resume"
          desc="Upload your current resume and we will format it for you."
          onClick={() => fileRef.current?.click()}
        />
        <OptionCard
          icon={<GridIcon size={26} color="#1e3a8a" />}
          title="Choose a template"
          desc="Pick from our professional templates."
          onClick={() => setView(isLocked('resume_builder') ? 'locked' : 'templates')}
        />
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={{ display: 'none' }} onChange={onFileChosen} />
      {uploading && <div className="muted small mb-16">Uploading…</div>}

      <div className="jsk-section-header">
        <h3 style={{ margin: 0 }}>My Resumes</h3>
      </div>

      {resumes.length === 0 && !profile?.resume_filename ? (
        <div className="card jsk-empty-state">
          <DocumentIcon size={32} color="#cbd5e1" />
          <div style={{ marginTop: 8 }}>You haven't created or uploaded a resume yet.</div>
        </div>
      ) : (
        <div className="stack">
          {profile?.resume_filename && (
            <div className="card jsk-app-card" style={{ margin: 0 }}>
              <DocumentIcon size={22} color="#1e3a8a" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="small bold">{profile.resume_filename} <span className="muted xs">(Uploaded file)</span></div>
                <div className="muted xs">Updated {profile.resume_uploaded_at ? formatDate(profile.resume_uploaded_at) : '—'}</div>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => api.downloadResume(profile.resume_filename)}>Download</button>
                {profile.profile_resume_type === 'uploaded' ? (
                  <span className="badge badge-green">Profile Resume</span>
                ) : (
                  <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={async () => { await api.setProfileResumeUploaded(); load(); showToast('Set as your profile resume'); }}>Set as Profile Resume</button>
                )}
                <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={removeUploaded}>Remove</button>
              </div>
            </div>
          )}

          {resumes.map((r) => (
            <div key={r.id} className="card jsk-app-card" style={{ margin: 0 }}>
              <DocumentIcon size={22} color="#1e3a8a" />
              <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => { setActiveResumeId(r.id); setView('builder'); }}>
                <div className="small bold">{r.name}</div>
                <div className="muted xs">Updated {formatDate(r.updatedAt)} · {r.template[0].toUpperCase() + r.template.slice(1)}</div>
              </div>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => api.downloadResumePdf(r.id, r.name)}>Download PDF</button>
                <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => api.downloadResumeDocx(r.id, r.name)}>Download Word</button>
                {r.isProfileResume ? (
                  <span className="badge badge-green">Profile Resume</span>
                ) : (
                  <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={async () => { await api.setProfileResume(r.id); load(); showToast('Set as your profile resume'); }}>Set as Profile Resume</button>
                )}
                <button className="link xs" style={{ color: 'var(--red)' }} onClick={() => setDeleteTarget(r)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete resume?"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await api.deleteResumeBuilt(deleteTarget.id);
              setDeleteTarget(null);
              load();
            } catch (err) {
              setError(err.message);
              setDeleteTarget(null);
            }
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </JobSeekerLayout>
  );
}
