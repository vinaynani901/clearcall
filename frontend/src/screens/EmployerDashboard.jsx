import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, EmployerBottomNav, ErrorBanner, ConfirmDialog } from '../components/Shared';
import { ShieldCheck, SearchIcon, FilterIcon } from '../components/Icons';
import DonutChart from '../components/DonutChart';
import ThreeDotMenu from '../components/ThreeDotMenu';
import ScheduleCallbackModal from '../components/ScheduleCallbackModal';
import NoteModal from '../components/NoteModal';
import AnnouncementBanner from '../components/AnnouncementBanner';
import UsageCard, { VerifiedCallsLimitBanner } from '../components/UsageCard';
import FilterSheet from '../components/FilterSheet';
import { toAuLocal } from '../utils/phone';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { parseServerDate } from '../utils/date';

const STATUS_META = {
  connected: { label: 'Connected', className: 'badge-green' },
  in_conversation: { label: 'In Conversation', className: 'badge-blue' },
  callback: { label: 'Callback', className: 'badge-amber' },
  no_answer: { label: 'No Answer', className: 'badge-grey-light' },
  not_reached: { label: 'Not Reached', className: 'badge-grey' },
};

const CALL_STATUS_META = {
  answered: { label: 'Answered', className: 'badge-green' },
  declined: { label: 'Declined', className: 'badge-red' },
  missed: { label: 'Missed', className: 'badge-grey' },
  initiated: { label: 'In Progress', className: 'badge-blue' },
};

// Fully-shaped empty dashboard — used as the initial state and as the
// fallback if the fetch ever fails, so the dashboard always renders every
// section (never a blank screen or a bare error banner).
const EMPTY_DATA = {
  greeting: { firstName: 'there', jobTitle: null },
  todaySummary: { plannedCalls: 0, activeCampaignCount: 0 },
  stats: {
    todaysCalls: { made: 0, total: 0, pct: 0 },
    connected: { count: 0, pct: 0 },
    conversations: { count: 0 },
    callbackRequested: { count: 0 },
    avgDurationSeconds: 0,
  },
  activeCampaign: null,
  callingQueue: [],
  campaignsSummary: [],
  verification: { abnVerified: false, workEmailVerified: false },
  tasks: { callbacksDueToday: 0, newCandidatesThisWeek: 0, campaignNeedsAttention: false, campaignNeedsAttentionName: null, campaignNeedsAttentionId: null },
  recentCalls: [],
  insights: { bestTime: null, connectionRate: null, bestDay: null },
  myTeam: null,
  notifications: { unreadCount: 0 },
};

