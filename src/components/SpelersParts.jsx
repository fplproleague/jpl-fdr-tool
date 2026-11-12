// Kleine bouwstenen die zowel de Spelers-tab, de vergelijking als de spelers-popup gebruiken: foto,
// vorm-sparkline en de rij met komende tegenstanders (met de FDR-kleuren van de FDR-tab).
import { memo } from 'react';
import { FIXTURES, GW_COUNT } from '../constants';
import { MiniFixtureBadge } from './MiniFixtureBadge';
import { PlayerFace } from '../ui/PlayerFace';

// Oude naam, blijft bestaan als alias: de foto komt sinds de rework uit ui/PlayerFace (vierkant, spec §5.7).
export const PlayerPhoto = memo(function PlayerPhoto({ player, size = 24 }) {
  return <PlayerFace player={player} size={size} />;
});

// Punten per speeldag als mini-staafjes. Niet gespeeld = een klein grijs streepje (geen staaf van 0,
// want "0 punten gespeeld" en "niet gespeeld" zijn voor een manager twee heel verschillende dingen).
// Spec §7.4: hoekige staafjes en geen accentkleur. Vorm is neutraal; enkel uitschieters springen eruit
// (8+ punten helder, 4-7 middel, 0-3 gedempt, negatief rood).
export const Sparkline = memo(function Sparkline({ spark, width = 64, height = 20, label }) {
  if (!spark?.length) return null;
  const max = Math.max(10, ...spark.map(s => s.pts ?? 0));
  const gap = 2;
  const barW = (width - gap * (spark.length - 1)) / spark.length;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} style={{ display: 'block' }}>
      {spark.map((s, i) => {
        const x = i * (barW + gap);
        if (s.pts == null) {
          return <rect key={s.gw} x={x} y={height - 2} width={barW} height={2} fill="var(--text-4)" />;
        }
        const h = Math.max(2, (Math.max(0, s.pts) / max) * (height - 1));
        const color = s.pts >= 8 ? 'var(--text-1)' : s.pts >= 4 ? 'var(--text-2)' : s.pts < 0 ? 'var(--danger)' : 'var(--text-3)';
        return <rect key={s.gw} x={x} y={height - h} width={barW} height={h} fill={color} />;
      })}
    </svg>
  );
});

// De komende `count` speeldagen van een club vanaf `fromGw`, met dezelfde kalender (inclusief
// uitgestelde wedstrijden en dubbele speeldagen) en dezelfde FDR-ratings als de FDR-tab.
export const UpcomingFixtures = memo(function UpcomingFixtures({ club, fromGw, count = 3, ratings, homeAdvantage, wrap = true }) {
  const fixtures = FIXTURES[club];
  if (!fixtures) return null;
  const gws = [];
  for (let gw = fromGw; gw < fromGw + count && gw <= GW_COUNT; gw++) gws.push(gw);
  return (
    <span style={{ display: 'inline-flex', gap: '4px', flexWrap: wrap ? 'wrap' : 'nowrap', alignItems: 'center' }}>
      {gws.map(gw => (
        <MiniFixtureBadge
          key={gw}
          teamCode={club}
          fixture={fixtures[gw - 1]}
          gwNumber={gw}
          ratings={ratings}
          homeAdvantage={homeAdvantage}
        />
      ))}
    </span>
  );
});

export function ClubLogo({ code, size = 18 }) {
  if (!code) return null;
  return (
    <img
      src={`/club-logos/${code}.webp`}
      alt=""
      width={size}
      height={size}
      style={{ width: `${size}px`, height: `${size}px`, objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}
