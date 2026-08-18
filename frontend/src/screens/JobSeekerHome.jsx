import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import {
  DocumentIcon, PhoneIcon, CalendarIcon, GiftIcon, StarIcon, RefreshIcon,
  ShieldCheck, HandshakeIcon, BuildingIcon, BookmarkIcon, ArrowRightIcon,
  DeclineIcon, KeyIcon, RocketIcon,
} from '../components/Icons';
import AnnouncementBanner from '../components/AnnouncementBanner';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { timeAgo, formatDate, formatDateTime } from '../utils/date';

const STATUS_META = {
  awaiting: { label: 'Awaiting Response', className: 'jsk-status-awaiting' },
  interview: { label: 'Interview Scheduled', className: 'jsk-status-interview' },
  offer: { label: 'Offer Received', className: 'jsk-status-offer' },
  rejected: { label: 'Rejected', className: 'jsk-status-rejected' },
  withdrawn: { label: 'Withdrawn', className: 'jsk-status-withdrawn' },
};

const ACTIVITY_META = {
  verified_call: { icon: PhoneIcon, color: '#10b981' },
  application_submitted: { icon: DocumentIcon, color: '#1e3a8a' },
  interview_scheduled: { icon: CalendarIcon, color: '#8b5cf6' },
  status_updated: { icon: RefreshIcon, color: '#f59e0b' },
  application_rejected: { icon: DeclineIcon, color: '#ef4444' },
  new_job_match: { icon: StarIcon, color: '#f59e0b' },
  agent_connected: { icon: KeyIcon, color: '#10b981' },
  key_revoked: { icon: KeyIcon, color: '#94a3b8' },
};

const EMPTY = {
  greeting: { firstName: 'there', timeGreeting: 'Good morning' },
  subtitle: '',
  stats: {
    totalApplications: { value: 0, thisWeek: 0 },
    callsReceived: { value: 0, thisWeek: 0 },
    interviewsScheduled: { value: 0, thisWeek: 0 },
    offersReceived: { value: 0, thisWeek: 0 },
    autoApplied: { value: 0, thisMonth: 0 },
  },
  recentActivity: [],
  recentApplications: [],
  upcomingInterviews: [],
  jobsForYou: [],
  externalJobsConfigured: false,
};

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className="card jsk-stat-card">
      <div className="jsk-stat-icon" style={{ background: `${color}1a`, color }}>
        <Icon size={17} color={color} />
      </div>
      <div>
        <div className="jsk-stat-value">{value}</div>
        <div className="muted xs">{label}</div>
      </div>
      {sub && <div className="jsk-stat-sub" style={{ color }}>{sub}</div>}
    </div>
  );
}

