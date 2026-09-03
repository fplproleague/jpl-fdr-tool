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
  rankByBonusPoints, findPlayerBonusEntry, perGameLabel, meetsThresholdPerGame, BONUS_CRITERIA, BONUS_THRESHOLD,
} from '../bonuspunten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// Tijdelijk (t/m GW5) — enkel de Bonuspunten-kolom (de 5e, algemene "meeste bonuspunten"-
// rangschikking) staat nog op 0 voor iedereen; Duels/Kopballen/Recoveries/Grote kansen zijn al wél
// ingevuld en tonen dus gewoon normaal. Zolang dit op false staat, toont enkel de "Meeste bonuspunten"-
// sectie (en de Bonuspunten-tegel in de spelerskaart) een subtiele melding ("beschikbaar na GW5")
// i.p.v. een rangschikking vol nullen. Zet op true zodra die kolom gevuld is — zelfde tijdelijke-
// vlag-opzet als SHOW_CLOSEST_TO_SUSPENSION_MODE in KaartenTab.jsx.
const BONUS_POINTS_DATA_AVAILABLE = false;

// Handmatig bij te werken samen met de spelersdatabank-sheet — zie het "Updated: GW.."-badge
// hieronder. Geen automatische afleiding mogelijk (in tegenstelling tot bv. PREDICTED_LINEUPS_GW in
// constants.js), want de gedeelde CSV heeft geen eigen "laatst bijgewerkt"-kolom.
const BONUSPUNTEN_UPDATED_GW = 4;

function RankingSection({ icon, title, sectionKey, isOpen, onToggle, children }) {
  return (
    <section style={{ marginBottom: '20px' }}>
      <SectionHeader icon={icon} title={title} sectionKey={sectionKey} isOpen={isOpen} onToggle={onToggle} />
      {isOpen && <div style={{ display: 'grid', gap: '8px' }}>{children}</div>}
    </section>
  );
}

