// "Mijn team volgen" in het Klassement (spec E5). De bezoeker duidt met een ster één team aan als het
// zijne; we bewaren enkel het team-ID en de teamnaam (nooit de naam van de manager) in localStorage.
// Bij het openen van Klassement zoeken we dat team op naam op en kiezen we de rij met dat team-ID.
export const MY_RANK_TEAM_STORAGE_KEY = 'fpl_proleague_my_rank_team_v1';
const MAX_NAME = 40;

// Hoeveel pagina's we hoogstens doorzoeken voor een veelvoorkomende teamnaam (25 rijen per pagina).
export const MY_RANK_MAX_PAGES = 4;

function clean(value) {
  if (!value || typeof value !== 'object') return null;
  const teamId = Number(value.teamId);
  const naam = String(value.naam ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return Number.isInteger(teamId) && teamId > 0 && naam ? { teamId, naam } : null;
}

export function loadMyRankTeam(storage) {
  try {
    return clean(JSON.parse(storage?.getItem(MY_RANK_TEAM_STORAGE_KEY) ?? 'null'));
  } catch {
    return null;
  }
}

// team = { teamId, naam } om te volgen, of null om niet meer te volgen.
export function saveMyRankTeam(storage, team) {
  try {
    const value = clean(team);
    if (value) storage?.setItem(MY_RANK_TEAM_STORAGE_KEY, JSON.stringify(value));
    else storage?.removeItem(MY_RANK_TEAM_STORAGE_KEY);
  } catch {
    // Geen opslag (privévenster): het volgen werkt dan enkel tot je de pagina sluit.
  }
}

// Zoekt de rij met dit team-ID in de zoekresultaten. fetchPage(page) geeft het antwoord van
// /api/rankings ({ rows, total, pageSize }). Geeft de rij terug, of null als het team er niet bij zit.
export async function findTeamRow(fetchPage, teamId, maxPages = MY_RANK_MAX_PAGES) {
  for (let page = 1; page <= maxPages; page++) {
    const body = await fetchPage(page);
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    const row = rows.find(r => r.teamId === teamId);
    if (row) return row;
    const seen = (page - 1) * (body?.pageSize ?? rows.length) + rows.length;
    if (rows.length === 0 || seen >= (body?.total ?? 0)) return null;
  }
  return null;
}
