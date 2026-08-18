import { useEffect, useRef, useState } from 'react';
import { DotsVerticalIcon } from './Icons';

// Generic three-dot action menu used across the dashboard, campaigns list,
// campaign candidate list, and call history. `options` is an array of
// { label, onClick, danger? } — danger renders the label in red (used for
// destructive actions like "Remove from Queue" / "Delete Campaign").
// The popup floats directly below the trigger and closes on outside click.
export default function ThreeDotMenu({ options, align = 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        type="button"
        aria-label="More actions"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: 6,
          display: 'flex', borderRadius: 8,
        }}
        className="three-dot-trigger"
      >
        <DotsVerticalIcon />
      </button>
      {open && (
        <div
          className="three-dot-popup"
          style={align === 'right' ? { right: 0 } : { left: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {options.map((opt, i) => (
            <button
              key={i}
              className={`three-dot-item ${opt.danger ? 'danger' : ''}`}
              onClick={() => { setOpen(false); opt.onClick(); }}
              disabled={opt.disabled}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
