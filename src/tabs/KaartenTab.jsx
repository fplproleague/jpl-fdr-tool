// Inhoud van de Kaarten-tab: rangschikking van gele kaarten per speler, met twee sorteermodi ("Meeste
// gele kaarten" en "Dichtst bij schorsing"). Bron van de gele-kaarten-telling is de gedeelde
// spelersdatabank (playerDatabase.yellowCards, zie parsePlayerDatabaseCsv in constants.js) — die is al
// elders in FDRTool.jsx opgehaald/geparset (zelfde props als WatchlistTab/TeamPlannerTab), dus geen eigen
// CSV-fetch/parsing meer hier (voorheen een aparte, nooit ingevulde KAARTEN_CSV_URL-sheet).
import { useMemo, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { RankingRow, watchProps, clubProps } from '../components/RankingRow';
import ScopeFilter, { ScopeEmptyMessage, makeScopeMatcher } from '../components/ScopeFilter';
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

// Enkel spelers vanaf 2 gele kaarten zijn relevant genoeg om in de lijst over de hele competitie te
// tonen — 0 of 1 kaart is nog te vroeg om interessant te zijn. Die drempel geldt alleen ZONDER filter:
// kijk je naar je eigen ploeg of watchlist, dan wil je je spelers zien staan, ook de brave (zie
// visibleRanking hieronder). De rangschikking zelf loopt sowieso over iedereen, zodat ook een speler
// met één kaart een echte plaats in de ranglijst heeft.
const MIN_VISIBLE_CARDS = 2;

export default function KaartenTab({
  t, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
  toggleWatchlistPlayer, isPlayerWatched, isPlayerInMyTeam, hasMyTeam, hasWatchlist,
  onOpenPlayer, onOpenClub,
}) {
  const [sortMode, setSortMode] = useState('mostCards');
  const [scope, setScope] = useState('all');

  const allEntries = useMemo(() => buildKaartenEntries(playerDatabase), [playerDatabase]);

  // De rangschikking loopt over ÁLLE spelers, ook die met 0 of 1 kaart. Dat is nieuw: vroeger werd er
  // pas gerangschikt na de 2+-drempel. Het verandert niets aan wat je zonder filter ziet — spelers met
  // meer kaarten staan sowieso bovenaan — maar het maakt de rang van iemand met één kaart wél
  // uitdrukbaar, en dat heb je nodig zodra je op je eigen ploeg filtert.
  //
  // De rang zelf komt uit kaarten.js (competition ranking: gelijk aantal kaarten = gelijke rang) en
  // wordt na het filteren niet herberekend: hij blijft de plaats in de volledige ranglijst.
  const ranking = useMemo(
    () => (sortMode === 'closestToSuspension' ? rankByClosestToSuspension(allEntries) : rankByMostCards(allEntries)),
    [allEntries, sortMode],
  );
  const matchesScope = makeScopeMatcher(scope, { isPlayerWatched, isPlayerInMyTeam });
  // Zonder filter blijft de 2+-drempel gelden: 0 of 1 kaart is te vroeg om interessant te zijn in een
  // lijst over de hele competitie. Filter je op je eigen ploeg of watchlist, dan valt die drempel weg —
  // dan wil je je vijftien spelers zien staan, ook de brave.
  const visibleRanking = scope === 'all'
    ? ranking.filter(e => e.cards >= MIN_VISIBLE_CARDS)
    : ranking.filter(e => matchesScope(e.player, e.clubCode));
  const visibleSortModes = SORT_MODES.filter(m => SHOW_CLOSEST_TO_SUSPENSION_MODE || m.key !== 'closestToSuspension');

  return (
    <>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '18px' }}>
        {t('kaarten.suspensionExplainer')}
      </p>

      <ScopeFilter t={t} scope={scope} onChange={setScope} />

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

      {/* Drie lege toestanden, in deze volgorde: geen databank, wel een databank maar (zonder filter)
          niemand met 2+ kaarten, en de filter-specifieke uitleg. De tweede geldt bewust enkel zonder
          filter — met een filter aan zegt "niemand heeft 2+ kaarten" niets over jouw ploeg, want die
          drempel telt dan niet. */}
      {!playerDatabaseLoading && !playerDatabaseError && allEntries.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>{t('kaarten.emptyNoData')}</p>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && allEntries.length > 0 && scope === 'all' && visibleRanking.length === 0 && (
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
            {t('kaarten.emptyNoQualifying', { min: MIN_VISIBLE_CARDS })}
          </p>
        </div>
      )}

      {!playerDatabaseLoading && !playerDatabaseError && allEntries.length > 0 && scope !== 'all' && visibleRanking.length === 0 && (
        <ScopeEmptyMessage t={t} scope={scope} hasAny={scope === 'myTeam' ? hasMyTeam : hasWatchlist} />
      )}

      {!playerDatabaseLoading && !playerDatabaseError && visibleRanking.length > 0 && (
        <div style={{ display: 'grid', gap: '8px' }}>
          {visibleRanking.map(entry => {
            const warning = isOneCardFromSuspension(entry);
            const subtitle = sortMode === 'closestToSuspension'
              ? `${entry.clubName} · ${entry.cards}/${entry.nextThreshold} ${t('kaarten.cardsUnit')}`
              : entry.clubName;
            const value = sortMode === 'closestToSuspension' ? entry.cardsRemaining : entry.cards;
            return (
              <RankingRow
                key={entry.player} rank={entry.rank} clubCode={entry.clubCode} player={entry.player}
                subtitle={subtitle} value={value}
                qualifies={sortMode === 'closestToSuspension' || warning}
                warning={warning}
                onClick={onOpenPlayer ? () => onOpenPlayer(entry.player, entry.clubCode) : undefined}
                {...watchProps({ name: entry.player, teamCode: entry.clubCode }, { isPlayerWatched, toggleWatchlistPlayer, t })}
                {...clubProps({ clubCode: entry.clubCode, clubName: entry.clubName }, { onOpenClub, t })}
              />
            );
          })}
        </div>
      )}
    </>
  );
}
