// Inhoud van de Bonuspunten-tab: rangschikkingen van de vier statistieken die een Fantasy Pro League-
// bonuspunt kunnen opleveren (meer duels gewonnen dan verloren, >3 verdedigende kopballen, >5 recoveries,
// >1 grote kans), plus een kleinere algemene "meeste bonuspunten"-rangschikking. Bron van deze
// statistieken is de gedeelde spelersdatabank (playerDatabase.duelsWon/.../.bonusPoints, zie
// parsePlayerDatabaseCsv in constants.js) — die is al elders in FDRTool.jsx opgehaald/geparset (zelfde
// props als WatchlistTab/TeamPlannerTab), dus geen eigen CSV-fetch/parsing meer hier (voorheen een
// aparte BONUSPUNTEN_CSV_URL-werkblad-fetch).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, Swords, Shield, RefreshCw, Target, Award, X } from 'lucide-react';
import { SectionHeader } from '../components/SectionHeader';
import { RankingRow } from '../components/RankingRow';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import {
  buildBonuspuntenEntries, rankByDuels, rankByDefensiveHeaders, rankByRecoveries, rankByBigChances,
  rankByBonusPoints, findPlayerBonusStats, perGameLabel, BONUS_CRITERIA,
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

// Eén statistiek in de kaart van een opgezochte speler: grote waarde (turquoise als het criterium
// gehaald is, anders gedempt lavendel — zelfde kleurtaal als RankingRow), plus de exacte plaats in de
// volledige rangschikking (ook als die buiten de top 15 van de sectie hierboven valt).
function BonusStatTile({ label, value, valueSub, detail, qualifies, rank, total }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px', padding: '8px 10px',
    }}>
      <div style={{ color: '#8F79AD', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
        <span style={{ color: qualifies ? '#4ECDC4' : '#FFF', fontWeight: 900, fontSize: '18px', lineHeight: 1.3 }}>
          {value}
        </span>
        {valueSub && <span style={{ color: '#8F79AD', fontSize: '10px', fontWeight: 500 }}>{valueSub}</span>}
      </div>
      <div style={{ color: '#8F79AD', fontSize: '11px' }}>
        {detail ? `${detail} · ` : ''}{rank}e / {total}
      </div>
    </div>
  );
}

