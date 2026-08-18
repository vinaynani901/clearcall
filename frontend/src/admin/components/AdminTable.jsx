import { useMemo, useState } from 'react';

const PAGE_SIZE = 25;

function toCsvValue(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, columns, rows) {
  const header = columns.map((c) => toCsvValue(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => toCsvValue(c.csv ? c.csv(row) : (c.sortValue ? c.sortValue(row) : row[c.key]))).join(',')).join('\n');
  const csv = `${header}\n${body}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Shared table used across every admin portal — click-to-sort headers,
// 25-row pagination with next/prev, and an Export to CSV button, so none
// of the individual portal screens have to reimplement this.
//
// columns: [{ key, label, sortable, sortValue?(row), render?(row), csv?(row) }]
export default function AdminTable({ columns, rows, csvFilename = 'export.csv', emptyMessage = 'Nothing to show yet.', rowKey = (r) => r.id }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const [page, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    const getValue = col?.sortValue || ((r) => r[sortKey]);
    return [...rows].sort((a, b) => {
      const av = getValue(a);
      const bv = getValue(b);
      if (av === bv) return 0;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages - 1);
  const pageRows = sorted.slice(clampedPage * PAGE_SIZE, clampedPage * PAGE_SIZE + PAGE_SIZE);

  const onHeaderClick = (col) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      setSortDir('asc');
    }
    setPage(0);
  };

  return (
    <div className="admin-table-wrap">
      <div className="admin-table-toolbar">
        <div className="admin-table-count">{sorted.length} result{sorted.length === 1 ? '' : 's'}</div>
        <button className="admin-btn admin-btn-outline admin-btn-sm" onClick={() => downloadCsv(csvFilename, columns, sorted)}>
          Export to CSV
        </button>
      </div>

      <div className="admin-table-scroll">
        <table className="admin-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.sortable ? 'sortable' : ''}
                  onClick={() => onHeaderClick(col)}
                >
                  {col.label}
                  {col.sortable && sortKey === col.key && <span className="admin-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={rowKey(row)}>
                {columns.map((col) => (
                  <td key={col.key}>{col.render ? col.render(row) : row[col.key]}</td>
                ))}
              </tr>
            ))}
            {pageRows.length === 0 && (
              <tr><td colSpan={columns.length} className="admin-table-empty">{emptyMessage}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="admin-table-pagination">
          <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={clampedPage === 0} onClick={() => setPage(clampedPage - 1)}>Previous</button>
          <span className="admin-pagination-label">Page {clampedPage + 1} of {totalPages}</span>
          <button className="admin-btn admin-btn-outline admin-btn-sm" disabled={clampedPage >= totalPages - 1} onClick={() => setPage(clampedPage + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}
