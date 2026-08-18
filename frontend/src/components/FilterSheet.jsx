import { CrossIcon } from './Icons';

/**
 * Shared filter panel — renders as a small dropdown anchored under the
 * trigger button on desktop (existing behaviour, just now properly
 * boundary-contained + click-outside-to-close), and as a native-feeling
 * bottom sheet on mobile (<768px): slides up from the bottom, dark overlay
 * behind it, drag handle + heading + close button, full device width, never
 * cut off or overlapping content. Both are driven by the same markup —
 * index.css switches the presentation entirely via @media (max-width:767px)
 * on .filter-panel / .filter-sheet-backdrop, see the "Filter sheet" block
 * there for the mechanics.
 *
 * Must be rendered inside a `position: relative` wrapper (`.filter-panel-wrap`)
 * next to the trigger button — desktop positions the dropdown relative to
 * that wrapper; mobile's position:fixed ignores it entirely and always
 * pins to the viewport, so the same markup works for both without a resize
 * listener or JS breakpoint detection.
 */
export default function FilterSheet({ open, onClose, onClear, title = 'Filters', children }) {
  if (!open) return null;

  return (
    <>
      <div className="filter-sheet-backdrop" onClick={onClose} />
      <div className="filter-panel" onClick={(e) => e.stopPropagation()}>
        <div className="filter-sheet-handle" />
        <div className="filter-sheet-header">
          <span className="bold">{title}</span>
          <button type="button" className="filter-sheet-close" onClick={onClose} aria-label="Close filters">
            <CrossIcon size={16} color="#64748b" />
          </button>
        </div>

        <div className="filter-sheet-body">{children}</div>

        <div className="filter-sheet-actions">
          <button type="button" className="link small" onClick={onClear}>Clear Filters</button>
          <button type="button" className="btn btn-primary btn-sm filter-sheet-apply" onClick={onClose}>Apply Filters</button>
        </div>
      </div>
    </>
  );
}
