// Herleidt vrije clubtekst uit een Google Sheet-kolom ("Club Brugge", "Union", "STVV", "La Louvière",
// maar ook rauwe 3-letter codes zoals "KOR"/"AND"/"GNT") naar de bestaande TEAMS-clubcode. Gedeeld door
// elke sheet-gevoede tab die een "Team"-kolom moet koppelen aan een clublogo (Bonuspunten, Kaarten, en
// toekomstige tabs) — één plek i.p.v. dezelfde alias-tabel in elke tab-module te herhalen.
import { TEAMS } from './constants';

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
  const trimmed = (rawClubText ?? '').trim();
  // Eerst de rauwe 3-letter clubcode zelf proberen (bv. "KOR", "AND", "GNT") — dat is exact de conventie
  // die de bestaande spelersdatabank-sheet al gebruikt in zijn "Team"-kolom (zie parsePlayerDatabaseCsv
  // in constants.js: teamCode = row[teamCol].trim().toUpperCase()), dus zeer waarschijnlijk ook in andere
  // sheets. Pas daarna de leesbare-naam-varianten (alias-tabel, volledige TEAMS-naam) proberen.
  const byCode = TEAMS.find(t => t.code === trimmed.toUpperCase());
  if (byCode) return byCode.code;
  const normalized = normalizeClubText(trimmed);
  if (CLUB_ALIASES[normalized]) return CLUB_ALIASES[normalized];
  const byFullName = TEAMS.find(t => normalizeClubText(t.name) === normalized);
  return byFullName?.code ?? null;
}
