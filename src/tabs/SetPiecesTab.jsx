// Inhoud van de Set Pieces-tab: huidige strafschop-/corner-/vrijetrapnemers per club, opgehaald uit een
// eigen werkblad in dezelfde Google Sheet als de spelersdatabank (zie SET_PIECES_CSV_URL in
// constants.js). Zelfstandige tab (geen props vanuit FDRTool.jsx nodig, zelfde opzet als
// PredictedLineupsTab.jsx) — maar met een eigen LIVE fetch i.p.v. statisch geïmporteerde data, want deze
// gegevens moeten zonder codewijziging aanpasbaar zijn door gewoon de sheet te bewerken. Zelfde
// fetch-/foutafhandelingspatroon als fetchPlayerDatabase in FDRTool.jsx (cache: 'no-store' + HTML-sniff
// op een ingetrokken publish-link), hier lokaal herhaald omdat deze tab zijn eigen, aparte databron heeft.
import { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { SET_PIECES_CSV_URL } from '../constants';
import { parseSetPiecesCsv } from '../setPieces';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// P/C/FK-badge — zowel in de legende als vóór elke rij in een kaart, vandaar een gedeeld component i.p.v.
// de opmaak dubbel te schrijven.
function CategoryBadge({ label }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      width: '20px', height: '20px', borderRadius: '50%',
      background: 'rgba(78,205,196,0.15)', border: '1px solid #4ECDC4', color: '#4ECDC4',
      fontSize: label.length > 1 ? '8px' : '10px', fontWeight: 800,
    }}>
      {label}
    </span>
  );
}

// Splitst een waarde als "Sikan / Ambros / Cvetkovic ?" op de "?" zelf (die als apart element behouden
// blijft, zie split met een capturing group) zodat enkel het vraagteken in goud gerenderd kan worden — de
// rest van de tekst (namen, "/"-scheidingstekens, spaties) blijft ongewijzigd en in de oorspronkelijke
// volgorde staan. Geen alfabetische herordening, geen andere symbolen i.p.v. "?".
function formatSetPieceValue(value) {
  return value.split(/(\?)/g).filter(part => part !== '').map((part, i) => (
    part === '?'
      ? <span key={i} style={{ color: '#E8C547', fontWeight: 800 }}>?</span>
      : <span key={i}>{part}</span>
  ));
}

function SetPieceRow({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '4px 0' }}>
      <CategoryBadge label={label} />
      <span style={{ color: '#EDE4F5', fontSize: '13px', fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
        {value ? formatSetPieceValue(value) : <span style={{ color: '#6B5289' }}>—</span>}
      </span>
    </div>
  );
}

function SetPieceCard({ entry }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '12px', padding: '14px 16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px',
        paddingBottom: '10px', marginBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {entry.clubCode && (
          <img
            src={`/club-logos/${entry.clubCode}.png`}
            alt=""
            style={{ width: '22px', height: '22px', objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <span style={{
          color: '#FFF', fontWeight: 800, fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.01em',
        }}>
          {entry.clubName}
        </span>
      </div>
      <SetPieceRow label="P" value={entry.penalties} />
      <SetPieceRow label="C" value={entry.corners} />
      <SetPieceRow label="FK" value={entry.freeKicks} />
    </div>
  );
}

const CATEGORY_LEGEND = [
  { label: 'P', textKey: 'setpieces.legend.penalty' },
  { label: 'C', textKey: 'setpieces.legend.corner' },
  { label: 'FK', textKey: 'setpieces.legend.freeKick' },
];

export default function SetPiecesTab({ t }) {
  const [{ entries, updatedGw }, setData] = useState({ entries: [], updatedGw: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchSetPieces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(SET_PIECES_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      setData(parseSetPiecesCsv(text));
    } catch {
      setError(t('setpieces.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchSetPieces();
  }, [fetchSetPieces]);

  return (
    <>
      {/* Legende + laatste update — zelfde stijl als de safety-kleurenlegende op de Predicted
          Lineups-tab: badge + korte uitleg, zodat de P/C/FK-afkortingen zonder tooltip duidelijk
          blijven. Bovenaan de tab, want de titel/subtitel/uitleg zijn hier bewust weggelaten. */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px',
        marginBottom: '18px',
      }}>
        <div style={{
          display: 'flex', gap: '14px', flexWrap: 'wrap', alignItems: 'center',
          fontSize: '11px', fontWeight: 700, color: '#C9B8E0',
        }}>
          {CATEGORY_LEGEND.map(({ label, textKey }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <CategoryBadge label={label} />
              {t(textKey)}
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#E8C547', fontWeight: 800, fontSize: '13px' }}>?</span>
            {t('setpieces.legend.uncertain')}
          </div>
        </div>
        {updatedGw && (
          <span style={{
            color: '#4ECDC4', fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
            background: 'rgba(78,205,196,0.12)', border: '1px solid rgba(78,205,196,0.3)',
            borderRadius: '999px', padding: '5px 14px', whiteSpace: 'nowrap',
          }}>
            {t('setpieces.updatedLabel', { gw: updatedGw })}
          </span>
        )}
      </div>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> {t('setpieces.loading')}
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
          <button onClick={fetchSetPieces} style={retryButtonStyle}>
            <RotateCcw size={14} /> {t('shared.retry')}
          </button>
        </div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
            {t('setpieces.emptyState')}
          </p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: '12px' }}>
          {entries.map((entry, i) => (
            <SetPieceCard key={entry.clubCode ?? `${entry.clubName}-${i}`} entry={entry} />
          ))}
        </div>
      )}
    </>
  );
}
