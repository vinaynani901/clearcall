const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './clearcall.db';
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

repairLinkyCandidateNames();
runAdminMigrations();
migrateUsersRoleForAgents();
runPhase2AdminMigrations();
runPhase3Migrations();
runJobSeekerMigrations();
runPlanControlMigrations();
runAgencyMigrations();
runAutoApplyMigrations();

// One-time (but safe to re-run every boot) data repair for campaign
// candidates whose `name` column got populated with a LinkedIn/Seek URL
// instead of a real name — caused by an earlier column-mapping bug on
// upload. For each affected row, look in that candidate's preserved
// extra_data for a real name field (the "Name" column from their original
// file is still sitting there even though it wasn't picked at import time)
// and promote it into the name column. Runs on every boot; does nothing
// once the data is clean, so it's cheap to leave in place.
function repairLinkyCandidateNames() {
  let rows;
  try {
    rows = db.prepare('SELECT id, name, extra_data FROM campaign_candidates').all();
  } catch {
    return; // table doesn't exist yet on a fresh DB before schema.exec ever ran — nothing to repair
  }
  if (rows.length === 0) return;

  const { looksLikeLink, resolveCandidateName } = require('../utils/candidateName');
  const update = db.prepare('UPDATE campaign_candidates SET name = ?, updated_at = datetime(\'now\') WHERE id = ?');
  let fixed = 0;
  let stillBad = 0;

  for (const row of rows) {
    if (!looksLikeLink(row.name)) continue;
    let extra = {};
    try { extra = JSON.parse(row.extra_data || '{}'); } catch { /* leave empty */ }
    const resolved = resolveCandidateName({ name: row.name, extra_data: extra });
    if (resolved.corrected) {
      update.run(resolved.name, row.id);
      fixed += 1;
    } else {
      stillBad += 1;
    }
  }

  if (fixed > 0) console.log(`[db] Repaired ${fixed} campaign candidate name(s) that had a link instead of a real name.`);
  if (stillBad > 0) console.warn(`[db] ${stillBad} campaign candidate(s) still have a link as their name — no valid name field was found in their uploaded data.`);
}

// Adds the columns/tables the Super Admin Panel needs on top of the base
// schema. SQLite has no "ADD COLUMN IF NOT EXISTS", so each column is
// checked against PRAGMA table_info first — safe to re-run every boot,
// same pattern as repairLinkyCandidateNames above.
function runAdminMigrations() {
  const companyColumns = db.prepare("PRAGMA table_info(companies)").all().map((c) => c.name);
  const addCompanyColumn = (name, ddl) => {
    if (!companyColumns.includes(name)) {
      db.exec(`ALTER TABLE companies ADD COLUMN ${ddl}`);
      console.log(`[db] Added companies.${name} column for the admin panel.`);
    }
  };
  addCompanyColumn('plan', "plan TEXT NOT NULL DEFAULT 'free'");
  addCompanyColumn('is_pilot', 'is_pilot INTEGER NOT NULL DEFAULT 0');
  addCompanyColumn('pilot_start_date', 'pilot_start_date TEXT');
  addCompanyColumn('pilot_end_date', 'pilot_end_date TEXT');
  addCompanyColumn('pilot_before_data', "pilot_before_data TEXT NOT NULL DEFAULT '{}'");
  addCompanyColumn('admin_review_status', "admin_review_status TEXT NOT NULL DEFAULT 'pending'");
  addCompanyColumn('admin_review_note', 'admin_review_note TEXT');
  addCompanyColumn('rejection_reason', 'rejection_reason TEXT');
  addCompanyColumn('admin_reviewed_at', 'admin_reviewed_at TEXT');
  addCompanyColumn('suspended_at', 'suspended_at TEXT');
  addCompanyColumn('company_sector', "company_sector TEXT DEFAULT 'other'");
  addCompanyColumn('company_size', "company_size TEXT DEFAULT 'small'");

  // Grandfather in companies that existed (and were already ABN-verified)
  // before this admin approval gate was introduced, so nothing that was
  // already trusted suddenly looks "pending" in the Verification Queue.
  db.prepare(`
    UPDATE companies SET admin_review_status = 'approved', admin_reviewed_at = datetime('now')
    WHERE abn_verified = 1 AND admin_review_status = 'pending' AND admin_reviewed_at IS NULL
  `).run();

  const reportColumns = db.prepare("PRAGMA table_info(reports)").all().map((c) => c.name);
  const addReportColumn = (name, ddl) => {
    if (!reportColumns.includes(name)) {
      db.exec(`ALTER TABLE reports ADD COLUMN ${ddl}`);
      console.log(`[db] Added reports.${name} column for the admin panel.`);
    }
  };
  addReportColumn('status', "status TEXT NOT NULL DEFAULT 'pending'");
  addReportColumn('admin_note', 'admin_note TEXT');
  addReportColumn('resolved_at', 'resolved_at TEXT');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_messages (
      id TEXT PRIMARY KEY,
      target_type TEXT NOT NULL CHECK(target_type IN ('company', 'jobseeker')),
      target_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      sent_by TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_admin_messages_target ON admin_messages(target_type, target_id);
  `);
}

// SQLite can't ALTER a CHECK constraint, so allowing role = 'agent' means
// rebuilding the users table: create a copy with the new constraint, copy
// every row across, swap it in. Runs once — checks the table's own stored
// SQL first and does nothing on every subsequent boot once it's done.
function migrateUsersRoleForAgents() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (!row || row.sql.includes("'agent'")) return;

  console.log('[db] Rebuilding users table to allow role = agent (one-time migration)...');
  const hasSuspended = db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'suspended');

  db.pragma('foreign_keys = OFF');
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE users_new (
        id TEXT PRIMARY KEY,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        phone TEXT,
        role TEXT NOT NULL CHECK(role IN ('jobseeker', 'employer', 'agent')),
        email_verified INTEGER NOT NULL DEFAULT 0,
        suspended INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO users_new (id, full_name, email, password_hash, phone, role, email_verified, suspended, created_at)
      SELECT id, full_name, email, password_hash, phone, role, email_verified, ${hasSuspended ? 'suspended' : '0'}, created_at FROM users
    `);
    db.exec('DROP TABLE users');
    db.exec('ALTER TABLE users_new RENAME TO users');
  });
  tx();
  db.pragma('foreign_keys = ON');
  console.log('[db] users table rebuilt — role now accepts agent.');
}

