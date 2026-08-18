import { useEffect, useState } from 'react';
import { adminApi } from '../api/adminClient';
import { AdminSidePanel, AdminErrorBanner } from './AdminUI';
import { formatDate } from '../../utils/date';

// Renders the pilot before/after impact report and lets the admin save it
// as a PDF via the browser's native print dialog (Save as PDF) — no PDF
// library dependency needed. The `.admin-print-report` styling below (in
// admin.css) makes this look like a clean document when printed.
export default function PilotReportView({ companyId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminApi.getPilotReport(companyId).then(setData).catch((err) => setError(err.message));
  }, [companyId]);

  const answerRateDiff = data ? data.after.answerRate - data.before.answerRate : 0;
  const volumeDiff = data ? data.after.callVolume - data.before.callVolume : 0;

  return (
    <AdminSidePanel title="Pilot Impact Report" onClose={onClose} wide>
      <AdminErrorBanner message={error} />
      {!data ? 'Loading…' : (
        <>
          <div className="admin-row" style={{ justifyContent: 'flex-end', marginBottom: 16 }}>
            <button className="admin-btn admin-btn-primary" onClick={() => window.print()}>Download PDF</button>
          </div>

          <div className="admin-print-report">
            <div className="report-header">
              <div className="report-logo">ClearCall</div>
              <div className="report-title">Pilot Program Impact Report</div>
              <div className="report-sub">{data.company.name}{data.company.industry ? ` · ${data.company.industry}` : ''}</div>
              <div className="report-sub">
                Pilot period: {formatDate(data.pilotStartDate)} – {formatDate(data.pilotEndDate)}
              </div>
            </div>

            <div className="report-section">
              <div className="report-section-title">Call Volume &amp; Answer Rate — Before vs. After</div>
              <table className="report-table">
                <thead>
                  <tr><th></th><th>Before Pilot</th><th>During Pilot</th><th>Change</th></tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Call Volume</td>
                    <td>{data.before.callVolume}</td>
                    <td>{data.after.callVolume}</td>
                    <td>{volumeDiff >= 0 ? '+' : ''}{volumeDiff}</td>
                  </tr>
                  <tr>
                    <td>Answer Rate</td>
                    <td>{data.before.answerRate}%</td>
                    <td>{data.after.answerRate}%</td>
                    <td>{answerRateDiff >= 0 ? '+' : ''}{answerRateDiff}%</td>
                  </tr>
                </tbody>
              </table>
              {data.before.notes && <p className="report-note">Baseline notes: {data.before.notes}</p>}
            </div>

            <div className="report-section">
              <div className="report-section-title">Call Outcome Breakdown (During Pilot)</div>
              <table className="report-table">
                <thead><tr><th>Outcome</th><th>Count</th></tr></thead>
                <tbody>
                  <tr><td>Answered</td><td>{data.after.outcomeBreakdown.answered}</td></tr>
                  <tr><td>Declined</td><td>{data.after.outcomeBreakdown.declined}</td></tr>
                  <tr><td>Missed</td><td>{data.after.outcomeBreakdown.missed}</td></tr>
                  <tr><td>In Progress / Uncompleted</td><td>{data.after.outcomeBreakdown.initiated}</td></tr>
                </tbody>
              </table>
            </div>

            <div className="report-section">
              <div className="report-section-title">Summary</div>
              <p className="report-summary">
                During the pilot, {data.company.name} made {data.after.callVolume} verified call{data.after.callVolume === 1 ? '' : 's'} through
                ClearCall with a {data.after.answerRate}% answer rate
                {data.before.callVolume || data.before.answerRate ? (
                  <> — {answerRateDiff >= 0 ? 'an increase of' : 'a change of'} {Math.abs(answerRateDiff)} percentage point{Math.abs(answerRateDiff) === 1 ? '' : 's'} compared to the {data.before.answerRate}% baseline reported before the pilot began</>
                ) : ' (no baseline answer rate was recorded before the pilot began)'}.
              </p>
            </div>
          </div>
        </>
      )}
    </AdminSidePanel>
  );
}
