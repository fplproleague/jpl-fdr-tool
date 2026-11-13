// Inhoud van de Kaarten-tab: rangschikking van gele kaarten per speler, met de afstand tot de volgende
// schorsing. Bron van de gele kaarten is de gedeelde spelersdatabank (playerDatabase.yellowCards, zie
// parsePlayerDatabaseCsv in constants.js), die FDRTool.jsx al ophaalt. De schorsingslogica staat in
// src/kaarten.js en is ongewijzigd.
//
// Sinds de rework (spec §7.6): één tabel (# · ster · speler · club · Geel · Rood · Tot schorsing).
// Wie bij de volgende gele kaart geschorst is, krijgt een rode badge "1 tot schorsing"; geen rode rij.
// Rode kaarten staan niet in de spelersdatabank: die komen uit de Fantasy Pro League-data (dezelfde
// bron als de Spelers-tab), en tonen "—" zolang die niet geladen is of de speler er niet in staat.
import { useMemo, useState } from 'react';
import { resolveStatsUpdatedGw } from '../constants';
import ScopeFilter, { ScopeEmptyMessage, makeScopeMatcher } from '../components/ScopeFilter';
import { RankingIdent, ClubCell } from '../components/RankingCells';
import PageHeader from '../ui/PageHeader';
import Segmented from '../ui/Segmented';
import DataTable from '../ui/DataTable';
import Badge from '../ui/Badge';
import ErrorBanner from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import usePlayerIndex from '../data/usePlayerIndex';
import { buildKaartenEntries, rankByMostCards, rankByClosestToSuspension, isOneCardFromSuspension } from '../kaarten';

const KAARTEN_UPDATED_GW = resolveStatsUpdatedGw();

// Tijdelijk verborgen (sinds 16 aug 2026, ±1 maand): het aantal kaarten is dit vroeg in het seizoen nog
// te laag om "dichtst bij schorsing" zinvol te maken. Zet terug op true om de sorteerkeuze weer te
// tonen; de standaard ('mostCards') blijft ondertussen gewoon werken.
const SHOW_CLOSEST_TO_SUSPENSION_MODE = false;

const SORT_MODES = [
  { key: 'mostCards', labelKey: 'kaarten.sortMode.mostCards' },
  { key: 'closestToSuspension', labelKey: 'kaarten.sortMode.closestToSuspension' },
];

// Zonder filter enkel spelers vanaf 2 gele kaarten: 0 of 1 is te vroeg om interessant te zijn in een
// lijst over de hele competitie. Filter je op je eigen ploeg of watchlist, dan valt die drempel weg.
// De rangschikking zelf loopt over iedereen, zodat ook een speler met één kaart een echte plaats heeft.
const MIN_VISIBLE_CARDS = 2;

