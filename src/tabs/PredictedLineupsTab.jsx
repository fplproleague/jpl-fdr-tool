// Publieke, volledig read-only weergave van de 18 voorspelde basiselven (één per club) — presentational
// component zonder gedeelde/aanpasbare state vanuit FDRTool.jsx (enkel lokale UI-state voor "welke club
// is geselecteerd"). Hergebruikt PitchField/PitchSlot rechtstreeks uit de privé Predicted XI Builder
// (../predicted-xi/) via hun readOnly-prop, zodat de visuele stijl (veld, kaartjes, kleuren, header)
// gegarandeerd exact dezelfde is als de privé-tool — geen duplicatie, geen risico op visuele drift.
import { useState } from 'react';
import { TEAMS } from '../constants';
import { FORMATIONS } from '../predicted-xi/formations';
import PitchField from '../predicted-xi/PitchField';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';

const noop = () => {};

// Filtert lineups zonder één enkele geplaatste speler eruit (bv. een club die nog niet af is) — zo
// verschijnt zo'n club nooit als een lege, verwarrende kaart in de kiezer, ook niet als
// predictedLineupsData.js per ongeluk een halfafgewerkte entry bevat.
const readyLineups = PREDICTED_LINEUPS.filter(l => l.slots.some(s => s.positionId !== '_unassigned' && s.playerName));

export default function PredictedLineupsTab() {
  const availableClubCodes = [...new Set(readyLineups.map(l => l.clubCode))];
  const [selectedClubCode, setSelectedClubCode] = useState(availableClubCodes[0] ?? '');

  if (readyLineups.length === 0) {
    return (
      <>
        <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
          Voorspelde basiselven voor elke Belgische Pro League-club, samengesteld door @5YSiebee.
        </p>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
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
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
        Voorspelde basiselven voor elke Belgische Pro League-club, samengesteld door @5YSiebee. Kies een club om de opstelling te bekijken.
      </p>

      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '20px',
      }}>
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
                borderRadius: '10px', padding: '8px 6px', width: '76px', cursor: 'pointer',
              }}
            >
              <img
                src={`/club-logos/${code}.png`}
                alt=""
                style={{ width: '28px', height: '28px', objectFit: 'contain' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span style={{
                color: isSelected ? '#4ECDC4' : '#C9B8E0', fontSize: '10px', fontWeight: 700,
                textAlign: 'center', lineHeight: 1.2,
              }}>
                {t?.name ?? code}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
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
        {/* Publiek watermerk, specifiek voor deze read-only weergave — geen downloadknop (bewuste
            keuze, enkel bekijken). Zit bewust hier en niet in PitchField.jsx zelf: dat blijft ook door
            de privé-tool gebruikt, waar dit watermerk niet hoort. */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontWeight: 700 }}>
          <a
            href="https://x.com/5YSiebee"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ECDC4', textDecoration: 'none' }}
          >
            @5YSiebee
          </a>
          <a
            href="https://x.com/fpl_proleague"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ECDC4', textDecoration: 'none' }}
          >
            @fpl_proleague
          </a>
        </div>
      </div>
    </>
  );
}
