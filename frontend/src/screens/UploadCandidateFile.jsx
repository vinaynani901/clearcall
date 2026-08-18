import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';

// Step 1 of campaign creation. This screen does exactly one thing: get a
// file from the recruiter and hand its parsed contents to the column
// mapping step. It must never show tag selection, campaign naming, or
// anything else — those only happen after a file has been read here.
export default function UploadCandidateFile() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);

  const processFile = async (file) => {
    setError('');
    setReading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      if (rows.length === 0) {
        setError('This file has no rows we could read. Please check the file and try again.');
        setReading(false);
        return;
      }
      const headers = Object.keys(rows[0]);
      navigate('/employer/campaigns/map-columns', { state: { fileName: file.name, headers, rows } });
    } catch (err) {
      setError('Could not read this file. Make sure it is a valid Excel or CSV file.');
      setReading(false);
    }
  };

  const handleFiles = (files) => {
    if (files && files[0]) processFile(files[0]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Upload Candidate List" onBack={() => navigate('/employer/campaigns')} />

        <ErrorBanner message={error} />

        <div
          className={`upload-dropzone ${dragActive ? 'drag-active' : ''}`}
          onClick={() => !reading && inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div className="bold" style={{ fontSize: 16, marginBottom: 6 }}>
            {reading ? 'Reading your file…' : 'Drag and drop your Excel or CSV file here or tap to browse'}
          </div>
          <div className="muted small">Accepts xlsx, xls, and csv files</div>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        <button className="btn btn-grey" style={{ marginTop: 20 }} onClick={() => navigate('/employer/campaigns')}>
          Cancel
        </button>
      </div>
    </>
  );
}
