// Publieke, volledig read-only weergave van de 18 voorspelde basiselven (één per club) — presentational
// component zonder gedeelde/aanpasbare state vanuit FDRTool.jsx (enkel lokale UI-state voor "welke club
// is geselecteerd"). Hergebruikt PitchField/PitchSlot rechtstreeks uit de privé Predicted XI Builder
// (../predicted-xi/) via hun readOnly-prop, zodat de visuele stijl (veld, kaartjes, kleuren, header)
// gegarandeerd exact dezelfde is als de privé-tool — geen duplicatie, geen risico op visuele drift.
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { TEAMS, CURRENT_GW, PREDICTED_LINEUPS_GW } from '../constants';
import { COLORS } from '../theme';
import { FORMATIONS } from '../predicted-xi/formations';
import PitchField from '../predicted-xi/PitchField';
import { SAFETY_STYLE } from '../predicted-xi/theme';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';

const noop = () => {};

// Legt uit wat de kaartrand-kleur op elke kaart betekent (zie SAFETY_STYLE in theme.js voor de
// kleurwaarden zelf — hier enkel de korte, publieksvriendelijke labels, bewust anders/beknopter dan de
// interne titels op de safety-badge in de privé-tool, die daar als hover-tooltip dienen i.p.v. een
// permanent zichtbare legende).
const SAFETY_LEGEND = [
  { level: 'darkgreen', label: 'Zekerheid' },
  { level: 'green', label: 'Starter' },
  { level: 'orange', label: 'Twijfel' },
  { level: 'red', label: 'Risico' },
];

// Filtert lineups zonder één enkele geplaatste speler eruit (bv. een club die nog niet af is) — zo
// verschijnt zo'n club nooit als een lege, verwarrende kaart in de kiezer, ook niet als
// predictedLineupsData.js per ongeluk een halfafgewerkte entry bevat.
const readyLineups = PREDICTED_LINEUPS.filter(l => l.slots.some(s => s.positionId !== '_unassigned' && s.playerName));

// De opstellingen zijn verouderd zodra de speeldag waarvoor ze gemaakt zijn achterloopt op de
// gameweek die nu aan de beurt is. Beide waarden komen uit constants.js (PREDICTED_LINEUPS_GW wordt
// handmatig bijgewerkt samen met de data; CURRENT_GW wordt afgeleid uit de echte deadlines), zodat
// deze check niet stilzwijgend kan verlopen zoals de vroeger hardgecodeerde tekst "GW2".
const isStale = PREDICTED_LINEUPS_GW < CURRENT_GW;

// Waarschuwingsbanner bovenaan de tab zodra de opstellingen van een vorige speeldag zijn. Bewust
// prominent en niet weg te klikken: verouderde team-info is voor een fantasymanager schadelijker dan
// géén team-info, want ze ziet er precies hetzelfde uit als actuele info.
function StaleWarning() {
  if (!isStale) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '16px',
        background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.45)',
        borderRadius: '10px', padding: '12px 14px',
      }}
    >
      <AlertTriangle size={18} color={COLORS.warning} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
      <p style={{ margin: 0, color: COLORS.warning, fontSize: '13px', lineHeight: 1.55, fontWeight: 700 }}>
        Let op: dit zijn de opstellingen van GW{PREDICTED_LINEUPS_GW}, niet van de komende GW{CURRENT_GW}.
      </p>
    </div>
  );
}

