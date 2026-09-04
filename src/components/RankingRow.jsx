// Eén rij in een spelersrangschikking — zelfde visuele opbouw als de "Beste fixture runs"-lijst in
// FDRTab.jsx (rangnummer, clublogo, naam + subtekst, waarde rechts), hier als gedeeld component zodat elke
// sheet-gevoede rangschikkingstab (Bonuspunten, Kaarten, en toekomstige tabs) er hetzelfde uitziet i.p.v.
// deze opmaak in elke tab-module te herhalen.
import { AlertTriangle } from 'lucide-react';

// `qualifies` kleurt de waarde turquoise (haalt een criterium/drempel) of gedempt lavendel (haalt het
// niet) — de lijst zelf toont altijd alle rijen, ongeacht of ze het criterium halen. `warning` toont een
// klein, subtiel driehoekje vóór de waarde (bv. "nog 1 kaart tot schorsing") — bewust enkel dat icoontje,
// geen felrode rij of opdringerige styling. `onClick`, indien meegegeven, maakt de hele rij aanklikbaar
// (bv. Bonuspunten se zoekfunctie: klik een rij in de top 15 om diens volledige spelerskaart te tonen,
// zelfde als via de zoekbalk) — de rij rendert dan als <button> i.p.v. <div> voor toetsenbord-
// toegankelijkheid, maar blijft er verder identiek uit zien. Zonder onClick (KaartenTab) verandert er niets.
// `valueSub`, indien meegegeven, toont een klein gedempt regeltje ONDER de hoofdwaarde (bv.
// "0.45/wedstrijd" in Bonuspunten) — bewust klein/gedempt, geen aparte kolom, zodat het de hoofdwaarde
// niet beconcurreert.
export function RankingRow({ rank, clubCode, player, subtitle, value, valueSub, qualifies, warning, onClick }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      style={{
        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px',
        width: onClick ? '100%' : undefined, textAlign: onClick ? 'left' : undefined,
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
    </Wrapper>
  );
}
