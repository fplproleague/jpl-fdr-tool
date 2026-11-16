// Klassement-tab: zoek een team op naam in het algemene of speeldagklassement. Data via /api/rankings
// (zie api/rankings.js), dat de namen van de managers er bewust uithaalt: de site toont enkel teamnamen.
//
// Sinds de rework (spec §7.8): PageHeader + zoekveld + keuze Algemeen/Speeldag N + één tabel
// (# · Team · Punten), met onderaan één regel promo voor de minileague van @fpl_proleague.
// De minileague-zoekfunctie is weg; api/rankings.js kan het nog, maar de site vraagt het niet meer op.
//
// "Mijn team volgen" (spec E5): een ster bij een rij bewaart dat team (team-ID + teamnaam, zie
// myRankTeam.js). Bovenaan staat dan meteen de rang in het algemene klassement en in de laatste
// speeldag. Ook daar enkel teamnamen.
//
// Wat NIET kan (de bron vraagt daarvoor een login): de opstelling of kapitein van een team.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { CURRENT_GW } from '../constants';
import PageHeader from '../ui/PageHeader';
import SearchField from '../ui/SearchField';
import Select from '../ui/Select';
import DataTable from '../ui/DataTable';
import Button from '../ui/Button';
import ErrorBanner from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import StarButton from '../ui/StarButton';
import { findTeamRow, loadMyRankTeam, saveMyRankTeam } from '../myRankTeam';
import './KlassementTab.css';

// Vroeger bewaarde de tab hier de laatst bekeken minileague. Die functie is weg: eenmalig opruimen.
const OLD_LEAGUE_STORAGE_KEY = 'fpl_proleague_klassement_league_v1';
const GENERAL_START_GW = 8;
const SEARCH_DELAY_MS = 350;
const lastPlayedGw = Math.max(1, CURRENT_GW - 1);
const weekOptions = Array.from({ length: lastPlayedGw }, (_, i) => lastPlayedGw - i);

function readParams() {
  const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const gw = Number(p.get('rgw'));
  return {
    team: (p.get('team') ?? '').slice(0, 40),
    rgw: weekOptions.includes(gw) ? gw : 0, // 0 = algemeen klassement
  };
}

function writeParams(patch) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value == null || value === 0) p.delete(key);
    else p.set(key, String(value));
  }
  const s = p.toString();
  const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
  if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
}

