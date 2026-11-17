// Serverfunctie voor spec F1: schoten, schoten op doel en key passes per speler per speeldag, uit
// API-Football (de Fantasy Pro League-data heeft enkel "grote kansen gecreëerd", een strengere maatstaf).
// De Spelers-tab voegt dit toe aan /api/players (zie src/data/playersApi.js); werkt deze functie niet,
// dan verdwijnen de drie kolommen gewoon en blijft de rest werken.
//
// Response:
//   { season, gw, updatedAt, players: { <fplId>: { sh: [...], sot: [...], kp: [...] } }, unmatched: [...] }
//   - arrays met één waarde per speeldag (index 0 = GW1). Een speler die in een selectie stond maar niet
//     speelde, heeft 0; een speler die nooit in een API-Football-selectie stond, staat er niet in (de site
//     toont dan "—").
//   - unmatched: spelers met minuten die niet aan een Fantasy Pro League-speler te koppelen waren
//     ({ name, club }), zodat de eigenaar ze kan nakijken. Hoort (bijna) leeg te zijn.
//
// Verzoeken naar API-Football: 1 voor de lijst van gespeelde wedstrijden + 1 per 20 nieuwe wedstrijden
// (een gespeelde wedstrijd blijft in het geheugen van de functie). Het antwoord staat 6 uur vers op
// Vercels CDN en mag daarna nog 2 dagen "stale" geserveerd worden terwijl op de achtergrond ververst
// wordt. Zie de PR voor de rekensom per dag.
import {
  apiSeason, buildPlayerMatcher, buildWeekResolver, clubCodeFromApiName, fetchFinishedFixtures,
  fetchFixtureDetails, sendJson,
} from './_lib/apifootball.js';
import { fetchClubs, fetchJson, fetchMatches, list, num, siteClubCode } from './_lib/proleague.js';

const CACHE_OK = 'public, s-maxage=21600, stale-while-revalidate=172800';
const CACHE_ERROR = 'public, s-maxage=300';

const nn = (v) => (Number.isFinite(Number(v)) && v !== null ? Number(v) : 0);

// Pure berekening (testbaar): wedstrijddetails van API-Football -> reeksen per Fantasy Pro League-speler.
// matchPlayer(apiName, club) -> fplId | null; weekOf(home, away, date) -> weekId | null.
export function buildShots(details, { matchPlayer, weekOf }) {
  const players = {};
  const unmatched = new Map();
  let maxWeek = 0;
  for (const d of details) {
    const home = clubCodeFromApiName(d?.teams?.home?.name);
    const away = clubCodeFromApiName(d?.teams?.away?.name);
    const week = home && away ? weekOf(home, away, d?.fixture?.date) : null;
    if (!week) continue;
    maxWeek = Math.max(maxWeek, week);
    for (const team of d?.players ?? []) {
      const club = clubCodeFromApiName(team?.team?.name);
      if (!club) continue;
      for (const entry of team?.players ?? []) {
        const name = entry?.player?.name;
        const s = entry?.statistics?.[0] ?? {};
        const minutes = nn(s?.games?.minutes);
        const id = matchPlayer(name, club);
        if (!id) {
          if (minutes > 0) unmatched.set(`${name}|${club}`, { name, club });
          continue;
        }
        const p = (players[id] ??= { sh: [], sot: [], kp: [] });
        const idx = week - 1;
        const add = (arr, value) => { arr[idx] = (arr[idx] ?? 0) + value; };
        add(p.sh, minutes > 0 ? nn(s?.shots?.total) : 0);
        add(p.sot, minutes > 0 ? nn(s?.shots?.on) : 0);
        add(p.kp, minutes > 0 ? nn(s?.passes?.key) : 0);
      }
    }
  }
  // Gaten (speeldagen zonder wedstrijd van die speler) worden 0, zodat elke reeks even lang is.
  for (const p of Object.values(players)) {
    for (const k of ['sh', 'sot', 'kp']) p[k] = Array.from({ length: maxWeek }, (_, i) => p[k][i] ?? 0);
  }
  return { gw: maxWeek, players, unmatched: [...unmatched.values()].sort((a, b) => a.club.localeCompare(b.club) || a.name.localeCompare(b.name)) };
}

export default async function handler(req, res) {
  try {
    const season = apiSeason();
    const [fixtures, playersBody, clubs, matches] = await Promise.all([
      fetchFinishedFixtures(season),
      fetchJson('players'),
      fetchClubs(),
      fetchMatches(),
    ]);
    const details = await fetchFixtureDetails(fixtures.map(f => f?.fixture?.id).filter(id => id != null));

    const fplPlayers = list(playersBody?.players).map(p => ({
      id: p.id, name: p.name, short: p.short, club: clubs.get(p.clubId)?.code ?? null,
    }));
    const fplMatches = matches.map(m => ({
      weekId: num(m?.weekId),
      home: siteClubCode(m?.homeId?.short),
      away: siteClubCode(m?.awayId?.short),
      date: m?.date,
    }));
    const result = buildShots(details, { matchPlayer: buildPlayerMatcher(fplPlayers), weekOf: buildWeekResolver(fplMatches) });
    return sendJson(res, 200, { season, updatedAt: new Date().toISOString(), ...result }, CACHE_OK);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
