// Auto Apply job matching algorithm (Part 2). Pure function, no DB access —
// takes a normalized job listing and a parsed auto_apply_preferences record,
// returns a 0-100 score plus a per-criterion breakdown (the breakdown is
// what powers "Advanced Match Scoring" on Premium Plus and the % shown on
// every auto-applied application in the tracker). A score of 0 is also what
// an exclusion rule produces — "company to avoid" and "keyword to avoid"
// override every other point-earning rule, no matter how well the job
// otherwise matches.
//
// Expected `job` shape (see services/autoApplyEngine.js for how a `jobs`
// table row is normalized into this):
//   { id, title, description, industry, location, employmentType,
//     salaryMin, salaryMax, companyName, postedAt }
//
// Expected `preferences` shape (see routes/autoApply.js's deserialize()):
//   { jobTitles, industries, locations, salaryMinimum, employmentTypes,
//     experienceLevels, excludedCompanies, excludedKeywords }
//
// Scoring rubric (exact point values from the spec):
//   Job title match      — 40 (full contains) / 20 (partial word overlap) / 0
//   Location match       — 20 (preferred location matches, or remote+remote)
//   Salary match          — 15 (meets/exceeds minimum) / 10 (no salary listed) / 0
//   Industry match         — 15
//   Employment type match  — 10
//   Max possible: 100. Only scores >= QUALIFYING_SCORE (60) qualify for auto apply.

const QUALIFYING_SCORE = 60;

function norm(s) {
  return String(s || '').trim().toLowerCase();
}

function normList(arr) {
  return (Array.isArray(arr) ? arr : []).map(norm).filter(Boolean);
}

function includesSubstring(haystack, needle) {
  if (!haystack || !needle) return false;
  return norm(haystack).includes(norm(needle));
}

function isRemote(job) {
  return norm(job.location).includes('remote') || norm(job.employmentType).includes('remote');
}

// --- Exclusion rules ------------------------------------------------------

function matchesExcludedCompany(job, excludedCompanies) {
  const list = normList(excludedCompanies);
  if (list.length === 0 || !job.companyName) return false;
  const company = norm(job.companyName);
  return list.some((excluded) => company.includes(excluded) || excluded.includes(company));
}

function matchesExcludedKeyword(job, excludedKeywords) {
  const list = normList(excludedKeywords);
  if (list.length === 0) return false;
  const haystack = `${norm(job.title)} ${norm(job.description)}`;
  return list.some((kw) => haystack.includes(kw));
}

// --- Individual scoring rules ---------------------------------------------

function scoreJobTitle(job, jobTitles) {
  const titles = normList(jobTitles);
  if (titles.length === 0 || !job.title) return 0;
  const jobTitle = norm(job.title);

  // "Full contains" — the job title fully contains a preferred title (or
  // vice versa), e.g. preferred "Software Developer" vs job "Senior
  // Software Developer" or job "Developer" vs preferred "Software Developer
  // Developer" edge case aside, this covers the common cases in the spec's
  // own examples.
  if (titles.some((t) => jobTitle.includes(t) || t.includes(jobTitle))) return 40;

  // "Partial" — at least one whole word in common between the job title and
  // a preferred title (e.g. preferred "React Developer" vs job "React
  // Engineer" shares the word "react").
  const jobWords = new Set(jobTitle.split(/\s+/).filter((w) => w.length > 2));
  const hasWordOverlap = titles.some((t) => t.split(/\s+/).some((w) => w.length > 2 && jobWords.has(w)));
  if (hasWordOverlap) return 20;

  return 0;
}

function scoreLocation(job, locations) {
  const prefs = normList(locations);
  if (prefs.length === 0) return 0;

  if (prefs.includes('remote') && isRemote(job)) return 20;
  if (job.location && prefs.some((loc) => includesSubstring(job.location, loc) || includesSubstring(loc, job.location))) return 20;

  return 0;
}

function scoreSalary(job, salaryMinimum) {
  const min = Number(salaryMinimum);
  if (!min || Number.isNaN(min)) return 15; // no minimum set by the job seeker — nothing to fail on

  const jobMax = typeof job.salaryMax === 'number' ? job.salaryMax : null;
  const jobMin = typeof job.salaryMin === 'number' ? job.salaryMin : null;

  if (jobMax === null && jobMin === null) return 10; // job has no salary listed
  const jobHighestFigure = jobMax !== null ? jobMax : jobMin;
  return jobHighestFigure >= min ? 15 : 0;
}

function scoreIndustry(job, industries) {
  const prefs = normList(industries);
  if (prefs.length === 0 || !job.industry) return 0;
  return prefs.includes(norm(job.industry)) ? 15 : 0;
}

function scoreEmploymentType(job, employmentTypes) {
  const prefs = normList(employmentTypes).map((t) => t.replace(/[\s-]/g, '_'));
  if (prefs.length === 0 || !job.employmentType) return 0;
  return prefs.includes(norm(job.employmentType).replace(/[\s-]/g, '_')) ? 10 : 0;
}

// --- Main entry point -------------------------------------------------

function scoreJobMatch(job, preferences) {
  if (!job || !preferences) return { score: 0, qualifies: false, excluded: false, breakdown: {} };

  if (matchesExcludedCompany(job, preferences.excludedCompanies) || matchesExcludedKeyword(job, preferences.excludedKeywords)) {
    return {
      score: 0,
      qualifies: false,
      excluded: true,
      breakdown: { jobTitle: 0, location: 0, salary: 0, industry: 0, employmentType: 0 },
    };
  }

  const breakdown = {
    jobTitle: scoreJobTitle(job, preferences.jobTitles),
    location: scoreLocation(job, preferences.locations),
    salary: scoreSalary(job, preferences.salaryMinimum),
    industry: scoreIndustry(job, preferences.industries),
    employmentType: scoreEmploymentType(job, preferences.employmentTypes),
  };

  const score = breakdown.jobTitle + breakdown.location + breakdown.salary + breakdown.industry + breakdown.employmentType;

  return { score, qualifies: score >= QUALIFYING_SCORE, excluded: false, breakdown };
}

module.exports = { scoreJobMatch, QUALIFYING_SCORE };
