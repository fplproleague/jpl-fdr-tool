// Inhoud van de Bonuspunten-tab: rangschikkingen van de vier statistieken die een Fantasy Pro League-
// bonuspunt kunnen opleveren (meer duels gewonnen dan verloren, >3 verdedigende kopballen, >5 recoveries,
// >1 grote kans), plus de algemene "meeste bonuspunten"-rangschikking. Bron is de gedeelde
// spelersdatabank (playerDatabase.duelsWon/.../.bonusPoints, zie parsePlayerDatabaseCsv in constants.js),
// die FDRTool.jsx al ophaalt. De berekening zelf staat in src/bonuspunten.js en is ongewijzigd.
//
// Sinds de rework (spec §7.5): één tabel i.p.v. vijf inklapbare lijsten met kaartrijen. Bovenaan kies
// je de statistiek (standaard Totaal = meeste bonuspunten), totaal of per wedstrijd, en de scope.
import { useCallback, useMemo, useState } from 'react';
import { resolveStatsUpdatedGw } from '../constants';
import ScopeFilter, { ScopeEmptyMessage, makeScopeMatcher } from '../components/ScopeFilter';
import { RankingIdent, ClubCell } from '../components/RankingCells';
import PageHeader from '../ui/PageHeader';
import SearchField from '../ui/SearchField';
import Segmented from '../ui/Segmented';
import DataTable from '../ui/DataTable';
import ErrorBanner, { Notice } from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import { normalizePlayerName } from '../data/usePlayerIndex';
import {
  buildBonuspuntenEntries, rankByDuels, rankByDefensiveHeaders, rankByRecoveries, rankByBigChances,
  rankByBonusPoints, SORT_MODES, minGamesForPerMatch, TOP_N,
} from '../bonuspunten';

// De sheet wordt elke maandagmiddag na een speeldag bijgewerkt; de GW volgt uit de deadlines (zie
// resolveStatsUpdatedGw in constants.js).
const BONUSPUNTEN_UPDATED_GW = resolveStatsUpdatedGw();

// De vijf statistieken. `pick` = de waarde waarop gerangschikt wordt; `rank` = de bestaande
// rangschikkingsfunctie uit bonuspunten.js; `sign` = toon een +-teken (duelsaldo kan negatief zijn).
const STATS = {
  duels: { rank: rankByDuels, pick: e => e.duelDiff, sign: true, section: 'duels' },
  headers: { rank: rankByDefensiveHeaders, pick: e => e.defensiveHeaders, section: 'headers' },
  recoveries: { rank: rankByRecoveries, pick: e => e.recoveries, section: 'recoveries' },
  bigChances: { rank: rankByBigChances, pick: e => e.bigChances, section: 'bigChances' },
  total: { rank: rankByBonusPoints, pick: e => e.bonusPoints, section: 'bonusPoints' },
};
const STAT_KEYS = ['duels', 'headers', 'recoveries', 'bigChances', 'total'];

const withSign = (v, sign) => `${sign && v > 0 ? '+' : ''}${v}`;

