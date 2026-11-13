// Rekenlogica voor de Spelers-tab (src/tabs/SpelersTab.jsx): kolommen, periodes (seizoen of laatste
// 3/5/8 speeldagen), per-90-waarden, filteren, sorteren en de URL-staat. Bevat geen JSX en geen
// netwerkverkeer, zodat alles hier los te testen valt. De data zelf komt uit /api/players.

export const POSITION_KEYS = ['GK', 'DEF', 'MID', 'FWD'];

// 'season' = heel het seizoen; een getal = de laatste N gespeelde speeldagen.
export const PERIODS = ['season', 3, 5, 8];

// Onder deze grens is een per-90-waarde ruis (één invalbeurt van 10 minuten met een goal is anders
// "9 goals per 90"). Zelfde grens als in de opdracht: minstens 180 minuten.
export const MIN_MINUTES_PER90 = 180;

export const MIN_MINUTES_OPTIONS = [0, 90, 180, 450, 900];

// Hoeveel speeldagen de vorm-sparkline en de "vorm"-kolom bestrijken.
export const FORM_GWS = 5;
export const SPARK_GWS = 5;

// --- Kolommen ------------------------------------------------------------------------------------
//
// Elke kolom: key, label (i18n-sleutel), get(row) -> getal of null, en
//   period: true  -> herberekend voor de gekozen periode (punten, minuten, goals, assists, bonus)
//   per90:  true  -> kan per 90 minuten getoond worden
//   decimals: aantal decimalen bij weergave
//   title: i18n-sleutel voor de tooltip in de kolomkop (anders het label zelf)
//   lowerIsBetter: voor de "beste waarde"-markering in Vergelijken
export const COLUMNS = {
  price: { label: 'spelers.col.price', get: r => r.price, decimals: 1, format: v => `€${v.toFixed(1)}`, lowerIsBetter: true, noBest: true },
  pts: { label: 'spelers.col.pts', get: r => r.pts, period: true, per90: true },
  ppm: { label: 'spelers.col.ppm', get: r => r.ppm, decimals: 1 },
  ppg: { label: 'spelers.col.ppg', get: r => r.ppg, decimals: 1 },
  form: { label: 'spelers.col.form', title: 'spelers.col.formTitle', get: r => r.form, decimals: 1 },
  sel: { label: 'spelers.col.sel', get: r => r.sel, format: v => `${v}%` },
  min: { label: 'spelers.col.min', get: r => r.min, period: true },
  mp: { label: 'spelers.col.mp', get: r => r.mp, period: true },
  g: { label: 'spelers.col.g', get: r => r.g, period: true, per90: true },
  a: { label: 'spelers.col.a', get: r => r.a, period: true, per90: true },
  bc: { label: 'spelers.col.bc', get: r => r.bc, per90: true },
  cs: { label: 'spelers.col.cs', get: r => r.cs, per90: true },
  hc: { label: 'spelers.col.hc', get: r => r.hc, per90: true },
  dw: { label: 'spelers.col.dw', get: r => r.dw, per90: true },
  dl: { label: 'spelers.col.dl', get: r => r.dl, per90: true, lowerIsBetter: true },
  br: { label: 'spelers.col.br', get: r => r.br, per90: true },
  int: { label: 'spelers.col.int', get: r => r.int, per90: true },
  sv: { label: 'spelers.col.sv', get: r => r.sv, per90: true },
  ps: { label: 'spelers.col.ps', get: r => r.ps },
  yc: { label: 'spelers.col.yc', get: r => r.yc, lowerIsBetter: true },
  rc: { label: 'spelers.col.rc', get: r => r.rc, lowerIsBetter: true },
  bp: { label: 'spelers.col.bp', get: r => r.bp, period: true, per90: true },
  bpDuels: { label: 'spelers.col.bpDuels', get: r => r.bpDuels },
  bpHeaders: { label: 'spelers.col.bpHeaders', get: r => r.bpHeaders },
  bpRecoveries: { label: 'spelers.col.bpRecoveries', get: r => r.bpRecoveries },
  bpBigChances: { label: 'spelers.col.bpBigChances', get: r => r.bpBigChances },
};

