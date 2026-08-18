import { useEffect, useRef, useState } from 'react';

export default function AdminThreeDotMenu({ options, align = 'right' }) {
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
        className="admin-three-dot-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
      >
        ⋮
      </button>
      {open && (
        <div className="admin-three-dot-popup" style={align === 'right' ? { right: 0 } : { left: 0 }} onClick={(e) => e.stopPropagation()}>
          {options.map((opt, i) => (
            <button
              key={i}
              className={`admin-three-dot-item ${opt.danger ? 'danger' : ''}`}
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
