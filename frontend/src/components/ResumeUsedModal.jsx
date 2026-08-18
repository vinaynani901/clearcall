import { useEffect, useState } from 'react';
import { api } from '../api/client';

// Shared by the notification dropdown (JobSeekerTopBar) and My Applications'
// "ClearCall Applied" cards (Part 6) — both need the exact same "View
// Resume Used" popup showing the resume_versions row actually submitted
// with one auto-applied application.
export default function ResumeUsedModal({ resumeVersionId, onClose }) {
  const [resume, setResume] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getResumeVersion(resumeVersionId).then((d) => setResume(d.resumeVersion)).catch((err) => setError(err.message));
  }, [resumeVersionId]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 480, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 4 }}>Resume Used</div>
        {resume && (
          <div className="muted xs" style={{ marginBottom: 12 }}>
            {resume.wasTailored ? `AI-tailored for ${resume.jobTitleTailoredFor || 'this role'} (${resume.aiProviderUsed || 'AI'})` : 'Base resume — no AI tailoring applied'}
          </div>
        )}
        {error && <div className="small" style={{ color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
        {!resume && !error && <div className="muted small">Loading…</div>}
        {resume && (
          <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 340, overflowY: 'auto', background: 'var(--grey-100)', padding: 12, borderRadius: 10 }}>
            {resume.tailoredContent}
          </div>
        )}
        <button className="btn btn-grey" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
