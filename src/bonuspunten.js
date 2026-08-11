// Parsing + rangschikkingslogica voor de "Bonuspunten"-tab (zie src/tabs/BonuspuntenTab.jsx). Losse
// module, niet in constants.js: functionaliteit specifiek voor deze ene tab, geen gedeelde app-brede data
// (zelfde opzet als predicted-xi/formations.js e.a.).
import { parseCsvRows, TEAMS } from './constants';

// Herleidt de vrije clubtekst uit de sheet ("Club Brugge", "Union", "STVV", "La Louvière", ...) naar de
// bestaande TEAMS-clubcode, ongeacht hoofdletters/accenten — zodat het "Team"-veld gewoon een leesbare
// clubnaam kan zijn i.p.v. de interne 3-letter-code, en toch het juiste logo oplevert.
const CLUB_ALIASES = {
  'club brugge': 'CLU',
  anderlecht: 'AND',
  antwerp: 'ANT',
  beveren: 'BEV', 'sk beveren': 'BEV',
  'cercle brugge': 'CER',
  charleroi: 'CHA',
  genk: 'GNK',
  gent: 'GNT',
  kortrijk: 'KOR', 'kv kortrijk': 'KOR',
  mechelen: 'KVM', 'kv mechelen': 'KVM',
  'la louviere': 'LLV', 'raal la louviere': 'LLV',
  lommel: 'LOM', 'lommel sk': 'LOM',
  leuven: 'OHL', 'oh leuven': 'OHL',
  standard: 'STA',
  'sint-truiden': 'STV', stvv: 'STV',
  union: 'USG', 'union sg': 'USG', 'union saint-gilloise': 'USG',
  westerlo: 'WES',
  'zulte waregem': 'ZWA',
};

function normalizeClubText(text) {
  return (text ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // accenten weg ("è" -> "e") voor robuuste match
}

function resolveClubCode(rawClubText) {
  const trimmed = (rawClubText ?? '').trim();
  // Eerst de rauwe 3-letter clubcode zelf proberen (bv. "KOR", "AND", "GNT") — dat is exact de conventie
  // die de bestaande spelersdatabank-sheet al gebruikt in zijn "Team"-kolom (zie parsePlayerDatabaseCsv
  // in constants.js: teamCode = row[teamCol].trim().toUpperCase()), dus zeer waarschijnlijk ook hier
  // gebruikt. Pas daarna de leesbare-naam-varianten (alias-tabel, volledige TEAMS-naam) proberen.
  const byCode = TEAMS.find(t => t.code === trimmed.toUpperCase());
  if (byCode) return byCode.code;
  const normalized = normalizeClubText(trimmed);
  if (CLUB_ALIASES[normalized]) return CLUB_ALIASES[normalized];
  const byFullName = TEAMS.find(t => normalizeClubText(t.name) === normalized);
  return byFullName?.code ?? null;
}

// Haalt uit een statistiekcel een veilig geheel getal — een lege, tekstuele of anderszins onbruikbare
// waarde wordt 0 i.p.v. NaN/undefined. Dat is bewust de "veilige standaard" voor deze pagina: een
// ontbrekende celwaarde telt gewoon niet mee in de rangschikking/berekening i.p.v. de hele rij te breken
// of "NaN" te tonen.
function parseStatNumber(raw) {
  const cleaned = (raw ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned) return 0;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? Math.round(value) : 0;
}

// Zet de ruwe CSV-tekst van de Bonuspunten-sheet om naar genormaliseerde spelersrijen. Kolommen worden
// op (een deel van) hun headertekst opgezocht, met een index-fallback voor het geval een header ontbreekt
// — zelfde stijl als parsePlayerDatabaseCsv/parseSetPiecesCsv. Rijen zonder spelersnaam (lege rijen, of
// de header-rij zelf) worden genegeerd.
export function parseBonuspuntenCsv(text) {
  const rows = parseCsvRows(text).filter(row => row.some(cell => (cell ?? '').trim() !== ''));
  if (rows.length === 0) return [];
  const [headerRow, ...dataRows] = rows;
  const trimmedHeaders = headerRow.map(h => (h ?? '').trim().toLowerCase());
  const columnIndex = (matchers, fallbackIndex) => {
    const found = trimmedHeaders.findIndex(h => matchers.some(m => h.includes(m)));
    return found === -1 ? fallbackIndex : found;
  };
  const playerCol = columnIndex(['player'], 0);
  const teamCol = columnIndex(['team'], 1);
  const wonCol = columnIndex(['gewonnen'], 2);
  const lostCol = columnIndex(['verloren'], 3);
  const headersCol = columnIndex(['kopbal'], 4);
  const recoveriesCol = columnIndex(['recover'], 5);
  const bigChancesCol = columnIndex(['grote kans'], 6);
  const bonusCol = columnIndex(['bonuspunt'], 7);

  return dataRows
    .map(row => {
      const player = (row[playerCol] ?? '').trim();
      const rawTeam = (row[teamCol] ?? '').trim();
      const clubCode = resolveClubCode(rawTeam);
      const team = TEAMS.find(t => t.code === clubCode);
      const duelsWon = parseStatNumber(row[wonCol]);
      const duelsLost = parseStatNumber(row[lostCol]);
      return {
        player,
        clubCode,
        clubName: team?.name ?? rawTeam,
        duelsWon,
        duelsLost,
        duelDiff: duelsWon - duelsLost,
        defensiveHeaders: parseStatNumber(row[headersCol]),
        recoveries: parseStatNumber(row[recoveriesCol]),
        bigChances: parseStatNumber(row[bigChancesCol]),
        bonusPoints: parseStatNumber(row[bonusCol]),
      };
    })
    .filter(p => p.player);
}

const TOP_N = 15;
const byName = (a, b) => a.player.localeCompare(b.player);

// Deterministische Top-15-rangschikkingen — elke sort-functie eindigt altijd op spelersnaam als laatste
// tiebreaker, zodat de volgorde nooit afhangt van de (willekeurige) rijvolgorde in de sheet.
export function rankByDuels(entries) {
  return [...entries]
    .sort((a, b) => b.duelDiff - a.duelDiff || b.duelsWon - a.duelsWon || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByDefensiveHeaders(entries) {
  return [...entries]
    .sort((a, b) => b.defensiveHeaders - a.defensiveHeaders || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByRecoveries(entries) {
  return [...entries]
    .sort((a, b) => b.recoveries - a.recoveries || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByBigChances(entries) {
  return [...entries]
    .sort((a, b) => b.bigChances - a.bigChances || byName(a, b))
    .slice(0, TOP_N);
}

export function rankByBonusPoints(entries) {
  return [...entries]
    .sort((a, b) => b.bonusPoints - a.bonusPoints || byName(a, b))
    .slice(0, TOP_N);
}

// De 4 statistische bonuspunt-criteria (zie ook de sectietitels in BonuspuntenTab.jsx) — apart
// geëxporteerd zodat de rij-highlight in de UI en de tekst in de titel altijd exact dezelfde grens
// gebruiken.
export const BONUS_CRITERIA = {
  duels: entry => entry.duelDiff > 0,
  defensiveHeaders: entry => entry.defensiveHeaders > 3,
  recoveries: entry => entry.recoveries > 5,
  bigChances: entry => entry.bigChances > 1,
};
