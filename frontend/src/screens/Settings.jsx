import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePlan } from '../context/PlanContext';
import { api } from '../api/client';
import { Modal } from '../components/Modal';

function DeleteAccountModal({ onClose, onDeleted }) {
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') {
      alert('Please type DELETE to confirm.');
      return;
    }

    setBusy(true);
    try {
      await api.deleteAccount();
      onDeleted();
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title="Delete Account">
      <p>Are you sure you want to delete your account? This action cannot be undone.</p>
      <div className="field">
        <label>Type DELETE to confirm:</label>
        <input
          type="text"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder="DELETE"
        />
      </div>
      <div className="actions">
        <button className="btn btn-danger" onClick={handleDelete} disabled={busy}>
          {busy ? 'Deleting...' : 'Delete Account'}
        </button>
        <button className="btn btn-outline" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </Modal>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { plan } = usePlan();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleAccountDeleted = () => {
    setShowDeleteModal(false);
    logout();
    navigate('/login');
  };

  const isJobSeeker = user?.role === 'jobseeker';
  const planLabel = plan?.planLabel || (isJobSeeker ? 'Free' : 'Free');
  const isFree = plan?.plan === 'free' || !plan?.plan;
  const pricingPath = isJobSeeker ? '/pricing/jobseeker' : '/pricing';

  return (
    <div className="settings-page">
      <h1>Settings</h1>

      <div className="card">
        <h2>My Plan</h2>
        <div className="field">
          <label>Current Plan</label>
          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span className="bold" style={{ fontSize: 16 }}>{planLabel}</span>
            {!isFree && <span className="badge badge-green">Active</span>}
          </div>
        </div>
        {isFree && (
          <button className="btn btn-primary" style={{ width: 'auto' }} onClick={() => navigate(pricingPath)}>
            Upgrade Plan
          </button>
        )}
        {!isFree && (
          <button className="btn btn-outline" style={{ width: 'auto' }} onClick={() => navigate(pricingPath)}>
            Manage Subscription
          </button>
        )}
      </div>

      <div className="card">
        <h2>Account</h2>
        <div className="field">
          <label>Email</label>
          <div className="value">{user.email}</div>
        </div>
        <div className="field">
          <label>Account Type</label>
          <div className="value">{user.type}</div>
        </div>
        <div className="actions">
          <button className="btn btn-outline" onClick={handleLogout}>Log Out</button>
          <button className="btn btn-danger" onClick={() => setShowDeleteModal(true)}>Delete Account</button>
        </div>
      </div>

      {showDeleteModal && (
        <DeleteAccountModal
          onClose={() => setShowDeleteModal(false)}
          onDeleted={handleAccountDeleted}
        />
      )}
    </div>
  );
}