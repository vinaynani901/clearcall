import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import EmployerLayout from './components/EmployerLayout';
import JobSeekerLayout from './components/JobSeekerLayout';
import ErrorBoundary from './components/ErrorBoundary';

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
import AgentSignup from './screens/AgentSignup';
import AgentLogin from './screens/AgentLogin';
import AgentDashboard from './screens/AgentDashboard';
import JobSeekerHome from './screens/JobSeekerHome';
import JobSeekerApplications from './screens/JobSeekerApplications';
import JobSeekerJobs from './screens/JobSeekerJobs';
import JobSeekerResume from './screens/JobSeekerResume';
import JobSeekerAgent from './screens/JobSeekerAgent';
import AutoApplyPreferences from './screens/AutoApplyPreferences';
import JobSeekerCallProtection from './screens/JobSeekerCallProtection';
import JobSeekerActivity from './screens/JobSeekerActivity';
import JobSeekerMessages from './screens/JobSeekerMessages';
import EmployerDashboard from './screens/EmployerDashboard';
import MakeCall from './screens/MakeCall';
import CallOutcome from './screens/CallOutcome';
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
import CampaignsList from './screens/CampaignsList';
import CampaignDetail from './screens/CampaignDetail';
import CandidateProfile from './screens/CandidateProfile';
import CampaignDaySummary from './screens/CampaignDaySummary';
import TagSetsList from './screens/TagSetsList';
import TagSetEditor from './screens/TagSetEditor';
import SelectTagSet from './screens/SelectTagSet';
import Contacts from './screens/Contacts';
import ReportsInsights from './screens/ReportsInsights';
import MapCandidateColumns from './screens/MapCandidateColumns';
import NameCampaign from './screens/NameCampaign';
import { EmployerPricing, JobSeekerPricing } from './screens/Pricing';
import UpgradeConfirm from './screens/UpgradeConfirm';
import UpgradeSuccess from './screens/UpgradeSuccess';
import AgencyPipeline from './screens/AgencyPipeline';
import RecruiterDetail from './screens/RecruiterDetail';
import ConnectedJobSeekerProfile from './screens/ConnectedJobSeekerProfile';
import ConnectedJobSeekerApply from './screens/ConnectedJobSeekerApply';
import TeamSettings from './screens/TeamSettings';
import BillingSettings from './screens/BillingSettings';
import RecruiterActivate from './screens/RecruiterActivate';
import JobPostings from './screens/JobPostings';
import PostJobForm from './screens/PostJobForm';
import JobPostingApplicants from './screens/JobPostingApplicants';
import JobSeekerAccessKeys from './screens/JobSeekerAccessKeys';

// SheetJS (xlsx) is a large library only employers uploading a candidate
// list need — lazy-load this screen so it isn't in the main bundle every
// job seeker downloads.
const UploadCandidateFile = lazy(() => import('./screens/UploadCandidateFile'));

// The Super Admin Panel is a completely separate app tree — its own auth,
// its own CSS, its own routes — lazy-loaded so none of it ships in the
// bundle regular employers/job seekers download, and never linked to from
// anywhere in the main app's UI.
const AdminApp = lazy(() => import('./admin/AdminApp'));

// `role`, when given, restricts this route to that one account role — a
// job seeker who somehow ends up on an /employer/* URL (typed directly,
// old bookmark, back button after switching accounts, etc.) is redirected
// to their own home instead of being shown the employer screen, and vice
// versa. Routes with no `role` (the ones genuinely shared across roles —
// /settings, /help, call screens, etc.) are reachable by any signed-in
// account, since they already render role-appropriate content themselves.
function roleHomePath(role) {
  if (role === 'employer') return '/employer/dashboard';
  if (role === 'agent') return '/agent/dashboard';
  if (role === 'jobseeker') return '/jobseeker/home';
  return '/signup';
}

