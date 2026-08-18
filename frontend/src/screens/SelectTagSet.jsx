import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { buildCandidatesFromMapping } from '../utils/columnMapping';
import { api } from '../api/client';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function TagSetCard({ name, tags, selected, onClick }) {
  const preview = tags.slice(0, 4);
  const extra = tags.length - preview.length;
  return (
    <div
      className="card mb-8"
      style={{ cursor: 'pointer', border: selected ? '2px solid var(--navy)' : '2px solid transparent' }}
      onClick={onClick}
    >
      <div className="row-between">
        <div className="bold" style={{ fontSize: 15 }}>{name}</div>
        <span className="badge badge-blue">{tags.length} tag{tags.length === 1 ? '' : 's'}</span>
      </div>
      <div className="tagset-preview-badges">
        {preview.map((t) => (
          <span key={t.label} className="tagset-preview-badge">{t.emoji} {t.label}</span>
        ))}
        {extra > 0 && <span className="tagset-preview-badge">+{extra} more</span>}
      </div>
    </div>
  );
}

// Step 4 (final screen of the wizard): choose the quick-tap tags for this
// campaign, then actually create it. Only reachable with a valid
// in-progress campaign (a file already uploaded, mapped, and named) — if
// that's missing, this screen must never be shown, per the campaign
// creation flow fix; it redirects straight back to the campaigns list.
export default function SelectTagSet() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fileName, headers, rows, mapping, name: campaignName } = location.state || {};
  const hasValidChain = !!(headers && rows && mapping && campaignName);

  const [starterSets, setStarterSets] = useState([]);
  const [savedSets, setSavedSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null); // { tags, tagTemplateId, name }
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!hasValidChain) {
      navigate('/employer/campaigns', { replace: true });
    }
  }, [hasValidChain, navigate]);

  useEffect(() => {
    Promise.all([api.getStarterTagSets(), api.listTagTemplates()])
      .then(([starters, saved]) => {
        setStarterSets(starters.tagSets || []);
        setSavedSets(saved.templates || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Returning here after "Build From Scratch" saves a brand-new template —
  // the editor hands the freshly created tags straight back via router
  // state, so pre-select it immediately rather than making the recruiter
  // hunt for it in the (not-yet-refreshed) saved list.
  useEffect(() => {
    if (location.state?.tags && location.state?.tagSetName) {
      setSelected({ tags: location.state.tags, tagTemplateId: location.state.tagTemplateId || null, name: location.state.tagSetName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!hasValidChain) return null;

  const buildFromScratch = () => {
    navigate('/employer/tag-sets/new', {
      state: { returnTo: '/employer/campaigns/select-tag-set', returnState: { fileName, headers, rows, mapping, name: campaignName } },
    });
  };

  const startCampaign = async () => {
    if (!selected) {
      setError('Choose a tag set (or build your own) before starting the campaign.');
      return;
    }
    setError('');
    const candidates = buildCandidatesFromMapping(rows, mapping);
    if (candidates.length === 0) {
      setError('No rows with both a name and a phone number were found in the uploaded file.');
      return;
    }
    setSubmitting(true);
    try {
      const data = await api.createCampaign({
        name: campaignName,
        batches: [{ callDate: todayIso(), candidates }],
        tags: selected.tags,
        tagTemplateId: selected.tagTemplateId || undefined,
      });
      navigate('/success', {
        state: {
          message: `"${data.campaign.name}" is ready — ${candidates.length} candidates imported.`,
          continueTo: `/employer/campaigns/${data.campaign.id}`,
        },
      });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Choose Tags for This Campaign" onBack={() => navigate('/employer/campaigns/name', { state: location.state })} />

        <ErrorBanner message={error} />

        <p className="muted small mb-24">
          Pick the quick-tap tags recruiters will use during calls in "{campaignName}" — a saved set, one of our industry templates, or build your own.
        </p>

        {loading ? (
          <div className="card muted small">Loading…</div>
        ) : (
          <>
            {savedSets.length > 0 && (
              <div className="mb-24">
                <div className="muted xs bold mb-8">YOUR SAVED TAG SETS</div>
                {savedSets.map((t) => (
                  <TagSetCard
                    key={t.id}
                    name={t.name}
                    tags={t.tags}
                    selected={selected?.tagTemplateId === t.id}
                    onClick={() => setSelected({ tags: t.tags, tagTemplateId: t.id, name: t.name })}
                  />
                ))}
              </div>
            )}

            <div className="mb-24">
              <div className="muted xs bold mb-8">INDUSTRY TEMPLATES</div>
              {starterSets.map((t) => (
                <TagSetCard
                  key={t.key}
                  name={t.name}
                  tags={t.tags}
                  selected={selected?.name === t.name && !selected?.tagTemplateId}
                  onClick={() => setSelected({ tags: t.tags, tagTemplateId: null, name: t.name })}
                />
              ))}
            </div>
          </>
        )}

        <button className="btn btn-outline mb-16" onClick={buildFromScratch}>
          Build From Scratch
        </button>

        <button className="btn btn-primary" onClick={startCampaign} disabled={submitting}>
          {submitting ? 'Starting campaign…' : 'Start Campaign'}
        </button>
      </div>
    </>
  );
}
