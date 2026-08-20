import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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

  return (
    <div className="settings-page">
      <h1>Settings</h1>
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
