const ICONS = {
  Agents: '🤝',
  Revenue: '💰',
  'Support Tickets': '🎫',
  Announcements: '📣',
  'System Health': '📡',
  'AI Assistant': '🤖',
};

const DESCRIPTIONS = {
  Agents: 'Manage placement agents — verification, plans, connected job seekers, and featured status — once the Agents feature ships.',
  Revenue: 'A full financial dashboard with MRR, churn, plan breakdowns, and per-company billing once real subscription billing is connected.',
  'Support Tickets': 'A shared inbox for every support ticket raised in the app, with replies, priority, status, and internal notes.',
  Announcements: 'Send in-app and email announcements to all users, a specific role, or a plan tier, with full send history.',
  'System Health': 'Live uptime, database health, and status for every external service ClearCall depends on, plus error and deployment logs.',
  'AI Assistant': 'A Claude-powered assistant for answering platform questions, generating reports, and making configuration changes — with every change logged.',
};

export default function ComingSoon({ title }) {
  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">{title}</div>
        </div>
      </div>
      <div className="admin-coming-soon">
        <div className="icon">{ICONS[title] || '🛠️'}</div>
        <div className="title">{title}</div>
        <p className="desc">{DESCRIPTIONS[title] || 'This section is being built.'}</p>
        <p className="note">This feature is coming in the next phase of the admin panel.</p>
      </div>
    </div>
  );
}
