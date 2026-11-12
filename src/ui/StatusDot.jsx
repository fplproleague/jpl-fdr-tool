// Startzekerheid als ronde stip (spec §3.3): de enige ronde vorm op de site. Zelfde betekenis als op
// de Verwachte XI's-tab: gevuld groen = zeker, open groen = starter, geel = twijfel, rood = risico.
import './StatusDot.css';

const LEVEL_CLASS = { darkgreen: 'is-sure', green: 'is-starter', orange: 'is-doubt', red: 'is-risk' };

export default function StatusDot({ level, label }) {
  return (
    <span
      className={`ui-dot ${LEVEL_CLASS[level] ?? 'is-starter'}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
