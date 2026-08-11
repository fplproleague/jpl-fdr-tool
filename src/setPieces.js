// Parsing + club-naam-matching voor de "Set Pieces"-tab (zie src/tabs/SetPiecesTab.jsx). Losse module,
// niet in constants.js: dit is functionaliteit specifiek voor deze ene tab, geen gedeelde app-brede data
// (zelfde opzet als predicted-xi/formations.js e.a. — apart van constants.js, met enkel invoer vanuit
// constants.js waar nodig).
import { parseCsvRows, TEAMS } from './constants';

// Herleidt de vrije clubtekst uit de sheet ("Club Brugge", "Union", "STVV", "La Louvière", ...) naar de
// bestaande TEAMS-clubcode, ongeacht hoofdletters/accenten — de sheet gebruikt bewust volledige,
// leesbare clubnamen (zie de referentiegrafiek voor de "Set Piece Overzicht"-posts), niet de interne
// 3-letter-codes. Dekt zowel de kortere naam uit de grafiek (bv. "Mechelen") als een paar voor de hand
// liggende volledigere varianten (bv. "KV Mechelen") — de fallback hieronder vangt daarnaast ook de
// exacte TEAMS-naam zelf op, mocht de sheet die al gebruiken.
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

export function resolveClubCode(rawClubText) {
  const normalized = normalizeClubText(rawClubText);
  if (CLUB_ALIASES[normalized]) return CLUB_ALIASES[normalized];
  const byFullName = TEAMS.find(t => normalizeClubText(t.name) === normalized);
  return byFullName?.code ?? null;
}

// Kolomvolgorde in de sheet: Club | Penalties | Corners | Free Kicks | (optioneel) Updated GW. Zelfde
// header-lookup-stijl als parsePlayerDatabaseCsv in constants.js: werkt op (deel van de) kolomnaam, valt
// terug op vaste index als de header ontbreekt/hernoemd is — zo blijft dit ook werken als de kolomvolgorde
// in de sheet ooit verandert, zolang de headers zelf herkenbaar blijven.
//
// De "Updated GW"-kolom hoeft maar in ÉÉN rij ingevuld te zijn (bv. enkel naast de eerste club) — de
// eerste niet-lege waarde die gevonden wordt, telt. Dat is bewust een simpele, robuuste manier om één
// "laatst bijgewerkt"-waarde door te geven zonder een aparte metadata-rij/cel nodig te hebben, en zonder
// de 4 hoofdkolommen te verstoren.
//
// Rij-volgorde uit de sheet wordt exact bewaard (geen sortering) — de gebruiker bepaalt zelf de
// weergavevolgorde via de rijvolgorde in de sheet.
export function parseSetPiecesCsv(text) {
  const rows = parseCsvRows(text).filter(row => row.some(cell => (cell ?? '').trim() !== ''));
  if (rows.length === 0) return { entries: [], updatedGw: '' };
  const [headerRow, ...dataRows] = rows;
  const trimmedHeaders = headerRow.map(h => (h ?? '').trim().toLowerCase());
  const columnIndex = (matchers, fallbackIndex) => {
    const found = trimmedHeaders.findIndex(h => matchers.some(m => h.includes(m)));
    return found === -1 ? fallbackIndex : found;
  };
  const clubCol = columnIndex(['club'], 0);
  const penCol = columnIndex(['penalt'], 1);
  const corCol = columnIndex(['corner'], 2);
  const fkCol = columnIndex(['free kick', 'vrije trap'], 3);
  const gwCol = columnIndex(['updated', 'gw'], 4);

  const entries = [];
  let updatedGw = '';
  for (const row of dataRows) {
    const rawClub = (row[clubCol] ?? '').trim();
    if (!rawClub) continue;
    const clubCode = resolveClubCode(rawClub);
    const team = TEAMS.find(t => t.code === clubCode);
    entries.push({
      clubCode,
      clubName: team?.name ?? rawClub,
      penalties: (row[penCol] ?? '').trim(),
      corners: (row[corCol] ?? '').trim(),
      freeKicks: (row[fkCol] ?? '').trim(),
    });
    if (!updatedGw) {
      const gwValue = (row[gwCol] ?? '').trim();
      if (gwValue) updatedGw = gwValue;
    }
  }
  return { entries, updatedGw };
}
