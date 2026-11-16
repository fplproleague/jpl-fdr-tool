// Serverfunctie voor spec F3: de officiële opstellingen (basis en bank) van één speeldag, uit
// API-Football, gekoppeld aan de spelers van Fantasy Pro League. De Verwachte XI's en de Team Planner
// tonen daarmee op de wedstrijddag wie echt start. Werkt deze functie niet, dan verschijnt er gewoon
// niets extra.
//
// GET /api/lineups?gw=12
// Response:
//   { gw, window: { start, end }, live, updatedAt,
//     matches: [{ home, away, kickoff, lineups: null | { <clubcode>: { formation, starters, bench, unmatched } } }] }
//   - starters/bench: korte namen van Fantasy Pro League ("Vanaken"), zoals in de Verwachte XI's.
//   - unmatched: namen uit API-Football die niet te koppelen waren (de site toont ze dan gewoon niet).
//   - window: van 90 minuten vóór de eerste aftrap tot 150 minuten na de laatste. live = nu in dat venster.
//
// Verzoeken naar API-Football (zie de PR voor de rekensom):
//   - vóór het venster: geen enkel (de aftraptijden komen uit de gratis Fantasy Pro League-kalender);
//   - in het venster: de lijst van wedstrijden van die dagen (1 verzoek, 6 uur bewaard) en enkel voor
//     wedstrijden die binnen 90 minuten beginnen en nog geen opstelling hebben 1 verzoek (tot 20
//     wedstrijden samen). Een gevonden opstelling blijft in het geheugen van de functie;
//   - het antwoord staat 2 minuten op Vercels CDN in het venster, daarna 6 uur.
import { JUPILER_PRO_LEAGUE, apiFootball, apiSeason, buildPlayerMatcher, clubCodeFromApiName, sendJson } from './_lib/apifootball.js';
import { fetchClubs, fetchJson, fetchMatches, list, num, siteClubCode } from './_lib/proleague.js';

const MINUTE = 60 * 1000;
export const BEFORE_FIRST_KICKOFF = 90 * MINUTE;
export const AFTER_LAST_KICKOFF = 150 * MINUTE;
const FIXTURE_LIST_TTL = 6 * 60 * MINUTE;

const CACHE_LIVE = 'public, s-maxage=120, stale-while-revalidate=60';
const CACHE_DONE = 'public, s-maxage=21600, stale-while-revalidate=86400';
const CACHE_ERROR = 'public, s-maxage=120';

// De wedstrijden van één speeldag uit de Fantasy Pro League-kalender, met het venster waarin de
// officiële opstellingen verschijnen. Pure functie (testbaar).
export function gwSchedule(fplMatches, gw) {
  const matches = fplMatches
    .filter(m => num(m?.weekId) === gw)
    .map(m => ({ home: siteClubCode(m?.homeId?.short), away: siteClubCode(m?.awayId?.short), kickoff: m?.date ?? null }))
    .filter(m => m.home && m.away && Date.parse(m.kickoff))
    .sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  if (matches.length === 0) return { matches, window: null };
  const first = Date.parse(matches[0].kickoff);
  const last = Date.parse(matches[matches.length - 1].kickoff);
  return {
    matches,
    window: { start: new Date(first - BEFORE_FIRST_KICKOFF).toISOString(), end: new Date(last + AFTER_LAST_KICKOFF).toISOString() },
  };
}

// Eén opstelling van API-Football ({ team, formation, startXI, substitutes }) -> korte namen van
// Fantasy Pro League. Pure functie (testbaar). matchPlayer(apiName, club) -> fplId | null.
export function convertLineup(apiLineup, club, matchPlayer, shortOf) {
  const unmatched = [];
  const names = (entries) => list(entries).map(e => {
    const apiName = e?.player?.name;
    const id = apiName ? matchPlayer(apiName, club) : null;
    if (id == null || !shortOf.has(id)) { if (apiName) unmatched.push(apiName); return null; }
    return shortOf.get(id);
  }).filter(Boolean);
  return {
    formation: apiLineup?.formation ?? null,
    starters: names(apiLineup?.startXI),
    bench: names(apiLineup?.substitutes),
    unmatched,
  };
}

// Is dit een volledige opstelling? (API-Football zet soms eerst een lege of halve lijst.)
const isComplete = (detail) => list(detail?.lineups).length >= 2
  && list(detail.lineups).every(l => list(l?.startXI).length === 11);

