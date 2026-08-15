// Inhoud van de Kaarten-tab: rangschikking van gele kaarten per speler, met twee sorteermodi ("Meeste
// gele kaarten" en "Dichtst bij schorsing"). Bron van de gele-kaarten-telling is de gedeelde
// spelersdatabank (playerDatabase.yellowCards, zie parsePlayerDatabaseCsv in constants.js) — die is al
// elders in FDRTool.jsx opgehaald/geparset (zelfde props als WatchlistTab/TeamPlannerTab), dus geen eigen
// CSV-fetch/parsing meer hier (voorheen een aparte, nooit ingevulde KAARTEN_CSV_URL-sheet).
import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, Square } from 'lucide-react';
import { RankingRow } from '../components/RankingRow';
import { buildKaartenEntries, rankByMostCards, rankByClosestToSuspension, isOneCardFromSuspension } from '../kaarten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

const SORT_MODES = [
  { key: 'mostCards', label: 'Meeste gele kaarten' },
  { key: 'closestToSuspension', label: 'Dichtst bij schorsing' },
];

export default function KaartenTab({ playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase }) {
  const [sortMode, setSortMode] = useState('mostCards');

  const entries = useMemo(() => buildKaartenEntries(playerDatabase), [playerDatabase]);
  const ranking = useMemo(
    () => (sortMode === 'closestToSuspension' ? rankByClosestToSuspension(entries) : rankByMostCards(entries)),
    [entries, sortMode],
  );

  return (
    <>
      <h2 className="fdr-title" style={{
        color: '#FFF', fontSize: '22px', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: '8px',
      }}>
        <Square size={18} fill="#E8C547" color="#E8C547" /> Kaarten
      </h2>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
        Gele kaarten &amp; schorsing.
      </p>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {SORT_MODES.map(({ key, label }) => {
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
              {label}
            </button>
          );
        })}
      </div>

      {playerDatabaseLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> Kaarten-gegevens laden...
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
            <RotateCcw size={14} /> Probeer opnieuw
          </button>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && entries.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
            Nog geen kaarten-gegevens beschikbaar — kom binnenkort terug.
          </p>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && entries.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {ranking.map((entry, idx) => {
            const warning = isOneCardFromSuspension(entry);
            const subtitle = sortMode === 'closestToSuspension'
              ? `${entry.clubName} · ${entry.cards}/${entry.nextThreshold} gele kaarten`
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
