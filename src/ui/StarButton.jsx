// Watchlist-ster (spec §8): ☆ = op de watchlist zetten, ★ (accent) = staat erop; nog eens tikken
// haalt de speler er weer af (met de bestaande undo-toast in FDRTool.jsx).
import { Star } from 'lucide-react';
import './StarButton.css';

export default function StarButton({ active, onClick, addLabel, removeLabel, className = '' }) {
  const label = active ? removeLabel : addLabel;
  return (
    <button
      type="button"
      className={`ui-star${active ? ' is-active' : ''} ${className}`}
      aria-pressed={active}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Star aria-hidden="true" strokeWidth={1.75} />
    </button>
  );
}