// admin_messages.target_type was created with CHECK(... IN ('company',
// 'jobseeker')) before agents existed. Same rebuild-the-table approach as
// migrateUsersRoleForAgents — runs once, guarded by checking the table's
// own stored SQL first.
function migrateAdminMessagesForAgents() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_messages'").get();
  if (!row || row.sql.includes("'agent'")) return;

  console.log('[db] Rebuilding admin_messages table to allow target_type = agent (one-time migration)...');
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE admin_messages_new (
        id TEXT PRIMARY KEY,
        target_type TEXT NOT NULL CHECK(target_type IN ('company', 'jobseeker', 'agent')),
        target_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_by TEXT NOT NULL DEFAULT 'admin',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    db.exec(`
      INSERT INTO admin_messages_new (id, target_type, target_id, subject, message, sent_by, created_at)
      SELECT id, target_type, target_id, subject, message, sent_by, created_at FROM admin_messages
    `);
    db.exec('DROP TABLE admin_messages');
    db.exec('ALTER TABLE admin_messages_new RENAME TO admin_messages');
    db.exec('CREATE INDEX IF NOT EXISTS idx_admin_messages_target ON admin_messages(target_type, target_id);');
  });
  tx();
  console.log('[db] admin_messages table rebuilt — target_type now accepts agent.');
}

// Agents + Revenue portal support: the agents table (a real account type,
// not admin-only data) and company_plan_history, which lets Revenue
// compute real new/churned MRR and a 12-month trend instead of a single
// point-in-time snapshot.
function runPhase2AdminMigrations() {
  migrateAdminMessagesForAgents();
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      user_id TEXT PRIMARY KEY,
      agency_name TEXT NOT NULL,
      abn TEXT,
      abn_verified INTEGER NOT NULL DEFAULT 0,
      plan TEXT NOT NULL DEFAULT 'free',
      featured INTEGER NOT NULL DEFAULT 0,
      specialty TEXT,
      rating REAL,
      active_clients INTEGER NOT NULL DEFAULT 0,
      successful_placements INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0,
      suspension_status INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS company_plan_history (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      plan TEXT NOT NULL,
      changed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_plan_history_company ON company_plan_history(company_id);
  `);

  const companyColumns = db.prepare('PRAGMA table_info(companies)').all().map((c) => c.name);
  if (!companyColumns.includes('payment_status')) {
    db.exec("ALTER TABLE companies ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'active'");
    console.log('[db] Added companies.payment_status column for the Revenue portal.');
  }

  // Backfill one history row per company that doesn't have any yet, so
  // Revenue calculations never have to special-case "no history" — every
  // company always has at least its signup-time plan on record.
  const withoutHistory = db.prepare(`
    SELECT c.id, c.plan, c.created_at FROM companies c
    LEFT JOIN company_plan_history h ON h.company_id = c.id
    WHERE h.id IS NULL
  `).all();
  if (withoutHistory.length > 0) {
    const { newId } = require('../utils/ids');
    const insert = db.prepare('INSERT INTO company_plan_history (id, company_id, plan, changed_at) VALUES (?, ?, ?, ?)');
    const tx = db.transaction(() => {
      for (const c of withoutHistory) insert.run(newId('planhist'), c.id, c.plan, c.created_at);
    });
    tx();
    console.log(`[db] Backfilled plan history for ${withoutHistory.length} compan${withoutHistory.length === 1 ? 'y' : 'ies'}.`);
  }
}

// Phase 3: Support Tickets + Announcements portals.
function runPhase3Migrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'in_progress', 'closed')),
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      closed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(user_id);
    CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

    CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      sender_type TEXT NOT NULL CHECK(sender_type IN ('user', 'admin')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ticket_id) REFERENCES support_tickets(id)
    );
    CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON support_ticket_messages(ticket_id);

    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      audience TEXT NOT NULL DEFAULT 'all' CHECK(audience IN ('all', 'employer', 'jobseeker', 'agent')),
      active INTEGER NOT NULL DEFAULT 1,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_active ON announcements(active);
  `);
}

// job_applications.source was created with CHECK(... IN ('manual',
// 'clearcall')) before Gmail auto-import existed. Same rebuild-the-table
// approach as migrateUsersRoleForAgents — runs once, guarded by checking the
// table's own stored SQL first; no-ops on a fresh DB where the table doesn't
// exist yet (the CREATE TABLE right after this call already has the right
// constraint from the start).
function migrateJobApplicationsForGmailSource() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='job_applications'").get();
  if (!row || row.sql.includes("'gmail'")) return;

  console.log('[db] Rebuilding job_applications table to allow source = gmail (one-time migration)...');
  const hasGmailMessageId = db.prepare('PRAGMA table_info(job_applications)').all().some((c) => c.name === 'gmail_message_id');

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE job_applications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        platform TEXT,
        date_applied TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','interview','offer','rejected')),
        job_description TEXT,
        salary_range TEXT,
        notes TEXT NOT NULL DEFAULT '',
        interview_at TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','clearcall','gmail')),
        clearcall_job_id TEXT,
        gmail_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    db.exec(`
      INSERT INTO job_applications_new (id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, gmail_message_id, created_at, updated_at)
      SELECT id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, ${hasGmailMessageId ? 'gmail_message_id' : 'NULL'}, created_at, updated_at
      FROM job_applications
    `);
    db.exec('DROP TABLE job_applications');
    db.exec('ALTER TABLE job_applications_new RENAME TO job_applications');
    db.exec('CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);');
  });
  tx();
  console.log('[db] job_applications table rebuilt — source now accepts gmail.');
}

