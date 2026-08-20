import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import Row from '../../components/Row';
import Switch from '../../components/Switch';
import EmployerMyPlanCard from '../../components/EmployerMyPlanCard';
import EmployerBottomNav from '../../components/EmployerBottomNav';
import DeleteAccountModal from '../../components/DeleteAccountModal';

function NotificationsRow({ onToast }) {
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getNotificationSettings().then((d) => setSettings(d.settings)).catch(() => {});
  }, []);

  const update = async (key, apiKey, value) => {
    setSaving(true);
    try {
      await api.updateNotificationSettings({ [apiKey]: value });
      setSettings((s) => ({ ...s, [key]: value }));
      onToast('Notification setting updated');
    } catch {
      onToast('Could not save that setting');
    } finally {
      setSaving(false);
    }
  };

  const items = [
    {
      key: 'verifiedCalls',
      apiKey: 'verifiedCalls',
      label: 'Verified Calls',
      desc: 'Get notified when you receive a verified call',
    },
    {
      key: 'applicationUpdates',
      apiKey: 'applicationUpdates',
      label: 'Application Updates',
      desc: 'Get notified when your application status changes',
    },
    {
      key: 'newMatches',
      apiKey: 'newMatches',
      label: 'New Job Matches',
      desc: 'Get notified when new jobs match your profile',
    },
    {
      key: 'interviewReminders',
      apiKey: 'interviewReminders',
      label: 'Interview Reminders',
      desc: 'Get notified about upcoming interviews',
    },
  ];

  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      <div className="bold" style={{ marginBottom: 4 }}>Notification Settings</div>
      {items.map((item) => (
        <div className="toggle-row" key={item.key}>
          <div className="toggle-row-text">
            <h4>{item.label}</h4>
            <p>{item.desc}</p>
          </div>
          <Switch on={!!settings[item.key]} disabled={saving} onChange={(v) => update(item.key, item.apiKey, v)} />
        </div>
      ))}
    </div>
  );
}

function PrivacySection({ profile, onToast }) {
  const [on, setOn] = useState(profile.profile_visibility !== 'private');
  const [saving, setSaving] = useState(false);

  const toggle = async (v) => {
    setOn(v);
    setSaving(true);
    try {
      await api.updatePrivacySettings({ showProfileToAgents: v });
      onToast('Privacy setting updated');
    } catch {
      setOn(!v);
      onToast('Could not save that setting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      <div className="toggle-row">
        <div className="toggle-row-text">
          <h4>Show my profile to placement agents</h4>
          <p>When enabled, your profile will be visible to placement agents you connect with</p>
        </div>
        <Switch on={on} disabled={saving} onChange={toggle} />
      </div>
    </div>
  );
}

function DeleteAccountModal({ onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const canSubmit = confirmText.toUpperCase() === 'DELETE';

  const doDelete = async () => {
    setBusy(true);
    try {
      await api.deleteAccount();
      onDeleted();
    } catch {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>Delete Account</h2>
        <p>This will permanently delete your account and all associated data. This action cannot be undone.</p>
        <form onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) doDelete();
        }}>
          <div className="form-group">
            <label>Type DELETE to confirm:</label>
            <input required value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          </div>
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn-grey" onClick={onClose} disabled={busy}>Cancel</button>
            <button className="btn btn-red" disabled={busy || !canSubmit}>{busy ? 'Deleting…' : 'Delete Account'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const isEmployer = user?.role === 'employer';
  const isJobseeker = user?.role === 'jobseeker';
  const [toast, setToast] = useState('');
  const [profile, setProfile] = useState(null);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (isJobseeker) api.getJobseekerProfile().then((d) => setProfile(d.profile)).catch(() => {});
  }, [isJobseeker]);

  const doLogout = () => {
    logout();
    navigate('/signup');
  };

  const showToast = (label) => {
    setToast(label);
    setTimeout(() => setToast(''), 2200);
  };

  const doDelete = () => {
    logout();
    navigate('/signup');
  };

  return (
    <>
      <div className="settings-screen">
        <div className="settings-header">
          <h1>Settings</h1>
        </div>

        {isJobseeker && (
          <>
            <div className="card" style={{ padding: '4px 16px' }}>
              <Row label="My Resumes" onClick={() => navigate('/jobseeker/resumes')} />
              <Row label="My Profile" onClick={() => navigate('/jobseeker/profile')} />
              <Row label="My Applications" onClick={() => navigate('/jobseeker/applications')} />
              <Row label="My Placement Agents" onClick={() => navigate('/jobseeker/agents')} />
              <Row label="My Job Alerts" onClick={() => navigate('/jobseeker/job-alerts')} />
              <Row label="My Saved Jobs" onClick={() => navigate('/jobseeker/saved-jobs')} />
              <Row label="My Job Matches" onClick={() => navigate('/jobseeker/job-matches')} />
              <Row label="My Dashboard" onClick={() => navigate('/jobseeker/dashboard')} />
              <Row label="My Messages" onClick={() => navigate('/jobseeker/messages')} />
              <Row label="My Calls" onClick={() => navigate('/jobseeker/calls')} />
              <Row label="My Gmail" onClick={() => navigate('/jobseeker/gmail')} />
              <Row label="My Access Keys" onClick={() => navigate('/jobseeker/access-keys')} />
              <Row label="Change Password" onClick={() => navigate('/change-password')} />
            </div>
          </>
        )}

        {isEmployer && (
          <>
            <EmployerMyPlanCard />
            <div className="card" style={{ padding: '4px 16px' }}>
              <Row label="My Work Profiles" onClick={() => navigate('/employer/work-profiles')} />
              <Row label="My Team" onClick={() => navigate('/employer/team')} />
              <Row label="Billing" onClick={() => navigate('/employer/billing')} />
              <Row label="My Job Postings" onClick={() => navigate('/employer/job-postings')} />
              <Row label="Call Display Settings" onClick={() => navigate('/employer/call-display-settings')} />
              <Row label="Custom Tag Sets" onClick={() => navigate('/employer/tag-sets')} />
              <NotificationsRow onToast={showToast} />
              <Row label="Reported Calls" onClick={() => navigate('/employer/calls')} />
              <Row label="Change Password" onClick={() => navigate('/change-password')} />
              <Row label="Help and Support" onClick={() => navigate('/help')} />
              <Row label="Terms and Privacy Policy" onClick={() => navigate('/terms')} />
              <button className="row-between" style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', cursor: 'pointer', textAlign: 'left' }} onClick={doLogout}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>Log Out</span>
              </button>
            </div>
          </>
        )}
      </div>
      {isEmployer && <EmployerBottomNav active="settings" />}
      {toast && <div className="toast">{toast}</div>}

      {showDelete && (
        <DeleteAccountModal onClose={() => setShowDelete(false)} onDeleted={doDelete} />
      )}
    </>
  );
}