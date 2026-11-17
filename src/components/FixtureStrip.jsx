// Een rij MiniFixtures met boven elk blokje de speeldag waar het bij hoort. Zonder dat label is een
// fixture-rij niet te lezen: je ziet wel de tegenstanders, maar niet vanaf welke speeldag ze lopen.
//
// `scrollable` zet de rij in een eigen horizontale scrollzone. Nodig zodra er meer blokjes zijn dan er
// naast elkaar passen ("Beste fixture runs" met acht speeldagen): anders wordt de hele pagina breder dan
// het scherm. Waar het aantal vastligt en past (de spelerskaart toont er vijf), wrapt de rij gewoon.
import { MiniFixtureBadge } from './MiniFixtureBadge';
import './FixtureStrip.css';

export function FixtureStrip({
  teamCode, fixtures, startGw, ratings, homeAdvantage, gwLabel,
  className = '', style, scrollable = false,
}) {
  if (!fixtures || fixtures.length === 0) return null;
  const rij = (
    <div className={`ui-fstrip${scrollable ? ' is-scroll' : ''} ${className}`} style={scrollable ? undefined : style}>
      {fixtures.map((fixture, i) => (
        <span key={i} className="ui-fstrip__item">
          {/* aria-hidden: het blokje eronder draagt de speeldag al in zijn eigen naam. */}
          <span className="ui-fstrip__gw" aria-hidden="true">{gwLabel}{startGw + i}</span>
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
  return <div className="ui-fstrip-scroll" style={style}>{rij}</div>;
}
