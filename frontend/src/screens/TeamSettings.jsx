import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner, ConfirmDialog } from '../components/Shared';
import { api } from '../api/client';
import { formatDate } from '../utils/date';

const ROLE_OPTIONS = ['Admin', 'Recruiter', 'Member'];

function timeUntil(iso) {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'Expired';
  const hours = Math.floor(diffMs / (60 * 60 * 1000));
  if (hours < 1) return `${Math.max(1, Math.floor(diffMs / (60 * 1000)))}m left`;
  if (hours < 48) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d left`;
}

function InviteModal({ onClose, onInvited, extraMemberPrice }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('Member');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [overLimitPrompt, setOverLimitPrompt] = useState(false);

  const send = async (confirmExtra) => {
    setSaving(true);
    setError('');
    try {
      await api.inviteRecruiter({ fullName: fullName.trim(), email: email.trim(), role, confirmExtra });
      onInvited();
    } catch (err) {
      if (err.data && err.data.overLimit && !confirmExtra) {
        setOverLimitPrompt(true);
      } else {
        setError(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const submit = (e) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;
    send(false);
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" style={{ borderRadius: 20, maxWidth: 400, margin: '0 auto' }} onClick={(e) => e.stopPropagation()}>
        {overLimitPrompt ? (
          <>
            <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>Add an extra member?</div>
            <p className="muted small" style={{ marginBottom: 16 }}>
              You have used all included member slots on your plan. Adding {fullName || 'this person'} will be billed as an extra member at ${extraMemberPrice.toFixed(2)} per month.
            </p>
            <ErrorBanner message={error} />
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-grey" onClick={() => setOverLimitPrompt(false)} disabled={saving}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={() => send(true)}>
                {saving ? 'Sending…' : `Add for $${extraMemberPrice.toFixed(2)}/mo`}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="bold" style={{ fontSize: 16, marginBottom: 8 }}>Invite Team Member</div>
            <ErrorBanner message={error} />
            <form onSubmit={submit} className="stack">
              <div className="field">
                <label>Full Name</label>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jordan Lee" />
              </div>
              <div className="field">
                <label>Work Email</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jordan@yourcompany.com.au" />
              </div>
              <div className="field">
                <label>Role</label>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="row" style={{ gap: 10 }}>
                <button type="button" className="btn btn-grey" onClick={onClose} disabled={saving}>Cancel</button>
                <button className="btn btn-primary" disabled={saving}>{saving ? 'Sending…' : 'Send Invitation'}</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

export default function TeamSettings() {
  const navigate = useNavigate();
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [toast, setToast] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { type, member }
  const [busyId, setBusyId] = useState(null);

  const load = () => api.getTeam().then(setTeam).catch((err) => setError(err.message)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const showToast = (label) => { setToast(label); setTimeout(() => setToast(''), 2200); };

  const resend = async (inv) => {
    setBusyId(inv.id);
    try {
      await api.resendInvitation(inv.id);
      showToast(`Invitation resent to ${inv.email}`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const runAction = async () => {
    if (!pendingAction) return;
    const { type, member } = pendingAction;
    setBusyId(member.id);
    try {
      if (type === 'deactivate') await api.deactivateRecruiter(member.id);
      if (type === 'reactivate') await api.reactivateRecruiter(member.id);
      if (type === 'remove') await api.removeRecruiter(member.id);
      if (type === 'revoke') await api.revokeInvitation(member.id);
      await load();
      showToast(type === 'remove' ? 'Team member removed' : type === 'revoke' ? 'Invitation revoked' : 'Updated');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
      setPendingAction(null);
    }
  };

  const overLimit = team && team.slots.limit !== null && team.slots.used >= team.slots.limit;
  const slotsPercent = team && team.slots.limit ? Math.min(100, Math.round((team.slots.used / team.slots.limit) * 100)) : 0;

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="My Team" onBack={() => navigate('/settings')} />
        <ErrorBanner message={error} />

        {loading && <div className="muted small" style={{ padding: 20 }}>Loading team…</div>}

        {team && (
          <>
            <div className="card" style={{ marginBottom: 16 }}>
              <div className="row-between mb-8">
                <div>
                  <div className="bold small">Team Members</div>
                  <div className="muted small">
                    {team.slots.used} of {team.slots.limit === null ? 'unlimited' : team.slots.limit} member slots used
                  </div>
                </div>
                {team.isOwner && (
                  <button className="btn btn-primary btn-sm" style={{ width: 'auto' }} onClick={() => setShowAdd(true)}>
                    Invite Team Member
                  </button>
                )}
              </div>
              {team.slots.limit !== null && (
                <div style={{ height: 7, background: 'var(--grey-200)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', width: `${Math.min(slotsPercent, 100)}%`, borderRadius: 999,
                    background: overLimit ? '#ef4444' : slotsPercent >= 80 ? '#f59e0b' : 'var(--green)',
                  }} />
                </div>
              )}
              {overLimit && (
                <p className="small" style={{ color: '#b45309', marginTop: 8, marginBottom: 0 }}>
                  You have used all included member slots — add extra members at ${team.extraMemberPrice.toFixed(2)} per member per month.
                </p>
              )}
            </div>

            {team.members.map((m) => (
              <div key={m.id} className="card row-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 12 }}>
                <div>
                  <div className="bold">
                    {m.fullName}
                    {m.role === 'owner' ? (
                      <span className="badge badge-blue xs" style={{ marginLeft: 6 }}>Owner</span>
                    ) : (
                      <span className="badge badge-grey-light xs" style={{ marginLeft: 6 }}>{m.role}</span>
                    )}
                  </div>
                  <div className="muted small">{m.email}</div>
                  <div className="muted xs">Joined {formatDate(m.addedAt)}</div>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${m.deactivated ? 'badge-grey-light' : 'badge-green'}`}>{m.deactivated ? 'Inactive' : 'Active'}</span>
                  {team.isOwner && m.role !== 'owner' && (
                    <>
                      {m.deactivated ? (
                        <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} disabled={busyId === m.id} onClick={() => setPendingAction({ type: 'reactivate', member: m })}>
                          Reactivate
                        </button>
                      ) : (
                        <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} disabled={busyId === m.id} onClick={() => setPendingAction({ type: 'deactivate', member: m })}>
                          Deactivate
                        </button>
                      )}
                      <button className="btn btn-red btn-sm" style={{ width: 'auto' }} disabled={busyId === m.id} onClick={() => setPendingAction({ type: 'remove', member: m })}>
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}

            {team.pendingInvitations.length > 0 && (
              <>
                <div className="bold small" style={{ margin: '20px 0 8px' }}>Pending Invitations</div>
                {team.pendingInvitations.map((inv) => (
                  <div key={inv.id} className="card row-between" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <div className="bold">{inv.name} <span className="badge badge-grey-light xs" style={{ marginLeft: 6 }}>{inv.role}</span></div>
                      <div className="muted small">{inv.email}</div>
                      <div className="muted xs">Sent {formatDate(inv.createdAt)} · {timeUntil(inv.expiresAt)}</div>
                    </div>
                    {team.isOwner && (
                      <div className="row" style={{ gap: 8 }}>
                        <button className="btn btn-outline btn-sm" style={{ width: 'auto' }} disabled={busyId === inv.id} onClick={() => resend(inv)}>
                          Resend
                        </button>
                        <button className="btn btn-grey btn-sm" style={{ width: 'auto' }} disabled={busyId === inv.id} onClick={() => setPendingAction({ type: 'revoke', member: inv })}>
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <EmployerBottomNav active="settings" />

      {showAdd && (
        <InviteModal
          extraMemberPrice={team?.extraMemberPrice || 10}
          onClose={() => setShowAdd(false)}
          onInvited={() => { setShowAdd(false); load(); showToast('Invitation sent'); }}
        />
      )}

      {pendingAction && (
        <ConfirmDialog
          title={pendingAction.type === 'remove' ? 'Remove team member?' : pendingAction.type === 'revoke' ? 'Revoke invitation?' : pendingAction.type === 'deactivate' ? 'Deactivate team member?' : 'Reactivate team member?'}
          message={pendingAction.type === 'remove' ? 'They will lose access to this company\'s ClearCall account. Their historical calls and campaigns are kept.' : pendingAction.type === 'revoke' ? 'This invitation link will no longer work.' : pendingAction.type === 'deactivate' ? 'They will no longer be able to log in until reactivated.' : 'They will regain access to log in.'}
          confirmLabel={pendingAction.type === 'remove' || pendingAction.type === 'revoke' ? 'Yes, remove' : 'Confirm'}
          onConfirm={runAction}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </>
  );
}
