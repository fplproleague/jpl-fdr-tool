// Inhoud van de Bonuspunten-tab: rangschikkingen van de vier statistieken die een Fantasy Pro League-
// bonuspunt kunnen opleveren (meer duels gewonnen dan verloren, >3 verdedigende kopballen, >5 recoveries,
// >1 grote kans), plus een kleinere algemene "meeste bonuspunten"-rangschikking. Zelfstandige tab (geen
// props vanuit FDRTool.jsx, zelfde opzet als PredictedLineupsTab/SetPiecesTab) met een eigen live fetch
// — zelfde fetch-/foutafhandelingspatroon als fetchPlayerDatabase in FDRTool.jsx (cache: 'no-store' +
// HTML-sniff op een ingetrokken publish-link), hier lokaal herhaald omdat deze tab zijn eigen, aparte
// Google Sheet-werkblad als databron heeft.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, Swords, Shield, RefreshCw, Target, Award } from 'lucide-react';
import { BONUSPUNTEN_CSV_URL } from '../constants';
import { SectionHeader } from '../components/SectionHeader';
import {
  parseBonuspuntenCsv, rankByDuels, rankByDefensiveHeaders, rankByRecoveries, rankByBigChances,
  rankByBonusPoints, BONUS_CRITERIA,
} from '../bonuspunten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// Eén rij in een rangschikking — zelfde visuele opbouw als de "Beste fixture runs"-lijst in FDRTab.jsx
// (rangnummer, logo, naam + subtekst, waarde rechts) zodat deze pagina meteen als een bestaand onderdeel
// van de site aanvoelt. `qualifies` kleurt de waarde turquoise (haalt het bonuscriterium) of gedempt
// lavendel (haalt het niet) — de Top 15 toont altijd alle 15 spelers, ongeacht of ze het criterium halen.
function RankingRow({ rank, clubCode, player, subtitle, value, qualifies }) {
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
      <div style={{
        color: qualifies ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '16px', flexShrink: 0, textAlign: 'right',
      }}>
        {value}
      </div>
    </div>
  );
}

function RankingSection({ icon, title, sectionKey, isOpen, onToggle, children }) {
  return (
    <section style={{ marginBottom: '20px' }}>
      <SectionHeader icon={icon} title={title} sectionKey={sectionKey} isOpen={isOpen} onToggle={onToggle} />
      {isOpen && <div style={{ display: 'grid', gap: '8px' }}>{children}</div>}
    </section>
  );
}

export default function BonuspuntenTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openSections, setOpenSections] = useState({
    duels: true, defensiveHeaders: true, recoveries: true, bigChances: true, bonusPoints: true,
  });

  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const fetchBonuspunten = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(BONUSPUNTEN_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      setEntries(parseBonuspuntenCsv(text));
    } catch {
      setError('Kon bonuspunten-gegevens niet laden, probeer opnieuw.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBonuspunten();
  }, [fetchBonuspunten]);

  const duelsRanking = useMemo(() => rankByDuels(entries), [entries]);
  const headersRanking = useMemo(() => rankByDefensiveHeaders(entries), [entries]);
  const recoveriesRanking = useMemo(() => rankByRecoveries(entries), [entries]);
  const bigChancesRanking = useMemo(() => rankByBigChances(entries), [entries]);
  const bonusRanking = useMemo(() => rankByBonusPoints(entries), [entries]);

  return (
    <>
      <h2 className="fdr-title" style={{ color: '#FFF', fontSize: '22px', margin: '0 0 6px' }}>
        Bonuspunten
      </h2>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '18px' }}>
        Rangschikkingen voor de vier statistieken die een Fantasy Pro League-bonuspunt kunnen opleveren:
        meer duels gewonnen dan verloren, meer dan 3 verdedigende kopballen, meer dan 5 recoveries, of
        meer dan 1 grote kans.
      </p>

      {loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> Bonuspunten-gegevens laden...
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
          <button onClick={fetchBonuspunten} style={retryButtonStyle}>
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
            Nog geen bonuspunten-gegevens beschikbaar — kom binnenkort terug.
          </p>
        </div>
      )}

      {!loading && !error && entries.length > 0 && (
        <>
          <RankingSection
            icon={Swords} title="Duels (gewonnen > verloren)" sectionKey="duels"
            isOpen={openSections.duels} onToggle={toggleSection}
          >
            {duelsRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={`${entry.duelsWon} gewonnen · ${entry.duelsLost} verloren`}
                value={`${entry.duelDiff > 0 ? '+' : ''}${entry.duelDiff}`}
                qualifies={BONUS_CRITERIA.duels(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={Shield} title="Verdedigende kopballen (> 3)" sectionKey="defensiveHeaders"
            isOpen={openSections.defensiveHeaders} onToggle={toggleSection}
          >
            {headersRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.defensiveHeaders}
                qualifies={BONUS_CRITERIA.defensiveHeaders(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={RefreshCw} title="Recoveries (> 5)" sectionKey="recoveries"
            isOpen={openSections.recoveries} onToggle={toggleSection}
          >
            {recoveriesRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.recoveries}
                qualifies={BONUS_CRITERIA.recoveries(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={Target} title="Grote kansen (> 1)" sectionKey="bigChances"
            isOpen={openSections.bigChances} onToggle={toggleSection}
          >
            {bigChancesRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.bigChances}
                qualifies={BONUS_CRITERIA.bigChances(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={Award} title="Meeste bonuspunten" sectionKey="bonusPoints"
            isOpen={openSections.bonusPoints} onToggle={toggleSection}
          >
            {bonusRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.bonusPoints}
                qualifies
              />
            ))}
          </RankingSection>
        </>
      )}
    </>
  );
}