export default function BonuspuntenTab({
  t, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
  toggleWatchlistPlayer, isPlayerWatched, isPlayerInMyTeam, hasMyTeam, hasWatchlist,
  onOpenPlayer, onOpenClub,
}) {
  const [stat, setStat] = useState('total');
  // Eén sorteermodus en één scope voor de hele tabel: je stelt één vraag ("wie is de beste per match?",
  // "hoe doen mijn spelers het?").
  const [sortMode, setSortMode] = useState(SORT_MODES.total);
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');

  const entries = useMemo(() => buildBonuspuntenEntries(playerDatabase), [playerDatabase]);
  const minGames = useMemo(() => minGamesForPerMatch(entries), [entries]);
  const isPerMatch = sortMode === SORT_MODES.perMatch;
  const def = STATS[stat];
  const ranking = useMemo(() => def.rank(entries, sortMode, minGames), [def, entries, sortMode, minGames]);

  // Zonder filter en zonder zoekterm blijft het een top 15: daar dient de lijst voor. Filter je op je
  // eigen ploeg of watchlist, of zoek je een naam, dan zie je álle treffers, ook die op plaats 47: een
  // speler buiten de top 15 is geen speler zonder cijfers, en juist dat nummer is dan de informatie.
  const matchesScope = makeScopeMatcher(scope, { isPlayerWatched, isPlayerInMyTeam });
  const q = normalizePlayerName(query);
  const rows = useMemo(() => {
    if (scope === 'all' && !q) return ranking.slice(0, TOP_N);
    return ranking.filter(e => matchesScope(e.player, e.clubCode) && (!q || normalizePlayerName(e.player).includes(q)));
  }, [ranking, scope, q, matchesScope]);

  const onSort = useCallback((key) => setSortMode(key === 'perMatch' ? SORT_MODES.perMatch : SORT_MODES.total), []);

  const perMatchText = (e) => {
    if (!e.games) return null;
    const v = def.pick(e) / e.games;
    return `${def.sign && v > 0 ? '+' : ''}${v.toFixed(2)}`;
  };

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
    ...(stat === 'duels' ? [
      { key: 'won', label: t('bonuspunten.col.won'), num: true, className: 'rk-col-extra', render: e => e.duelsWon },
      { key: 'lost', label: t('bonuspunten.col.lost'), num: true, className: 'rk-col-extra', render: e => e.duelsLost },
    ] : []),
    {
      key: 'value', label: t(`bonuspunten.col.value.${stat}`), title: t(`bonuspunten.section.${def.section}`),
      num: true, sortable: true,
      render: e => withSign(def.pick(e), def.sign),
      cellClass: e => ['rk-value', e.rank <= 3 && 'is-top'].filter(Boolean).join(' '),
    },
    {
      key: 'perMatch', label: t('bonuspunten.col.perMatch'), title: t('bonuspunten.sortPerMatch'),
      num: true, sortable: true,
      render: perMatchText,
      cellClass: () => (isPerMatch ? 'is-strong' : 'is-muted'),
    },
  ];

  const ready = !playerDatabaseLoading && !playerDatabaseError;
  const meta = BONUSPUNTEN_UPDATED_GW > 0
    ? <span className="num">{t('bonuspunten.updatedMeta', { gw: BONUSPUNTEN_UPDATED_GW })}</span>
    : null;

  return (
    <div className="rk">
      <PageHeader
        title={t('nav.bonuspunten')}
        meta={meta}
        intro={t('bonuspunten.introShort')}
        more={<p>{t('bonuspunten.intro')}</p>}
        moreLabel={t('shared.explain')}
      />

      <div className="rk-toolbar">
        <SearchField
          className="rk-toolbar__search"
          value={query}
          onChange={v => setQuery(v.slice(0, 40))}
          placeholder={t('bonuspunten.searchPlaceholder')}
          clearLabel={t('picker.clear')}
        />
      </div>
      <div className="rk-toolbar">
        <Segmented
          ariaLabel={t('bonuspunten.statAria')}
          value={stat}
          onChange={setStat}
          options={STAT_KEYS.map(k => ({ value: k, label: t(`bonuspunten.tab.${k}`) }))}
        />
        <Segmented
          ariaLabel={t('bonuspunten.sortLabel')}
          value={sortMode}
          onChange={setSortMode}
          options={[
            { value: SORT_MODES.total, label: t('bonuspunten.sortTotal') },
            { value: SORT_MODES.perMatch, label: t('bonuspunten.sortPerMatch') },
          ]}
        />
        <ScopeFilter t={t} scope={scope} onChange={setScope} />
      </div>

      {isPerMatch && <Notice>{t('bonuspunten.sortPerMatchNote', { minGames })}</Notice>}

      {!playerDatabaseLoading && playerDatabaseError && (
        <ErrorBanner onRetry={fetchPlayerDatabase} retryLabel={t('shared.retry')}>{t(playerDatabaseError)}</ErrorBanner>
      )}

      {ready && entries.length === 0 && <EmptyState>{t('bonuspunten.emptyState')}</EmptyState>}

      {(playerDatabaseLoading || (ready && entries.length > 0)) && (
        <>
          <h2 className="label rk-caption">
            {t(`bonuspunten.section.${def.section}`)}
            {scope === 'all' && !q ? ` · ${t('bonuspunten.topN', { n: TOP_N })}` : ''}
          </h2>
          {ready && rows.length === 0 ? (
            scope !== 'all' && !q
              ? <ScopeEmptyMessage t={t} scope={scope} hasAny={scope === 'myTeam' ? hasMyTeam : hasWatchlist} />
              : <EmptyState>{t('bonuspunten.noMatch')}</EmptyState>
          ) : (
            <DataTable
              className="rk-table"
              bleed
              loading={playerDatabaseLoading}
              columns={columns}
              rows={rows}
              rowKey={e => `${e.player}|${e.clubCode}`}
              onRowClick={onOpenPlayer ? (e => onOpenPlayer(e.player, e.clubCode)) : undefined}
              rowLabel={e => t('playerSheet.openAria', { name: e.player })}
              sort={{ key: isPerMatch ? 'perMatch' : 'value', dir: 'desc' }}
              onSort={onSort}
              ariaLabel={t(`bonuspunten.section.${def.section}`)}
            />
          )}
        </>
      )}

      <p className="rk-note">{t('bonuspunten.sources')}</p>
    </div>
  );
}
