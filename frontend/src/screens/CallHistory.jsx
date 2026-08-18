import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, JobSeekerBottomNav, EmployerBottomNav } from '../components/Shared';
import { PhoneIcon, ShieldCheck, FilterIcon } from '../components/Icons';
import ThreeDotMenu from '../components/ThreeDotMenu';
import NoteModal from '../components/NoteModal';
import ScheduleCallbackModal from '../components/ScheduleCallbackModal';
import FilterSheet from '../components/FilterSheet';
import { OUTCOME_OPTIONS } from '../utils/outcomes';
import { api } from '../api/client';
import { formatDateTime } from '../utils/date';

export default function CallHistory({ role }) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [campaignFilter, setCampaignFilter] = useState('all');
  const [noteTarget, setNoteTarget] = useState(null);
  const [callbackTarget, setCallbackTarget] = useState(null);

  const isEmployer = role === 'employer';

  useEffect(() => {
    setLoading(true);
    api.callHistory(filter).then((d) => setCalls(d.calls || [])).catch(() => {}).finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    if (isEmployer) api.listCampaigns().then((d) => setCampaigns(d.campaigns || [])).catch(() => {});
  }, [isEmployer]);

  const filteredCalls = useMemo(() => {
    return calls.filter((c) => {
      if (dateFrom && c.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && c.created_at.slice(0, 10) > dateTo) return false;
      if (outcomeFilter !== 'all' && c.outcome !== outcomeFilter) return false;
      if (campaignFilter !== 'all' && c.campaign_id !== campaignFilter) return false;
      return true;
    });
  }, [calls, dateFrom, dateTo, outcomeFilter, campaignFilter]);

  const filtersActive = !!dateFrom || !!dateTo || outcomeFilter !== 'all' || campaignFilter !== 'all';
  const clearFilters = () => { setDateFrom(''); setDateTo(''); setOutcomeFilter('all'); setCampaignFilter('all'); };

  const historyMenu = (c) => [
    { label: 'View Candidate Profile', disabled: !c.candidate_id, onClick: () => navigate(`/employer/campaigns/${c.campaign_id}/candidates/${c.candidate_id}`) },
    { label: 'Add Note', disabled: !c.candidate_id, onClick: () => setNoteTarget({ id: c.candidate_id, campaignId: c.campaign_id, name: c.receiver_name || 'this candidate' }) },
    { label: 'Schedule Callback', disabled: !c.candidate_id, onClick: () => setCallbackTarget({ id: c.candidate_id, campaignId: c.campaign_id, name: c.receiver_name || 'this candidate' }) },
    { label: 'Report Suspicious Call', danger: true, onClick: () => navigate('/report', { state: { callId: c.id, reportedPhone: c.receiver_phone } }) },
  ];

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <div className="row-between mb-16" style={{ flexWrap: 'wrap', gap: 10 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Call History</h1>
          {isEmployer && (
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => navigate('/employer/make-call')}>
                New Call
              </button>
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
                title="Filter Calls"
              >
                <label>Date From</label>
                <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                <label>Date To</label>
                <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                <label>Call Type</label>
                <div className="filter-pill-group">
                  {[['all', 'All Calls'], ['clearcall', 'Verified Only'], ['normal', 'Normal Only']].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={`filter-pill ${filter === key ? 'active' : ''}`}
                      onClick={() => setFilter(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label>Outcome</label>
                <select value={outcomeFilter} onChange={(e) => setOutcomeFilter(e.target.value)}>
                  <option value="all">All Outcomes</option>
                  {OUTCOME_OPTIONS.map((o) => <option key={o.label} value={o.label}>{o.emoji} {o.label}</option>)}
                </select>
                <label>Campaign</label>
                <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
                  <option value="all">All campaigns</option>
                  {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </FilterSheet>
              </div>
            </div>
          )}
        </div>

        <div className="pill-tabs">
          {[['all', 'All Calls'], ['clearcall', 'Verified Only'], ['normal', 'Normal Only']].map(([key, label]) => (
            <button key={key} className={`pill-tab ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>{label}</button>
          ))}
        </div>

        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : calls.length === 0 ? (
          <div className="card muted small">No calls to show yet.</div>
        ) : filteredCalls.length === 0 ? (
          <div className="card muted small center">
            No calls match these filters. <button className="link small" onClick={clearFilters}>Clear Filters</button>
          </div>
        ) : (
          <div className="stack list-grid">
            {filteredCalls.map((c) => (
              <div key={c.id} className="card">
                <div className="row-between mb-8">
                  <div
                    className="row"
                    style={{ cursor: c.call_type === 'clearcall' ? 'pointer' : 'default' }}
                    onClick={() => c.call_type === 'clearcall' && c.company_id && navigate(`/company/${c.company_id}`)}
                  >
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--grey-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {c.call_type === 'clearcall' ? <ShieldCheck size={22} color="#1e3a8a" /> : <PhoneIcon size={20} />}
                    </div>
                    <div>
                      <div className="bold small">{c.company_name || c.receiver_phone || c.receiver_name}</div>
                      {c.job_role && <div className="muted xs">{c.job_role}</div>}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    <span className={`badge ${c.call_type === 'clearcall' ? 'badge-green' : 'badge-grey'}`}>
                      {c.call_type === 'clearcall' ? <><ShieldCheck size={12} color="#059669" /> ClearCall Verified</> : <><PhoneIcon size={11} /> Normal Call</>}
                    </span>
                    {isEmployer && <ThreeDotMenu options={historyMenu(c)} />}
                  </div>
                </div>
                <div className="row-between xs muted">
                  <span>{formatDateTime(c.created_at)}</span>
                  <span>{c.duration_seconds ? `${Math.floor(c.duration_seconds / 60)}m ${c.duration_seconds % 60}s` : c.call_status}</span>
                </div>
                {c.campaign_name && <div className="muted xs" style={{ marginTop: 4 }}>{c.campaign_name}{c.outcome ? ` · ${c.outcome}` : ''}</div>}
                {c.call_type === 'normal' && !isEmployer && (
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ marginTop: 10 }}
                    onClick={() => navigate('/report', { state: { callId: c.id, reportedPhone: c.receiver_phone } })}
                  >
                    Report
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      {role === 'employer' ? <EmployerBottomNav active="calls" /> : <JobSeekerBottomNav active="calls" />}

      {noteTarget && (
        <NoteModal
          candidate={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSaved={() => setNoteTarget(null)}
        />
      )}

      {callbackTarget && (
        <ScheduleCallbackModal
          name={callbackTarget.name}
          onClose={() => setCallbackTarget(null)}
          onConfirm={async (iso) => {
            await api.updateCampaignCandidate(callbackTarget.campaignId, callbackTarget.id, { outcome: 'Callback Requested', callbackAt: iso });
            setCallbackTarget(null);
          }}
        />
      )}
    </>
  );
}
