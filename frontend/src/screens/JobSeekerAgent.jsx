import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { HandshakeIcon, StarIcon, SearchIcon, KeyIcon } from '../components/Icons';
import { ErrorBanner, ConfirmDialog } from '../components/Shared';
import { api } from '../api/client';

function initials(name) {
  return String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function formatDate(value) {
  if (!value) return '';
  return new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_BADGE = {
  applied: 'badge-blue',
  interview_scheduled: 'badge-amber',
  offered: 'badge-green',
  rejected: 'badge-red',
  withdrawn: 'badge-grey',
};

export default function JobSeekerAgent() {
  const navigate = useNavigate();
  const [agents, setAgents] = useState([]);
  const [available, setAvailable] = useState([]);
  const [agentApplications, setAgentApplications] = useState([]);
  const [accessKeys, setAccessKeys] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectTarget, setConnectTarget] = useState(null);
  const [disconnectTarget, setDisconnectTarget] = useState(null);

  const [showKeyForm, setShowKeyForm] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: '', canViewProfile: true, canApplyForJobs: false, canViewApplications: false, expiresAt: '' });
  const [savingKey, setSavingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const load = (searchTerm) => Promise.all([
    api.getMyAgent(),
    api.listAvailableAgents(searchTerm),
    api.listAccessKeys(),
  ])
    .then(([a, av, keys]) => {
      setAgents(a.agents || []);
      setAvailable(av.agents || []);
      setAccessKeys(keys.accessKeys || []);
      if ((a.agents || []).length > 0) {
        api.getAgentApplications().then((r) => setAgentApplications(r.applications || [])).catch(() => {});
      } else {
        setAgentApplications([]);
      }
    })
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced live search — refetches the available-agents list 500ms after
  // the person stops typing, matching the same pattern used on Job Search.
  const skipNextDebounce = useRef(true);
  useEffect(() => {
    if (skipNextDebounce.current) { skipNextDebounce.current = false; return; }
    const timer = setTimeout(() => { api.listAvailableAgents(search).then((av) => setAvailable(av.agents || [])).catch((err) => setError(err.message)); }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const connect = async () => {
    try {
      await api.connectAgent(connectTarget.userId);
      setConnectTarget(null);
      load(search);
    } catch (err) {
      setError(err.message);
    }
  };

  const disconnect = async () => {
    try {
      await api.disconnectAgent(disconnectTarget.userId);
      setDisconnectTarget(null);
      load(search);
    } catch (err) {
      setError(err.message);
    }
  };

  const openKeyForm = () => {
    setKeyForm({ name: '', canViewProfile: true, canApplyForJobs: false, canViewApplications: false, expiresAt: '' });
    setShowKeyForm(true);
  };

  const generateKey = async () => {
    if (!keyForm.name.trim()) { setError('A name for this key is required, e.g. "For Career Connect Agency"'); return; }
    setSavingKey(true);
    try {
      const res = await api.createAccessKey({
        name: keyForm.name.trim(),
        canViewProfile: keyForm.canViewProfile,
        canApplyForJobs: keyForm.canApplyForJobs,
        canViewApplications: keyForm.canViewApplications,
        expiresAt: keyForm.expiresAt || undefined,
      });
      setShowKeyForm(false);
      setRevealedKey(res.key);
      setCopied(false);
      load(search);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingKey(false);
    }
  };

  const copyKey = () => {
    navigator.clipboard?.writeText(revealedKey || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const revokeKey = async () => {
    try {
      await api.revokeAccessKey(revokeTarget.id);
      setRevokeTarget(null);
      load(search);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <JobSeekerLayout active="agent">
      <h1 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 16px' }}>Placement Agent</h1>
      <ErrorBanner message={error} />

      {loading ? (
        <div className="card muted small">Loading…</div>
      ) : agents.length > 0 ? (
        <>
          <div className="jsk-jobs-grid mb-24">
            {agents.map((agent) => (
              <div key={agent.userId} className="card">
                <div className="row" style={{ gap: 14 }}>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--navy)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
                    {initials(agent.fullName)}
                  </div>
                  <div>
                    <div className="bold">{agent.fullName}</div>
                    <div className="muted small">{agent.agencyName}</div>
                    {agent.specialty && <div className="muted xs" style={{ marginTop: 2 }}>{agent.specialty}</div>}
                    <div className="row" style={{ gap: 12, marginTop: 4 }}>
                      {agent.rating != null && <span className="row small" style={{ gap: 4 }}><StarIcon size={13} /> {agent.rating}</span>}
                      {agent.successfulPlacements != null && <span className="muted xs">{agent.successfulPlacements} placements</span>}
                    </div>
                  </div>
                </div>
                <div className="row" style={{ gap: 10, marginTop: 18 }}>
                  <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => navigate(`/jobseeker/messages?with=${agent.userId}`)}>Message</button>
                  <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={() => setDisconnectTarget(agent)}>Disconnect</button>
                </div>
              </div>
            ))}
          </div>

          <div className="jsk-section-header">
            <h3>Applications Submitted By Your Agents</h3>
          </div>
          {agentApplications.length === 0 ? (
            <div className="card muted small mb-24">None of your agents have submitted an application on your behalf yet.</div>
          ) : (
            <div className="card mb-24" style={{ padding: 0, overflow: 'hidden' }}>
              {agentApplications.map((a, i) => (
                <div key={a.id} className="row" style={{ justifyContent: 'space-between', padding: '14px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--grey-100)' }}>
                  <div>
                    <div className="bold small">{a.job_title}</div>
                    <div className="muted xs">{a.company_name} · Submitted {formatDate(a.date_applied || a.created_at)}</div>
                  </div>
                  <span className={`badge ${STATUS_BADGE[a.status] || 'badge-grey'}`}>{(a.status || '').replace(/_/g, ' ')}</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="card jsk-empty-state mb-24">
          <HandshakeIcon size={36} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>Connect with a placement agent who can apply for jobs on your behalf.</div>
        </div>
      )}

      <div className="jsk-section-header">
        <h3>{agents.length > 0 ? 'Connect With Another Agent' : 'Find a Placement Agent'}</h3>
      </div>
      <div style={{ position: 'relative', maxWidth: 360, marginBottom: 14 }}>
        <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}><SearchIcon size={15} /></span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or specialty" style={{ width: '100%', padding: '10px 12px 10px 36px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 14 }} />
      </div>
      {available.length === 0 ? (
        <div className="card muted small mb-24">No agents match your search.</div>
      ) : (
        <div className="jsk-jobs-grid mb-24">
          {available.filter((a) => !agents.some((connected) => connected.userId === a.userId)).map((a) => (
            <div key={a.userId} className="card">
              <div className="row" style={{ gap: 10 }}>
                <div className="jsk-job-logo">{initials(a.fullName)}</div>
                <div>
                  <div className="bold small">{a.fullName}</div>
                  <div className="muted xs">{a.agencyName}</div>
                  {a.specialty && <div className="muted xs">{a.specialty}</div>}
                </div>
              </div>
              <div className="row small" style={{ gap: 12, marginTop: 10 }}>
                {a.rating != null && <span className="row" style={{ gap: 4 }}><StarIcon size={14} /> {a.rating}</span>}
                <span className="muted xs">{a.successfulPlacements || 0} placements</span>
              </div>
              <button className="btn btn-outline btn-sm" style={{ width: '100%', marginTop: 12 }} onClick={() => setConnectTarget(a)}>Connect</button>
            </div>
          ))}
        </div>
      )}

      <div className="jsk-section-header">
        <h3>My Access Keys</h3>
        <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={openKeyForm}>Generate New Key</button>
      </div>
      {accessKeys.length === 0 ? (
        <div className="card jsk-empty-state">
          <KeyIcon size={32} color="#cbd5e1" />
          <div style={{ marginTop: 10 }}>Generate an access key to let a placement agent view your profile or apply for jobs on your behalf.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {accessKeys.map((k, i) => (
            <div key={k.id} className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', padding: '14px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--grey-100)', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <div className="row" style={{ gap: 8 }}>
                  <span className="bold small">{k.name}</span>
                  {k.revokedAt && <span className="badge badge-grey">Revoked</span>}
                  {!k.revokedAt && k.isExpired && <span className="badge badge-grey">Expired</span>}
                  {!k.revokedAt && !k.isExpired && k.agentName && <span className="badge badge-green">Connected</span>}
                </div>
                <div className="muted xs" style={{ marginTop: 4 }}>{k.keyPreview}</div>
                <div className="muted xs" style={{ marginTop: 2 }}>
                  {k.agentName ? `Shared with ${k.agentName}${k.agencyName ? ` (${k.agencyName})` : ''}` : 'Not yet redeemed'}
                  {' · '}Created {formatDate(k.createdAt)}
                  {k.expiresAt ? ` · Expires ${formatDate(k.expiresAt)}` : ''}
                  {' · '}{k.applicationsCount || 0} application{k.applicationsCount === 1 ? '' : 's'} made
                </div>
              </div>
              {!k.revokedAt && (
                <button className="btn btn-outline btn-sm" style={{ width: 'auto', color: 'var(--red-dark)', borderColor: 'var(--red-dark)' }} onClick={() => setRevokeTarget(k)}>Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}

      {connectTarget && (
        <ConfirmDialog
          title={`Connect with ${connectTarget.fullName}?`}
          message={`${connectTarget.agencyName} will be able to see your profile and apply to jobs on your behalf.`}
          confirmLabel="Connect"
          onCancel={() => setConnectTarget(null)}
          onConfirm={connect}
        />
      )}
      {disconnectTarget && (
        <ConfirmDialog
          title={`Disconnect from ${disconnectTarget.fullName}?`}
          message="You can reconnect with this agent or another one at any time."
          confirmLabel="Disconnect"
          onCancel={() => setDisconnectTarget(null)}
          onConfirm={disconnect}
        />
      )}
      {revokeTarget && (
        <ConfirmDialog
          title={`Revoke "${revokeTarget.name}"?`}
          message="This key will no longer work. This doesn't disconnect an agent who already redeemed it."
          confirmLabel="Revoke"
          onCancel={() => setRevokeTarget(null)}
          onConfirm={revokeKey}
        />
      )}

      {showKeyForm && (
        <div className="sheet-backdrop" onClick={() => !savingKey && setShowKeyForm(false)}>
          <div className="sheet" style={{ borderRadius: 16, maxWidth: 420, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Generate New Access Key</div>
            <label className="muted xs" style={{ display: 'block', marginBottom: 4 }}>Key name</label>
            <input value={keyForm.name} onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })} placeholder='e.g. "For Career Connect Agency"' style={{ width: '100%', padding: '10px 12px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 14, marginBottom: 14 }} />

            <label className="muted xs" style={{ display: 'block', marginBottom: 6 }}>Permissions</label>
            <label className="row small" style={{ gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={keyForm.canViewProfile} onChange={(e) => setKeyForm({ ...keyForm, canViewProfile: e.target.checked })} /> View my profile
            </label>
            <label className="row small" style={{ gap: 8, marginBottom: 8 }}>
              <input type="checkbox" checked={keyForm.canApplyForJobs} onChange={(e) => setKeyForm({ ...keyForm, canApplyForJobs: e.target.checked })} /> Apply for jobs on my behalf
            </label>
            <label className="row small" style={{ gap: 8, marginBottom: 14 }}>
              <input type="checkbox" checked={keyForm.canViewApplications} onChange={(e) => setKeyForm({ ...keyForm, canViewApplications: e.target.checked })} /> View my applications
            </label>

            <label className="muted xs" style={{ display: 'block', marginBottom: 4 }}>Expiry date (optional)</label>
            <input type="date" value={keyForm.expiresAt} onChange={(e) => setKeyForm({ ...keyForm, expiresAt: e.target.value })} style={{ width: '100%', padding: '10px 12px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 14, marginBottom: 18 }} />

            <div className="row" style={{ gap: 10 }}>
              <button className="btn btn-grey" onClick={() => setShowKeyForm(false)} disabled={savingKey}>Cancel</button>
              <button className="btn btn-primary" onClick={generateKey} disabled={savingKey}>{savingKey ? 'Generating…' : 'Generate Key'}</button>
            </div>
          </div>
        </div>
      )}

      {revealedKey && (
        <div className="sheet-backdrop" onClick={() => setRevealedKey(null)}>
          <div className="sheet" style={{ borderRadius: 16, maxWidth: 420, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 10 }}>Your Access Key</div>
            <div className="badge badge-red" style={{ display: 'block', marginBottom: 14, padding: '10px 12px', fontWeight: 700 }}>
              Copy this key now — it will not be shown again.
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              <input readOnly value={revealedKey} onFocus={(e) => e.target.select()} style={{ flex: 1, padding: '10px 12px', border: '2px solid var(--grey-200)', borderRadius: 10, fontSize: 13, fontFamily: 'monospace' }} />
              <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={copyKey}>{copied ? 'Copied!' : 'Copy'}</button>
            </div>
            <button className="btn btn-grey" style={{ width: '100%' }} onClick={() => setRevealedKey(null)}>Done</button>
          </div>
        </div>
      )}
    </JobSeekerLayout>
  );
}
