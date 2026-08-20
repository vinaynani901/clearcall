CREATE TABLE IF NOT EXISTS access_keys (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER REFERENCES users(id),
key_string TEXT UNIQUE,
key_name TEXT,
status TEXT DEFAULT active,
applications_made INTEGER DEFAULT 0,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS auto_apply_preferences (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER REFERENCES users(id),
job_titles TEXT DEFAULT '[]',
industries TEXT DEFAULT '[]',
locations TEXT DEFAULT '[]',
salary_minimum INTEGER DEFAULT 0,
employment_types TEXT DEFAULT '[]',
experience_levels TEXT DEFAULT '[]',
excluded_companies TEXT DEFAULT '[]',
excluded_keywords TEXT DEFAULT '[]',
is_active INTEGER DEFAULT 0,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS auto_apply_daily_usage (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER REFERENCES users(id),
date TEXT NOT NULL,
slots_used INTEGER DEFAULT 0,
last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
UNIQUE(user_id, date)
);
CREATE TABLE IF NOT EXISTS auto_apply_log (
id INTEGER PRIMARY KEY AUTOINCREMENT,
user_id INTEGER,
jobs_checked INTEGER DEFAULT 0,
jobs_matched INTEGER DEFAULT 0,
applications_submitted INTEGER DEFAULT 0,
created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);