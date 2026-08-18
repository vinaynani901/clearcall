import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';

const EMOJI_CHOICES = [
  '✅', '❌', '⚠️', '🔴', '🟢', '🟡', '🔵', '⭐️', '🚀', '📅',
  '📄', '💰', '💸', '🛂', '🏥', '🎓', '🏗️', '💼', '📞', '📧',
  '🔁', '👍', '👎', '🙌', '🤝', '🕐', '📍', '🌟', '🔥', '💡',
  '🎯', '🏆', '✨', '📌', '🔒', '🔓', '👀', '📋', '🚗', '✈️',
  '🌏', '🧳', '🚫', '⏳', '👷', '🦺', '🧒', '📈', '📊', '🏢',
];

export default function TagSetEditor() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [name, setName] = useState(location.state?.initialName || '');
  const [tags, setTags] = useState(location.state?.initialTags || []);
  const [selectedEmoji, setSelectedEmoji] = useState('✅');
  const [newTagText, setNewTagText] = useState('');
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isEditing) return;
    api.listTagTemplates().then((d) => {
      const found = (d.templates || []).find((t) => t.id === id);
      if (found) { setName(found.name); setTags(found.tags); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id, isEditing]);

  const addTag = () => {
    const label = newTagText.trim();
    if (!label) return;
    setTags((ts) => [...ts, { label, emoji: selectedEmoji }]);
    setNewTagText('');
  };

  const removeTag = (index) => {
    setTags((ts) => ts.filter((_, i) => i !== index));
  };

  const save = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give this tag set a name, e.g. "Construction Calls".');
      return;
    }
    if (tags.length === 0) {
      setError('Add at least one tag before saving.');
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), tags };
      const { template } = isEditing
        ? await api.updateTagTemplate(id, payload)
        : await api.createTagTemplate(payload);

      if (location.state?.returnTo) {
        navigate(location.state.returnTo, {
          state: { ...(location.state.returnState || {}), tags: template.tags, tagTemplateId: template.id, tagSetName: template.name },
        });
      } else {
        navigate('/employer/tag-sets');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (<><StatusBar /><div className="screen"><TopHeader title="Tag Set" onBack={() => navigate(-1)} /><div className="muted small">Loading…</div></div></>);
  }

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title={isEditing ? 'Edit Tag Set' : 'New Tag Set'} onBack={() => navigate(-1)} />

        <ErrorBanner message={error} />

        <div className="field">
          <label>Tag Set Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Construction Calls, Healthcare Calls, IT Roles" />
        </div>

        <div className="mb-24">
          <div className="muted xs bold mb-8">TAGS IN THIS SET</div>
          {tags.length === 0 ? (
            <div className="card muted small">No tags yet — add some below.</div>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {tags.map((t, i) => (
                <div key={`${t.label}-${i}`} className="row-between card" style={{ padding: '10px 14px' }}>
                  <span className="small">{t.emoji} {t.label}</span>
                  <button className="link xs" style={{ color: 'var(--red)' }} onClick={() => removeTag(i)}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card mb-24">
          <div className="muted xs bold mb-8">ADD TAG</div>
          <div className="muted xs mb-8">Choose an emoji</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
            {EMOJI_CHOICES.map((e) => (
              <button
                key={e}
                onClick={() => setSelectedEmoji(e)}
                style={{
                  width: 36, height: 36, fontSize: 18, borderRadius: 8, cursor: 'pointer',
                  border: e === selectedEmoji ? '2px solid var(--navy)' : '2px solid var(--grey-200)',
                  background: e === selectedEmoji ? 'rgba(30,58,138,0.08)' : 'var(--white)',
                }}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="field-with-btn" style={{ marginBottom: 0 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <input
                value={newTagText}
                onChange={(e) => setNewTagText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="Tag name, e.g. Permanent Resident"
              />
            </div>
            <button className="btn btn-outline btn-sm" style={{ width: 'auto', flexShrink: 0 }} onClick={addTag}>
              Add Tag
            </button>
          </div>
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save Tag Set'}
        </button>
      </div>
    </>
  );
}
