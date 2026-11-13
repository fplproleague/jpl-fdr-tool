// Spelers-tab: een database van alle Fantasy Pro League-spelers om te filteren, sorteren, vergelijken
// en per speler de historiek te bekijken. Data uit /api/players (zie api/players.js); rekenlogica in
// src/spelers.js. Alle instellingen staan in de URL, zodat een gefilterde lijst of een vergelijking
// deelbaar is (bv. /spelers?compare=107,99).
//
// Opzet sinds de rework (spec §7.4 + §8): bovenaan zoeken, positie en de kolompresets; de rest zit in
// de filterlade. Actieve filters staan als chips onder de toolbar. De ster in elke rij is het
// toevoegpunt van de watchlist (de aparte Watchlist-tab is weg), en "★ Watchlist" in de filterlade
// toont enkel die spelers. Vergelijken is een aparte modus, zodat een rij standaard maar één knop heeft.
//
// Bij een fout van de bron toont de tab de laatst bekende data (eerst van de server, anders uit deze
// browser) met een duidelijke melding, nooit een lege pagina.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SlidersHorizontal, X, Link2, Check, Scale } from 'lucide-react';
import { CURRENT_GW, TEAMS_ALPHA } from '../constants';
import ScopeFilter, { ScopeEmptyMessage } from '../components/ScopeFilter';
import { Sparkline, UpcomingFixtures, ClubLogo } from '../components/SpelersParts';
import Sheet from '../components/Sheet';
import PageHeader from '../ui/PageHeader';
import SearchField from '../ui/SearchField';
import Segmented from '../ui/Segmented';
import Select from '../ui/Select';
import Button from '../ui/Button';
import Switch from '../ui/Switch';
import DataTable from '../ui/DataTable';
import PlayerCell from '../ui/PlayerCell';
import { PlayerFace } from '../ui/PlayerFace';
import StarButton from '../ui/StarButton';
import FilterChip, { FilterChips } from '../ui/FilterChip';
import ErrorBanner, { Notice } from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import {
  COLUMNS, PRESETS, PRESET_KEYS, PRESET_SORT, POSITION_KEYS, PERIODS, MIN_MINUTES_OPTIONS, MAX_COMPARE, COMPARE_ROWS,
  DEFAULT_STATE, DIFFERENTIAL_MAX_SEL, buildRow, cellValue, formatCell, filterRows, sortRows, bestIndexes,
  stateFromSearch, searchFromState, buildSheetNameResolver, MIN_MINUTES_PER90, FORM_GWS,
} from '../spelers';
import { getSessionPlayers, loadPlayers } from '../data/playersApi';
import { useAvailabilityLookup } from '../availabilityContext';
import { isAvailable } from '../availability';
import './SpelersTab.css';

// Dezelfde spelerskaart als overal op de site (spec §7.9), hier geopend via ?speler=<id>.
const PlayerSheet = lazy(() => import('../components/PlayerSheet'));

const PAGE_SIZE = 60;
const FIXED_SORT_KEYS = ['name', 'club', 'pos'];

// --- Data ophalen --------------------------------------------------------------------------------
// Eén keer per sessie, gedeeld met de andere tabs (zie src/data/playersApi.js): terugkeren naar de
// tab laadt niet opnieuw, en de spelersfoto's op andere tabs gebruiken dezelfde data.
function useSpelersData() {
  const [state, setState] = useState(() => {
    const data = getSessionPlayers();
    return data ? { data, loading: false, error: null, fromLocal: false } : { data: null, loading: true, error: null, fromLocal: false };
  });

  const load = useCallback(async (force = true) => {
    setState(s => ({ ...s, loading: true, error: null }));
    const result = await loadPlayers({ force });
    setState({ ...result, loading: false });
  }, []);

  useEffect(() => {
    if (!getSessionPlayers()) load(false);
  }, [load]);

  return { ...state, reload: () => load(true) };
}

// --- Filterlade ----------------------------------------------------------------------------------

