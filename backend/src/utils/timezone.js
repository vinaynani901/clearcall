// Shared Australia/Sydney ("AEST") time helpers for the Auto Apply engine —
// daily slot resets, the 6pm summary notification, and "today"'s usage row
// all need to agree on what calendar date/hour it currently is in Sydney,
// regardless of what timezone the server itself is running in.
//
// Deliberately uses Intl.DateTimeFormat with timeZone: 'Australia/Sydney'
// (the same approach already used by the admin panel's AdminTopBar clock)
// rather than a fixed UTC+10 offset, so this stays correct across the
// AEST/AEDT daylight saving transition without any extra logic.

function todayAEST(date = new Date()) {
  // en-CA's date formatting is already YYYY-MM-DD, so no reassembly needed.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function currentAESTHourMinute(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Sydney', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour').value) % 24; // formatToParts can return "24" for midnight
  const minute = Number(parts.find((p) => p.type === 'minute').value);
  return { hour, minute };
}

module.exports = { todayAEST, currentAESTHourMinute };
