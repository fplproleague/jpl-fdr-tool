// Lege toestand (spec §5.11): één zin + hooguit één actie, links uitgelijnd. Geen icoon.
import './States.css';

export default function EmptyState({ children, action }) {
  return (
    <div className="ui-empty" role="status">
      <p>{children}</p>
      {action}
    </div>
  );
}
