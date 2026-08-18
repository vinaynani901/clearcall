import { useEffect, useState } from 'react';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { PhoneIcon, DocumentIcon, CalendarIcon, RefreshIcon, StarIcon, ActivityIcon, DeclineIcon, KeyIcon } from '../components/Icons';
import { api } from '../api/client';
import { timeAgo } from '../utils/date';

const ACTIVITY_META = {
  verified_call: { icon: PhoneIcon, color: '#10b981', label: 'Verified Calls' },
  application_submitted: { icon: DocumentIcon, color: '#1e3a8a', label: 'Applications Submitted' },
  interview_scheduled: { icon: CalendarIcon, color: '#8b5cf6', label: 'Interviews Scheduled' },
  status_updated: { icon: RefreshIcon, color: '#f59e0b', label: 'Status Updates' },
  application_rejected: { icon: DeclineIcon, color: '#ef4444', label: 'Applications Rejected' },
  new_job_match: { icon: StarIcon, color: '#f59e0b', label: 'New Job Matches' },
  agent_connected: { icon: KeyIcon, color: '#10b981', label: 'Agent Connected' },
  key_revoked: { icon: KeyIcon, color: '#94a3b8', label: 'Key Revoked' },
};

const PAGE_SIZE = 20;

export default function JobSeekerActivity() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [filterType, setFilterType] = useState('all');

  useEffect(() => {
    setLoading(true);
    setPage(1);
    api.getJobseekerActivity({ type: filterType, page: 1, pageSize: PAGE_SIZE })
      .then((d) => { setActivity(d.activity || []); setHasMore(!!d.hasMore); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterType]);

  const loadMore = () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    api.getJobseekerActivity({ type: filterType, page: nextPage, pageSize: PAGE_SIZE })
      .then((d) => { setActivity((prev) => [...prev, ...(d.activity || [])]); setHasMore(!!d.hasMore); setPage(nextPage); })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  };

  return (
    <JobSeekerLayout active="activity">
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>Activity Feed</h1>

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ border: '2px solid var(--grey-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
          <option value="all">Show All</option>
          {Object.entries(ACTIVITY_META).map(([type, meta]) => (
            <option key={type} value={type}>{meta.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="card muted small">Loading…</div>
      ) : activity.length === 0 ? (
        <div className="card jsk-empty-state">
          <ActivityIcon size={36} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>
            {filterType === 'all'
              ? 'No activity yet. Once you start applying for jobs and receiving verified calls, everything will show up here.'
              : 'No activity of this type yet.'}
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            {activity.map((a, i) => {
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
          {hasMore && (
            <button className="btn btn-outline" style={{ width: '100%', marginTop: 14 }} onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? 'Loading…' : 'Load More'}
            </button>
          )}
        </>
      )}
    </JobSeekerLayout>
  );
}
