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
import { RankingRow, watchProps } from '../components/RankingRow';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import {
  buildBonuspuntenEntries, rankByDuels, rankByDefensiveHeaders, rankByRecoveries, rankByBigChances,
  rankByBonusPoints, perGameLabel, BONUS_CRITERIA,
  SORT_MODES, minGamesForPerMatch,
} from '../bonuspunten';

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// De Bonuspunten-kolom (de 5e, algemene "meeste bonuspunten"-rangschikking) is sinds GW6 gevuld — zet
// terug op false (zelfde tijdelijke-vlag-opzet als SHOW_CLOSEST_TO_SUSPENSION_MODE in KaartenTab.jsx)
// mocht die kolom ooit weer leeg komen te staan.
const BONUS_POINTS_DATA_AVAILABLE = true;

// Handmatig bij te werken samen met de spelersdatabank-sheet — zie het "Updated: GW.."-badge
// hieronder. Geen automatische afleiding mogelijk (in tegenstelling tot bv. PREDICTED_LINEUPS_GW in
// constants.js), want de gedeelde CSV heeft geen eigen "laatst bijgewerkt"-kolom.
const BONUSPUNTEN_UPDATED_GW = 6;

// Twee-knops-schakelaar boven de rangschikkingen: sorteren op seizoenstotaal of op per-wedstrijd-
// gemiddelde. Zie SORT_MODES in ../bonuspunten voor waarom die tweede modus er is.
function SortModeToggle({ t, value, onChange }) {
  const options = [
    { mode: SORT_MODES.total, label: t('bonuspunten.sortTotal') },
    { mode: SORT_MODES.perMatch, label: t('bonuspunten.sortPerMatch') },
  ];
  return (
    <div
      role="group"
      aria-label={t('bonuspunten.sortLabel')}
      style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}
    >
      <span style={{ color: '#8F79AD', fontSize: '12px' }}>{t('bonuspunten.sortLabel')}</span>
      <div style={{
        display: 'flex', gap: '2px', background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '999px', padding: '2px',
      }}>
        {options.map(o => {
          const active = value === o.mode;
          return (
            <button
              key={o.mode}
              type="button"
              onClick={() => onChange(o.mode)}
              aria-pressed={active}
              style={{
                background: active ? '#4ECDC4' : 'transparent',
                color: active ? '#0B2E1B' : '#C9B8E0',
                border: 'none', borderRadius: '999px', padding: '5px 12px',
                fontWeight: 700, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {o.label}
            </button>
          );
        })}
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

export default function BonuspuntenTab({
  t, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
  toggleWatchlistPlayer, isPlayerWatched, onOpenPlayer,
}) {
  const perMatchUnit = t('bonuspunten.perMatchUnit');
  // Alle vijf de rangschikkingen krijgen dezelfde ster; één helper i.p.v. vijf keer hetzelfde.
  const starProps = entry => watchProps(
    { name: entry.player, teamCode: entry.clubCode },
    { isPlayerWatched, toggleWatchlistPlayer, t },
  );
  const [openSections, setOpenSections] = useState({
    duels: true, defensiveHeaders: true, recoveries: true, bigChances: true, bonusPoints: true,
  });
  // Sorteermodus van alle vijf de rangschikkingen tegelijk — bewust één schakelaar i.p.v. één per
  // sectie: de gebruiker stelt één vraag ("wie is de beste?" vs "wie is de beste per match?"), niet vijf.
  const [sortMode, setSortMode] = useState(SORT_MODES.total);

  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Een rij in een top-15-sectie hieronder klikken doet exact hetzelfde als die speler opzoeken via de
  // zoekbalk: allebei openen ze de speler-sheet. `entry` gebruikt .player/.clubCode
  // (bonuspunten-veldnamen), de sheet .name/.teamCode (playerDatabase-veldnamen) — vandaar de mapping.
  const handleSelectFromRanking = useCallback(
    (entry) => onOpenPlayer?.(entry.player, entry.clubCode),
    [onOpenPlayer],
  );

  const entries = useMemo(() => buildBonuspuntenEntries(playerDatabase), [playerDatabase]);
  const minGames = useMemo(() => minGamesForPerMatch(entries), [entries]);
  const isPerMatch = sortMode === SORT_MODES.perMatch;
  const duelsRanking = useMemo(() => rankByDuels(entries, sortMode, minGames), [entries, sortMode, minGames]);
  const headersRanking = useMemo(() => rankByDefensiveHeaders(entries, sortMode, minGames), [entries, sortMode, minGames]);
  const recoveriesRanking = useMemo(() => rankByRecoveries(entries, sortMode, minGames), [entries, sortMode, minGames]);
  const bigChancesRanking = useMemo(() => rankByBigChances(entries, sortMode, minGames), [entries, sortMode, minGames]);
  const bonusRanking = useMemo(() => rankByBonusPoints(entries, sortMode, minGames), [entries, sortMode, minGames]);

  // In per-wedstrijd-modus wisselen hoofdwaarde en subregel van plaats: de waarde waarop gesorteerd
  // wordt hoort het grootst te staan, anders lijkt de volgorde willekeurig ("waarom staat 16 boven 17?").
  const rankingValues = useCallback((value, games, { showSign = false } = {}) => {
    const perMatch = perGameLabel(value, games, { showSign, unit: perMatchUnit });
    const total = `${showSign && value > 0 ? '+' : ''}${value}`;
    return isPerMatch && perMatch
      ? { value: perMatch, valueSub: total }
      : { value: total, valueSub: perMatch };
  }, [isPerMatch, perMatchUnit]);

  return (
    <>
      {/* Laatste-update-badge op een eigen, rechts uitgelijnde regel — zelfde badge-stijl (teal pil)
          als de "Updated: GW.."-badge op de Set Pieces-tab. Bewust niet in dezelfde flex-rij als de
          introtekst: die is te lang om ooit naast een badge te passen zonder toch naar een eigen regel
          te wrappen, dus dit is voorspelbaarder. BONUSPUNTEN_UPDATED_GW is nog een handmatige constante
          i.p.v. dynamisch uit de sheet gelezen, want de gedeelde spelersdatabank-CSV heeft geen eigen
          "laatst bijgewerkt"-kolom zoals het Set Pieces-werkblad. */}
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
          <div style={{ marginBottom: '20px' }}>
            <PlayerSearchInput
              players={playerDatabase}
              onSelect={player => onOpenPlayer?.(player.name, player.teamCode)}
              placeholder={t('bonuspunten.searchPlaceholder')}
              maxWidth="320px"
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', margin: '4px 0 18px' }}>
            <SortModeToggle t={t} value={sortMode} onChange={setSortMode} />
            {isPerMatch && (
              <p style={{ color: '#8F79AD', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                {t('bonuspunten.sortPerMatchNote', { minGames })}
              </p>
            )}
          </div>

          <RankingSection
            icon={Swords} title={t('bonuspunten.section.duels')} sectionKey="duels"
            isOpen={openSections.duels} onToggle={toggleSection}
          >
            {/* De clubnaam stond hier als enige van de vijf lijsten niet bij: de subregel was volledig
                opgegaan aan het duelsaldo, waardoor je van de nummer 1 niet kon zien voor wie hij speelt
                — net wat je nodig hebt om te beoordelen of hij in je ploeg past. */}
            {duelsRanking.map((entry, idx) => (
              <RankingRow
                key={entry.player} rank={idx + 1} clubCode={entry.clubCode} player={entry.player}
                subtitle={[entry.clubName, t('bonuspunten.duelsSubtitle', { won: entry.duelsWon, lost: entry.duelsLost })].filter(Boolean).join(' · ')}
                {...rankingValues(entry.duelDiff, entry.games, { showSign: true })}
                qualifies={BONUS_CRITERIA.duels(entry)}
                onClick={() => handleSelectFromRanking(entry)}
                {...starProps(entry)}
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
                subtitle={entry.clubName}
                {...rankingValues(entry.defensiveHeaders, entry.games)}
                qualifies={BONUS_CRITERIA.defensiveHeaders(entry)}
                onClick={() => handleSelectFromRanking(entry)}
                {...starProps(entry)}
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
                subtitle={entry.clubName}
                {...rankingValues(entry.recoveries, entry.games)}
                qualifies={BONUS_CRITERIA.recoveries(entry)}
                onClick={() => handleSelectFromRanking(entry)}
                {...starProps(entry)}
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
                subtitle={entry.clubName}
                {...rankingValues(entry.bigChances, entry.games)}
                qualifies={BONUS_CRITERIA.bigChances(entry)}
                onClick={() => handleSelectFromRanking(entry)}
                {...starProps(entry)}
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
                  subtitle={entry.clubName}
                  {...rankingValues(entry.bonusPoints, entry.games)}
                  qualifies
                  onClick={() => handleSelectFromRanking(entry)}
                  {...starProps(entry)}
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