export default function KaartenTab({
  t, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
  toggleWatchlistPlayer, isPlayerWatched, isPlayerInMyTeam, hasMyTeam, hasWatchlist,
  onOpenPlayer, onOpenClub,
}) {
  const [sortMode, setSortMode] = useState('mostCards');
  const [scope, setScope] = useState('all');
  const { find } = usePlayerIndex();

  const allEntries = useMemo(() => buildKaartenEntries(playerDatabase), [playerDatabase]);
  // De rang komt uit kaarten.js (gelijk aantal kaarten = gelijke rang) en wordt na het filteren niet
  // herberekend: hij blijft de plaats in de volledige ranglijst.
  const ranking = useMemo(
    () => (sortMode === 'closestToSuspension' ? rankByClosestToSuspension(allEntries) : rankByMostCards(allEntries)),
    [allEntries, sortMode],
  );
  const matchesScope = makeScopeMatcher(scope, { isPlayerWatched, isPlayerInMyTeam });
  const visibleRanking = scope === 'all'
    ? ranking.filter(e => e.cards >= MIN_VISIBLE_CARDS)
    : ranking.filter(e => matchesScope(e.player, e.clubCode));
  const visibleSortModes = SORT_MODES.filter(m => SHOW_CLOSEST_TO_SUSPENSION_MODE || m.key !== 'closestToSuspension');
  const closest = sortMode === 'closestToSuspension';

  const columns = [
    {
      key: 'player', label: t('bonuspunten.col.player'), sticky: true, stickyEdge: true, rowHeader: true,
      className: 'rk-col-player',
      render: e => (
        <RankingIdent
          t={t} rank={e.rank} name={e.player} clubCode={e.clubCode}
          isPlayerWatched={isPlayerWatched} toggleWatchlistPlayer={toggleWatchlistPlayer}
        />
      ),
    },
    {
      key: 'club', label: t('bonuspunten.col.club'), className: 'rk-col-club',
      render: e => <ClubCell t={t} clubCode={e.clubCode} clubName={e.clubName} onOpenClub={onOpenClub} />,
    },
    {
      key: 'yellow', label: t('kaarten.col.yellow'), title: t('kaarten.col.yellowTitle'), num: true,
      render: e => e.cards,
      cellClass: () => (closest ? '' : 'rk-value'),
    },
    {
      key: 'red', label: t('kaarten.col.red'), num: true, className: 'rk-col-extra',
      render: e => find(e.player, e.clubCode)?.rc ?? null,
    },
    {
      key: 'remaining', label: t('kaarten.col.remaining'), title: t('kaarten.col.remainingTitle'), num: true,
      // Nog 1 kaart tot schorsing: de badge zegt het al, dus geen los cijfer ernaast.
      render: e => (isOneCardFromSuspension(e)
        ? <Badge tone="danger">{t('kaarten.oneToSuspension')}</Badge>
        : e.cardsRemaining),
      cellClass: () => (closest ? 'rk-value' : ''),
    },
  ];

  const ready = !playerDatabaseLoading && !playerDatabaseError;
  const meta = KAARTEN_UPDATED_GW > 0
    ? <span className="num">{t('bonuspunten.updatedMeta', { gw: KAARTEN_UPDATED_GW })}</span>
    : null;

  return (
    <div className="rk">
      <PageHeader
        title={t('nav.kaarten')}
        meta={meta}
        intro={t('kaarten.introShort')}
        more={<p>{t('kaarten.suspensionExplainer')}</p>}
        moreLabel={t('shared.explain')}
      />

      <div className="rk-toolbar">
        {visibleSortModes.length > 1 && (
          <Segmented
            ariaLabel={t('bonuspunten.sortLabel')}
            value={sortMode}
            onChange={setSortMode}
            options={visibleSortModes.map(({ key, labelKey }) => ({ value: key, label: t(labelKey) }))}
          />
        )}
        <ScopeFilter t={t} scope={scope} onChange={setScope} />
      </div>

      {!playerDatabaseLoading && playerDatabaseError && (
        <ErrorBanner onRetry={fetchPlayerDatabase} retryLabel={t('shared.retry')}>{t(playerDatabaseError)}</ErrorBanner>
      )}

      {/* Drie lege toestanden: geen databank; wel een databank maar (zonder filter) niemand met 2+
          kaarten; en de filter-specifieke uitleg. */}
      {ready && allEntries.length === 0 && <EmptyState>{t('kaarten.emptyNoData')}</EmptyState>}
      {ready && allEntries.length > 0 && scope === 'all' && visibleRanking.length === 0 && (
        <EmptyState>{t('kaarten.emptyNoQualifying', { min: MIN_VISIBLE_CARDS })}</EmptyState>
      )}
      {ready && allEntries.length > 0 && scope !== 'all' && visibleRanking.length === 0 && (
        <ScopeEmptyMessage t={t} scope={scope} hasAny={scope === 'myTeam' ? hasMyTeam : hasWatchlist} />
      )}

      {(playerDatabaseLoading || (ready && visibleRanking.length > 0)) && (
        <DataTable
          className="rk-table"
          bleed
          loading={playerDatabaseLoading}
          columns={columns}
          rows={visibleRanking}
          rowKey={e => `${e.player}|${e.clubCode}`}
          onRowClick={onOpenPlayer ? (e => onOpenPlayer(e.player, e.clubCode)) : undefined}
          rowLabel={e => t('playerSheet.openAria', { name: e.player })}
          sort={{ key: closest ? 'remaining' : 'yellow', dir: closest ? 'asc' : 'desc' }}
          ariaLabel={t('nav.kaarten')}
        />
      )}
    </div>
  );
}