// Eén statistiek in de kaart van een opgezochte speler: de hoofdwaarde (seizoenstotaal) staat altijd
// gewoon wit — enkel de "per wedstrijd"-waarde op de tweede regel kleurt cyaan, en dan enkel zodra die
// PER WEDSTRIJD al minstens de bonuspunt-drempel haalt (perGameQualifies, zie meetsThresholdPerGame in
// bonuspunten.js) — een "op koers voor dit bonuspunt"-indicator, los van de seizoenstotaal.
function BonusStatTile({ label, value, perGame, perGameQualifies, detail, comingSoon }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px', padding: '8px 10px',
    }}>
      <div style={{ color: '#8F79AD', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ color: '#FFF', fontWeight: 900, fontSize: '18px', lineHeight: 1.3 }}>
        {value}
      </div>
      <div style={{ color: '#8F79AD', fontSize: '11px' }}>
        {comingSoon ? comingSoon : (
          <>
            {detail && `${detail} · `}
            {perGame && (
              <span style={{ color: perGameQualifies ? '#4ECDC4' : '#8F79AD', fontWeight: perGameQualifies ? 700 : 400 }}>
                {perGame}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Kaart met alle bonuspunten-info van één opgezochte speler, ongeacht of die in een top-15-sectie
// hierboven staat. `entry` komt uit findPlayerBonusEntry (src/bonuspunten.js).
function PlayerBonusCard({ t, entry, onDismiss }) {
  const unit = t('bonuspunten.perMatchUnit');
  return (
    <div style={{
      background: 'rgba(78,205,196,0.08)', border: '1px solid rgba(78,205,196,0.3)',
      borderRadius: '10px', padding: '14px 16px', marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <img
          src={`/club-logos/${entry.clubCode}.webp`}
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
          aria-label={t('bonuspunten.closeAria')}
          style={{ background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer', flexShrink: 0, padding: '4px' }}
        >
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
        <BonusStatTile
          label={t('bonuspunten.stat.duels')} value={`${entry.duelDiff > 0 ? '+' : ''}${entry.duelDiff}`}
          perGame={perGameLabel(entry.duelDiff, entry.games, { showSign: true, unit })}
          perGameQualifies={meetsThresholdPerGame(entry.duelDiff, entry.games, BONUS_THRESHOLD.duels)}
          detail={t('bonuspunten.duelsDetail', { won: entry.duelsWon, lost: entry.duelsLost })}
        />
        <BonusStatTile
          label={t('bonuspunten.stat.headers')} value={entry.defensiveHeaders}
          perGame={perGameLabel(entry.defensiveHeaders, entry.games, { unit })}
          perGameQualifies={meetsThresholdPerGame(entry.defensiveHeaders, entry.games, BONUS_THRESHOLD.defensiveHeaders)}
        />
        <BonusStatTile
          label={t('bonuspunten.stat.recoveries')} value={entry.recoveries}
          perGame={perGameLabel(entry.recoveries, entry.games, { unit })}
          perGameQualifies={meetsThresholdPerGame(entry.recoveries, entry.games, BONUS_THRESHOLD.recoveries)}
        />
        <BonusStatTile
          label={t('bonuspunten.stat.bigChances')} value={entry.bigChances}
          perGame={perGameLabel(entry.bigChances, entry.games, { unit })}
          perGameQualifies={meetsThresholdPerGame(entry.bigChances, entry.games, BONUS_THRESHOLD.bigChances)}
        />
        <BonusStatTile
          label={t('bonuspunten.stat.bonusPoints')}
          value={BONUS_POINTS_DATA_AVAILABLE ? entry.bonusPoints : '—'}
          perGame={BONUS_POINTS_DATA_AVAILABLE ? perGameLabel(entry.bonusPoints, entry.games, { unit }) : null}
          comingSoon={BONUS_POINTS_DATA_AVAILABLE ? null : t('bonuspunten.comingSoonShort')}
        />
      </div>
    </div>
  );
}

export default function BonuspuntenTab({ t, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase }) {
  const perMatchUnit = t('bonuspunten.perMatchUnit');
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
  // findPlayerBonusEntry verwacht .name/.teamCode (playerDatabase-veldnamen), vandaar de kleine mapping.
  const handleSelectFromRanking = useCallback((entry) => {
    setSelectedPlayer({ name: entry.player, teamCode: entry.clubCode });
  }, []);

  const entries = useMemo(() => buildBonuspuntenEntries(playerDatabase), [playerDatabase]);
  const duelsRanking = useMemo(() => rankByDuels(entries), [entries]);
  const headersRanking = useMemo(() => rankByDefensiveHeaders(entries), [entries]);
  const recoveriesRanking = useMemo(() => rankByRecoveries(entries), [entries]);
  const bigChancesRanking = useMemo(() => rankByBigChances(entries), [entries]);
  const bonusRanking = useMemo(() => rankByBonusPoints(entries), [entries]);
  const selectedEntry = useMemo(
    () => findPlayerBonusEntry(entries, selectedPlayer),
    [entries, selectedPlayer]
  );

  // Een rij diep in een sectie aanklikken toont de kaart bovenaan — zonder deze scroll zou die
  // buiten beeld verschijnen en lijken alsof de klik niets deed.
  useEffect(() => {
    if (selectedEntry) playerCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedEntry]);

  return (
    <>
      {/* Laatste-update-badge op een eigen, rechts uitgelijnde regel — zelfde badge-stijl (teal pil)
          als de "Updated: GW.."-badge op de Set Pieces-tab. Bewust niet in dezelfde flex-rij als de
          introtekst: die is te lang om ooit naast een badge te passen zonder toch naar een eigen regel
          te wrappen, dus dit is voorspelbaarder. BONUSPUNTEN_UPDATED_GW is nog een handmatige constante
          (voorlopig GW4) i.p.v. dynamisch uit de sheet gelezen, want de gedeelde spelersdatabank-CSV
          heeft geen eigen "laatst bijgewerkt"-kolom zoals het Set Pieces-werkblad. */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
        <span style={{
          color: '#4ECDC4', fontWeight: 800, fontSize: '11px', letterSpacing: '0.08em', textTransform: 'uppercase',
          background: 'rgba(78,205,196,0.12)', border: '1px solid rgba(78,205,196,0.3)',
          borderRadius: '999px', padding: '5px 14px', whiteSpace: 'nowrap',
        }}>
          {t('bonuspunten.updatedLabel', { gw: BONUSPUNTEN_UPDATED_GW })}
        </span>
      </div>

      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '18px' }}>
        {t('bonuspunten.intro')}
      </p>

      {playerDatabaseLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
          <Loader2 size={16} className="fdr-spin" /> {t('bonuspunten.loading')}
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
            {t('bonuspunten.emptyState')}
          </p>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && entries.length > 0 && (
        <>
          <div style={{ marginBottom: selectedEntry ? '12px' : '20px' }}>
            <PlayerSearchInput
              players={playerDatabase}
              value={selectedPlayer?.name}
              onSelect={setSelectedPlayer}
              placeholder={t('bonuspunten.searchPlaceholder')}
              maxWidth="320px"
            />
          </div>

          {selectedEntry && (
            <div ref={playerCardRef}>
              <PlayerBonusCard t={t} entry={selectedEntry} onDismiss={() => setSelectedPlayer(null)} />
            </div>
          )}

          <RankingSection
            icon={Swords} title={t('bonuspunten.section.duels')} sectionKey="duels"
            isOpen={openSections.duels} onToggle={toggleSection}
          >
            {duelsRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={t('bonuspunten.duelsSubtitle', { won: entry.duelsWon, lost: entry.duelsLost })}
                value={`${entry.duelDiff > 0 ? '+' : ''}${entry.duelDiff}`}
                valueSub={perGameLabel(entry.duelDiff, entry.games, { showSign: true, unit: perMatchUnit })}
                qualifies={BONUS_CRITERIA.duels(entry)}
                onClick={() => handleSelectFromRanking(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={Shield} title={t('bonuspunten.section.headers')} sectionKey="defensiveHeaders"
            isOpen={openSections.defensiveHeaders} onToggle={toggleSection}
          >
            {headersRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.defensiveHeaders}
                valueSub={perGameLabel(entry.defensiveHeaders, entry.games, { unit: perMatchUnit })}
                qualifies={BONUS_CRITERIA.defensiveHeaders(entry)}
                onClick={() => handleSelectFromRanking(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={RefreshCw} title={t('bonuspunten.section.recoveries')} sectionKey="recoveries"
            isOpen={openSections.recoveries} onToggle={toggleSection}
          >
            {recoveriesRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.recoveries}
                valueSub={perGameLabel(entry.recoveries, entry.games, { unit: perMatchUnit })}
                qualifies={BONUS_CRITERIA.recoveries(entry)}
                onClick={() => handleSelectFromRanking(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={Target} title={t('bonuspunten.section.bigChances')} sectionKey="bigChances"
            isOpen={openSections.bigChances} onToggle={toggleSection}
          >
            {bigChancesRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={entry.clubName} value={entry.bigChances}
                valueSub={perGameLabel(entry.bigChances, entry.games, { unit: perMatchUnit })}
                qualifies={BONUS_CRITERIA.bigChances(entry)}
                onClick={() => handleSelectFromRanking(entry)}
              />
            ))}
          </RankingSection>

          <RankingSection
            icon={Award} title={t('bonuspunten.section.bonusPoints')} sectionKey="bonusPoints"
            isOpen={openSections.bonusPoints} onToggle={toggleSection}
          >
            {BONUS_POINTS_DATA_AVAILABLE ? (
              bonusRanking.map((entry, idx) => (
                <RankingRow
                  key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                  subtitle={entry.clubName} value={entry.bonusPoints}
                  valueSub={perGameLabel(entry.bonusPoints, entry.games, { unit: perMatchUnit })}
                  qualifies
                  onClick={() => handleSelectFromRanking(entry)}
                />
              ))
            ) : (
              <div style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px', padding: '12px 14px',
              }}>
                <p style={{ color: '#8F79AD', fontSize: '12px', margin: 0 }}>
                  {t('bonuspunten.dataComingSoon')}
                </p>
              </div>
            )}
          </RankingSection>
        </>
      )}

      <p style={{ color: '#A594C4', fontSize: '11px', marginTop: '24px' }}>
        {t('bonuspunten.sources')}
      </p>
    </>
  );
}
