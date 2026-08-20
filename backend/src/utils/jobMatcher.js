function matchJob(job, prefs) {
  if (!prefs || !prefs.is_active) return 0;

  const titles = JSON.parse(prefs.job_titles || '[]');
  const locs = JSON.parse(prefs.locations || '[]');
  const excluded = JSON.parse(prefs.excluded_companies || '[]');
  const keywords = JSON.parse(prefs.excluded_keywords || '[]');
  const title = (job.title || '').toLowerCase();
  const company = (job.company || '').toLowerCase();

  if (excluded.some(e => company.includes(e.toLowerCase()))) return 0;
  if (keywords.some(k => title.includes(k.toLowerCase()))) return 0;

  let score = 0;

  if (titles.some(t => title.includes(t.toLowerCase()))) {
    score += 40;
  } else if (titles.some(t => t.toLowerCase().split(' ').some(w => title.includes(w)))) {
    score += 20;
  }

  if (locs.some(l => (job.location || '').toLowerCase().includes(l.toLowerCase()))) {
    score += 10;
  }

  return score;
}

module.exports = { matchJob };