// Kolompresets (keuze boven de tabel). Foto, naam, club en positie staan er altijd bij.
// "Ownership" heeft geen trendkolom: de bron geeft het selectiepercentage enkel als huidig getal (in
// elke speeldag hetzelfde), dus een trend zou verzonnen zijn. "% kapitein" en "tegengoals" zijn sinds
// de rework (spec §7.4) geen kolommen meer; een oude link met sort=cap of sort=gc valt terug op punten.
export const PRESETS = {
  overview: ['price', 'pts', 'ppm', 'form', 'sel', 'min'],
  attack: ['price', 'pts', 'g', 'a', 'bc', 'min'],
  defence: ['price', 'pts', 'cs', 'hc', 'dw', 'dl', 'br'],
  bonus: ['pts', 'bp', 'bpDuels', 'bpHeaders', 'bpRecoveries', 'bpBigChances'],
  ownership: ['price', 'sel', 'pts', 'ppm', 'form'],
};
export const PRESET_KEYS = Object.keys(PRESETS);

// Standaardsortering wanneer je een preset kiest (enkel waar die afwijkt van punten).
export const PRESET_SORT = { ownership: { sort: 'sel', dir: 'desc' } };

// "Differentials": spelers met een ownership onder deze grens (in %).
export const DIFFERENTIAL_MAX_SEL = 5;

// Rijen in Vergelijken.
export const COMPARE_ROWS = ['price', 'pts', 'ppm', 'ppg', 'form', 'mp', 'min', 'g', 'a', 'bp', 'cs', 'bc', 'br', 'sel'];
export const MAX_COMPARE = 4;

// --- Rijen berekenen -----------------------------------------------------------------------------

function sumRange(arr, from, to) {
  if (!arr) return 0;
  let total = 0;
  for (let i = from; i < to; i++) total += arr[i] ?? 0;
  return total;
}

function countPlayed(minArr, from, to) {
  if (!minArr) return 0;
  let count = 0;
  for (let i = from; i < to; i++) if ((minArr[i] ?? 0) > 0) count++;
  return count;
}

const ratio = (a, b) => (b > 0 ? a / b : null);

// Vorm (spec E4): het gemiddelde aantal punten per speeldag over de laatste FORM_GWS speeldagen (of
// minder, vroeg in het seizoen). Een speeldag zonder minuten telt mee als 0: zo lees je "vorm" zoals in
// FPL. Eén functie voor de Spelers-tabel, de spelerskiezer, de Team Planner en de spelerskaart.
// weekPts = de weekreeks (player.w.pts), gw = laatst gespeelde speeldag. null als er nog niets gespeeld is.
export function formAverage(weekPts, gw, n = FORM_GWS) {
  if (!Array.isArray(weekPts) || !(gw > 0)) return null;
  const from = Math.max(0, gw - n);
  return sumRange(weekPts, from, gw) / (gw - from);
}

// Vorm met één decimaal voor de weergave ("6.2"), of null.
export const formatForm = (value) => (Number.isFinite(value) ? value.toFixed(1) : null);

// Speler uit /api/players + gekozen periode -> één tabelrij met alle afgeleide waarden.
// `gw` = laatst gespeelde speeldag (lengte van de weekreeksen).
export function buildRow(player, period, gw) {
  const w = player.w;
  const isSeason = period === 'season';
  const from = isSeason ? 0 : Math.max(0, gw - period);
  const base = isSeason
    ? { pts: player.pts, min: player.min, g: player.g, a: player.a, bp: player.bp, mp: player.mp }
    : {
      pts: sumRange(w?.pts, from, gw),
      min: sumRange(w?.min, from, gw),
      g: sumRange(w?.g, from, gw),
      a: sumRange(w?.a, from, gw),
      bp: sumRange(w?.bp, from, gw),
      mp: countPlayed(w?.min, from, gw),
    };
  const sparkFrom = Math.max(0, gw - SPARK_GWS);
  return {
    ...player,
    ...base,
    seasonMin: player.min,
    ppm: player.price > 0 ? base.pts / player.price : null,
    ppg: ratio(base.pts, base.mp),
    p90: base.min >= MIN_MINUTES_PER90 ? (base.pts / base.min) * 90 : null,
    minPerMatch: ratio(base.min, base.mp),
    form: formAverage(w?.pts, gw),
    spark: Array.from({ length: gw - sparkFrom }, (_, i) => ({ gw: sparkFrom + i + 1, pts: w?.pts?.[sparkFrom + i] ?? null })),
  };
}

