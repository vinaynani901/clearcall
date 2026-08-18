import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import AdminLayout from './components/AdminLayout';
import AdminLogin from './screens/AdminLogin';
import CommandCentre from './screens/CommandCentre';
import Companies from './screens/Companies';
import JobSeekers from './screens/JobSeekers';
import VerificationQueue from './screens/VerificationQueue';
import ScamReports from './screens/ScamReports';
import Revenue from './screens/Revenue';
import Agents from './screens/Agents';
import SupportTickets from './screens/SupportTickets';
import Announcements from './screens/Announcements';
import SystemHealth from './screens/SystemHealth';
import AiAssistant from './screens/AiAssistant';
import PlanControl from './screens/PlanControl';
import './admin.css';

// Guards every /admin/* route except /admin/login — no admin session means
// an immediate redirect to the login screen, never a rendered page.
function AdminProtected({ children }) {
  const { admin, loading } = useAdminAuth();
  if (loading) return null;
  if (!admin) return <Navigate to="/admin/login" replace />;
  return children;
}

function page(active, Screen, props) {
  return (
    <AdminProtected>
      <AdminLayout active={active}>
        <Screen {...props} />
      </AdminLayout>
    </AdminProtected>
  );
}

function AdminRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={page('command-centre', CommandCentre)} />
      <Route path="/admin/companies" element={page('companies', Companies)} />
      <Route path="/admin/jobseekers" element={page('jobseekers', JobSeekers)} />
      <Route path="/admin/verification-queue" element={page('verification-queue', VerificationQueue)} />
      <Route path="/admin/scam-reports" element={page('scam-reports', ScamReports)} />
      <Route path="/admin/agents" element={page('agents', Agents)} />
      <Route path="/admin/revenue" element={page('revenue', Revenue)} />
      <Route path="/admin/plan-control" element={page('plan-control', PlanControl)} />
      <Route path="/admin/support-tickets" element={page('support-tickets', SupportTickets)} />
      <Route path="/admin/announcements" element={page('announcements', Announcements)} />
      <Route path="/admin/system-health" element={page('system-health', SystemHealth)} />
      <Route path="/admin/ai-assistant" element={page('ai-assistant', AiAssistant)} />
      <Route path="/admin/*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

// Entirely separate app tree from the main employer/job seeker app — its
// own auth provider, own token, own CSS, own routing. Mounted by the root
// App.jsx before any of the main app's layout/auth logic runs, and never
// linked to from anywhere inside the main app.
export default function AdminApp() {
  return (
    <div className="admin-app">
      <AdminAuthProvider>
        <AdminRoutes />
      </AdminAuthProvider>
    </div>
  );
}
