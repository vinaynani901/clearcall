// Adzuna job search integration — used for "external" listings on the Job
// Search screen. Adzuna requires a free app_id/app_key pair from
// https://developer.adzuna.com. Left unset, isConfigured() reports false and
// the jobs route simply serves ClearCall direct postings — no fabricated
// external results are ever shown.
function isConfigured() {
  const { ADZUNA_APP_ID, ADZUNA_APP_KEY } = process.env;
  // Guard against the unfilled placeholder values shipped in .env — without
  // this, "your-adzuna-app-id-here" reads as truthy and the app would think
  // Adzuna is live, then fail every search with a real 401 from Adzuna
  // instead of cleanly reporting "not configured".
  return !!(ADZUNA_APP_ID && ADZUNA_APP_KEY && !ADZUNA_APP_ID.startsWith('your-') && !ADZUNA_APP_KEY.startsWith('your-'));
}

// Searches Adzuna's Australia job index. Returns a normalised array of
// { id, title, companyName, location, salaryMin, salaryMax, employmentType,
// description, postedAt, applyUrl } — never throws; a failed/unconfigured
// search returns an empty array so the Job Search screen degrades to
// ClearCall-only results instead of erroring.
// Returns { jobs, error }. `error` is only set when Adzuna IS configured but
// the request failed (network/HTTP error) — callers use this to distinguish
// "not configured" (silent, expected) from "temporarily unavailable" (worth
// surfacing to the job seeker) without throwing.
async function searchJobs({ what, where, page = 1, resultsPerPage = 20, salaryMin, industry, employmentType }) {
  if (!isConfigured()) return { jobs: [], error: null };

  const params = new URLSearchParams({
    app_id: process.env.ADZUNA_APP_ID,
    app_key: process.env.ADZUNA_APP_KEY,
    results_per_page: String(resultsPerPage),
    'content-type': 'application/json',
  });
  if (what) params.set('what', what);
  if (where) params.set('where', where);
  if (salaryMin) params.set('salary_min', String(salaryMin));
  if (industry) params.set('category', industry);
  // Adzuna's contract_time values are 'full_time' / 'part_time'; contract vs
  // permanent is a separate contract_type field. Our own jobType filter uses
  // the same 'full_time'/'part_time'/'contract'/'casual' vocabulary as the
  // ClearCall Direct jobs table, so only forward the two Adzuna recognises
  // directly and let the rest fall through to a post-filter client-side.
  if (employmentType === 'full_time' || employmentType === 'part_time') {
    params.set('full_time', employmentType === 'full_time' ? '1' : '0');
  }

  const url = `https://api.adzuna.com/v1/api/jobs/au/search/${page}?${params.toString()}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[adzuna] Search failed with status ${res.status}`);
      return { jobs: [], error: `Adzuna returned an error (status ${res.status})` };
    }
    const data = await res.json();
    const jobs = (data.results || []).map((job) => ({
      id: `adzuna_${job.id}`,
      title: job.title,
      companyName: job.company?.display_name || 'Unknown company',
      location: job.location?.display_name || '',
      salaryMin: job.salary_min || null,
      salaryMax: job.salary_max || null,
      employmentType: job.contract_time || null,
      description: job.description || '',
      postedAt: job.created || null,
      applyUrl: job.redirect_url,
      source: 'external',
    }));
    return { jobs, error: null };
  } catch (err) {
    console.error('[adzuna] Search request failed:', err.message);
    return { jobs: [], error: 'External jobs are temporarily unavailable' };
  }
}

// Adzuna's category taxonomy for Australia — used to populate the Industry
// filter dropdown. Static list (Adzuna's /categories endpoint is another
// live call we don't need just to show filter options).
const INDUSTRIES = [
  { value: 'healthcare-nursing-jobs', label: 'Healthcare & Nursing' },
  { value: 'it-jobs', label: 'IT' },
  { value: 'hospitality-catering-jobs', label: 'Hospitality & Catering' },
  { value: 'retail-jobs', label: 'Retail' },
  { value: 'trade-construction-jobs', label: 'Trade & Construction' },
  { value: 'teaching-jobs', label: 'Teaching' },
  { value: 'accounting-finance-jobs', label: 'Accounting & Finance' },
  { value: 'admin-jobs', label: 'Admin' },
  { value: 'logistics-warehouse-jobs', label: 'Logistics & Warehouse' },
  { value: 'sales-jobs', label: 'Sales' },
  { value: 'engineering-jobs', label: 'Engineering' },
  { value: 'customer-services-jobs', label: 'Customer Services' },
];

module.exports = { isConfigured, searchJobs, INDUSTRIES };