// Waarde van een kolom voor een rij, rekening houdend met de Totaal/Per 90-schakelaar. Per 90 gebruikt
// de minuten van dezelfde periode als de statistiek zelf: periodekolommen delen door de minuten in die
// periode, seizoenskolommen door de seizoensminuten.
export function cellValue(row, key, mode) {
  const col = COLUMNS[key];
  if (!col) return null;
  const raw = col.get(row);
  if (raw == null) return null;
  if (mode !== 'p90' || !col.per90) return raw;
  const minutes = col.period ? row.min : row.seasonMin;
  return minutes >= MIN_MINUTES_PER90 ? (raw / minutes) * 90 : null;
}

export function formatCell(value, key, mode) {
  if (value == null) return '—';
  const col = COLUMNS[key];
  const isPer90 = mode === 'p90' && col?.per90;
  if (col?.format && !isPer90) return col.format(value);
  const decimals = isPer90 ? 2 : (col?.decimals ?? 0);
  return decimals ? value.toFixed(decimals) : String(Math.round(value));
}

// --- Zoeken en matchen ---------------------------------------------------------------------------

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// API-speler -> dezelfde speler in de spelersdatabank van de site (Google Sheet), want de watchlist en
// "Mijn team" kennen spelers op hun naam zoals die in de sheet staat. Eerst exacte naam (zonder
// accenten/hoofdletters) binnen dezelfde club, dan de achternaam binnen de club als die uniek is.
export function buildSheetNameResolver(playerDatabase) {
  const byFull = new Map();
  const byLast = new Map();
  for (const p of playerDatabase ?? []) {
    if (!p?.name || !p?.teamCode) continue;
    const full = `${normalizeName(p.name)}|${p.teamCode}`;
    if (!byFull.has(full)) byFull.set(full, p.name);
    const parts = normalizeName(p.name).split(' ');
    const last = `${parts[parts.length - 1]}|${p.teamCode}`;
    byLast.set(last, byLast.has(last) ? null : p.name); // null = niet uniek
  }
  return (player) => {
    const full = byFull.get(`${normalizeName(player.name)}|${player.club}`)
      ?? (player.short ? byFull.get(`${normalizeName(player.short)}|${player.club}`) : undefined);
    if (full) return full;
    const parts = normalizeName(player.short || player.name).split(' ');
    const last = byLast.get(`${parts[parts.length - 1]}|${player.club}`);
    return last || player.name;
  };
}

// --- Filteren en sorteren ------------------------------------------------------------------------

// isAvailable(row) -> false voor wie geschorst is (src/availability.js); enkel gebruikt met f.avail.
export function filterRows(rows, f, { matchesScope, isAvailable } = {}) {
  const query = normalizeName(f.q);
  return rows.filter(r => {
    if (f.pos.length > 0 && !f.pos.includes(r.pos)) return false;
    if (f.club && r.club !== f.club) return false;
    if (f.pmin != null && r.price < f.pmin) return false;
    if (f.pmax != null && r.price > f.pmax) return false;
    if (f.mins > 0 && r.min < f.mins) return false;
    if (f.diff && (r.sel ?? 0) >= DIFFERENTIAL_MAX_SEL) return false;
    if (query && !normalizeName(r.name).includes(query)) return false;
    if (matchesScope && !matchesScope(r)) return false;
    if (f.avail && isAvailable && !isAvailable(r)) return false;
    return true;
  });
}

export function sortRows(rows, sortKey, dir, mode) {
  const sign = dir === 'asc' ? 1 : -1;
  const value = (r) => {
    if (sortKey === 'name') return null;
    return cellValue(r, sortKey, mode);
  };
  return [...rows].sort((a, b) => {
    if (sortKey === 'name') return sign * a.name.localeCompare(b.name);
    if (sortKey === 'club' || sortKey === 'pos') {
      const order = sortKey === 'pos' ? (r => POSITION_KEYS.indexOf(r.pos)) : (r => r.club);
      const x = order(a); const y = order(b);
      return sign * (x < y ? -1 : x > y ? 1 : 0) || b.pts - a.pts;
    }
    const va = value(a); const vb = value(b);
    // Lege waarden ("—", bv. per 90 onder de 180 minuten) altijd onderaan, ongeacht de richting.
    if (va == null && vb == null) return b.pts - a.pts;
    if (va == null) return 1;
    if (vb == null) return -1;
    return sign * (va - vb) || b.pts - a.pts || a.name.localeCompare(b.name);
  });
}

