import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ConfirmDialog, ErrorBanner } from '../components/Shared';
import ThreeDotMenu from '../components/ThreeDotMenu';
import RenameCampaignModal from '../components/RenameCampaignModal';
import FeatureLocked from '../components/FeatureLocked';
import { usePlan } from '../context/PlanContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function CampaignsList() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { loading: planLoading, isLocked } = usePlan();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [renameTarget, setRenameTarget] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  const load = () => api.listCampaigns().then((d) => setCampaigns(d.campaigns || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.deleteCampaign(pendingDelete.id);
      setCampaigns((cs) => cs.filter((c) => c.id !== pendingDelete.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setPendingDelete(null);
    }
  };

  const continueCalling = async (c) => {
    setBusyId(c.id);
    setError('');
    try {
      const { batches } = await api.getCampaign(c.id);
      const callableBatch = (batches || []).find((b) => b.call_date <= todayIso());
      const next = callableBatch?.candidates.find((cand) => cand.call_status === 'not_called');
      if (next) navigate(`/employer/campaigns/${c.id}/candidates/${next.id}`);
      else navigate(`/employer/campaigns/${c.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const downloadResults = async (c) => {
    setBusyId(c.id);
    setError('');
    try {
      await api.downloadCampaignResults(c.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const renameCampaign = async (name) => {
    await api.renameCampaign(renameTarget.id, name);
    setCampaigns((cs) => cs.map((c) => (c.id === renameTarget.id ? { ...c, name } : c)));
    setRenameTarget(null);
  };

  const cardMenu = (c) => [
    { label: 'Continue Calling', onClick: () => continueCalling(c) },
    { label: 'View All Candidates', onClick: () => navigate(`/employer/campaigns/${c.id}`) },
    { label: 'Download Results', onClick: () => downloadResults(c) },
    { label: 'Rename Campaign', onClick: () => setRenameTarget(c) },
    { label: 'Delete Campaign', danger: true, onClick: () => setPendingDelete(c) },
  ];

  // Free employers don't get the campaign manager at all — show the locked
  // panel instead of the (empty) list rather than letting them click into
  // an upload flow that would just 403 on the first real request.
  if (!planLoading && isLocked('campaign_manager')) {
    return (
      <>
        <StatusBar />
        <div className="screen">
          <TopHeader title="Campaigns" onBack={() => navigate('/employer/dashboard')} />
          <FeatureLocked
            title="Campaign Manager is locked"
            message="This feature requires the Starter plan or above"
          />
        </div>
        <EmployerBottomNav active="candidates" />
      </>
    );
  }

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Campaigns" onBack={() => navigate('/employer/dashboard')} />

        <ErrorBanner message={error} />

        <button className="btn btn-primary mb-24" onClick={() => navigate('/employer/campaigns/upload')}>
          Upload New Candidate List
        </button>

        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : campaigns.length === 0 ? (
          <div className="card muted small">
            No campaigns yet. Upload an Excel or CSV candidate list to get started.
          </div>
        ) : (
          <div className="stack list-grid">
            {campaigns.map((c) => (
              <div key={c.id} className="card" style={{ position: 'relative' }}>
                <div style={{ cursor: 'pointer' }} onClick={() => navigate(`/employer/campaigns/${c.id}`)}>
                  <div className="row-between mb-8" style={{ paddingRight: 28 }}>
                    <div className="bold" style={{ fontSize: 15 }}>{c.name}</div>
                    <span className="badge badge-blue">{c.batchCount} list{c.batchCount === 1 ? '' : 's'}</span>
                  </div>
                  <div className="muted small">{c.candidateCount} candidate{c.candidateCount === 1 ? '' : 's'}</div>
                  <div className="row" style={{ gap: 6, marginTop: 4 }}>
                    <div className="muted xs">Created {formatDate(c.created_at)}</div>
                    {!c.isOwner && c.assigned_to === user?.id && <span className="badge badge-green xs">Assigned to You</span>}
                  </div>
                </div>
                <div style={{ position: 'absolute', top: 10, right: 10 }} onClick={(e) => e.stopPropagation()}>
                  <ThreeDotMenu options={cardMenu(c)} />
                </div>
                {busyId === c.id && <div className="muted xs" style={{ marginTop: 8 }}>Working…</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <EmployerBottomNav active="candidates" />

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this campaign?"
          message="Are you sure you want to delete this campaign? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}

      {renameTarget && (
        <RenameCampaignModal
          campaign={renameTarget}
          onClose={() => setRenameTarget(null)}
          onRenamed={renameCampaign}
        />
      )}
    </>
  );
}
