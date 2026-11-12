// Foutmelding (spec §5.11): 1px rode rand rondom, lichte rode achtergrond, "Opnieuw proberen" als
// secondary-knop. Geen gekleurde linkerstreep.
import { AlertCircle, RotateCcw } from 'lucide-react';
import Button from './Button';
import './States.css';

export default function ErrorBanner({ children, onRetry, retryLabel = 'Opnieuw proberen', role = 'alert' }) {
  return (
    <div className="ui-error" role={role}>
      <AlertCircle aria-hidden="true" strokeWidth={1.75} />
      <span className="ui-error__text">{children}</span>
      {onRetry && <Button variant="secondary" size="sm" icon={RotateCcw} onClick={onRetry}>{retryLabel}</Button>}
    </div>
  );
}

// Neutrale melding (bv. "toont de laatst bekende data"): geen kader, enkel een haarlijn eronder.
export function Notice({ children, action }) {
  return (
    <div className="ui-notice" role="status">
      <span style={{ flex: 1 }}>{children}</span>
      {action}
    </div>
  );
}
