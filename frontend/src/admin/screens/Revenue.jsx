import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '../api/adminClient';
import AdminTable from '../components/AdminTable';
import { AdminStatCard, AdminBadge, AdminErrorBanner } from '../components/AdminUI';
import { formatDate } from '../../utils/date';

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'failed', label: 'Failed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function formatMoney(n) {
  return `$${Number(n || 0).toLocaleString('en-AU')}`;
}

function TrendChart({ trend }) {
  if (!trend || trend.length === 0) return null;
  const max = Math.max(1, ...trend.map((t) => t.mrr));
  return (
    <div className="admin-revenue-chart">
      {trend.map((t) => (
        <div key={t.month} className="admin-revenue-bar-col">
          <div className="admin-revenue-bar-track">
            <div
              className="admin-revenue-bar"
              style={{ height: `${Math.max(3, Math.round((t.mrr / max) * 100))}%` }}
              title={`${t.label}: ${formatMoney(t.mrr)}`}
            />
          </div>
          <div className="admin-revenue-bar-value">{t.mrr > 0 ? formatMoney(t.mrr) : ''}</div>
          <div className="admin-revenue-bar-label">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function previousMonthKey() {
  const d = new Date();
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`;
}

// Section 9 — Monthly Billing Summaries: base plan charge, included calls
// used, extra calls + charge, extra members + charge, total due per
// company per month. Rows are generated automatically at month end by the
// billing scheduler; "Generate Now" just runs that same pass on demand
// (e.g. to demo the feature without waiting for a real month boundary) —
// it never overwrites an invoice that already exists for a company+month.
function BillingSummaries() {
  const [month, setMonth] = useState(previousMonthKey());
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const load = () => {
    setLoading(true);
    adminApi.listInvoices(month).then((d) => setInvoices(d.invoices || [])).catch((err) => setError(err.message)).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [month]);

  const generate = async () => {
    setGenerating(true);
    setError('');
    setResult(null);
    try {
      const res = await adminApi.generateInvoices(month);
      setResult(res);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const totalDue = invoices.reduce((sum, i) => sum + (i.total_due || 0), 0);

  const columns = [
    { key: 'company_name', label: 'Company', sortable: true },
    { key: 'plan_name', label: 'Plan', sortable: true },
    { key: 'base_plan_charge', label: 'Base Charge', sortable: true, render: (i) => formatMoney(i.base_plan_charge) },
    { key: 'included_calls_used', label: 'Calls Used', sortable: true, render: (i) => `${i.included_calls_used}${i.included_calls_limit ? ` / ${i.included_calls_limit}` : ''}` },
    { key: 'extra_calls_count', label: 'Extra Calls', sortable: true, render: (i) => i.extra_calls_count > 0 ? <AdminBadge tone="orange">{i.extra_calls_count} (+{formatMoney(i.extra_calls_charge)})</AdminBadge> : '—' },
    { key: 'extra_members_count', label: 'Extra Members', sortable: true, render: (i) => i.extra_members_count > 0 ? <AdminBadge tone="orange">{i.extra_members_count} (+{formatMoney(i.extra_members_charge)})</AdminBadge> : '—' },
    { key: 'total_due', label: 'Total Due', sortable: true, render: (i) => <span style={{ fontWeight: 800 }}>{formatMoney(i.total_due)}</span>, csv: (i) => i.total_due },
  ];

  return (
    <div className="admin-card" style={{ marginTop: 8 }}>
      <div className="admin-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div className="admin-detail-section-title" style={{ margin: 0 }}>MONTHLY BILLING SUMMARIES</div>
        <div className="admin-row" style={{ gap: 10 }}>
          <input
            type="month" value={month} max={thisMonthKey()}
            onChange={(e) => setMonth(e.target.value)}
            style={{ padding: '7px 10px', border: '1.5px solid #e2e8f0', borderRadius: 8, fontSize: 13 }}
          />
          <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={generating} onClick={generate}>
            {generating ? 'Generating…' : 'Generate Now'}
          </button>
        </div>
      </div>
      <AdminErrorBanner message={error} />
      {result && <div style={{ background: '#eff6ff', color: '#1d4ed8', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14 }}>Checked {result.checked} companies — generated {result.generated} new invoice(s) for {result.month}.</div>}
      {!loading && invoices.length > 0 && (
        <div className="muted" style={{ fontSize: 12.5, marginBottom: 10 }}>Total due across {invoices.length} compan{invoices.length === 1 ? 'y' : 'ies'}: <strong>{formatMoney(totalDue)}</strong></div>
      )}
      <AdminTable
        columns={columns}
        rows={invoices}
        csvFilename={`billing-summary-${month}.csv`}
        emptyMessage={loading ? 'Loading…' : `No billing summary generated for ${month} yet.`}
      />
    </div>
  );
}

export default function Revenue() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    adminApi.revenue().then(setData).catch((err) => setError(err.message));
  }, []);

  const filteredCompanies = useMemo(() => {
    if (!data) return [];
    if (statusFilter === 'all') return data.payingCompanies;
    return data.payingCompanies.filter((c) => (c.paymentStatus || 'active') === statusFilter);
  }, [data, statusFilter]);

  const columns = [
    { key: 'name', label: 'Company Name', sortable: true },
    { key: 'planLabel', label: 'Plan', sortable: true },
    { key: 'monthlyFee', label: 'Monthly Fee', sortable: true, render: (c) => formatMoney(c.monthlyFee), csv: (c) => c.monthlyFee },
    { key: 'nextBillingDate', label: 'Next Billing (est.)', sortable: true, render: (c) => c.nextBillingDate ? formatDate(c.nextBillingDate) : '—' },
    {
      key: 'paymentStatus',
      label: 'Payment Status',
      sortable: true,
      render: (c) => {
        const tone = c.paymentStatus === 'failed' ? 'red' : c.paymentStatus === 'cancelled' ? 'grey' : 'green';
        return <AdminBadge tone={tone}>{c.paymentStatus}</AdminBadge>;
      },
      csv: (c) => c.paymentStatus,
    },
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <div className="admin-page-title">Revenue</div>
          <div className="admin-page-subtitle">Estimated from current plan pricing — no live billing system is connected yet.</div>
        </div>
      </div>

      <AdminErrorBanner message={error} />

      <div className="admin-stats-grid">
        <AdminStatCard label="Current MRR" value={data ? formatMoney(data.mrr) : '—'} />
        <AdminStatCard label="New Revenue (This Month)" value={data ? formatMoney(data.newRevenueThisMonth) : '—'} tone="green" />
        <AdminStatCard label="Churned Revenue (This Month)" value={data ? formatMoney(data.churnedRevenueThisMonth) : '—'} tone={data?.churnedRevenueThisMonth > 0 ? 'red' : undefined} />
        <AdminStatCard
          label="Net New MRR (This Month)"
          value={data ? `${data.netNewMrrThisMonth >= 0 ? '+' : '-'}${formatMoney(Math.abs(data.netNewMrrThisMonth))}` : '—'}
          tone={data && data.netNewMrrThisMonth < 0 ? 'red' : data && data.netNewMrrThisMonth > 0 ? 'green' : undefined}
        />
      </div>

      <div className="admin-card">
        <div className="admin-detail-section-title" style={{ marginBottom: 14 }}>12-MONTH MRR TREND</div>
        {data ? <TrendChart trend={data.trend} /> : <div className="admin-table-empty">Loading…</div>}
      </div>

      <div className="admin-card">
        <div className="admin-detail-section-title" style={{ marginBottom: 14 }}>PLAN BREAKDOWN</div>
        {!data || data.breakdown.length === 0 ? (
          <div className="admin-table-empty">No companies yet.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Companies</th>
                <th>MRR</th>
              </tr>
            </thead>
            <tbody>
              {data.breakdown.map((b) => (
                <tr key={b.plan}>
                  <td>{b.label}</td>
                  <td>{b.count}</td>
                  <td>{formatMoney(b.mrr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginTop: 8, marginBottom: 4 }}>
        <div className="admin-tabs">
          {STATUS_TABS.map((t) => (
            <button key={t.key} className={`admin-tab ${statusFilter === t.key ? 'active' : ''}`} onClick={() => setStatusFilter(t.key)}>{t.label}</button>
          ))}
        </div>
      </div>

      <AdminTable
        columns={columns}
        rows={filteredCompanies}
        csvFilename="paying-companies.csv"
        emptyMessage="No paying companies match this filter."
      />

      <BillingSummaries />
    </div>
  );
}
