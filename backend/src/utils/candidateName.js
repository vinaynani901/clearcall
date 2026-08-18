// Shared name-validation logic — kept in one place so the upload-time
// column-mapping check (frontend), the one-time DB repair migration, and the
// results export all agree on what "looks like a link, not a name" means.
//
// Mirrors frontend/src/utils/columnMapping.js's rules exactly (Node has no
// access to that browser-side module, so this is a deliberate duplicate —
// keep the two in sync if the rule ever changes).

// Exact-header priority order used to pick the real name column/field when
// the primary candidate.name value turns out to be a link.
const NAME_KEY_PRIORITY = ['name', 'candidate name', 'applicant name', 'applicant', 'full name'];

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function looksLikeLink(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;
  if (s.startsWith('http')) return true;
  if (s.startsWith('www.')) return true;
  if (s.includes('linkedin')) return true;
  if (s.includes('seek')) return true;
  if (s.includes('.com')) return true; // catches .com and .com.au
  if (s.includes('/')) return true;
  if (/\b[a-z0-9-]+\.[a-z]{2,}\/\S/i.test(s)) return true;
  return false;
}

// Given a candidate row (with `name` and a parsed `extra_data` object), work
// out the best real name to show — falling back to any valid name-ish field
// preserved in extra_data if the primary name looks like a link.
function resolveCandidateName(candidate) {
  const raw = candidate?.name || '';
  if (!looksLikeLink(raw)) return { name: raw, corrected: false, stillBad: false };

  const extra = candidate?.extra_data || {};
  const keys = Object.keys(extra);

  for (const term of NAME_KEY_PRIORITY) {
    const key = keys.find((k) => normalize(k) === term);
    if (key && extra[key] && !looksLikeLink(extra[key])) {
      return { name: String(extra[key]).trim(), corrected: true, stillBad: false, sourceKey: key };
    }
  }
  const fallbackKey = keys.find((k) => normalize(k).includes('name') && extra[k] && !looksLikeLink(extra[k]));
  if (fallbackKey) {
    return { name: String(extra[fallbackKey]).trim(), corrected: true, stillBad: false, sourceKey: fallbackKey };
  }

  return { name: raw, corrected: false, stillBad: true };
}

module.exports = { NAME_KEY_PRIORITY, normalize, looksLikeLink, resolveCandidateName };
