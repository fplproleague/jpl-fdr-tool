// De spelersdatabank van de site (spec B1): één lijst met naam, club, positie, prijs en statistieken die
// Team Planner, de spelerskiezer, Bonuspunten, Kaarten, de watchlist en de spelerslinks gebruiken.
//
// Bron: /api/players (de officiële Fantasy Pro League-data, via src/data/playersApi.js). Lukt dat niet,
// dan laadt FDRTool.jsx de Google Sheet zoals vroeger (parsePlayerDatabaseCsv in constants.js). Beide
// leveren hetzelfde formaat, zodat de tabs niet hoeven te weten waar de data vandaan komt.
//
// Vastgesteld in november 2026: de 515 spelers in de sheet zijn exact de spelers van de API, met als
// naam het veld `short` ("Vanaken"). Daarom blijft `name` hier `short`: zo vindt de site de spelers
// terug die bezoekers al in hun team of watchlist bewaarden (die staan op naam + club).
import { TEAMS } from '../constants';
import { suspensionFromWeekly } from '../kaarten';
import { normalizePlayerName } from './usePlayerIndex';

// Zet het antwoord van /api/players om naar rijen in het formaat van parsePlayerDatabaseCsv, plus wat
// enkel de API weet: id, de volledige naam, rode kaarten en een eventuele schorsing (spec B2).
export function playerDatabaseFromApi(body) {
  const lastGw = Number.isInteger(body?.gw) ? body.gw : null;
  return (Array.isArray(body?.players) ? body.players : [])
    .filter(p => p && (p.short || p.name) && p.club)
    .map(p => {
      const teamCode = String(p.club).toUpperCase();
      const position = String(p.pos ?? '').toUpperCase();
      return {
        id: p.id ?? null,
        name: String(p.short || p.name).trim(),
        fullName: String(p.name || p.short).trim(),
        teamCode,
        teamName: TEAMS.find(t => t.code === teamCode)?.name ?? teamCode,
        position,
        price: Number.isFinite(p.price) ? p.price : null,
        yellowCards: p.yc ?? 0,
        redCards: p.rc ?? 0,
        duelsWon: p.dw ?? 0,
        duelsLost: p.dl ?? 0,
        headers: p.hc ?? 0,
        // Een keeper kan geen bonuspunt halen met recoveries (zie bonusForMatch in api/_lib/proleague.js).
        // De sheet zette ze daarom op 0, zodat keepers niet in die rangschikking van Bonuspunten staan.
        recoveries: position === 'GK' ? 0 : (p.br ?? 0),
        bigChances: p.bc ?? 0,
        bonusPoints: p.bp ?? 0,
        games: p.mp ?? 0,
        suspension: lastGw ? suspensionFromWeekly(p.w, lastGw) : null,
      };
    });
}

// Zoekt een bewaarde speler (naam + club) terug in de databank: eerst exact, dan op de korte naam,
// dan op de volledige naam, telkens zonder accenten en hoofdletters (spec B1). Geen gokwerk op
// gelijkaardige namen meer: een speler die niet gevonden wordt, blijft gewoon staan met zijn bewaarde
// gegevens en een label "niet gevonden" (nooit stil wissen).
const indexCache = new WeakMap();

function indexFor(db) {
  let index = indexCache.get(db);
  if (index) return index;
  const exact = new Map();
  const loose = new Map();
  for (const p of db) {
    const club = p.teamCode;
    if (!exact.has(`${p.name}|${club}`)) exact.set(`${p.name}|${club}`, p);
    for (const n of [p.name, p.fullName]) {
      const key = `${normalizePlayerName(n)}|${club}`;
      if (n && !loose.has(key)) loose.set(key, p);
    }
  }
  index = { exact, loose };
  indexCache.set(db, index);
  return index;
}

export function findInDatabase(db, name, teamCode) {
  if (!Array.isArray(db) || db.length === 0 || !name || !teamCode) return null;
  const club = String(teamCode).toUpperCase();
  const { exact, loose } = indexFor(db);
  return exact.get(`${name}|${club}`) ?? loose.get(`${normalizePlayerName(name)}|${club}`) ?? null;
}
