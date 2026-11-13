// Serverfunctie achter de spelers-popup op de Spelers-tab: /api/player/107.
//
// Haalt bij de publieke Fantasy Pro League-API de wedstrijd-per-wedstrijd-gegevens van één speler op
// (player/{id}?withStats=1&withAggregatedWeekStats=1) en zet ze om naar iets wat de popup meteen kan
// tonen. Het veld stats[].stat.value is in de bron een JSON-tekst; die wordt hier geparset.
//
// Response:
//   score = uitslag met de goals van de eigen ploeg eerst ("1-2" = verloren).
//   { id, season, matches: [ { gw, date, opp, home, score, result, min, goals: [minuten],
//       assists: [minuten], yc, rc, og, ps, pm, saves, bonus, bonusParts, pts } ],
//     seasons: [ { season: '2025-26', club, pts, mp, min, g, a, cs } ] }

import {
  SEASON_ID, bonusForMatch, positionIdFrom, fetchClubs, fetchJson, fetchMatches, list, num, seasonLabel, sendJson,
} from '../_lib/proleague.js';

const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_ERROR = 'public, s-maxage=60';

function parseValue(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(String(raw ?? ''));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Minuten van goals/assists komen als array van getallen; alles wat geen getal is, valt weg.
const minutes = value => list(value).map(Number).filter(Number.isFinite);

// positionId: de wedstrijddata zelf vermeldt de positie niet, dus de site geeft ze mee als ?pos=
// (nodig voor de bonusregel van keepers, zie bonusForMatch in _lib/proleague.js).
export function buildMatches(stats, clubs, matchesById, positionId = null) {
  return list(stats)
    .map(entry => {
      const match = entry?.match ?? {};
      const stat = entry?.stat ?? {};
      const v = parseValue(stat.value);
      const clubId = num(v.club_id);
      const home = clubId ? num(match.homeId) === clubId : null;
      const oppId = home === false ? match.homeId : match.awayId;
      const full = matchesById.get(match.id);
      // Uitslag vanuit het standpunt van de speler: eigen goals eerst ("1-2" = verloren met 1-2).
      const score = full && full.final != null
        ? (home === false ? `${num(full.awayScore)}-${num(full.homeScore)}` : `${num(full.homeScore)}-${num(full.awayScore)}`)
        : null;
      const bonus = bonusForMatch(v, positionId);
      return {
        gw: num(stat.weekId),
        date: match.date ?? null,
        opp: clubs.get(oppId)?.code ?? null,
        home,
        score,
        result: ['W', 'D', 'L'].includes(v.result) ? v.result : null,
        min: num(v.time),
        goals: minutes(v.goals),
        assists: minutes(v.assists),
        yc: list(v.yellow_cards).length,
        rc: list(v.red_card).length,
        og: list(v.own_goals).length,
        ps: list(v.penalty_saved).length,
        pm: list(v.penalty_miss).length,
        saves: num(v.saves),
        bonus: bonus.total,
        bonusParts: { duels: bonus.duels, headers: bonus.headers, recoveries: bonus.recoveries, bigChances: bonus.bigChances },
        pts: num(stat.points),
      };
    })
    .sort((a, b) => a.gw - b.gw || String(a.date).localeCompare(String(b.date)));
}

export function buildSeasons(aggregated, clubs) {
  return list(aggregated)
    .filter(s => num(s?.seasonId) && num(s.seasonId) < SEASON_ID)
    .map(s => ({
      season: seasonLabel(num(s.seasonId)),
      seasonId: num(s.seasonId),
      club: clubs.get(s.clubId)?.code ?? String(s.clubShort ?? ''),
      pts: num(s.total),
      mp: num(s.statMatchPlayed),
      min: num(s.statTimePlayed),
      g: num(s.statGoals),
      a: num(s.statAssists),
      cs: num(s.statCleanSheet),
    }))
    .sort((a, b) => b.seasonId - a.seasonId);
}

export default async function handler(req, res) {
  const id = String(req.query?.id ?? '');
  if (!/^\d{1,8}$/.test(id)) return sendJson(res, 400, { error: 'ongeldig speler-ID' }, CACHE_ERROR);

  try {
    const [player, clubs, matches] = await Promise.all([
      fetchJson(`player/${id}`, { withStats: 1, withAggregatedWeekStats: 1 }),
      fetchClubs(),
      fetchMatches().catch(() => []),
    ]);
    const matchesById = new Map(matches.map(m => [m?.id, m]));
    return sendJson(res, 200, {
      id: Number(id),
      season: seasonLabel(SEASON_ID),
      matches: buildMatches(player?.stats, clubs, matchesById, positionIdFrom(req.query?.pos)),
      seasons: buildSeasons(player?.aggregatedWeekStats, clubs),
    }, CACHE_OK);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
