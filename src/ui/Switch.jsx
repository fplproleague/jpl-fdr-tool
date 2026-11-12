// Aan/uit-schakelaar met zichtbaar label (spec §5.4-familie). De hele knop (label + schakelaar) is
// het aanraakdoel.
import './Switch.css';

export default function Switch({ checked, onChange, label, ariaLabel, className = '' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      className={`ui-switch ${className}`}
    >
      {label && <span className="ui-switch__label">{label}</span>}
      <span className="ui-switch__track" aria-hidden="true"><span className="ui-switch__knob" /></span>
    </button>
  );
}
