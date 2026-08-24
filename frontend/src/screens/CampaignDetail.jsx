import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner, ConfirmDialog } from '../components/Shared';
import ThreeDotMenu from '../components/ThreeDotMenu';
import NoteModal from '../components/NoteModal';
import { toAuLocal } from '../utils/phone';
import { resolveCandidateName } from '../utils/columnMapping';
import { api } from '../api/client';
import { formatTime, formatDate } from '../utils/date';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function formatCalledAt(iso) {
  if (!iso) return '';
  return formatTime(iso, { hour: 'numeric', minute: '2-digit' });
}

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [noteTarget, setNoteTarget] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [deliveryStarting, setDeliveryStarting] = useState(false);
  const [nextSending, setNextSending] = useState(null);

  const isDelivery = campaign?.campaign_type === 'delivery' || campaign?.campaign_type === 'active_delivery';
  const isActiveDelivery = campaign?.campaign_type === 'active_delivery';

  const deliveryColor = (pref) => {
    if (!pref) return 'var(--grey-300)';
    const map = { DOOR: 'var(--green)', HOME: 'var(--blue)', HOLD: 'var(--orange)', SAFE: 'var(--green)', NEIGHBOUR: 'var(--blue)' };
    return map[pref] || 'var(--grey-300)';
  };

  const deliveryLabel = (pref) => {
    if (!pref) return 'No reply';
    const map = { DOOR: 'Leave at Door', HOME: 'Will be Home', HOLD: 'Reschedule', SAFE: 'Safe Place', NEIGHBOUR: 'Neighbour' };
    return map[pref] || pref;
  };

  const handleStartDelivery = async () => {
    setDeliveryStarting(true);
    setError('');
    try {
      await api.startDeliveryRun(id);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeliveryStarting(false);
    }
  };

  const handleNextDelivery = async (candidateId) => {
    setNextSending(candidateId);
    setError('');
    try {
      await api.nextDeliverySms(id, candidateId);
    } catch (err) {
      setError(err.message);
    } finally {
      setNextSending(null);
    }
  };

  const load = () => api.getCampaign(id)
    .then((d) => { setCampaign(d.campaign); setBatches(d.batches || []); })
    .catch(() => {})
    .finally(() => setLoading(false));
  useEffect(() => { load(); }, [id]);

  const callNow = (c) => {
    const { name } = resolveCandidateName(c);
    navigate('/employer/make-call', {
      state: {
        prefill: {
          receiverName: name,
          receiverPhone: toAuLocal(c.phone),
          jobRole: c.job_role || '',
          note: c.extra_data?.Notes || c.extra_data?.notes || c.notes || '',
        },
        campaignId: id,
        candidateId: c.id,
      },
    });
  };

  const runAction = async (fn) => {
    setError('');
    try {
      await fn();
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const candidateMenu = (c, { includeCallNow }) => {
    const { name } = resolveCandidateName(c);
    const options = [
      { label: 'View Profile', onClick: () => navigate(`/employer/campaigns/${id}/candidates/${c.id}`) },
    ];
    if (includeCallNow) options.push({ label: 'Call Now', onClick: () => callNow(c) });
    options.push(
      { label: 'Add Note', onClick: () => setNoteTarget({ id: c.id, campaignId: id, name, notes: c.notes }) },
      { label: 'Mark as Not Suitable', onClick: () => runAction(() => api.updateCampaignCandidate(id, c.id, { outcome: 'Not Suitable' })) },
      { label: 'Remove from Campaign', danger: true, onClick: () => setRemoveTarget({ id: c.id, name }) },
    );
    return options;
  };

  const download = async () => {
    setDownloading(true);
    setError('');
    try {
      await api.downloadCampaignResults(id);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Campaign" onBack={() => navigate('/employer/campaigns')} /><div className="muted small">Loading…</div></div></>);
  }
  if (!campaign) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Campaign" onBack={() => navigate('/employer/campaigns')} /><div className="card muted small">Campaign not found.</div></div></>);
  }

  // "Next to call" only applies to the batch whose call day has arrived —
  // future-dated lists aren't callable yet, so nothing in them is "next".
  const callableBatch = batches.find((b) => b.call_date <= todayIso());
  const nextCandidateId = callableBatch
    ? callableBatch.candidates.find((c) => c.call_status === 'not_called')?.id
    : null;
  const calledCount = callableBatch ? callableBatch.candidates.filter((c) => c.call_status !== 'not_called').length : 0;
  const pendingCount = callableBatch ? callableBatch.candidates.length - calledCount : 0;
  const progressPct = callableBatch && callableBatch.candidates.length
    ? Math.round((calledCount / callableBatch.candidates.length) * 100)
    : 0;

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title={campaign.name} onBack={() => navigate('/employer/campaigns')} />

        <ErrorBanner message={error} />

        {isDelivery && (
          <div className="card mb-16" style={{ border: '2px solid var(--blue)', background: 'var(--blue-bg, #f0f7ff)' }}>
            <div className="bold mb-8" style={{ fontSize: 15, color: 'var(--blue)' }}>🚚 Delivery Mode</div>
            {!isActiveDelivery ? (
              <button className="btn btn-primary" onClick={handleStartDelivery} disabled={deliveryStarting}>
                {deliveryStarting ? 'Starting delivery run…' : 'Start Delivery Run'}
              </button>
            ) : (
              <div className="muted xs mb-8">Delivery run is active. Send next-stop SMS to each customer as the driver completes each delivery.</div>
            )}
          </div>
        )}

        {callableBatch && callableBatch.candidates.length > 0 && (
          <div className="card mb-16">
            <div className="row-between mb-8">
              <div className="bold small">Today's Progress</div>
              <div className="muted xs">{calledCount} called · {pendingCount} pending</div>
            </div>
            <div style={{ height: 8, background: 'var(--grey-200)', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progressPct}%`, background: 'var(--green)', borderRadius: 999, transition: 'width 0.3s ease' }} />
            </div>
          </div>
        )}

        <div className="center mb-16">
          <button className="link small" onClick={download} disabled={downloading}>
            {downloading ? 'Preparing file…' : 'Download Results (.xlsx)'}
          </button>
        </div>

        <div className="stack">
          {batches.map((batch) => {
            const pending = batch.candidates.filter((c) => c.call_status === 'not_called');
            const completed = batch.candidates.filter((c) => c.call_status !== 'not_called');
            return (
              <div key={batch.id} className="card">
                <div className="row-between mb-8">
                  <div className="bold small">{formatDate(batch.call_date, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
                  <span className="badge badge-grey">{batch.candidates.length} candidate{batch.candidates.length === 1 ? '' : 's'}</span>
                </div>

                <div className="stack" style={{ gap: 2 }}>
                  {pending.map((c) => (
                    <div
                      key={c.id}
                      className="row-between"
                      style={{ padding: '10px 4px', borderBottom: '1px solid var(--grey-100)' }}
                    >
                      <div style={{ cursor: 'pointer', flex: 1, minWidth: 0 }} onClick={() => navigate(`/employer/campaigns/${id}/candidates/${c.id}`)}>
                        <div className="row" style={{ gap: 6 }}>
                          <span className="bold small">{resolveCandidateName(c).name}</span>
                          {c.id === nextCandidateId && <span className="badge badge-green xs">● Next</span>}
                        </div>
                        {c.job_role && <div className="muted xs" style={{ marginTop: 2 }}>{c.job_role}</div>}
                        {isActiveDelivery && c.delivery_preference && (
                          <div className="xs" style={{ marginTop: 2, color: deliveryColor(c.delivery_preference) }}>
                            {deliveryLabel(c.delivery_preference)}
                          </div>
                        )}
                        {isActiveDelivery && !c.delivery_preference && (
                          <div className="xs" style={{ marginTop: 2, color: 'var(--grey-400)' }}>Awaiting reply</div>
                        )}
                      </div>
                      <div className="row" style={{ gap: 8 }}>
                        <div className="muted small">{toAuLocal(c.phone)}</div>
                        {isActiveDelivery && (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => handleNextDelivery(c.id)}
                            disabled={nextSending === c.id}
                            style={{ fontSize: 11, padding: '4px 8px' }}
                          >
                            {nextSending === c.id ? '…' : 'Next'}
                          </button>
                        )}
                        <ThreeDotMenu options={candidateMenu(c, { includeCallNow: true })} />
                      </div>
                    </div>
                  ))}
                  {pending.length === 0 && completed.length > 0 && (
                    <div className="muted xs" style={{ padding: '6px 4px' }}>All candidates in this list have been called.</div>
                  )}
                </div>

                {completed.length > 0 && (
                  <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--grey-200)' }}>
                    <div className="muted xs bold mb-8">CALLS COMPLETED</div>
                    <div className="stack" style={{ gap: 2 }}>
                      {completed.map((c) => (
                        <div
                          key={c.id}
                          className="row-between"
                          style={{ padding: '8px 4px' }}
                        >
                          <div className="row" style={{ gap: 6, cursor: 'pointer' }} onClick={() => navigate(`/employer/campaigns/${id}/candidates/${c.id}`)}>
                            <span className="small">{resolveCandidateName(c).name}</span>
                            {c.outcome && <span className="badge badge-grey xs">{c.outcome}</span>}
                          </div>
                          <div className="row" style={{ gap: 8 }}>
                            <div className="muted xs">{formatCalledAt(c.called_at)}</div>
                            <ThreeDotMenu options={candidateMenu(c, { includeCallNow: false })} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {noteTarget && (
        <NoteModal
          candidate={noteTarget}
          onClose={() => setNoteTarget(null)}
          onSaved={() => { setNoteTarget(null); load(); }}
        />
      )}

      {removeTarget && (
        <ConfirmDialog
          title="Remove from campaign?"
          message={`Remove ${removeTarget.name} from this campaign? This cannot be undone.`}
          confirmLabel="Remove"
          onConfirm={() => { const t = removeTarget; setRemoveTarget(null); runAction(() => api.removeCandidate(id, t.id)); }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </>
  );
}
