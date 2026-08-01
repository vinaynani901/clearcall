import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Splash from './screens/Splash';
import Onboarding1 from './screens/Onboarding1';
import Onboarding2 from './screens/Onboarding2';
import Onboarding3 from './screens/Onboarding3';
import SignupSelect from './screens/SignupSelect';
import JobSeekerSignup from './screens/JobSeekerSignup';
import EmployerSignup from './screens/EmployerSignup';
import AbnVerification from './screens/AbnVerification';
import WorkEmailOtp from './screens/WorkEmailOtp';
import JobSeekerLogin from './screens/JobSeekerLogin';
import EmployerLogin from './screens/EmployerLogin';
import JobSeekerHome from './screens/JobSeekerHome';
import EmployerDashboard from './screens/EmployerDashboard';
import MakeCall from './screens/MakeCall';
import WorkProfiles from './screens/WorkProfiles';
import CallDisplaySettings from './screens/CallDisplaySettings';
import IncomingVerifiedCall from './screens/IncomingVerifiedCall';
import IncomingUnverifiedCall from './screens/IncomingUnverifiedCall';
import CallHistory from './screens/CallHistory';
import PostNormalCallNudge from './screens/PostNormalCallNudge';
import CompanyProfile from './screens/CompanyProfile';
import ReportCall from './screens/ReportCall';
import Settings from './screens/Settings';
import HelpSupport from './screens/HelpSupport';
import SuccessConfirmation from './screens/SuccessConfirmation';
import JobSeekerProfile from './screens/JobSeekerProfile';
import ChangePassword from './screens/ChangePassword';
import TermsPrivacy from './screens/TermsPrivacy';

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signup" replace />;
  return children;
}

export default function App() {
  return (
    <div className="app-shell">
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/onboarding/1" element={<Onboarding1 />} />
        <Route path="/onboarding/2" element={<Onboarding2 />} />
        <Route path="/onboarding/3" element={<Onboarding3 />} />
        <Route path="/signup" element={<SignupSelect />} />
        <Route path="/signup/jobseeker" element={<JobSeekerSignup />} />
        <Route path="/signup/employer" element={<EmployerSignup />} />
        <Route path="/verify/abn" element={<AbnVerification />} />
        <Route path="/verify/otp" element={<WorkEmailOtp />} />
        <Route path="/login/jobseeker" element={<JobSeekerLogin />} />
        <Route path="/login/employer" element={<EmployerLogin />} />

        <Route path="/jobseeker/home" element={<Protected><JobSeekerHome /></Protected>} />
        <Route path="/jobseeker/calls" element={<Protected><CallHistory role="jobseeker" /></Protected>} />
        <Route path="/jobseeker/profile" element={<Protected><JobSeekerProfile /></Protected>} />

        <Route path="/employer/dashboard" element={<Protected><EmployerDashboard /></Protected>} />
        <Route path="/employer/calls" element={<Protected><CallHistory role="employer" /></Protected>} />
        <Route path="/employer/make-call" element={<Protected><MakeCall /></Protected>} />
        <Route path="/employer/work-profiles" element={<Protected><WorkProfiles /></Protected>} />
        <Route path="/employer/call-display-settings" element={<Protected><CallDisplaySettings /></Protected>} />

        <Route path="/call/incoming-verified" element={<Protected><IncomingVerifiedCall /></Protected>} />
        <Route path="/call/incoming-unverified" element={<Protected><IncomingUnverifiedCall /></Protected>} />
        <Route path="/call/post-nudge" element={<Protected><PostNormalCallNudge /></Protected>} />

        <Route path="/company/:id" element={<Protected><CompanyProfile /></Protected>} />
        <Route path="/report" element={<Protected><ReportCall /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="/help" element={<Protected><HelpSupport /></Protected>} />
        <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
        <Route path="/terms" element={<Protected><TermsPrivacy /></Protected>} />
        <Route path="/success" element={<Protected><SuccessConfirmation /></Protected>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
