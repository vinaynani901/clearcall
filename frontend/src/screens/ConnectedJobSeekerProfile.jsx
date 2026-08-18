import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';

export default function ConnectedJobSeekerProfile() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getConnectedJobSeekerProfile(id)
      .then(setData)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  const profile = data?.profile;

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title={profile?.displayName || 'Profile'} onBack={() => navigate('/employer/pipeline')} />
        <ErrorBanner message={error} />

        {loading && <div className="muted small" style={{ padding: 20 }}>Loading…</div>}

        {profile && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="bold" style={{ fontSize: 16 }}>{profile.displayName}</div>
              <div className="muted small">{profile.profileType}</div>
              <div className="muted xs" style={{ marginTop: 8 }}>
                Only information this job seeker has granted your agency access to is shown here.
              </div>
              {data.canApplyForJobs && (
                <button className="btn btn-primary btn-sm" style={{ width: 'auto', marginTop: 12 }} onClick={() => navigate(`/employer/pipeline/connected/${id}/apply`)}>
                  Apply for Jobs
                </button>
              )}
            </div>

            {profile.resumes.length === 0 && (
              <div className="card center muted small" style={{ padding: 28 }}>No resume shared yet.</div>
            )}

            {profile.resumes.map((r) => (
              <div key={r.id} className="card" style={{ marginBottom: 12 }}>
                <div className="bold small" style={{ marginBottom: 6 }}>{r.name}</div>
                {r.summary && <p className="small" style={{ margin: '0 0 10px' }}>{r.summary}</p>}

                {r.skills?.length > 0 && (
                  <>
                    <div className="muted xs bold" style={{ marginBottom: 4 }}>SKILLS</div>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                      {r.skills.map((s, i) => <span key={i} className="badge badge-grey-light">{typeof s === 'string' ? s : s.name}</span>)}
                    </div>
                  </>
                )}

                {r.experience?.length > 0 && (
                  <>
                    <div className="muted xs bold" style={{ marginBottom: 4 }}>WORK HISTORY</div>
                    {r.experience.map((e, i) => (
                      <div key={i} className="small" style={{ marginBottom: 8 }}>
                        <div className="bold">{e.title || e.role} {e.company ? `— ${e.company}` : ''}</div>
                        <div className="muted xs">{e.startDate || ''} {e.endDate ? `– ${e.endDate}` : ''}</div>
                      </div>
                    ))}
                  </>
                )}

                {r.education?.length > 0 && (
                  <>
                    <div className="muted xs bold" style={{ marginBottom: 4 }}>EDUCATION</div>
                    {r.education.map((ed, i) => (
                      <div key={i} className="small" style={{ marginBottom: 4 }}>{ed.school || ed.institution} — {ed.qualification || ed.degree}</div>
                    ))}
                  </>
                )}
              </div>
            ))}
          </>
        )}
      </div>
      <EmployerBottomNav active="dashboard" />
    </>
  );
}
