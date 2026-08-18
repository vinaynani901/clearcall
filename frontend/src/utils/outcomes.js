// Fixed call-outcome options — always the same 12, regardless of which
// custom tag set a campaign is using for its quick tags. Save and Next,
// the call_status mapping, and the end-of-day summary stats all key off
// these exact labels, so they're never customisable. Mirrors backend
// routes/campaigns.js's DEFAULT_TAGS exactly.
export const OUTCOME_OPTIONS = [
  { label: 'Answered', emoji: '✅' },
  { label: 'Not Answered', emoji: '📵' },
  { label: 'Went to Voicemail', emoji: '📩' },
  { label: 'Interested', emoji: '👍' },
  { label: 'Not Interested', emoji: '👎' },
  { label: 'Callback Requested', emoji: '🔁' },
  { label: 'Interview Scheduled', emoji: '📅' },
  { label: 'Not Suitable', emoji: '❌' },
  { label: 'Visa Issue', emoji: '🛂' },
  { label: 'Salary Too High', emoji: '💰' },
  { label: 'Immediate Start Available', emoji: '🚀' },
  { label: 'Requires Sponsorship', emoji: '📄' },
];
