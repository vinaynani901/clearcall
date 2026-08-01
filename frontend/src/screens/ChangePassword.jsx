import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';

export default function ChangePassword() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const update = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) {
      setError('New passwords do not match');
      return;
    }
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      navigate('/success', { state: { message: 'Your password has been changed.', continueTo: '/settings' } });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Change Password" />
        <ErrorBanner message={error} />
        <form onSubmit={submit} className="stack">
          <div className="field">
            <label>Current password</label>
            <input required type="password" value={form.currentPassword} onChange={update('currentPassword')} />
          </div>
          <div className="field">
            <label>New password</label>
            <input required type="password" value={form.newPassword} onChange={update('newPassword')} placeholder="At least 8 characters" />
          </div>
          <div className="field">
            <label>Confirm new password</label>
            <input required type="password" value={form.confirm} onChange={update('confirm')} />
          </div>
          <button className="btn btn-primary" disabled={loading}>{loading ? 'Saving...' : 'Change Password'}</button>
        </form>
      </div>
    </>
  );
}