export default function JobSeekerHome() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState({ ...EMPTY, greeting: { firstName: (user?.full_name || '').split(' ')[0] || 'there', timeGreeting: 'Good morning' } });
  const [agent, setAgent] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gmailNotice, setGmailNotice] = useState(null);

  const load = () => Promise.all([
    api.getJobseekerDashboard(),
    api.getMyAgent().catch(() => ({ agent: null })),
    api.getJobseekerProfile().catch(() => ({ profile: null })),
  ])
    .then(([d, agentData, profileData]) => {
      setData(d);
      setAgent(agentData.agent);
      setProfile(profileData.profile);
      if (d.gmailImport?.imported > 0) {
        setGmailNotice(`${d.gmailImport.imported} new application${d.gmailImport.imported === 1 ? '' : 's'} imported from Gmail.`);
      }
    })
    .catch((err) => console.error('[jobseeker dashboard] failed to load:', err))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const { greeting, subtitle, stats, recentActivity, recentApplications, upcomingInterviews, jobsForYou, externalJobsConfigured } = data;
  // Fewer than 3 ClearCall Direct postings and no Adzuna key configured —
  // fill the remaining grid slots with a placeholder rather than an
  // empty-looking row. Once Adzuna is configured the backend itself fills
  // these slots with real external jobs, so no placeholder is needed then.
  const placeholderCount = externalJobsConfigured ? 0 : Math.max(0, 3 - jobsForYou.length);

  const rightRail = (
    <>
      <div className="card jsk-protection-card">
        <ShieldCheck size={40} color="#10b981" />
        <div className="bold" style={{ color: 'var(--green-dark)', marginTop: 10, fontSize: 15 }}>You are protected</div>
        <div className="muted small" style={{ marginTop: 4 }}>All calls from verified employers only</div>
        <button className="btn btn-green btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={() => navigate('/jobseeker/calls')}>
          Protection Active
        </button>
      </div>

      <div className="card jsk-agent-card">
        <div className="bold small" style={{ marginBottom: 12 }}>Your Placement Agent</div>
        {agent ? (
          <>
            <div className="row" style={{ gap: 10 }}>
              <div className="jsk-app-logo">{initials(agent.fullName)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="small bold">{agent.fullName}</div>
                <div className="muted xs">{agent.agencyName}</div>
                {agent.maskedPhone && <div className="muted xs">{agent.maskedPhone}</div>}
              </div>
            </div>
            <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 14 }} onClick={() => navigate('/jobseeker/agent')}>Message</button>
          </>
        ) : (
          <>
            <div className="muted small" style={{ marginBottom: 12 }}>
              Connect with a placement agent who can apply for jobs on your behalf.
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => navigate('/jobseeker/agent')}>
              <HandshakeIcon size={15} color="#fff" /> Find a Placement Agent
            </button>
          </>
        )}
      </div>

      <div className="card jsk-resume-card">
        <div className="bold small" style={{ marginBottom: 12 }}>Your Resume</div>
        {profile?.resume_filename ? (
          <>
            <div className="row" style={{ gap: 8 }}>
              <DocumentIcon size={18} color="#1e3a8a" />
              <div style={{ minWidth: 0 }}>
                <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.resume_filename}</div>
                <div className="muted xs">Updated {profile.resume_uploaded_at ? formatDate(profile.resume_uploaded_at) : '—'}</div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => api.downloadResume(profile.resume_filename)}>View Resume</button>
              <button className="btn btn-grey btn-sm" style={{ flex: 1 }} onClick={() => navigate('/jobseeker/resume')}>Update</button>
            </div>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => navigate('/jobseeker/resume')}>Upload Your Resume</button>
        )}
      </div>
    </>
  );

  return (
    <JobSeekerLayout active="home" rightRail={rightRail}>
      <AnnouncementBanner />

      {gmailNotice && (
        <div className="card mb-16" style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <RefreshIcon size={16} color="#10b981" />
            <span className="small" style={{ color: 'var(--green-dark)' }}>{gmailNotice}</span>
          </div>
          <button className="btn-icon" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#10b981' }} onClick={() => setGmailNotice(null)} aria-label="Dismiss">✕</button>
        </div>
      )}

      <div className="mb-24">
        <div className="jsk-greeting">{greeting.timeGreeting}, {greeting.firstName} 👋</div>
        {subtitle && <div className="jsk-subtitle">{subtitle}</div>}
      </div>

      <div className="jsk-stats-row mb-24">
        <StatCard label="Total Applications" value={stats.totalApplications.value} sub={stats.totalApplications.thisWeek > 0 ? `+${stats.totalApplications.thisWeek} this week` : null} icon={DocumentIcon} color="#1e3a8a" />
        <StatCard label="Calls Received" value={stats.callsReceived.value} sub={stats.callsReceived.allTime > stats.callsReceived.value ? `${stats.callsReceived.allTime} all-time` : null} icon={PhoneIcon} color="#10b981" />
        <StatCard label="Interviews Scheduled" value={stats.interviewsScheduled.value} sub={stats.interviewsScheduled.thisWeek > 0 ? `+${stats.interviewsScheduled.thisWeek} this week` : null} icon={CalendarIcon} color="#8b5cf6" />
        <StatCard label="Offers Received" value={stats.offersReceived.value} sub={stats.offersReceived.value > 0 ? 'Amazing!' : null} icon={GiftIcon} color="#f59e0b" />
        <StatCard label="Auto Applied This Month" value={stats.autoApplied.value} sub={stats.autoApplied.value > 0 ? 'ClearCall did the work' : null} icon={RocketIcon} color="#1e3a8a" />
      </div>

      <div className="jsk-two-col mb-24">
        <div className="card">
          <div className="jsk-section-header">
            <h3>Recent Activity</h3>
            <button className="link xs" onClick={() => navigate('/jobseeker/activity')}>See All</button>
          </div>
          {recentActivity.length === 0 ? (
            <div className="muted small" style={{ padding: '8px 0' }}>No activity yet. Once you start applying and receiving verified calls, it'll show up here.</div>
          ) : (
            <div>
              {recentActivity.map((a, i) => {
                const meta = ACTIVITY_META[a.type] || ACTIVITY_META.application_submitted;
                const Icon = meta.icon;
                return (
                  <div key={i} className="jsk-activity-item">
                    <div className="jsk-activity-icon" style={{ background: `${meta.color}1a` }}>
                      <Icon size={16} color={meta.color} />
                    </div>
                    <div className="jsk-activity-text">
                      <div className="small bold">{a.title}</div>
                      <div className="muted xs">{a.detail}</div>
                    </div>
                    <div className="jsk-activity-time">{timeAgo(a.at)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="jsk-section-header">
            <h3>My Applications</h3>
            <button className="link xs" onClick={() => navigate('/jobseeker/applications')}>View All</button>
          </div>
          {recentApplications.length === 0 ? (
            <div className="jsk-empty-state">
              <DocumentIcon size={32} color="#cbd5e1" />
              <div className="small" style={{ marginTop: 8 }}>You haven't applied for any jobs yet. Start your job search and apply for your first role.</div>
              <button className="btn btn-primary btn-sm" style={{ width: 'auto', marginTop: 14 }} onClick={() => navigate('/jobseeker/jobs')}>Browse Jobs</button>
            </div>
          ) : (
            <div className="stack">
              {recentApplications.map((a) => (
                <div key={a.id} className="card jsk-app-card" style={{ margin: 0 }} onClick={() => navigate('/jobseeker/applications', { state: { openId: a.id } })}>
                  <div className="jsk-app-logo">{initials(a.companyName)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="small bold" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.companyName}</div>
                    <div className="muted xs">{a.jobTitle}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <span className={`jsk-status-badge ${STATUS_META[a.status].className}`}>{STATUS_META[a.status].label}</span>
                    <div className="muted xs" style={{ marginTop: 4 }}>{timeAgo(a.dateApplied)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mb-24">
        <div className="jsk-section-header">
          <h3>Jobs For You</h3>
          <button className="link xs" onClick={() => navigate('/jobseeker/jobs')}>View All Jobs</button>
        </div>
        {jobsForYou.length === 0 && placeholderCount === 0 ? (
          <div className="card jsk-empty-state">
            <BuildingIcon size={32} color="#cbd5e1" />
            <div className="small" style={{ marginTop: 8 }}>No ClearCall Direct postings right now — check the Job Search page for external listings.</div>
          </div>
        ) : (
          <div className="jsk-jobs-grid">
            {jobsForYou.map((job) => (
              <div key={job.id} className="card jsk-job-card" onClick={() => navigate('/jobseeker/jobs', { state: { openJob: job } })}>
                {job.verified && <span className="badge badge-green" style={{ position: 'absolute', top: 14, left: 14 }}>ClearCall Verified</span>}
                <button className="jsk-job-bookmark" onClick={(e) => e.stopPropagation()}><BookmarkIcon size={17} /></button>
                <div className="row" style={{ gap: 10, marginTop: job.verified ? 26 : 0 }}>
                  <div className="jsk-job-logo">{initials(job.companyName)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div className="bold small">{job.title}</div>
                    <div className="muted xs">{job.companyName}</div>
                  </div>
                </div>
                <div className="muted xs">{job.location}{job.employmentType ? ` · ${job.employmentType}` : ''}</div>
                {job.salaryRange && <div className="small bold" style={{ color: 'var(--green-dark)' }}>{job.salaryRange}</div>}
                {job.skills?.length > 0 && (
                  <div className="jsk-job-skills">
                    {job.skills.slice(0, 3).map((s) => <span key={s} className="tagset-preview-badge">{s}</span>)}
                  </div>
                )}
                <div className="muted xs">{timeAgo(job.postedAt)}</div>
              </div>
            ))}
            {Array.from({ length: placeholderCount }).map((_, i) => (
              <div key={`jobs-for-you-placeholder-${i}`} className="card jsk-empty-state" style={{ padding: '24px 20px' }}>
                <BuildingIcon size={28} color="#cbd5e1" />
                <div className="small muted" style={{ marginTop: 8 }}>More jobs coming soon</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-24">
        <div className="jsk-section-header">
          <h3>Upcoming Interviews</h3>
          <button className="link xs" onClick={() => navigate('/jobseeker/applications')}>View All</button>
        </div>
        <div className="card">
          {upcomingInterviews.length === 0 ? (
            <div className="muted small">No upcoming interviews scheduled.</div>
          ) : (
            upcomingInterviews.map((iv) => (
              <div key={iv.id} className="jsk-interview-item" onClick={() => navigate('/jobseeker/applications', { state: { openId: iv.id } })}>
                <div>
                  <div className="small bold">{iv.companyName}</div>
                  <div className="muted xs">{iv.jobTitle} · {formatDateTime(iv.interviewAt, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
                </div>
                <ArrowRightIcon />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="jsk-motivational-banner">
        <svg width="72" height="72" viewBox="0 0 96 96" fill="none">
          <circle cx="48" cy="48" r="46" fill="#dbeafe" />
          <rect x="28" y="52" width="40" height="6" rx="3" fill="#1e3a8a" />
          <rect x="34" y="34" width="28" height="20" rx="3" fill="#ffffff" stroke="#1e3a8a" strokeWidth="2" />
          <circle cx="48" cy="28" r="8" fill="#1e3a8a" />
        </svg>
        <div>
          <div className="bold" style={{ fontSize: 15, marginBottom: 4 }}>Small steps today, big changes tomorrow.</div>
          <div className="small muted">
            You've applied to {stats.totalApplications.value} job{stats.totalApplications.value === 1 ? '' : 's'}. Keep the momentum going — every application brings you closer.
          </div>
        </div>
      </div>
    </JobSeekerLayout>
  );
}