function Protected({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/signup" replace />;
  if (role && user.role !== role) return <Navigate to={roleHomePath(user.role)} replace />;
  return children;
}

// /settings is shared between roles — both get the desktop sidebar
// treatment there now, just with role-appropriate nav items.
function SettingsRoute() {
  const { user } = useAuth();
  if (user?.role === 'employer') {
    return <EmployerLayout active="settings"><Settings /></EmployerLayout>;
  }
  return <JobSeekerLayout active="settings"><Settings /></JobSeekerLayout>;
}

// /help is shared between roles too — both now get a desktop sidebar shell,
// role-appropriate (job seekers get JobSeekerLayout's full shell, matching
// the "Help and Support" nav item in their own sidebar).
function HelpRoute() {
  const { user } = useAuth();
  if (user?.role === 'employer') {
    return <EmployerLayout active="help"><HelpSupport /></EmployerLayout>;
  }
  return <JobSeekerLayout active="help"><HelpSupport /></JobSeekerLayout>;
}

const WIDE_EXACT_PATHS = [
  '/employer/dashboard',
  '/employer/make-call',
  '/employer/work-profiles',
  '/employer/call-display-settings',
  '/employer/calls',
  '/employer/campaigns',
  '/employer/contacts',
  '/employer/reports',
  '/employer/pipeline',
  '/employer/team',
  '/employer/job-postings',
  '/settings',
  '/help',
  '/pricing',
  '/pricing/jobseeker',
];
const WIDE_PREFIXES = ['/employer/campaigns/', '/employer/tag-sets', '/employer/pipeline/', '/employer/job-postings/', '/upgrade/'];

// Onboarding + authentication screens — these get the responsive split
// layout (AuthShell) instead of the dashboard "wide" treatment above.
// Disjoint from WIDE_EXACT_PATHS/WIDE_PREFIXES, so the two classes never
// need to combine.
const AUTH_SPLIT_PATHS = [
  '/onboarding/1', '/onboarding/2', '/onboarding/3',
  '/signup', '/signup/jobseeker', '/signup/employer',
  '/login/jobseeker', '/login/employer',
  '/verify/abn', '/verify/otp',
  '/signup/agent', '/login/agent',
  '/quick-login/employer', '/quick-login/jobseeker', '/quick-login/admin',
];

// Listens for the "incoming-verified-call" message the service worker
// posts to every open tab the instant a verified-call push arrives (see
// public/sw.js). This is what makes the full-screen verified call UI show
// up immediately while the app is already open/foregrounded, rather than
// only reachable by clicking the OS notification.
function useForegroundIncomingCall() {
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (!('serviceWorker' in navigator) || user?.role !== 'jobseeker') return undefined;

    const onMessage = (event) => {
      if (event.data?.type === 'incoming-verified-call') {
        navigate('/call/incoming-verified', { state: { metadata: event.data.metadata || {} } });
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [navigate, user?.role]);
}

export default function App() {
  const location = useLocation();
  const { user } = useAuth();
  useForegroundIncomingCall();

  // Completely separate from the main app: its own auth, its own layout,
  // its own CSS. Branches out before any of the main app's .app-shell /
  // AuthContext-driven logic below even runs.
  if (location.pathname.startsWith('/admin')) {
    return (
      <Suspense fallback={null}>
        <AdminApp />
      </Suspense>
    );
  }

  const isWideLayout = WIDE_EXACT_PATHS.includes(location.pathname)
    || WIDE_PREFIXES.some((p) => location.pathname.startsWith(p));
  const isAuthRoute = AUTH_SPLIT_PATHS.includes(location.pathname) || location.pathname.startsWith('/recruiter/activate/') || location.pathname.startsWith('/invite/accept/');
  // The job seeker shell (JobSeekerLayout) manages its own responsive
  // breakpoints independently of .app-shell--wide (see .app-shell--jsk in
  // index.css, which uncaps at 768px instead of 900px) — applied for every
  // /jobseeker/* route, plus the shared /settings and /help routes when
  // signed in as a job seeker.
  const isJskLayout = location.pathname.startsWith('/jobseeker/')
    || ((location.pathname === '/settings' || location.pathname === '/help' || location.pathname === '/pricing/jobseeker' || location.pathname.startsWith('/upgrade/')) && user?.role === 'jobseeker');

  return (
    <div className={`app-shell ${isWideLayout ? 'app-shell--wide' : ''} ${isJskLayout ? 'app-shell--jsk' : ''} ${isAuthRoute ? 'app-shell--auth' : ''}`}>
      <ErrorBoundary key={location.pathname}>
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
        <Route path="/signup/agent" element={<AgentSignup />} />
        <Route path="/login/agent" element={<AgentLogin />} />

        {/* Desktop PWA shortcuts (manifest.json "shortcuts") — deep-link
            straight to the right role's login form, skipping the
            /signup role-picker. Deliberately just a redirect: no stored
            session or credential is auto-submitted here, a password is
            always required, same as browsing there directly. */}
        <Route path="/quick-login/employer" element={<Navigate to="/login/employer" replace />} />
        <Route path="/quick-login/jobseeker" element={<Navigate to="/login/jobseeker" replace />} />
        <Route path="/quick-login/admin" element={<Navigate to="/admin" replace />} />
        <Route path="/agent/dashboard" element={<Protected role="agent"><AgentDashboard /></Protected>} />

        <Route path="/jobseeker/home" element={<Protected role="jobseeker"><JobSeekerHome /></Protected>} />
        <Route path="/jobseeker/applications" element={<Protected role="jobseeker"><JobSeekerApplications /></Protected>} />
        <Route path="/jobseeker/jobs" element={<Protected role="jobseeker"><JobSeekerJobs /></Protected>} />
        <Route path="/jobseeker/resume" element={<Protected role="jobseeker"><JobSeekerResume /></Protected>} />
        <Route path="/jobseeker/agent" element={<Protected role="jobseeker"><JobSeekerAgent /></Protected>} />
        <Route path="/jobseeker/auto-apply" element={<Protected role="jobseeker"><AutoApplyPreferences /></Protected>} />
        <Route path="/jobseeker/calls" element={<Protected role="jobseeker"><JobSeekerCallProtection /></Protected>} />
        <Route path="/jobseeker/activity" element={<Protected role="jobseeker"><JobSeekerActivity /></Protected>} />
        <Route path="/jobseeker/messages" element={<Protected role="jobseeker"><JobSeekerMessages /></Protected>} />
        <Route path="/jobseeker/profile" element={<Protected role="jobseeker"><JobSeekerProfile /></Protected>} />
        <Route path="/jobseeker/access-keys" element={<Protected role="jobseeker"><JobSeekerAccessKeys /></Protected>} />

        <Route path="/employer/dashboard" element={<Protected role="employer"><EmployerLayout active="dashboard" wide><EmployerDashboard /></EmployerLayout></Protected>} />
        <Route path="/employer/calls" element={<Protected role="employer"><EmployerLayout active="calls" wide><CallHistory role="employer" /></EmployerLayout></Protected>} />
        <Route path="/employer/make-call" element={<Protected role="employer"><EmployerLayout active="make-call" wide><MakeCall /></EmployerLayout></Protected>} />
        <Route path="/employer/call-outcome" element={<Protected role="employer"><EmployerLayout active="make-call" wide><CallOutcome /></EmployerLayout></Protected>} />
        <Route path="/employer/work-profiles" element={<Protected role="employer"><EmployerLayout active="work-profiles" wide><WorkProfiles /></EmployerLayout></Protected>} />
        <Route path="/employer/call-display-settings" element={<Protected role="employer"><EmployerLayout active="call-display-settings"><CallDisplaySettings /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns" element={<Protected role="employer"><EmployerLayout active="campaigns" wide><CampaignsList /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/upload" element={<Protected role="employer"><EmployerLayout active="campaigns"><Suspense fallback={<div className="muted small" style={{ padding: 20 }}>Loading…</div>}><UploadCandidateFile /></Suspense></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/map-columns" element={<Protected role="employer"><EmployerLayout active="campaigns"><MapCandidateColumns /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/name" element={<Protected role="employer"><EmployerLayout active="campaigns"><NameCampaign /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/select-tag-set" element={<Protected role="employer"><EmployerLayout active="campaigns"><SelectTagSet /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/:id" element={<Protected role="employer"><EmployerLayout active="campaigns"><CampaignDetail /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/:campaignId/candidates/:candidateId" element={<Protected role="employer"><EmployerLayout active="campaigns"><CandidateProfile /></EmployerLayout></Protected>} />
        <Route path="/employer/campaigns/:id/summary" element={<Protected role="employer"><EmployerLayout active="campaigns"><CampaignDaySummary /></EmployerLayout></Protected>} />
        <Route path="/employer/tag-sets" element={<Protected role="employer"><EmployerLayout active="settings"><TagSetsList /></EmployerLayout></Protected>} />
        <Route path="/employer/tag-sets/new" element={<Protected role="employer"><EmployerLayout active="settings"><TagSetEditor /></EmployerLayout></Protected>} />
        <Route path="/employer/tag-sets/:id/edit" element={<Protected role="employer"><EmployerLayout active="settings"><TagSetEditor /></EmployerLayout></Protected>} />
        <Route path="/employer/contacts" element={<Protected role="employer"><EmployerLayout active="contacts"><Contacts /></EmployerLayout></Protected>} />
        <Route path="/employer/reports" element={<Protected role="employer"><EmployerLayout active="reports"><ReportsInsights /></EmployerLayout></Protected>} />
        <Route path="/employer/pipeline" element={<Protected role="employer"><EmployerLayout active="pipeline" wide><AgencyPipeline /></EmployerLayout></Protected>} />
        <Route path="/employer/pipeline/recruiters/:userId" element={<Protected role="employer"><EmployerLayout active="pipeline" wide><RecruiterDetail /></EmployerLayout></Protected>} />
        <Route path="/employer/pipeline/connected/:id/profile" element={<Protected role="employer"><EmployerLayout active="pipeline" wide><ConnectedJobSeekerProfile /></EmployerLayout></Protected>} />
        <Route path="/employer/pipeline/connected/:id/apply" element={<Protected role="employer"><EmployerLayout active="pipeline" wide><ConnectedJobSeekerApply /></EmployerLayout></Protected>} />
        <Route path="/employer/team" element={<Protected role="employer"><EmployerLayout active="settings"><TeamSettings /></EmployerLayout></Protected>} />
        <Route path="/employer/billing" element={<Protected role="employer"><EmployerLayout active="settings"><BillingSettings /></EmployerLayout></Protected>} />
        <Route path="/employer/job-postings" element={<Protected role="employer"><EmployerLayout active="settings" wide><JobPostings /></EmployerLayout></Protected>} />
        <Route path="/employer/job-postings/new" element={<Protected role="employer"><EmployerLayout active="settings"><PostJobForm /></EmployerLayout></Protected>} />
        <Route path="/employer/job-postings/:id/edit" element={<Protected role="employer"><EmployerLayout active="settings"><PostJobForm /></EmployerLayout></Protected>} />
        <Route path="/employer/job-postings/:id/applications" element={<Protected role="employer"><EmployerLayout active="settings"><JobPostingApplicants /></EmployerLayout></Protected>} />
        <Route path="/recruiter/activate/:token" element={<RecruiterActivate />} />
        <Route path="/invite/accept/:token" element={<RecruiterActivate />} />

        <Route path="/call/incoming-verified" element={<Protected><IncomingVerifiedCall /></Protected>} />
        <Route path="/call/incoming-unverified" element={<Protected><IncomingUnverifiedCall /></Protected>} />
        <Route path="/call/post-nudge" element={<Protected><PostNormalCallNudge /></Protected>} />

        <Route path="/pricing" element={<Protected role="employer"><EmployerPricing /></Protected>} />
        <Route path="/pricing/jobseeker" element={<Protected role="jobseeker"><JobSeekerPricing /></Protected>} />
        <Route path="/upgrade/:plan" element={<Protected><UpgradeConfirm /></Protected>} />
        <Route path="/upgrade/success" element={<Protected><UpgradeSuccess /></Protected>} />

        <Route path="/company/:id" element={<Protected><CompanyProfile /></Protected>} />
        <Route path="/report" element={<Protected><ReportCall /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsRoute /></Protected>} />
        <Route path="/help" element={<Protected><HelpRoute /></Protected>} />
        <Route path="/change-password" element={<Protected><ChangePassword /></Protected>} />
        <Route path="/terms" element={<Protected><TermsPrivacy /></Protected>} />
        <Route path="/success" element={<Protected><SuccessConfirmation /></Protected>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </ErrorBoundary>
    </div>
  );
}
