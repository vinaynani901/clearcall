// Plan Control > Auto Apply tab — Part 8 (engine stats + controls + log +
// per-job-seeker history) and Part 10 (AI Configuration: provider status,
// cost reference, provider switcher, test button).
import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminStatCard, AdminBadge, AdminErrorBanner, AdminModal } from '../components/AdminUI';
import AdminTable from '../components/AdminTable';

// --- Engine stats + controls -----------------------------------------

function EngineControls({ settings, onSaved }) {
  const [paused, setPaused] = useState(settings.paused);
  const [frequency, setFrequency] = useState(settings.runFrequencyMinutes);
  const [saving, setSaving] = useState(false);
  const [runningNow, setRunningNow] = useState(false);
  const [runResult, setRunResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setPaused(settings.paused); setFrequency(settings.runFrequencyMinutes); }, [settings]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      const result = await adminApi.saveAutoApplySettings({ paused, runFrequencyMinutes: Number(frequency) });
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const togglePause = async () => {
    setSaving(true); setError('');
    try {
      const result = await adminApi.saveAutoApplySettings({ paused: !paused });
      setPaused(result.paused);
      onSaved(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunningNow(true); setRunResult(null); setError('');
    try {
      const result = await adminApi.runAutoApplyNow();
      setRunResult(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningNow(false);
    }
  };

  return (
    <div className="admin-card" style={{ marginBottom: 20 }}>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Engine Controls</div>
      <AdminErrorBanner message={error} />
      <div className="admin-row" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Engine status</div>
          <button className={`admin-btn admin-btn-sm ${paused ? 'admin-btn-outline' : 'admin-btn-green'}`} disabled={saving} onClick={togglePause}>
            {paused ? 'Paused — click to resume' : 'Running — click to pause'}
          </button>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Run frequency (minutes)</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number" min={1} value={frequency} onChange={(e) => setFrequency(e.target.value)}
              style={{ width: 90, padding: '8px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
            />
            <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={saving} onClick={save}>Save</button>
          </div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Manual trigger</div>
          <button className="admin-btn admin-btn-primary admin-btn-sm" disabled={runningNow} onClick={runNow}>
            {runningNow ? 'Running…' : 'Run Now'}
          </button>
        </div>
      </div>
      {runResult && (
        <div style={{ marginTop: 14, background: '#eff6ff', color: '#1d4ed8', padding: '10px 14px', borderRadius: 8, fontSize: 13 }}>
          {runResult.skipped
            ? `Skipped — ${runResult.reason}.`
            : `Checked ${runResult.jobSeekersChecked} job seeker(s), found ${runResult.newJobsFound} new job(s), submitted ${runResult.applicationsSubmitted} application(s).`}
        </div>
      )}
    </div>
  );
}

function JobseekerHistoryModal({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { adminApi.getAutoApplyJobseekerHistory(userId).then(setData).catch((err) => setError(err.message)); }, [userId]);

  return (
    <AdminModal title="Auto Apply History" onClose={onClose} maxWidth={640}>
      <AdminErrorBanner message={error} />
      {!data ? (
        <div className="muted">Loading…</div>
      ) : (
        <>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>{data.user.full_name}</div>
            <div className="muted" style={{ fontSize: 12.5 }}>{data.user.email} · {data.user.plan} · Auto Apply {data.isActive ? 'ON' : 'OFF'}</div>
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Recent Runs</div>
          <table className="admin-table" style={{ marginBottom: 18 }}>
            <thead><tr><th>When</th><th>Checked</th><th>Matched</th><th>Submitted</th></tr></thead>
            <tbody>
              {data.log.slice(0, 20).map((l) => (
                <tr key={l.id}>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(`${l.run_at.replace(' ', 'T')}Z`).toLocaleString('en-AU')}</td>
                  <td>{l.jobs_checked}</td>
                  <td>{l.jobs_matched}</td>
                  <td>{l.applications_submitted}</td>
                </tr>
              ))}
              {data.log.length === 0 && <tr><td colSpan={4} className="admin-table-empty">No runs yet.</td></tr>}
            </tbody>
          </table>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Applications Submitted</div>
          <table className="admin-table">
            <thead><tr><th>Job</th><th>Score</th><th>Status</th><th>When</th></tr></thead>
            <tbody>
              {data.applications.slice(0, 20).map((a) => (
                <tr key={a.id}>
                  <td>{a.job_title} — {a.company_name}</td>
                  <td>{a.match_score ?? '—'}%</td>
                  <td><AdminBadge tone="navy">{a.status}</AdminBadge></td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(`${a.created_at.replace(' ', 'T')}Z`).toLocaleString('en-AU')}</td>
                </tr>
              ))}
              {data.applications.length === 0 && <tr><td colSpan={4} className="admin-table-empty">No applications yet.</td></tr>}
            </tbody>
          </table>
        </>
      )}
    </AdminModal>
  );
}

function EngineLog() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState('');
  const [historyUserId, setHistoryUserId] = useState(null);

  useEffect(() => { adminApi.getAutoApplyLog(200).then((d) => setRows(d.log || [])).catch((err) => setError(err.message)); }, []);

  const columns = [
    { key: 'run_at', label: 'When', sortable: true, render: (r) => new Date(`${r.run_at.replace(' ', 'T')}Z`).toLocaleString('en-AU') },
    { key: 'user_name', label: 'Job Seeker', sortable: true },
    { key: 'user_email', label: 'Email' },
    { key: 'jobs_checked', label: 'Checked', sortable: true },
    { key: 'jobs_matched', label: 'Matched', sortable: true },
    { key: 'applications_submitted', label: 'Submitted', sortable: true },
    { key: 'view', label: '', render: (r) => <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => setHistoryUserId(r.user_id)}>View History</button> },
  ];

  return (
    <div className="admin-card">
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 14 }}>Auto Apply Log</div>
      <AdminErrorBanner message={error} />
      <AdminTable columns={columns} rows={rows} csvFilename="auto-apply-log.csv" emptyMessage="No runs logged yet." />
      {historyUserId && <JobseekerHistoryModal userId={historyUserId} onClose={() => setHistoryUserId(null)} />}
    </div>
  );
}