// Kaart met alle bonuspunten-info van één opgezochte speler, ongeacht of die in een top-15-sectie
// hierboven staat. `stats` komt uit findPlayerBonusStats (src/bonuspunten.js).
function PlayerBonusCard({ stats, onDismiss }) {
  const { entry, totalPlayers, duelsRank, defensiveHeadersRank, recoveriesRank, bigChancesRank, bonusPointsRank } = stats;
  return (
    <div style={{
      background: 'rgba(78,205,196,0.08)', border: '1px solid rgba(78,205,196,0.3)',
      borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <img
          src={`/club-logos/${entry.clubCode}.png`}
          alt=""
          style={{ width: '26px', height: '26px', objectFit: 'contain', flexShrink: 0 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: '#FFF', fontWeight: 700, fontSize: '15px' }}>{entry.player}</div>
          <div style={{ color: '#8F79AD', fontSize: '11px' }}>{entry.clubName}</div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Sluiten"
          style={{ background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer', flexShrink: 0, padding: '4px' }}
        >
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        <BonusStatTile
          label="Duels" value={`${entry.duelDiff > 0 ? '+' : ''}${entry.duelDiff}`}
          valueSub={perGameLabel(entry.duelDiff, entry.games, { showSign: true })}
          detail={`${entry.duelsWon}W/${entry.duelsLost}V`}
          qualifies={BONUS_CRITERIA.duels(entry)} rank={duelsRank} total={totalPlayers}
        />
        <BonusStatTile
          label="Kopballen" value={entry.defensiveHeaders}
          valueSub={perGameLabel(entry.defensiveHeaders, entry.games)}
          qualifies={BONUS_CRITERIA.defensiveHeaders(entry)} rank={defensiveHeadersRank} total={totalPlayers}
        />
        <BonusStatTile
          label="Recoveries" value={entry.recoveries}
          valueSub={perGameLabel(entry.recoveries, entry.games)}
          qualifies={BONUS_CRITERIA.recoveries(entry)} rank={recoveriesRank} total={totalPlayers}
        />
        <BonusStatTile
          label="Grote kansen" value={entry.bigChances}
          valueSub={perGameLabel(entry.bigChances, entry.games)}
          qualifies={BONUS_CRITERIA.bigChances(entry)} rank={bigChancesRank} total={totalPlayers}
        />
        <BonusStatTile
          label="Bonuspunten" value={entry.bonusPoints}
          valueSub={perGameLabel(entry.bonusPoints, entry.games)}
          qualifies rank={bonusPointsRank} total={totalPlayers}
        />
      </div>
    </div>
  );
}

export default function BonuspuntenTab({ playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase }) {
  const [openSections, setOpenSections] = useState({
    duels: true, defensiveHeaders: true, recoveries: true, bigChances: true, bonusPoints: true,
  });
  // Transiënte UI-state van de zoekbalk (zelfde precedent als openSections hierboven) — mag gerust
  // resetten bij het weg- en terugnavigeren van deze tab.
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const playerCardRef = useRef(null);

  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Een rij in een top-15-sectie hieronder klikken doet exact hetzelfde als die speler opzoeken via de
  // zoekbalk — zelfde kaart, zelfde state. `entry` gebruikt .player/.clubCode (bonuspunten-veldnamen),
  // findPlayerBonusStats verwacht .name/.teamCode (playerDatabase-veldnamen), vandaar de kleine mapping.
  const handleSelectFromRanking = useCallback((entry) => {
    setSelectedPlayer({ name: entry.player, teamCode: entry.clubCode });
  }, []);

  const entries = useMemo(() => buildBonuspuntenEntries(playerDatabase), [playerDatabase]);
  const duelsRanking = useMemo(() => rankByDuels(entries), [entries]);
  const headersRanking = useMemo(() => rankByDefensiveHeaders(entries), [entries]);
  const recoveriesRanking = useMemo(() => rankByRecoveries(entries), [entries]);
  const bigChancesRanking = useMemo(() => rankByBigChances(entries), [entries]);
  const bonusRanking = useMemo(() => rankByBonusPoints(entries), [entries]);
  const selectedStats = useMemo(
    () => findPlayerBonusStats(entries, selectedPlayer),
    [entries, selectedPlayer]
  );

  // Een rij diep in een sectie aanklikken toont de kaart bovenaan — zonder deze scroll zou die
  // buiten beeld verschijnen en lijken alsof de klik niets deed.
  useEffect(() => {
    if (selectedStats) playerCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedStats]);

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
          <div style={{ marginBottom: selectedStats ? '12px' : '20px' }}>
            <PlayerSearchInput
              players={playerDatabase}
              value={selectedPlayer?.name}
              onSelect={setSelectedPlayer}
              placeholder="Zoek een speler op naam..."
              maxWidth="320px"
            />
          </div>

          {selectedStats && (
            <div ref={playerCardRef}>
              <PlayerBonusCard stats={selectedStats} onDismiss={() => setSelectedPlayer(null)} />
            </div>
          )}

          <RankingSection
            icon={Swords} title="Duels (gewonnen > verloren)" sectionKey="duels"
            isOpen={openSections.duels} onToggle={toggleSection}
          >
            {duelsRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={`${entry.duelsWon} gewonnen · ${entry.duelsLost} verloren`}
                value={`${entry.duelDiff > 0 ? '+' : ''}${entry.duelDiff}`}
                valueSub={perGameLabel(entry.duelDiff, entry.games, { showSign: true })}
                qualifies={BONUS_CRITERIA.duels(entry)}
                onClick={() => handleSelectFromRanking(entry)}
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
                valueSub={perGameLabel(entry.defensiveHeaders, entry.games)}
                qualifies={BONUS_CRITERIA.defensiveHeaders(entry)}
                onClick={() => handleSelectFromRanking(entry)}
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
                valueSub={perGameLabel(entry.recoveries, entry.games)}
                qualifies={BONUS_CRITERIA.recoveries(entry)}
                onClick={() => handleSelectFromRanking(entry)}
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
                valueSub={perGameLabel(entry.bigChances, entry.games)}
                qualifies={BONUS_CRITERIA.bigChances(entry)}
                onClick={() => handleSelectFromRanking(entry)}
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
                valueSub={perGameLabel(entry.bonusPoints, entry.games)}
                qualifies
                onClick={() => handleSelectFromRanking(entry)}
              />
            ))}
          </RankingSection>
        </>
      )}
    </>
  );
}
