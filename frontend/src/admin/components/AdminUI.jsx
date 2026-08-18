// Small shared pieces reused across admin portals — kept in one file since
// each is tiny.

export function AdminStatCard({ label, value, sub, tone }) {
  return (
    <div className={`admin-stat-card ${tone ? `tone-${tone}` : ''}`}>
      <div className="admin-stat-label">{label}</div>
      <div className="admin-stat-value">{value}</div>
      {sub && <div className="admin-stat-sub">{sub}</div>}
    </div>
  );
}

export function AdminBadge({ tone = 'grey', children }) {
  return <span className={`admin-badge tone-${tone}`}>{children}</span>;
}

export function AdminSidePanel({ title, onClose, children, wide }) {
  return (
    <div className="admin-panel-backdrop" onClick={onClose}>
      <div className={`admin-side-panel ${wide ? 'wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div className="admin-side-panel-header">
          <div className="admin-side-panel-title">{title}</div>
          <button className="admin-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="admin-side-panel-body">{children}</div>
      </div>
    </div>
  );
}

export function AdminModal({ title, onClose, children, maxWidth = 460 }) {
  return (
    <div className="admin-panel-backdrop" onClick={onClose}>
      <div className="admin-modal" style={{ maxWidth }} onClick={(e) => e.stopPropagation()}>
        <div className="admin-side-panel-header">
          <div className="admin-side-panel-title">{title}</div>
          <button className="admin-panel-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="admin-modal-body">{children}</div>
      </div>
    </div>
  );
}

export function AdminConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, onConfirm, onCancel }) {
  return (
    <div className="admin-panel-backdrop" onClick={onCancel}>
      <div className="admin-modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div className="admin-modal-body">
          <div className="admin-confirm-title">{title}</div>
          <p className="admin-confirm-message">{message}</p>
          <div className="admin-row" style={{ gap: 10, justifyContent: 'flex-end' }}>
            <button className="admin-btn admin-btn-outline" onClick={onCancel}>Cancel</button>
            <button className={`admin-btn ${danger ? 'admin-btn-danger' : 'admin-btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AdminErrorBanner({ message }) {
  if (!message) return null;
  return <div className="admin-error-banner">{message}</div>;
}
