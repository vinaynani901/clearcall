import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, ErrorBanner } from '../components/Shared';

// Step 3 (screen 3 of the wizard): name the campaign. Only reachable once
// a file has been uploaded and mapped.
export default function NameCampaign() {
  const location = useLocation();
  const navigate = useNavigate();
  const { fileName, headers, rows, mapping } = location.state || {};
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!headers || !rows || !mapping) navigate('/employer/campaigns', { replace: true });
  }, [headers, rows, mapping, navigate]);

  if (!headers || !rows || !mapping) return null;

  const goContinue = () => {
    if (!name.trim()) {
      setError('Give this campaign a name, e.g. the role you are hiring for.');
      return;
    }
    navigate('/employer/campaigns/select-tag-set', { state: { fileName, headers, rows, mapping, name: name.trim() } });
  };

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Name This Campaign" onBack={() => navigate('/employer/campaigns/map-columns', { state: location.state })} />

        <ErrorBanner message={error} />

        <div className="field">
          <label>What would you like to name this campaign?</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Software Developer August 2026"
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') goContinue(); }}
          />
        </div>

        <button className="btn btn-primary" onClick={goContinue}>Continue</button>
      </div>
    </>
  );
}
