// Spelers-tab: een database van alle Fantasy Pro League-spelers om te filteren, sorteren, vergelijken
// en per speler de historiek te bekijken. Data uit /api/players (zie api/players.js); rekenlogica in
// src/spelers.js. Alle instellingen staan in de URL, zodat een gefilterde lijst of een vergelijking
// deelbaar is (bv. /spelers?compare=107,99).
//
// Opzet voor de casual manager: bovenaan enkel zoeken, positie en de kolompresets; de rest zit achter
// "Meer filters". Bij een fout van de bron toont de tab de laatst bekende data (eerst van de server,
// anders uit deze browser) met een duidelijke melding, nooit een lege pagina.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, AlertCircle, RotateCcw, Search, SlidersHorizontal, X, Link2, Check, ArrowUp, ArrowDown } from 'lucide-react';
import { CURRENT_GW, TEAMS_ALPHA } from '../constants';
import ScopeFilter, { ScopeEmptyMessage } from '../components/ScopeFilter';
import { PlayerPhoto, Sparkline, UpcomingFixtures, ClubLogo } from '../components/SpelersParts';
import {
  COLUMNS, PRESETS, PRESET_KEYS, POSITION_KEYS, PERIODS, MIN_MINUTES_OPTIONS, MAX_COMPARE, COMPARE_ROWS,
  DEFAULT_STATE, buildRow, cellValue, formatCell, filterRows, sortRows, bestIndexes,
  stateFromSearch, searchFromState, buildSheetNameResolver, MIN_MINUTES_PER90,
} from '../spelers';

const SpelerPopup = lazy(() => import('../components/SpelerPopup'));

const PAGE_SIZE = 60;
const LOCAL_CACHE_KEY = 'fpl_proleague_spelers_cache_v1';

// --- Data ophalen --------------------------------------------------------------------------------
// Eén keer per sessie (module-niveau), zodat terugkeren naar de tab niet opnieuw laadt.
let sessionData = null;

function readLocalCache() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.players) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalCache(data) {
  try {
    window.localStorage?.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
  } catch {
    // vol of geblokkeerd: geen probleem, dan is er gewoon geen reservekopie in deze browser
  }
}

function useSpelersData() {
  const [state, setState] = useState(() => (
    sessionData ? { data: sessionData, loading: false, error: null, fromLocal: false } : { data: null, loading: true, error: null, fromLocal: false }
  ));

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const response = await fetch('/api/players');
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || !Array.isArray(body.players)) throw new Error(body?.error || `HTTP ${response.status}`);
      sessionData = body;
      if (!body.stale) writeLocalCache(body);
      setState({ data: body, loading: false, error: null, fromLocal: false });
    } catch (err) {
      const local = readLocalCache();
      setState({ data: local, loading: false, error: String(err?.message ?? err), fromLocal: Boolean(local) });
    }
  }, []);

  useEffect(() => {
    if (!sessionData) load();
  }, [load]);

  return { ...state, reload: load };
}

// --- Kleine UI-stukken ---------------------------------------------------------------------------

const chipStyle = (selected) => ({
  background: selected ? 'rgba(51,237,213,0.12)' : 'rgba(255,255,255,0.04)',
  border: selected ? '1px solid var(--accent)' : '1px solid rgba(255,255,255,0.08)',
  borderRadius: '10px', padding: '7px 12px', cursor: 'pointer',
  color: selected ? 'var(--accent)' : 'var(--text-2)', fontWeight: 700, fontSize: '12px', fontFamily: 'inherit',
});

