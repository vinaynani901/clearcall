// Auto Apply — AI Resume Tailoring (Part 4). Plug-and-play by design: every
// function here re-reads process.env at call time (never at module-load
// time, never cached), so dropping a real key into .env and restarting the
// Node process (the normal way any env var change takes effect) activates
// the matching provider with ZERO code changes anywhere in this file or any
// caller. No key present anywhere -> tailorResume() logs and returns the
// original resume text untouched, with wasTailored: false, exactly like
// resend.js's dev-mode fallback for email.
//
// Provider priority (checked fresh on every call): Anthropic -> OpenAI ->
// Gemini -> none. Uses plain fetch (Node 18+ global, same approach as
// services/aiAssistant.js) rather than adding three separate SDK
// dependencies for providers that may never be turned on.
const db = require('../db');
const { newId } = require('../utils/ids');

// Placeholder values written to .env by the Auto Apply build — anything
// still equal to (or empty, or still carrying) these means "not really
// configured yet", same convention as RESEND_API_KEY's
// 'your-resend-key-here' and VAPID_PUBLIC_KEY's 'your-' prefix check.
const PLACEHOLDER_PREFIX = 'paste_your_';

function isRealKey(key) {
  return !!key && key.trim() !== '' && !key.startsWith(PLACEHOLDER_PREFIX);
}

const PROVIDER_CONFIG = {
  anthropic: {
    label: 'Anthropic Claude',
    envKey: 'ANTHROPIC_API_KEY',
    getKeyUrl: 'console.anthropic.com',
    defaultModel: 'claude-sonnet-5',
    modelEnvKey: 'ANTHROPIC_MODEL',
    // Rough reference figure only (shown in Admin > AI Configuration) — a
    // resume + job description tailoring call is a few thousand input/output
    // tokens; this is not a live-metered cost.
    estimatedCostPerTailoring: 0.015,
  },
  openai: {
    label: 'OpenAI GPT',
    envKey: 'OPENAI_API_KEY',
    getKeyUrl: 'platform.openai.com',
    defaultModel: 'gpt-4o-mini',
    modelEnvKey: 'OPENAI_MODEL',
    estimatedCostPerTailoring: 0.01,
  },
  gemini: {
    label: 'Google Gemini',
    envKey: 'GEMINI_API_KEY',
    getKeyUrl: 'aistudio.google.com',
    defaultModel: 'gemini-3.6-flash',
    modelEnvKey: 'GEMINI_MODEL',
    estimatedCostPerTailoring: 0.005,
  },
};

// The exact tailoring prompt — must be byte-identical across every
// provider, per the spec. JOB_DESCRIPTION and RESUME_TEXT are substituted
// in verbatim (no reformatting) immediately before each call.
const PROMPT_TEMPLATE = 'You are a professional resume writer. You will be given a candidate resume and a job description. Tailor the resume to better match the job description following these rules: Do not change or remove any actual experience, qualifications, education, or employment dates. Do not add skills or experience the candidate does not have. Do not change company names, job titles held, or employment dates. You may reorder bullet points to highlight the most relevant experience first. You may rewrite bullet point descriptions to use language from the job description where it accurately reflects what the candidate did. You may rewrite the professional summary to align with the role. You may reorder skills to put the most relevant ones first. Return only the complete tailored resume text with no explanation or commentary. Job description: JOB_DESCRIPTION. Candidate resume: RESUME_TEXT.';

function buildPrompt(jobDescription, resumeText) {
  return PROMPT_TEMPLATE
    .replace('JOB_DESCRIPTION', jobDescription || 'No job description provided.')
    .replace('RESUME_TEXT', resumeText || 'No resume provided.');
}

// Resolves which provider is active purely from process.env, checked fresh
// every call — this is the entire "zero code changes" mechanism. AI_PROVIDER
// (settable from the admin AI Configuration dropdown, Part 10) is honoured
// first if it names a provider that actually has a real key present, so an
// admin choosing between two simultaneously-configured providers takes
// effect immediately with no restart. With only one key ever present (the
// common case), that key wins regardless of AI_PROVIDER — the fallback
// order below is Anthropic, then OpenAI, then Gemini.
function getActiveProvider() {
  const preferred = String(process.env.AI_PROVIDER || '').toLowerCase();
  if (PROVIDER_CONFIG[preferred] && isRealKey(process.env[PROVIDER_CONFIG[preferred].envKey])) return preferred;

  if (isRealKey(process.env.ANTHROPIC_API_KEY)) return 'anthropic';
  if (isRealKey(process.env.OPENAI_API_KEY)) return 'openai';
  if (isRealKey(process.env.GEMINI_API_KEY)) return 'gemini';
  return null;
}