// Eén prijsbalk met twee handvatten (min en max). Technisch blijven het twee gewone, gelabelde
// schuifregelaars (goed voor toetsenbord en schermlezer), maar ze liggen op dezelfde balk; enkel de
// handvatten vangen tikken op. Het stuk tussen de handvatten kleurt mee.
function PriceRange({ t, bounds, pmin, pmax, onChange }) {
  const lo = pmin ?? bounds.min;
  const hi = pmax ?? bounds.max;
  const span = Math.max(bounds.max - bounds.min, 0.5);
  const set = (nextLo, nextHi) => onChange(
    nextLo <= bounds.min ? null : nextLo,
    nextHi >= bounds.max ? null : nextHi,
  );
  return (
    <div className="spl-field">
      <span className="label spl-field__label">
        {t('spelers.filter.price')} <span className="num spl-field__value">€{lo.toFixed(1)} – €{hi.toFixed(1)}</span>
      </span>
      <div className="spl-range">
        <span className="spl-range__track" aria-hidden="true">
          <span
            className="spl-range__fill"
            style={{
              left: `${((lo - bounds.min) / span) * 100}%`,
              right: `${100 - ((hi - bounds.min) / span) * 100}%`,
            }}
          />
        </span>
        <input type="range" min={bounds.min} max={bounds.max} step={0.5} value={lo}
          aria-label={t('spelers.filter.priceMin')}
          onChange={e => { const v = Number(e.target.value); set(v, Math.max(v, hi)); }} />
        <input type="range" min={bounds.min} max={bounds.max} step={0.5} value={hi}
          aria-label={t('spelers.filter.priceMax')}
          onChange={e => { const v = Number(e.target.value); set(Math.min(lo, v), v); }} />
      </div>
    </div>
  );
}

