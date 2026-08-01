import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { StatusBar, TopHeader } from '../components/Shared';
import { api } from '../api/client';

export default function CompanyProfile() {
  const { id } = useParams();
  const [company, setCompany] = useState(null);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCompany(id).then((d) => { setCompany(d.company); setRoles(d.recentRoles || []); }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return (<><StatusBar /><div className="screen"><TopHeader title="Company Profile" /><div className="muted small">Loading…</div></div></>);
  if (!company) return (<><StatusBar /><div className="screen"><TopHeader title="Company Profile" /><div className="muted small">Company not found.</div></div></>);

  return (
    <>
      <StatusBar />
      <div className="screen">
        <TopHeader title="Company Profile" />

        <div className="screen-centered mb-24">
          <div style={{ width: 76, height: 76, borderRadius: 18, background: 'var(--grey-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 800, color: 'var(--navy)' }}>
            {company.name[0]}
          </div>
          <div style={{ fontWeight: 800, fontSize: 20, marginTop: 12 }}>{company.name}</div>
          <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 8 }}>
            {company.abn_verified ? <span className="badge badge-green">ABN Verified</span> : <span className="badge badge-grey">Unverified</span>}
            {company.linkedin_url && <span className="badge badge-blue">LinkedIn Verified</span>}
          </div>
        </div>

        <div className="card mb-16">
          <div className="row-between small mb-8"><span className="muted">Industry</span><span className="bold">{company.industry || '—'}</span></div>
          <div className="row-between small mb-8"><span className="muted">Location</span><span className="bold">{company.location || 'Australia'}</span></div>
          <div className="row-between small"><span className="muted">Employees</span><span className="bold">{company.employee_count || '—'}</span></div>
        </div>

        {company.description && (
          <div className="card mb-16">
            <div className="muted xs bold mb-8">ABOUT</div>
            <div className="small">{company.description}</div>
          </div>
        )}

        <div className="card">
          <div className="muted xs bold mb-8">RECENT ROLES HIRING FOR</div>
          {roles.length === 0 ? (
            <div className="muted small">No recent roles listed.</div>
          ) : (
            <div className="stack">
              {roles.map((r, i) => <div key={i} className="badge badge-blue" style={{ alignSelf: 'flex-start' }}>{r}</div>)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
