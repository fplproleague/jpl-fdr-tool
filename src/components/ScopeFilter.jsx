// Filter "op wie sla ik deze ranglijst toe": iedereen, enkel mijn eigen ploeg, of enkel mijn watchlist.
//
// Staat op Spelers, Bonuspunten en Kaarten, de tabs met lange lijsten over álle spelers van de
// competitie. Die lijsten beantwoorden "wie zijn de beste" prima, maar niet de vraag die je als manager
// eigenlijk stelt: "hoe doen mijn spelers het?".
//
// Sinds de rework (spec §7.5) een dunne laag rond `Segmented`: één gedeeld component, zodat de tabs
// niet uit elkaar lopen in labels, volgorde en gedrag bij een lege selectie.
//
// Bewust GEEN opgeslagen voorkeur (localStorage): een filter dat je bij een volgend bezoek stil nog
// aanstaat, laat een halve lijst zien zonder dat je weet waarom. Elke sessie begint op "iedereen".
import Segmented from '../ui/Segmented';
import EmptyState from '../ui/EmptyState';

export const SCOPES = ['all', 'myTeam', 'watchlist'];

// Geeft een predicaat (naam, clubcode) terug dat zegt of een rij binnen de gekozen scope valt. Het
// doet zelf geen vergelijking: het leent de twee predicaten die FDRTool.jsx al beheert — isPlayerWatched
// (de watchlist) en isPlayerInMyTeam (de Team Planner-selectie op de huidige speeldag). Zo blijft er
// één bron van waarheid per lijst, en kan dit component nooit een eigen, afwijkend idee krijgen van
// wat "in mijn team" betekent.
export function makeScopeMatcher(scope, { isPlayerWatched, isPlayerInMyTeam }) {
  if (scope === 'watchlist') return (name, clubCode) => !!isPlayerWatched?.(name, clubCode);
  if (scope === 'myTeam') return (name, clubCode) => !!isPlayerInMyTeam?.(name, clubCode);
  return () => true;
}

export default function ScopeFilter({ t, scope, onChange, className = '' }) {
  return (
    <Segmented
      className={className}
      ariaLabel={t('scopeFilter.label')}
      value={scope}
      onChange={onChange}
      options={SCOPES.map(key => ({ value: key, label: t(`scopeFilter.${key}`) }))}
    />
  );
}

// Uitleg bij een ranglijst die door het filter leeg valt. Onderscheidt bewust twee gevallen: je hebt
// nog geen team/watchlist (dan is de oplossing "stel er een samen"), of je hebt er wel een maar geen
// van die spelers haalt deze lijst (dan is er niets mis en hoef je niets te doen).
export function ScopeEmptyMessage({ t, scope, hasAny }) {
  if (scope === 'all') return null;
  const sleutel = hasAny ? `scopeFilter.emptyNoMatch.${scope}` : `scopeFilter.emptySource.${scope}`;
  return <EmptyState>{t(sleutel)}</EmptyState>;
}
