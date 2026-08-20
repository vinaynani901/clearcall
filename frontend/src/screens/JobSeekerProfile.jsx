import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { DocumentIcon, ShieldCheck, HandshakeIcon, SettingsIcon } from '../components/Icons';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function JobSeekerProfile() {
  const { user, avatarUrl } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [agent, setAgent] = useState(null);

  useEffect(() => {
    api.getJobseekerProfile().then((d) => setProfile(d.profile)).catch(() => {});
    api.getMyAgent().then((d) => setAgent(d.agent)).catch(() => {});
  }, []);

  const p = profile || user;

  return (
    <JobSeekerLayout active="profile">
      <div className="card center" style={{ padding: 32, marginBottom: 20 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" style={{ width: 84, height: 84, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 84, height: 84, borderRadius: '50%', background: 'var(--navy)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800 }}>
            {initials(p?.full_name)}
          </div>
        )}
        <div style={{ fontWeight: 800, fontSize: 19, marginTop: 14 }}>{p?.full_name}</div>
        <div className="muted small">{p?.email}</div>
        {p && (
          <span className={`badge ${p.looking_for_work ? 'badge-green' : 'badge-grey'}`} style={{ marginTop: 10 }}>
            {p.looking_for_work ? 'Looking for work' : 'Currently employed'}
          </span>
        )}
        <button className="btn btn-outline btn-sm" style={{ width: 'auto', marginTop: 18 }} onClick={() => navigate('/settings')}>Edit Profile</button>
      </div>

      <div className="jsk-jobs-grid mb-24">
        <div className="card">
          <div className="row-between small mb-8"><span className="muted">Phone</span><span className="bold">{p?.phone || '—'}</span></div>
          <div className="row-between small"><span className="muted">Member since</span><span className="bold">{p?.created_at ? formatDate(p.created_at) : '—'}</span></div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/jobseeker/resume')}>
          <div className="row" style={{ gap: 8 }}>
            <DocumentIcon size={18} color="#1e3a8a" />
            <span className="bold small">Resume</span>
          </div>
          <div className="muted xs" style={{ marginTop: 6 }}>
            {p?.resume_filename ? `Uploaded — ${p.resume_filename}` : 'No resume uploaded yet'}
          </div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/jobseeker/agent')}>
          <div className="row" style={{ gap: 8 }}>
            <HandshakeIcon size={18} color="#1e3a8a" />
            <span className="bold small">Placement Agent</span>
          </div>
          <div className="muted xs" style={{ marginTop: 6 }}>{agent ? `Connected — ${agent.agencyName}` : 'Not connected'}</div>
        </div>

        <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/jobseeker/calls')}>
          <div className="row" style={{ gap: 8 }}>
            <ShieldCheck size={18} color="#10b981" />
            <span className="bold small">Call Protection</span>
          </div>
          <div className="muted xs" style={{ marginTop: 6 }}>All calls from verified employers only</div>
        </div>
      </div>

      <div className="card" style={{ cursor: 'pointer' }} onClick={() => navigate('/jobseeker/access-keys')}>
        <div className="row" style={{ gap: 8 }}>
          <span className="bold small">My Access Keys</span>
        </div>
        <div className="muted xs" style={{ marginTop: 6 }}>Share keys with placement agents to apply on your behalf</div>
      </div>

      <div className="card mb-16">
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <SettingsIcon size={18} color="#64748b" />
          <span className="bold small">Preview the Verified Call Screen</span>
        </div>
        <div className="muted xs" style={{ marginBottom: 12 }}>See exactly what you'll see when a verified employer calls you.</div>
        <div className="row" style={{ gap: 10 }}>
          <button
            className="btn btn-outline btn-sm"
            style={{ width: 'auto' }}
            onClick={() => navigate('/call/incoming-verified', {
              state: { metadata: { companyName: 'Bright Schools Group', callerName: 'Alice Principal', designation: 'Principal', jobRole: 'Year 5 Teacher' } },
            })}
          >
            Simulate Verified Call
          </button>
        </div>
      </div>
    </JobSeekerLayout>
  );
}