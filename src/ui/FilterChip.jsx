// Chip voor een actieve, verwijderbare filter (spec §5.5), bv. "Club: CLU ×".
import { X } from 'lucide-react';
import './Field.css';

export default function FilterChip({ label, onRemove, removeLabel }) {
  return (
    <span className="ui-chip">
      {label}
      <button type="button" className="ui-chip__x" onClick={onRemove} aria-label={removeLabel ?? label}>
        <X aria-hidden="true" strokeWidth={2} />
      </button>
    </span>
  );
}

export function FilterChips({ children }) {
  return <div className="ui-chips">{children}</div>;
}
