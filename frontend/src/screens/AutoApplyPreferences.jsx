import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import JobSeekerLayout from '../components/JobSeekerLayout';
import { ErrorBanner } from '../components/Shared';
import { LockIcon, RocketIcon, StarIcon } from '../components/Icons';
import { api } from '../api/client';

const INDUSTRIES = ['Technology', 'Healthcare', 'Construction', 'Education', 'Finance', 'Government', 'Other'];
const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'casual', label: 'Casual' },
  { value: 'contract', label: 'Contract' },
];
const EXPERIENCE_LEVELS = ['Graduate', 'Junior', 'Mid Level', 'Senior', 'Lead'];

const EMPTY_FORM = {
  jobTitles: [], industries: [], locations: [], salaryMinimum: '',
  employmentTypes: [], experienceLevels: [], excludedCompanies: [], excludedKeywords: [], isActive: false,
};

function Switch({ on, onChange, disabled }) {
  return (
    <button type="button" className={`switch ${on ? 'on' : ''}`} onClick={() => !disabled && onChange(!on)} disabled={disabled} aria-pressed={on}>
      <span className="knob" />
    </button>
  );
}

function TagInput({ label, placeholder, values, onChange }) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setDraft('');
  };

  const remove = (i) => onChange(values.filter((_, idx) => idx !== i));

  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 8 }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          style={{ flex: 1 }}
        />
        <button type="button" className="btn btn-grey btn-sm" style={{ width: 'auto' }} onClick={add}>Add</button>
      </div>
      {values.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {values.map((v, i) => (
            <span key={i} className="badge badge-grey-light" style={{ cursor: 'pointer' }} onClick={() => remove(i)}>{v} ✕</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CheckboxGroup({ label, options, values, onChange, getValue = (o) => o, getLabel = (o) => o }) {
  const toggle = (v) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {options.map((o) => {
          const v = getValue(o);
          const checked = values.includes(v);
          return (
            <label key={v} className="row" style={{ gap: 6, alignItems: 'center', width: 'auto', cursor: 'pointer' }}>
              <input type="checkbox" checked={checked} onChange={() => toggle(v)} />
              <span className="small">{getLabel(o)}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function AutoApplyPreferences() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  const load = () => {
    api.getAutoApplyPreferences()
      .then((d) => {
        setData(d);
        if (d.preferences) {
          setForm({
            jobTitles: d.preferences.jobTitles, industries: d.preferences.industries, locations: d.preferences.locations,
            salaryMinimum: d.preferences.salaryMinimum ?? '', employmentTypes: d.preferences.employmentTypes,
            experienceLevels: d.preferences.experienceLevels, excludedCompanies: d.preferences.excludedCompanies,
            excludedKeywords: d.preferences.excludedKeywords, isActive: d.preferences.isActive,
          });
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const save = async (overrides) => {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, ...overrides };
      const result = await api.saveAutoApplyPreferences(payload);
      setForm((f) => ({ ...f, ...overrides }));
      setData((d) => ({ ...d, preferences: result.preferences }));
      setToast('Preferences saved');
      setTimeout(() => setToast(''), 2200);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <JobSeekerLayout active="applications">
        <div className="muted small" style={{ padding: 20 }}>Loading…</div>
      </JobSeekerLayout>
    );
  }

  // Part 9 — Free plan sees a locked screen with an upgrade CTA, nothing else.
  if (data?.locked) {
    return (
      <JobSeekerLayout active="applications">
        <div className="card jsk-empty-state" style={{ maxWidth: 460, margin: '40px auto' }}>
          <LockIcon size={36} color="#94a3b8" />
          <div className="bold" style={{ fontSize: 17, marginTop: 12 }}>Auto Apply is a Premium feature</div>
          <p className="muted small" style={{ marginTop: 6, maxWidth: 360 }}>
            Let ClearCall automatically apply to matching jobs for you the moment they're posted. Upgrade to Premium or Premium Plus to turn it on.
          </p>
          <button className="btn btn-primary" style={{ width: 'auto', marginTop: 16 }} onClick={() => navigate('/pricing/jobseeker')}>
            Upgrade Now
          </button>
        </div>
      </JobSeekerLayout>
    );
  }

  return (
    <JobSeekerLayout active="applications">
      <div className="jsk-section-header">
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Auto Apply Preferences</h1>
      </div>
      <ErrorBanner message={error} />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row-between">
          <div>
            <div className="bold" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              Auto Apply
              {data?.instantPriorityApply && (
                <span className="badge badge-green xs" style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <StarIcon size={11} color="#059669" /> Priority Apply
                </span>
              )}
            </div>
            {form.isActive ? (
              <div className="muted small" style={{ marginTop: 4 }}>
                {data.slotsRemainingToday} of {data.dailyLimit} slots remaining today
              </div>
            ) : (
              <div className="muted small" style={{ marginTop: 4 }}>
                Turn this on and ClearCall will automatically apply to matching jobs for you as soon as they're posted.
              </div>
            )}
            {data?.instantPriorityApply && (
              <div className="muted xs" style={{ marginTop: 4, maxWidth: 420 }}>
                Priority Apply: your applications are submitted within minutes of a matching job being posted.
              </div>
            )}
          </div>
          <Switch on={form.isActive} disabled={saving} onChange={(v) => save({ isActive: v })} />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="bold small" style={{ marginBottom: 12 }}>Job Preferences</div>
        <TagInput
          label="Job Titles"
          placeholder="e.g. Software Developer — press Enter"
          values={form.jobTitles}
          onChange={(v) => setForm((f) => ({ ...f, jobTitles: v }))}
        />
        <CheckboxGroup
          label="Industries"
          options={INDUSTRIES}
          values={form.industries}
          onChange={(v) => setForm((f) => ({ ...f, industries: v }))}
        />
        <TagInput
          label="Preferred Locations"
          placeholder="e.g. Melbourne VIC, Remote — press Enter"
          values={form.locations}
          onChange={(v) => setForm((f) => ({ ...f, locations: v }))}
        />
        <div className="field">
          <label>Salary Minimum ($/yr)</label>
          <input
            type="number"
            value={form.salaryMinimum}
            onChange={(e) => setForm((f) => ({ ...f, salaryMinimum: e.target.value }))}
            placeholder="e.g. 70000"
          />
        </div>
        <CheckboxGroup
          label="Employment Type"
          options={EMPLOYMENT_TYPES}
          values={form.employmentTypes}
          getValue={(o) => o.value}
          getLabel={(o) => o.label}
          onChange={(v) => setForm((f) => ({ ...f, employmentTypes: v }))}
        />
        <CheckboxGroup
          label="Experience Level"
          options={EXPERIENCE_LEVELS}
          values={form.experienceLevels}
          onChange={(v) => setForm((f) => ({ ...f, experienceLevels: v }))}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="bold small" style={{ marginBottom: 12 }}>Exclusions</div>
        <TagInput
          label="Companies to Avoid"
          placeholder="Company name — press Enter"
          values={form.excludedCompanies}
          onChange={(v) => setForm((f) => ({ ...f, excludedCompanies: v }))}
        />
        <TagInput
          label="Keywords to Avoid"
          placeholder="Keyword — press Enter"
          values={form.excludedKeywords}
          onChange={(v) => setForm((f) => ({ ...f, excludedKeywords: v }))}
        />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="bold small">Daily Limit</div>
        <p className="muted small" style={{ marginTop: 6, marginBottom: 0 }}>
          Your plan includes <strong>{data?.dailyLimit} auto applications per day</strong>. Unused slots don't carry over to the next day.
        </p>
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={() => save({})}>
        {saving ? 'Saving…' : 'Save Preferences'}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </JobSeekerLayout>
  );
}
