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
//     staat er iets in, dan moet CLUB_KEYWORDS in api/_lib/apifootball.js aangevuld worden.
// Fout (geen sleutel, quotum op, API onbereikbaar) -> HTTP 5xx met { error }. De site toont dan gewoon
// geen vormbalk, nooit een verouderde of geraden uitslag.

import {
  ApiFootballError, FINISHED_STATUSES, apiSeason, clubCodeFromApiName, fetchFinishedFixtures,
} from './_lib/apifootball.js';

// Bestaande namen blijven werken voor wie ze hier importeerde.
export { clubCodeFromApiName, currentSeason } from './_lib/apifootball.js';

const FORM_LENGTH = 5;

// Succes: 30 minuten vers op de CDN, daarna nog een dag "stale" serveren terwijl op de achtergrond
// ververst wordt. Een uitslag van zaterdagavond staat er dus ten laatste een half uur later op.
const CACHE_OK = 'public, s-maxage=1800, stale-while-revalidate=86400';
// Fout: kort cachen, zodat een kapotte sleutel of een vol quotum de API niet bij elk bezoek opnieuw raakt.
const CACHE_ERROR = 'public, s-maxage=60';

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

export default async function handler(req, res) {
  const season = apiSeason();
  try {
    const fixtures = await fetchFinishedFixtures(season);
    const { form, unmatched } = computeForm(fixtures);
    res.setHeader('Cache-Control', CACHE_OK);
    return res.status(200).json({ form, unmatched, season, updatedAt: new Date().toISOString() });
  } catch (err) {
    res.setHeader('Cache-Control', CACHE_ERROR);
    const status = err instanceof ApiFootballError && /ontbreekt/.test(err.message) ? 500 : 502;
    return res.status(status).json({ error: String(err?.message ?? err) });
  }
}
