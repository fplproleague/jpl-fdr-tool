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

// `scrollable` zet de rij in een eigen horizontale scrollzone, zoals de FDR- en vergelijk-tabel dat al
// doen. Nodig zodra er meer badges zijn dan er naast elkaar passen: zonder dat duwt de rij haar kaart
// breder dan het scherm, en dan scrolt de hele PAGINA opzij i.p.v. dat ene blok. Gemeten op 390px was
// dat precies wat er gebeurde bij "Beste fixture runs" met acht speeldagen: de rij werd 464px, de kaart
// 494px en de pagina 514px.
//
// Waar het aantal badges vastligt en past (de watchlist en de speler-/clubkaart tonen er vijf), blijft
// de rij een gewone, wrappende flex-rij.
export function FixtureStrip({
  teamCode, fixtures, startGw, ratings, homeAdvantage, gwLabel,
  className = 'fdr-mini-fixture-row', style, scrollable = false,
}) {
  if (!fixtures || fixtures.length === 0) return null;
  const rij = (
    <div
      className={className}
      style={{
        display: 'flex', gap: '4px', alignItems: 'flex-start',
        // nowrap in een scrollzone: wrappen zou de rij twee regels hoog maken én toch nog scrollen.
        flexWrap: scrollable ? 'nowrap' : 'wrap',
        // Bij overflow moet de eerste badge tegen de linkerrand blijven staan; centreren zou het begin
        // van de reeks buiten bereik duwen.
        justifyContent: scrollable ? 'flex-start' : undefined,
        width: scrollable ? 'max-content' : undefined,
        ...(scrollable ? {} : style),
      }}
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
  if (!scrollable) return rij;
  return (
    <div className="fdr-fixture-scroll" style={{ overflowX: 'auto', ...style }}>
      {rij}
    </div>
  );
}
