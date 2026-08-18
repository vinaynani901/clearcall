import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav } from '../components/Shared';

export default function Contacts() {
  const navigate = useNavigate();
  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Contacts" onBack={() => navigate('/employer/dashboard')} />
        <div className="card center" style={{ padding: 48 }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📇</div>
          <div className="bold" style={{ fontSize: 18, marginBottom: 8 }}>Contacts</div>
          <p className="muted small" style={{ margin: '0 auto', maxWidth: 360 }}>
            A shared address book pulling together every candidate and client contact across all of your campaigns will live here.
          </p>
          <p className="muted xs" style={{ marginTop: 16 }}>This feature is coming in the next update.</p>
        </div>
      </div>
      <EmployerBottomNav active="dashboard" />
    </>
  );
}
