// Gedeelde hulpstukken voor de serverfuncties die de publieke Fantasy Pro League-API gebruiken
// (api/players.js, api/player/[id].js, api/rankings.js). Bestanden in een map die met "_" begint
// worden door Vercel NIET als aparte serverfunctie gepubliceerd; dit is gewoon gedeelde code.
//
// De bron (https://proleague.code.brussels) is de API achter fantasy.proleague.be. Hij is publiek
// (geen login nodig voor wat we hier opvragen) maar niet officieel gedocumenteerd: velden kunnen
// zonder waarschuwing veranderen. Daarom wordt alles hier defensief gelezen (num(), list(), ...),
// zodat één ontbrekend veld nooit de hele pagina breekt.

export const BASE_URL = 'https://proleague.code.brussels';
export const COMPETITION_FEED = 'JPL';

// seasonId 2027 = seizoen 2026-27 (2026 = 2025-26, 2025 = 2024-25). Overschrijfbaar via een
// Vercel-omgevingsvariabele, zodat volgend seizoen geen codewijziging nodig is.
export const SEASON_ID = Number(process.env.PROLEAGUE_SEASON_ID) || 2027;

export function seasonLabel(seasonId) {
  return `${seasonId - 1}-${String(seasonId).slice(2)}`;
}

// positionId uit de API -> de afkortingen die de rest van de site gebruikt.
export const POSITIONS = { 1: 'GK', 2: 'DEF', 3: 'MID', 4: 'FWD' };

// De API gebruikt bijna overal dezelfde clubcodes als de site, op één na: La Louvière heet daar
// "LAL", op de site (constants.js -> TEAMS) "LLV".
const CLUB_CODE_FIXES = { LAL: 'LLV' };
export function siteClubCode(apiShort) {
  const code = String(apiShort ?? '').trim().toUpperCase();
  return CLUB_CODE_FIXES[code] ?? code;
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function list(value) {
  return Array.isArray(value) ? value : [];
}

// --- Bonuspunten ----------------------------------------------------------------------------------
//
// Officiële regels: per wedstrijd 1 punt per voorwaarde die gehaald wordt. Bewust zelf berekend uit de
// ruwe aantallen: de punten-per-categorie-velden van de API kloppen niet altijd met het officiële totaal.
// Zelfde regels als BONUS_THRESHOLD in src/bonuspunten.js en de bestaande Google Sheet.
// Gecontroleerd t.e.m. GW11: Vanaken 8, Mechele 16, Schrijvers 13, Abid 8, Smets 13.
//
// Keepers (positionId 1) kunnen enkel het punt voor duels halen; kopballen, recoveries en grote kansen
// tellen voor hen niet (spelregel bevestigd door de eigenaar, FUNCTIONALITEIT_SPEC A6).
// Gecontroleerd na GW11: 60/60 keepers gelijk aan de sheet (Sommer 3, Roef 3, Coosemans 5, ...).
// Zonder die regel weken er 25 af.
export const GOALKEEPER_POSITION_ID = 1;

export function bonusForMatch({ duelWon, duelLost, headClearance, ballRecovery, bigChanceCreated }, positionId = null) {
  const duels = num(duelWon) > num(duelLost) ? 1 : 0;
  if (Number(positionId) === GOALKEEPER_POSITION_ID) {
    return { total: duels, duels, headers: 0, recoveries: 0, bigChances: 0 };
  }
  const headers = num(headClearance) > 3 ? 1 : 0;
  const recoveries = num(ballRecovery) > 5 ? 1 : 0;
  const bigChances = num(bigChanceCreated) > 1 ? 1 : 0;
  return { total: duels + headers + recoveries + bigChances, duels, headers, recoveries, bigChances };
}

// De site gebruikt 'GK'/'DEF'/... en de API 1-4. Leest beide, voor ?pos= in /api/player/[id].
export function positionIdFrom(value) {
  const n = Number(value);
  if (POSITIONS[n]) return n;
  const entry = Object.entries(POSITIONS).find(([, code]) => code === String(value ?? '').toUpperCase());
  return entry ? Number(entry[0]) : null;
}

// --- Ophalen --------------------------------------------------------------------------------------

function buildUrl(path, params) {
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

// Eén GET met time-out en één nieuwe poging bij een netwerkfout of 5xx. De time-out zorgt dat een
// hangende bron de functie niet tot de Vercel-limiet laat wachten.
export async function fetchJson(path, params = {}, { timeoutMs = 9000, retries = 1, withSeason = true } = {}) {
  const query = withSeason ? { competitionFeed: COMPETITION_FEED, seasonId: SEASON_ID, ...params } : params;
  const url = buildUrl(path, query);
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        lastError = new Error(`bron antwoordde met HTTP ${response.status} (${path})`);
        if (response.status < 500) break; // 4xx: opnieuw proberen helpt niet
        continue;
      }
      return await response.json();
    } catch (err) {
      lastError = new Error(`bron onbereikbaar (${path}): ${err?.message ?? err}`);
    }
  }
  throw lastError;
}

// players-stats is gepagineerd. Eén pagina van 600 volstaat vandaag (±515 spelers), maar mocht de
// bron ooit meer rijen hebben, dan halen we de volgende pagina's ook op i.p.v. stil spelers te missen.
export async function fetchAllStats(params = {}) {
  const pageRecords = 600;
  const first = await fetchJson('players-stats', { pageNumber: 1, pageRecords, ...params });
  const rows = [...list(first?.data)];
  const total = num(first?.totalRecords);
  for (let page = 2; rows.length < total && page <= 5; page++) {
    const next = await fetchJson('players-stats', { pageNumber: page, pageRecords, ...params });
    const data = list(next?.data);
    if (data.length === 0) break;
    rows.push(...data);
  }
  return rows;
}

// Clubs: id -> { code, name }. Wijzigt nooit tijdens een seizoen, dus per serverinstantie bewaard.
let clubsCache = null;
export async function fetchClubs() {
  if (clubsCache) return clubsCache;
  const body = await fetchJson('clubs');
  const map = new Map();
  for (const club of list(body?.clubs)) {
    if (club?.id == null) continue;
    map.set(club.id, { code: siteClubCode(club.short), name: String(club.name ?? '') });
  }
  if (map.size > 0) clubsCache = map;
  return map;
}

// Kalender + uitslagen, 10 minuten per serverinstantie bewaard (uitslagen veranderen enkel tijdens
// een speeldag, en de CDN-cache vóór de functie vangt het meeste verkeer al op).
let matchesCache = null;
export async function fetchMatches() {
  if (matchesCache && Date.now() - matchesCache.at < 10 * 60 * 1000) return matchesCache.matches;
  const body = await fetchJson('matches');
  const matches = list(body?.matches);
  if (matches.length > 0) matchesCache = { at: Date.now(), matches };
  return matches;
}

// Foto: de bron heeft voor ±20 spelers enkel een silhouet ("dummy-<club>.png"). Dat tonen we niet:
// de site toont dan initialen, wat duidelijker is dan een anoniem poppetje.
export function photoUrl(portraitUrl) {
  const url = String(portraitUrl ?? '');
  if (!url.startsWith('https://') || /\/dummy[-_]/i.test(url)) return null;
  return url;
}

export function sendJson(res, status, body, cacheControl) {
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}
