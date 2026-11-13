// Het kleine symbool voor de beschikbaarheid van een speler (spec B2/B3): een Badge met een kort
// woord ("Gesch. GW12", "Twijfel", "1 kaart"), met de volledige uitleg als tooltip en voor
// schermlezers. Rood (--danger) voor geschorst, oranje (--warning) voor twijfel, risico en één kaart
// van een schorsing. Geeft niets terug als er niets te melden is.
import Badge from './Badge';
import { useI18n } from '../i18nContext';
import { useAvailability } from '../availabilityContext';

export function AvailabilityBadge({ status, className = '' }) {
  const { t } = useI18n();
  if (!status) return null;
  const title = t(status.titleKey, status.vars);
  return (
    <Badge tone={status.tone} title={title} role="img" aria-label={title} className={`ui-avail ${className}`}>
      {t(status.labelKey, status.vars)}
    </Badge>
  );
}

export default function AvailabilityMark({ name, clubCode, className }) {
  const status = useAvailability(name, clubCode);
  return <AvailabilityBadge status={status} className={className} />;
}

// Compacte vorm voor plaatsen waar geen woord past (op het shirt in de Team Planner): een klein vierkant
// in dezelfde kleur, met een kaartje voor een schorsing of één kaart en een "?" voor twijfel/risico. De
// uitleg staat in de tooltip en voor schermlezers.
const MINI_GLYPH = { suspended: '', oneCard: '', doubt: '?', risk: '?', notFound: '!' };

export function AvailabilityMini({ status, className = '' }) {
  const { t } = useI18n();
  if (!status) return null;
  const title = t(status.titleKey, status.vars);
  return (
    <span className={`ui-avail-mini is-${status.tone} is-${status.kind} ${className}`} role="img" aria-label={title} title={title}>
      {MINI_GLYPH[status.kind]}
    </span>
  );
}
