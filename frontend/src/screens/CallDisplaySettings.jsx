import { useState, useEffect } from 'react';
import { StatusBar, TopHeader } from '../components/Shared';
import { ShieldCheck } from '../components/Icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

function Toggle({ on, onToggle }) {
  return (
    <button className={`switch ${on ? 'on' : ''}`} onClick={onToggle} aria-pressed={on}>
      <span className="knob" />
    </button>
  );
}

export default function CallDisplaySettings() {
  const { user, company } = useAuth();
  const [settings, setSettings] = useState({ hide_number: 1, show_name: 1, show_designation: 1, show_photo: 0 });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCallDisplaySettings().then((d) => setSettings(d.settings)).finally(() => setLoading(false));
  }, []);

  const toggle = (key) => setSettings((s) => ({ ...s, [key]: s[key] ? 0 : 1 }));

  const save = async () => {
    await api.updateCallDisplaySettings({
      hideNumber: !!settings.hide_number,
      showName: !!settings.show_name,
      showDesignation: !!settings.show_designation,
      showPhoto: !!settings.show_photo,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (loading) return (<><StatusBar /><div className="screen"><TopHeader title="Call Display Settings" /><div className="muted small">Loading…</div></div></>);

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Call Display Settings" />

        <div className="card mb-24">
          <div className="toggle-row">
            <div className="toggle-row-text">
              <h4>Hide my number from receiver</h4>
              <p>{settings.hide_number
                ? 'On — the receiver sees only your verified company details.'
                : 'Off — your number appears as a small tap-to-reveal element below your company details.'}</p>
            </div>
            <Toggle on={!!settings.hide_number} onToggle={() => toggle('hide_number')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-row-text">
              <h4>Show my name</h4>
              <p>Your full name is shown to the receiver.</p>
            </div>
            <Toggle on={!!settings.show_name} onToggle={() => toggle('show_name')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-row-text">
              <h4>Show my designation</h4>
              <p>Your job title is shown to the receiver.</p>
            </div>
            <Toggle on={!!settings.show_designation} onToggle={() => toggle('show_designation')} />
          </div>
          <div className="toggle-row">
            <div className="toggle-row-text">
              <h4>Show my profile photo</h4>
              <p>Your profile photo is shown to the receiver.</p>
            </div>
            <Toggle on={!!settings.show_photo} onToggle={() => toggle('show_photo')} />
          </div>
        </div>

        <div className="hint-text mb-8">Your number is always visible in your own call logs.</div>

        <h3 style={{ fontSize: 14, marginBottom: 10 }}>Live Preview — what the receiver sees</h3>
        <div className="card" style={{ background: 'var(--navy)', textAlign: 'center', color: 'white', marginBottom: 24 }}>
          <div className="badge badge-green" style={{ marginBottom: 12, background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}>
            <ShieldCheck size={14} color="#6ee7b7" /> VERIFIED EMPLOYER CALL
          </div>
          <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 4 }}>{company?.name || 'Your Company'}</div>
          {!!settings.show_name && <div style={{ fontSize: 14, marginBottom: 2 }}>{user?.full_name}</div>}
          {!!settings.show_designation && <div style={{ fontSize: 13, color: '#c7d2fe', marginBottom: 4 }}>Recruiter</div>}
          <div style={{ fontSize: 12, fontStyle: 'italic', color: '#c7d2fe' }}>Calling about: Registered Nurse</div>
          {!settings.hide_number && <div className="xs" style={{ marginTop: 8, color: '#93c5fd' }}>Tap to reveal direct number</div>}
        </div>

        <button className="btn btn-primary" onClick={save}>Save as Default</button>
        {saved && <div className="toast">Settings saved</div>}

        <div className="hint-text center" style={{ marginTop: 12 }}>
          Organisation name is always shown and cannot be hidden as it is the core verification.
        </div>
      </div>
    </>
  );
}
