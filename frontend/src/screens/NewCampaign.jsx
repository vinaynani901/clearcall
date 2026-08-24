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
    makeEmptySlot('Day After\u2019s List', dayAfter, `An advance SMS is sent the evening before (${humanDate(tomorrow)}).`),
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

// Route / driver ID column detection
const ROUTE_ID_HEADERS = ['route', 'route id', 'route_id', 'driver', 'driver id', 'driver_id', 'recruiter', 'recruiter id', 'recruiter_id'];

function detectRouteId(headers, rows) {
  const headerLower = headers.map((h) => h.toLowerCase().trim());
  for (const candidate of ROUTE_ID_HEADERS) {
    const idx = headerLower.indexOf(candidate);
    if (idx !== -1) {
      const value = rows.length > 0 ? String(rows[0][headers[idx]] || '').trim() : '';
      return { header: headers[idx], value };
    }
  }
  return { header: null, value: null };
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
                          e.g. &quot;{sample.length > 50 ? `${sample.slice(0, 50)}…` : sample}&quot;
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
  const [campaignType, setCampaignType] = useState('recruitment');
  const [slots, setSlots] = useState(buildSlots);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Batch upload state
  const [batchFiles, setBatchFiles] = useState([]);
  const [assigning, setAssigning] = useState(false);

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

  // Handle multiple file uploads
  const handleBatchFiles = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    const newFiles = [];
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        const mapping = rows.length > 0 ? suggestMapping(headers, rows) : { name: null, phone: null, jobRole: null };
        const routeInfo = detectRouteId(headers, rows);
        const candidateCount = rows.length > 0 && mapping.name && mapping.phone
          ? rows.filter((r) => r[mapping.name] && r[mapping.phone]).length
          : rows.length;

        newFiles.push({
          id: `${file.name}-${Date.now()}`,
          fileName: file.name,
          headers,
          rows,
          mapping,
          routeId: routeInfo.value,
          routeHeader: routeInfo.header,
          candidateCount,
          parseError: rows.length === 0 ? 'This file has no rows we could read.' : '',
          skipped: false,
        });
      } catch (err) {
        newFiles.push({
          id: `${file.name}-${Date.now()}`,
          fileName: file.name,
          headers: [],
          rows: [],
          mapping: { name: null, phone: null, jobRole: null },
          routeId: null,
          routeHeader: null,
          candidateCount: 0,
          parseError: 'Could not read this file. Make sure it is a valid Excel or CSV file.',
          skipped: false,
        });
      }
    }

    // Detect conflicts
    const routeCounts = {};
    for (const f of newFiles) {
      if (f.routeId) {
        routeCounts[f.routeId] = (routeCounts[f.routeId] || 0) + 1;
      }
    }

    const withConflict = newFiles.map((f) => ({
      ...f,
      conflict: f.routeId ? (routeCounts[f.routeId] || 0) > 1 : false,
    }));

    setBatchFiles((prev) => [...prev, ...withConflict]);
  };

  const hasConflicts = batchFiles.some((f) => f.conflict && !f.skipped);
  const hasActiveFiles = batchFiles.some((f) => !f.skipped && !f.parseError);

  const handleSkipFile = (id) => {
    setBatchFiles((prev) => prev.map((f) => (f.id === id ? { ...f, skipped: true } : f)));
  };

  const handleRemoveFile = (id) => {
    setBatchFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleBulkAssign = async () => {
    setError('');
    setAssigning(true);
    try {
      const active = batchFiles.filter((f) => !f.skipped && !f.parseError && !f.conflict);
      for (const file of active) {
        if (!file.mapping.name || !file.mapping.phone) {
          setError(`Map columns for ${file.fileName} before assigning.`);
          setAssigning(false);
          return;
        }
        const candidates = file.rows
          .filter((r) => r[file.mapping.name] && r[file.mapping.phone])
          .map((r) => ({
            name: String(r[file.mapping.name] || '').trim(),
            phone: String(r[file.mapping.phone] || '').trim(),
            jobRole: file.mapping.jobRole && r[file.mapping.jobRole] ? String(r[file.mapping.jobRole]).trim() : null,
            extra: {},
          }));
        if (candidates.length === 0) continue;

        const today = new Date();
        const data = await api.createCampaign({
          name: `${name.trim()} - ${file.fileName.replace(/\.[^.]+$/, '')}`,
          batches: [{ callDate: isoDate(today), candidates }],
          campaignType,
          routeId: file.routeId,
          tags: selectedTags || undefined,
          tagTemplateId: selectedTagTemplateId || undefined,
        });
      }
      navigate('/success', {
        state: {
          message: `Campaigns created successfully.`,
          continueTo: '/employer/campaigns',
        },
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setAssigning(false);
    }
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
        campaignType,
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

        <div className="mb-16">
          <label className="bold mb-8" style={{ display: 'block', fontSize: 13 }}>Campaign Type</label>
          <div className="row" style={{ gap: 12 }}>
            <div
              className={`card ${campaignType === 'recruitment' ? 'card-selected' : ''}`}
              style={{ flex: 1, cursor: 'pointer', padding: 16, textAlign: 'center', border: campaignType === 'recruitment' ? '2px solid var(--primary)' : '2px solid transparent' }}
              onClick={() => setCampaignType('recruitment')}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>💼</div>
              <div className="bold" style={{ fontSize: 14 }}>Recruitment Campaign</div>
              <div className="muted xs" style={{ marginTop: 4 }}>For calling job candidates</div>
            </div>
            <div
              className={`card ${campaignType === 'delivery' ? 'card-selected' : ''}`}
              style={{ flex: 1, cursor: 'pointer', padding: 16, textAlign: 'center', border: campaignType === 'delivery' ? '2px solid var(--primary)' : '2px solid transparent' }}
              onClick={() => setCampaignType('delivery')}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>🚚</div>
              <div className="bold" style={{ fontSize: 14 }}>Delivery Campaign</div>
              <div className="muted xs" style={{ marginTop: 4 }}>For calling delivery customers</div>
            </div>
          </div>
        </div>

        {/* Batch Upload — Multi-file with Route ID detection */}
        <div className="card mb-16" style={{ border: '2px dashed var(--primary)', background: '#f8faff' }}>
          <div className="bold mb-8" style={{ fontSize: 14 }}>📁 Batch Upload — Multiple Files</div>
          <div className="hint-text mb-8">Upload multiple candidate files at once. Files with a Route ID, Driver ID, or Recruiter column will be auto-detected.</div>
          <label className="btn btn-primary btn-sm" style={{ display: 'inline-flex', cursor: 'pointer' }}>
            Select Files (.xlsx, .xls, .csv)
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              style={{ display: 'none' }}
              onChange={handleBatchFiles}
            />
          </label>

          {batchFiles.length > 0 && (
            <>
              <div className="table-wrapper" style={{ marginTop: 16, overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--grey-200)' }}>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>File Name</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Detected Route / Driver ID</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Candidates</th>
                      <th style={{ padding: '8px 6px', textAlign: 'left' }}>Status</th>
                      <th style={{ padding: '8px 6px', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batchFiles.filter((f) => !f.skipped).map((f) => (
                      <tr key={f.id} style={{ borderBottom: '1px solid var(--grey-100)', background: f.conflict ? '#fff8e6' : 'transparent' }}>
                        <td style={{ padding: '8px 6px' }}>{f.fileName}</td>
                        <td style={{ padding: '8px 6px' }}>
                          {f.routeId ? (
                            <span className="badge badge-blue xs">{f.routeHeader}: {f.routeId}</span>
                          ) : (
                            <span className="muted xs">Not detected</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px' }}>{f.parseError ? <span className="badge badge-red xs">Error</span> : `${f.candidateCount} candidates`}</td>
                        <td style={{ padding: '8px 6px' }}>
                          {f.parseError ? (
                            <span className="badge badge-red xs">Parse Error</span>
                          ) : f.conflict ? (
                            <span className="badge badge-orange xs">Conflict</span>
                          ) : (
                            <span className="badge badge-green xs">Ready</span>
                          )}
                        </td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                          <button className="link xs" onClick={() => handleSkipFile(f.id)} style={{ marginRight: 8 }}>Skip</button>
                          <button className="link xs" onClick={() => handleRemoveFile(f.id)}>Remove</button>
                        </td>
                      </tr>
                    ))}
                    {batchFiles.filter((f) => f.skipped).length > 0 && (
                      <tr>
                        <td colSpan={5} style={{ padding: '8px 6px' }}>
                          <div className="muted xs">{batchFiles.filter((f) => f.skipped).length} file(s) skipped</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {hasConflicts && (
                <div className="card" style={{ marginTop: 12, padding: 12, background: '#fff3cd', border: '1px solid #ffc107' }}>
                  <div className="bold" style={{ color: '#856404' }}>⚠️ Duplicate route detected — please review before assigning</div>
                  <div className="xs" style={{ color: '#856404', marginTop: 4 }}>Each route ID can only be assigned once. Use Skip on conflicting files to resolve.</div>
                </div>
              )}

              <div className="row" style={{ marginTop: 16, gap: 8 }}>
                <button
                  className="btn btn-primary"
                  onClick={handleBulkAssign}
                  disabled={!hasActiveFiles || hasConflicts || assigning}
                >
                  {assigning ? 'Assigning…' : 'Assign All'}
                </button>
                <button className="btn btn-outline" onClick={() => setBatchFiles([])}>Clear All</button>
              </div>
            </>
          )}
        </div>

        {/* Quick Tags selector */}
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

        {/* Single upload slots */}
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