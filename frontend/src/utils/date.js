// SQLite's datetime('now') (used for every created_at/updated_at/etc. in
// this app) stores the current UTC instant as "YYYY-MM-DD HH:MM:SS" — no
// "Z", no timezone offset. JS's Date parser treats a string like that (and
// even "YYYY-MM-DDTHH:MM:SS" without a trailing Z) as LOCAL time, not UTC.
// So a bare `new Date(row.created_at)` silently reads every server
// timestamp as if it happened in the browser's own timezone, which is
// wrong by exactly that timezone's offset — for AEST (UTC+10/+11) that's
// enough to roll the displayed calendar date back a day for anything that
// happened in the morning. This normalizes any SQLite-style timestamp into
// a real UTC instant before handing it to Date, so every `.toLocaleDateString()`
// / `.toLocaleString()` call downstream converts to the viewer's actual
// local time correctly.
export function parseServerDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).trim();
  if (!s) return null;
  // Already carries an explicit timezone (Z or +hh:mm/-hh:mm) — trust it.
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  // SQLite's bare "YYYY-MM-DD HH:MM:SS" (or the same with a T separator) —
  // treat as UTC.
  return new Date(`${s.replace(' ', 'T')}Z`);
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = parseServerDate(value);
  return d ? d.toLocaleDateString('en-AU', options) : '—';
}

export function formatDateTime(value, options) {
  const d = parseServerDate(value);
  return d ? d.toLocaleString('en-AU', options) : '—';
}

export function formatTime(value, options = { hour: 'numeric', minute: '2-digit' }) {
  const d = parseServerDate(value);
  return d ? d.toLocaleTimeString('en-AU', options) : '—';
}

// "Today at 2:30 PM" / "Yesterday at 10:15 AM" / full date for anything
// older — used for call history entries, where the exact clock time matters
// (not just a relative "3h ago") but a bare date is only useful once it's
// not today or yesterday.
export function formatCallTimestamp(value) {
  const d = parseServerDate(value);
  if (!d) return '—';

  const now = new Date();
  const startOfDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);

  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  if (dayDiff === 0) return `Today at ${time}`;
  if (dayDiff === 1) return `Yesterday at ${time}`;
  return d.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// Relative "3h ago" / "2d ago" style label, used across the job seeker
// activity/notification feeds.
export function timeAgo(value) {
  const d = parseServerDate(value);
  if (!d) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
