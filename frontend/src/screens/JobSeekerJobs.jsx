import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { SearchIcon, BuildingIcon, BookmarkIcon } from '../components/Icons';
import { ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { parseServerDate } from '../utils/date';

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = parseServerDate(ts);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / 86400000);
  if (days < 1) return 'Today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function salaryText(job) {
  if (job.salaryRange) return job.salaryRange;
  if (job.salaryMin && job.salaryMax) return `$${Math.round(job.salaryMin).toLocaleString()} - $${Math.round(job.salaryMax).toLocaleString()}`;
  if (job.salaryMin) return `From $${Math.round(job.salaryMin).toLocaleString()}`;
  return null;
}

const SALARY_OPTIONS = [
  { value: '', label: 'Any salary' },
  { value: '50000', label: '$50,000+' },
  { value: '70000', label: '$70,000+' },
  { value: '90000', label: '$90,000+' },
  { value: '110000', label: '$110,000+' },
  { value: '130000', label: '$130,000+' },
];

export default function JobSeekerJobs() {
  const { state } = useLocation();
  const [q, setQ] = useState('');
  const [location, setLocation] = useState('');
  const [jobType, setJobType] = useState('');
  const [salaryMin, setSalaryMin] = useState('');
  const [industry, setIndustry] = useState('');
  const [industries, setIndustries] = useState([]);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [results, setResults] = useState({ clearcallJobs: [], externalJobs: [], externalConfigured: false, externalError: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bookmarks, setBookmarks] = useState([]);
  const [applyingId, setApplyingId] = useState(null);
  const [appliedIds, setAppliedIds] = useState(new Set());
  const [detailJob, setDetailJob] = useState(state?.openJob || null);

  const search = () => {
    setLoading(true);
    setError('');
    api.searchJobs({ q, location, jobType, salaryMin, industry, verifiedOnly: verifiedOnly ? 'true' : undefined })
      .then(setResults)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { search(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced live search — a new request fires 500ms after the person
  // stops typing in the keyword or location box, instead of only on Enter
  // or the Search button. Skips the very first render (the mount effect
  // above already covers the initial load) so we don't double-fetch.
  const skipNextDebounce = useRef(true);
  useEffect(() => {
    if (skipNextDebounce.current) { skipNextDebounce.current = false; return; }
    const timer = setTimeout(() => { search(); }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, location]);

  useEffect(() => {
    api.listBookmarks().then((d) => setBookmarks(d.bookmarks || [])).catch(() => {});
    api.listIndustries().then((d) => setIndustries(d.industries || [])).catch(() => {});
  }, []);

  const isBookmarked = (job) => bookmarks.some((b) => (job.source === 'clearcall' ? b.jobId === job.id : b.externalKey === job.id));

  const toggleBookmark = async (job) => {
    const existing = bookmarks.find((b) => (job.source === 'clearcall' ? b.jobId === job.id : b.externalKey === job.id));
    try {
      if (existing) {
        await api.removeBookmark(existing.id);
        setBookmarks((bm) => bm.filter((b) => b.id !== existing.id));
      } else {
        const { bookmark } = await api.addBookmark({ jobSource: job.source, jobId: job.source === 'clearcall' ? job.id : null, externalKey: job.source === 'external' ? job.id : null, job });
        setBookmarks((bm) => [...bm, bookmark]);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const applyNow = async (job) => {
    if (job.source === 'external') {
      // Opens the real listing immediately — this must not wait on the
      // network call below, since the browser only allows window.open to
      // count as user-triggered (and dodge popup blockers) when called
      // synchronously inside the click handler.
      window.open(job.applyUrl, '_blank', 'noopener,noreferrer');

      setApplyingId(job.id);
      setError('');
      try {
        await api.applyToExternalJob({
          externalId: job.id,
          title: job.title,
          companyName: job.companyName,
          location: job.location,
          salaryRange: salaryText(job),
          applyUrl: job.applyUrl,
        });
        setAppliedIds((s) => new Set([...s, job.id]));
      } catch (err) {
        // Already-applied (409) isn't really an error from the person's
        // perspective — just reflect the applied state and move on.
        if (err.status === 409) setAppliedIds((s) => new Set([...s, job.id]));
        else setError(err.message);
      } finally {
        setApplyingId(null);
      }
      return;
    }
    setApplyingId(job.id);
    setError('');
    try {
      await api.applyToJob(job.id);
      setAppliedIds((s) => new Set([...s, job.id]));
    } catch (err) {
      if (err.status === 409) setAppliedIds((s) => new Set([...s, job.id]));
      else setError(err.message);
    } finally {
      setApplyingId(null);
    }
  };

  const allJobs = useMemo(() => [...results.clearcallJobs, ...results.externalJobs], [results]);

  return (
    <JobSeekerLayout active="jobs">
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>Job Search</h1>

      <ErrorBanner message={error} />

      <div className="card mb-16">
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><SearchIcon size={15} /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Job title or keyword" style={{ width: '100%', padding: '10px 12px 10px 36px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 14 }} />
          </div>
          <input value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Location" style={{ flex: '1 1 160px', padding: '10px 12px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 14 }} />
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={search}>Search</button>
        </div>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap', marginTop: 14 }}>
          <select value={jobType} onChange={(e) => setJobType(e.target.value)} style={{ border: '2px solid var(--grey-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
            <option value="">Any job type</option>
            <option value="full_time">Full Time</option>
            <option value="part_time">Part Time</option>
            <option value="casual">Casual</option>
            <option value="contract">Contract</option>
          </select>
          <select value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} style={{ border: '2px solid var(--grey-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
            {SALARY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={{ border: '2px solid var(--grey-200)', borderRadius: 8, padding: '8px 10px', fontSize: 13 }}>
            <option value="">Any industry</option>
            {industries.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <label className="row small" style={{ gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={verifiedOnly} onChange={(e) => setVerifiedOnly(e.target.checked)} />
            ClearCall Verified only
          </label>
          <button className="link small" onClick={search}>Apply Filters</button>
        </div>
      </div>

      {results.externalError && (
        <div className="card mb-16" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <span className="small" style={{ color: '#b45309' }}>
            External jobs are temporarily unavailable, but ClearCall Verified jobs are still showing below.
          </span>
        </div>
      )}

      {!results.externalConfigured && !results.externalError && results.clearcallJobs.length === 0 && !loading && (
        <div className="card muted small mb-16">
          External job search isn't connected yet, and there are no ClearCall Direct postings matching your search right now. Try a different search, or check back soon.
        </div>
      )}

      {loading ? (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 16px' }}>
          <div className="spinner" style={{ width: 30, height: 30, borderWidth: 3 }} />
          <div className="muted small">Searching…</div>
        </div>
      ) : allJobs.length === 0 ? (
        <div className="card jsk-empty-state">
          <BuildingIcon size={36} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>No jobs matched your search. Try broadening your keywords or location.</div>
        </div>
      ) : (
        <div className="stack">
          {allJobs.map((job) => (
            <div key={job.id} className="card" style={{ position: 'relative' }}>
              <button className="jsk-job-bookmark" style={{ position: 'absolute', top: 16, right: 16 }} onClick={() => toggleBookmark(job)}>
                <BookmarkIcon size={18} filled={isBookmarked(job)} color={isBookmarked(job) ? '#1e3a8a' : '#94a3b8'} />
              </button>
              {job.verified && <span className="badge badge-green" style={{ marginBottom: 10 }}>ClearCall Verified</span>}
              <div className="row" style={{ gap: 12, alignItems: 'flex-start' }} onClick={() => setDetailJob(job)}>
                <div className="jsk-job-logo" style={{ cursor: 'pointer' }}>{initials(job.companyName)}</div>
                <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                  <div className="bold" style={{ fontSize: 15 }}>{job.title}</div>
                  <div className="muted small">{job.companyName}</div>
                  <div className="muted xs" style={{ marginTop: 4 }}>
                    {job.location}{job.employmentType ? ` · ${job.employmentType}` : ''}
                  </div>
                  {salaryText(job) && <div className="small bold" style={{ color: 'var(--green-dark)', marginTop: 4 }}>{salaryText(job)}</div>}
                  {job.skills?.length > 0 && (
                    <div className="jsk-job-skills" style={{ marginTop: 8 }}>
                      {job.skills.map((s) => <span key={s} className="tagset-preview-badge">{s}</span>)}
                    </div>
                  )}
                  <div className="muted xs" style={{ marginTop: 6 }}>Posted {timeAgo(job.postedAt)}</div>
                </div>
              </div>
              <button
                className="btn btn-primary btn-sm"
                style={{ width: 'auto', marginTop: 12 }}
                disabled={applyingId === job.id || appliedIds.has(job.id)}
                onClick={() => applyNow(job)}
              >
                {appliedIds.has(job.id) ? 'Applied ✓' : applyingId === job.id ? 'Applying…' : job.source === 'external' ? 'Apply Now (External)' : 'Apply Now'}
              </button>
            </div>
          ))}
        </div>
      )}

      {detailJob && (
        <div className="sheet-backdrop" onClick={() => setDetailJob(null)}>
          <div className="sheet" style={{ borderRadius: 20, maxWidth: 480, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="bold" style={{ fontSize: 17, marginBottom: 2 }}>{detailJob.title}</div>
            <div className="muted small" style={{ marginBottom: 12 }}>{detailJob.companyName} · {detailJob.location}</div>
            <div className="small" style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {detailJob.description || 'No further description available.'}
            </div>
            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-grey" onClick={() => setDetailJob(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => { applyNow(detailJob); setDetailJob(null); }}>
                {detailJob.source === 'external' ? 'Apply Now (External)' : 'Apply Now'}
              </button>
            </div>
          </div>
        </div>
      )}
    </JobSeekerLayout>
  );
}
