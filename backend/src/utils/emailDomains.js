const PERSONAL_DOMAINS = new Set([
  'gmail.com',
  'hotmail.com',
  'yahoo.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'yahoo.com.au',
  'hotmail.com.au',
  'outlook.com.au',
  'bigpond.com',
  'aol.com',
  'protonmail.com',
  'msn.com',
]);

function isPersonalEmailDomain(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return true;
  const domain = email.trim().toLowerCase().split('@')[1];
  return PERSONAL_DOMAINS.has(domain);
}

module.exports = { isPersonalEmailDomain, PERSONAL_DOMAINS };
