import { ShieldCheck, PhoneIcon } from './Icons';

export default function CallTypeSheet({ onSelect, onClose }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row-between mb-16">
          <div style={{ fontWeight: 800, fontSize: 17 }}>Choose Call Type</div>
          <button className="back-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="stack">
          <div
            className="card"
            style={{ border: '2px solid var(--green)', cursor: 'pointer' }}
            onClick={() => onSelect('clearcall')}
          >
            <div className="row mb-8">
              <ShieldCheck size={32} color="#10b981" />
              <div style={{ fontWeight: 800, fontSize: 16 }}>ClearCall Verified Call</div>
            </div>
            <p className="muted small" style={{ margin: '0 0 12px' }}>
              The receiver will see your verified company details before answering.
            </p>
            <div className="stack" style={{ gap: 4 }}>
              <div className="row xs" style={{ color: 'var(--green-dark)', fontWeight: 700 }}>✓ Recommended for new contacts</div>
              <div className="row xs" style={{ color: 'var(--green-dark)', fontWeight: 700 }}>✓ Best for professional calls</div>
            </div>
          </div>

          <div
            className="card"
            style={{ border: '2px solid var(--grey-200)', cursor: 'pointer' }}
            onClick={() => onSelect('normal')}
          >
            <div className="row mb-8">
              <PhoneIcon size={28} color="#64748b" />
              <div style={{ fontWeight: 800, fontSize: 16 }}>Normal Call</div>
            </div>
            <p className="muted small" style={{ margin: '0 0 12px' }}>
              Standard call — receiver sees the masked number only.
            </p>
            <div className="stack" style={{ gap: 4 }}>
              <div className="row xs muted" style={{ fontWeight: 700 }}>✓ For candidates you already know</div>
              <div className="row xs muted" style={{ fontWeight: 700 }}>✓ Quick follow up calls</div>
            </div>
          </div>
        </div>

        <div className="center muted xs" style={{ marginTop: 16 }}>You can change your default in settings.</div>
      </div>
    </div>
  );
}
