// Serverless function (Vercel, net als analyze-screenshot.js) die de recente vorm per club berekent uit
// de echte competitie-uitslagen van API-Football. Vervangt de handmatige TEAM_FORM in constants.js en het
// Vorm-werkblad in de Google Sheet: na elke speeldag staat de vormbalk vanzelf juist, zonder iets te typen.
//
// Waarom server-side: de API-sleutel (omgevingsvariabele API_FOOTBALL_KEY in Vercel) mag nooit in de
// browser terechtkomen. En door het antwoord op Vercels CDN te cachen (zie CACHE_OK hieronder) kost het
// hoogstens een paar API-requests per uur, ongeacht hoeveel bezoekers de site heeft.
//
// Enkel competitiewedstrijden: we vragen uitsluitend league=144 (Jupiler Pro League) op, dus beker- en
// Europese wedstrijden tellen nooit mee. Play-offs vallen onder dezelfde league en tellen dus wel mee.
//
// Response: { form: { CLU: ['W','G','V','W','W'], ... }, unmatched: [...], season, updatedAt }
//   - form: max. 5 laatste GESPEELDE wedstrijden per club, oudste eerst, nieuwste laatst ('W'/'G'/'V')
//   - unmatched: teamnamen uit de API die we niet aan een clubcode konden koppelen. Hoort leeg te zijn;
//     staat er iets in, dan moet CLUB_KEYWORDS hieronder aangevuld worden.
// Fout (geen sleutel, quotum op, API onbereikbaar) -> HTTP 5xx met { error }. De site toont dan gewoon
// geen vormbalk, nooit een verouderde of geraden uitslag.

const API_URL = 'https://v3.football.api-sports.io/fixtures';
const JUPILER_PRO_LEAGUE = 144;
const FORM_LENGTH = 5;

// Gespeelde wedstrijden. AWD (reglementair) en WO (forfait) tellen mee als echte competitie-uitslag.
const FINISHED_STATUSES = ['FT', 'AET', 'PEN', 'AWD', 'WO'];

// Succes: 30 minuten vers op de CDN, daarna nog een dag "stale" serveren terwijl op de achtergrond
// ververst wordt. Een uitslag van zaterdagavond staat er dus ten laatste een half uur later op.
const CACHE_OK = 'public, s-maxage=1800, stale-while-revalidate=86400';
// Fout: kort cachen, zodat een kapotte sleutel of een vol quotum de API niet bij elk bezoek opnieuw raakt.
const CACHE_ERROR = 'public, s-maxage=60';

// Herkenning van de API-teamnamen ("Club Brugge KV", "St. Truiden", "Union St. Gilloise", ...) op
// sleutelwoord. Volgorde telt: 'cercle' moet vóór 'brugge' staan, anders wordt Cercle als Club gelezen.
// Elk sleutelwoord moet als volledig woord in de naam staan (geen deel van een woord), zodat bv. "genk"
// en "gent" elkaar nooit raken.
const CLUB_KEYWORDS = [
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
  const words = String(name ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // "Liège" -> "liege"
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (const [code, keywords] of CLUB_KEYWORDS) {
    if (keywords.some(k => words.includes(k))) return code;
  }
  return null;
}

// API-Football nummert een seizoen naar het startjaar: 2026-27 is season=2026. Vanaf juli hoort een datum
// bij het seizoen dat dat jaar begint, daarvoor bij het vorige. API_FOOTBALL_SEASON overschrijft dit.
export function currentSeason(now = new Date()) {
  const year = now.getUTCFullYear();
  return now.getUTCMonth() >= 6 ? year : year - 1;
}

// 'W'/'G'/'V' vanuit het standpunt van één ploeg, of null als de uitslag niet te bepalen is.
function resultFor(goalsFor, goalsAgainst, isWinner) {
  if (Number.isFinite(goalsFor) && Number.isFinite(goalsAgainst)) {
    if (goalsFor > goalsAgainst) return 'W';
    if (goalsFor < goalsAgainst) return 'V';
    return 'G';
  }
  // Reglementaire uitslagen hebben soms geen doelpunten, enkel een winnaar.
  if (isWinner === true) return 'W';
  if (isWinner === false) return 'V';
  return null;
}

// Pure berekening, los van het netwerk (testbaar): fixtures uit de API -> vorm per clubcode.
export function computeForm(fixtures) {
  const played = fixtures
    .filter(f => FINISHED_STATUSES.includes(f?.fixture?.status?.short))
    .sort((a, b) => (a.fixture.timestamp ?? 0) - (b.fixture.timestamp ?? 0));

  const form = {};
  const unmatched = new Set();
  const add = (teamName, result) => {
    const code = clubCodeFromApiName(teamName);
    if (!code) { unmatched.add(teamName); return; }
    if (!result) return;
    (form[code] ??= []).push(result);
  };

  for (const f of played) {
    const home = f.teams?.home;
    const away = f.teams?.away;
    const gh = f.goals?.home;
    const ga = f.goals?.away;
    add(home?.name, resultFor(gh, ga, home?.winner));
    add(away?.name, resultFor(ga, gh, away?.winner));
  }

  for (const code of Object.keys(form)) form[code] = form[code].slice(-FORM_LENGTH);
  return { form, unmatched: [...unmatched].sort() };
}

// API-Football geeft fouten terug als HTTP 200 met een gevuld "errors"-veld (object of array), bv.
// { token: 'Error/Missing application key' } of { requests: 'You have reached the request limit...' }.
function apiErrorMessage(body) {
  const errors = body?.errors;
  if (!errors) return null;
  const messages = Array.isArray(errors) ? errors : Object.values(errors);
  return messages.length > 0 ? messages.map(String).join('; ') : null;
}

export default async function handler(req, res) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    res.setHeader('Cache-Control', CACHE_ERROR);
    return res.status(500).json({ error: 'API_FOOTBALL_KEY ontbreekt in de Vercel-omgevingsvariabelen.' });
  }

  const season = Number(process.env.API_FOOTBALL_SEASON) || currentSeason();
  const url = `${API_URL}?league=${JUPILER_PRO_LEAGUE}&season=${season}&status=${FINISHED_STATUSES.join('-')}`;

  try {
    const response = await fetch(url, { headers: { 'x-apisports-key': key } });
    if (!response.ok) {
      res.setHeader('Cache-Control', CACHE_ERROR);
      return res.status(502).json({ error: `API-Football antwoordde met HTTP ${response.status}.` });
    }
    const body = await response.json();
    const apiError = apiErrorMessage(body);
    if (apiError) {
      res.setHeader('Cache-Control', CACHE_ERROR);
      return res.status(502).json({ error: `API-Football: ${apiError}` });
    }

    const { form, unmatched } = computeForm(Array.isArray(body?.response) ? body.response : []);
    res.setHeader('Cache-Control', CACHE_OK);
    return res.status(200).json({ form, unmatched, season, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.setHeader('Cache-Control', CACHE_ERROR);
    return res.status(502).json({ error: `API-Football onbereikbaar: ${err?.message ?? err}` });
  }
}