// --- AI Configuration (Part 10) --------------------------------------

function ProviderCard({ provider, activeProvider, onChanged }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(provider.lastTest);
  const [error, setError] = useState('');

  const runTest = async () => {
    setTesting(true); setError('');
    try {
      const result = await adminApi.testAiProvider(provider.provider);
      setTestResult({ ...result, testedAt: new Date().toISOString() });
    } catch (err) {
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const setActive = async () => {
    setError('');
    try {
      await adminApi.setAiProvider(provider.provider);
      onChanged();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="admin-card" style={{ marginBottom: 14 }}>
      <div className="admin-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontWeight: 700 }}>{provider.label}</span>
            <span style={{ color: provider.configured ? '#059669' : '#dc2626', fontWeight: 700 }}>{provider.configured ? '✓' : '✕'}</span>
            {provider.provider === activeProvider && <AdminBadge tone="green">Active</AdminBadge>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {provider.configured ? 'Key present in .env' : `Not configured — get a key from ${provider.getKeyUrl}`}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
            Estimated cost per tailoring: ${provider.estimatedCostPerTailoring.toFixed(3)}
          </div>
          {testResult && (
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>
              Last test: <span style={{ color: testResult.success ? '#059669' : '#dc2626', fontWeight: 700 }}>{testResult.success ? 'Pass' : 'Fail'}</span>
              {testResult.testedAt ? ` · ${new Date(testResult.testedAt).toLocaleString('en-AU')}` : ''}
              {!testResult.success && testResult.error ? ` — ${testResult.error}` : ''}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={testing || !provider.configured} onClick={runTest}>
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button className="admin-btn admin-btn-primary admin-btn-sm" disabled={!provider.configured || provider.provider === activeProvider} onClick={setActive}>
            Set Active
          </button>
        </div>
      </div>
      {error && <div style={{ color: '#dc2626', fontSize: 12.5, marginTop: 8 }}>{error}</div>}
      {testResult?.resultSnippet && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8, background: '#f8fafc', padding: 10, borderRadius: 8, whiteSpace: 'pre-wrap', maxHeight: 140, overflowY: 'auto' }}>
          {testResult.resultSnippet}
        </div>
      )}
    </div>
  );
}

function AiConfiguration() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');

  const load = () => adminApi.getAiConfig().then(setConfig).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  if (!config) return <div className="admin-card muted">Loading…</div>;

  return (
    <div>
      <AdminErrorBanner message={error} />
      <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
        Each provider is picked up automatically the moment its key is present in the backend .env file — no code changes or manual restart needed.
        Until any key is configured, Auto Apply submits the base (untailored) resume.
      </p>
      {config.providers.map((p) => (
        <ProviderCard key={p.provider} provider={p} activeProvider={config.activeProvider} onChanged={load} />
      ))}
    </div>
  );
}

// --- Root ------------------------------------------------------------

export default function PlanControlAutoApply() {
  const [stats, setStats] = useState(null);
  const [settings, setSettings] = useState(null);
  const [error, setError] = useState('');

  const load = () => {
    adminApi.getAutoApplyStats().then(setStats).catch((err) => setError(err.message));
    adminApi.getAutoApplySettings().then(setSettings).catch((err) => setError(err.message));
  };
  useEffect(() => { load(); }, []);

  if (!stats || !settings) return <div className="admin-card muted">Loading…</div>;

  return (
    <div>
      <AdminErrorBanner message={error} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 20 }}>
        <AdminStatCard label="Runs Today" value={stats.totalRunsToday} tone="navy" />
        <AdminStatCard label="Applications Submitted Today" value={stats.totalApplicationsSubmittedToday} tone="green" />
        <AdminStatCard label="Job Seekers With Auto Apply On" value={stats.jobSeekersWithAutoApplyEnabled} tone="navy" />
        <AdminStatCard label="Average Match Score" value={stats.averageMatchScore !== null ? `${stats.averageMatchScore}%` : '—'} tone="grey" />
        <AdminStatCard label="Success Rate" value={stats.successRate !== null ? `${stats.successRate}%` : '—'} tone={stats.successRate >= 20 ? 'green' : 'orange'} />
        <AdminStatCard label="Active AI Provider" value={stats.activeAiProvider} tone={stats.activeAiProvider === 'Not configured' ? 'grey' : 'green'} />
      </div>

      <EngineControls settings={settings} onSaved={(s) => { setSettings(s); load(); }} />
      <EngineLog />

      <div style={{ fontWeight: 800, fontSize: 16, margin: '24px 0 14px' }}>AI Configuration</div>
      <AiConfiguration />
    </div>
  );
}
