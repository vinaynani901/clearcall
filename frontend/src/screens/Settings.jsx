import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import { JobSeekerMyPlanCard, EmployerMyPlanCard } from '../components/MyPlanCard';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { isPushSupported, isPushSubscribed, enablePushNotifications, disablePushNotifications } from '../utils/push';
import { formatDateTime } from '../utils/date';

function Row({ label, onClick, danger }) {
  return (
    <button className="row-between" style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', borderBottom: '1px solid var(--grey-200)', cursor: 'pointer', textAlign: 'left' }} onClick={onClick}>
      <span style={{ fontSize: 15, fontWeight: 600, color: danger ? 'var(--red)' : 'inherit' }}>{label}</span>
      <span className="muted">›</span>
    </button>
  );
}

function Switch({ on, onChange, disabled }) {
  return (
    <button className={`switch ${on ? 'on' : ''}`} onClick={() => !disabled && onChange(!on)} disabled={disabled} type="button" aria-pressed={on}>
      <span className="knob" />
    </button>
  );
}

function NotificationsRow({ onToast }) {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = isPushSupported();
    setSupported(ok);
    if (ok) isPushSubscribed().then(setSubscribed);
  }, []);

  const toggle = async () => {
    if (!supported) { onToast('Push notifications are not supported in this browser'); return; }
    setBusy(true);
    try {
      if (subscribed) {
        await disablePushNotifications();
        setSubscribed(false);
        onToast('Notifications turned off');
      } else {
        const result = await enablePushNotifications();
        if (result.success) {
          setSubscribed(true);
          onToast('Notifications turned on');
        } else if (result.reason === 'permission_denied') {
          onToast('Notifications blocked — enable them in your browser settings');
        } else {
          onToast('Could not enable notifications');
        }
      }
    } catch {
      onToast('Could not update notification settings');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button className="row-between" style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', borderBottom: '1px solid var(--grey-200)', cursor: 'pointer', textAlign: 'left' }} onClick={toggle} disabled={busy}>
      <span style={{ fontSize: 15, fontWeight: 600 }}>Push Notifications (this device)</span>
      <span className={`badge ${subscribed ? 'badge-green' : 'badge-grey'}`}>{busy ? '…' : subscribed ? 'On' : 'Off'}</span>
    </button>
  );
}

// --- Job seeker settings sections -----------------------------------------

function ProfileSection({ profile, onSaved, onToast }) {
  const [form, setForm] = useState({ fullName: profile.full_name || '', email: profile.email || '', phone: profile.phone || '', lookingForWork: !!profile.looking_for_work });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [hasAvatar, setHasAvatar] = useState(!!profile.avatar_filename);
  // Avatar itself (the actual image blob URL) lives in AuthContext so a
  // change here shows up immediately in the sidebar and top bar too,
  // without needing a page refresh.
  const { avatarUrl, refreshAvatar } = useAuth();

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { profile: updated } = await api.updateJobseekerProfile(form);
      onSaved(updated);
      onToast('Profile updated');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    api.uploadAvatar(file)
      .then(() => { setHasAvatar(true); refreshAvatar(true); onToast('Profile photo updated'); })
      .catch((err) => onToast(err.message))
      .finally(() => setAvatarBusy(false));
  };

  const removePhoto = () => {
    setAvatarBusy(true);
    api.deleteAvatar()
      .then(() => { setHasAvatar(false); refreshAvatar(false); onToast('Profile photo removed'); })
      .catch((err) => onToast(err.message))
      .finally(() => setAvatarBusy(false));
  };

  const initials = (form.fullName || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

  return (
    <div className="card mb-16">
      <div className="bold" style={{ marginBottom: 14 }}>Profile</div>
      <ErrorBanner message={error} />
      <div className="row" style={{ gap: 14, marginBottom: 16 }}>
        {avatarUrl ? (
          <img src={avatarUrl} alt="Profile" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20 }}>{initials || '?'}</div>
        )}
        <div>
          <div className="row" style={{ gap: 8 }}>
            <label className="btn btn-outline btn-sm" style={{ width: 'auto', cursor: 'pointer' }}>
              {avatarBusy ? 'Working…' : hasAvatar ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={pickPhoto} disabled={avatarBusy} />
            </label>
            {hasAvatar && (
              <button type="button" className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={removePhoto} disabled={avatarBusy}>Remove</button>
            )}
          </div>
          <div className="muted xs" style={{ marginTop: 6 }}>JPG, PNG, or WEBP. Max 5MB.</div>
        </div>
      </div>
      <form onSubmit={save} className="stack">
        <div className="field">
          <label>Full name</label>
          <input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
        </div>
        <div className="field">
          <label>Email address</label>
          <input type="email" value={form.email} disabled readOnly style={{ background: 'var(--grey-100)', color: 'var(--grey-500)', cursor: 'not-allowed' }} />
          <div className="muted xs" style={{ marginTop: 4 }}>Email can't be changed here for security reasons.</div>
        </div>
        <div className="field">
          <label>Phone number</label>
          <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="field" style={{ marginBottom: 4 }}>
          <label>Employment status</label>
          <select value={form.lookingForWork ? 'looking' : 'employed'} onChange={(e) => setForm((f) => ({ ...f, lookingForWork: e.target.value === 'looking' }))}>
            <option value="looking">Currently looking for work</option>
            <option value="employed">Currently employed</option>
          </select>
        </div>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
      </form>
    </div>
  );
}

