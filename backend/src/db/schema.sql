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

CREATE INDEX IF NOT EXISTS idx_calls_caller ON calls(caller_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(reported_company_id);
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes(email);
CREATE INDEX IF NOT EXISTS idx_work_profiles_user ON work_profiles(user_id);
