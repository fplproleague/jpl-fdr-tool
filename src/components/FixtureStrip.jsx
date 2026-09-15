// Een rij fixture-badges met boven elke badge de speeldag waar hij bij hoort.
//
// Zonder dat label is een fixture-balk niet te lezen: je ziet wel drie tegenstanders, maar niet vanaf
// welke speeldag ze lopen — en dat verschilt per plek (de watchlist begint bij de komende GW, "Beste
// fixture runs" bij de zelfgekozen range). Vandaar één gedeeld component in plaats van vier keer een
// losse flex-rij, zodat geen enkele fixture-balk het label kan missen.
//
// Het label is bewust klein en gedempt: het mag de badge niet beconcurreren. Door lineHeight 1 en een
// gap van 2px kost het maar ~10px extra hoogte, en de badges zelf houden exact hun oude breedte — de
// verhoudingen van de omliggende kaartjes blijven dus intact.
import { MiniFixtureBadge } from './MiniFixtureBadge';

export function FixtureStrip({
  teamCode, fixtures, startGw, ratings, homeAdvantage, gwLabel,
  className = 'fdr-mini-fixture-row', style,
}) {
  if (!fixtures || fixtures.length === 0) return null;
  return (
    <div
      className={className}
      style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start', ...style }}
    >
      {fixtures.map((fixture, i) => (
        <span key={i} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          {/* aria-hidden: de badge eronder draagt de speeldag al in zijn eigen toegankelijke naam, dus
              voorlezen zou het dubbel maken. */}
          <span aria-hidden="true" style={{
            color: '#6B5289', fontSize: '8px', fontWeight: 800, letterSpacing: '0.04em', lineHeight: 1,
          }}>
            {gwLabel}{startGw + i}
          </span>
          <MiniFixtureBadge
            teamCode={teamCode}
            fixture={fixture}
            gwNumber={startGw + i}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
          />
        </span>
      ))}
    </div>
  );
}