function FilterSheet({ t, ui, update, priceBounds, resultCount, onReset, onClose }) {
  return (
    <Sheet
      titleId="spl-filters-title"
      title={t('spelers.filter.sheetTitle')}
      closeLabel={t('picker.close')}
      onClose={onClose}
      footer={(
        <div className="spl-sheet-actions">
          <Button variant="ghost" onClick={onReset}>{t('spelers.filter.reset')}</Button>
          <Button variant="primary" onClick={onClose}>{t('spelers.filter.showResults', { n: resultCount })}</Button>
        </div>
      )}
    >
      <div className="spl-filters">
        <label className="spl-field">
          <span className="label spl-field__label">{t('spelers.filter.club')}</span>
          <Select value={ui.club} onChange={club => update({ club })} className="spl-field__control">
            <option value="">{t('spelers.filter.allClubs')}</option>
            {TEAMS_ALPHA.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </label>

        <PriceRange t={t} bounds={priceBounds} pmin={ui.pmin} pmax={ui.pmax} onChange={(pmin, pmax) => update({ pmin, pmax })} />

        <label className="spl-field">
          <span className="label spl-field__label">{t('spelers.filter.minMinutes')}</span>
          <Select value={String(ui.mins)} onChange={v => update({ mins: Number(v) })} className="spl-field__control">
            {MIN_MINUTES_OPTIONS.map(m => <option key={m} value={m}>{m === 0 ? t('spelers.filter.anyMinutes') : t('spelers.filter.minutesOption', { n: m })}</option>)}
          </Select>
        </label>

        <div className="spl-field">
          <span className="label spl-field__label" id="spl-f-period">{t('spelers.filter.period')}</span>
          <Segmented
            ariaLabel={t('spelers.filter.period')}
            value={ui.per}
            onChange={per => update({ per })}
            options={PERIODS.map(p => ({ value: p, label: p === 'season' ? t('spelers.period.seasonShort') : t('spelers.period.lastShort', { n: p }) }))}
          />
          {ui.per !== 'season' && <p className="spl-field__note">{t('spelers.period.note', { n: ui.per })}</p>}
        </div>

        <div className="spl-field">
          <span className="label spl-field__label">{t('spelers.filter.mode')}</span>
          <Segmented
            ariaLabel={t('spelers.filter.mode')}
            value={ui.mode}
            onChange={mode => update({ mode })}
            options={[{ value: 'total', label: t('spelers.mode.total') }, { value: 'p90', label: t('spelers.mode.p90') }]}
          />
          {ui.mode === 'p90' && <p className="spl-field__note">{t('spelers.mode.p90Note', { min: MIN_MINUTES_PER90 })}</p>}
        </div>

        <div className="spl-field">
          <span className="label spl-field__label">{t('spelers.filter.scope')}</span>
          <ScopeFilter t={t} scope={ui.scope} onChange={scope => update({ scope })} />
        </div>

        <div className="spl-field">
          <Switch checked={ui.diff} onChange={diff => update({ diff })} label={t('spelers.filter.diff', { max: DIFFERENTIAL_MAX_SEL })} />
        </div>

        <div className="spl-field">
          <Switch checked={ui.avail} onChange={avail => update({ avail })} label={t('availability.filter')} />
          <p className="spl-field__note">{t('availability.filterNote')}</p>
        </div>
      </div>
    </Sheet>
  );
}

// --- Vergelijken ---------------------------------------------------------------------------------

function CompareSheet({ t, rows, mode, fromGw, ratings, homeAdvantage, onRemove, onClear, onOpen, onClose }) {
  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // klembord niet beschikbaar: de URL in de adresbalk is evengoed deelbaar
    }
  };

  return (
    <Sheet
      titleId="spl-compare-title"
      title={t('spelers.compare.title', { n: rows.length, max: MAX_COMPARE })}
      closeLabel={t('picker.close')}
      onClose={onClose}
      width="720px"
      footer={(
        <div className="spl-sheet-actions">
          <Button variant="ghost" onClick={onClear}>{t('spelers.compare.clear')}</Button>
          <Button icon={copied ? Check : Link2} onClick={copyLink}>
            {copied ? t('spelers.compare.copied') : t('spelers.compare.copyLink')}
          </Button>
        </div>
      )}
    >
      {rows.length < 2 && <Notice>{t('spelers.compare.pickMore')}</Notice>}
      <div className="spl-compare">
        <table className="ui-table spl-compare__table">
          <thead>
            <tr>
              <th scope="col" className="spl-compare__stat"><span className="ui-sr-only">{t('spelers.compare.stat')}</span></th>
              {rows.map(r => (
                <th key={r.id} scope="col" className="spl-compare__player">
                  <span className="spl-compare__head">
                    <Button
                      variant="icon" size="sm" bare icon={X}
                      className="spl-compare__remove"
                      onClick={() => onRemove(r.id)}
                      aria-label={t('spelers.compare.removeAria', { name: r.name })}
                    />
                    <PlayerFace player={r} size={48} />
                    <button type="button" className="spl-compare__name" onClick={() => onOpen(r.id)}>{r.short || r.name}</button>
                    <span className="spl-compare__meta">{r.club} · {t(`spelers.posShort.${r.pos}`)}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map(key => {
              const col = COLUMNS[key];
              const values = rows.map(r => cellValue(r, key, mode));
              const best = col.noBest ? new Set() : bestIndexes(values, { lowerIsBetter: col.lowerIsBetter });
              const isP90 = mode === 'p90' && col.per90;
              return (
                <tr key={key}>
                  <th scope="row" className="spl-compare__stat">{t(col.label)}{isP90 ? ` ${t('spelers.per90Suffix')}` : ''}</th>
                  {values.map((v, i) => (
                    <td key={rows[i].id} className={`is-num is-center${best.has(i) ? ' is-best' : ''}${v == null ? ' is-missing' : ''}`}>
                      {formatCell(v, key, mode)}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th scope="row" className="spl-compare__stat">{t('spelers.col.sparkline')}</th>
              {rows.map(r => (
                <td key={r.id} className="is-center">
                  <span className="spl-compare__spark">
                    <Sparkline spark={r.spark} width={80} height={24} label={t('spelers.sparkAria', { list: r.spark.map(s => s.pts ?? '—').join(', ') })} />
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" className="spl-compare__stat">{t('spelers.col.next')}</th>
              {rows.map(r => (
                <td key={r.id} className="is-center">
                  <UpcomingFixtures club={r.club} fromGw={fromGw} count={3} ratings={ratings} homeAdvantage={homeAdvantage} wrap={false} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="spl-note">{t('spelers.compare.bestNote')}</p>
    </Sheet>
  );
}

// --- De tab --------------------------------------------------------------------------------------

export default function SpelersTab({
  t, ratings, homeAdvantage, playerDatabase, watchlist = [], isPlayerWatched, isPlayerInMyTeam, toggleWatchlistPlayer,
  onRemoveWatchlistPlayer, hasMyTeam, hasWatchlist, onOpenClub, setPiecesEntries, onGoToTeamPlanner, teamPlannerActionFor,
}) {
  const { data, loading, error, fromLocal, reload } = useSpelersData();
  const [ui, setUi] = useState(() => (typeof window === 'undefined' ? DEFAULT_STATE : stateFromSearch(window.location.search)));
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Een gedeelde vergelijk-link (?compare=107,99) opent meteen de vergelijking.
  const [compareMode, setCompareMode] = useState(() => ui.compare.length > 0);
  const [compareOpen, setCompareOpen] = useState(() => ui.compare.length >= 2);

  const update = useCallback((patch) => {
    setUi(prev => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
    setVisible(PAGE_SIZE);
  }, []);

  // Staat -> URL. replaceState: elke slidertik een eigen stap in de terugknop-geschiedenis zou de
  // terugknop onbruikbaar maken. Enkel de popup openen/sluiten is een echte stap (zie openPopup).
  const firstSync = useRef(true);
  useEffect(() => {
    if (firstSync.current) { firstSync.current = false; return; }
    const search = searchFromState(ui, window.location.search);
    const url = `${window.location.pathname}${search}`;
    if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
  }, [ui]);

  const gw = data?.gw ?? 0;
  const fromGw = Math.min(34, Math.max(CURRENT_GW, gw + 1));

  const allRows = useMemo(() => (data ? data.players.map(p => buildRow(p, ui.per, gw)) : []), [data, ui.per, gw]);
  const byId = useMemo(() => new Map(allRows.map(r => [r.id, r])), [allRows]);
  // De popup toont altijd seizoenstotalen, ook als de tabel op "laatste 5 speeldagen" staat.
  const seasonById = useMemo(() => new Map((data?.players ?? []).map(p => [p.id, p])), [data]);

  const priceBounds = useMemo(() => {
    if (allRows.length === 0) return { min: 4, max: 13 };
    const prices = allRows.map(r => r.price).filter(p => p > 0);
    return { min: Math.floor(Math.min(...prices) * 2) / 2, max: Math.ceil(Math.max(...prices) * 2) / 2 };
  }, [allRows]);

  // Watchlist en "Mijn team" kennen spelers op hun naam in de spelersdatabank (Google Sheet). De
  // resolver zoekt per API-speler die naam op, zodat de filters en de ster ook kloppen wanneer de
  // schrijfwijze licht verschilt.
  const sheetName = useMemo(() => buildSheetNameResolver(playerDatabase), [playerDatabase]);
  const watched = useCallback((r) => !!isPlayerWatched?.(sheetName(r), r.club), [isPlayerWatched, sheetName]);
  const inMyTeam = useCallback((r) => !!isPlayerInMyTeam?.(sheetName(r), r.club), [isPlayerInMyTeam, sheetName]);
  const matchesScope = ui.scope === 'watchlist' ? watched : ui.scope === 'myTeam' ? inMyTeam : null;

  const columns = PRESETS[ui.cols];
  const availability = useAvailabilityLookup();
  const isAvailableRow = useCallback((r) => isAvailable(availability(r.name, r.club)), [availability]);
  const filtered = useMemo(() => filterRows(allRows, ui, { matchesScope, isAvailable: isAvailableRow }), [allRows, ui, matchesScope, isAvailableRow]);
  const sorted = useMemo(() => sortRows(filtered, ui.sort, ui.dir, ui.mode), [filtered, ui.sort, ui.dir, ui.mode]);
  const compareRows = ui.compare.map(id => byId.get(id)).filter(Boolean);
  const popupRow = ui.speler ? seasonById.get(ui.speler) : null;

  // Watchlist-spelers die niet in de spelersdata staan (vroeger kon je een vrije naam toevoegen, of de
  // speler vertrok): die tonen we apart onder de tabel, zodat er nooit stil iemand verdwijnt (spec §8.4).
  // Pas berekenen als beide bronnen geladen zijn, anders lijkt even iedereen "niet gevonden".
  const notFound = useMemo(() => {
    if (!data || !playerDatabase?.length || !watchlist.length) return [];
    const known = new Set(allRows.map(r => `${sheetName(r)}|${r.club}`));
    return watchlist.filter(p => !known.has(`${p.name}|${p.teamCode}`));
  }, [data, playerDatabase, watchlist, allRows, sheetName]);

  const onSort = (key) => update(prev => ({
    sort: key,
    dir: prev.sort === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : (FIXED_SORT_KEYS.includes(key) || COLUMNS[key]?.lowerIsBetter ? 'asc' : 'desc'),
  }));
  const choosePreset = (cols) => update(prev => {
    const presetSort = PRESET_SORT[cols];
    if (presetSort) return { cols, ...presetSort };
    // Sorteer je op een kolom die in de nieuwe preset niet meer staat, dan terug naar punten.
    const keepSort = FIXED_SORT_KEYS.includes(prev.sort) || PRESETS[cols].includes(prev.sort);
    return keepSort ? { cols } : { cols, sort: DEFAULT_STATE.sort, dir: DEFAULT_STATE.dir };
  });
  const toggleCompare = (id) => update(prev => {
    if (prev.compare.includes(id)) return { compare: prev.compare.filter(x => x !== id) };
    if (prev.compare.length >= MAX_COMPARE) return {};
    return { compare: [...prev.compare, id] };
  });
  const clearCompare = () => { update({ compare: [] }); setCompareOpen(false); };

  // De popup openen is wél een stap in de geschiedenis: zo sluit de terugknop op een telefoon de
  // popup i.p.v. de site te verlaten.
  const openPopup = (id) => {
    setCompareOpen(false);
    setUi(prev => ({ ...prev, speler: id }));
    const search = searchFromState({ ...ui, speler: id }, window.location.search);
    window.history.pushState({ spelerPopup: id }, '', `${window.location.pathname}${search}`);
  };
  const closePopup = () => {
    if (window.history.state?.spelerPopup) { window.history.back(); return; }
    update({ speler: null });
  };
  useEffect(() => {
    const onPop = () => setUi(prev => ({ ...prev, speler: stateFromSearch(window.location.search).speler }));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const toggleWatch = (r) => toggleWatchlistPlayer?.({ name: sheetName(r), teamCode: r.club });

  // Actieve filters uit de lade, als chips onder de toolbar. Positie en zoeken staan zelf al in beeld.
  const clubName = TEAMS_ALPHA.find(c => c.code === ui.club)?.name ?? ui.club;
  const chips = [
    ui.club && { key: 'club', label: `${t('spelers.filter.club')}: ${clubName}`, clear: { club: '' } },
    (ui.pmin != null || ui.pmax != null) && {
      key: 'price',
      label: `${t('spelers.filter.price')}: €${(ui.pmin ?? priceBounds.min).toFixed(1)}–€${(ui.pmax ?? priceBounds.max).toFixed(1)}`,
      clear: { pmin: null, pmax: null },
    },
    ui.mins > 0 && { key: 'mins', label: t('spelers.filter.minutesOption', { n: ui.mins }), clear: { mins: 0 } },
    ui.per !== 'season' && { key: 'per', label: t('spelers.period.last', { n: ui.per }), clear: { per: 'season' } },
    ui.mode !== 'total' && { key: 'mode', label: t('spelers.mode.p90'), clear: { mode: 'total' } },
    ui.scope !== 'all' && { key: 'scope', label: t(`scopeFilter.${ui.scope}`), clear: { scope: 'all' } },
    ui.diff && { key: 'diff', label: t('spelers.filter.diffChip', { max: DIFFERENTIAL_MAX_SEL }), clear: { diff: false } },
    ui.avail && { key: 'avail', label: t('availability.filterChip'), clear: { avail: false } },
  ].filter(Boolean);
  const resetDrawerFilters = () => update({ club: '', pmin: null, pmax: null, mins: 0, scope: 'all', per: 'season', mode: 'total', diff: false, avail: false });
  const resetAll = () => update({ q: '', pos: [], club: '', pmin: null, pmax: null, mins: 0, scope: 'all', per: 'season', mode: 'total', diff: false, avail: false });
  const anyFilter = chips.length > 0 || ui.q || ui.pos.length > 0;

  const posValue = ui.pos.length === 0 ? 'all' : ui.pos.length === 1 ? ui.pos[0] : null;
  const compareFull = ui.compare.length >= MAX_COMPARE;

  const tableColumns = [
    {
      key: 'name',
      label: t('spelers.col.name'),
      sortable: true, sticky: true, stickyEdge: true, rowHeader: true,
      className: 'spl-col-player',
      render: (r) => {
        const isWatched = watched(r);
        const inCompare = ui.compare.includes(r.id);
        return (
          <span className="spl-ident">
            {compareMode && (
              <span className="spl-check">
                <input
                  type="checkbox"
                  checked={inCompare}
                  disabled={!inCompare && compareFull}
                  onChange={() => toggleCompare(r.id)}
                  aria-label={t('spelers.compare.addAria', { name: r.name })}
                  title={t('spelers.compare.addAria', { name: r.name })}
                />
              </span>
            )}
            {toggleWatchlistPlayer && (
              <StarButton
                active={isWatched}
                onClick={() => toggleWatch(r)}
                addLabel={t('watchlist.addAria', { name: r.name })}
                removeLabel={t('watchlist.removeAria', { name: r.name })}
              />
            )}
            <PlayerCell
              name={r.name}
              short={r.short}
              photo={r.photo}
              clubCode={r.club}
              position={t(`spelers.posShort.${r.pos}`)}
              subDesktop={false}
            />
          </span>
        );
      },
    },
    {
      key: 'club', label: t('spelers.col.club'), sortable: true, className: 'spl-col-club',
      render: r => <span className="spl-club"><ClubLogo code={r.club} size={16} /><span>{r.club}</span></span>,
    },
    { key: 'pos', label: t('spelers.col.posShort'), sortable: true, className: 'spl-col-pos', render: r => t(`spelers.posShort.${r.pos}`) },
    ...columns.map(key => ({
      key,
      label: `${t(`${COLUMNS[key].label}Short`)}${ui.mode === 'p90' && COLUMNS[key].per90 ? '/90' : ''}`,
      title: t(COLUMNS[key].title ?? COLUMNS[key].label, { count: FORM_GWS }),
      num: true,
      sortable: true,
      render: r => formatCell(cellValue(r, key, ui.mode), key, ui.mode),
      cellClass: r => [key === ui.sort && 'is-strong', cellValue(r, key, ui.mode) == null && 'is-missing'].filter(Boolean).join(' '),
    })),
    {
      key: 'spark', label: t('spelers.col.sparklineShort'), title: t('spelers.col.sparkline'), className: 'spl-col-spark',
      render: r => <Sparkline spark={r.spark} width={56} height={16} label={t('spelers.sparkAria', { list: r.spark.map(s => s.pts ?? '—').join(', ') })} />,
    },
    {
      key: 'next', label: t('spelers.col.next'), className: 'spl-col-next',
      render: r => <UpcomingFixtures club={r.club} fromGw={fromGw} count={3} ratings={ratings} homeAdvantage={homeAdvantage} wrap={false} />,
    },
  ];

  const notFoundColumns = [
    { key: 'name', label: t('spelers.col.name'), rowHeader: true, render: p => <span className="spl-nf__name">{p.name}</span> },
    { key: 'club', label: t('spelers.col.club'), render: p => <span className="spl-club"><ClubLogo code={p.teamCode} size={16} /><span>{p.teamCode}</span></span> },
    { key: 'price', label: t('spelers.col.priceShort'), num: true, render: p => (Number.isFinite(Number(p.price)) && p.price !== null && p.price !== '' ? `€${Number(p.price).toFixed(1)}` : null) },
    {
      key: 'remove', label: <span className="ui-sr-only">{t('spelers.notFound.remove')}</span>, className: 'spl-nf__actions',
      render: p => (
        <Button variant="ghost" size="sm" icon={X} onClick={() => onRemoveWatchlistPlayer?.(p.id)} aria-label={t('watchlist.removeAria', { name: p.name })}>
          {t('spelers.notFound.remove')}
        </Button>
      ),
    },
  ];

  const meta = data ? <span className="num">{t('spelers.meta', { gw: data.gw, n: data.players.length })}</span> : null;

  return (
    <div className={`spl${compareMode ? ' is-compare' : ''}`}>
      <PageHeader title={t('spelers.pageTitle')} meta={meta} intro={t('spelers.introShort')} />

      <div className="spl-toolbar">
        <SearchField
          className="spl-search"
          value={ui.q}
          onChange={q => update({ q: q.slice(0, 40) })}
          placeholder={t('spelers.searchPlaceholder')}
          clearLabel={t('picker.clear')}
        />
        <div className="spl-toolbar__row">
          <Segmented
            ariaLabel={t('spelers.filter.position')}
            value={posValue}
            onChange={v => update({ pos: v === 'all' ? [] : [v] })}
            options={[
              { value: 'all', label: t('spelers.filter.allPositions') },
              ...POSITION_KEYS.map(pos => ({ value: pos, label: t(`spelers.posShort.${pos}`) })),
            ]}
          />
          <Segmented
            ariaLabel={t('spelers.presets.label')}
            value={ui.cols}
            onChange={choosePreset}
            options={PRESET_KEYS.map(key => ({ value: key, label: t(`spelers.presets.${key}`) }))}
          />
          <div className="spl-toolbar__actions">
            <Button icon={SlidersHorizontal} onClick={() => setFiltersOpen(true)} aria-haspopup="dialog">
              {chips.length ? t('spelers.filter.buttonCount', { n: chips.length }) : t('spelers.filter.button')}
            </Button>
            <Button icon={Scale} aria-pressed={compareMode} onClick={() => setCompareMode(m => !m)}>
              {t('spelers.compare.mode')}
            </Button>
          </div>
        </div>
      </div>

      {(chips.length > 0 || (data && sorted.length !== allRows.length)) && (
        <div className="spl-chipsline">
          <FilterChips>
            {chips.map(c => (
              <FilterChip key={c.key} label={c.label} onRemove={() => update(c.clear)} removeLabel={t('spelers.filter.removeChip', { label: c.label })} />
            ))}
            {anyFilter && <Button variant="ghost" size="sm" onClick={resetAll}>{t('spelers.filter.reset')}</Button>}
          </FilterChips>
          {data && <span className="spl-chipsline__count num">{t('spelers.countOf', { n: sorted.length, total: allRows.length })}</span>}
        </div>
      )}

      {compareMode && ui.compare.length < 2 && (
        <Notice>{t('spelers.compare.modeHint', { max: MAX_COMPARE })}</Notice>
      )}

      {!loading && error && !data && (
        <ErrorBanner onRetry={reload} retryLabel={t('shared.retry')}>{t('spelers.error')}</ErrorBanner>
      )}

      {data && (error || data.stale) && (
        <ErrorBanner onRetry={reload} retryLabel={t('shared.retry')}>
          {t('spelers.staleNotice', { gw: data.gw })}{fromLocal ? ` ${t('spelers.staleLocal')}` : ''}
        </ErrorBanner>
      )}

      {(data || loading) && (
        sorted.length === 0 && data ? (
          ui.scope !== 'all'
            ? <ScopeEmptyMessage t={t} scope={ui.scope} hasAny={ui.scope === 'myTeam' ? hasMyTeam : hasWatchlist} />
            : <EmptyState action={anyFilter ? <Button size="sm" onClick={resetAll}>{t('spelers.filter.reset')}</Button> : null}>{t('spelers.empty')}</EmptyState>
        ) : (
          <DataTable
            className="spl-table"
            bleed
            scrollHint={t('shared.scrollHint')}
            loading={loading && !data}
            columns={tableColumns}
            rows={sorted.slice(0, visible)}
            rowKey={r => r.id}
            rowClassName={r => (ui.compare.includes(r.id) ? 'is-compared' : '')}
            onRowClick={compareMode ? (r => { if (ui.compare.includes(r.id) || !compareFull) toggleCompare(r.id); }) : (r => openPopup(r.id))}
            rowLabel={compareMode ? undefined : (r => t('playerSheet.openAria', { name: r.name }))}
            sort={{ key: ui.sort, dir: ui.dir }}
            onSort={onSort}
            ariaLabel={t('spelers.tableCaption')}
            footer={sorted.length > visible ? (
              <Button onClick={() => setVisible(v => v + PAGE_SIZE)}>
                {t('spelers.showMore', { n: Math.min(PAGE_SIZE, sorted.length - visible), total: sorted.length - visible })}
              </Button>
            ) : null}
          />
        )
      )}

      {ui.scope === 'watchlist' && notFound.length > 0 && (
        <section className="spl-nf" aria-labelledby="spl-nf-title">
          <h2 id="spl-nf-title" className="label spl-nf__title">{t('spelers.notFound.title', { n: notFound.length })}</h2>
          <p className="spl-note">{t('spelers.notFound.intro')}</p>
          <DataTable
            columns={notFoundColumns}
            rows={notFound}
            rowKey={p => p.id}
            ariaLabel={t('spelers.notFound.title', { n: notFound.length })}
          />
        </section>
      )}

      {data && <p className="spl-note spl-footnote">{t('spelers.footnote')}</p>}

      {compareRows.length >= 2 && !compareOpen && (
        <div className="spl-comparebar" role="region" aria-label={t('spelers.compare.mode')}>
          <span className="spl-comparebar__text">{t('spelers.compare.bar', { n: compareRows.length })}</span>
          <Button variant="primary" size="sm" onClick={() => setCompareOpen(true)} aria-haspopup="dialog">{t('spelers.compare.open')}</Button>
          <Button variant="ghost" size="sm" onClick={clearCompare}>{t('spelers.compare.clear')}</Button>
        </div>
      )}

      {filtersOpen && (
        <FilterSheet
          t={t} ui={ui} update={update} priceBounds={priceBounds} resultCount={sorted.length}
          onReset={resetDrawerFilters} onClose={() => setFiltersOpen(false)}
        />
      )}

      {compareOpen && compareRows.length > 0 && (
        <CompareSheet
          t={t} rows={compareRows} mode={ui.mode} fromGw={fromGw} ratings={ratings} homeAdvantage={homeAdvantage}
          onRemove={toggleCompare} onClear={clearCompare} onOpen={openPopup} onClose={() => setCompareOpen(false)}
        />
      )}

      {popupRow && (
        <Suspense fallback={null}>
          <PlayerSheet
            t={t}
            player={{ name: sheetName(popupRow), teamCode: popupRow.club }}
            apiPlayer={popupRow}
            playerDatabase={playerDatabase}
            setPiecesEntries={setPiecesEntries}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            onClose={closePopup}
            isWatched={watched(popupRow)}
            onToggleWatch={toggleWatchlistPlayer ? () => toggleWatch(popupRow) : undefined}
            inCompare={ui.compare.includes(popupRow.id)}
            compareFull={compareFull}
            onToggleCompare={() => { setCompareMode(true); toggleCompare(popupRow.id); }}
            onOpenClub={onOpenClub ? (code) => { setUi(prev => ({ ...prev, speler: null })); onOpenClub(code); } : undefined}
            onGoToTeamPlanner={onGoToTeamPlanner ? () => { setUi(prev => ({ ...prev, speler: null })); onGoToTeamPlanner(); } : undefined}
            teamPlannerAction={teamPlannerActionFor?.(sheetName(popupRow), popupRow.club, () => setUi(prev => ({ ...prev, speler: null })))}
          />
        </Suspense>
      )}
    </div>
  );
}
