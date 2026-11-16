// Gedeelde hulpstukken voor de serverfuncties die API-Football gebruiken (api/team-form.js,
// api/shots.js, ...). Een map die met "_" begint, publiceert Vercel niet als aparte serverfunctie.
//
// De sleutel (omgevingsvariabele API_FOOTBALL_KEY in Vercel) blijft altijd op de server: de browser
// praat enkel met onze eigen functies, nooit rechtstreeks met API-Football.

export const API_BASE = 'https://v3.football.api-sports.io';
export const JUPILER_PRO_LEAGUE = 144;

// Gespeelde wedstrijden. AWD (reglementair) en WO (forfait) tellen mee als echte competitie-uitslag.
export const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];

// API-Football nummert een seizoen naar het startjaar: 2026-27 is season=2026. Vanaf juli hoort een datum
// bij het seizoen dat dat jaar begint, daarvoor bij het vorige. API_FOOTBALL_SEASON overschrijft dit.
export function currentSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

export function apiSeason() {
  return Number(process.env.API_FOOTBALL_SEASON) || currentSeason();
}

// --- Clubs ----------------------------------------------------------------------------------------
//
// Herkenning van de API-teamnamen ("Club Brugge KV", "St. Truiden", "Union St. Gilloise", ...) op
// sleutelwoord. Volgorde telt: 'cercle' moet vóór 'brugge' staan, anders wordt Cercle als Club gelezen.
// Elk sleutelwoord moet als volledig woord in de naam staan (geen deel van een woord), zodat bv. "genk"
// en "gent" elkaar nooit raken.
export const CLUB_KEYWORDS = [
  ['CER', ['cercle']],
  ['CLU', ['brugge', 'bruges']],
  ['AND', ['anderlecht']],
  ['ANT', ['antwerp', 'antwerpen']],
  ['BEV', ['beveren']],
  ['CHA', ['charleroi']],
  ['GNK', ['genk']],
  ['GNT', ['gent', 'ghent']],
  ['KOR', ['kortrijk']],
  ['KVM', ['mechelen']],
  ['LLV', ['louviere']],
  ['LOM', ['lommel']],
  ['OHL', ['leuven']],
  ['STA', ['standard', 'liege']],
  ['STV', ['truiden', 'trond', 'stvv']],
  ['USG', ['union', 'gilloise']],
  ['WES', ['westerlo']],
  ['ZWA', ['waregem']],
];

export function clubCodeFromApiName(name) {
  const words = normalizeName(name).split(' ').filter(Boolean);
  for (const [code, keywords] of CLUB_KEYWORDS) {
    if (keywords.some(k => words.includes(k))) return code;
  }
  return null;
}

// --- Verzoeken ------------------------------------------------------------------------------------

export class ApiFootballError extends Error {}

// API-Football geeft fouten terug als HTTP 200 met een gevuld "errors"-veld (object of array), bv.
// { token: 'Error/Missing application key' } of { requests: 'You have reached the request limit...' }.
export function apiErrorMessage(body) {
  const errors = body?.errors;
  if (!errors) return null;
  const messages = Array.isArray(errors) ? errors : Object.values(errors);
  return messages.length > 0 ? messages.map(String).join('; ') : null;
}