const labelStyle = { color: 'var(--text-3)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '6px' };
const selectStyle = {
  background: 'var(--ink-1)', color: 'var(--text-1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
  padding: '7px 10px', fontSize: '13px', fontFamily: 'inherit', minHeight: '36px',
};

function ErrorBanner({ children, onRetry, t }) {
  return (
    <div role="alert" style={{
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
      background: 'rgba(255,90,71,0.12)', border: '1px solid rgba(255,90,71,0.4)',
      borderRadius: '10px', padding: '12px 14px', marginBottom: '12px',
    }}>
      <AlertCircle size={16} color="var(--danger)" style={{ flexShrink: 0 }} aria-hidden="true" />
      <span style={{ color: 'var(--text-1)', fontSize: '13px', flex: 1, minWidth: '200px' }}>{children}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} style={{
          display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', color: 'var(--text-1)',
          border: '1px solid rgba(251,234,231,0.4)', borderRadius: '8px', padding: '6px 12px',
          fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
        }}>
          <RotateCcw size={14} aria-hidden="true" /> {t('shared.retry')}
        </button>
      )}
    </div>
  );
}

// Twee schuifregelaars (min en max) voor de prijs. Bewust twee losse, gelabelde sliders i.p.v. één
// met twee handvatten: die laatste zijn op een telefoon lastig te pakken en voor screenreaders slecht.
function PriceRange({ t, bounds, pmin, pmax, onChange }) {
  const lo = pmin ?? bounds.min;
  const hi = pmax ?? bounds.max;
  const set = (nextLo, nextHi) => onChange(
    nextLo <= bounds.min ? null : nextLo,
    nextHi >= bounds.max ? null : nextHi,
  );
  return (
    <div>
      <span style={labelStyle}>{t('spelers.filter.price')}: €{lo.toFixed(1)} – €{hi.toFixed(1)}</span>
      <div style={{ display: 'grid', gap: '4px' }}>
        <input type="range" min={bounds.min} max={bounds.max} step={0.5} value={lo}
          aria-label={t('spelers.filter.priceMin')}
          onChange={e => { const v = Number(e.target.value); set(v, Math.max(v, hi)); }}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
        <input type="range" min={bounds.min} max={bounds.max} step={0.5} value={hi}
          aria-label={t('spelers.filter.priceMax')}
          onChange={e => { const v = Number(e.target.value); set(Math.min(lo, v), v); }}
          style={{ width: '100%', accentColor: 'var(--accent)' }} />
      </div>
    </div>
  );
}

