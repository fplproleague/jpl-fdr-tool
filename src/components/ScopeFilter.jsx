// Filter "op wie sla ik deze ranglijst toe": iedereen, enkel mijn eigen ploeg, of enkel mijn watchlist.
//
// Staat op Bonuspunten en Kaarten, de twee tabs met lange ranglijsten over álle spelers van de
// competitie. Die lijsten beantwoorden "wie zijn de beste" prima, maar niet de vraag die je als
// manager eigenlijk stelt: "hoe doen mijn spelers het?" — en daarvoor moest je tot nu toe zelf door
// honderden rijen scrollen en namen herkennen.
//
// Eén gedeeld component i.p.v. per tab: de twee tabs zouden anders gegarandeerd uit elkaar lopen in
// labels, volgorde en gedrag bij een lege selectie.
//
// Bewust GEEN opgeslagen voorkeur (localStorage): een filter dat je bij een volgend bezoek stil nog
// aanstaat, laat een halve lijst zien zonder dat je weet waarom. Elke sessie begint op "iedereen".

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

export default function ScopeFilter({ t, scope, onChange }) {
  return (
    <div
      role="group"
      aria-label={t('scopeFilter.label')}
      style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}
    >
      {SCOPES.map(key => {
        const isSelected = scope === key;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={isSelected}
            className="fdr-hit-44"
            style={{
              background: isSelected ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.04)',
              border: isSelected ? '1px solid #4ECDC4' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '8px 14px', cursor: 'pointer',
              color: isSelected ? '#4ECDC4' : '#C9B8E0', fontWeight: 700, fontSize: '12px',
              fontFamily: 'inherit',
            }}
          >
            {t(`scopeFilter.${key}`)}
          </button>
        );
      })}
    </div>
  );
}

// Uitleg bij een ranglijst die door het filter leeg valt. Onderscheidt bewust twee gevallen: je hebt
// nog geen team/watchlist (dan is de oplossing "stel er een samen"), of je hebt er wel een maar geen
// van die spelers haalt deze lijst (dan is er niets mis en hoef je niets te doen).
export function ScopeEmptyMessage({ t, scope, hasAny }) {
  if (scope === 'all') return null;
  const sleutel = hasAny ? `scopeFilter.emptyNoMatch.${scope}` : `scopeFilter.emptySource.${scope}`;
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px', padding: '16px',
    }}>
      <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>{t(sleutel)}</p>
    </div>
  );
}
