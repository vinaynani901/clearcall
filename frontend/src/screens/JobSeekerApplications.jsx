import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import ThreeDotMenu from '../components/ThreeDotMenu';
import { ErrorBanner, ConfirmDialog } from '../components/Shared';
import ResumeUsedModal from '../components/ResumeUsedModal';
import { DocumentIcon, SearchIcon, RocketIcon } from '../components/Icons';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

function timeAfterPosting(minutes) {
  if (minutes === null || minutes === undefined) return null;
  if (minutes < 60) return `Applied ${minutes} minute${minutes === 1 ? '' : 's'} after posting`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Applied ${hours} hour${hours === 1 ? '' : 's'} after posting`;
  const days = Math.round(hours / 24);
  return `Applied ${days} day${days === 1 ? '' : 's'} after posting`;
}

const STATUS_META = {
  awaiting: { label: 'Awaiting Response', className: 'jsk-status-awaiting' },
  interview: { label: 'Interview Scheduled', className: 'jsk-status-interview' },
  offer: { label: 'Offer Received', className: 'jsk-status-offer' },
  rejected: { label: 'Rejected', className: 'jsk-status-rejected' },
  withdrawn: { label: 'Withdrawn', className: 'jsk-status-withdrawn' },
};

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting', label: 'Awaiting Response' },
  { key: 'interview', label: 'Interview Scheduled' },
  { key: 'offer', label: 'Offer Received' },
  { key: 'rejected', label: 'Rejected' },
];

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function StatusModal({ application, onClose, onSaved }) {
  const [status, setStatus] = useState(application.status);
  const [interviewAt, setInterviewAt] = useState(application.interview_at ? application.interview_at.slice(0, 16) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateApplication(application.id, {
        status,
        interviewAt: status === 'interview' && interviewAt ? new Date(interviewAt).toISOString() : (status === 'interview' ? application.interview_at : null),
      });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 400, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 12 }}>Update Status</div>
        <ErrorBanner message={error} />
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
          </select>
        </div>
        {status === 'interview' && (
          <div className="field">
            <label>Interview date &amp; time</label>
            <input type="datetime-local" value={interviewAt} onChange={(e) => setInterviewAt(e.target.value)} />
          </div>
        )}
        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button className="btn btn-grey" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function NoteModal({ application, onClose, onSaved }) {
  const [notes, setNotes] = useState(application.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      await api.updateApplication(application.id, { notes });
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 420, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>Note for {application.company_name}</div>
        <ErrorBanner message={error} />
        <textarea
          rows={5}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add a note about this application…"
          style={{ width: '100%', border: '2px solid var(--grey-200)', borderRadius: 10, padding: 12, fontSize: 14, fontFamily: 'inherit', marginBottom: 16 }}
          autoFocus
        />
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-grey" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Note'}</button>
        </div>
      </div>
    </div>
  );
}

function DescriptionModal({ application, onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 480, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 4 }}>{application.job_title}</div>
        <div className="muted small" style={{ marginBottom: 16 }}>{application.company_name}</div>
        <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 320, overflowY: 'auto' }}>
          {application.job_description || 'No job description was saved for this application.'}
        </div>
        <button className="btn btn-grey" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

export default function JobSeekerApplications() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [noteTarget, setNoteTarget] = useState(null);
  const [descTarget, setDescTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [resumeModalId, setResumeModalId] = useState(null);
  const [error, setError] = useState('');

  const load = () => api.listApplications().then((d) => setApplications(d.applications || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (state?.openId && applications.length > 0) {
      const found = applications.find((a) => a.id === state.openId);
      if (found) setEditTarget(found);
      window.history.replaceState({}, '');
    }
  }, [state, applications]);

  const filtered = useMemo(() => {
    return applications.filter((a) => {
      if (tab !== 'all' && a.status !== tab) return false;
      if (search && !`${a.company_name} ${a.job_title}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [applications, tab, search]);

  // Part 6 — "You Applied" (manual/gmail/adzuna/clearcall/agent) vs
  // "ClearCall Applied" (source = auto_apply, the engine submitted it).
  // Both sections share the same tab/search filters above.
  const youApplied = useMemo(() => filtered.filter((a) => a.source !== 'auto_apply'), [filtered]);
  const clearcallApplied = useMemo(() => filtered.filter((a) => a.source === 'auto_apply'), [filtered]);

  const menuFor = (a) => [
    { label: 'View Job Description', onClick: () => setDescTarget(a) },
    { label: 'Add Note', onClick: () => setNoteTarget(a) },
    { label: 'Update Status', onClick: () => setStatusTarget(a) },
    { label: 'Delete Application', danger: true, onClick: () => setDeleteTarget(a) },
  ];

  return (
    <JobSeekerLayout active="applications">
      <div className="jsk-section-header row-between">
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>My Applications</h1>
        <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => navigate('/jobseeker/auto-apply')}>
          Auto Apply Preferences
        </button>
      </div>

      <ErrorBanner message={error} />

      <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`pill-tab ${tab === t.key ? 'active' : ''}`}
            style={{ background: tab === t.key ? 'var(--white)' : 'var(--grey-200)', boxShadow: tab === t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', color: tab === t.key ? 'var(--navy)' : 'var(--grey-500)', padding: '8px 14px', width: 'auto', flex: 'none' }}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ position: 'relative', marginBottom: 20, maxWidth: 360 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><SearchIcon size={15} /></span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by company or role…"
          style={{ width: '100%', padding: '10px 12px 10px 36px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 14 }}
        />
      </div>

      {loading ? (
        <div className="card muted small">Loading…</div>
      ) : filtered.length === 0 ? (
        applications.length === 0 ? (
          <div className="card jsk-empty-state">
            <DocumentIcon size={36} color="#cbd5e1" />
            <div style={{ marginTop: 10, maxWidth: 380 }}>
              Your applications will appear here automatically when you apply for jobs through ClearCall Jobs or connect your Gmail to import applications from Seek and LinkedIn.
            </div>
            <div className="row" style={{ gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/jobseeker/jobs')}>Browse Jobs</button>
              <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => navigate('/settings')}>Connect Gmail</button>
            </div>
          </div>
        ) : (
          <div className="card muted small center" style={{ padding: 24 }}>No applications match this filter/search.</div>
        )
      ) : (
        <div className="stack" style={{ gap: 24 }}>
          {youApplied.length > 0 && (
            <div>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span className="bold small">You Applied</span>
                <span className="badge badge-blue xs">{youApplied.length}</span>
              </div>
              <div className="stack">
                {youApplied.map((a) => (
                  <div key={a.id} className="card jsk-app-card" style={{ margin: 0 }}>
                    <div className="jsk-app-logo">{initials(a.company_name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }} onClick={() => setStatusTarget(a)}>
                      <div className="small bold">{a.company_name}</div>
                      <div className="muted xs">{a.job_title}{a.platform ? ` · ${a.platform}` : ''}</div>
                      <div className="muted xs">Applied {formatDate(a.date_applied)}</div>
                    </div>
                    <span className={`jsk-status-badge ${STATUS_META[a.status].className}`}>{STATUS_META[a.status].label}</span>
                    <ThreeDotMenu options={menuFor(a)} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {clearcallApplied.length > 0 && (
            <div>
              <div className="row" style={{ gap: 8, alignItems: 'center', marginBottom: 10 }}>
                <span className="bold small">ClearCall Applied</span>
                <span className="badge badge-green xs">{clearcallApplied.length}</span>
              </div>
              <div className="stack">
                {clearcallApplied.map((a) => (
                  <div key={a.id} className="card jsk-app-card" style={{ margin: 0, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <div className="jsk-app-logo">{initials(a.company_name)}</div>
                    <div style={{ flex: 1, minWidth: 200 }} onClick={() => setStatusTarget(a)}>
                      <div className="row" style={{ gap: 6, alignItems: 'center' }}>
                        <span className="small bold">{a.company_name}</span>
                        <span className="badge badge-green xs" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                          <RocketIcon size={10} color="#059669" /> Auto Applied
                        </span>
                      </div>
                      <div className="muted xs">{a.job_title}</div>
                      <div className="muted xs">
                        Applied {formatDate(a.date_applied)}
                        {typeof a.match_score === 'number' ? ` · ${a.match_score}% match` : ''}
                      </div>
                      {timeAfterPosting(a.minutes_after_posting) && (
                        <div className="muted xs">{timeAfterPosting(a.minutes_after_posting)}</div>
                      )}
                      <div className="muted xs">
                        {a.resume_was_tailored ? `AI-tailored resume${a.resume_ai_provider_used ? ` (${a.resume_ai_provider_used})` : ''}` : 'Base resume submitted'}
                      </div>
                    </div>
                    <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                      <span className={`jsk-status-badge ${STATUS_META[a.status].className}`}>{STATUS_META[a.status].label}</span>
                      {a.resume_version_id && (
                        <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => setResumeModalId(a.resume_version_id)}>
                          View Resume Used
                        </button>
                      )}
                      <ThreeDotMenu options={menuFor(a)} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {editTarget && (
        <StatusModal application={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
      {statusTarget && (
        <StatusModal application={statusTarget} onClose={() => setStatusTarget(null)} onSaved={() => { setStatusTarget(null); load(); }} />
      )}
      {noteTarget && (
        <NoteModal application={noteTarget} onClose={() => setNoteTarget(null)} onSaved={() => { setNoteTarget(null); load(); }} />
      )}
      {descTarget && (
        <DescriptionModal application={descTarget} onClose={() => setDescTarget(null)} />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete application?"
          message={`Delete your application for ${deleteTarget.job_title} at ${deleteTarget.company_name}? This cannot be undone.`}
          confirmLabel="Delete"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={async () => {
            try {
              await api.deleteApplication(deleteTarget.id);
              setDeleteTarget(null);
              load();
            } catch (err) {
              setError(err.message);
              setDeleteTarget(null);
            }
          }}
        />
      )}
      {resumeModalId && (
        <ResumeUsedModal resumeVersionId={resumeModalId} onClose={() => setResumeModalId(null)} />
      )}
    </JobSeekerLayout>
  );
}