function NotificationPreferencesSection({ onToast }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.getNotificationSettings().then((d) => setSettings(d.settings)).catch(() => {}); }, []);

  const update = async (key, apiKey, value) => {
    setSettings((s) => ({ ...s, [key]: value ? 1 : 0 }));
    setSaving(true);
    try {
      await api.updateNotificationSettings({ [apiKey]: value });
    } catch {
      onToast('Could not save that setting');
    } finally {
      setSaving(false);
    }
  };

  if (!settings) return null;

  const items = [
    { key: 'notif_verified_calls', apiKey: 'verifiedCalls', label: 'Verified call alerts', desc: 'Get notified the moment a verified employer calls you.' },
    { key: 'notif_application_updates', apiKey: 'applicationUpdates', label: 'Application updates', desc: 'Status changes on applications you\'re tracking.' },
    { key: 'notif_new_matches', apiKey: 'newMatches', label: 'New job matches', desc: 'New ClearCall Direct postings that fit your profile.' },
    { key: 'notif_interview_reminders', apiKey: 'interviewReminders', label: 'Interview reminders', desc: 'Reminders ahead of upcoming interviews.' },
  ];

  return (
    <div className="card mb-16">
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
    <div className="card mb-16">
      <div className="bold" style={{ marginBottom: 4 }}>Privacy Settings</div>
      <div className="toggle-row">
        <div className="toggle-row-text">
          <h4>Show my profile to placement agents</h4>
          <p>Let connected placement agents view your profile and application history.</p>
        </div>
        <Switch on={on} disabled={saving} onChange={toggle} />
      </div>
    </div>
  );
}

function GmailSection({ onToast }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.getGmailStatus().then(setStatus).catch(() => {});
  useEffect(() => { load(); }, []);

  // Handle the redirect back from /api/gmail/callback (?gmail=connected&imported=N
  // or ?gmail=error&message=...). Show a toast once, then strip the params so a
  // refresh doesn't re-trigger it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gmailResult = params.get('gmail');
    if (!gmailResult) return;

    if (gmailResult === 'connected') {
      const imported = Number(params.get('imported') || 0);
      onToast(imported > 0 ? `Gmail connected — ${imported} application${imported === 1 ? '' : 's'} imported from Gmail.` : 'Gmail connected.');
      load();
    } else if (gmailResult === 'error') {
      onToast(params.get('message') || 'Could not connect Gmail. Please try again.');
    }

    params.delete('gmail');
    params.delete('imported');
    params.delete('message');
    const newSearch = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    try {
      const data = await api.authorizeGmail();
      window.location.href = data.url;
    } catch (err) {
      onToast(err.message);
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    try {
      const result = await api.syncGmail();
      load();
      onToast(result.imported > 0 ? `${result.imported} new application${result.imported === 1 ? '' : 's'} imported from Gmail.` : 'Gmail is up to date — no new applications found.');
    } catch (err) {
      onToast(err.message || 'Gmail sync failed, please try again.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.disconnectGmail();
      load();
      onToast('Gmail disconnected');
    } catch (err) {
      onToast(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!status) return null;

  return (
    <div className="card mb-16">
      <div className="bold" style={{ marginBottom: 6 }}>Connect Gmail</div>
      <p className="muted small" style={{ margin: '0 0 14px', lineHeight: 1.5 }}>
        ClearCall only reads emails from job platforms (Seek, Indeed, LinkedIn, etc.) to automatically log applications for you — never your personal messages.
      </p>
      {!status.configured ? (
        <div className="badge badge-grey-light">Not available yet</div>
      ) : status.connected ? (
        <div>
          <div className="small muted" style={{ marginBottom: 10 }}>
            Connected as {status.email || 'your Gmail account'}
            {status.lastSyncAt ? ` — last synced ${formatDateTime(status.lastSyncAt)}` : ''}
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={sync} disabled={busy}>Sync now</button>
            <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={disconnect} disabled={busy}>Disconnect Gmail</button>
          </div>
        </div>
      ) : (
        <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} onClick={connect} disabled={busy}>Connect Gmail</button>
      )}
    </div>
  );
}

function DeleteAccountModal({ onClose, onDeleted }) {
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const canSubmit = password && confirmText.trim().toUpperCase() === 'DELETE';

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) { setError('Type DELETE to confirm.'); return; }
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 400, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>Delete your account</div>
        <p className="muted small" style={{ margin: '0 0 16px' }}>
          This deactivates your account and removes your login details. This can't be undone.
        </p>
        <ErrorBanner message={error} />
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Password</label>
            <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label>Type <strong>DELETE</strong> to confirm</label>
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
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 16 }}>Settings</h1>

        {isJobseeker && profile && (
          <>
            <JobSeekerMyPlanCard />
            <ProfileSection profile={profile} onSaved={setProfile} onToast={showToast} />
            <NotificationPreferencesSection onToast={showToast} />
            <PrivacySection profile={profile} onToast={showToast} />
            <GmailSection onToast={showToast} />

            <div className="card" style={{ padding: '4px 16px' }}>
              <div className="bold" style={{ padding: '16px 0 4px' }}>Job Search</div>
              <Row label="Auto Apply Preferences" onClick={() => navigate('/jobseeker/auto-apply')} />
            </div>

            <div className="card" style={{ padding: '4px 16px' }}>
              <div className="bold" style={{ padding: '16px 0 4px' }}>Account</div>
              <NotificationsRow onToast={showToast} />
              <Row label="Change Password" onClick={() => navigate('/change-password')} />
              <Row label="Help and Support" onClick={() => navigate('/help')} />
              <Row label="Terms and Privacy Policy" onClick={() => navigate('/terms')} />
              <Row label="Delete Account" danger onClick={() => setShowDelete(true)} />
              <button className="row-between" style={{ width: '100%', background: 'none', border: 'none', padding: '16px 0', cursor: 'pointer', textAlign: 'left' }} onClick={doLogout}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--red)' }}>Log Out</span>
              </button>
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
