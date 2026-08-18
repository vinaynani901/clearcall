import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { CheckCircle } from '../components/Icons';
import { api } from '../api/client';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function StatRow({ label, value }) {
  return (
    <div className="row-between small mb-8">
      <span className="muted">{label}</span>
      <span className="bold">{value}</span>
    </div>
  );
}

export default function CampaignDaySummary() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [batch, setBatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingResults, setDownloadingResults] = useState(false);
  const [downloadingCallbacks, setDownloadingCallbacks] = useState(false);

  useEffect(() => {
    api.getCampaign(id).then((d) => {
      setCampaign(d.campaign);
      const batches = d.batches || [];
      const batchId = location.state?.batchId;
      const found = (batchId && batches.find((b) => b.id === batchId))
        || batches.find((b) => b.call_date === todayIso())
        || batches.find((b) => b.call_date <= todayIso())
        || batches[0];
      setBatch(found || null);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id, location.state]);

  const downloadResults = async () => {
    setDownloadingResults(true);
    setError('');
    try { await api.downloadCampaignResults(id); } catch (err) { setError(err.message); } finally { setDownloadingResults(false); }
  };

  const downloadCallbacks = async () => {
    setDownloadingCallbacks(true);
    setError('');
    try { await api.downloadCampaignCallbacks(id); } catch (err) { setError(err.message); } finally { setDownloadingCallbacks(false); }
  };

  if (loading) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Day Summary" onBack={() => navigate(`/employer/campaigns/${id}`)} /><div className="muted small">Loading…</div></div></>);
  }
  if (!campaign) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Day Summary" onBack={() => navigate('/employer/campaigns')} /><div className="card muted small">Campaign not found.</div></div></>);
  }

  const candidates = batch?.candidates || [];
  const totalCalled = candidates.filter((c) => c.call_status !== 'not_called').length;
  const totalAnswered = candidates.filter((c) => c.call_status === 'answered').length;
  const totalNotAnswered = candidates.filter((c) => c.call_status === 'no_answer' || c.call_status === 'voicemail').length;
  const totalCallbacks = candidates.filter((c) => !!c.callback_at).length;
  const totalInterviews = candidates.filter((c) => c.outcome === 'Interview Scheduled').length;

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Day Summary" onBack={() => navigate(`/employer/campaigns/${id}`)} />

        <ErrorBanner message={error} />

        <div className="center mb-24">
          <CheckCircle size={80} />
          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 16 }}>{campaign.name}</div>
          <div className="muted small" style={{ marginTop: 4 }}>
            {new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="muted small" style={{ marginTop: 8 }}>Today's list is complete — every candidate has been called.</div>
        </div>

        <div className="card mb-24">
          <StatRow label="Total Called" value={totalCalled} />
          <StatRow label="Answered" value={totalAnswered} />
          <StatRow label="Not Answered" value={totalNotAnswered} />
          <StatRow label="Callbacks Scheduled" value={totalCallbacks} />
          <StatRow label="Interviews Booked" value={totalInterviews} />
        </div>

        <div className="stack">
          <button className="btn btn-primary" onClick={downloadResults} disabled={downloadingResults}>
            {downloadingResults ? 'Preparing file…' : 'Download Full Results'}
          </button>
          <button className="btn btn-outline" onClick={downloadCallbacks} disabled={downloadingCallbacks}>
            {downloadingCallbacks ? 'Preparing file…' : 'Download Callbacks Due'}
          </button>
          <button className="btn btn-grey" onClick={() => navigate('/employer/campaigns')}>Back to Campaigns</button>
        </div>
      </div>
    </>
  );
}
