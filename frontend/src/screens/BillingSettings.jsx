import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { StatusBar, TopHeader, EmployerBottomNav, ErrorBanner } from '../components/Shared';
import { api } from '../api/client';

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function monthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
}

// Employer-facing view of monthly_invoices (Part 9) — read-only history of
// each month's base plan charge, included calls used, extra calls/members
// and their charges, and the total due. Rows only exist once a month has
// actually closed and the billing scheduler has generated its summary
// (services/billingScheduler.js), so a brand-new account with no closed
// months yet will simply show an empty state rather than a fabricated row.
export default function BillingSettings() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getMyInvoices().then((d) => setInvoices(d.invoices || [])).catch((err) => setError(err.message));
  }, []);

  return (
    <>
      <StatusBar />
      <div className="screen" style={{ flex: 1 }}>
        <TopHeader title="Billing" onBack={() => navigate('/settings')} />
        <ErrorBanner message={error} />

        {invoices === null ? (
          <div className="card muted small">Loading…</div>
        ) : invoices.length === 0 ? (
          <div className="card muted small">
            No billing summaries yet. Your first monthly summary appears here once your current billing month closes.
          </div>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {invoices.map((inv) => (
              <div key={inv.id} className="card">
                <div className="row-between mb-8">
                  <span className="bold">{monthLabel(inv.month)}</span>
                  <span className="bold" style={{ fontSize: 18 }}>{formatMoney(inv.total_due)}</span>
                </div>
                <div className="stack" style={{ gap: 6 }}>
                  <div className="row-between small">
                    <span className="muted">Base plan charge ({inv.plan_name})</span>
                    <span>{formatMoney(inv.base_plan_charge)}</span>
                  </div>
                  <div className="row-between small">
                    <span className="muted">Verified calls used</span>
                    <span>{inv.included_calls_used}{inv.included_calls_limit ? ` / ${inv.included_calls_limit}` : ''}</span>
                  </div>
                  {inv.extra_calls_count > 0 && (
                    <div className="row-between small">
                      <span className="muted">Extra calls ({inv.extra_calls_count})</span>
                      <span style={{ color: '#b45309' }}>+{formatMoney(inv.extra_calls_charge)}</span>
                    </div>
                  )}
                  {inv.extra_members_count > 0 && (
                    <div className="row-between small">
                      <span className="muted">Extra members ({inv.extra_members_count})</span>
                      <span style={{ color: '#b45309' }}>+{formatMoney(inv.extra_members_charge)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <EmployerBottomNav active="settings" />
    </>
  );
}
