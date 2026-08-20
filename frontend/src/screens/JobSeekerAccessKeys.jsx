import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { api } from '../api/client';

export default function JobSeekerAccessKeys() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.getAccessKeys().then(d => setKeys(d.keys)).catch(() => {});
  }, []);

  const generate = async () => {
    if (!keyName.trim()) return;
    setLoading(true);
    try {
      const d = await api.generateAccessKey(keyName);
      setNewKey(d.key_string);
      api.getAccessKeys().then(d => setKeys(d.keys));
    } catch(e) {
      alert(e.message || 'Could not generate key');
    } finally {
      setLoading(false);
    }
  };

  const revoke = async (id) => {
    if (!confirm('Revoke this key? Agent loses access immediately.')) return;
    await api.revokeAccessKey(id);
    setKeys(keys.map(k => k.id === id ? {...k, status: 'revoked'} : k));
  };

  return (
    <JobSeekerLayout active="access-keys">
      <div className="card">
        <h2>My Access Keys</h2>
        <p className="muted">Share keys with placement agents to apply on your behalf</p>

        <div className="form-group">
          <label>Key Name</label>
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            placeholder="Enter a name for this key"
          />
        </div>

        <button
          className="btn btn-primary"
          onClick={generate}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate New Key'}
        </button>

        {newKey && (
          <div className="key-box">
            <p className="key-text">{newKey}</p>
            <p className="warning">Copy this key now — it will not be shown again</p>
            <button
              className="btn btn-outline"
              onClick={() => setNewKey(null)}
            >Done</button>
          </div>
        )}
      </div>

      <div className="card">
        <h3>Your Access Keys</h3>
        <p className="muted">Active keys: {keys.filter(k => k.status === 'active').length}/5</p>

        {keys.length > 0 ? (
          <div className="key-list">
            {keys.map((key) => (
              <div key={key.id} className="key-item">
                <div className="row-between">
                  <h4>{key.key_name}</h4>
                  <span className={`badge ${key.status === 'active' ? 'badge-green' : 'badge-red'}`}>{key.status}</span>
                </div>
                <p className="muted">Created: {new Date(key.created_at).toLocaleDateString()}</p>
                <p className="muted">Applications made: {key.applications_made}</p>
                {key.status === 'active' && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => revoke(key.id)}
                  >Revoke</button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">No access keys yet</p>
        )}
      </div>
    </JobSeekerLayout>
  );
}test123
