import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { toAuLocal } from '../utils/phone';
import { resolveCandidateName } from '../utils/columnMapping';
import { api } from '../api/client';
import { formatDateTime } from '../utils/date';

export default function CandidateProfile() {
  const { campaignId, candidateId } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [candidate, setCandidate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone: '', jobRole: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    api.getCampaign(campaignId).then((d) => {
      setCampaign(d.campaign);
      for (const batch of d.batches || []) {
        const found = batch.candidates.find((c) => c.id === candidateId);
        if (found) { setCandidate(found); break; }
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [campaignId, candidateId]);

  const startEdit = () => {
    const { name: currentDisplayName } = resolveCandidateName(candidate);
    setEditForm({
      name: currentDisplayName || '',
      phone: toAuLocal(candidate.phone) || candidate.phone || '',
      jobRole: candidate.job_role || '',
    });
    setError('');
    setEditing(true);
  };

  const saveEdit = async () => {
    setError('');
    if (!editForm.name.trim() || !editForm.phone.trim()) {
      setError('Name and phone number are both required.');
      return;
    }
    setSaving(true);
    try {
      const { candidate: updated } = await api.updateCampaignCandidate(campaignId, candidateId, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        jobRole: editForm.jobRole.trim(),
      });
      setCandidate((c) => ({ ...c, ...updated }));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendSmsReminder = async () => {
    setSendingSms(true);
    setError('');
    try {
      const result = await api.sendCandidateSms(campaignId, candidateId);
      setToast(result.devMode ? 'SMS logged (dev mode — no SMS provider configured)' : 'SMS reminder sent');
      setTimeout(() => setToast(''), 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingSms(false);
    }
  };

  if (loading) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Candidate" onBack={() => navigate(-1)} /><div className="muted small">Loading…</div></div></>);
  }
  if (!candidate) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Candidate" onBack={() => navigate(-1)} /><div className="card muted small">Candidate not found.</div></div></>);
  }

  const extraEntries = Object.entries(candidate.extra_data || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const { name: displayName, stillBad: nameLooksWrong } = resolveCandidateName(candidate);

  const callNow = () => {
    navigate('/employer/make-call', {
      state: {
        prefill: {
          receiverName: displayName,
          receiverPhone: toAuLocal(candidate.phone),
          jobRole: candidate.job_role || '',
          note: candidate.extra_data?.Notes || candidate.extra_data?.notes || candidate.notes || '',
        },
        campaignId,
        candidateId,
      },
    });
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Candidate" onBack={() => navigate(`/employer/campaigns/${campaignId}`)} />

        <ErrorBanner message={error} />

        {nameLooksWrong && !editing && (
          <ErrorBanner message="We couldn't determine this candidate's real name from the uploaded file. Tap Edit below to enter it." />
        )}

        {editing ? (
          <div className="card mb-24">
            <div className="field">
              <label>Full name</label>
              <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Citizen" />
            </div>
            <div className="field">
              <label>Phone number</label>
              <input value={editForm.phone} onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} placeholder="0412 111 222" />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Job role</label>
              <input value={editForm.jobRole} onChange={(e) => setEditForm((f) => ({ ...f, jobRole: e.target.value }))} placeholder="e.g. Senior Site Supervisor" />
            </div>
            <div className="row" style={{ gap: 10, marginTop: 16 }}>
              <button className="btn btn-primary" style={{ width: 'auto', flex: 1 }} onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button className="btn btn-grey" style={{ width: 'auto', flex: 1 }} onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="center mb-24">
              <div style={{ fontWeight: 800, fontSize: 22 }}>{displayName}</div>
              {candidate.job_role && <div className="muted small" style={{ marginTop: 4 }}>{candidate.job_role}</div>}
              <button className="link small" style={{ marginTop: 8 }} onClick={startEdit}>Edit name / phone / role</button>
            </div>

            <div className="card mb-24">
              <div className="row-between small mb-8">
                <span className="muted">Phone</span>
                <span className="bold">{toAuLocal(candidate.phone)}</span>
              </div>
              {candidate.job_role && (
                <div className="row-between small mb-8">
                  <span className="muted">Job Role</span>
                  <span className="bold">{candidate.job_role}</span>
                </div>
              )}
              {extraEntries.map(([label, value]) => (
                <div className="row-between small mb-8" key={label}>
                  <span className="muted">{label}</span>
                  <span className="bold" style={{ textAlign: 'right', maxWidth: '60%' }}>{String(value)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {candidate.notes && (
          <div className="card mb-24">
            <div className="muted xs bold mb-8">NOTES FROM PREVIOUS CALL</div>
            <div className="small">{candidate.notes}</div>
          </div>
        )}

        <div className="stack">
          <button className="btn btn-green" onClick={callNow}>Call Now</button>
          <button className="btn btn-outline" onClick={sendSmsReminder} disabled={sendingSms}>
            {sendingSms ? 'Sending…' : 'Send SMS Reminder'}
          </button>
          {candidate.sms_sent_at && (
            <div className="muted xs center">Last SMS reminder sent {formatDateTime(candidate.sms_sent_at)}</div>
          )}
          <button className="btn btn-grey" onClick={() => navigate(`/employer/campaigns/${campaignId}`)}>Back</button>
        </div>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
