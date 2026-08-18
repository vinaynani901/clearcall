import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';
import { suggestMapping, looksLikeLink } from '../utils/columnMapping';

function firstSample(rows, header) {
  if (!header) return '';
  const row = rows.find((r) => r[header] !== '' && r[header] !== null && r[header] !== undefined);
  return row ? String(row[header]) : '';
}

// Step 2 (screen 2 of the wizard): the recruiter confirms which column is
// which. Every other column in the file is imported automatically as extra
// data — this screen only ever asks about name/phone/job role.
export default function MapCandidateColumns() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fileName, headers, rows } = location.state || {};

  const [mapping, setMapping] = useState(() => (headers ? suggestMapping(headers, rows) : { name: null, phone: null, jobRole: null }));
  const [error, setError] = useState('');

  // Guard: this screen only makes sense right after a successful upload.
  // Reaching it any other way (refresh, back button, direct link) sends
  // the recruiter back to the campaigns list rather than showing a broken
  // mapping screen with nothing to map.
  useEffect(() => {
    if (!headers || !rows) navigate('/employer/campaigns', { replace: true });
  }, [headers, rows, navigate]);

  if (!headers || !rows) return null;

  const nameSample = firstSample(rows, mapping.name);
  const nameLooksWrong = mapping.name && looksLikeLink(nameSample);

  const confirmAndImport = () => {
    setError('');
    if (!mapping.name || !mapping.phone) {
      setError('Map both Candidate Name and Phone Number before continuing.');
      return;
    }
    if (nameLooksWrong) {
      setError('This column appears to contain links or URLs not names. Please select the correct name column.');
      return;
    }
    navigate('/employer/campaigns/name', { state: { fileName, headers, rows, mapping } });
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Map Your Columns" onBack={() => navigate('/employer/campaigns/upload')} />

        <ErrorBanner message={error} />

        <div className="muted small mb-16">
          {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'} detected. Confirm which column is which — everything else is imported automatically as extra data.
        </div>

        <div className="stack" style={{ gap: 10 }}>
          {[
            ['name', 'Candidate Name *'],
            ['phone', 'Phone Number *'],
            ['jobRole', 'Job Role (optional)'],
          ].map(([field, label]) => {
            const sample = firstSample(rows, mapping[field]);
            return (
              <div className="field" key={field}>
                <label>{label}</label>
                <select
                  value={mapping[field] || ''}
                  onChange={(e) => setMapping((m) => ({ ...m, [field]: e.target.value || null }))}
                >
                  <option value="">— Not in file —</option>
                  {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
                {sample && (
                  <div className="muted xs" style={{ marginTop: 4 }}>
                    e.g. "{sample.length > 50 ? `${sample.slice(0, 50)}…` : sample}"
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {nameLooksWrong && (
          <div style={{ marginTop: 4 }}>
            <ErrorBanner message="This column appears to contain links or URLs not names. Please select the correct name column." />
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 20 }} onClick={confirmAndImport}>
          Confirm and Import
        </button>
      </div>
    </>
  );
}
