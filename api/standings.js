// Serverfunctie voor spec F4: de plaats van elke club in het klassement van de echte competitie, uit
// API-Football (standings). De clubkaart toont ze naast de vorm; werkt dit niet, dan blijft die regel weg.
//
// Response: { season, updatedAt, playoffs, clubs: { <clubcode>: { rank, points, played, group } }, unmatched: [...] }
//   playoffs = true als er meer dan één groep is (dan toont de clubkaart de naam van de groep).
// Tijdens de play-offs staat een club in meer dan één groep (reguliere competitie + play-off); dan telt
// de groep die het laatst bijgewerkt werd, met de naam van die groep erbij.
//
// Verzoeken naar API-Football: 1 per vernieuwing. Het antwoord staat 6 uur vers op Vercels CDN en mag
// daarna nog 2 dagen "stale" geserveerd worden: hoogstens ±4 verzoeken per dag.
import { JUPILER_PRO_LEAGUE, apiFootball, apiSeason, clubCodeFromApiName, sendJson } from './_lib/apifootball.js';

const CACHE_OK = 'public, s-maxage=21600, stale-while-revalidate=172800';
const CACHE_ERROR = 'public, s-maxage=300';

// Pure berekening (testbaar): antwoord van API-Football -> plaats per clubcode.
export function buildStandings(response) {
  const clubs = {};
  const updated = {};
  const unmatched = new Set();
  const groups = response?.[0]?.league?.standings ?? [];
  for (const group of groups) {
    for (const row of Array.isArray(group) ? group : []) {
      const code = clubCodeFromApiName(row?.team?.name);
      if (!code) { if (row?.team?.name) unmatched.add(row.team.name); continue; }
      const at = Date.parse(row?.update) || 0;
      if (clubs[code] && at <= updated[code]) continue;
      updated[code] = at;
      clubs[code] = { rank: row.rank, points: row.points, played: row?.all?.played ?? null, group: row.group ?? null };
    }
  }
  return { playoffs: groups.length > 1, clubs, unmatched: [...unmatched].sort() };
}

export default async function handler(req, res) {
  try {
    const season = apiSeason();
    const response = await apiFootball('standings', { league: JUPILER_PRO_LEAGUE, season });
    const result = buildStandings(response);
    if (Object.keys(result.clubs).length === 0) throw new Error('geen klassement gevonden');
    return sendJson(res, 200, { season, updatedAt: new Date().toISOString(), ...result }, CACHE_OK);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
