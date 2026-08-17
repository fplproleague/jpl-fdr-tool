// Inhoud van de Bonuspunten-tab: rangschikkingen van de vier statistieken die een Fantasy Pro League-
// bonuspunt kunnen opleveren (meer duels gewonnen dan verloren, >3 verdedigende kopballen, >5 recoveries,
// >1 grote kans), plus een kleinere algemene "meeste bonuspunten"-rangschikking. Bron van deze
// statistieken is de gedeelde spelersdatabank (playerDatabase.duelsWon/.../.bonusPoints, zie
// parsePlayerDatabaseCsv in constants.js) — die is al elders in FDRTool.jsx opgehaald/geparset (zelfde
// props als WatchlistTab/TeamPlannerTab), dus geen eigen CSV-fetch/parsing meer hier (voorheen een
// aparte BONUSPUNTEN_CSV_URL-werkblad-fetch).
import { useCallback, useMemo, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, Swords, Shield, RefreshCw, Target, Award } from 'lucide-react';
import { SectionHeader } from '../components/SectionHeader';
import { RankingRow } from '../components/RankingRow';
import {
  buildBonuspuntenEntries, rankByDuels, rankByDefensiveHeaders, rankByRecoveries, rankByBigChances,
  rankByBonusPoints, BONUS_CRITERIA,
} from '../bonuspunten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

function RankingSection({ icon, title, sectionKey, isOpen, onToggle, children }) {
  return (
    <section style={{ marginBottom: '20px' }}>
      <SectionHeader icon={icon} title={title} sectionKey={sectionKey} isOpen={isOpen} onToggle={onToggle} />
      {isOpen && <div style={{ display: 'grid', gap: '8px' }}>{children}</div>}
    </section>
  );
}

export default function BonuspuntenTab({ playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase }) {
  const [openSections, setOpenSections] = useState({
    duels: true, defensiveHeaders: true, recoveries: true, bigChances: true, bonusPoints: true,
  });

  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const entries = useMemo(() => buildBonuspuntenEntries(playerDatabase), [playerDatabase]);
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

      {playerDatabaseLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> Bonuspunten-gegevens laden...
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
            Nog geen bonuspunten-gegevens beschikbaar — kom binnenkort terug.
          </p>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && entries.length > 0 && (
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
