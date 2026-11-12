// Serverfunctie achter de Klassement-tab: zoeken op teamnaam in het algemene of speeldagklassement,
// en het klassement van een minileague. Bron: de publieke API van fantasy.proleague.be.
//
//   /api/rankings?type=general&name=<teamnaam>&page=1     -> algemeen klassement (telt pas vanaf GW8)
//   /api/rankings?type=week&weekId=11&name=<teamnaam>     -> klassement van één speeldag
//   /api/rankings?type=league&leagueId=120000[&weekId=11] -> minileague (totaal of één speeldag)
//
// Privacy: de bron stuurt bij elke rij ook de voor- en achternaam van de manager mee. Die gaan hier
// bewust NIET door naar de browser — we geven enkel rang, punten, team-ID en teamnaam terug.
//
// Response: { type, total, page, pageSize, league?: { id, name }, rows: [ { rank, teamId, team, points } ] }

import { fetchJson, list, num, sendJson } from './_lib/proleague.js';

const CACHE_OK = 'public, s-maxage=300, stale-while-revalidate=3600';
const CACHE_ERROR = 'public, s-maxage=30';
const PAGE_SIZE = 25;

function cleanName(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
}

function intParam(value, min, max) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

function parseTeamField(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw ?? '')) ?? {};
  } catch {
    return {};
  }
}

export function rankingRows(data) {
  return list(data).map(row => ({
    rank: num(row?.team?.rank) || null,
    teamId: num(row?.team?.id) || null,
    team: String(row?.team?.name ?? '').trim(),
    points: num(row?.team?.points),
  }));
}

// league-redis: teamId is een JSON-tekst met o.a. id, name, value en totalPoints (en de naam van de
// manager, die we laten vallen).
export function leagueRows(data) {
  return list(data).map(row => {
    const team = parseTeamField(row?.teamId);
    return {
      rank: num(row?.rank) || null,
      teamId: num(team.id) || null,
      team: String(team.name ?? row?.teamName ?? '').trim(),
      points: num(row?.points),
    };
  });
}

export default async function handler(req, res) {
  const q = req.query ?? {};
  const type = String(q.type ?? 'general');
  const page = intParam(q.page ?? 1, 1, 500);
  if (!page) return sendJson(res, 400, { error: 'ongeldige pagina' }, CACHE_ERROR);

  try {
    if (type === 'general' || type === 'week') {
      const weekId = type === 'week' ? intParam(q.weekId, 1, 40) : null;
      if (type === 'week' && !weekId) return sendJson(res, 400, { error: 'ongeldige speeldag' }, CACHE_ERROR);
      const name = cleanName(q.name);
      const body = await fetchJson(`rankings/${type}`, {
        pageRecords: PAGE_SIZE, pageNumber: page, ...(name ? { name } : {}), ...(weekId ? { weekId } : {}),
      });
      if (!Array.isArray(body?.data)) throw new Error(String(body?.message ?? 'onverwacht antwoord van de bron'));
      return sendJson(res, 200, {
        type, page, pageSize: PAGE_SIZE, total: num(body.totalRecords), rows: rankingRows(body.data),
      }, CACHE_OK);
    }

    if (type === 'league') {
      const leagueId = intParam(q.leagueId, 1, 99999999);
      if (!leagueId) return sendJson(res, 400, { error: 'ongeldig league-ID' }, CACHE_ERROR);
      const weekId = q.weekId ? intParam(q.weekId, 1, 40) : null;
      // De bron verwacht een kaal "_t" in de query (zo vraagt de officiële site het ook op).
      const params = { pageNumber: page, pageRecords: PAGE_SIZE, ...(weekId ? { weekId } : {}) };
      const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
      let body;
      try {
        body = await fetchJson(`league-redis/${leagueId}?_t&${query}`, {}, { withSeason: false, retries: 0 });
      } catch (err) {
        // Een onbestaand league-ID geeft bij de bron een HTTP 500; dat is voor de bezoeker gewoon
        // "niet gevonden", geen storing.
        return sendJson(res, 404, { error: 'league niet gevonden', detail: String(err?.message ?? err) }, CACHE_ERROR);
      }
      if (!body?.league) return sendJson(res, 404, { error: 'league niet gevonden' }, CACHE_ERROR);
      return sendJson(res, 200, {
        type, page, pageSize: PAGE_SIZE,
        total: num(body?.result?.totalRecords),
        league: { id: num(body.league.id), name: String(body.league.name ?? '').trim(), seasonId: num(body.league.seasonId) },
        rows: leagueRows(body?.result?.data),
      }, CACHE_OK);
    }

    return sendJson(res, 400, { error: 'onbekend type' }, CACHE_ERROR);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
