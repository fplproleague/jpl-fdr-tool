// Inhoud van de Kaarten-tab: rangschikking van gele kaarten per speler, met twee sorteermodi ("Meeste
// gele kaarten" en "Dichtst bij schorsing"). Bron van de gele-kaarten-telling is de gedeelde
// spelersdatabank (playerDatabase.yellowCards, zie parsePlayerDatabaseCsv in constants.js) — die is al
// elders in FDRTool.jsx opgehaald/geparset (zelfde props als WatchlistTab/TeamPlannerTab), dus geen eigen
// CSV-fetch/parsing meer hier (voorheen een aparte, nooit ingevulde KAARTEN_CSV_URL-sheet).
import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { RankingRow } from '../components/RankingRow';
import { buildKaartenEntries, rankByMostCards, rankByClosestToSuspension, isOneCardFromSuspension } from '../kaarten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// Tijdelijk verborgen (sinds 16 aug 2026, ±1 maand) — het aantal kaarten is dit vroeg in het seizoen nog
// te laag om "dichtst bij schorsing" zinvol te maken. Zet terug op true om de sorteermodus-knop weer te
// tonen; sortMode's default ('mostCards') blijft ondertussen gewoon werken.
const SHOW_CLOSEST_TO_SUSPENSION_MODE = false;

const SORT_MODES = [
  { key: 'mostCards', labelKey: 'kaarten.sortMode.mostCards' },
  { key: 'closestToSuspension', labelKey: 'kaarten.sortMode.closestToSuspension' },
];

// Enkel spelers vanaf 2 gele kaarten zijn relevant genoeg om in de tabel te tonen — 0 of 1 kaart is
// nog te vroeg om interessant te zijn. allEntries (ongefilterd) blijft apart bewaard om de lege-staat-
// melding hieronder correct te kunnen onderscheiden: "nog geen databank geladen" vs. "databank geladen,
// maar niemand heeft nog 2+ kaarten" (dat laatste is vroeg in het seizoen het te verwachten geval).
const MIN_VISIBLE_CARDS = 2;

export default function KaartenTab({ t, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase }) {
  const [sortMode, setSortMode] = useState('mostCards');

  const allEntries = useMemo(() => buildKaartenEntries(playerDatabase), [playerDatabase]);
  const entries = useMemo(() => allEntries.filter(e => e.cards >= MIN_VISIBLE_CARDS), [allEntries]);
  const ranking = useMemo(
    () => (sortMode === 'closestToSuspension' ? rankByClosestToSuspension(entries) : rankByMostCards(entries)),
    [entries, sortMode],
  );
  const visibleSortModes = SORT_MODES.filter(m => SHOW_CLOSEST_TO_SUSPENSION_MODE || m.key !== 'closestToSuspension');

  return (
    <>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
        {t('kaarten.intro')}
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {visibleSortModes.map(({ key, labelKey }) => {
          const isSelected = sortMode === key;
          return (
            <button
              key={key}
              onClick={() => setSortMode(key)}
              style={{
                background: isSelected ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.04)',
                border: isSelected ? '1px solid #4ECDC4' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '8px 14px', cursor: 'pointer',
                color: isSelected ? '#4ECDC4' : '#C9B8E0', fontWeight: 700, fontSize: '12px',
              }}
            >
              {t(labelKey)}
            </button>
          );
        })}
      </div>

      {playerDatabaseLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> {t('kaarten.loading')}
        </div>
      )}

      {!playerDatabaseLoading && playerDatabaseError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
          borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
        }}>
          <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
          <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{playerDatabaseError}</span>
          <button onClick={fetchPlayerDatabase} style={retryButtonStyle}>
            <RotateCcw size={14} /> {t('shared.retry')}
          </button>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && entries.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
            {allEntries.length === 0
              ? t('kaarten.emptyNoData')
              : t('kaarten.emptyNoQualifying', { min: MIN_VISIBLE_CARDS })}
          </p>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && entries.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {ranking.map((entry, idx) => {
            const warning = isOneCardFromSuspension(entry);
            const subtitle = sortMode === 'closestToSuspension'
              ? `${entry.clubName} · ${entry.cards}/${entry.nextThreshold} ${t('kaarten.cardsUnit')}`
              : entry.clubName;
            const value = sortMode === 'closestToSuspension' ? entry.cardsRemaining : entry.cards;
            return (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={subtitle} value={value}
                qualifies={sortMode === 'closestToSuspension' || warning}
                warning={warning}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