// Index van de beste waarde per vergelijkingsrij (meerdere bij gelijkspel). Geen markering als alle
// waarden gelijk of leeg zijn: dan valt er niets te winnen.
export function bestIndexes(values, { lowerIsBetter = false } = {}) {
  const valid = values.map((v, i) => [v, i]).filter(([v]) => v != null);
  if (valid.length < 2) return new Set();
  const best = lowerIsBetter ? Math.min(...valid.map(([v]) => v)) : Math.max(...valid.map(([v]) => v));
  const winners = valid.filter(([v]) => v === best).map(([, i]) => i);
  return winners.length === valid.length ? new Set() : new Set(winners);
}

// --- URL-staat -----------------------------------------------------------------------------------
//
// Alles wat je instelt (filters, sortering, kolommen, vergelijking) staat in de URL, zodat je een
// gefilterde lijst of een vergelijking kan delen (bv. /spelers?compare=107,99). Enkel waarden die
// afwijken van de standaard komen in de URL, zodat een gewone link kort blijft.
export const SPELERS_QUERY_PARAMS = ['q', 'pos', 'club', 'pmin', 'pmax', 'mins', 'scope', 'per', 'mode', 'cols', 'sort', 'dir', 'compare', 'speler', 'diff', 'avail'];

export const DEFAULT_STATE = {
  q: '', pos: [], club: '', pmin: null, pmax: null, mins: 0, scope: 'all', per: 'season',
  mode: 'total', cols: 'overview', sort: 'pts', dir: 'desc', compare: [], speler: null, diff: false, avail: false,
};

const toNumberOrNull = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function stateFromSearch(search) {
  const p = new URLSearchParams(search);
  const per = p.get('per');
  const perValue = PERIODS.find(x => String(x) === per) ?? 'season';
  const sort = p.get('sort');
  return {
    q: (p.get('q') ?? '').slice(0, 40),
    pos: (p.get('pos') ?? '').split(',').map(s => s.trim().toUpperCase()).filter(s => POSITION_KEYS.includes(s)),
    club: (p.get('club') ?? '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3),
    pmin: toNumberOrNull(p.get('pmin')),
    pmax: toNumberOrNull(p.get('pmax')),
    mins: MIN_MINUTES_OPTIONS.includes(Number(p.get('mins'))) ? Number(p.get('mins')) : 0,
    scope: ['all', 'myTeam', 'watchlist'].includes(p.get('scope')) ? p.get('scope') : 'all',
    per: perValue,
    mode: p.get('mode') === 'p90' ? 'p90' : 'total',
    cols: PRESET_KEYS.includes(p.get('cols')) ? p.get('cols') : 'overview',
    sort: sort && (COLUMNS[sort] || ['name', 'club', 'pos'].includes(sort)) ? sort : 'pts',
    dir: p.get('dir') === 'asc' ? 'asc' : 'desc',
    compare: (p.get('compare') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, MAX_COMPARE),
    speler: toNumberOrNull(p.get('speler')),
    diff: p.get('diff') === '1',
    avail: p.get('avail') === '1',
  };
}

// Bouwt de nieuwe query-string: parameters van andere tabs (bv. ?r= en ?ha= van de FDR-ratings)
// blijven staan, de Spelers-parameters worden herschreven.
export function searchFromState(state, currentSearch = '') {
  const p = new URLSearchParams(currentSearch);
  SPELERS_QUERY_PARAMS.forEach(k => p.delete(k));
  const set = (k, v) => { if (v !== '' && v != null) p.set(k, String(v)); };
  if (state.q) set('q', state.q);
  if (state.pos.length) set('pos', state.pos.join(','));
  if (state.club) set('club', state.club);
  if (state.pmin != null) set('pmin', state.pmin);
  if (state.pmax != null) set('pmax', state.pmax);
  if (state.mins) set('mins', state.mins);
  if (state.scope !== 'all') set('scope', state.scope);
  if (state.per !== 'season') set('per', state.per);
  if (state.mode !== 'total') set('mode', state.mode);
  if (state.cols !== 'overview') set('cols', state.cols);
  if (state.sort !== 'pts') set('sort', state.sort);
  if (state.dir !== 'desc') set('dir', state.dir);
  if (state.compare.length) set('compare', state.compare.join(','));
  if (state.speler) set('speler', state.speler);
  if (state.diff) set('diff', 1);
  if (state.avail) set('avail', 1);
  const s = p.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}
