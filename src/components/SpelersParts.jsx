// Kleine bouwstenen die zowel de Spelers-tab, de vergelijking als de spelers-popup gebruiken: foto,
// vorm-sparkline en de rij met komende tegenstanders (met de FDR-kleuren van de FDR-tab).
import { memo } from 'react';
import { FIXTURES, GW_COUNT } from '../constants';
import { MiniFixtureBadge } from './MiniFixtureBadge';

export const PlayerPhoto = memo(function PlayerPhoto({ player, size = 28 }) {
  const initials = (player.short || player.name || '?')
    .split(/\s+/).map(s => s[0]).join('').slice(0, 2).toUpperCase();
  const box = {
    width: `${size}px`, height: `${size}px`, borderRadius: '50%', flexShrink: 0,
    background: 'rgba(255,255,255,0.08)', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  };
  if (!player.photo) {
    return (
      <span aria-hidden="true" style={{ ...box, color: '#C9B8E0', fontSize: `${Math.round(size * 0.38)}px`, fontWeight: 800 }}>
        {initials}
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={box}>
      <img
        src={player.photo}
        alt=""
        loading="lazy"
        decoding="async"
        width={size}
        height={size}
        style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
      />
    </span>
  );
});

// Punten per speeldag als mini-staafjes. Niet gespeeld = een klein grijs streepje (geen staaf van 0,
// want "0 punten gespeeld" en "niet gespeeld" zijn voor een manager twee heel verschillende dingen).
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
          return <rect key={s.gw} x={x} y={height - 2} width={barW} height={2} rx={1} fill="rgba(255,255,255,0.18)" />;
        }
        const h = Math.max(2, (Math.max(0, s.pts) / max) * (height - 1));
        const color = s.pts >= 8 ? '#4ECDC4' : s.pts >= 4 ? '#8FD9D3' : s.pts < 0 ? '#C2402C' : '#A794C2';
        return <rect key={s.gw} x={x} y={height - h} width={barW} height={h} rx={1} fill={color} />;
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