// job_applications.status was created without 'withdrawn' as an allowed
// value, but the Application Tracker's status options are Awaiting Response,
// Interview Scheduled, Offer Received, Rejected, and Withdrawn — same
// rebuild-the-table approach as the migration above.
function migrateJobApplicationsForWithdrawnStatus() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='job_applications'").get();
  if (!row || row.sql.includes("'withdrawn'")) return;

  console.log('[db] Rebuilding job_applications table to allow status = withdrawn (one-time migration)...');
  const hasGmailMessageId = db.prepare('PRAGMA table_info(job_applications)').all().some((c) => c.name === 'gmail_message_id');

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE job_applications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        platform TEXT,
        date_applied TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','interview','offer','rejected','withdrawn')),
        job_description TEXT,
        salary_range TEXT,
        notes TEXT NOT NULL DEFAULT '',
        interview_at TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','clearcall','gmail')),
        clearcall_job_id TEXT,
        gmail_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    db.exec(`
      INSERT INTO job_applications_new (id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, gmail_message_id, created_at, updated_at)
      SELECT id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, ${hasGmailMessageId ? 'gmail_message_id' : 'NULL'}, created_at, updated_at
      FROM job_applications
    `);
    db.exec('DROP TABLE job_applications');
    db.exec('ALTER TABLE job_applications_new RENAME TO job_applications');
    db.exec('CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);');
  });
  tx();
  console.log('[db] job_applications table rebuilt — status now accepts withdrawn.');
}

// job_applications.source was created without 'adzuna' as an allowed value.
// Tapping Apply Now on an external Adzuna job now creates a real tracked
// application (source = adzuna) alongside the existing manual/clearcall/gmail
// sources — same rebuild-the-table approach as the two migrations above.
function migrateJobApplicationsForAdzunaSource() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='job_applications'").get();
  if (!row || row.sql.includes("'adzuna'")) return;

  console.log('[db] Rebuilding job_applications table to allow source = adzuna (one-time migration)...');
  const hasGmailMessageId = db.prepare('PRAGMA table_info(job_applications)').all().some((c) => c.name === 'gmail_message_id');
  const hasExternalJobId = db.prepare('PRAGMA table_info(job_applications)').all().some((c) => c.name === 'external_job_id');

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE job_applications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        platform TEXT,
        date_applied TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','interview','offer','rejected','withdrawn')),
        job_description TEXT,
        salary_range TEXT,
        notes TEXT NOT NULL DEFAULT '',
        interview_at TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','clearcall','gmail','adzuna')),
        clearcall_job_id TEXT,
        gmail_message_id TEXT,
        external_job_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    db.exec(`
      INSERT INTO job_applications_new (id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, gmail_message_id, external_job_id, created_at, updated_at)
      SELECT id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id,
        ${hasGmailMessageId ? 'gmail_message_id' : 'NULL'}, ${hasExternalJobId ? 'external_job_id' : 'NULL'}, created_at, updated_at
      FROM job_applications
    `);
    db.exec('DROP TABLE job_applications');
    db.exec('ALTER TABLE job_applications_new RENAME TO job_applications');
    db.exec('CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);');
  });
  tx();
  console.log('[db] job_applications table rebuilt — source now accepts adzuna.');
}