function isProviderConfigured(provider) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return false;
  return isRealKey(process.env[config.envKey]);
}

// --- Per-provider raw API calls -------------------------------------------

async function callAnthropic(prompt) {
  const model = process.env.ANTHROPIC_MODEL || PROVIDER_CONFIG.anthropic.defaultModel;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.content && data.content[0] && data.content[0].text;
  if (!text) throw new Error('Anthropic API returned no text content');
  return text;
}

async function callOpenAI(prompt) {
  const model = process.env.OPENAI_MODEL || PROVIDER_CONFIG.openai.defaultModel;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2500,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!text) throw new Error('OpenAI API returned no message content');
  return text;
}

async function callGemini(prompt) {
  const model = process.env.GEMINI_MODEL || PROVIDER_CONFIG.gemini.defaultModel;
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) throw new Error(`Gemini API error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text;
  if (!text) throw new Error('Gemini API returned no text content');
  return text;
}

const CALLERS = { anthropic: callAnthropic, openai: callOpenAI, gemini: callGemini };

// --- Public API -------------------------------------------------------

// Main entry point used by the Auto Apply engine. Always resolves (never
// throws) — a provider failure or missing key both fall back to the base
// resume, since a broken tailoring call must never block the actual job
// application from being submitted.
async function tailorResume({ resumeText, jobDescription }) {
  const provider = getActiveProvider();
  if (!provider) {
    console.log('[aiTailor] AI tailoring not configured — using base resume');
    return { tailoredText: resumeText, provider: null, wasTailored: false };
  }

  try {
    const prompt = buildPrompt(jobDescription, resumeText);
    const tailoredText = await CALLERS[provider](prompt);
    if (!tailoredText || !tailoredText.trim()) throw new Error('Empty response from AI provider');
    return { tailoredText: tailoredText.trim(), provider, wasTailored: true };
  } catch (err) {
    console.error(`[aiTailor] ${provider} tailoring failed — falling back to base resume:`, err.message);
    return { tailoredText: resumeText, provider: null, wasTailored: false, error: err.message };
  }
}

// Used by the admin "Test" button (Part 10) — forces a specific provider
// (bypassing the priority order) so the admin can verify a key works before
// it becomes the one actually used in production auto-apply runs. Writes
// its result to ai_provider_tests so the admin panel can show "last test
// result / pass or fail" without the caller needing to track that itself.
async function testProvider(provider) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return { success: false, error: `Unknown provider: ${provider}` };

  const sampleResume = 'Jordan Lee\nProfessional Summary: Customer-focused retail assistant with 3 years experience.\nWork Experience: Retail Assistant — Coles (2022-2024): Handled register, restocked shelves, assisted customers.\nSkills: Communication, Teamwork, POS systems.';
  const sampleJobDescription = 'We are hiring a Customer Service Representative to handle inbound calls, resolve customer issues, and use CRM software daily. Strong communication skills required.';

  let result;
  if (!isProviderConfigured(provider)) {
    result = { success: false, error: `${config.label} is not configured — no key present in .env` };
  } else {
    try {
      const prompt = buildPrompt(sampleJobDescription, sampleResume);
      const text = await CALLERS[provider](prompt);
      result = { success: true, resultSnippet: (text || '').slice(0, 400) };
    } catch (err) {
      result = { success: false, error: err.message };
    }
  }

  db.prepare(`
    INSERT INTO ai_provider_tests (id, provider, success, result_snippet, error)
    VALUES (?, ?, ?, ?, ?)
  `).run(newId('aitest'), provider, result.success ? 1 : 0, result.resultSnippet || null, result.error || null);

  return result;
}

function getLastTestResult(provider) {
  const row = db.prepare('SELECT * FROM ai_provider_tests WHERE provider = ? ORDER BY tested_at DESC LIMIT 1').get(provider);
  if (!row) return null;
  return {
    success: !!row.success,
    resultSnippet: row.result_snippet,
    error: row.error,
    testedAt: row.tested_at,
  };
}

// Full status block for the admin AI Configuration section (Part 8/10).
function getProviderStatus() {
  const active = getActiveProvider();
  return Object.entries(PROVIDER_CONFIG).map(([key, config]) => ({
    provider: key,
    label: config.label,
    configured: isProviderConfigured(key),
    active: active === key,
    getKeyUrl: config.getKeyUrl,
    estimatedCostPerTailoring: config.estimatedCostPerTailoring,
    lastTest: getLastTestResult(key),
  }));
}

module.exports = {
  PROVIDER_CONFIG,
  PROMPT_TEMPLATE,
  getActiveProvider,
  isProviderConfigured,
  tailorResume,
  testProvider,
  getLastTestResult,
  getProviderStatus,
};
