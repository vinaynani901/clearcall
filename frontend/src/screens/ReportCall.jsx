import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner, InfoBox } from '../components/Shared';
import { api } from '../api/client';

const REASONS = [
  'Felt like a scam',
  'Asked for personal information',
  'Asked for money or fees',
  'Company details seemed fake',
  'Caller was aggressive or inappropriate',
  'Other',
];

export default function ReportCall() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!reason) {
      setError('Please select a reason');
      return;
    }
    setLoading(true);
    try {
      await api.submitReport({
        reportedCompanyId: state?.companyId || null,
        reportedPhone: state?.reportedPhone || null,
        callId: state?.callId || null,
        reason,
        description,
      });
      navigate('/success', { state: { message: 'Your report has been submitted and will be reviewed by the ClearCall team.', continueTo: '/jobseeker/calls' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Report Suspicious Call" />
        <div className="card mb-16">
          <div className="muted xs bold mb-8">CALLER DETAILS</div>
          <div className="bold small">{state?.companyName || state?.reportedPhone || 'Unknown caller'}</div>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Reason</label>
            <select required value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason</option>
              {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell us what happened…" />
          </div>

          <InfoBox>Your report helps protect other job seekers and is reviewed by the ClearCall team.</InfoBox>

          <button className="btn btn-red" disabled={loading}>{loading ? 'Submitting...' : 'Submit Report'}</button>
        </form>
      </div>
    </>
  );
}
