// Serverfunctie voor spec F4: de aftraptijden van alle competitiewedstrijden, voor de wedstrijdstrip van
// de Verwachte XI's en de tooltip van een FDR-cel.
//
// Bron: de kalender van Fantasy Pro League zelf (gratis, geen sleutel), niet API-Football. Getest op
// 16 november 2026: voor elke wedstrijd met een vastgelegd uur geven beide bronnen exact hetzelfde
// tijdstip, maar voor wedstrijden waarvan het uur nog niet vastligt, vult API-Football een nep-uur in
// (16:00 UTC) terwijl Fantasy Pro League eerlijk middernacht UTC zet. Dat laatste herkennen we en tonen we
// niet. Bijkomend: dit kost geen API-Football-verzoeken en blijft werken als dat abonnement afloopt.
//
// Response: { updatedAt, matches: [[gw, home, away, kickoff], ...] }
//   kickoff = ISO-tijd, of null als het uur nog niet vastligt.
import { fetchMatches, num, sendJson, siteClubCode } from './_lib/proleague.js';

const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_ERROR = 'public, s-maxage=120';

// Middernacht UTC (01:00 of 02:00 in België) = "uur nog niet bekend" in de kalender van Fantasy Pro League.
export function knownKickoff(date) {
  const time = Date.parse(date);
  if (!Number.isFinite(time)) return null;
  const d = new Date(time);
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return null;
  return d.toISOString();
}

export function buildKickoffs(fplMatches) {
  return fplMatches
    .map(m => [num(m?.weekId), siteClubCode(m?.homeId?.short), siteClubCode(m?.awayId?.short), knownKickoff(m?.date)])
    .filter(([gw, home, away]) => gw > 0 && home && away);
}

export default async function handler(req, res) {
  try {
    const matches = buildKickoffs(await fetchMatches());
    if (matches.length === 0) throw new Error('geen wedstrijden in de kalender');
    return sendJson(res, 200, { updatedAt: new Date().toISOString(), matches }, CACHE_OK);
  } catch (err) {
    return sendJson(res, 502, { error: String(err?.message ?? err) }, CACHE_ERROR);
  }
}
