// Eén rij in een spelersrangschikking — zelfde visuele opbouw als de "Beste fixture runs"-lijst in
// FDRTab.jsx (rangnummer, clublogo, naam + subtekst, waarde rechts), hier als gedeeld component zodat elke
// sheet-gevoede rangschikkingstab (Bonuspunten, Kaarten, en toekomstige tabs) er hetzelfde uitziet i.p.v.
// deze opmaak in elke tab-module te herhalen.
import { AlertTriangle, Star } from 'lucide-react';

// `qualifies` kleurt de waarde turquoise (haalt een criterium/drempel) of gedempt lavendel (haalt het
// niet) — de lijst zelf toont altijd alle rijen, ongeacht of ze het criterium halen. `warning` toont een
// klein, subtiel driehoekje vóór de waarde (bv. "nog 1 kaart tot schorsing") — bewust enkel dat icoontje,
// geen felrode rij of opdringerige styling. `onClick`, indien meegegeven, maakt de rij aanklikbaar
// (bv. Bonuspunten zijn zoekfunctie: klik een rij in de top 15 om diens volledige spelerskaart te tonen,
// zelfde als via de zoekbalk). `valueSub`, indien meegegeven, toont een klein gedempt regeltje ONDER de
// hoofdwaarde (bv. "0.45/wedstrijd" in Bonuspunten) — bewust klein/gedempt, geen aparte kolom, zodat het
// de hoofdwaarde niet beconcurreert.
//
// `onToggleWatch`/`isWatched` zetten een ster rechts naast de waarde. Die moest een eigen <button> zijn,
// en een knop in een knop mag niet — vandaar dat de rij nu een <div> is met daarin twee knoppen naast
// elkaar i.p.v. één knop rond alles. De opdeling van de padding houdt het resultaat visueel identiek:
// de buitenste div draagt kader en achtergrond zonder padding, en elke knop draagt zijn eigen stuk
// binnenmarge, zodat het aanklikbare gebied de volledige rijhoogte blijft beslaan.
// `watchLabel` is de voorgekauwde aria-tekst (zelfde afspraak als postponedText in MiniFixtureBadge:
// gedeelde componenten krijgen vertaalde tekst binnen, ze roepen zelf geen t() aan).
// De drie ster-props horen bij elkaar en worden identiek berekend in elke rangschikkingstab, dus
// staan ze hier i.p.v. in Bonuspunten én Kaarten apart. Geeft {} terug als de tab geen watch-list-
// handlers meekreeg, zodat de rij dan gewoon geen ster toont.
export function watchProps({ name, teamCode }, { isPlayerWatched, toggleWatchlistPlayer, t }) {
  if (!toggleWatchlistPlayer || !isPlayerWatched) return {};
  const watched = isPlayerWatched(name, teamCode);
  return {
    isWatched: watched,
    onToggleWatch: () => toggleWatchlistPlayer({ name, teamCode }),
    watchLabel: t(watched ? 'watchlist.removeAria' : 'watchlist.addAria', { name }),
  };
}

export function RankingRow({
  rank, clubCode, player, subtitle, value, valueSub, qualifies, warning,
  onClick, onToggleWatch, isWatched, watchLabel,
}) {
  const Main = onClick ? 'button' : 'div';
  const interactive = Boolean(onClick || onToggleWatch);
  return (
    <div
      // Enkel een rij waar iets te doen valt krijgt de hover-/actief-stijl (zie .fdr-ranking-row in
      // FDRTool.jsx): een rij die nergens heen leidt mag ook niet doen alsof.
      className={interactive ? 'fdr-ranking-row' : undefined}
      style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px', display: 'flex', alignItems: 'center',
      }}
    >
      <Main
        type={onClick ? 'button' : undefined}
        onClick={onClick}
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px', background: 'none', border: 'none',
          textAlign: onClick ? 'left' : undefined,
          fontFamily: onClick ? 'inherit' : undefined, cursor: onClick ? 'pointer' : undefined,
        }}
      >
        <span className="fdr-title" style={{
          color: rank === 1 ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '18px', width: '22px', flexShrink: 0,
        }}>
          {rank}
        </span>
        {clubCode && (
          <img
            src={`/club-logos/${clubCode}.webp`}
            alt=""
            style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            color: '#FFF', fontWeight: 700, fontSize: '14px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {player}
          </div>
          {subtitle && <div style={{ color: '#8F79AD', fontSize: '11px', marginTop: '1px' }}>{subtitle}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0 }}>
          {warning && <AlertTriangle size={13} color="#E8C547" aria-hidden="true" />}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{
              color: qualifies ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '16px', textAlign: 'right',
            }}>
              {value}
            </span>
            {valueSub && (
              <span style={{ color: '#8F79AD', fontSize: '10px', fontWeight: 500, lineHeight: 1.3 }}>
                {valueSub}
              </span>
            )}
          </div>
        </div>
      </Main>
      {onToggleWatch && (
        <button
          type="button"
          onClick={onToggleWatch}
          aria-label={watchLabel}
          aria-pressed={Boolean(isWatched)}
          title={watchLabel}
          className="fdr-touch-target"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            alignSelf: 'stretch', minWidth: '44px', padding: '0 12px 0 2px',
            background: 'none', border: 'none', cursor: 'pointer',
            color: isWatched ? '#4ECDC4' : '#8F79AD',
          }}
        >
          {/* Gevuld = staat op de watchlist, omlijnd = niet. Het verschil zit dus niet alleen in de
              kleur, wat het ook zonder kleurwaarneming leesbaar houdt. */}
          <Star size={17} fill={isWatched ? '#4ECDC4' : 'none'} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
