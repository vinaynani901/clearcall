-- ClearCall database schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK(role IN ('jobseeker', 'employer')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  abn TEXT NOT NULL,
  industry TEXT,
  contact_name TEXT,
  work_email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  abn_verified INTEGER NOT NULL DEFAULT 0,
  abn_registration_date TEXT,
  abn_status TEXT,
  location TEXT,
  employee_count TEXT,
  description TEXT,
  linkedin_url TEXT,
  logo_url TEXT,
  suspension_status INTEGER NOT NULL DEFAULT 0,
  under_review INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  company_sector TEXT DEFAULT 'other',
  company_size TEXT DEFAULT 'small',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS work_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  company_id TEXT,
  designation TEXT NOT NULL,
  organisation TEXT NOT NULL,
  abn TEXT,
  industry_category TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  abn_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS calls (
  id TEXT PRIMARY KEY,
  caller_user_id TEXT NOT NULL,
  company_id TEXT,
  receiver_phone TEXT NOT NULL,
  receiver_name TEXT,
  job_role TEXT,
  call_type TEXT NOT NULL CHECK(call_type IN ('clearcall', 'normal')),
  call_status TEXT NOT NULL DEFAULT 'initiated' CHECK(call_status IN ('initiated','answered','declined','missed')),
  duration_seconds INTEGER DEFAULT 0,
  hide_number INTEGER NOT NULL DEFAULT 1,
  show_name INTEGER NOT NULL DEFAULT 1,
  show_designation INTEGER NOT NULL DEFAULT 1,
  show_photo INTEGER NOT NULL DEFAULT 0,
  twilio_call_sid TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (caller_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_user_id TEXT NOT NULL,
  reported_company_id TEXT,
  reported_phone TEXT,
  reason TEXT NOT NULL,
  description TEXT,
  call_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (reporter_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS call_display_settings (
  user_id TEXT PRIMARY KEY,
  hide_number INTEGER NOT NULL DEFAULT 1,
  show_name INTEGER NOT NULL DEFAULT 1,
  show_designation INTEGER NOT NULL DEFAULT 1,
  show_photo INTEGER NOT NULL DEFAULT 0,
  default_call_type TEXT NOT NULL DEFAULT 'clearcall',
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS company_members (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  work_email TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (company_id) REFERENCES companies(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'work_email_verify',
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Campaign Manager --------------------------------------------------------

CREATE TABLE IF NOT EXISTS tag_templates (
  id TEXT PRIMARY KEY,
  employer_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  tags TEXT NOT NULL, -- JSON array of {label, emoji}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employer_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  employer_user_id TEXT NOT NULL,
  company_id TEXT,
  name TEXT NOT NULL,
  tag_template_id TEXT,
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of {label, emoji} snapshotted at campaign creation
  campaign_type TEXT NOT NULL DEFAULT 'recruitment', -- 'recruitment' or 'delivery'
  assigned_to INTEGER REFERENCES users(id),
  route_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (employer_user_id) REFERENCES users(id),
  FOREIGN KEY (company_id) REFERENCES companies(id)
);

-- One row per uploaded day-slot (Today / Tomorrow / Day after). A single
-- upload can create up to three of these under the same campaign_id.
CREATE TABLE IF NOT EXISTS campaign_batches (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  call_date TEXT NOT NULL, -- YYYY-MM-DD, the date candidates should be called
  sms_sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE TABLE IF NOT EXISTS campaign_candidates (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  job_role TEXT,
  extra_data TEXT DEFAULT '{}', -- JSON of any other mapped columns
  sms_sent_at TEXT,
  call_status TEXT NOT NULL DEFAULT 'not_called' CHECK(call_status IN ('not_called','answered','no_answer','voicemail')),
  call_id TEXT, -- links to calls table once actually dialled
  tags TEXT NOT NULL DEFAULT '[]', -- JSON array of selected tag labels
  notes TEXT DEFAULT '',
  outcome TEXT,
  callback_at TEXT,
  callback_reminder_sent_at TEXT,
  called_at TEXT,
  duration_seconds INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  delivery_preference TEXT,
  FOREIGN KEY (batch_id) REFERENCES campaign_batches(id),
  FOREIGN KEY (call_id) REFERENCES calls(id)
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  platform TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fcm_tokens_user_token ON fcm_tokens(user_id, token);

CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(reported_company_id);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_work_profiles_user ON work_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_employer ON campaigns(employer_user_id);
CREATE INDEX IF NOT EXISTS idx_campaign_batches_campaign ON campaign_batches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_batches_call_date ON campaign_batches(call_date);
CREATE INDEX IF NOT EXISTS idx_campaign_candidates_batch ON campaign_candidates(batch_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
