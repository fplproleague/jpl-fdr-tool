// Serverfunctie voor spec F2: expected goals (xG) voor en tegen per club, per gespeelde
// competitiewedstrijd, uit API-Football. De clubkaart toont hiermee "xG voor / tegen, laatste 5" en per
// wedstrijd een rijtje (tegenstander · uitslag · xG–xGA), zodat je ziet of een ploeg geluk of pech had.
// Werkt deze functie niet, dan laat de clubkaart dat blok gewoon weg.
//
// Response:
//   { season, updatedAt, clubs: { <clubcode>: [{ date, opp, home, gf, ga, xg, xga }, ...] }, unmatched: [...] }
//   - per club alle gespeelde wedstrijden, oudste eerst. xg/xga is null als API-Football voor die
//     wedstrijd (nog) geen xG heeft.
//   - unmatched: teamnamen die niet aan een clubcode te koppelen waren (hoort leeg te zijn).
//
// Verzoeken naar API-Football: 1 voor de lijst van gespeelde wedstrijden + 1 per 20 nieuwe wedstrijden
// (een gespeelde wedstrijd blijft in het geheugen van de functie, zie fetchFixtureDetails). Het antwoord
// staat 6 uur vers op Vercels CDN en mag daarna nog 2 dagen "stale" geserveerd worden terwijl op de
// achtergrond ververst wordt.
import { apiSeason, clubCodeFromApiName, fetchFinishedFixtures, fetchFixtureDetails, sendJson } from './_lib/apifootball.js';

const CACHE_OK = 'public, s-maxage=21600, stale-while-revalidate=172800';
const CACHE_ERROR = 'public, s-maxage=300';

const toNumber = (v) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// expected_goals van één ploeg in één wedstrijd (API-Football geeft het als tekst, bv. "1.24").
function xgOf(detail, teamId) {
  const entry = (detail?.statistics ?? []).find(s => s?.team?.id === teamId);
  const stat = (entry?.statistics ?? []).find(s => s?.type === 'expected_goals');
  return toNumber(stat?.value);
}

// Pure berekening (testbaar): wedstrijddetails van API-Football -> xG per club, oudste wedstrijd eerst.
export function buildTeamXg(details) {
  const clubs = {};
  const unmatched = new Set();
  const sorted = [...details].sort((a, b) => (a?.fixture?.timestamp ?? 0) - (b?.fixture?.timestamp ?? 0));
  for (const d of sorted) {
    const homeTeam = d?.teams?.home;
    const awayTeam = d?.teams?.away;
    const home = clubCodeFromApiName(homeTeam?.name);
    const away = clubCodeFromApiName(awayTeam?.name);
    if (!home) unmatched.add(homeTeam?.name);
    if (!away) unmatched.add(awayTeam?.name);
    if (!home || !away) continue;
    const gh = toNumber(d?.goals?.home);
    const ga = toNumber(d?.goals?.away);
    const xh = xgOf(d, homeTeam?.id);
    const xa = xgOf(d, awayTeam?.id);
    const date = d?.fixture?.date ?? null;
    (clubs[home] ??= []).push({ date, opp: away, home: true, gf: gh, ga, xg: xh, xga: xa });
    (clubs[away] ??= []).push({ date, opp: home, home: false, gf: ga, ga: gh, xg: xa, xga: xh });
  }
  return { clubs, unmatched: [...unmatched].filter(Boolean).sort() };
}

export default async function handler(req, res) {
  try {
    const season = apiSeason();
    const fixtures = await fetchFinishedFixtures(season);
    const details = await fetchFixtureDetails(fixtures.map(f => f?.fixture?.id).filter(id => id != null));
    return sendJson(res, 200, { season, updatedAt: new Date().toISOString(), ...buildTeamXg(details) }, CACHE_OK);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