async function fetchRankings(params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== 0).map(([k, v]) => [k, String(v)]));
  const response = await fetch(`/api/rankings?${query}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Array.isArray(body.rows)) {
    const err = new Error(body?.error || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}

// Lijst-logica: eerste pagina laden, "meer laden", fouten. Een oudere aanvraag die later terugkomt,
// overschrijft een nieuwere niet.
function usePagedRankings() {
  const [state, setState] = useState({ rows: [], total: 0, page: 0, loading: false, error: null });
  const requestRef = useRef(0);
  const load = useCallback(async (params, page = 1) => {
    const requestId = ++requestRef.current;
    setState(s => ({ ...s, loading: true, error: null, params, ...(page === 1 ? { rows: [], total: 0, page: 0 } : {}) }));
    try {
      const body = await fetchRankings({ ...params, page });
      if (requestId !== requestRef.current) return;
      setState(s => ({
        rows: page === 1 ? body.rows : [...s.rows, ...body.rows],
        total: body.total, page, loading: false, error: null, params,
      }));
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setState(s => ({ ...s, loading: false, error: err }));
    }
  }, []);
  return [state, load];
}

const formatNumber = n => Number(n).toLocaleString('nl-BE');

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// Rang van het gevolgde team: algemeen (met het totaal aantal teams) en in de laatste speeldag.
function useMyRank(team) {
  const [state, setState] = useState({ loading: false, error: false, general: null, total: null, week: null });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!team) return undefined;
    let cancelled = false;
    setState({ loading: true, error: false, general: null, total: null, week: null });
    const { teamId, naam } = team;
    Promise.allSettled([
      findTeamRow(page => fetchRankings({ type: 'general', name: naam, page }), teamId),
      fetchRankings({ type: 'general', page: 1 }).then(body => body.total),
      findTeamRow(page => fetchRankings({ type: 'week', weekId: lastPlayedGw, name: naam, page }), teamId),
    ]).then(([general, total, week]) => {
      if (cancelled) return;
      setState({
        loading: false,
        error: general.status === 'rejected' && week.status === 'rejected',
        general: general.status === 'fulfilled' ? general.value : null,
        total: total.status === 'fulfilled' ? total.value : null,
        week: week.status === 'fulfilled' ? week.value : null,
      });
    });
    return () => { cancelled = true; };
  }, [team, attempt]);
  return [state, () => setAttempt(n => n + 1)];
}

function MyRank({ t, team, onUnfollow }) {
  const [state, retry] = useMyRank(team);
  const { general, total, week } = state;
  let main;
  if (state.loading) main = <span className="kl-mine__muted">{t('shared.loading')}</span>;
  else if (state.error) {
    main = (
      <>
        <span className="kl-mine__muted">{t('klassement.mine.error')}</span>
        <Button variant="ghost" size="sm" onClick={retry}>{t('shared.retry')}</Button>
      </>
    );
  } else {
    main = (
      <>
        {general?.rank
          ? <span>{total ? t('klassement.mine.rankOf', { rank: formatNumber(general.rank), total: formatNumber(total) }) : t('klassement.mine.rank', { rank: formatNumber(general.rank) })}</span>
          : <span className="kl-mine__muted">{t(general ? 'klassement.mine.noRank' : 'klassement.mine.notFound')}</span>}
        {general && <><span className="kl-mine__sep" aria-hidden="true"> · </span><span className="num">{t('klassement.mine.points', { points: formatNumber(general.points) })}</span></>}
      </>
    );
  }
  return (
    <section className="kl-mine" aria-labelledby="kl-mine-title">
      <div className="kl-mine__line">
        <strong id="kl-mine-title">{t('klassement.mine.title')}</strong>
        <span className="kl-mine__sep" aria-hidden="true"> · </span>
        <span className="kl-mine__name">{team.naam}</span>
        <span className="kl-mine__sep" aria-hidden="true"> · </span>
        {main}
      </div>
      {!state.loading && !state.error && (
        <div className="kl-mine__week">
          {week?.rank
            ? t('klassement.mine.week', { gw: lastPlayedGw, rank: formatNumber(week.rank), points: formatNumber(week.points) })
            : t('klassement.mine.weekNone', { gw: lastPlayedGw })}
        </div>
      )}
      <Button variant="ghost" size="sm" className="kl-mine__unfollow" onClick={onUnfollow}>{t('klassement.mine.unfollow')}</Button>
    </section>
  );
}

export default function KlassementTab({ t, minileagueCode, onCopyMinileague, minileagueCopied }) {
  const initial = useRef(readParams()).current;
  const [query, setQuery] = useState(initial.team);
  const [rgw, setRgw] = useState(initial.rgw);
  const [state, load] = usePagedRankings();
  const [lastSearch, setLastSearch] = useState(initial.team);
  const [myTeam, setMyTeam] = useState(() => loadMyRankTeam(getStorage()));
  const followTeam = (row) => {
    const next = myTeam?.teamId === row.teamId ? null : { teamId: row.teamId, naam: row.team };
    saveMyRankTeam(getStorage(), next);
    setMyTeam(next);
  };

  const runSearch = useCallback((name, gw) => {
    const params = gw ? { type: 'week', weekId: gw, name } : { type: 'general', name };
    setLastSearch(name);
    writeParams({ team: name, rgw: gw });
    load(params, 1);
  }, [load]);

  // Bij het openen: het klassement (of de zoekopdracht uit de URL) laden, en de oude bewaarde
  // minileague opruimen.
  useEffect(() => {
    try { window.localStorage?.removeItem(OLD_LEAGUE_STORAGE_KEY); } catch { /* geen opslag: ook goed */ }
    runSearch(initial.team, initial.rgw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zoeken terwijl je typt, met een korte pauze zodat niet elke letter een aanvraag wordt.
  useEffect(() => {
    const name = query.trim();
    if (name === lastSearch) return undefined;
    const timer = setTimeout(() => runSearch(name, rgw), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, lastSearch, rgw, runSearch]);

  const chooseRanking = value => {
    const gw = Number(value);
    setRgw(gw);
    runSearch(query.trim(), gw);
  };

  const showGeneralNote = !rgw && CURRENT_GW <= GENERAL_START_GW + 1;
  const firstLoad = state.loading && state.rows.length === 0;
  const hasRows = state.rows.length > 0;
  const loaded = !state.loading && !state.error && state.page > 0;

  const columns = [
    {
      key: 'rank', label: '#', title: t('klassement.rank'), num: true, className: 'kl-col-rank',
      render: r => (r.rank ? formatNumber(r.rank) : null),
      cellClass: r => (r.rank && r.rank <= 3 ? 'is-top' : ''),
    },
    {
      key: 'team', label: t('klassement.team'), rowHeader: true, className: 'kl-col-team',
      render: r => r.team || null,
    },
    {
      key: 'points', label: t('klassement.points'), num: true, className: 'kl-col-points',
      render: r => r.points,
    },
    {
      key: 'mine', label: <span className="ui-sr-only">{t('klassement.mine.follow')}</span>, className: 'kl-col-mine',
      render: r => (r.teamId && r.team ? (
        <StarButton
          active={myTeam?.teamId === r.teamId}
          onClick={() => followTeam(r)}
          addLabel={t('klassement.mine.followAria', { team: r.team })}
          removeLabel={t('klassement.mine.unfollowAria', { team: r.team })}
        />
      ) : null),
    },
  ];

  const caption = lastSearch
    ? t('klassement.resultsFor', { n: formatNumber(state.total), q: lastSearch })
    : t(rgw ? 'klassement.topWeek' : 'klassement.topGeneral', { gw: rgw, n: formatNumber(state.total) });

  const moreButton = hasRows && state.rows.length < state.total ? (
    <Button variant="secondary" onClick={() => load(state.params, state.page + 1)} disabled={state.loading}>
      {t('klassement.more')}
    </Button>
  ) : null;

  return (
    <div className="kl">
      <PageHeader title={t('nav.klassement')} intro={t('klassement.intro')} />

      {myTeam && <MyRank t={t} team={myTeam} onUnfollow={() => { saveMyRankTeam(getStorage(), null); setMyTeam(null); }} />}

      <form className="kl-toolbar" role="search" onSubmit={e => { e.preventDefault(); runSearch(query.trim(), rgw); }}>
        <SearchField
          className="kl-search"
          value={query}
          onChange={setQuery}
          maxLength={40}
          placeholder={t('klassement.teamPlaceholder')}
          clearLabel={t('picker.clear')}
        />
        <Select
          className="kl-select"
          value={rgw}
          onChange={chooseRanking}
          aria-label={t('klassement.rankingType')}
          options={[
            { value: 0, label: t('klassement.general') },
            ...weekOptions.map(w => ({ value: w, label: t('klassement.weekOption', { gw: w }) })),
          ]}
        />
      </form>
      {showGeneralNote && <p className="kl-note">{t('klassement.generalNote', { gw: GENERAL_START_GW })}</p>}

      {state.error && (
        <ErrorBanner onRetry={() => load(state.params, hasRows ? state.page + 1 : 1)} retryLabel={t('shared.retry')}>
          {t('klassement.error')}
        </ErrorBanner>
      )}

      {loaded && !hasRows && <EmptyState>{t('klassement.noTeams', { q: lastSearch })}</EmptyState>}

      {(firstLoad || hasRows) && (
        <>
          {!firstLoad && <p className="kl-caption">{caption}</p>}
          <DataTable
            className="kl-table"
            bleed
            loading={firstLoad}
            columns={columns}
            rows={state.rows}
            rowKey={(r, i) => `${r.teamId}-${i}`}
            ariaLabel={t('nav.klassement')}
            footer={moreButton}
          />
        </>
      )}

      <p className="kl-promo">
        {t('klassement.promo')}{' '}
        <button
          type="button" className="kl-promo__code" onClick={onCopyMinileague}
          aria-label={t('header.copyMinileagueAria', { code: minileagueCode })}
        >
          <span className="num">{minileagueCode}</span>
          {minileagueCopied ? <Check aria-hidden="true" strokeWidth={2} /> : <Copy aria-hidden="true" strokeWidth={1.75} />}
        </button>
        {minileagueCopied && <span className="ui-sr-only" role="status">{t('shell.copied')}</span>}
      </p>
      <p className="kl-note">{t('klassement.privacy')}</p>
    </div>
  );
}
