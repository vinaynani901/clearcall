// Canonical feature definitions + default plan values, shared by: the admin
// Plan Control > Plan Feature Editor, the plan_limits DB seed (db/index.js),
// the feature-flag resolver (services/featureFlags.js), and the pricing
// pages. Deliberately pure data with NO database dependency, so it can be
// required from db/index.js's own migration code without risking a require
// cycle with services/featureFlags.js (which does require the db).
//
// type: 'boolean' -> on/off toggle in the admin editor.
// type: 'number_or_unlimited' -> numeric input in the admin editor; the
//   string 'unlimited' is a valid value meaning no cap (rendered/checked as
//   Infinity everywhere a limit is compared against usage).
// type: 'price' -> dollar amount input in the admin editor (usage-based
//   billing rates); always a plain number, 'unlimited' is not valid here.

const FEATURES_EMPLOYER = [
  { key: 'team_members_limit', label: 'Team Members', description: 'How many team members (including the account owner) can be on the company account.', type: 'number_or_unlimited' },
  { key: 'verified_calls_monthly_limit', label: 'Verified Calls / Month', description: 'How many verified calls are included per calendar month before overage billing applies.', type: 'number_or_unlimited' },
  { key: 'campaign_manager', label: 'Campaign Manager', description: 'Access to the Campaigns feature.', type: 'boolean' },
  { key: 'file_upload_max_candidates', label: 'File Upload — Max Candidates', description: 'Maximum candidates per uploaded file. 0 disables file upload entirely.', type: 'number_or_unlimited' },
  { key: 'custom_tag_sets_limit', label: 'Custom Tag Sets', description: 'How many custom tag sets can be created.', type: 'number_or_unlimited' },
  { key: 'work_profiles_limit', label: 'Work Profiles', description: 'How many work profiles can be created.', type: 'number_or_unlimited' },
  { key: 'advance_sms', label: 'Advance SMS', description: 'Send an advance SMS notice to candidates before a verified call.', type: 'boolean' },
  { key: 'results_export', label: 'Results Export', description: 'Export campaign/call results to CSV.', type: 'boolean' },
  { key: 'agency_pipeline', label: 'Agency Pipeline', description: 'Access to the agency pipeline feature.', type: 'boolean' },
  { key: 'recruiter_sub_accounts_limit', label: 'Recruiter Sub-Accounts', description: 'How many recruiter sub-accounts can be added.', type: 'number_or_unlimited' },
  { key: 'job_seeker_connection', label: 'Job Seeker Connection', description: 'Connect directly with job seekers.', type: 'boolean' },
  { key: 'job_postings_monthly_limit', label: 'Job Postings / Month', description: 'How many ClearCall Direct jobs can be posted per calendar month.', type: 'number_or_unlimited' },
  { key: 'priority_support', label: 'Priority Support', description: 'Priority customer support queue.', type: 'boolean' },
  { key: 'sdk_access', label: 'SDK Access', description: 'API/SDK access for custom integrations.', type: 'boolean' },
  { key: 'dedicated_account_manager', label: 'Dedicated Account Manager', description: 'A named account manager for this company.', type: 'boolean' },
  // Usage-based overage rate for verified calls once the included monthly
  // limit is reached — only meaningful on plans where calls are actually
  // capped (Starter/Growth/Enterprise). Free stays hard-capped (no payment
  // method on file to bill overage against) and Enterprise Plus is
  // unlimited, so both keep this at 0/unused; see services/featureFlags.js
  // checkVerifiedCallLimit for exactly how this is applied.
  { key: 'extra_call_price', label: 'Extra Call Price', description: 'Dollar charge per verified call made beyond the included monthly limit.', type: 'price' },
  // Plan-level default is always 'unlimited' (no cap) — this only becomes a
  // real number via a per-company override set in the admin Companies
  // portal (Part 8's "usage cap (max monthly bill)"), reusing the existing
  // company_feature_overrides mechanism rather than a new table.
  { key: 'usage_cap', label: 'Usage Cap (Max Monthly Bill)', description: 'Maximum total dollar amount of overage charges that can accrue to this company in a calendar month. Unlimited unless a custom company override sets a real cap.', type: 'number_or_unlimited' },
];

const FEATURES_JOBSEEKER = [
  { key: 'applications_limit', label: 'Tracked Applications', description: 'How many applications can be tracked at once.', type: 'number_or_unlimited' },
  { key: 'call_history_limit', label: 'Call History', description: 'How many past verified calls are visible in Call Protection.', type: 'number_or_unlimited' },
  { key: 'resume_uploads_limit', label: 'Resumes', description: 'How many resumes (uploaded file + built resumes combined) can be saved.', type: 'number_or_unlimited' },
  { key: 'agent_connections_limit', label: 'Agent Connections', description: 'How many placement agents can be connected at once.', type: 'number_or_unlimited' },
  { key: 'access_keys_limit', label: 'Access Keys', description: 'How many active agent access keys can exist at once.', type: 'number_or_unlimited' },
  { key: 'resume_builder', label: 'Resume Builder', description: 'Build a resume from scratch or a template.', type: 'boolean' },
  { key: 'gmail_sync', label: 'Gmail Sync', description: 'Auto-import applications from Gmail.', type: 'boolean' },
  { key: 'priority_listings', label: 'Priority Listings', description: 'Priority placement in job search results.', type: 'boolean' },
  { key: 'auto_apply_slots_per_day', label: 'Auto-Apply Slots / Day', description: 'How many jobs can be auto-applied to per day. 0 means manual apply only.', type: 'number_or_unlimited' },
  { key: 'ai_resume_tailoring', label: 'AI Resume Tailoring', description: 'Automatically tailor the resume to each job at the moment of applying.', type: 'boolean' },
  { key: 'instant_priority_apply', label: 'Instant Priority Apply', description: 'Application is submitted within minutes of a matching job being posted.', type: 'boolean' },
  { key: 'advanced_match_scoring', label: 'Advanced Match Scoring', description: 'Shows a detailed match score/breakdown against each job listing.', type: 'boolean' },
];

