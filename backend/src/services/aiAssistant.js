// Real LLM-backed admin assistant. Calls the Anthropic Messages API
// directly over fetch (Node 18+ has global fetch, so this avoids adding a
// new npm dependency) and gives the model a small set of read-only tools
// that query live platform data — so answers are grounded in the real
// database rather than the model guessing or hallucinating numbers.
const db = require('../db');
const { PLAN_PRICES, PLAN_LABELS } = require('../utils/plans');
const { PRIORITY_BY_REASON } = require('../routes/admin/scamReports');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';
const MAX_TOOL_ITERATIONS = 5;

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

function currentModel() {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
}

// --- Tool implementations — every one is read-only and queries the real
// database, same tables the rest of the admin panel reads from. ---
const TOOLS = {
  get_command_centre_stats: {
    description: 'Get the platform-wide snapshot: total companies, active companies this month, total job seekers, total agents, verified calls today, estimated revenue this month, and pending scam reports.',
    input_schema: { type: 'object', properties: {} },
    run: () => {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const totalCompanies = db.prepare('SELECT COUNT(*) as n FROM companies').get().n;
      const activeCompanies = db.prepare('SELECT COUNT(DISTINCT company_id) as n FROM calls WHERE company_id IS NOT NULL AND created_at >= ?').get(monthStart).n;
      const totalJobSeekers = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'jobseeker'").get().n;
      const totalAgents = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'agent'").get().n;
      const plans = db.prepare('SELECT plan FROM companies').all();
      const revenueThisMonth = plans.reduce((sum, c) => sum + (PLAN_PRICES[c.plan] || 0), 0);
      const scamReportsPending = db.prepare("SELECT COUNT(*) as n FROM reports WHERE status = 'pending'").get().n;
      const supportTicketsOpen = db.prepare("SELECT COUNT(*) as n FROM support_tickets WHERE status IN ('open', 'in_progress')").get().n;
      return { totalCompanies, activeCompanies, totalJobSeekers, totalAgents, revenueThisMonth, scamReportsPending, supportTicketsOpen };
    },
  },
  list_pending_approvals: {
    description: 'List companies currently pending admin approval in the Verification Queue.',
    input_schema: { type: 'object', properties: {} },
    run: () => db.prepare(`
      SELECT id, name, abn, industry, abn_verified, email_verified, created_at
      FROM companies WHERE admin_review_status = 'pending' ORDER BY created_at ASC LIMIT 25
    `).all(),
  },
  get_revenue_summary: {
    description: 'Get estimated MRR (from plan pricing, no live billing system connected) and a breakdown by plan tier.',
    input_schema: { type: 'object', properties: {} },
    run: () => {
      const companies = db.prepare('SELECT plan FROM companies').all();
      const mrr = companies.reduce((sum, c) => sum + (PLAN_PRICES[c.plan] || 0), 0);
      const breakdown = {};
      for (const c of companies) {
        breakdown[c.plan] = breakdown[c.plan] || { label: PLAN_LABELS[c.plan] || c.plan, count: 0, mrr: 0 };
        breakdown[c.plan].count += 1;
        breakdown[c.plan].mrr += PLAN_PRICES[c.plan] || 0;
      }
      return { mrr, breakdown };
    },
  },
  list_urgent_scam_reports: {
    description: 'List the highest-priority open scam reports (priority derived from the reason the reporter selected — "asked for money" is highest).',
    input_schema: { type: 'object', properties: {} },
    run: () => {
      const reports = db.prepare(`
        SELECT r.id, r.reason, r.description, r.status, r.created_at, u.full_name as reporter_name, c.name as reported_company_name
        FROM reports r
        LEFT JOIN users u ON u.id = r.reporter_user_id
        LEFT JOIN companies c ON c.id = r.reported_company_id
        WHERE r.status != 'resolved' AND r.status != 'cleared'
      `).all().map((r) => ({ ...r, priority: PRIORITY_BY_REASON[r.reason] || 'grey' }));
      const order = { red: 0, orange: 1, yellow: 2, grey: 3 };
      reports.sort((a, b) => order[a.priority] - order[b.priority]);
      return reports.slice(0, 15);
    },
  },
  list_open_support_tickets: {
    description: 'List open or in-progress support tickets, most urgent priority first.',
    input_schema: { type: 'object', properties: {} },
    run: () => db.prepare(`
      SELECT st.id, st.subject, st.category, st.priority, st.status, st.updated_at, u.full_name, u.email, u.role
      FROM support_tickets st JOIN users u ON u.id = st.user_id
      WHERE st.status IN ('open', 'in_progress')
      ORDER BY CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, st.updated_at DESC
      LIMIT 25
    `).all(),
  },
  search_companies: {
    description: 'Search companies by name or ABN.',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Name or ABN substring to search for' } },
      required: ['query'],
    },
    run: ({ query }) => db.prepare(`
      SELECT id, name, abn, plan, abn_verified, suspension_status, admin_review_status, report_count, created_at
      FROM companies WHERE name LIKE ? OR abn LIKE ? LIMIT 15
    `).all(`%${query}%`, `%${query}%`),
  },
};

const TOOL_DEFS = Object.entries(TOOLS).map(([name, t]) => ({
  name,
  description: t.description,
  input_schema: t.input_schema,
}));

const SYSTEM_PROMPT = `You are the ClearCall Super Admin AI Assistant. You help the platform admin understand what's happening on ClearCall (a verified employer-calling platform for Australia) by querying real, live data through the tools available to you.

Rules:
- Always use a tool to look up real data before answering questions about platform stats, companies, revenue, reports, or tickets — never guess or make up numbers.
- Revenue figures are estimates based on a static plan price list, not a live billing system — mention this if asked about revenue.
- Be concise and direct. Use plain text, not heavy markdown formatting.
- If a question is outside what your tools can answer, say so plainly rather than speculating.`;

async function callAnthropic(messages) {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: currentModel(),
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools: TOOL_DEFS,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Anthropic API error (${res.status}): ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Runs the full tool-use loop and returns the final text reply plus a log
// of which tools were called, so the UI can show its work.
async function askAdminAssistant(conversationMessages) {
  if (!isConfigured()) {
    const err = new Error('AI Assistant is not configured — set ANTHROPIC_API_KEY in the backend environment to enable it.');
    err.notConfigured = true;
    throw err;
  }

  const messages = [...conversationMessages];
  const toolCallLog = [];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i += 1) {
    const response = await callAnthropic(messages);

    if (response.stop_reason !== 'tool_use') {
      const textBlock = (response.content || []).find((b) => b.type === 'text');
      return { reply: textBlock ? textBlock.text : '(no response)', toolCalls: toolCallLog };
    }

    messages.push({ role: 'assistant', content: response.content });

    const toolResults = [];
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;
      const tool = TOOLS[block.name];
      let resultPayload;
      try {
        resultPayload = tool ? tool.run(block.input || {}) : { error: `Unknown tool: ${block.name}` };
      } catch (err) {
        resultPayload = { error: err.message };
      }
      toolCallLog.push({ name: block.name, input: block.input || {} });
      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(resultPayload) });
    }
    messages.push({ role: 'user', content: toolResults });
  }

  return { reply: 'I looked into this but need more turns than allowed to fully answer — try narrowing your question.', toolCalls: toolCallLog };
}

module.exports = { askAdminAssistant, isConfigured, currentModel };