function formatDuration(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${s}s`;
}

function formatDateTime(iso) {
  const d = parseServerDate(iso);
  if (!d) return '—';
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function isToday(iso) {
  const d = parseServerDate(iso);
  if (!d) return false;
  return d.toDateString() === new Date().toDateString();
}

function isThisWeek(iso) {
  const d = parseServerDate(iso);
  if (!d) return false;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return d.getTime() >= weekAgo;
}

function StatCard({ label, value, sub, progressPct }) {
  return (
    <div className="card dash-stat-card">
      <div className="muted xs bold">{label}</div>
      <div className="dash-stat-value">{value}</div>
      {sub && <div className="muted xs" style={{ marginTop: 2 }}>{sub}</div>}
      {progressPct !== undefined && (
        <div style={{ height: 6, background: 'var(--grey-200)', borderRadius: 999, marginTop: 10, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--green)', borderRadius: 999 }} />
        </div>
      )}
    </div>
  );
}

export default function EmployerDashboard() {
  const navigate = useNavigate();
  const { company, user } = useAuth();
  const [data, setData] = useState({ ...EMPTY_DATA, greeting: { firstName: (user?.full_name || '').split(' ')[0] || 'there', jobTitle: null } });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [recentRange, setRecentRange] = useState('all'); // today | week | all
  const [noteTarget, setNoteTarget] = useState(null);
  const [callbackTarget, setCallbackTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [actionError, setActionError] = useState('');

  const load = () => api.getEmployerDashboard()
    .then(setData)
    // A failed fetch never blanks the dashboard — it just keeps whatever
    // shape we already have (the fully-populated EMPTY_DATA on first load).
    .catch((err) => console.error('[dashboard] failed to load, showing empty state:', err))
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const { greeting, todaySummary, stats, activeCampaign, verification, tasks, recentCalls, insights, campaignsSummary, myTeam } = data;

  const hasAnyCampaign = campaignsSummary.length > 0;

  const filteredQueue = useMemo(() => {
    return data.callingQueue.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (campaignFilter !== 'all' && row.campaignId !== campaignFilter) return false;
      if (dateFilter && (row.lastActionAt || '').slice(0, 10) !== dateFilter) return false;
      if (search && !`${row.name} ${row.phone}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [data.callingQueue, search, statusFilter, campaignFilter, dateFilter]);

  const filteredRecentCalls = useMemo(() => {
    if (recentRange === 'today') return recentCalls.filter((c) => isToday(c.created_at));
    if (recentRange === 'week') return recentCalls.filter((c) => isThisWeek(c.created_at));
    return recentCalls;
  }, [recentCalls, recentRange]);

  const filtersActive = statusFilter !== 'all' || campaignFilter !== 'all' || !!dateFilter;
  const clearFilters = () => { setStatusFilter('all'); setCampaignFilter('all'); setDateFilter(''); };

  const hour = new Date().getHours();
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const nextToCall = data.callingQueue.find((r) => r.callStatus === 'not_called');

  const continueCalling = () => {
    if (nextToCall) navigate(`/employer/campaigns/${nextToCall.campaignId}/candidates/${nextToCall.id}`);
    else if (activeCampaign) navigate(`/employer/campaigns/${activeCampaign.id}`);
  };

  const callCandidateNow = (row) => {
    navigate('/employer/make-call', {
      state: {
        prefill: { receiverName: row.name, receiverPhone: toAuLocal(row.phone), jobRole: row.jobRole || '', note: '' },
        campaignId: row.campaignId,
        candidateId: row.id,
      },
    });
  };

  const runAction = async (fn) => {
    setActionError('');
    try {
      await fn();
      load();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const queueRowMenu = (row) => [
    { label: 'View Full Profile', onClick: () => navigate(`/employer/campaigns/${row.campaignId}/candidates/${row.id}`) },
    { label: 'Call Now', onClick: () => callCandidateNow(row) },
    { label: 'Add Note', onClick: () => setNoteTarget(row) },
    { label: 'Schedule Callback', onClick: () => setCallbackTarget({ id: row.id, campaignId: row.campaignId, name: row.name }) },
    { label: 'Skip for Now', onClick: () => runAction(() => api.skipCandidate(row.campaignId, row.id)) },
    { label: 'Remove from Queue', danger: true, onClick: () => setRemoveTarget(row) },
  ];

  const recentCallMenu = (c) => [
    { label: 'View Candidate Profile', disabled: !c.candidate_id, onClick: () => navigate(`/employer/campaigns/${c.campaign_id}/candidates/${c.candidate_id}`) },
    { label: 'Add Note', disabled: !c.candidate_id, onClick: () => setNoteTarget({ id: c.candidate_id, campaignId: c.campaign_id, name: c.receiver_name || 'this candidate' }) },
    { label: 'Schedule Callback', disabled: !c.candidate_id, onClick: () => setCallbackTarget({ id: c.candidate_id, campaignId: c.campaign_id, name: c.receiver_name || 'this candidate' }) },
    { label: 'Report Issue', onClick: () => navigate('/report', { state: { callId: c.id } }) },
  ];

  const donutSegments = activeCampaign ? [
    { label: 'Connected', value: activeCampaign.donut.connected, color: 'var(--green)' },
    { label: 'In Conversation', value: activeCampaign.donut.in_conversation, color: '#3b82f6' },
    { label: 'Callback', value: activeCampaign.donut.callback, color: 'var(--amber)' },
    { label: 'Not Reached', value: activeCampaign.donut.not_reached, color: 'var(--grey-400)' },
  ] : [];

  const allTasksClear = tasks.callbacksDueToday === 0 && tasks.newCandidatesThisWeek === 0 && !tasks.campaignNeedsAttention;

  return (
    <>
      <StatusBar />
      <div className="screen dash-screen">
        <ErrorBanner message={actionError} />
        <AnnouncementBanner />
        <VerifiedCallsLimitBanner />

        {/* Greeting */}
        <div className="mb-24">
          <div className="dash-greeting">{timeGreeting}, {greeting.firstName} 👋</div>
          {hasAnyCampaign ? (
            <div className="muted small" style={{ marginTop: 4 }}>
              You have {todaySummary.plannedCalls} call{todaySummary.plannedCalls === 1 ? '' : 's'} planned today
              {todaySummary.activeCampaignCount > 0 && ` across ${todaySummary.activeCampaignCount} campaign${todaySummary.activeCampaignCount === 1 ? '' : 's'}`}.
            </div>
          ) : (
            <div className="muted small" style={{ marginTop: 4 }}>
              Your day is ready to go. Start a campaign to make your first verified call.
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="dash-stats-row mb-24">
          <StatCard label="TODAY'S CALLS" value={`${stats.todaysCalls.made} of ${stats.todaysCalls.total}`} sub={`${stats.todaysCalls.pct}% completed`} progressPct={stats.todaysCalls.pct} />
          <StatCard label="CONNECTED" value={stats.connected.count} sub={`${stats.connected.pct}% of total calls`} />
          <StatCard label="CONVERSATIONS" value={stats.conversations.count} sub="Longer than 60 seconds" />
          <StatCard label="CALLBACK REQUESTED" value={stats.callbackRequested.count} sub="Today" />
          <StatCard label="AVG CALL DURATION" value={stats.avgDurationSeconds ? formatDuration(stats.avgDurationSeconds) : '—'} sub="Answered calls" />
        </div>

        <div className="dash-columns">
          <div className="dash-main-col">
            {/* Active campaign */}
            {activeCampaign ? (
              <div className="card mb-24">
                <div className="dash-campaign-header">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 20, fontWeight: 800 }}>{activeCampaign.name}</div>
                    <div className="muted small" style={{ marginTop: 4 }}>
                      {activeCampaign.candidateCount} candidates · Created {parseServerDate(activeCampaign.createdAt)?.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) || '—'}
                    </div>

                    {activeCampaign.progress.called === 0 ? (
                      <div className="muted small" style={{ marginTop: 20, marginBottom: 6 }}>No calls made yet — tap Continue Calling to start.</div>
                    ) : (
                      <div className="row-between small" style={{ marginTop: 20, marginBottom: 6 }}>
                        <span className="bold">{activeCampaign.progress.called} of {activeCampaign.progress.total} completed</span>
                      </div>
                    )}
                    <div style={{ height: 8, background: 'var(--grey-200)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${activeCampaign.progress.total ? Math.round((activeCampaign.progress.called / activeCampaign.progress.total) * 100) : 0}%`,
                        background: 'var(--green)', borderRadius: 999,
                      }} />
                    </div>

                    <div className="row" style={{ gap: 12, marginTop: 24 }}>
                      <button className="btn btn-primary" style={{ width: 'auto', flex: 1 }} onClick={continueCalling}>Continue Calling</button>
                      <button className="btn btn-outline" style={{ width: 'auto', flex: 1 }} onClick={() => navigate(`/employer/campaigns/${activeCampaign.id}`)}>Campaign Details</button>
                    </div>
                  </div>

                  <div className="dash-donut-wrap">
                    <DonutChart segments={donutSegments} centerLabel={activeCampaign.donut.total} centerSubLabel="candidates" />
                    <div className="dash-donut-legend">
                      {donutSegments.map((s) => (
                        <div key={s.label} className="dash-legend-item">
                          <span className="dash-legend-dot" style={{ background: s.color }} />
                          <span className="small">{s.label}</span>
                          <span className="bold small" style={{ marginLeft: 'auto' }}>{s.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="card mb-24 center" style={{ padding: 32 }}>
                <div className="muted small" style={{ marginBottom: 16 }}>No active campaigns yet. Upload your first candidate list to get started</div>
                <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate('/employer/campaigns')}>Upload Candidate List</button>
              </div>
            )}

            {/* Calling queue */}
            <div className="card">
              <div className="row-between mb-16" style={{ flexWrap: 'wrap', gap: 12 }}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="bold" style={{ fontSize: 15 }}>Calling Queue</span>
                  <span className="badge badge-blue">{data.callingQueue.filter((r) => r.callStatus === 'not_called').length} left to call</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <span style={{ position: 'absolute', left: 10, display: 'flex' }}>
                      <SearchIcon size={15} color="#94a3b8" />
                    </span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search candidates…"
                      style={{ padding: '8px 10px 8px 32px', border: '2px solid var(--grey-200)', borderRadius: 8, fontSize: 13 }}
                    />
                  </div>
                  <div className="filter-panel-wrap">
                    <button
                      className="btn btn-outline btn-sm"
                      style={{ width: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={() => setFilterPanelOpen((o) => !o)}
                    >
                      <FilterIcon size={15} /> Filter{filtersActive ? ' •' : ''}
                    </button>
                    <FilterSheet
                      open={filterPanelOpen}
                      onClose={() => setFilterPanelOpen(false)}
                      onClear={clearFilters}
                      title="Filter Calling Queue"
                    >
                      <label>Status</label>
                      <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">All statuses</option>
                        {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                      </select>
                      <label>Campaign</label>
                      <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                        <option value="all">All campaigns</option>
                        {campaignsSummary.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <label>Date</label>
                      <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
                    </FilterSheet>
                  </div>
                </div>
              </div>

              {data.callingQueue.length === 0 ? (
                <div className="muted small center" style={{ padding: 24 }}>
                  Your calling queue is empty. Upload a candidate list to your campaign to begin.
                </div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="dash-table">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Candidate</th>
                          <th>Role</th>
                          <th>Campaign</th>
                          <th>Status</th>
                          <th>Last Action</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredQueue.map((row, i) => (
                          <tr key={row.id}>
                            <td className="muted small">{i + 1}</td>
                            <td>
                              <div className="bold small">{row.name}</div>
                              <div className="muted xs">{row.phone}</div>
                            </td>
                            <td className="small">{row.jobRole || '—'}</td>
                            <td className="small">{row.campaignName || '—'}</td>
                            <td><span className={`badge ${STATUS_META[row.status].className} xs`}>{STATUS_META[row.status].label}</span></td>
                            <td className="muted xs">{formatDateTime(row.lastActionAt)}</td>
                            <td style={{ textAlign: 'right' }}><ThreeDotMenu options={queueRowMenu(row)} /></td>
                          </tr>
                        ))}
                        {filteredQueue.length === 0 && (
                          <tr><td colSpan={7} className="muted small center" style={{ padding: 20 }}>No candidates match this search/filter. <button className="link small" onClick={() => { clearFilters(); setSearch(''); }}>Clear Filters</button></td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {activeCampaign && (
                    <div className="center" style={{ marginTop: 16 }}>
                      <button className="link small" onClick={() => navigate(`/employer/campaigns/${activeCampaign.id}`)}>View Full Campaign</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="dash-side-col">
            <div className="dash-verified-card mb-16">
              {verification.abnVerified && verification.workEmailVerified ? (
                <>
                  <ShieldCheck size={32} color="#10b981" />
                  <div className="bold" style={{ color: '#10b981', marginTop: 10, fontSize: 15 }}>You are Verified</div>
                  <div style={{ color: '#fff', fontSize: 13, marginTop: 4 }}>Your business is verified and trusted</div>
                  <div className="stack" style={{ gap: 6, marginTop: 14 }}>
                    <div className="row small" style={{ color: '#6ee7b7', gap: 6 }}>✓ ABN Verified</div>
                    <div className="row small" style={{ color: '#6ee7b7', gap: 6 }}>✓ Work Email Verified</div>
                  </div>
                </>
              ) : (
                <>
                  <ShieldCheck size={32} color="#f59e0b" />
                  <div className="bold" style={{ color: '#f59e0b', marginTop: 10, fontSize: 15 }}>Verification Pending</div>
                  <div style={{ color: '#fff', fontSize: 13, marginTop: 4 }}>Complete verification to unlock full trust with candidates</div>
                  <div className="stack" style={{ gap: 6, marginTop: 14 }}>
                    <div className="row small" style={{ color: verification.abnVerified ? '#6ee7b7' : '#c7d2fe', gap: 6 }}>{verification.abnVerified ? '✓' : '○'} ABN Verified</div>
                    <div className="row small" style={{ color: verification.workEmailVerified ? '#6ee7b7' : '#c7d2fe', gap: 6 }}>{verification.workEmailVerified ? '✓' : '○'} Work Email Verified</div>
                  </div>
                </>
              )}
              <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 16, borderColor: '#fff', color: '#fff' }} onClick={() => company?.id && navigate(`/company/${company.id}`)}>
                View Verification
              </button>
            </div>

            <UsageCard />

            {myTeam && (
              <div className="card mb-16">
                <div className="row-between mb-12">
                  <span className="bold small">My Team</span>
                  <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={() => navigate('/employer/team')}>
                    View Team
                  </button>
                </div>
                <div className="row-between small" style={{ marginBottom: 8 }}>
                  <span className="muted">Active members today</span>
                  <span className="bold">{myTeam.activeToday} of {myTeam.totalMembers}</span>
                </div>
                <div className="row-between small">
                  <span className="muted">Currently making calls</span>
                  <span className="bold" style={{ color: myTeam.onCallNow > 0 ? 'var(--green)' : undefined }}>
                    {myTeam.onCallNow > 0 && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--green)', marginRight: 6 }} />}
                    {myTeam.onCallNow}
                  </span>
                </div>
              </div>
            )}

            <div className="card mb-16">
              <div className="row-between mb-12">
                <span className="bold small">Today's Tasks</span>
                <button className="link xs" onClick={() => navigate('/employer/campaigns')}>View All</button>
              </div>
              {allTasksClear ? (
                <div className="row small" style={{ gap: 8, padding: '6px 4px', color: 'var(--green)' }}>
                  <span>✓</span> All caught up — no tasks pending today
                </div>
              ) : (
                <div className="stack" style={{ gap: 2 }}>
                  {tasks.callbacksDueToday === 0 ? (
                    <div className="row small" style={{ gap: 8, padding: '10px 4px', color: 'var(--green)' }}>
                      <span>✓</span> No callbacks scheduled for today — great work
                    </div>
                  ) : (
                    <button className="dash-task-row" onClick={() => navigate('/employer/campaigns')}>
                      <div>
                        <div className="small bold">Callbacks Due <span className="muted">({tasks.callbacksDueToday})</span></div>
                        <div className="muted xs">Follow up with candidates</div>
                      </div>
                      <span className="muted">›</span>
                    </button>
                  )}
                  {tasks.newCandidatesThisWeek > 0 && (
                    <button className="dash-task-row" onClick={() => navigate('/employer/campaigns')}>
                      <div>
                        <div className="small bold">New Candidates <span className="muted">({tasks.newCandidatesThisWeek})</span></div>
                        <div className="muted xs">Added to your campaigns</div>
                      </div>
                      <span className="muted">›</span>
                    </button>
                  )}
                  {tasks.campaignNeedsAttention && (
                    <button className="dash-task-row" onClick={() => navigate(`/employer/campaigns/${tasks.campaignNeedsAttentionId}`)}>
                      <div>
                        <div className="small bold">{tasks.campaignNeedsAttentionName}</div>
                        <div className="muted xs">Needs your attention</div>
                      </div>
                      <span className="muted">›</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <div className="row-between mb-12">
                <span className="bold small">Recent Calls</span>
                <select value={recentRange} onChange={(e) => setRecentRange(e.target.value)} style={{ border: '2px solid var(--grey-200)', borderRadius: 8, fontSize: 12, padding: '5px 8px' }}>
                  <option value="today">Today</option>
                  <option value="week">This Week</option>
                  <option value="all">All Time</option>
                </select>
              </div>
              {filteredRecentCalls.length === 0 ? (
                <div className="muted small">
                  {recentCalls.length === 0 ? 'No calls yet. Once you start making verified calls they will appear here.' : 'No calls in this range.'}
                </div>
              ) : (
                <div className="stack" style={{ gap: 10 }}>
                  {filteredRecentCalls.map((c) => (
                    <div key={c.id} className="row-between">
                      <div className="row" style={{ gap: 8 }}>
                        <div className="dash-avatar-sm">{initials(c.receiver_name)}</div>
                        <div>
                          <div className="small bold">{c.receiver_name || 'Unknown'}</div>
                          <div className="muted xs">{c.job_role || '—'} · {formatDateTime(c.created_at)}</div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 4 }}>
                        <span className={`badge ${(CALL_STATUS_META[c.call_status] || CALL_STATUS_META.initiated).className} xs`}>
                          {(CALL_STATUS_META[c.call_status] || CALL_STATUS_META.initiated).label}
                        </span>
                        <ThreeDotMenu options={recentCallMenu(c)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button className="btn btn-grey btn-sm" style={{ width: '100%', marginTop: 16 }} onClick={() => navigate('/employer/calls')}>
                View Call History
              </button>
            </div>
          </div>
        </div>

        {/* Insights */}
        <div className="mb-16" style={{ marginTop: 24 }}>
          <div className="bold" style={{ fontSize: 16 }}>Insights for You</div>
        </div>
        <div className="dash-insights-row">
          <div className="card">
            <div className="muted xs bold mb-8">BEST CALLING TIME</div>
            {insights.bestTime ? (
              <>
                <div className="small">You're most effective between <span className="bold">{insights.bestTime.label}</span></div>
                <div className="muted xs" style={{ marginTop: 6 }}>Keep calling during this window — {insights.bestTime.answerRate}% answer rate.</div>
              </>
            ) : (
              <div className="muted small">Make more calls to unlock this insight</div>
            )}
          </div>
          <div className="card">
            <div className="muted xs bold mb-8">CONNECTION RATE</div>
            {insights.connectionRate ? (
              <>
                <div className="small">Your connection rate is <span className="bold">{insights.connectionRate.myRatePct}%</span></div>
                <div className="muted xs" style={{ marginTop: 6 }}>
                  {insights.connectionRate.diffPct === null
                    ? 'Not enough teammate history yet to compare.'
                    : insights.connectionRate.diffPct >= 0
                      ? `${insights.connectionRate.diffPct}% higher than your team average.`
                      : `${Math.abs(insights.connectionRate.diffPct)}% lower than your team average.`}
                </div>
              </>
            ) : (
              <div className="muted small">Make more calls to unlock this insight</div>
            )}
          </div>
          <div className="card">
            <div className="muted xs bold mb-8">BEST DAY</div>
            {insights.bestDay ? (
              <>
                <div className="small"><span className="bold">{insights.bestDay.day}</span> is your best day</div>
                <div className="muted xs" style={{ marginTop: 6 }}>You connect {insights.bestDay.diffPct}% more candidates compared to other days.</div>
              </>
            ) : (
              <div className="muted small">Make more calls to unlock this insight</div>
            )}
          </div>
        </div>
      </div>
      <EmployerBottomNav active="dashboard" />

      {noteTarget && (
        <NoteModal
          candidate={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSaved={() => { setNoteTarget(null); load(); }}
        />
      )}

      {callbackTarget && (
        <ScheduleCallbackModal
          name={callbackTarget.name}
          onClose={() => setCallbackTarget(null)}
          onConfirm={async (iso) => {
            await api.updateCampaignCandidate(callbackTarget.campaignId, callbackTarget.id, { outcome: 'Callback Requested', callbackAt: iso });
            setCallbackTarget(null);
            load();
          }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove from queue?"
          message={`Remove ${removeTarget.name} from this campaign's calling queue? This cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={() => { setRemoveTarget(null); runAction(() => api.removeCandidate(removeTarget.campaignId, removeTarget.id)); }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </>
  );
}
