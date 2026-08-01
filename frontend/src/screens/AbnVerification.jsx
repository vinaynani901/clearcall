import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { StatusBar } from '../components/Shared';
import { CheckCircle, XCircle } from '../components/Icons';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function AbnVerification() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { company, setCompany } = useAuth();
  const companyId = state?.companyId || company?.id;
  const abn = state?.abn || company?.abn;
  const workProfileId = state?.workProfileId || null;

  const [status, setStatus] = useState('loading'); // loading | success | failure
  const [result, setResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!abn || !companyId) {
        setStatus('failure');
        setErrorMsg('Missing ABN details. Please start registration again.');
        return;
      }
      try {
        const data = await api.verifyAbn({ abn, companyId, workProfileId });
        if (cancelled) return;
        setResult(data);
        setStatus('success');
        setCompany((c) => (c ? { ...c, abn_verified: 1, name: data.companyName } : c));
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err.message);
        setStatus('failure');
      }
    }
    const t = setTimeout(run, 1200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [abn, companyId, setCompany]);

  return (
    <>
      <StatusBar />
      <div className="screen screen-centered" style={{ flex: 1 }}>
        {status === 'loading' && (
          <>
            <div className="spinner" style={{ marginBottom: 24 }} />
            <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 8 }}>Checking with Australian Business Register</div>
            <div className="muted small">Verifying ABN {abn}…</div>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle />
            <div style={{ fontWeight: 800, fontSize: 19, marginTop: 20, marginBottom: 6 }}>ABN Verified</div>
            <div className="card" style={{ width: '100%', textAlign: 'left', marginTop: 12, marginBottom: 24 }}>
              <div className="muted xs bold" style={{ marginBottom: 4 }}>OFFICIAL COMPANY NAME</div>
              <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12 }}>{result.companyName}</div>
              <div className="row-between small">
                <span className="muted">ABN Status</span>
                <span className="badge badge-green">{result.abnStatus}</span>
              </div>
              {result.newlyRegisteredWarning && (
                <div className="badge badge-amber" style={{ marginTop: 10 }}>{result.newlyRegisteredWarning}</div>
              )}
            </div>
            <button
              className="btn btn-primary"
              onClick={() => navigate(workProfileId ? '/employer/work-profiles' : '/verify/otp')}
            >
              Confirm and Continue
            </button>
          </>
        )}

        {status === 'failure' && (
          <>
            <XCircle />
            <div style={{ fontWeight: 800, fontSize: 19, marginTop: 20, marginBottom: 6 }}>Verification Failed</div>
            <div className="muted small" style={{ marginBottom: 24 }}>
              {errorMsg || 'ABN not found or cancelled — please check your number.'}
            </div>
            <button className="btn btn-outline" onClick={() => navigate(-1)}>Try Again</button>
          </>
        )}
      </div>
    </>
  );
}