// Job Seeker side: application tracker, ClearCall direct job postings,
// bookmarks, agent connections, resume/profile/notification columns on
// users, and a receiver-side link on calls so a job seeker's own received
// call history can be looked up without matching on phone number every
// query. All additive/guarded the same way as the migrations above — safe
// to re-run every boot.
function runJobSeekerMigrations() {
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const addUserColumn = (name, ddl) => {
    if (!userColumns.includes(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`);
      console.log(`[db] Added users.${name} column for the job seeker side.`);
    }
  };
  addUserColumn('looking_for_work', 'looking_for_work INTEGER NOT NULL DEFAULT 1');
  addUserColumn('resume_filename', 'resume_filename TEXT');
  addUserColumn('resume_path', 'resume_path TEXT');
  addUserColumn('resume_uploaded_at', 'resume_uploaded_at TEXT');
  addUserColumn('notif_verified_calls', 'notif_verified_calls INTEGER NOT NULL DEFAULT 1');
  addUserColumn('notif_application_updates', 'notif_application_updates INTEGER NOT NULL DEFAULT 1');
  addUserColumn('notif_new_matches', 'notif_new_matches INTEGER NOT NULL DEFAULT 1');
  addUserColumn('notif_interview_reminders', 'notif_interview_reminders INTEGER NOT NULL DEFAULT 1');
  addUserColumn('profile_visibility', "profile_visibility TEXT NOT NULL DEFAULT 'agents_employers'");
  addUserColumn('gmail_connected', 'gmail_connected INTEGER NOT NULL DEFAULT 0');
  addUserColumn('gmail_access_token', 'gmail_access_token TEXT');
  addUserColumn('gmail_refresh_token', 'gmail_refresh_token TEXT');
  addUserColumn('gmail_token_expires_at', 'gmail_token_expires_at TEXT');
  addUserColumn('gmail_last_sync_at', 'gmail_last_sync_at TEXT');
  addUserColumn('gmail_email', 'gmail_email TEXT');
  addUserColumn('avatar_filename', 'avatar_filename TEXT');
  addUserColumn('avatar_path', 'avatar_path TEXT');
  addUserColumn('last_job_match_check_at', 'last_job_match_check_at TEXT');
  // Which resume gets automatically attached to job applications — either
  // the single uploaded file (resume_path above) or one of the built
  // resumes in the new `resumes` table below.
  addUserColumn('profile_resume_type', "profile_resume_type TEXT NOT NULL DEFAULT 'uploaded'");
  addUserColumn('profile_resume_id', 'profile_resume_id TEXT');

  const agentColumns = db.prepare('PRAGMA table_info(agents)').all().map((c) => c.name);
  if (!agentColumns.includes('specialty')) {
    db.exec('ALTER TABLE agents ADD COLUMN specialty TEXT');
    console.log('[db] Added agents.specialty column for the Placement Agent search/directory.');
  }

  const adminMsgColumns = db.prepare('PRAGMA table_info(admin_messages)').all().map((c) => c.name);
  if (!adminMsgColumns.includes('read_at')) {
    db.exec('ALTER TABLE admin_messages ADD COLUMN read_at TEXT');
    console.log('[db] Added admin_messages.read_at column for the job seeker Messages screen.');
  }

  const callColumns = db.prepare('PRAGMA table_info(calls)').all().map((c) => c.name);
  // note/outcome — restoring the Make a Call screen (manual, non-campaign
  // calls) surfaced that the calls table never actually persisted the
  // optional note field the form always collected, and had no home for the
  // richer outcome label (Answered/Interested/Callback Requested/etc, the
  // same OUTCOME_OPTIONS campaign calls already use) once an ad-hoc call
  // ends. call_status stays the simple Twilio-driven enum; outcome is the
  // human-chosen result shown in Call History.
  if (!callColumns.includes('note')) {
    db.exec('ALTER TABLE calls ADD COLUMN note TEXT');
    console.log('[db] Added calls.note column for the Make a Call screen.');
  }
  if (!callColumns.includes('outcome')) {
    db.exec('ALTER TABLE calls ADD COLUMN outcome TEXT');
    console.log('[db] Added calls.outcome column for the post-call outcome screen.');
  }
  if (!callColumns.includes('receiver_user_id')) {
    db.exec('ALTER TABLE calls ADD COLUMN receiver_user_id TEXT');
    console.log('[db] Added calls.receiver_user_id column for the job seeker call history view.');

    // Backfill: match existing calls to a jobseeker account by normalised AU
    // phone number, the same matching logic used at call-initiate time.
    const { normalizeAuPhone } = require('../services/twilio');
    const jobseekers = db.prepare("SELECT id, phone FROM users WHERE role = 'jobseeker' AND phone IS NOT NULL").all();
    const callsWithoutReceiver = db.prepare('SELECT id, receiver_phone FROM calls WHERE receiver_user_id IS NULL').all();
    if (jobseekers.length > 0 && callsWithoutReceiver.length > 0) {
      const byPhone = new Map(jobseekers.map((u) => [normalizeAuPhone(u.phone), u.id]));
      const update = db.prepare('UPDATE calls SET receiver_user_id = ? WHERE id = ?');
      let matched = 0;
      const tx = db.transaction(() => {
        for (const call of callsWithoutReceiver) {
          const uid = byPhone.get(normalizeAuPhone(call.receiver_phone));
          if (uid) { update.run(uid, call.id); matched += 1; }
        }
      });
      tx();
      if (matched > 0) console.log(`[db] Backfilled receiver_user_id on ${matched} existing call(s).`);
    }
  }

  migrateJobApplicationsForGmailSource();
  migrateJobApplicationsForWithdrawnStatus();
  migrateJobApplicationsForAdzunaSource();

  db.exec(`
    CREATE TABLE IF NOT EXISTS job_applications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      platform TEXT,
      date_applied TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','interview','offer','rejected','withdrawn')),
      job_description TEXT,
      salary_range TEXT,
      notes TEXT NOT NULL DEFAULT '',
      interview_at TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','clearcall','gmail','adzuna')),
      clearcall_job_id TEXT,
      gmail_message_id TEXT,
      external_job_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      company_id TEXT,
      title TEXT NOT NULL,
      location TEXT,
      employment_type TEXT,
      salary_range TEXT,
      description TEXT,
      skills TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      posted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_active ON jobs(active);

    CREATE TABLE IF NOT EXISTS job_bookmarks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      job_source TEXT NOT NULL CHECK(job_source IN ('clearcall','external')),
      job_id TEXT,
      external_key TEXT,
      snapshot TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_job_bookmarks_user ON job_bookmarks(user_id);

    CREATE TABLE IF NOT EXISTS agent_clients (
      id TEXT PRIMARY KEY,
      agent_user_id TEXT NOT NULL,
      jobseeker_user_id TEXT NOT NULL UNIQUE,
      connected_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (agent_user_id) REFERENCES users(id),
      FOREIGN KEY (jobseeker_user_id) REFERENCES users(id)
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

    -- Resume Builder: each row is one built resume (job seekers can have
    -- several — different templates/versions for different applications).
    -- Sections are stored as JSON text since their shape (repeatable work
    -- experience entries, etc.) doesn't need to be queried column-by-column.
    CREATE TABLE IF NOT EXISTS resumes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      template TEXT NOT NULL DEFAULT 'professional' CHECK(template IN ('professional','modern','graduate')),
      personal_details TEXT NOT NULL DEFAULT '{}',
      summary TEXT NOT NULL DEFAULT '',
      experience TEXT NOT NULL DEFAULT '[]',
      education TEXT NOT NULL DEFAULT '[]',
      skills TEXT NOT NULL DEFAULT '[]',
      certifications TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_resumes_user ON resumes(user_id);

    -- Placement Agent access keys — a job seeker generates one of these to
    -- hand to an agent (outside ClearCall, e.g. over email/phone); the agent
    -- redeems it once to link their account as this job seeker's connected
    -- agent, scoped to whichever permissions were checked at creation time.
    -- Only key_hash is stored (sha256 of the real token) — the plaintext key
    -- is shown exactly once at generation and is not recoverable after that,
    -- same principle as a password.
    CREATE TABLE IF NOT EXISTS agent_access_keys (
      id TEXT PRIMARY KEY,
      jobseeker_user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      key_hash TEXT NOT NULL,
      key_preview TEXT NOT NULL,
      can_view_profile INTEGER NOT NULL DEFAULT 1,
      can_apply_for_jobs INTEGER NOT NULL DEFAULT 0,
      can_view_applications INTEGER NOT NULL DEFAULT 0,
      agent_user_id TEXT,
      redeemed_at TEXT,
      expires_at TEXT,
      applications_count INTEGER NOT NULL DEFAULT 0,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (jobseeker_user_id) REFERENCES users(id),
      FOREIGN KEY (agent_user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_access_keys_jobseeker ON agent_access_keys(jobseeker_user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_access_keys_hash ON agent_access_keys(key_hash);

    -- Job seeker <-> placement agent direct messages. Deliberately simple
    -- (poll-based, no websocket layer yet — "real time updates can be added
    -- later" per spec) with sender/receiver as plain user ids so either side
    -- of the conversation can query it the same way.
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      sender_id TEXT NOT NULL,
      receiver_id TEXT NOT NULL,
      content TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id, created_at DESC);

    -- Job seeker notifications feed (bell dropdown). The 'link' column isn't
    -- in the literal spec column list but is needed for "tapping a
    -- notification navigates to the relevant screen" to actually work.
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
  `);
}

// Feature access control + admin Plan Control system. companies.plan already
// existed (added by runAdminMigrations above); this adds the job-seeker-side
// equivalent plus five new tables: plan_limits (the editable source of truth
// for every plan's feature values — nothing is hardcoded), company_feature_
// overrides (per-company custom limits set by an admin), usage_tracking (one
// row per entity per calendar month — a new month naturally starts at zero,
// which is what "reset counts at the start of each new month" means in
// practice, no separate cron job needed), plan_change_log (insert-only audit
// trail), and pilot_programs (richer than the existing companies.is_pilot
// flag — supports multiple historical pilots, extend/end/convert actions).
function runPlanControlMigrations() {
  const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userColumns.includes('plan')) {
    db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
    console.log('[db] Added users.plan column (job seeker free/premium) for the feature access control system.');
  }
  // pending_plan: set when someone completes the Upgrade flow's "Proceed to
  // Payment" step (no real Stripe integration yet, so this records intent
  // without activating it) — the plan itself only changes via an admin
  // action (Plan Control bulk actions / individual override) until real
  // billing exists, at which point this is what Stripe activation reads.
  if (!userColumns.includes('pending_plan')) {
    db.exec('ALTER TABLE users ADD COLUMN pending_plan TEXT');
    console.log('[db] Added users.pending_plan column for the upgrade-intent flow.');
  }

  const companyColumnsForPlan = db.prepare('PRAGMA table_info(companies)').all().map((c) => c.name);
  if (!companyColumnsForPlan.includes('pending_plan')) {
    db.exec('ALTER TABLE companies ADD COLUMN pending_plan TEXT');
    console.log('[db] Added companies.pending_plan column for the upgrade-intent flow.');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS plan_limits (
      plan_name TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      feature_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (plan_name, feature_name)
    );

    CREATE TABLE IF NOT EXISTS company_feature_overrides (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      override_value TEXT NOT NULL,
      set_by_admin_id TEXT,
      set_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_overrides_company_feature ON company_feature_overrides(company_id, feature_name);

    -- One row per (entity, month) — querying a month with no row yet is the
    -- "reset to zero" behaviour, since COALESCE-to-zero is how every reader
    -- treats a missing row. Named usage_tracking rather than the bare word
    -- "usage" purely for readability; the columns match the spec exactly.
    CREATE TABLE IF NOT EXISTS usage_tracking (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('company','user')),
      month TEXT NOT NULL,
      verified_calls_count INTEGER NOT NULL DEFAULT 0,
      campaigns_count INTEGER NOT NULL DEFAULT 0,
      candidates_uploaded_count INTEGER NOT NULL DEFAULT 0,
      job_postings_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_entity_month ON usage_tracking(entity_id, entity_type, month);

    -- Permanent, insert-only audit trail. No route ever issues an UPDATE or
    -- DELETE against this table — that's what "cannot be edited or deleted"
    -- means in practice for a table with no admin-facing edit UI at all.
    CREATE TABLE IF NOT EXISTS plan_change_log (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      feature_name TEXT NOT NULL,
      old_value TEXT,
      new_value TEXT,
      changed_by_admin_id TEXT,
      changed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_plan_change_log_entity ON plan_change_log(entity_id, entity_type);
    CREATE INDEX IF NOT EXISTS idx_plan_change_log_time ON plan_change_log(changed_at DESC);

    CREATE TABLE IF NOT EXISTS pilot_programs (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      plan_granted TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      activated_by_admin_id TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','expired','converted')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE INDEX IF NOT EXISTS idx_pilot_programs_company ON pilot_programs(company_id);
    CREATE INDEX IF NOT EXISTS idx_pilot_programs_status ON pilot_programs(status);

    -- Monthly billing summary (Part 9). One row per company per calendar
    -- month, generated at month end from that month's final usage_tracking
    -- row — a frozen snapshot, so it stays correct even after the live
    -- usage_tracking row rolls over into the next month. Displayed in the
    -- employer Billing settings screen and the admin Revenue portal.
    CREATE TABLE IF NOT EXISTS monthly_invoices (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      month TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      base_plan_charge REAL NOT NULL DEFAULT 0,
      included_calls_used INTEGER NOT NULL DEFAULT 0,
      included_calls_limit INTEGER,
      extra_calls_count INTEGER NOT NULL DEFAULT 0,
      extra_calls_charge REAL NOT NULL DEFAULT 0,
      extra_members_count INTEGER NOT NULL DEFAULT 0,
      extra_members_charge REAL NOT NULL DEFAULT 0,
      total_due REAL NOT NULL DEFAULT 0,
      generated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_invoices_company_month ON monthly_invoices(company_id, month);
    CREATE INDEX IF NOT EXISTS idx_monthly_invoices_month ON monthly_invoices(month);
  `);

  // warning_email_sent_month / limit_email_sent_month: which month (the
  // usage_tracking row's own `month`) we've already emailed the 80%/100%
  // alert for, so incrementUsage's alert check never double-sends within
  // the same month — a new month naturally has no row (and thus no "sent"
  // marker) at all, so this resets itself with no extra cleanup needed.
  const usageColumns = db.prepare('PRAGMA table_info(usage_tracking)').all().map((c) => c.name);
  if (!usageColumns.includes('warning_email_sent_at')) {
    db.exec('ALTER TABLE usage_tracking ADD COLUMN warning_email_sent_at TEXT');
  }
  if (!usageColumns.includes('limit_email_sent_at')) {
    db.exec('ALTER TABLE usage_tracking ADD COLUMN limit_email_sent_at TEXT');
  }
  // Usage-based extra-call billing (Part 3): overage_calls_count/charge are
  // running totals for the month, incremented once per call once the
  // plan's included verified_calls_monthly_limit has been exceeded — see
  // recordVerifiedCall in services/featureFlags.js. extra_members_count/
  // charge are NOT running totals — they're a live gauge recalculated
  // in full every time team membership changes (invite accepted/
  // deactivated), since headcount can go down as well as up.
  if (!usageColumns.includes('overage_calls_count')) {
    db.exec('ALTER TABLE usage_tracking ADD COLUMN overage_calls_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!usageColumns.includes('overage_charge')) {
    db.exec('ALTER TABLE usage_tracking ADD COLUMN overage_charge REAL NOT NULL DEFAULT 0');
  }
  if (!usageColumns.includes('extra_members_count')) {
    db.exec('ALTER TABLE usage_tracking ADD COLUMN extra_members_count INTEGER NOT NULL DEFAULT 0');
  }
  if (!usageColumns.includes('extra_member_charge')) {
    db.exec('ALTER TABLE usage_tracking ADD COLUMN extra_member_charge REAL NOT NULL DEFAULT 0');
  }

  // seven_day_reminder_sent_at: guards the "pilot ending in 7 days" email
  // (sent by the daily pilot scheduler) from firing more than once per pilot.
  const pilotColumns = db.prepare('PRAGMA table_info(pilot_programs)').all().map((c) => c.name);
  if (!pilotColumns.includes('seven_day_reminder_sent_at')) {
    db.exec('ALTER TABLE pilot_programs ADD COLUMN seven_day_reminder_sent_at TEXT');
  }

  // Seed plan_limits with the default values from the spec, but only for
  // (plan_name, feature_name) pairs that don't already exist — an admin's
  // saved edits in the Plan Control portal must never be silently
  // overwritten on server restart. Using INSERT OR IGNORE per-row (rather
  // than gating the whole block on "table is empty") means that when a new
  // plan tier (enterprise_plus, premium_plus) or a new feature key
  // (team_members_limit, extra_call_price, ...) is added to
  // DEFAULT_PLAN_LIMITS after a database already has rows, the missing
  // rows get backfilled on the next server start instead of silently never
  // existing — every existing admin-edited row is left untouched because
  // its (plan_name, feature_name) pair already exists.
  const { DEFAULT_PLAN_LIMITS } = require('../utils/planFeatures');
  const insertIfMissing = db.prepare('INSERT OR IGNORE INTO plan_limits (plan_name, feature_name, feature_value) VALUES (?, ?, ?)');
  const seedTx = db.transaction(() => {
    let inserted = 0;
    for (const [planName, features] of Object.entries(DEFAULT_PLAN_LIMITS)) {
      for (const [featureName, value] of Object.entries(features)) {
        const result = insertIfMissing.run(planName, featureName, String(value));
        if (result.changes > 0) inserted++;
      }
    }
    return inserted;
  });
  const insertedCount = seedTx();
  if (insertedCount > 0) {
    console.log(`[db] Seeded ${insertedCount} new plan_limits row(s) (new plans and/or new feature keys) without touching existing admin-edited values.`);
  }
}

// Recruiter sub-accounts (Plan Control's "agency pipeline" / "My Team"
// features), employer job postings, and agent-applies-on-behalf attribution.
// company_members.member_role distinguishes the founding "owner" (existing
// single row per company, unaffected by this default) from an invited
// "recruiter" — deliberately NOT a new users.role value, since that would
// require rebuilding the users table's CHECK constraint (see
// migrateUsersRoleForAgents for how invasive that pattern is) and updating
// every existing `req.user.role !== 'employer'` guard across the app.
// Recruiters are still users.role = 'employer'; company_members is what
// tells them apart.
// job_applications.source was created without 'agent' as an allowed value.
// A connected placement agent (or, per Plan Control's job_seeker_connection
// employer feature, a Growth/Enterprise recruiter) applying for a job on a
// job seeker's behalf now creates a real tracked application with
// source='agent' — the GET /jobseeker/agent/applications route already
// filtered on this value in anticipation of this feature; it just had
// nothing to actually match against until now. Bundles in
// applied_by_user_id directly (rather than a separate ALTER) since we're
// already rebuilding the table.
function migrateJobApplicationsForAgentSource() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='job_applications'").get();
  if (!row || row.sql.includes("'agent'")) return;

  console.log('[db] Rebuilding job_applications table to allow source = agent (one-time migration)...');
  const cols = db.prepare('PRAGMA table_info(job_applications)').all().map((c) => c.name);
  const has = (name) => cols.includes(name);

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE job_applications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        platform TEXT,
        date_applied TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','interview','offer','rejected','withdrawn')),
        job_description TEXT,
        salary_range TEXT,
        notes TEXT NOT NULL DEFAULT '',
        interview_at TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','clearcall','gmail','adzuna','agent')),
        clearcall_job_id TEXT,
        gmail_message_id TEXT,
        external_job_id TEXT,
        applied_by_user_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    db.exec(`
      INSERT INTO job_applications_new (id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, gmail_message_id, external_job_id, applied_by_user_id, created_at, updated_at)
      SELECT id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id,
        ${has('gmail_message_id') ? 'gmail_message_id' : 'NULL'}, ${has('external_job_id') ? 'external_job_id' : 'NULL'},
        ${has('applied_by_user_id') ? 'applied_by_user_id' : 'NULL'}, created_at, updated_at
      FROM job_applications
    `);
    db.exec('DROP TABLE job_applications');
    db.exec('ALTER TABLE job_applications_new RENAME TO job_applications');
    db.exec('CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);');
  });
  tx();
  console.log('[db] job_applications table rebuilt — source now accepts agent, applied_by_user_id column included.');
}

// agent_clients.jobseeker_user_id was originally UNIQUE, which silently
// capped every job seeker at exactly one connected agent regardless of
// plan (a known limitation flagged in the original Stage 2 pass — see
// jobseeker.js POST /agent/connect). Premium's "3 agent connections" needs
// a job seeker to hold multiple simultaneous connections, so the
// uniqueness constraint moves from (jobseeker_user_id) alone to the pair
// (agent_user_id, jobseeker_user_id) — the same agent can't connect twice,
// but different agents now can.
function migrateAgentClientsForMultiConnection() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='agent_clients'").get();
  if (!row || !row.sql.includes('jobseeker_user_id TEXT NOT NULL UNIQUE')) return;

  console.log('[db] Rebuilding agent_clients table to allow multiple agent connections per job seeker (one-time migration)...');
  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE agent_clients_new (
        id TEXT PRIMARY KEY,
        agent_user_id TEXT NOT NULL,
        jobseeker_user_id TEXT NOT NULL,
        connected_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (agent_user_id) REFERENCES users(id),
        FOREIGN KEY (jobseeker_user_id) REFERENCES users(id)
      );
    `);
    db.exec(`
      INSERT INTO agent_clients_new (id, agent_user_id, jobseeker_user_id, connected_at)
      SELECT id, agent_user_id, jobseeker_user_id, connected_at FROM agent_clients
    `);
    db.exec('DROP TABLE agent_clients');
    db.exec('ALTER TABLE agent_clients_new RENAME TO agent_clients');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_clients_pair ON agent_clients(agent_user_id, jobseeker_user_id);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_agent_clients_jobseeker ON agent_clients(jobseeker_user_id);');
  });
  tx();
  console.log('[db] agent_clients table rebuilt — a job seeker can now have multiple simultaneous agent connections.');
}

function runAgencyMigrations() {
  migrateJobApplicationsForAgentSource();
  migrateAgentClientsForMultiConnection();

  const memberColumns = db.prepare('PRAGMA table_info(company_members)').all().map((c) => c.name);
  if (!memberColumns.includes('member_role')) {
    db.exec("ALTER TABLE company_members ADD COLUMN member_role TEXT NOT NULL DEFAULT 'owner'");
    console.log('[db] Added company_members.member_role (owner/recruiter) for the Agency Pipeline / My Team features.');
  }
  if (!memberColumns.includes('deactivated')) {
    db.exec('ALTER TABLE company_members ADD COLUMN deactivated INTEGER NOT NULL DEFAULT 0');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS recruiter_invitations (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      invited_name TEXT NOT NULL,
      invited_email TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      invited_by_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','revoked')),
      expires_at TEXT NOT NULL,
      redeemed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (company_id) REFERENCES companies(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_recruiter_invitations_token ON recruiter_invitations(token_hash);
    CREATE INDEX IF NOT EXISTS idx_recruiter_invitations_company ON recruiter_invitations(company_id);
  `);

  // invited_role: this table originally only ever created recruiters
  // (member_role hardcoded to 'recruiter' on acceptance). Part 6/7 of the
  // team-plan spec generalizes "My Team" invitations to every plan and lets
  // the owner pick a role per invite (Admin/Recruiter/Member/etc.) — stored
  // here so routes/recruiterInvite.js can carry it through to
  // company_members.member_role at acceptance time instead of hardcoding it.
  const inviteColumns = db.prepare('PRAGMA table_info(recruiter_invitations)').all().map((c) => c.name);
  if (!inviteColumns.includes('invited_role')) {
    db.exec("ALTER TABLE recruiter_invitations ADD COLUMN invited_role TEXT NOT NULL DEFAULT 'Member'");
    console.log('[db] Added recruiter_invitations.invited_role for the generalized team invitation system (Part 6/7).');
  }

  // applied_by_user_id: set when a placement agent applies on a job
  // seeker's behalf (Stage 5) — NULL means the job seeker applied
  // themselves. Additive-only, so it doesn't touch job_applications' CHECK
  // constraints (already rebuilt several times by runJobSeekerMigrations).
  const appColumns = db.prepare('PRAGMA table_info(job_applications)').all().map((c) => c.name);
  if (!appColumns.includes('applied_by_user_id')) {
    db.exec('ALTER TABLE job_applications ADD COLUMN applied_by_user_id TEXT');
  }

  // Employer job postings — the `jobs` table already existed (read by the
  // job seeker search) but had no employer-facing creation path or the
  // extra fields the posting form needs.
  const jobColumns = db.prepare('PRAGMA table_info(jobs)').all().map((c) => c.name);
  const addJobColumn = (name, ddl) => { if (!jobColumns.includes(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${ddl}`); };
  addJobColumn('industry', 'industry TEXT');
  addJobColumn('salary_min', 'salary_min INTEGER');
  addJobColumn('salary_max', 'salary_max INTEGER');
  addJobColumn('application_deadline', 'application_deadline TEXT');
  addJobColumn('contact_recruiter', 'contact_recruiter TEXT');
  addJobColumn('posted_by_user_id', 'posted_by_user_id TEXT');
  addJobColumn('status', "status TEXT NOT NULL DEFAULT 'active'");
  addJobColumn('application_count', 'application_count INTEGER NOT NULL DEFAULT 0');
  if (jobColumns.length > 0) {
    console.log('[db] Agency/job-posting migrations checked (company_members.member_role, recruiter_invitations, jobs posting fields, job_applications.applied_by_user_id).');
  }
}

// --- Auto Apply engine (Premium/Premium Plus job seekers) ----------------
// job_applications.source was rebuilt for 'agent' above but still doesn't
// allow 'auto_apply' — the engine needs a third rebuild to add it, bundling
// in match_score (the jobMatcher score at the moment this application was
// submitted) and resume_version_id (which resume_versions row, if any, was
// actually sent) directly rather than as two more separate ALTERs, since
// we're already rewriting the table.
function migrateJobApplicationsForAutoApplySource() {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='job_applications'").get();
  if (!row || row.sql.includes("'auto_apply'")) return;

  console.log('[db] Rebuilding job_applications table to allow source = auto_apply (one-time migration)...');
  const cols = db.prepare('PRAGMA table_info(job_applications)').all().map((c) => c.name);
  const has = (name) => cols.includes(name);

  const tx = db.transaction(() => {
    db.exec(`
      CREATE TABLE job_applications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        company_name TEXT NOT NULL,
        job_title TEXT NOT NULL,
        platform TEXT,
        date_applied TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'awaiting' CHECK(status IN ('awaiting','interview','offer','rejected','withdrawn')),
        job_description TEXT,
        salary_range TEXT,
        notes TEXT NOT NULL DEFAULT '',
        interview_at TEXT,
        source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','clearcall','gmail','adzuna','agent','auto_apply')),
        clearcall_job_id TEXT,
        gmail_message_id TEXT,
        external_job_id TEXT,
        applied_by_user_id TEXT,
        match_score INTEGER,
        resume_version_id TEXT,
        minutes_after_posting INTEGER,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);
    db.exec(`
      INSERT INTO job_applications_new (id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id, gmail_message_id, external_job_id, applied_by_user_id, created_at, updated_at)
      SELECT id, user_id, company_name, job_title, platform, date_applied, status,
        job_description, salary_range, notes, interview_at, source, clearcall_job_id,
        ${has('gmail_message_id') ? 'gmail_message_id' : 'NULL'}, ${has('external_job_id') ? 'external_job_id' : 'NULL'},
        ${has('applied_by_user_id') ? 'applied_by_user_id' : 'NULL'}, created_at, updated_at
      FROM job_applications
    `);
    db.exec('DROP TABLE job_applications');
    db.exec('ALTER TABLE job_applications_new RENAME TO job_applications');
    db.exec('CREATE INDEX IF NOT EXISTS idx_job_applications_user ON job_applications(user_id);');
  });
  tx();
  console.log('[db] job_applications table rebuilt — source now accepts auto_apply, plus match_score/resume_version_id/minutes_after_posting columns.');
}

// Preferences (Part 1), daily slot tracking (Part 7), tailored-resume audit
// trail (Part 4), per-run engine log (Part 3), a singleton admin-controlled
// pause/frequency row (Part 8), and a per-provider test-result history
// (Part 10) — all additive CREATE TABLE IF NOT EXISTS, safe to run on every
// boot.
function runAutoApplyMigrations() {
  migrateJobApplicationsForAutoApplySource();

  db.exec(`
    CREATE TABLE IF NOT EXISTS auto_apply_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      job_titles TEXT NOT NULL DEFAULT '[]',
      industries TEXT NOT NULL DEFAULT '[]',
      locations TEXT NOT NULL DEFAULT '[]',
      salary_minimum INTEGER,
      employment_types TEXT NOT NULL DEFAULT '[]',
      experience_levels TEXT NOT NULL DEFAULT '[]',
      excluded_companies TEXT NOT NULL DEFAULT '[]',
      excluded_keywords TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- One row per (user, AEST calendar date) — the engine only ever reads
    -- today's row, so "unused slots don't carry over" falls out naturally:
    -- a new date simply has no row yet, i.e. zero slots used.
    CREATE TABLE IF NOT EXISTS auto_apply_daily_usage (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      slots_used INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_apply_usage_user_date ON auto_apply_daily_usage(user_id, date);

    -- One row per resume actually submitted by the engine (or would-be
    -- submitted with AI unconfigured) — was_tailored=false + ai_provider_used
    -- NULL together mean "base resume, no AI key present", was_tailored=false
    -- + a provider present would mean a tailoring call failed and fell back.
    CREATE TABLE IF NOT EXISTS resume_versions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      base_resume_id TEXT,
      job_application_id TEXT,
      tailored_content TEXT NOT NULL,
      ai_provider_used TEXT,
      job_title_tailored_for TEXT,
      match_score INTEGER,
      was_tailored INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_resume_versions_user ON resume_versions(user_id);
    CREATE INDEX IF NOT EXISTS idx_resume_versions_application ON resume_versions(job_application_id);

    -- One row per job seeker per engine run (not one row per run overall) —
    -- matches the spec's "timestamp, job seeker id, jobs checked, jobs
    -- matched, applications submitted" shape exactly, and lets the admin
    -- "view any specific job seeker's auto apply history" query filter on
    -- user_id directly.
    CREATE TABLE IF NOT EXISTS auto_apply_log (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      run_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT NOT NULL,
      jobs_checked INTEGER NOT NULL DEFAULT 0,
      jobs_matched INTEGER NOT NULL DEFAULT 0,
      applications_submitted INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_auto_apply_log_user ON auto_apply_log(user_id, run_at DESC);
    CREATE INDEX IF NOT EXISTS idx_auto_apply_log_run_at ON auto_apply_log(run_at DESC);

    -- Singleton admin control row (Part 8) — engine pause + run frequency.
    -- Always id = 'singleton'; created once below if missing.
    CREATE TABLE IF NOT EXISTS auto_apply_engine_settings (
      id TEXT PRIMARY KEY,
      paused INTEGER NOT NULL DEFAULT 0,
      run_frequency_minutes INTEGER NOT NULL DEFAULT 30,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Admin "Test" button history per AI provider (Part 10) — last result
    -- shown in the AI Configuration section.
    CREATE TABLE IF NOT EXISTS ai_provider_tests (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      success INTEGER NOT NULL,
      result_snippet TEXT,
      error TEXT,
      tested_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_ai_provider_tests_provider ON ai_provider_tests(provider, tested_at DESC);
  `);

  const existingSettings = db.prepare("SELECT id FROM auto_apply_engine_settings WHERE id = 'singleton'").get();
  if (!existingSettings) {
    db.prepare("INSERT INTO auto_apply_engine_settings (id, paused, run_frequency_minutes) VALUES ('singleton', 0, 30)").run();
  }

  // action_data: structured JSON extra payload for notification types that
  // need more than one click-through action — specifically the auto-apply
  // per-application notification (Part 5), which needs both "View
  // Application" (the tracker) and "View Resume Used" (the tailored/base
  // resume actually submitted) as separate buttons. `link` keeps working
  // unchanged for every other notification type; this is purely additive.
  const notifColumns = db.prepare('PRAGMA table_info(notifications)').all().map((c) => c.name);
  if (!notifColumns.includes('action_data')) {
    db.exec('ALTER TABLE notifications ADD COLUMN action_data TEXT');
  }

  // run_id: one auto_apply_log row is written per job seeker per engine
  // run, so "total auto apply runs today" (Part 8's admin stat) needs a
  // shared identifier across every row from the same run to COUNT(DISTINCT
  // run_id) rather than trying to bucket by run_at, which can legitimately
  // differ by a few seconds between the first and last job seeker processed
  // in one run.
  const logColumns = db.prepare('PRAGMA table_info(auto_apply_log)').all().map((c) => c.name);
  if (logColumns.length > 0 && !logColumns.includes('run_id')) {
    db.exec("ALTER TABLE auto_apply_log ADD COLUMN run_id TEXT NOT NULL DEFAULT ''");
  }

  console.log('[db] Auto Apply migrations checked (preferences, daily usage, resume_versions, auto_apply_log, engine settings, AI provider tests, notifications.action_data, job_applications.source auto_apply).');
}

module.exports = db;
