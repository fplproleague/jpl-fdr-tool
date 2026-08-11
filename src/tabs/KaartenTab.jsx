// Inhoud van de Kaarten-tab: rangschikking van gele kaarten per speler, met twee sorteermodi ("Meeste
// gele kaarten" en "Dichtst bij schorsing"). Zelfstandige tab (geen props vanuit FDRTool.jsx, zelfde
// opzet als BonuspuntenTab/PredictedLineupsTab/SetPiecesTab) met een eigen live fetch — zelfde fetch-/
// foutafhandelingspatroon als fetchPlayerDatabase in FDRTool.jsx (cache: 'no-store' + HTML-sniff op een
// ingetrokken publish-link).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, Square } from 'lucide-react';
import { KAARTEN_CSV_URL } from '../constants';
import { RankingRow } from '../components/RankingRow';
import { parseKaartenCsv, rankByMostCards, rankByClosestToSuspension, isOneCardFromSuspension } from '../kaarten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

const SORT_MODES = [
  { key: 'mostCards', label: 'Meeste gele kaarten' },
  { key: 'closestToSuspension', label: 'Dichtst bij schorsing' },
];

export default function KaartenTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [sortMode, setSortMode] = useState('mostCards');

  const fetchKaarten = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(KAARTEN_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      setEntries(parseKaartenCsv(text));
    } catch {
      setError('Kon kaarten-gegevens niet laden, probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKaarten();
  }, [fetchKaarten]);

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

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> Kaarten-gegevens laden...
        </div>
      )}

      {!loading && error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
          borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
        }}>
          <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
          <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{error}</span>
          <button onClick={fetchKaarten} style={retryButtonStyle}>
            <RotateCcw size={14} /> Probeer opnieuw
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
            Nog geen kaarten-gegevens beschikbaar — kom binnenkort terug.
          </p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
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
