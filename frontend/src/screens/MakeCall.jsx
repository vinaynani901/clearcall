import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import CallTypeSheet from '../components/CallTypeSheet';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function MakeCall() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [form, setForm] = useState({ receiverName: '', receiverPhone: '', jobRole: '', note: '' });
  const [showSheet, setShowSheet] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.listWorkProfiles().then((d) => setProfiles(d.profiles || [])).catch(() => {});
  }, []);

  const activeProfile = profiles.find((p) => p.is_active) || profiles[0];
  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const openSheet = (e) => {
    e.preventDefault();
    setError('');
    if (!form.receiverName || !form.receiverPhone || !form.jobRole) {
      setError('Please fill in the recipient name, phone number, and role.');
      return;
    }
    setShowSheet(true);
  };

  const handleCallType = async (type) => {
    setShowSheet(false);
    setSubmitting(true);
    setError('');
    try {
      const data = await api.initiateCall({
        receiverPhone: form.receiverPhone,
        receiverName: form.receiverName,
        jobRole: form.jobRole,
        callType: type,
        note: form.note,
      });
      if (type === 'clearcall') {
        navigate('/success', {
          state: {
            message: `ClearCall Verified Call started to ${form.receiverName}. They'll see your verified company details — never your number.`,
            continueTo: '/employer/dashboard',
          },
        });
      } else {
        navigate('/call/post-nudge', { state: { receiverName: form.receiverName, jobRole: form.jobRole } });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Make a Call" />

        <div className="card mb-24">
          <div className="row-between">
            <div>
              <div className="muted xs bold">ACTIVE WORK PROFILE</div>
              <div className="bold" style={{ fontSize: 15, marginTop: 2 }}>
                {activeProfile ? `${activeProfile.designation} · ${activeProfile.organisation}` : company?.name || 'No profile set'}
              </div>
            </div>
            <button className="link small" onClick={() => navigate('/employer/work-profiles')}>Switch Profile</button>
          </div>
        </div>

        <ErrorBanner message={error} />

        <form onSubmit={openSheet} className="stack">
          <div className="field">
            <label>Recipient name</label>
            <input required value={form.receiverName} onChange={update('receiverName')} placeholder="Jane Citizen" />
          </div>
          <div className="field">
            <label>Recipient phone number</label>
            <input required type="tel" value={form.receiverPhone} onChange={update('receiverPhone')} placeholder="0400 111 222" />
          </div>
          <div className="field">
            <label>Role you are calling about</label>
            <input required value={form.jobRole} onChange={update('jobRole')} placeholder="e.g. Year 5 Teacher, Registered Nurse, Site Supervisor, Software Developer" />
          </div>
          <div className="field">
            <label>Note (optional)</label>
            <textarea rows={3} value={form.note} onChange={update('note')} placeholder="Any extra context for this call" />
          </div>
          <button className="btn btn-primary" disabled={submitting}>{submitting ? 'Starting call...' : 'Call Now'}</button>
        </form>

        <div className="center" style={{ marginTop: 16 }}>
          <button className="link small" onClick={() => navigate('/employer/call-display-settings')}>
            Manage what is shown on every call
          </button>
        </div>
      </div>

      {showSheet && <CallTypeSheet onSelect={handleCallType} onClose={() => setShowSheet(false)} />}
    </>
  );
}