// Single global (not per-plan) usage-based settings — kept in plan_limits
// under this synthetic "plan name" so the existing getFeatureValue/
// setPlanLimit helpers can read/write them without a second table. Only
// extra_member_price lives here; extra_call_price is genuinely per-plan
// (see FEATURES_EMPLOYER above) since the rate differs by tier.
const GLOBAL_BILLING_PLAN_KEY = 'global_billing';
const FEATURES_GLOBAL_BILLING = [
  { key: 'extra_member_price', label: 'Extra Member Price', description: 'Dollar charge per team member added beyond a company\'s included plan limit, per month.', type: 'price' },
];

const DEFAULT_PLAN_LIMITS = {
  employer_free: {
    team_members_limit: 1,
    verified_calls_monthly_limit: 10, campaign_manager: false, file_upload_max_candidates: 0,
    custom_tag_sets_limit: 0, work_profiles_limit: 1, advance_sms: false, results_export: false,
    agency_pipeline: false, recruiter_sub_accounts_limit: 0, job_seeker_connection: false,
    job_postings_monthly_limit: 0, priority_support: false, sdk_access: false, dedicated_account_manager: false,
    extra_call_price: 0, usage_cap: 'unlimited',
  },
  employer_starter: {
    team_members_limit: 3,
    verified_calls_monthly_limit: 200, campaign_manager: true, file_upload_max_candidates: 50,
    custom_tag_sets_limit: 3, work_profiles_limit: 3, advance_sms: false, results_export: true,
    agency_pipeline: false, recruiter_sub_accounts_limit: 0, job_seeker_connection: false,
    job_postings_monthly_limit: 2, priority_support: false, sdk_access: false, dedicated_account_manager: false,
    extra_call_price: 0.10, usage_cap: 'unlimited',
  },
  employer_growth: {
    team_members_limit: 10,
    verified_calls_monthly_limit: 500, campaign_manager: true, file_upload_max_candidates: 500,
    custom_tag_sets_limit: 10, work_profiles_limit: 10, advance_sms: true, results_export: true,
    agency_pipeline: true, recruiter_sub_accounts_limit: 5, job_seeker_connection: true,
    job_postings_monthly_limit: 10, priority_support: false, sdk_access: false, dedicated_account_manager: false,
    extra_call_price: 0.08, usage_cap: 'unlimited',
  },
  employer_enterprise: {
    team_members_limit: 25,
    verified_calls_monthly_limit: 2000, campaign_manager: true, file_upload_max_candidates: 'unlimited',
    custom_tag_sets_limit: 'unlimited', work_profiles_limit: 'unlimited', advance_sms: true, results_export: true,
    agency_pipeline: true, recruiter_sub_accounts_limit: 'unlimited', job_seeker_connection: true,
    job_postings_monthly_limit: 'unlimited', priority_support: true, sdk_access: false, dedicated_account_manager: false,
    extra_call_price: 0.05, usage_cap: 'unlimited',
  },
  employer_enterprise_plus: {
    team_members_limit: 'unlimited',
    verified_calls_monthly_limit: 'unlimited', campaign_manager: true, file_upload_max_candidates: 'unlimited',
    custom_tag_sets_limit: 'unlimited', work_profiles_limit: 'unlimited', advance_sms: true, results_export: true,
    agency_pipeline: true, recruiter_sub_accounts_limit: 'unlimited', job_seeker_connection: true,
    job_postings_monthly_limit: 'unlimited', priority_support: true, sdk_access: true, dedicated_account_manager: true,
    extra_call_price: 0, usage_cap: 'unlimited',
  },
  jobseeker_free: {
    applications_limit: 10, call_history_limit: 10, resume_uploads_limit: 1,
    agent_connections_limit: 1, access_keys_limit: 1, resume_builder: false, gmail_sync: false, priority_listings: false,
    auto_apply_slots_per_day: 0, ai_resume_tailoring: false, instant_priority_apply: false, advanced_match_scoring: false,
  },
  jobseeker_premium: {
    applications_limit: 'unlimited', call_history_limit: 'unlimited', resume_uploads_limit: 5,
    agent_connections_limit: 3, access_keys_limit: 5, resume_builder: true, gmail_sync: true, priority_listings: true,
    auto_apply_slots_per_day: 10, ai_resume_tailoring: false, instant_priority_apply: false, advanced_match_scoring: false,
  },
  jobseeker_premium_plus: {
    applications_limit: 'unlimited', call_history_limit: 'unlimited', resume_uploads_limit: 5,
    agent_connections_limit: 3, access_keys_limit: 5, resume_builder: true, gmail_sync: true, priority_listings: true,
    auto_apply_slots_per_day: 25, ai_resume_tailoring: true, instant_priority_apply: true, advanced_match_scoring: true,
  },
  [GLOBAL_BILLING_PLAN_KEY]: {
    extra_member_price: 10,
  },
};

module.exports = {
  FEATURES_EMPLOYER, FEATURES_JOBSEEKER, FEATURES_GLOBAL_BILLING,
  GLOBAL_BILLING_PLAN_KEY, DEFAULT_PLAN_LIMITS,
};
