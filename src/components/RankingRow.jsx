// Eén rij in een spelersrangschikking — zelfde visuele opbouw als de "Beste fixture runs"-lijst in
// FDRTab.jsx (rangnummer, clublogo, naam + subtekst, waarde rechts), hier als gedeeld component zodat elke
// sheet-gevoede rangschikkingstab (Bonuspunten, Kaarten, en toekomstige tabs) er hetzelfde uitziet i.p.v.
// deze opmaak in elke tab-module te herhalen.
import { AlertTriangle } from 'lucide-react';

// `qualifies` kleurt de waarde turquoise (haalt een criterium/drempel) of gedempt lavendel (haalt het
// niet) — de lijst zelf toont altijd alle rijen, ongeacht of ze het criterium halen. `warning` toont een
// klein, subtiel driehoekje vóór de waarde (bv. "nog 1 kaart tot schorsing") — bewust enkel dat icoontje,
// geen felrode rij of opdringerige styling.
export function RankingRow({ rank, clubCode, player, subtitle, value, qualifies, warning }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <span className="fdr-title" style={{
        color: rank === 1 ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '18px', width: '22px', flexShrink: 0,
      }}>
        {rank}
      </span>
      {clubCode && (
        <img
          src={`/club-logos/${clubCode}.png`}
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
        <span style={{
          color: qualifies ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '16px', textAlign: 'right',
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}