// Geheugen per serverinstantie: de wedstrijdlijst per speeldag en de gevonden opstellingen per wedstrijd.
const fixtureLists = new Map(); // gw -> { at, fixtures }
const lineupCache = new Map(); // API-wedstrijd-id -> detail met lineups

async function fixturesFor(gw, schedule) {
  const cached = fixtureLists.get(gw);
  if (cached && Date.now() - cached.at < FIXTURE_LIST_TTL) return cached.fixtures;
  const times = schedule.matches.map(m => Date.parse(m.kickoff));
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const fixtures = await apiFootball('fixtures', {
    league: JUPILER_PRO_LEAGUE, season: apiSeason(),
    from: day(Math.min(...times) - 24 * 60 * MINUTE), to: day(Math.max(...times) + 24 * 60 * MINUTE),
  });
  fixtureLists.set(gw, { at: Date.now(), fixtures });
  return fixtures;
}

export default async function handler(req, res) {
  const gw = Number(req?.query?.gw);
  if (!Number.isInteger(gw) || gw < 1 || gw > 60) return sendJson(res, 400, { error: 'gw ontbreekt of is ongeldig' }, CACHE_ERROR);
  try {
    const schedule = gwSchedule(await fetchMatches(), gw);
    const now = Date.now();
    const base = { gw, window: schedule.window, updatedAt: new Date(now).toISOString() };
    const empty = schedule.matches.map(m => ({ ...m, lineups: null }));
    if (!schedule.window) return sendJson(res, 200, { ...base, live: false, matches: empty }, CACHE_DONE);

    const start = Date.parse(schedule.window.start);
    const end = Date.parse(schedule.window.end);
    if (now < start) {
      // Nog niets te halen: bewaren tot het venster opengaat (minstens 1 minuut, hoogstens 1 uur).
      const seconds = Math.max(60, Math.min(3600, Math.floor((start - now) / 1000)));
      return sendJson(res, 200, { ...base, live: false, matches: empty }, `public, s-maxage=${seconds}`);
    }

    // API-Football-wedstrijden koppelen aan de kalender (zelfde thuis- en uitploeg).
    const fixtures = await fixturesFor(gw, schedule);
    const idOf = new Map();
    for (const f of fixtures) {
      const home = clubCodeFromApiName(f?.teams?.home?.name);
      const away = clubCodeFromApiName(f?.teams?.away?.name);
      if (home && away && f?.fixture?.id != null) idOf.set(`${home}-${away}`, f.fixture.id);
    }

    // Enkel opvragen wat binnen 90 minuten begint (of al bezig of gespeeld is) en nog geen opstelling
    // heeft in het geheugen van deze serverinstantie.
    const wanted = schedule.matches
      .map(m => ({ id: idOf.get(`${m.home}-${m.away}`), kickoff: Date.parse(m.kickoff) }))
      .filter(m => m.id != null && !lineupCache.has(m.id) && now >= m.kickoff - BEFORE_FIRST_KICKOFF)
      .map(m => m.id);
    for (let i = 0; i < wanted.length; i += 20) {
      const details = await apiFootball('fixtures', { ids: wanted.slice(i, i + 20).join('-') });
      for (const d of details) if (isComplete(d)) lineupCache.set(d.fixture.id, d);
    }

    const [playersBody, clubs] = await Promise.all([fetchJson('players'), fetchClubs()]);
    const fplPlayers = list(playersBody?.players).map(p => ({ id: p.id, name: p.name, short: p.short, club: clubs.get(p.clubId)?.code ?? null }));
    const shortOf = new Map(fplPlayers.map(p => [p.id, String(p.short || p.name || '').trim()]));
    const matchPlayer = buildPlayerMatcher(fplPlayers);

    const matches = schedule.matches.map(m => {
      const detail = lineupCache.get(idOf.get(`${m.home}-${m.away}`));
      if (!detail) return { ...m, lineups: null };
      const lineups = {};
      for (const l of detail.lineups) {
        const club = clubCodeFromApiName(l?.team?.name);
        if (club) lineups[club] = convertLineup(l, club, matchPlayer, shortOf);
      }
      return { ...m, lineups };
    });
    const live = now <= end;
    return sendJson(res, 200, { ...base, live, matches }, live ? CACHE_LIVE : CACHE_DONE);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
