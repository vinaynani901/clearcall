import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const CATEGORIES = [
  'Education', 'Healthcare', 'Construction and Trades', 'Technology', 'Finance',
  'Retail', 'Hospitality', 'Government', 'Legal', 'Engineering', 'Creative and Media', 'Other',
];

export default function WorkProfiles() {
  const navigate = useNavigate();
  const { company } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ industryCategory: '', designation: '', organisation: '' });
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const load = () => api.listWorkProfiles().then((d) => setProfiles(d.profiles || [])).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const activate = async (id) => {
    await api.activateWorkProfile(id);
    load();
  };

  const createProfile = async (e) => {
    e.preventDefault();
    setError('');
    setCreating(true);
    try {
      const data = await api.createWorkProfile(form);
      setShowModal(false);
      setForm({ industryCategory: '', designation: '', organisation: '' });
      navigate('/verify/abn', { state: { companyId: company?.id, abn: company?.abn, workProfileId: data.profile.id } });
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="My Work Profiles" />
        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : (
          <div className="stack list-grid mb-24">
            {profiles.map((p) => (
              <div
                key={p.id}
                className="card"
                style={p.is_active ? { border: '2px solid var(--navy)' } : {}}
              >
                <div className="row-between mb-8">
                  <div>
                    <div className="bold" style={{ fontSize: 15 }}>{p.designation}</div>
                    <div className="muted small">{p.organisation}</div>
                  </div>
                  {p.abn_verified ? <span className="badge badge-green">ABN Verified</span> : <span className="badge badge-grey">Unverified</span>}
                </div>
                {p.is_active ? (
                  <span className="badge badge-blue">Currently Active</span>
                ) : (
                  <button className="btn btn-outline btn-sm" onClick={() => activate(p.id)}>Set as Active</button>
                )}
              </div>
            ))}
          </div>
        )}

        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Another Work Profile</button>
        <div className="hint-text center" style={{ marginTop: 12 }}>Each work profile needs its own ABN verification.</div>
      </div>

      {showModal && (
        <div className="sheet-backdrop" onClick={() => setShowModal(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="row-between mb-16">
              <div style={{ fontWeight: 800, fontSize: 17 }}>Add Work Profile</div>
              <button className="back-btn" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <ErrorBanner message={error} />
            <form onSubmit={createProfile} className="stack">
              <div className="field">
                <label>Profession category</label>
                <select required value={form.industryCategory} onChange={(e) => setForm((f) => ({ ...f, industryCategory: e.target.value }))}>
                  <option value="">Select category</option>
                  {CATEGORIES.map((c) => <option key={c} value={c.toLowerCase()}>{c}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Designation</label>
                <input required value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))} placeholder="e.g. Principal, Nurse, Site Supervisor" />
              </div>
              <div className="field">
                <label>Organisation</label>
                <input required value={form.organisation} onChange={(e) => setForm((f) => ({ ...f, organisation: e.target.value }))} />
              </div>
              <button className="btn btn-primary" disabled={creating}>{creating ? 'Saving...' : 'Continue to Verification'}</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