export default function PredictedLineupsTab() {
  const availableClubCodes = [...new Set(readyLineups.map(l => l.clubCode))];
  const [selectedClubCode, setSelectedClubCode] = useState(availableClubCodes[0] ?? '');

  if (readyLineups.length === 0) {
    return (
      <>
        <StaleWarning />
        <p style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '16px' }}>
          Voorspelde opstellingen voor GW{PREDICTED_LINEUPS_GW}, samengesteld door @5YSiebee.
        </p>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: COLORS.textBody, fontSize: '13px', margin: 0 }}>
            Nog geen voorspelde lineups beschikbaar — kom binnenkort terug.
          </p>
        </div>
      </>
    );
  }

  const lineup = readyLineups.find(l => l.clubCode === selectedClubCode) ?? readyLineups[0];
  const club = TEAMS.find(t => t.code === lineup.clubCode);
  const opponent = lineup.opponentCode ? TEAMS.find(t => t.code === lineup.opponentCode) : null;
  const formationLabel = lineup.formationLabelOverride?.trim() || FORMATIONS[lineup.formationKey]?.label || lineup.formationKey;

  return (
    <>
      <StaleWarning />
      <p style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '16px' }}>
        Voorspelde opstellingen voor GW{PREDICTED_LINEUPS_GW}, samengesteld door @5YSiebee. Kies een club om de verwachte opstelling te bekijken.
      </p>

      {/* Responsief raster i.p.v. een flex-wrap van vaste 76px-blokken: op een telefoon leverde dat
          vijf rijen clublogo's op vóór je de opstelling zelf zag. auto-fill met een minimum van 58px
          geeft daar ~5-6 per rij, en op desktop vullen ze de breedte netjes op. */}
      <div
        role="group"
        aria-label="Kies een club"
        className="fdr-club-picker"
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
          gap: '6px', marginBottom: '20px',
        }}
      >
        {availableClubCodes.map(code => {
          const t = TEAMS.find(team => team.code === code);
          const isSelected = code === selectedClubCode;
          return (
            <button
              key={code}
              onClick={() => setSelectedClubCode(code)}
              title={t?.name ?? code}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                background: isSelected ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.04)',
                border: isSelected ? '1px solid #4ECDC4' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '6px 4px', width: '100%', cursor: 'pointer',
                fontFamily: 'inherit',
              }}
              aria-pressed={isSelected}
            >
              <img
                src={`/club-logos/${code}.png`}
                alt=""
                style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span style={{
                color: isSelected ? '#4ECDC4' : COLORS.textBody, fontSize: '9px', fontWeight: 700,
                textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {t?.name ?? code}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        {/* Kleurenlegende voor de kaartranden — zonder dit weten publieke bezoekers niet wat een rode
            of oranje rand betekent (enkel de privé-tool toont de betekenis via een hover-tooltip op de
            safety-badge, die hier bewust niet gerenderd wordt — zie PitchSlot.jsx's readOnly-prop). */}
        <div style={{
          display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center',
          fontSize: '11px', fontWeight: 700, color: COLORS.textBody,
        }}>
          {SAFETY_LEGEND.map(({ level, label }) => (
            <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: SAFETY_STYLE[level].border, flexShrink: 0,
              }} />
              {label}
            </div>
          ))}
        </div>
        <PitchField
          readOnly
          club={club}
          opponent={opponent}
          formationLabel={formationLabel}
          slots={lineup.slots}
          activeSlotIndex={null}
          onSlotClick={noop}
          onRemove={noop}
          onCycleSafety={noop}
          onDragStart={noop}
          onSlotDrop={noop}
        />
        {/* Per-lineup "laatst geüpdatet" — een handmatig ingevuld tekstveld in predictedLineupsData.js
            (lastUpdatedLabel), bewust géén afgeleide/berekende datum: elke lineup wordt onregelmatig en
            los van elkaar bijgewerkt, dus enkel de samensteller weet wanneer een specifieke opstelling
            voor het laatst nagekeken is. */}
        {lineup.lastUpdatedLabel && (
          <p style={{ color: COLORS.textMuted, fontSize: '10px', margin: 0 }}>
            Laatst geüpdatet: {lineup.lastUpdatedLabel}
          </p>
        )}
        {/* Publiek watermerk, specifiek voor deze read-only weergave — geen downloadknop (bewuste
            keuze, enkel bekijken). Zit bewust hier en niet in PitchField.jsx zelf: dat blijft ook door
            de privé-tool gebruikt, waar dit watermerk niet hoort. */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontWeight: 700 }}>
          <a
            href="https://discord.gg/6dqWVDkvf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ECDC4', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            @5YSiebee
          </a>
          <a
            href="https://x.com/fpl_proleague"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ECDC4', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            @fpl_proleague
          </a>
        </div>
      </div>
    </>
  );
}