function SortHeader({ label, title, sortKey, state, onSort, align = 'right', sticky = false, minWidth }) {
  const active = state.sort === sortKey;
  const ariaSort = active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={sticky ? 'spl-sticky' : undefined} style={{
      padding: 0, textAlign: align, position: 'sticky', top: 0, zIndex: sticky ? 4 : 3,
      background: 'var(--ink-1)', borderBottom: '1px solid rgba(255,255,255,0.12)', minWidth,
      ...(sticky ? { left: 0 } : {}),
    }}>
      <button type="button" onClick={() => onSort(sortKey)} title={title} style={{
        display: 'flex', alignItems: 'center', gap: '2px', width: '100%',
        justifyContent: align === 'left' ? 'flex-start' : 'flex-end',
        background: 'none', border: 'none', cursor: 'pointer', padding: '9px 8px', fontFamily: 'inherit',
        color: active ? 'var(--accent)' : 'var(--text-2)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}>
        {label}
        {active && (state.dir === 'asc' ? <ArrowUp size={11} aria-hidden="true" /> : <ArrowDown size={11} aria-hidden="true" />)}
      </button>
    </th>
  );
}

// --- Vergelijken ---------------------------------------------------------------------------------

function ComparePanel({ t, rows, mode, fromGw, ratings, homeAdvantage, onRemove, onClear, onOpen }) {
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
  const cell = { padding: '7px 8px', fontSize: '13px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-1)', whiteSpace: 'nowrap' };
  const rowLabel = { ...cell, textAlign: 'left', color: 'var(--text-3)', fontSize: '12px', fontWeight: 700, position: 'sticky', left: 0, background: 'var(--ink-1)', zIndex: 1 };

  return (
    <section aria-labelledby="spl-compare-title" style={{
      background: 'rgba(51,237,213,0.05)', border: '1px solid rgba(51,237,213,0.3)', borderRadius: '12px',
      padding: '14px', marginBottom: '18px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <h2 id="spl-compare-title" className="fdr-title" style={{ color: 'var(--text-1)', fontSize: '15px', margin: 0, textTransform: 'uppercase', flex: 1 }}>
          {t('spelers.compare.title', { n: rows.length, max: MAX_COMPARE })}
        </h2>
        <button type="button" onClick={copyLink} style={chipStyle(copied)}>
          {copied ? <Check size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> : <Link2 size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} />}{' '}
          {copied ? t('spelers.compare.copied') : t('spelers.compare.copyLink')}
        </button>
        <button type="button" onClick={onClear} style={chipStyle(false)}>{t('spelers.compare.clear')}</button>
      </div>
      {rows.length < 2 && <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: '0 0 10px' }}>{t('spelers.compare.pickMore')}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: 'auto' }}>
          <thead>
            <tr>
              <th scope="col" style={{ ...rowLabel, borderTop: 'none', minWidth: '120px' }}><span className="sr-only">{t('spelers.compare.stat')}</span></th>
              {rows.map(r => (
                <th key={r.id} scope="col" style={{ padding: '4px 8px 8px', verticalAlign: 'bottom', minWidth: '110px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => onRemove(r.id)} aria-label={t('spelers.compare.removeAria', { name: r.name })} style={{
                      alignSelf: 'flex-end', background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0, display: 'inline-flex',
                    }}>
                      <X size={14} aria-hidden="true" />
                    </button>
                    <PlayerPhoto player={r} size={40} />
                    <button type="button" onClick={() => onOpen(r.id)} style={{
                      background: 'none', border: 'none', color: 'var(--text-1)', fontWeight: 800, fontSize: '13px', cursor: 'pointer',
                      fontFamily: 'inherit', padding: 0, textAlign: 'center',
                    }}>
                      {r.short || r.name}
                    </button>
                    <span style={{ color: 'var(--text-3)', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <ClubLogo code={r.club} size={13} /> {r.club} · {r.pos}
                    </span>
                  </div>
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
                  <th scope="row" style={rowLabel}>{t(col.label)}{isP90 ? ` ${t('spelers.per90Suffix')}` : ''}</th>
                  {values.map((v, i) => (
                    <td key={rows[i].id} style={{
                      ...cell,
                      fontWeight: best.has(i) ? 800 : 500,
                      color: best.has(i) ? 'var(--accent)' : cell.color,
                      background: best.has(i) ? 'rgba(51,237,213,0.08)' : undefined,
                    }}>
                      {formatCell(v, key, mode)}
                    </td>
                  ))}
                </tr>
              );
            })}
            <tr>
              <th scope="row" style={rowLabel}>{t('spelers.col.sparkline')}</th>
              {rows.map(r => (
                <td key={r.id} style={cell}>
                  <span style={{ display: 'inline-block' }}>
                    <Sparkline spark={r.spark} width={80} height={24} label={t('spelers.sparkAria', { list: r.spark.map(s => s.pts ?? '—').join(', ') })} />
                  </span>
                </td>
              ))}
            </tr>
            <tr>
              <th scope="row" style={rowLabel}>{t('spelers.col.next')}</th>
              {rows.map(r => (
                <td key={r.id} style={{ ...cell, whiteSpace: 'normal' }}>
                  <UpcomingFixtures club={r.club} fromGw={fromGw} count={3} ratings={ratings} homeAdvantage={homeAdvantage} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      <p style={{ color: 'var(--text-3)', fontSize: '11px', margin: '8px 0 0' }}>{t('spelers.compare.bestNote')}</p>
    </section>
  );
}

// --- De tab --------------------------------------------------------------------------------------

export default function SpelersTab({
  t, ratings, homeAdvantage, playerDatabase, isPlayerWatched, isPlayerInMyTeam, toggleWatchlistPlayer,
  hasMyTeam, hasWatchlist, onOpenClub,
}) {
  const { data, loading, error, fromLocal, reload } = useSpelersData();
  const [ui, setUi] = useState(() => (typeof window === 'undefined' ? DEFAULT_STATE : stateFromSearch(window.location.search)));
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [showFilters, setShowFilters] = useState(() => {
    const s = typeof window === 'undefined' ? DEFAULT_STATE : stateFromSearch(window.location.search);
    return Boolean(s.club || s.pmin != null || s.pmax != null || s.mins || s.scope !== 'all' || s.per !== 'season' || s.mode !== 'total');
  });

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
  const filtered = useMemo(() => filterRows(allRows, ui, { matchesScope }), [allRows, ui, matchesScope]);
  const sorted = useMemo(() => sortRows(filtered, ui.sort, ui.dir, ui.mode), [filtered, ui.sort, ui.dir, ui.mode]);
  const compareRows = ui.compare.map(id => byId.get(id)).filter(Boolean);
  const popupRow = ui.speler ? seasonById.get(ui.speler) : null;

  const onSort = (key) => update(prev => ({
    sort: key,
    dir: prev.sort === key ? (prev.dir === 'desc' ? 'asc' : 'desc') : (key === 'name' || key === 'club' || key === 'pos' || COLUMNS[key]?.lowerIsBetter ? 'asc' : 'desc'),
  }));
  const toggleCompare = (id) => update(prev => {
    if (prev.compare.includes(id)) return { compare: prev.compare.filter(x => x !== id) };
    if (prev.compare.length >= MAX_COMPARE) return {};
    return { compare: [...prev.compare, id] };
  });
  const togglePos = (pos) => update(prev => ({ pos: prev.pos.includes(pos) ? prev.pos.filter(p => p !== pos) : [...prev.pos, pos] }));

  // De popup openen is wél een stap in de geschiedenis: zo sluit de terugknop op een telefoon de
  // popup i.p.v. de site te verlaten.
  const openPopup = (id) => {
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

  const filtersActive = ui.q || ui.pos.length || ui.club || ui.pmin != null || ui.pmax != null || ui.mins || ui.scope !== 'all' || ui.per !== 'season' || ui.mode !== 'total';
  const resetFilters = () => update({ q: '', pos: [], club: '', pmin: null, pmax: null, mins: 0, scope: 'all', per: 'season', mode: 'total' });

  const toggleWatch = (r) => toggleWatchlistPlayer?.({ name: sheetName(r), teamCode: r.club });

  const periodLabel = ui.per === 'season' ? t('spelers.period.season') : t('spelers.period.last', { n: ui.per });

  return (
    <>
      <style>{`
        .spl-table-wrap { overflow: auto; max-height: min(78vh, 980px); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
        .spl-table { border-collapse: separate; border-spacing: 0; width: 100%; }
        .spl-table td { padding: 7px 8px; font-size: 13px; color: var(--text-1); text-align: right; white-space: nowrap; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .spl-table tbody tr:hover td { background: rgba(255,255,255,0.03); }
        .spl-table td.spl-sticky { position: sticky; left: 0; z-index: 2; background: var(--ink-1); text-align: left; box-shadow: 1px 0 0 rgba(255,255,255,0.08); }
        .spl-table tbody tr:hover td.spl-sticky { background: var(--ink-1); }
        .spl-name-btn { background: none; border: none; padding: 0; cursor: pointer; font-family: inherit; color: var(--text-1); font-weight: 700; font-size: 13px; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }
        .spl-name-btn:hover { color: var(--accent); }
        .spl-name-full { display: inline; } .spl-name-short { display: none; }
        .spl-name-cell { max-width: 210px; }
        .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
        .spl-controls-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; }
        @media (max-width: 640px) {
          .spl-name-full { display: none; } .spl-name-short { display: inline; }
          .spl-hide-mobile { display: none; }
          .spl-name-cell { max-width: 128px; }
          .spl-table td { padding: 7px 6px; }
          .spl-table-wrap { margin-left: calc(var(--fdr-page-gutter, 16px) * -1); margin-right: calc(var(--fdr-page-gutter, 16px) * -1); border-radius: 0; border-left: none; border-right: none; }
        }
      `}</style>

      <p style={{ color: 'var(--text-3)', fontSize: '13px', marginBottom: '14px', lineHeight: 1.5 }}>
        {t('spelers.intro')}
      </p>

      {/* Zoeken + positie: altijd zichtbaar */}
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <Search size={16} color="var(--text-3)" aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          type="search"
          value={ui.q}
          onChange={e => update({ q: e.target.value.slice(0, 40) })}
          placeholder={t('spelers.searchPlaceholder')}
          aria-label={t('spelers.searchPlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', color: 'var(--text-1)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '10px 12px 10px 36px',
            fontSize: '14px', fontFamily: 'inherit',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' }} role="group" aria-label={t('spelers.filter.position')}>
        <button type="button" onClick={() => update({ pos: [] })} aria-pressed={ui.pos.length === 0} style={chipStyle(ui.pos.length === 0)}>
          {t('spelers.filter.allPositions')}
        </button>
        {POSITION_KEYS.map(pos => (
          <button key={pos} type="button" onClick={() => togglePos(pos)} aria-pressed={ui.pos.includes(pos)} style={chipStyle(ui.pos.includes(pos))}>
            {t(`spelers.posShort.${pos}`)}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button type="button" onClick={() => setShowFilters(v => !v)} aria-expanded={showFilters} aria-controls="spl-filters" style={chipStyle(showFilters)}>
          <SlidersHorizontal size={13} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> {t('spelers.filter.more')}
        </button>
      </div>

      {showFilters && (
        <div id="spl-filters" style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
          padding: '14px', marginBottom: '12px',
        }}>
          <div className="spl-controls-grid">
            <label>
              <span style={labelStyle}>{t('spelers.filter.club')}</span>
              <select value={ui.club} onChange={e => update({ club: e.target.value })} style={{ ...selectStyle, width: '100%' }}>
                <option value="">{t('spelers.filter.allClubs')}</option>
                {TEAMS_ALPHA.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>
            <PriceRange t={t} bounds={priceBounds} pmin={ui.pmin} pmax={ui.pmax} onChange={(pmin, pmax) => update({ pmin, pmax })} />
            <label>
              <span style={labelStyle}>{t('spelers.filter.minMinutes')}</span>
              <select value={ui.mins} onChange={e => update({ mins: Number(e.target.value) })} style={{ ...selectStyle, width: '100%' }}>
                {MIN_MINUTES_OPTIONS.map(m => <option key={m} value={m}>{m === 0 ? t('spelers.filter.anyMinutes') : t('spelers.filter.minutesOption', { n: m })}</option>)}
              </select>
            </label>
            <label>
              <span style={labelStyle}>{t('spelers.filter.period')}</span>
              <select value={String(ui.per)} onChange={e => update({ per: e.target.value === 'season' ? 'season' : Number(e.target.value) })} style={{ ...selectStyle, width: '100%' }}>
                {PERIODS.map(p => <option key={p} value={String(p)}>{p === 'season' ? t('spelers.period.season') : t('spelers.period.last', { n: p })}</option>)}
              </select>
            </label>
            <div>
              <span style={labelStyle}>{t('spelers.filter.mode')}</span>
              <div style={{ display: 'flex', gap: '6px' }} role="group" aria-label={t('spelers.filter.mode')}>
                <button type="button" onClick={() => update({ mode: 'total' })} aria-pressed={ui.mode === 'total'} style={chipStyle(ui.mode === 'total')}>{t('spelers.mode.total')}</button>
                <button type="button" onClick={() => update({ mode: 'p90' })} aria-pressed={ui.mode === 'p90'} style={chipStyle(ui.mode === 'p90')}>{t('spelers.mode.p90')}</button>
              </div>
            </div>
          </div>
          <div style={{ marginTop: '14px' }}>
            <span style={labelStyle}>{t('spelers.filter.scope')}</span>
            <ScopeFilter t={t} scope={ui.scope} onChange={scope => update({ scope })} />
          </div>
          {ui.per !== 'season' && <p style={{ color: 'var(--text-3)', fontSize: '12px', margin: '-6px 0 0' }}>{t('spelers.period.note', { n: ui.per })}</p>}
          {ui.mode === 'p90' && <p style={{ color: 'var(--text-3)', fontSize: '12px', margin: '6px 0 0' }}>{t('spelers.mode.p90Note', { min: MIN_MINUTES_PER90 })}</p>}
        </div>
      )}

      {/* Kolompresets */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }} role="group" aria-label={t('spelers.presets.label')}>
        {PRESET_KEYS.map(key => (
          <button key={key} type="button" onClick={() => update({ cols: key })} aria-pressed={ui.cols === key} style={chipStyle(ui.cols === key)}>
            {t(`spelers.presets.${key}`)}
          </button>
        ))}
      </div>

      {loading && !data && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', fontSize: '13px', margin: '24px 0' }}>
          <Loader2 size={16} className="fdr-spin" aria-hidden="true" /> {t('spelers.loading')}
        </div>
      )}

      {!loading && error && !data && (
        <ErrorBanner t={t} onRetry={reload}>{t('spelers.error')}</ErrorBanner>
      )}

      {data && (error || data.stale) && (
        <ErrorBanner t={t} onRetry={reload}>
          {t('spelers.staleNotice', { gw: data.gw })}{fromLocal ? ` ${t('spelers.staleLocal')}` : ''}
        </ErrorBanner>
      )}

      {compareRows.length > 0 && (
        <ComparePanel
          t={t} rows={compareRows} mode={ui.mode} fromGw={fromGw} ratings={ratings} homeAdvantage={homeAdvantage}
          onRemove={toggleCompare} onClear={() => update({ compare: [] })} onOpen={openPopup}
        />
      )}

      {data && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-2)', fontSize: '12px', flex: 1 }}>
              {t('spelers.count', { n: sorted.length })} · {periodLabel}{ui.mode === 'p90' ? ` · ${t('spelers.mode.p90')}` : ''} · {t('spelers.dataUntil', { gw: data.gw, season: data.season })}
            </span>
            {filtersActive ? (
              <button type="button" onClick={resetFilters} style={{ ...chipStyle(false), padding: '5px 10px' }}>{t('spelers.filter.reset')}</button>
            ) : null}
          </div>

          {sorted.length === 0 ? (
            ui.scope !== 'all'
              ? <ScopeEmptyMessage t={t} scope={ui.scope} hasAny={ui.scope === 'myTeam' ? hasMyTeam : hasWatchlist} />
              : (
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '16px' }}>
                  <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>{t('spelers.empty')}</p>
                </div>
              )
          ) : (
            <div className="spl-table-wrap">
              <table className="spl-table">
                <caption className="sr-only">{t('spelers.tableCaption')}</caption>
                <thead>
                  <tr>
                    <SortHeader label={t('spelers.col.name')} sortKey="name" state={ui} onSort={onSort} align="left" sticky />
                    <SortHeader label={t('spelers.col.club')} sortKey="club" state={ui} onSort={onSort} align="left" />
                    <SortHeader label={t('spelers.col.posShort')} sortKey="pos" state={ui} onSort={onSort} align="left" />
                    {columns.map(key => (
                      <SortHeader
                        key={key}
                        label={`${t(`${COLUMNS[key].label}Short`)}${ui.mode === 'p90' && COLUMNS[key].per90 ? '/90' : ''}`}
                        title={t(COLUMNS[key].label)}
                        sortKey={key} state={ui} onSort={onSort}
                      />
                    ))}
                    {(ui.cols === 'overview' || ui.cols === 'ownership') && (
                      <th scope="col" style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--ink-1)', borderBottom: '1px solid rgba(255,255,255,0.12)', color: 'var(--text-2)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', padding: '9px 8px', textAlign: 'left', whiteSpace: 'nowrap' }}>
                        {t('spelers.col.next')}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {sorted.slice(0, visible).map(r => {
                    const inCompare = ui.compare.includes(r.id);
                    return (
                      <tr key={r.id}>
                        <td className="spl-sticky">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                            <input
                              type="checkbox"
                              checked={inCompare}
                              disabled={!inCompare && ui.compare.length >= MAX_COMPARE}
                              onChange={() => toggleCompare(r.id)}
                              aria-label={t('spelers.compare.addAria', { name: r.name })}
                              title={t('spelers.compare.addAria', { name: r.name })}
                              style={{ accentColor: 'var(--accent)', width: '16px', height: '16px', margin: 0, flexShrink: 0, cursor: 'pointer' }}
                            />
                            <PlayerPhoto player={r} size={28} />
                            <div className="spl-name-cell" style={{ minWidth: 0 }}>
                              <button type="button" className="spl-name-btn" onClick={() => openPopup(r.id)} style={{ maxWidth: '100%' }}>
                                <span className="spl-name-full">{r.name}</span>
                                <span className="spl-name-short">{r.short || r.name}</span>
                              </button>
                            </div>
                          </div>
                        </td>
                        <td style={{ textAlign: 'left' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                            <ClubLogo code={r.club} size={16} /> <span className="spl-hide-mobile" style={{ fontSize: '12px', color: 'var(--text-2)' }}>{r.club}</span>
                          </span>
                        </td>
                        <td style={{ textAlign: 'left', fontSize: '12px', color: 'var(--text-2)' }}>{t(`spelers.posShort.${r.pos}`)}</td>
                        {columns.map(key => {
                          if (key === 'form') {
                            return (
                              <td key={key}>
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                  <Sparkline spark={r.spark.slice(-5)} width={40} height={16} label={t('spelers.sparkAria', { list: r.spark.slice(-5).map(s => s.pts ?? '—').join(', ') })} />
                                  <strong>{r.form}</strong>
                                </span>
                              </td>
                            );
                          }
                          const value = cellValue(r, key, ui.mode);
                          return (
                            <td key={key} style={{ fontWeight: key === ui.sort ? 800 : 500, color: key === ui.sort ? 'var(--text-1)' : undefined }}>
                              {formatCell(value, key, ui.mode)}
                            </td>
                          );
                        })}
                        {(ui.cols === 'overview' || ui.cols === 'ownership') && (
                          <td style={{ textAlign: 'left' }}>
                            <UpcomingFixtures club={r.club} fromGw={fromGw} count={3} ratings={ratings} homeAdvantage={homeAdvantage} wrap={false} />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sorted.length > visible && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
              <button type="button" onClick={() => setVisible(v => v + PAGE_SIZE)} style={chipStyle(false)}>
                {t('spelers.showMore', { n: Math.min(PAGE_SIZE, sorted.length - visible), total: sorted.length - visible })}
              </button>
            </div>
          )}

          <p style={{ color: 'var(--text-3)', fontSize: '11px', marginTop: '12px', lineHeight: 1.5 }}>
            {t('spelers.footnote')}
          </p>
        </>
      )}

      {popupRow && (
        <Suspense fallback={null}>
          <SpelerPopup
            t={t}
            player={popupRow}
            gw={gw}
            fromGw={fromGw}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            onClose={closePopup}
            isWatched={watched(popupRow)}
            onToggleWatch={toggleWatchlistPlayer ? () => toggleWatch(popupRow) : undefined}
            inCompare={ui.compare.includes(popupRow.id)}
            compareFull={ui.compare.length >= MAX_COMPARE}
            onToggleCompare={() => toggleCompare(popupRow.id)}
            onOpenClub={onOpenClub ? (code) => { setUi(prev => ({ ...prev, speler: null })); onOpenClub(code); } : undefined}
          />
        </Suspense>
      )}
    </>
  );
}
