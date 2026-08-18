import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { suggestMapping, looksLikeLink } from '../utils/columnMapping';
import { api } from '../api/client';

function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function humanDate(d) {
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

function makeEmptySlot(label, date, smsNote) {
  return {
    label,
    callDate: isoDate(date),
    dateLabel: humanDate(date),
    smsNote,
    fileName: null,
    headers: [],
    rows: [],
    mapping: { name: null, phone: null, jobRole: null },
    parseError: '',
  };
}

function buildSlots() {
  const today = new Date();
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const dayAfter = new Date(today); dayAfter.setDate(today.getDate() + 2);
  return [
    makeEmptySlot("Today's List", today, 'Calls can start immediately — no advance SMS is sent.'),
    makeEmptySlot("Tomorrow's List", tomorrow, 'An advance SMS is sent to every candidate tonight.'),
    makeEmptySlot('Day After’s List', dayAfter, `An advance SMS is sent the evening before (${humanDate(tomorrow)}).`),
  ];
}

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet([{ 'Candidate Name': '', 'Phone Number': '', 'Job Role': '' }]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Candidates');
  XLSX.writeFile(wb, 'ClearCall Candidate Template.xlsx');
}

function candidatesFromSlot(slot) {
  return slot.rows
    .map((row) => {
      const name = slot.mapping.name ? row[slot.mapping.name] : '';
      const phone = slot.mapping.phone ? row[slot.mapping.phone] : '';
      const jobRole = slot.mapping.jobRole ? row[slot.mapping.jobRole] : '';
      const extra = {};
      Object.keys(row).forEach((h) => {
        if (h !== slot.mapping.name && h !== slot.mapping.phone && h !== slot.mapping.jobRole) {
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

function firstSample(rows, header) {
  if (!header) return '';
  const row = rows.find((r) => r[header] !== '' && r[header] !== null && r[header] !== undefined);
  return row ? String(row[header]) : '';
}

function SlotCard({ slot, index, onFile, onMappingChange, onRemove }) {
  const candidateCount = slot.rows.length ? candidatesFromSlot(slot).length : 0;
  const nameSample = firstSample(slot.rows, slot.mapping.name);
  const nameLooksWrong = slot.mapping.name && looksLikeLink(nameSample);

  return (
    <div className="card mb-16">
      <div className="row-between mb-8">
        <div>
          <div className="bold" style={{ fontSize: 15 }}>{slot.label}</div>
          <div className="muted xs">{slot.dateLabel}</div>
        </div>
        {slot.fileName && (
          <button className="link xs" onClick={() => onRemove(index)}>Remove</button>
        )}
      </div>
      <div className="hint-text mb-8">{slot.smsNote}</div>

      {!slot.fileName ? (
        <label className="btn btn-outline btn-sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>
          Choose File (.xlsx, .xls, .csv)
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files[0] && onFile(index, e.target.files[0])}
          />
        </label>
      ) : (
        <>
          <div className="muted small mb-8">{slot.fileName} — {slot.rows.length} row{slot.rows.length === 1 ? '' : 's'} detected</div>

          {slot.parseError ? (
            <ErrorBanner message={slot.parseError} />
          ) : (
            <>
              <div className="stack" style={{ gap: 10 }}>
                {[
                  ['name', 'Candidate Name *'],
                  ['phone', 'Phone Number *'],
                  ['jobRole', 'Job Role (optional)'],
                ].map(([field, label]) => {
                  const sample = firstSample(slot.rows, slot.mapping[field]);
                  return (
                    <div className="field" key={field} style={{ marginBottom: 0 }}>
                      <label>{label}</label>
                      <select
                        value={slot.mapping[field] || ''}
                        onChange={(e) => onMappingChange(index, field, e.target.value)}
                      >
                        <option value="">— Not in file —</option>
                        {slot.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      {sample && (
                        <div className="hint-text" style={{ marginTop: 4 }}>
                          e.g. "{sample.length > 50 ? `${sample.slice(0, 50)}…` : sample}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {nameLooksWrong && (
                <div style={{ marginTop: 10 }}>
                  <ErrorBanner message="This column appears to contain links or URLs not names. Please select the correct name column." />
                </div>
              )}
              <div className="hint-text" style={{ marginTop: 10 }}>
                {candidateCount} candidate{candidateCount === 1 ? '' : 's'} ready to import from this list.
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function NewCampaign() {
  const navigate = useNavigate();
  const location = useLocation();
  const selectedTags = location.state?.tags || null;
  const selectedTagTemplateId = location.state?.tagTemplateId || null;
  const selectedTagSetName = location.state?.tagSetName || null;

  const [name, setName] = useState('');
  const [slots, setSlots] = useState(buildSlots);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const updateSlot = (index, patch) => {
    setSlots((s) => s.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)));
  };

  const handleFile = async (index, file) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (rows.length === 0) {
        updateSlot(index, { fileName: file.name, headers: [], rows: [], parseError: 'This file has no rows we could read.' });
        return;
      }
      const headers = Object.keys(rows[0]);
      const mapping = suggestMapping(headers, rows);
      updateSlot(index, { fileName: file.name, headers, rows, mapping, parseError: '' });
    } catch (err) {
      updateSlot(index, { fileName: file.name, headers: [], rows: [], parseError: 'Could not read this file. Make sure it is a valid Excel or CSV file.' });
    }
  };

  const handleMappingChange = (index, field, value) => {
    setSlots((s) => s.map((slot, i) => (i === index ? { ...slot, mapping: { ...slot.mapping, [field]: value || null } } : slot)));
  };

  const handleRemove = (index) => {
    setSlots((s) => s.map((slot, i) => (i === index
      ? { ...slot, fileName: null, headers: [], rows: [], mapping: { name: null, phone: null, jobRole: null }, parseError: '' }
      : slot)));
  };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) {
      setError('Give this campaign a name, e.g. the role you are hiring for.');
      return;
    }

    const activeSlots = slots.filter((s) => s.fileName && !s.parseError);
    if (activeSlots.length === 0) {
      setError('Upload at least one candidate list to continue.');
      return;
    }

    const batches = [];
    for (const slot of activeSlots) {
      if (!slot.mapping.name || !slot.mapping.phone) {
        setError(`Map both Candidate Name and Phone Number for ${slot.label} before continuing.`);
        return;
      }
      const candidates = candidatesFromSlot(slot);
      if (candidates.some((c) => looksLikeLink(c.name))) {
        setError(`This column appears to contain links or URLs not names. Please select the correct name column for ${slot.label}.`);
        return;
      }
      if (candidates.length === 0) {
        setError(`${slot.label} has no rows with both a name and a phone number.`);
        return;
      }
      batches.push({ callDate: slot.callDate, candidates });
    }

    setSubmitting(true);
    try {
      const data = await api.createCampaign({
        name: name.trim(),
        batches,
        tags: selectedTags || undefined,
        tagTemplateId: selectedTagTemplateId || undefined,
      });
      navigate('/success', {
        state: {
          message: `"${data.campaign.name}" is ready — ${batches.reduce((n, b) => n + b.candidates.length, 0)} candidates imported.`,
          continueTo: '/employer/campaigns',
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="New Campaign" onBack={() => navigate('/employer/campaigns')} />

        <ErrorBanner message={error} />

        <div className="field">
          <label>Campaign name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Software Developer — August" />
        </div>

        <div className="card mb-16">
          <div className="row-between">
            <div>
              <div className="muted xs bold">QUICK TAGS FOR THIS CAMPAIGN</div>
              <div className="bold small" style={{ marginTop: 2 }}>
                {selectedTagSetName || (selectedTags ? `${selectedTags.length} custom tags` : 'Default tag set')}
              </div>
            </div>
            <button className="link small" onClick={() => navigate('/employer/campaigns/select-tag-set')}>Change</button>
          </div>
        </div>

        <div className="center mb-16">
          <button className="link small" onClick={downloadTemplate}>Download a blank template</button>
        </div>

        {slots.map((slot, i) => (
          <SlotCard
            key={slot.label}
            slot={slot}
            index={i}
            onFile={handleFile}
            onMappingChange={handleMappingChange}
            onRemove={handleRemove}
          />
        ))}

        <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Creating campaign…' : 'Create Campaign'}
        </button>
      </div>
    </>
  );
}