// Eén GET met time-out en één nieuwe poging bij een netwerkfout of 5xx. Geeft body.response terug.
export async function apiFootball(path, params = {}, { timeoutMs = 10000, retries = 1 } = {}) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new ApiFootballError('API_FOOTBALL_KEY ontbreekt in de omgevingsvariabelen.');
  const url = new URL(`${API_BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, String(v));
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'x-apisports-key': key }, signal: AbortSignal.timeout(timeoutMs) });
      if (!response.ok) {
        lastError = new ApiFootballError(`API-Football antwoordde met HTTP ${response.status}.`);
        if (response.status < 500) break; // 4xx: opnieuw proberen helpt niet
        continue;
      }
      const body = await response.json();
      const apiError = apiErrorMessage(body);
      if (apiError) throw new ApiFootballError(`API-Football: ${apiError}`);
      return Array.isArray(body?.response) ? body.response : [];
    } catch (err) {
      if (err instanceof ApiFootballError) throw err;
      lastError = new ApiFootballError(`API-Football onbereikbaar: ${err?.message ?? err}`);
    }
  }
  throw lastError;
}

// Alle gespeelde competitiewedstrijden van het seizoen (één verzoek).
export function fetchFinishedFixtures(season = apiSeason()) {
  return apiFootball('fixtures', { league: JUPILER_PRO_LEAGUE, season, status: FINISHED_STATUSES.join('-') });
}

// Volledige gegevens (spelersstatistieken, ploegstatistieken, opstellingen) van gespeelde wedstrijden.
// API-Football geeft tot 20 wedstrijden per verzoek ("ids=1-2-3"). Een gespeelde wedstrijd verandert
// niet meer, dus blijft hij per serverinstantie in het geheugen: na de eerste keer kost een nieuwe
// speeldag enkel nog één verzoek voor de nieuwe wedstrijden.
const fixtureDetails = new Map();
const IDS_PER_REQUEST = 20;

export async function fetchFixtureDetails(ids) {
  const missing = [...new Set(ids)].filter(id => !fixtureDetails.has(id));
  for (let i = 0; i < missing.length; i += IDS_PER_REQUEST) {
    const batch = missing.slice(i, i + IDS_PER_REQUEST);
    const details = await apiFootball('fixtures', { ids: batch.join('-') });
    for (const detail of details) {
      const id = detail?.fixture?.id;
      if (id != null && FINISHED_STATUSES.includes(detail?.fixture?.status?.short)) fixtureDetails.set(id, detail);
    }
  }
  return ids.map(id => fixtureDetails.get(id)).filter(Boolean);
}

// --- Spelers koppelen -----------------------------------------------------------------------------

// Letters die NFD niet ontleedt (Ł in "Łakomy", Ø, ...) eerst omzetten.
const SPECIAL_LETTERS = { ł: 'l', Ł: 'l', ø: 'o', Ø: 'o', đ: 'd', Đ: 'd', ß: 'ss', æ: 'ae', Æ: 'ae', œ: 'oe', Œ: 'oe', ı: 'i' };

export function normalizeName(value) {
  return String(value ?? '')
    .replace(/[łŁøØđĐßæÆœŒı]/g, ch => SPECIAL_LETTERS[ch])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Koppelt een speler van API-Football aan een Fantasy Pro League-speler van dezelfde club.
// fplPlayers: [{ id, name, short, club }]. Volgorde (de eerste die één speler oplevert):
//   1. volledige naam gelijk (zonder accenten/hoofdletters)
//   2. achternaam gelijk (laatste woord, of de korte naam van Fantasy Pro League), en bij meerdere
//      kandidaten de eerste letter van de voornaam
//   3. alle woorden van de korte naam staan in de API-naam (bv. "Van der Heyden")
//   4. de API-naam bevat de volledige Fantasy Pro League-naam of omgekeerd
//   5. dezelfde volledige naam bij een andere club (een transfer binnen de competitie: de wedstrijden
//      bij de vorige club tellen dan mee, net zoals in de punten van Fantasy Pro League)
// Lukt geen enkele stap met precies één kandidaat, dan geen koppeling (liever "—" dan een fout cijfer).
// Spelers die de competitie verlieten, staan niet meer bij Fantasy Pro League en blijven dus ongekoppeld.
export function buildPlayerMatcher(fplPlayers) {
  const byClub = new Map();
  const byFull = new Map();
  for (const p of fplPlayers) {
    if (!p?.club || !p?.name) continue;
    const full = normalizeName(p.name);
    const tokens = full.split(' ');
    const short = normalizeName(p.short) || tokens[tokens.length - 1];
    const entry = { id: p.id, full, tokens, short, last: tokens[tokens.length - 1] };
    if (!byClub.has(p.club)) byClub.set(p.club, []);
    byClub.get(p.club).push(entry);
    byFull.set(full, byFull.has(full) ? null : p.id); // null = naam komt meer dan eens voor
  }
  const one = (list) => (list.length === 1 ? list[0].id : null);

  return (apiName, club) => {
    const candidates = byClub.get(club) ?? [];
    const full = normalizeName(apiName);
    if (!full) return null;
    const tokens = full.split(' ');
    const last = tokens[tokens.length - 1];
    const first = tokens[0]?.[0];

    const exact = candidates.filter(c => c.full === full);
    if (exact.length) return one(exact);

    const byLast = candidates.filter(c => c.last === last || c.short === last || full.endsWith(` ${c.short}`));
    if (byLast.length === 1) return byLast[0].id;
    if (byLast.length > 1) {
      const byInitial = byLast.filter(c => c.tokens[0]?.[0] === first);
      if (byInitial.length === 1) return byInitial[0].id;
    }

    const byShortWords = candidates.filter(c => c.short.split(' ').every(w => tokens.includes(w)));
    if (byShortWords.length === 1) return byShortWords[0].id;

    const contains = candidates.filter(c => full.includes(c.full) || c.full.includes(full));
    if (contains.length === 1) return contains[0].id;

    return byFull.get(full) ?? null;
  };
}

// --- Wedstrijden koppelen aan speeldagen ----------------------------------------------------------
//
// Een speeldag (GW) is die van Fantasy Pro League: een uitgestelde wedstrijd telt in de speeldag waarin
// ze echt gespeeld wordt. Daarom koppelen we elke API-wedstrijd aan de Fantasy Pro League-wedstrijd met
// dezelfde thuis- en uitploeg (bij meerdere: de dichtstbijzijnde datum) en nemen we diens weekId.
// fplMatches: [{ weekId, home, away, date }] met sitecodes.
export function buildWeekResolver(fplMatches) {
  const byPair = new Map();
  for (const m of fplMatches) {
    if (!m?.home || !m?.away || !m?.weekId) continue;
    const key = `${m.home}-${m.away}`;
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push({ weekId: m.weekId, time: Date.parse(m.date) || 0 });
  }
  return (home, away, date) => {
    const list = byPair.get(`${home}-${away}`) ?? [];
    if (list.length === 0) return null;
    const time = Date.parse(date) || 0;
    return list.reduce((best, m) => (Math.abs(m.time - time) < Math.abs(best.time - time) ? m : best)).weekId;
  };
}

export function sendJson(res, status, body, cacheControl) {
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}
