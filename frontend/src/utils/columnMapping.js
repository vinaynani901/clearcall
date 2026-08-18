// Suggests which uploaded spreadsheet column matches each ClearCall field,
// so recruiters uploading exports from Seek, Indeed, LinkedIn, or their own
// systems don't have to map columns by hand every time. The employer can
// always override the suggestion before importing.

// Exact priority order for the candidate-name column: try each of these
// header names in turn (exact match after normalizing), before falling back
// to any other header that merely contains the word "name".
const NAME_HEADER_PRIORITY = ['name', 'candidate name', 'applicant name', 'applicant', 'full name'];

const FIELD_SYNONYMS = {
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'mobile no', 'contact number', 'cell', 'contact', 'telephone'],
  jobRole: ['role', 'job role', 'position', 'job title', 'title', 'job', 'applied for', 'vacancy', 'position applied for'],
};

function normalize(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// A real person's name never trips this. Deliberately aggressive per the
// employer-reported bug (LinkedIn/Seek export columns getting mapped in as
// the name) — any of these signals is enough to reject the value outright.
export function looksLikeLink(value) {
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

// Does this header's actual data look like it's full of links rather than
// names? Checked against a handful of non-empty sample values so one stray
// URL in an otherwise-clean column doesn't disqualify it.
function columnLooksLikeLinks(rows, header) {
  const samples = rows
    .map((r) => r[header])
    .filter((v) => v !== '' && v !== null && v !== undefined)
    .slice(0, 5);
  if (samples.length === 0) return false;
  return samples.filter(looksLikeLink).length / samples.length >= 0.5;
}

// Picks the best candidate-name column: walk the exact-header priority list
// first, then fall back to any other header containing "name" — at every
// step, a column whose values look like links is skipped entirely (per the
// "keep searching other columns" rule) rather than ever being used.
function findNameHeader(headers, rows) {
  for (const term of NAME_HEADER_PRIORITY) {
    const header = headers.find((h) => normalize(h) === term);
    if (header && !columnLooksLikeLinks(rows, header)) return header;
  }
  const fallback = headers.find((h) => normalize(h).includes('name') && !columnLooksLikeLinks(rows, h));
  return fallback || null;
}

export function suggestMapping(headers, rows = []) {
  const mapping = { name: null, phone: null, jobRole: null };
  const used = new Set();

  const nameHeader = findNameHeader(headers, rows);
  if (nameHeader) {
    mapping.name = nameHeader;
    used.add(nameHeader);
  }

  for (const field of ['phone', 'jobRole']) {
    const synonyms = FIELD_SYNONYMS[field];
    let match = headers.find((h) => !used.has(h) && synonyms.includes(normalize(h)));
    if (!match) {
      match = headers.find((h) => !used.has(h) && synonyms.some((syn) => normalize(h).includes(syn)));
    }
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

// Turns raw uploaded rows + a confirmed field mapping into the candidate
// payload shape the campaign-create API expects. Any column not mapped to
// name/phone/jobRole is preserved as extra_data automatically. Rows missing
// a name or phone after mapping are dropped.
export function buildCandidatesFromMapping(rows, mapping) {
  return rows
    .map((row) => {
      const name = mapping.name ? row[mapping.name] : '';
      const phone = mapping.phone ? row[mapping.phone] : '';
      const jobRole = mapping.jobRole ? row[mapping.jobRole] : '';
      const extra = {};
      Object.keys(row).forEach((h) => {
        if (h !== mapping.name && h !== mapping.phone && h !== mapping.jobRole) {
          extra[h] = row[h];
        }
      });
      return {
        name: String(name || '').trim(),
        phone: String(phone || '').trim(),
        jobRole: jobRole ? String(jobRole).trim() : null,
        extra,
      };
    })
    .filter((c) => c.name && c.phone);
}

// Display-time safety net: if a candidate's stored name still looks like a
// link (data uploaded before this fix existed, or a source file with no
// clean name column at all), look through whatever else was preserved in
// extra_data for a real name field before giving up.
export function resolveCandidateName(candidate) {
  const raw = candidate?.name || '';
  if (!looksLikeLink(raw)) return { name: raw, corrected: false, stillBad: false };

  const extra = candidate?.extra_data || {};
  const keys = Object.keys(extra);

  for (const term of NAME_HEADER_PRIORITY) {
    const key = keys.find((k) => normalize(k) === term);
    if (key && extra[key] && !looksLikeLink(extra[key])) {
      return { name: String(extra[key]).trim(), corrected: true, stillBad: false };
    }
  }
  const fallbackKey = keys.find((k) => normalize(k).includes('name') && extra[k] && !looksLikeLink(extra[k]));
  if (fallbackKey) {
    return { name: String(extra[fallbackKey]).trim(), corrected: true, stillBad: false };
  }

  return { name: raw, corrected: false, stillBad: true };
}
