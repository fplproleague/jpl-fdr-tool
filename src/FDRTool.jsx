import { useState, useMemo, useRef, useCallback, useEffect, useId, memo } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, TrendingUp, Info, X, Link2, Download, Check, ChevronDown, ArrowUpDown, Settings2, Grid2x2, Scale, Plus, Eye, UserPlus, Copy, Search, Clock, Loader2, AlertCircle } from 'lucide-react';
import html2canvas from 'html2canvas';

const TEAMS = [
  { code: 'AND', name: 'Anderlecht' },
  { code: 'ANT', name: 'Antwerp' },
  { code: 'BEV', name: 'SK Beveren' },
  { code: 'CER', name: 'Cercle Brugge' },
  { code: 'CHA', name: 'Charleroi' },
  { code: 'CLU', name: 'Club Brugge' },
  { code: 'GNK', name: 'Genk' },
  { code: 'GNT', name: 'Gent' },
  { code: 'KOR', name: 'KV Kortrijk' },
  { code: 'KVM', name: 'KV Mechelen' },
  { code: 'LLV', name: 'RAAL La Louvière' },
  { code: 'LOM', name: 'Lommel SK' },
  { code: 'OHL', name: 'OH Leuven' },
  { code: 'STA', name: 'Standard' },
  { code: 'STV', name: 'Sint-Truiden' },
  { code: 'USG', name: 'Union SG' },
  { code: 'WES', name: 'Westerlo' },
  { code: 'ZWA', name: 'Zulte Waregem' },
];

const FIXTURES = {
  AND: ['LLV-H','BEV-A','KOR-H','USG-A','GNK-H','KVM-A','ZWA-H','CER-A'],
  ANT: ['BEV-H','KOR-A','GNK-H','STV-H','STA-A','CLU-A','USG-H','WES-A'],
  CER: ['STA-A','STV-H','CLU-A','LOM-H','GNT-H','OHL-A','CHA-A','AND-H'],
  CHA: ['OHL-H','LOM-A','KVM-H','KOR-A','USG-H','ZWA-A','CER-H','STA-A'],
  CLU: ['KOR-H','OHL-A','CER-H','GNT-A','LOM-A','ANT-H','GNK-H','LLV-A'],
  GNK: ['ZWA-A','WES-H','ANT-A','BEV-H','AND-A','GNT-H','CLU-A','KOR-H'],
  GNT: ['KVM-H','LLV-A','OHL-H','CLU-H','CER-A','GNK-A','STA-H','ZWA-A'],
  KOR: ['CLU-A','ANT-H','AND-A','CHA-H','ZWA-H','LLV-A','BEV-H','GNK-A'],
  KVM: ['GNT-A','STA-H','CHA-A','LLV-A','WES-H','AND-H','LOM-A','STV-H'],
  LOM: ['STV-A','CHA-H','WES-H','CER-A','CLU-H','USG-A','KVM-H','BEV-A'],
  OHL: ['CHA-A','CLU-H','GNT-A','STA-H','BEV-A','CER-H','LLV-H','USG-A'],
  LLV: ['AND-A','GNT-H','STA-A','KVM-H','STV-A','KOR-H','OHL-A','CLU-H'],
  BEV: ['ANT-A','AND-H','ZWA-A','GNK-A','OHL-H','STV-H','KOR-A','LOM-H'],
  // GW4 (index 3) is voor STV en USG een dubbele speeldag (DGW): zie isDoubleGameweek() hieronder.
  STV: ['LOM-H','CER-A','USG-H', ['ANT-A','USG-H'], 'LLV-H','BEV-A','WES-H','KVM-A'],
  STA: ['CER-H','KVM-A','LLV-H','OHL-A','ANT-H','WES-A','GNT-A','CHA-H'],
  USG: ['WES-A','ZWA-H','STV-A', ['AND-H','STV-A'], 'CHA-A','LOM-H','ANT-A','OHL-H'],
  WES: ['USG-H','GNK-A','LOM-A','ZWA-H','KVM-A','STA-H','STV-A','ANT-H'],
  ZWA: ['GNK-H','USG-A','BEV-H','WES-A','KOR-A','CHA-H','AND-A','GNT-H'],
};

// Een fixture-entry in FIXTURES is normaal een string ("OPP-VENUE" — één wedstrijd). Voor een dubbele
// speeldag (DGW) is diezelfde positie in plaats daarvan een ARRAY van zulke strings, bv. ['ANT-A','USG-H'].
// Dit zijn de enige twee plekken die dat onderscheid maken — alle andere code roept isDoubleGameweek()/
// getFixtureLegs() aan i.p.v. zelf te controleren of iets een array is. Om een nieuwe DGW toe te voegen:
// vervang de betreffende FIXTURES-positie door een array van 2+ "OPP-VENUE"-strings, verder niets.
function isDoubleGameweek(fixtureEntry) {
  return Array.isArray(fixtureEntry);
}

// Normaliseert een fixture-entry naar een array van "OPP-VENUE"-strings: [fixture] voor een enkele
// speeldag, of de array zelf voor een DGW. Zo kan alle downstream-code (getFixtureInfo, getFixtureScores)
// hetzelfde .map()-patroon gebruiken ongeacht of het om 1 of meerdere wedstrijden gaat.
function getFixtureLegs(fixtureEntry) {
  return isDoubleGameweek(fixtureEntry) ? fixtureEntry : [fixtureEntry];
}

const POSTPONED = new Set([
  'STV-3', // Sint-Truiden vs Union SG, GW3 — uitgesteld naar 2 september
  'USG-3', // Union SG vs Sint-Truiden, GW3 — uitgesteld naar 2 september
]);
const POSTPONED_DATE = '2 september';

// Nog niet zeker uitgesteld — kan verschuiven afhankelijk van Europese kwalificatie. Zelfde key-structuur als POSTPONED.
const POSSIBLY_POSTPONED = new Set([
  'AND-3', // Anderlecht vs Kortrijk, GW3 — bij Europese kwalificatie van Anderlecht
  'KOR-3', // Kortrijk vs Anderlecht, GW3 — bij Europese kwalificatie van Anderlecht
  'GNT-3', // Gent vs OH Leuven, GW3 — bij Europese kwalificatie van Gent
  'OHL-3', // OH Leuven vs Gent, GW3 — bij Europese kwalificatie van Gent
  'USG-6', // Union SG vs Lommel, GW6 — afhankelijk van Europees programma Union SG
  'LOM-6', // Lommel vs Union SG, GW6 — afhankelijk van Europees programma Union SG
]);

// Eén reden per wedstrijd, opgezocht via een teamcode-onafhankelijke (gesorteerde) paar-key.
const POSSIBLY_POSTPONED_REASONS = {
  'AND-KOR': 'mogelijk uitgesteld als Anderlecht zich plaatst voor de laatste Europese kwalificatieronde',
  'GNT-OHL': 'mogelijk uitgesteld als Gent zich plaatst voor de laatste Europese kwalificatieronde',
  'LOM-USG': "mogelijk uitgesteld afhankelijk van Union SG's Europees programma",
};

const DEFAULT_RATINGS = {
  LOM: 1, KOR: 1, BEV: 1, 
  ZWA: 2, OHL: 2, CER: 2, LLV: 2,
  STA: 3, KVM: 3, WES: 3, CHA: 3, ANT: 3, STV: 3,
  GNK: 4, AND: 4, GNT: 4,
  USG: 5, CLU: 5,
};

// Thuisvoordeel staat standaard overal uit — per team aan/uit-schakelbaar, los van de sterkte-rating zelf.
const DEFAULT_HOME_ADVANTAGE = Object.fromEntries(TEAMS.map(t => [t.code, false]));

const RATING_STYLE = {
  1: { bg: '#1F7A4D', text: '#EAFBF1', label: 'Makkelijkst' },
  2: { bg: '#5BAE7A', text: '#0B2E1B', label: 'Makkelijk' },
  3: { bg: '#E8C547', text: '#3D2E00', label: 'Gemiddeld' },
  4: { bg: '#E08A3E', text: '#2E1500', label: 'Moeilijk' },
  5: { bg: '#C2402C', text: '#FBEAE7', label: 'Moeilijkst' },
};

// Kleuren/iconen per spelersstatus in de Spelerstatus-tab — bewust losse, hardcoded kopie van de
// RATING_STYLE-kleuren (i.p.v. RATING_STYLE[n] rechtstreeks te hergebruiken), zodat het aanpassen
// van de FDR-moeilijkheidsschaal deze onafhankelijke betekenis nooit per ongeluk meeverandert.
const PLAYER_STATUS_STYLE = {
  'Out':               { emoji: '🔴', bg: '#C2402C', text: '#FBEAE7' }, // = RATING_STYLE[5]
  'Twijfel':           { emoji: '🟡', bg: '#E8C547', text: '#3D2E00' }, // = RATING_STYLE[3]
  'Terug Beschikbaar': { emoji: '🟢', bg: '#1F7A4D', text: '#EAFBF1' }, // = RATING_STYLE[1]
};
// Vaste weergave-/sorteervolgorde van de hoofdlijst. 'Beschikbaar' zit er bewust niet in: die status
// wordt nooit als rij getoond, enkel gebruikt om een speler terug normaal te markeren in de sheet.
const PLAYER_STATUS_ORDER = ['Out', 'Twijfel', 'Terug Beschikbaar'];

// Weergavelabel per status, per taal — de CANONIEKE status-string uit de sheet (player.status,
// PLAYER_STATUS_STYLE-key, filter-key, ...) blijft altijd de Nederlandse waarde; enkel de op het
// scherm getoonde tekst verandert met de taalkeuze.
const STATUS_LABELS = {
  nl: { 'Out': 'Out', 'Twijfel': 'Twijfel', 'Terug Beschikbaar': 'Terug Beschikbaar' },
  en: { 'Out': 'Out', 'Twijfel': 'Doubtful', 'Terug Beschikbaar': 'Back Available' },
};
function translateStatus(status, language) {
  return STATUS_LABELS[language]?.[status] ?? status;
}

// Tab-navigatie bovenaan de pagina — array-gedreven zodat toekomstige onderdelen naast de FDR-tool
// gewoon een extra entry kunnen worden.
const TABS = [
  { key: 'fdr', label: 'FDR' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'playerstatus', label: 'Spelerstatus' },
  { key: 'teamplanner', label: 'Team Planner' },
  { key: 'pricechanges', label: 'Price Changes' },
];

// Lichte NL/EN-vertaallaag voor enkel de belangrijkste, meest zichtbare tekst — geen volledig
// i18n-systeem. Alles wat hier NIET in staat (info-popup, foutmeldingen, tooltips, data uit de
// sheet zelf, ...) blijft bewust altijd Nederlands, ongeacht de taalkeuze.
const TRANSLATIONS = {
  nl: {
    subtitle: 'Interactieve tools voor Fantasy Pro League — gemaakt door @fpl_proleague.',
    tabPlayerStatus: 'Spelerstatus',
    fdrIntro: 'Mijn eigen fixture difficulty ratings — pas ze aan naar jouw mening en ontdek meteen welke teams de beste runs hebben.',
    watchlistIntro: 'Houd je favoriete spelers in de gaten — voeg ze toe aan je persoonlijke watchlist, samen met hun eerstvolgende fixtures. Deze lijst slaat automatisch op in je browser.',
    playerStatusIntro: 'Overzicht van spelers die geblesseerd, geschorst of twijfelachtig zijn — automatisch bijgewerkt vanuit onze spelerstatus-tracker.',
    copyLinkFull: 'Kopieer link',
    copyLinkShort: 'Kopieer',
    linkCopiedFull: 'Link gekopieerd!',
    linkCopiedShort: 'Gekopieerd!',
    downloadFull: 'Download als afbeelding',
    downloadShort: 'Download',
    loadingEllipsis: 'Bezig...',
    saveFull: 'Bewaar in browser',
    saveShort: 'Bewaar',
    savedFull: 'Opgeslagen ✓',
    savedShort: 'Bewaard ✓',
    sortByEasiest: 'Sorteer op makkelijkste run',
    sortedEasiestFirst: 'Gesorteerd: makkelijkste eerst',
    customVersionBadge: 'JOUW AANGEPASTE VERSIE',
    defaultRatingBadge: 'RATING VAN @FPL_PROLEAGUE',
    ratingLabels: { 1: 'Makkelijkst', 2: 'Makkelijk', 3: 'Gemiddeld', 4: 'Moeilijk', 5: 'Moeilijkst' },
    sectionSliders: 'Team-sterkte instellen',
    sectionRuns: 'Beste fixture runs',
    sectionCompare: 'Vergelijk teams',
    compareIntro: 'Kies tot 5 teams om hun fixtures onder elkaar te zien.',
    noTeamsSelected: 'Nog geen teams geselecteerd.',
    watchlistFormTitle: 'Speler toevoegen',
    nameLabel: 'Naam',
    namePlaceholder: 'Bv. Zorgane',
    teamLabel: 'Team',
    chooseTeam: 'Kies team',
    priceLabel: 'Prijs (optioneel)',
    pricePlaceholder: 'Bv. 8.5',
    addButton: 'Toevoegen',
    myWatchlistTitle: 'Mijn watchlist',
    watchlistEmpty: 'Je watchlist is nog leeg. Voeg spelers toe die je in de gaten wil houden.',
    footerMadeBy: 'Gemaakt door',
    footerSuffix: '· Fantasy Pro League 26/27 · Data eigen analyse',
    lastUpdatedLabel: 'Laatst bijgewerkt',
    searchPlaceholder: 'Zoek op spelersnaam',
    filterAll: 'Alles',
    detailStatus: 'Status',
    detailReason: 'Reden',
    detailExpectedReturn: 'Verwachte terugkeer',
    detailLastUpdate: 'Laatste update',
    detailSource: 'Bron',
    detailNotes: 'Notities',
    playerStatusEmptyNone: 'Geen spelers momenteel out, geschorst of twijfelachtig.',
    playerStatusEmptyFiltered: 'Geen spelers gevonden voor deze zoekopdracht/filter.',
  },
  en: {
    subtitle: 'Interactive tools for Fantasy Pro League — built by @fpl_proleague.',
    tabPlayerStatus: 'Player Status',
    fdrIntro: 'My own fixture difficulty ratings — adjust them to your own view and instantly see which teams have the best runs.',
    watchlistIntro: 'Keep an eye on your favourite players — add them to your personal watchlist, along with their upcoming fixtures. This list is saved automatically in your browser.',
    playerStatusIntro: 'Overview of players who are injured, suspended, or doubtful — automatically updated from our player status tracker.',
    copyLinkFull: 'Copy link',
    copyLinkShort: 'Copy',
    linkCopiedFull: 'Link copied!',
    linkCopiedShort: 'Copied!',
    downloadFull: 'Download as image',
    downloadShort: 'Download',
    loadingEllipsis: 'Loading...',
    saveFull: 'Save in browser',
    saveShort: 'Save',
    savedFull: 'Saved ✓',
    savedShort: 'Saved ✓',
    sortByEasiest: 'Sort by easiest run',
    sortedEasiestFirst: 'Sorted: easiest first',
    customVersionBadge: 'YOUR CUSTOM VERSION',
    defaultRatingBadge: 'RATING BY @FPL_PROLEAGUE',
    ratingLabels: { 1: 'Easiest', 2: 'Easy', 3: 'Average', 4: 'Hard', 5: 'Hardest' },
    sectionSliders: 'Set team strength',
    sectionRuns: 'Best fixture runs',
    sectionCompare: 'Compare teams',
    compareIntro: 'Choose up to 5 teams to see their fixtures stacked below each other.',
    noTeamsSelected: 'No teams selected yet.',
    watchlistFormTitle: 'Add player',
    nameLabel: 'Name',
    namePlaceholder: 'E.g. Zorgane',
    teamLabel: 'Team',
    chooseTeam: 'Choose team',
    priceLabel: 'Price (optional)',
    pricePlaceholder: 'E.g. 8.5',
    addButton: 'Add',
    myWatchlistTitle: 'My watchlist',
    watchlistEmpty: 'Your watchlist is empty. Add players you want to keep an eye on.',
    footerMadeBy: 'Built by',
    footerSuffix: '· Fantasy Pro League 26/27 · Own analysis',
    lastUpdatedLabel: 'Last updated',
    searchPlaceholder: 'Search by player name',
    filterAll: 'All',
    detailStatus: 'Status',
    detailReason: 'Reason',
    detailExpectedReturn: 'Expected return',
    detailLastUpdate: 'Last updated',
    detailSource: 'Source',
    detailNotes: 'Notes',
    playerStatusEmptyNone: 'No players currently out, suspended, or doubtful.',
    playerStatusEmptyFiltered: 'No players found for this search/filter.',
  },
};

const GW_COUNT = 8;
const MINILEAGUE_CODE = '19WN75';
const LAST_UPDATED = '30 juli 2026';
// Handmatig wekelijks bij te werken, net als LAST_UPDATED — markeert de "huidige" gameweek in de
// hoofdtabel en bepaalt vanaf waar de mini-fixture-strip in de watch list start.
const CURRENT_GW = 1;
const STORAGE_KEY = 'fpl_proleague_fdr_ratings_v1';
const HOME_ADVANTAGE_STORAGE_KEY = 'fpl_proleague_fdr_home_advantage_v1';
// Eigen storage key voor de watch list — los van de FDR-ratings hierboven, zodat ze elkaar niet raken.
const WATCHLIST_STORAGE_KEY = 'fpl_proleague_watchlist_v1';
// Publiek gepubliceerde Google Sheet (CSV-export) met de actuele spelersstatus (out/twijfel/terug
// beschikbaar) — bron voor de Spelerstatus-tab.
const PLAYER_STATUS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT6USo4139zAf6zndDf428orxRT2q20l8arNVo8LWqNoVGz2-FZIx3PJedAhCzoQOGGxfPz0qbx4m2h/pub?gid=0&single=true&output=csv';
// Onthoudt of de first-time-uitleg over Thuisvoordeel al getoond is, zodat die maar één keer ooit verschijnt.
const HOME_ADVANTAGE_INTRO_SEEN_KEY = 'fpl_proleague_ha_intro_seen_v1';
// Onthoudt de NL/EN-taalkeuze van de NL/EN-toggle rechtsboven, zodat die bewaard blijft bij een volgend bezoek.
const LANGUAGE_STORAGE_KEY = 'fpl_proleague_language_v1';

// TEAMS is al alfabetisch op code — eenmalig gesorteerde kopie voor UI-lijsten die dat expliciet willen.
const TEAMS_ALPHA = [...TEAMS].sort((a, b) => a.code.localeCompare(b.code));
const GW_INDEXES = Array.from({ length: GW_COUNT }, (_, i) => i);

// Statische GW-headers/opties: eenmalig opgebouwd, hergebruikt door meerdere tabellen/selects.
const gwHeaderCells = GW_INDEXES.map(i => (
  <th key={i} style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 4px', minWidth: '58px' }}>
    GW{i + 1}
  </th>
));
const gwOptionElements = GW_INDEXES.map(i => (
  <option key={i} value={i + 1}>{i + 1}</option>
));

function loadStoredRatings() {
  try {
    const raw = window.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function encodeRatingsToParam(ratings) {
  return TEAMS.map(t => `${t.code}${ratings[t.code]}`).join('-');
}

function loadRatingsFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('r');
    if (!raw) return null;
    const parts = raw.split('-');
    const result = {};
    for (const part of parts) {
      const code = part.slice(0, 3);
      const value = Number(part.slice(3));
      if (TEAMS.some(t => t.code === code) && value >= 1 && value <= 5) {
        result[code] = value;
      }
    }
    if (TEAMS.every(t => result[t.code])) return result;
    return null;
  } catch {
    return null;
  }
}

function loadStoredHomeAdvantage() {
  try {
    const raw = window.localStorage?.getItem(HOME_ADVANTAGE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    return null;
  } catch {
    return null;
  }
}

function hasSeenHomeAdvantageIntro() {
  try {
    return window.localStorage?.getItem(HOME_ADVANTAGE_INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

// Compacte encoding: één '0'/'1' per team, in TEAMS-volgorde (geen teamcodes nodig, vaste lengte/positie).
function encodeHomeAdvantageToParam(homeAdvantage) {
  return TEAMS.map(t => (homeAdvantage[t.code] ? '1' : '0')).join('');
}

function loadHomeAdvantageFromURL() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get('ha');
    if (!raw || raw.length !== TEAMS.length || !/^[01]+$/.test(raw)) return null;
    const result = {};
    TEAMS.forEach((t, i) => { result[t.code] = raw[i] === '1'; });
    return result;
  } catch {
    return null;
  }
}

// Taalkeuze van de NL/EN-toggle — alles behalve 'en' valt terug op 'nl' (ook bij ontbrekende/kapotte
// localStorage-waarde), zodat Nederlands altijd de veilige default blijft.
function loadStoredLanguage() {
  try {
    return window.localStorage?.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'nl';
  } catch {
    return 'nl';
  }
}

// Watch list: los array-gebaseerd datamodel (i.p.v. een per-team map zoals ratings), want spelers
// hebben geen vaste, vooraf gekende set van keys.
function loadStoredWatchlist() {
  try {
    const raw = window.localStorage?.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Unieke id per watch-list entry, met een eenvoudige fallback voor browsers zonder crypto.randomUUID.
function createWatchlistId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// --- Spelerstatus: CSV-parsing en datumhulp-functies ---

// Eenvoudige RFC4180-achtige CSV-tokenizer (i.p.v. text.split(',')): de vrije-tekstkolommen
// (Reden/Notities/Bron) kunnen komma's en zelfs regeleindes bevatten zolang het veld tussen
// aanhalingstekens staat, en "" binnen zo'n veld is een ontsnapt aanhalingsteken.
function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (char === '\r') {
      // negeren — \r\n regeleindes worden door de \n-tak hierboven afgehandeld
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Probeert een datumwaarde uit de sheet te herkennen zonder aannames te maken over het exacte
// exportformaat (kan ISO, DD/MM/YYYY of DD-MM-YYYY zijn, of iets dat native Date wel herkent).
function parseFlexibleDate(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(date) ? null : date;
  }
  const euMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (euMatch) {
    const [, d, m, y] = euMatch;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return isNaN(date) ? null : date;
  }
  const fallback = new Date(trimmed);
  return isNaN(fallback) ? null : fallback;
}

// Vaste weergave-indeling voor datums in de Spelerstatus-tab.
function formatDateDDMMYYYY(date) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

// Zet een ruwe CSV-rij om naar een genormaliseerd speler-object. Kolomvolgorde is vast (0-8:
// Speler, Team, Positie, Status, Reden, Verwachte terugkeer, Bron, Notities, Laatste update) —
// we mappen op index, niet op headertekst, zoals expliciet in de spec beschreven. Destructuren
// met defaults zodat een rij met minder kolommen dan verwacht niet crasht.
function mapRowToPlayerStatus(row, index) {
  const [
    name = '', teamCode = '', position = '', status = '', reason = '',
    expectedReturn = '', source = '', notes = '', lastUpdate = '',
  ] = row.map(cell => (cell ?? '').trim());
  const upperTeamCode = teamCode.toUpperCase();
  const team = TEAMS.find(t => t.code === upperTeamCode);
  return {
    id: index,
    name,
    teamCode: upperTeamCode,
    teamName: team?.name ?? teamCode,
    position,
    status,
    reason,
    expectedReturn,
    source,
    notes,
    lastUpdate,
    lastUpdateDate: parseFlexibleDate(lastUpdate),
  };
}

// Bepaalt de meest recente "Laatste update" over alle rijen (ook 'Beschikbaar'-rijen), zodat de
// badge bovenaan altijd de update-status van de volledige sheet weerspiegelt, niet enkel de
// zichtbare lijst.
function findMostRecentUpdate(players) {
  return players.reduce((mostRecent, player) => {
    if (!player.lastUpdateDate) return mostRecent;
    if (!mostRecent || player.lastUpdateDate > mostRecent.lastUpdateDate) return player;
    return mostRecent;
  }, null);
}

function average(numbers) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// Effectieve rating van een tegenstander voor één fixture: de basis-sterkte, eventueel verhoogd
// door Thuisvoordeel. Dit vervangt de vroegere simpele "ratings[opp] ?? 3"-lookup overal waar de
// moeilijkheidsgraad van een fixture bepaald wordt (celkleur, tooltip, gemiddelde-berekeningen).
function getEffectiveRating(opp, venue, ratings, homeAdvantage) {
  const base = ratings[opp] ?? 3;
  // Thuisvoordeel telt alléén mee wanneer de tegenstander (opp) thuis speelt tegen de rij-team
  // (venue 'A'), én enkel als de tegenstander zélf de toggle heeft aangezet. Venue 'H' verandert nooit.
  if (venue === 'A' && homeAdvantage[opp]) {
    return Math.min(base + 1, 5);
  }
  return base;
}

function getFixtureScores(teamCode, fixtures, ratings, homeAdvantage, startGW) {
  return fixtures.map((f, idx) => {
    const gwNumber = startGW + idx;
    if (POSTPONED.has(`${teamCode}-${gwNumber}`)) return 5; // gemiste speeldag = nadeel, telt als moeilijkst
    // DGW = altijd de gunstigste rating in gemiddelde-berekeningen: een extra speeldag levert altijd
    // extra puntenkansen op, ongeacht wie de tegenstanders zijn. Geldt voor elke plek die het gemiddelde
    // berekent (teamAvgDifficulty, bestRuns), want die lopen allebei via deze functie.
    if (isDoubleGameweek(f)) return 1;
    const [opp, venue] = f.split('-');
    return getEffectiveRating(opp, venue, ratings, homeAdvantage);
  });
}

function splitHomeAway(teamCode, opp, venue) {
  const team = TEAMS.find(t => t.code === teamCode)?.name ?? teamCode;
  const oppTeam = TEAMS.find(t => t.code === opp)?.name ?? opp;
  return venue === 'H' ? [team, oppTeam] : [oppTeam, team];
}

function buildPostponedTooltipText(teamCode, opp, venue) {
  const [home, away] = splitHomeAway(teamCode, opp, venue);
  return `${home} - ${away} is uitgesteld naar ${POSTPONED_DATE} wegens de Europese voorrondes.`;
}

function buildPossiblyPostponedTooltipText(teamCode, opp, venue) {
  const [home, away] = splitHomeAway(teamCode, opp, venue);
  const pairKey = [teamCode, opp].sort().join('-');
  const reason = POSSIBLY_POSTPONED_REASONS[pairKey] ?? 'mogelijk uitgesteld door het Europese programma';
  return `${home} - ${away} wordt ${reason}.`;
}

function getFixtureInfo(teamCode, fixture, gwNumber, ratings, homeAdvantage) {
  const key = `${teamCode}-${gwNumber}`;
  const isPostponed = POSTPONED.has(key);
  const isPossiblyPostponed = !isPostponed && POSSIBLY_POSTPONED.has(key);

  // DGW-tak: levert meerdere "legs" (elk hun eigen opp/venue/style) i.p.v. één opp/venue/style.
  // POSTPONED/POSSIBLY_POSTPONED werken op het niveau van de hele speeldag (key = teamCode-gwNumber),
  // niet per individuele wedstrijd binnen een DGW. Een POSTPONED DGW-speeldag valt daarom door naar het
  // enkele-GW-pad hieronder en gedraagt zich als een normale uitgestelde cel (legs worden genegeerd).
  // Tooltips voor mogelijk-uitgesteld tonen we bewust niet op DGW-cellen: 2 tegenstanders passen niet in
  // 1 reden-tekst, en de cel toont z'n eigen twee kleurvakjes al als visueel signaal.
  if (isDoubleGameweek(fixture) && !isPostponed) {
    const legs = getFixtureLegs(fixture).map(f => {
      const [opp, venue] = f.split('-');
      return { opp, venue, style: RATING_STYLE[getEffectiveRating(opp, venue, ratings, homeAdvantage)] };
    });
    return {
      isDoubleGameweek: true, legs,
      isPostponed: false, isPossiblyPostponed,
      postponedText: null, possiblyPostponedText: null,
    };
  }

  // Enkele-GW-pad (bestaand gedrag). getFixtureLegs(...)[0] pakt bij een (toevallig) POSTPONED DGW de
  // eerste wedstrijd, zodat de "was het tegen wie"-tooltiptekst nog altijd zinvol is.
  const [opp, venue] = getFixtureLegs(fixture)[0].split('-');
  const style = isPostponed ? null : RATING_STYLE[getEffectiveRating(opp, venue, ratings, homeAdvantage)];
  const postponedText = isPostponed ? buildPostponedTooltipText(teamCode, opp, venue) : null;
  const possiblyPostponedText = isPossiblyPostponed ? buildPossiblyPostponedTooltipText(teamCode, opp, venue) : null;
  return { isDoubleGameweek: false, opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText };
}

const selectStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '4px 8px', fontSize: '12px'
};

const watchlistInputStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '8px 10px', fontSize: '13px', width: '100%'
};

const sectionToggleButtonStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
  background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
};

const sectionTitleStyle = {
  color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0,
  display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
};

const secondaryToolbarBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'transparent', color: '#C9B8E0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px',
  fontWeight: 700, fontSize: '13px', cursor: 'pointer'
};

function chevronStyle(isOpen) {
  return { transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' };
}

const SectionHeader = memo(function SectionHeader({ icon: Icon, title, sectionKey, isOpen, onToggle }) {
  return (
    <button onClick={() => onToggle(sectionKey)} style={sectionToggleButtonStyle}>
      <h2 className="fdr-title fdr-section-title" style={sectionTitleStyle}>
        <Icon size={18} color="#4ECDC4" /> {title}
      </h2>
      {/* Vult de ruimte tussen titel en chevron; flex: 1 laat 'm meekrimpen/groeien met de knopbreedte. */}
      <span aria-hidden="true" style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.08)', margin: '0 8px' }} />
      <ChevronDown size={20} color="#C9B8E0" style={chevronStyle(isOpen)} />
    </button>
  );
});

// Gedeelde interactielogica voor fixture-tooltips: hover op desktop, tap-toggle + tap-buiten-sluit op mobiel.
// Positie wordt in viewport-coördinaten bijgehouden zodat de bubble (via een portal) nooit wordt
// afgesneden door de horizontaal scrollende tabellen.
function useTooltipTrigger() {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const tooltipId = useId();
  const visible = hoverOpen || clickOpen;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const placeBelow = rect.top < 70;
    const left = Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100);
    setCoords({
      left,
      y: placeBelow ? rect.bottom + 8 : rect.top - 8,
      placement: placeBelow ? 'bottom' : 'top',
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    const handleReposition = () => updatePosition();
    const handlePointerDown = (e) => {
      if (triggerRef.current?.contains(e.target) || bubbleRef.current?.contains(e.target)) return;
      setClickOpen(false);
    };
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [visible, updatePosition]);

  const triggerProps = {
    ref: triggerRef,
    tabIndex: 0,
    'aria-describedby': visible ? tooltipId : undefined,
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') { updatePosition(); setHoverOpen(true); } },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setHoverOpen(false); },
    onFocus: (e) => { if (e.target.matches(':focus-visible')) { updatePosition(); setHoverOpen(true); } },
    onBlur: () => setHoverOpen(false),
    onClick: (e) => { e.stopPropagation(); updatePosition(); setClickOpen(o => !o); },
  };

  return { triggerProps, bubbleRef, tooltipId, visible, coords };
}

function TooltipBubble({ id, bubbleRef, coords, text }) {
  return createPortal(
    <div
      id={id}
      ref={bubbleRef}
      role="tooltip"
      className={`fdr-postponed-tooltip fdr-postponed-tooltip--${coords.placement}`}
      style={{
        top: coords.y,
        left: coords.left,
        transform: `translate(-50%, ${coords.placement === 'top' ? '-100%' : '0'})`,
      }}
    >
      {text}
    </div>,
    document.body
  );
}

// Maakt van "as" (td/span) een klikbare/hoverbare tooltip-trigger over zijn volledige oppervlak,
// zowel voor het grijze "/"-vakje (POSTPONED) als voor mogelijk uitgestelde cellen die hun eigen
// FDR-kleur behouden (POSSIBLY_POSTPONED) — de popup verschijnt bij een klik/tap/hover eender waar op de cel.
const TooltipTrigger = memo(function TooltipTrigger({ as: Tag, text, style, className, children }) {
  const { triggerProps, bubbleRef, tooltipId, visible, coords } = useTooltipTrigger();
  return (
    <>
      <Tag {...triggerProps} className={className} style={style} aria-label={text}>
        {children}
      </Tag>
      {visible && coords && <TooltipBubble id={tooltipId} bubbleRef={bubbleRef} coords={coords} text={text} />}
    </>
  );
});

// Grijs "/"-vakje voor zeker uitgestelde wedstrijden (POSTPONED).
const PostponedIndicator = memo(function PostponedIndicator({ as: Tag, text, style, className }) {
  return (
    <TooltipTrigger as={Tag} text={text} style={style} className={className}>
      /
    </TooltipTrigger>
  );
});

const FixtureCell = memo(function FixtureCell({
  opp, venue, isPostponed, isPossiblyPostponed, bg, textColor, stacked, postponedText, possiblyPostponedText,
  isDoubleGameweek, legs
}) {
  const stackingStyle = stacked ? { position: 'relative', zIndex: 1 } : null;

  if (isPostponed) {
    return (
      <PostponedIndicator
        as="td"
        className="fdr-cell"
        text={postponedText}
        style={{
          background: '#4A4560', color: '#9B93AD', textAlign: 'center',
          fontSize: '14px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
          cursor: 'pointer',
          ...stackingStyle
        }}
      />
    );
  }

  // DGW: cel gesplitst in 2 gestapelde helften (elk hun eigen achtergrondkleur o.b.v. de rating van die
  // tegenstander), in een kleiner lettertype dan de normale enkele cel zodat beide passen. Een <td> is
  // van zichzelf al block-level voor z'n kinderen, dus de twee <div>'s stapelen vanzelf boven/onder.
  // padding/fontSize zijn bewust krap: de 2 helften + border-bottom moeten samen binnen de hoogte van
  // een normale enkele cel (~32px) blijven, anders wordt de hele rij (alle 8 kolommen) hoger dan de rest.
  if (isDoubleGameweek) {
    return (
      <td className="fdr-cell" style={{ padding: 0, borderRadius: '6px', overflow: 'hidden', ...stackingStyle }}>
        {legs.map((leg, i) => (
          <div key={i} style={{
            background: leg.style.bg, color: leg.style.text, textAlign: 'center',
            fontSize: '9px', fontWeight: 700, padding: '2px 2px', lineHeight: 1.2,
            // Duidelijke scheiding tussen de 2 helften: border-bottom op de bovenste (i===0), niet
            // border-top op de onderste, zodat de lijn zichtbaar bij de bovenste fixture "hoort".
            // Zelfde paarse kleur als de achtergrond/gutter tussen de tabelcellen, zodat de lijn oogt
            // als een echte scheiding tussen 2 cellen i.p.v. een schaduwrand.
            borderBottom: i === 0 ? '2px solid #2A1440' : undefined
          }}>
            {leg.opp} <span style={{ opacity: 0.75, fontWeight: 500 }}>({leg.venue})</span>
          </div>
        ))}
      </td>
    );
  }

  const content = (
    <>
      {opp}{' '}
      <span style={{ position: isPossiblyPostponed ? 'relative' : undefined }}>
        <span style={{ opacity: 0.75, fontWeight: 500 }}>({venue})</span>
        {isPossiblyPostponed && <span className="fdr-maybe-postponed-marker" aria-hidden="true">*</span>}
      </span>
    </>
  );

  if (isPossiblyPostponed) {
    return (
      <TooltipTrigger
        as="td"
        className="fdr-cell"
        text={possiblyPostponedText}
        style={{
          background: bg, color: textColor, textAlign: 'center',
          fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
          cursor: 'pointer',
          ...stackingStyle
        }}
      >
        {content}
      </TooltipTrigger>
    );
  }

  return (
    <td className="fdr-cell" style={{
      background: bg, color: textColor, textAlign: 'center',
      fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
      ...stackingStyle
    }}>
      {content}
    </td>
  );
});

// Compacte fixture-badge (tegenstander + venue) inclusief POSTPONED/POSSIBLY_POSTPONED-afhandeling,
// in mini-formaat — gebruikt voor de fixture-strip per speler in de watch list.
const MiniFixtureBadge = memo(function MiniFixtureBadge({ teamCode, fixture, gwNumber, ratings, homeAdvantage }) {
  const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
    getFixtureInfo(teamCode, fixture, gwNumber, ratings, homeAdvantage);

  if (isPostponed) {
    return (
      <PostponedIndicator
        as="span"
        className="fdr-postponed-mini"
        text={postponedText}
        style={{
          background: '#4A4560', color: '#9B93AD', fontSize: '10px', fontWeight: 700,
          padding: '3px 6px', borderRadius: '5px', cursor: 'pointer', textAlign: 'center'
        }}
      />
    );
  }

  // DGW: mini-badge gesplitst in 2 gestapelde regels i.p.v. 1 — zelfde idee als FixtureCell, maar
  // dan als inline-flex span (blijft meelopen in de flex-wrap rij van badges). De "fdr-dgw-badge"-klasse
  // laat mobiele CSS de padding van deze wrapper resetten, los van de padding van de losse badges.
  if (isDoubleGameweek) {
    return (
      <span className="fdr-dgw-badge" style={{ display: 'inline-flex', flexDirection: 'column', borderRadius: '5px', overflow: 'hidden' }}>
        {legs.map((leg, i) => (
          <span key={i} style={{
            display: 'block', background: leg.style.bg, color: leg.style.text,
            fontSize: '8px', fontWeight: 700, padding: '2px 5px', lineHeight: 1.3, whiteSpace: 'nowrap',
            // Zie FixtureCell hierboven: border-bottom op de bovenste helft (i===0) i.p.v. border-top
            // op de onderste, in dezelfde paarse achtergrondkleur voor een consistente scheiding.
            borderBottom: i === 0 ? '2px solid #2A1440' : undefined
          }}>
            {leg.opp} ({leg.venue})
          </span>
        ))}
      </span>
    );
  }

  const badgeContent = (
    <>
      {opp}{' '}
      <span style={{ position: isPossiblyPostponed ? 'relative' : undefined }}>
        ({venue})
        {isPossiblyPostponed && <span className="fdr-maybe-postponed-marker" aria-hidden="true">*</span>}
      </span>
    </>
  );

  if (isPossiblyPostponed) {
    return (
      <TooltipTrigger
        as="span"
        text={possiblyPostponedText}
        style={{
          background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
          padding: '3px 6px', borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap'
        }}
      >
        {badgeContent}
      </TooltipTrigger>
    );
  }

  return (
    <span style={{
      background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
      padding: '3px 6px', borderRadius: '5px', whiteSpace: 'nowrap'
    }}>
      {badgeContent}
    </span>
  );
});

// Eén rij in de Spelerstatus-lijst: samengevouwen header (statusbadge, naam, clublogo, positie,
// korte reden) die bij een klik een accordion-detailpaneel opent — zelfde interactie-primitieven
// (chevronStyle, ChevronDown, transition) als de bestaande SectionHeader, maar los ervan omdat dit
// een dynamische, per-rij lijst is i.p.v. een vaste set secties.
const PlayerStatusRow = memo(function PlayerStatusRow({ player, isExpanded, onToggle, language }) {
  const t = TRANSLATIONS[language];
  const style = PLAYER_STATUS_STYLE[player.status];
  const detailFields = [
    { label: t.detailStatus, value: translateStatus(player.status, language) },
    { label: t.detailReason, value: player.reason },
    { label: t.detailExpectedReturn, value: player.expectedReturn },
    { label: t.detailLastUpdate, value: player.lastUpdateDate ? formatDateDDMMYYYY(player.lastUpdateDate) : player.lastUpdate },
    { label: t.detailSource, value: player.source },
    { label: t.detailNotes, value: player.notes },
  ].filter(f => f.value);

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '10px', overflow: 'hidden'
    }}>
      <button
        onClick={() => onToggle(player.id)}
        className="fdr-playerstatus-row"
        style={{
          display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
          background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', textAlign: 'left'
        }}
      >
        <span style={{
          flexShrink: 0, fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px',
          background: style.bg, color: style.text, whiteSpace: 'nowrap'
        }}>
          {translateStatus(player.status, language)}
        </span>
        <img
          src={`/club-logos/${player.teamCode}.png`}
          alt=""
          className="club-logo"
          style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 700 }}>{player.name}</div>
          <div style={{
            color: '#8F79AD', fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
          }}>
            {[player.position, player.reason].filter(Boolean).join(' · ')}
          </div>
        </div>
        <ChevronDown size={18} color="#C9B8E0" style={{ ...chevronStyle(isExpanded), flexShrink: 0 }} />
      </button>
      {isExpanded && (
        <div style={{
          padding: '4px 12px 14px 12px', display: 'grid', gap: '8px',
          borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px'
        }}>
          {detailFields.map(f => (
            <div key={f.label}>
              <div style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                {f.label}
              </div>
              <div style={{ color: '#FFFFFF', fontSize: '13px', whiteSpace: 'normal' }}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default function FDRTool() {
  const [activeTab, setActiveTab] = useState('fdr');
  const [language, setLanguage] = useState(() => loadStoredLanguage());
  const t = TRANSLATIONS[language];
  const [ratings, setRatings] = useState(() => loadRatingsFromURL() || loadStoredRatings() || DEFAULT_RATINGS);
  const [homeAdvantage, setHomeAdvantage] = useState(() => loadHomeAdvantageFromURL() || loadStoredHomeAdvantage() || DEFAULT_HOME_ADVANTAGE);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(5);
  const [saved, setSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [minileagueCodeCopied, setMinileagueCodeCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHomeAdvantageIntro, setShowHomeAdvantageIntro] = useState(false);
  const [openSections, setOpenSections] = useState({
    sliders: false,
    table: true,
    runs: false,
    compare: false,
  });
  const [sortByDifficulty, setSortByDifficulty] = useState(false);
  const [compareTeams, setCompareTeams] = useState([]);
  const tableRef = useRef(null);

  // --- Watch list (Watch List-tab), los van de FDR-state hierboven ---
  const [watchlist, setWatchlist] = useState(() => loadStoredWatchlist());
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerTeam, setNewPlayerTeam] = useState('');
  const [newPlayerPrice, setNewPlayerPrice] = useState('');

  // --- Spelerstatus-tab, los van FDR/Watch List hierboven ---
  const [playerStatuses, setPlayerStatuses] = useState([]);
  const [playerStatusLoading, setPlayerStatusLoading] = useState(true);
  const [playerStatusError, setPlayerStatusError] = useState(null);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerStatusFilter, setPlayerStatusFilter] = useState('all'); // 'all' | een waarde uit PLAYER_STATUS_ORDER
  const [expandedPlayers, setExpandedPlayers] = useState(() => new Set());

  // isCustom volgt exact of ratings/homeAdvantage hun gedeelde DEFAULT-referentie zijn
  // (zie updateRating/toggleHomeAdvantage/handleReset).
  const isCustom = ratings !== DEFAULT_RATINGS || homeAdvantage !== DEFAULT_HOME_ADVANTAGE;

  const updateRating = (code, value) => {
    setRatings(prev => ({ ...prev, [code]: value }));
    setSaved(false);
  };

  // Thuisvoordeel is losstaand van de sterkte-rating: een aparte aan/uit-toggle per team.
  const toggleHomeAdvantage = (code) => {
    setHomeAdvantage(prev => ({ ...prev, [code]: !prev[code] }));
    setSaved(false);
    // First-time-uitleg: verschijnt enkel bij de allereerste toggle-klik ooit, daarna nooit meer.
    if (!hasSeenHomeAdvantageIntro()) {
      setShowHomeAdvantageIntro(true);
      try {
        window.localStorage?.setItem(HOME_ADVANTAGE_INTRO_SEEN_KEY, '1');
      } catch {
        // storage unavailable — de uitleg verschijnt dan gewoon opnieuw bij een volgende klik
      }
    }
  };

  const handleSave = () => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ratings));
      window.localStorage?.setItem(HOME_ADVANTAGE_STORAGE_KEY, JSON.stringify(homeAdvantage));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // storage unavailable — silently ignore, ratings still work this session
    }
  };

  const handleReset = () => {
    setRatings(DEFAULT_RATINGS);
    setHomeAdvantage(DEFAULT_HOME_ADVANTAGE);
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
      window.localStorage?.removeItem(HOME_ADVANTAGE_STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('r');
      url.searchParams.delete('ha');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('r', encodeRatingsToParam(ratings));
      url.searchParams.set('ha', encodeHomeAdvantageToParam(homeAdvantage));
      window.history.replaceState({}, '', url.toString());
      await navigator.clipboard.writeText(url.toString());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  const handleCopyMinileagueCode = async () => {
    try {
      await navigator.clipboard.writeText(MINILEAGUE_CODE);
      setMinileagueCodeCopied(true);
      setTimeout(() => setMinileagueCodeCopied(false), 2000);
    } catch {
      // clipboard unavailable — silently ignore
    }
  };

  const handleDownloadImage = async () => {
    if (!tableRef.current) return;
    setDownloading(true);
    const el = tableRef.current;
    const scrollEl = el.querySelector('.fdr-table-scroll');

    const wasOpen = openSections.table;
    if (!wasOpen) {
      setOpenSections(prev => ({ ...prev, table: true }));
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(resolve, 120);
          });
        });
      });
    }

    const prevWidth = scrollEl?.style.width;
    const prevMaxWidth = scrollEl?.style.maxWidth;
    const prevOverflow = scrollEl?.style.overflow;
    if (scrollEl) {
      scrollEl.style.width = `${scrollEl.scrollWidth}px`;
      scrollEl.style.maxWidth = 'none';
      scrollEl.style.overflow = 'visible';
      scrollEl.scrollLeft = 0;
    }

    try {
      const canvas = await html2canvas(el, {
        backgroundColor: '#2A1440',
        scale: 2,
        windowWidth: el.scrollWidth,
        width: el.scrollWidth,
      });

      const watermarkHeight = 44 * 2;
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height + watermarkHeight;
      const ctx = finalCanvas.getContext('2d');
      ctx.fillStyle = '#2A1440';
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      ctx.drawImage(canvas, 0, 0);
      ctx.fillStyle = '#4ECDC4';
      ctx.font = 'bold 26px Archivo, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('@fpl_proleague', finalCanvas.width / 2, canvas.height + watermarkHeight / 2);

      const link = document.createElement('a');
      link.download = 'fdr-tabel-fpl-proleague.png';
      link.href = finalCanvas.toDataURL('image/png');
      link.click();
    } catch {
      // rendering failed — silently ignore, user can screenshot manually
    } finally {
      if (scrollEl) {
        scrollEl.style.width = prevWidth;
        scrollEl.style.maxWidth = prevMaxWidth;
        scrollEl.style.overflow = prevOverflow;
      }
      if (!wasOpen) {
        setOpenSections(prev => ({ ...prev, table: false }));
      }
      setDownloading(false);
    }
  };

  const toggleSection = useCallback((key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const bestRuns = useMemo(() => {
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);
    const results = TEAMS.map(team => {
      const fixtures = FIXTURES[team.code].slice(start - 1, end);
      const scores = getFixtureScores(team.code, fixtures, ratings, homeAdvantage, start);
      return { ...team, avg: average(scores), fixtures, startGW: start };
    });
    return results.sort((a, b) => a.avg - b.avg).slice(0, 5);
  }, [ratings, homeAdvantage, rangeStart, rangeEnd]);

  const teamAvgDifficulty = useMemo(() => {
    const map = {};
    TEAMS.forEach(team => {
      map[team.code] = average(getFixtureScores(team.code, FIXTURES[team.code], ratings, homeAdvantage, 1));
    });
    return map;
  }, [ratings, homeAdvantage]);

  const displayedTeams = useMemo(() => {
    if (!sortByDifficulty) return TEAMS;
    return TEAMS.slice().sort((a, b) => teamAvgDifficulty[a.code] - teamAvgDifficulty[b.code]);
  }, [sortByDifficulty, teamAvgDifficulty]);

  const toggleCompareTeam = (code) => {
    setCompareTeams(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      if (prev.length >= 5) return prev;
      return [...prev, code];
    });
  };

  // De first-time-uitleg over Thuisvoordeel verdwijnt vanzelf na een paar seconden.
  useEffect(() => {
    if (!showHomeAdvantageIntro) return;
    const timer = setTimeout(() => setShowHomeAdvantageIntro(false), 6000);
    return () => clearTimeout(timer);
  }, [showHomeAdvantageIntro]);

  // Watch list slaat zichzelf automatisch op bij elke wijziging — geen aparte bewaar-knop nodig,
  // in tegenstelling tot de FDR-ratings hierboven die pas bewaard worden via "Bewaar in browser".
  useEffect(() => {
    try {
      window.localStorage?.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
    } catch {
      // storage unavailable — silently ignore, watch list still works this session
    }
  }, [watchlist]);

  // NL/EN-taalkeuze slaat automatisch op, zelfde patroon als de watch list hierboven.
  useEffect(() => {
    try {
      window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // storage unavailable — silently ignore, taalkeuze werkt nog wel deze sessie
    }
  }, [language]);

  // Haalt de spelersstatus-CSV op en parset ze naar playerStatuses. Losse useCallback (i.p.v. rechtstreeks
  // in de useEffect hieronder) zodat zowel de automatische fetch bij het laden als de "probeer opnieuw"-
  // en "vernieuwen"-knoppen in de UI exact dezelfde logica hergebruiken.
  const fetchPlayerStatuses = useCallback(async () => {
    setPlayerStatusLoading(true);
    setPlayerStatusError(null);
    try {
      const response = await fetch(PLAYER_STATUS_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      // Een gepubliceerde Google Sheet kan bij verkeerde/ingetrokken publish-rechten een HTML-
      // foutpagina teruggeven i.p.v. CSV — die herkennen we hier zodat de UI een duidelijke
      // foutmelding toont i.p.v. stilzwijgend brokkenrijen te parsen.
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      const rows = parseCsvRows(text).slice(1); // eerste rij is de header, die slaan we over
      setPlayerStatuses(rows.map(mapRowToPlayerStatus).filter(p => p.name));
    } catch {
      setPlayerStatusError('Kon spelersstatus niet laden, probeer later opnieuw.');
    } finally {
      setPlayerStatusLoading(false);
    }
  }, []);

  // Haalt de spelersstatus eenmalig op bij het laden van de app, los van de actieve tab — net als de
  // watch list hierboven al eager geladen wordt.
  useEffect(() => {
    let ignore = false;
    (async () => {
      await fetchPlayerStatuses();
      if (ignore) return;
    })();
    return () => { ignore = true; };
  }, [fetchPlayerStatuses]);

  const playerStatusCounts = useMemo(() => ({
    out: playerStatuses.filter(p => p.status === 'Out').length,
    twijfel: playerStatuses.filter(p => p.status === 'Twijfel').length,
    terugBeschikbaar: playerStatuses.filter(p => p.status === 'Terug Beschikbaar').length,
  }), [playerStatuses]);

  const visiblePlayerStatuses = useMemo(() => {
    const search = playerSearch.trim().toLowerCase();
    return playerStatuses
      .filter(p => PLAYER_STATUS_ORDER.includes(p.status))
      .filter(p => playerStatusFilter === 'all' || p.status === playerStatusFilter)
      .filter(p => !search || p.name.toLowerCase().includes(search))
      .sort((a, b) => PLAYER_STATUS_ORDER.indexOf(a.status) - PLAYER_STATUS_ORDER.indexOf(b.status));
  }, [playerStatuses, playerStatusFilter, playerSearch]);

  const mostRecentUpdate = useMemo(() => findMostRecentUpdate(playerStatuses), [playerStatuses]);

  const togglePlayerExpanded = useCallback((id) => {
    setExpandedPlayers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleAddWatchlistPlayer = (e) => {
    e.preventDefault();
    const name = newPlayerName.trim();
    if (!name || !newPlayerTeam) return; // extra guard naast de native 'required' velden
    const parsedPrice = newPlayerPrice.trim() === '' ? null : Number(newPlayerPrice);
    setWatchlist(prev => [
      ...prev,
      { id: createWatchlistId(), name, teamCode: newPlayerTeam, price: Number.isFinite(parsedPrice) ? parsedPrice : null },
    ]);
    setNewPlayerName('');
    setNewPlayerTeam('');
    setNewPlayerPrice('');
  };

  const handleRemoveWatchlistPlayer = (id) => {
    setWatchlist(prev => prev.filter(p => p.id !== id));
  };

  return (
    <div style={{ minHeight: '100vh', background: '#2A1440', fontFamily: "'Archivo', 'Arial Black', sans-serif", position: 'relative' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        html, body { background: #2A1440; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; }
        .fdr-title { font-family: 'Archivo', sans-serif; }
        .fdr-cell { transition: transform 0.12s ease; }
        input[type=range] { accent-color: #4ECDC4; }
        .fdr-postponed-tooltip {
          position: fixed;
          z-index: 45;
          background: #3D1E5C;
          color: #EDE4F5;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 8px 10px;
          font-family: 'Inter', sans-serif;
          font-size: 11px;
          font-weight: 500;
          line-height: 1.4;
          width: max-content;
          max-width: 200px;
          text-align: left;
          box-shadow: 0 8px 20px rgba(0,0,0,0.4);
          pointer-events: none;
        }
        .fdr-postponed-tooltip::after {
          content: '';
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          border: 5px solid transparent;
        }
        .fdr-postponed-tooltip--top::after { top: 100%; border-top-color: #3D1E5C; }
        .fdr-postponed-tooltip--bottom::after { bottom: 100%; border-bottom-color: #3D1E5C; }
        .fdr-maybe-postponed-marker {
          position: absolute;
          /* em-relatief i.p.v. vaste px: schaalt automatisch mee met de font-size van de omliggende
             cel/badge (12px hoofdtabel vs 10px in "Beste fixture runs"/watch list mini-fixtures). */
          top: -0.2em;
          right: -0.5em;
          font-size: 0.9em;
          font-weight: 900;
          line-height: 1;
          color: inherit;
          pointer-events: none;
        }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #4ECDC4; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: #3D1E5C; }
        .fdr-tabs { scrollbar-width: none; -ms-overflow-style: none; }
        .fdr-tabs::-webkit-scrollbar { display: none; }
        .fdr-footer-link {
          color: inherit;
          text-decoration: underline;
          text-underline-offset: 2px;
          transition: color 0.15s ease;
        }
        .fdr-footer-link:hover, .fdr-footer-link:focus-visible {
          color: #C9B8E0;
        }
        .fdr-footer-link img {
          vertical-align: -4px;
          margin-right: 3px;
          opacity: 0.8;
          transition: opacity 0.15s ease;
        }
        .fdr-footer-link:hover img, .fdr-footer-link:focus-visible img {
          opacity: 1;
        }
        .fpl-toolbar-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          margin-left: auto;
        }
        .fpl-toolbar-secondary {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .fdr-btn-label-short { display: none; }
        .fdr-spin { animation: fdr-spin 0.8s linear infinite; }
        @keyframes fdr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fdr-tab-btn {
          background: none; border: none; cursor: pointer;
          padding: 10px 18px; font-size: 14px; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.03em;
          margin-bottom: -1px; transition: color 0.15s ease, border-color 0.15s ease;
          flex-shrink: 0; white-space: nowrap;
        }
        @media (max-width: 640px) {
          .fdr-tab-btn {
            font-size: 12px !important;
            padding: 8px 12px !important;
          }
          .fdr-section-title {
            font-size: 14px !important;
            gap: 6px !important;
          }
          .fpl-toolbar {
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .fpl-toolbar-actions {
            margin-left: 0 !important;
            width: 100% !important;
            flex-direction: row !important;
            align-items: center !important;
            gap: 8px !important;
          }
          .fpl-toolbar-secondary {
            flex: 1 !important;
            min-width: 0 !important;
            display: grid !important;
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .fdr-toolbar-btn {
            width: 100% !important;
          }
          .fpl-toolbar-secondary .fdr-toolbar-btn {
            padding: 8px 6px !important;
            font-size: 12px !important;
            gap: 4px !important;
            white-space: nowrap !important;
          }
          .fpl-toolbar-secondary .fdr-toolbar-btn svg {
            width: 13px !important;
            height: 13px !important;
          }
          .fpl-toolbar-secondary .fdr-btn-label-full {
            display: none !important;
          }
          .fpl-toolbar-secondary .fdr-btn-label-short {
            display: inline !important;
          }
          .fdr-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
          .fdr-header img {
            margin-top: 0 !important;
          }
          .fdr-content {
            padding-top: 16px !important;
          }
          /* auto-fill met een minmax van 150px valt op smalle telefoons (<360px) terug op 1 kolom.
             Forceer hier altijd exact 2 kolommen zodat de 18 sliders per 2 naast elkaar staan. */
          .fdr-sliders-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          /* De rij moet altijd op 1 regel blijven passen, ongeacht het aantal badges — vandaar nowrap +
             white-space:nowrap i.p.v. laten wrappen. De watch list heeft altijd 5 fixtures en gebruikt
             hiervoor de standaard (grotere, beter leesbare) maat hieronder. "Beste fixture runs" heeft
             een instelbare GW-range (tot 8 wedstrijden) en krijgt de --compact-modifier zodra er meer
             dan 6 in de rij staan, want dan past de standaardmaat niet meer op 1 regel. */
          .fdr-mini-fixture-row {
            flex-wrap: nowrap !important;
            justify-content: center !important;
          }
          .fdr-mini-fixture-row > span {
            white-space: nowrap !important;
          }
          .fdr-mini-fixture-row > .fdr-dgw-badge > span {
            white-space: nowrap !important;
          }

          /* Standaardmaat (t/m 6 fixtures in de rij). */
          .fdr-mini-fixture-row {
            gap: 4px !important;
            min-height: 25px;
          }
          .fdr-mini-fixture-row > span {
            font-size: 9px !important;
            padding: 2px 4px !important;
          }
          /* De "/"-postponed-badge heeft van zichzelf maar 1 karakter, dus zonder ingrijpen is hij veel
             smaller dan een normale "XXX (Y)"-badge. Minimum-breedte zodat alle badges in de rij even
             groot ogen. */
          .fdr-mini-fixture-row > .fdr-postponed-mini {
            min-width: 26px;
          }
          /* DGW-badge is een layout-wrapper zonder eigen achtergrond — de padding zit op de losse
             leg-spans erbinnen, dus reset de wrapper zelf terug naar 0. De legs zelf krijgen een extra
             krappe regelhoogte, zodat de DGW-badge zo min mogelijk hoger is dan een normale (enkele-
             regel) badge in deze rij — anders wordt de kaart van dat team hoger dan die van de andere. */
          .fdr-mini-fixture-row > .fdr-dgw-badge {
            padding: 0 !important;
          }
          .fdr-mini-fixture-row > .fdr-dgw-badge > span {
            font-size: 9px !important;
            padding: 1px 4px !important;
            line-height: 1.15 !important;
          }

          /* Compacte maat (>6 fixtures) — moet nog altijd op 1 regel passen, dus kleiner dan hierboven.
             Gecombineerde selector (2 klassen) i.p.v. op brondvolgorde vertrouwen voor de override. */
          .fdr-mini-fixture-row.fdr-mini-fixture-row--compact {
            gap: 2px !important;
            min-height: 22px;
          }
          .fdr-mini-fixture-row.fdr-mini-fixture-row--compact > span {
            font-size: 8px !important;
            padding: 1px 3px !important;
          }
          .fdr-mini-fixture-row.fdr-mini-fixture-row--compact > .fdr-postponed-mini {
            min-width: 22px;
          }
          .fdr-mini-fixture-row.fdr-mini-fixture-row--compact > .fdr-dgw-badge > span {
            font-size: 8px !important;
            padding: 1px 3px !important;
            line-height: 1.05 !important;
          }

          /* Spelerstatus-tab: rijhoofding en filters mogen op smalle schermen wat compacter/anders
             wrappen dan op desktop. */
          .fdr-playerstatus-row {
            padding: 8px 10px !important;
            gap: 8px !important;
          }
          .fdr-playerstatus-filters {
            flex-direction: column !important;
            align-items: stretch !important;
          }
          .fdr-playerstatus-search-row {
            flex: none !important;
            width: 100% !important;
          }
        }

      `}</style>

      {/* Stippenpatroon dat radiaal uitdooft vanuit de linkerbovenhoek: de mask is een cirkel met vaste
          straal rond die hoek (i.p.v. een percentage, zodat de vorm van de fade niet verandert met de
          breedte van het scherm) — hoe verder een stip van de hoek af staat, hoe transparanter hij wordt,
          tot volledig onzichtbaar op de rand van de cirkel. */}
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '600px',
        backgroundImage: 'radial-gradient(#4ECDC4 1.5px, transparent 1.5px)',
        backgroundSize: '18px 18px', opacity: 0.25,
        maskImage: 'radial-gradient(circle 550px at top left, black 0%, black 15%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(circle 550px at top left, black 0%, black 15%, transparent 100%)',
        pointerEvents: 'none'
      }} />

      <div className="fdr-content" style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 32px', position: 'relative' }}>

        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <header className="fdr-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <img
              src="/app-icon-mark.png"
              alt=""
              style={{ width: '44px', height: '44px', borderRadius: '2px', flexShrink: 0, marginTop: '-36px'}}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div>
              <h1 className="fdr-title" style={{
                color: '#FFFFFF', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1.05, margin: 0, letterSpacing: '-0.01em'
              }}>
                FPL Pro League <span style={{ color: '#4ECDC4' }}>Tools</span>
              </h1>
              <p style={{ color: '#C9B8E0', fontSize: '15px', marginTop: '6px', maxWidth: '640px' }}>
                {t.subtitle}
              </p>
            </div>
          </header>
          {/* NL/EN-taaltoggle — bewust een aparte flex-sibling van .fdr-header (niet erin genest),
              zodat hij altijd rechtsboven blijft staan ook al klapt .fdr-header op mobiel om naar een
              kolom (icoon boven titel). */}
          <div className="fdr-lang-toggle" style={{
            display: 'flex', flexShrink: 0, gap: '2px', background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '999px', padding: '3px'
          }}>
            {['nl', 'en'].map(lng => (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                aria-pressed={language === lng}
                style={{
                  background: language === lng ? '#4ECDC4' : 'transparent',
                  color: language === lng ? '#0B2E1B' : '#C9B8E0',
                  border: 'none', borderRadius: '999px', padding: '4px 10px',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase'
                }}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: "-18px",
          marginBottom: '10px', padding: '8px 8px 8px 14px', width: 'fit-content',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px'
        }}>
          <span style={{ color: '#8F79AD', fontSize: '12px' }}>
            Minileague Code: <strong style={{ color: '#4ECDC4', fontWeight: 700, letterSpacing: '0.05em' }}>{MINILEAGUE_CODE}</strong>
          </span>
          <button onClick={handleCopyMinileagueCode} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            background: 'transparent', color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px', padding: '5px 10px', fontWeight: 700, fontSize: '12px', cursor: 'pointer'
          }}>
            {minileagueCodeCopied ? <Check size={13} /> : <Copy size={13} />}
            {minileagueCodeCopied ? 'Gekopieerd!' : 'Kopieer'}
          </button>
        </div>

        <div className="fdr-tabs" style={{
          display: 'flex', gap: '4px', marginBottom: '18px', borderBottom: '1px solid rgba(255,255,255,0.08)',
          overflowX: 'auto', flexWrap: 'nowrap'
        }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="fdr-title fdr-tab-btn"
                aria-current={isActive ? 'page' : undefined}
                style={{
                  color: isActive ? '#4ECDC4' : '#C9B8E0',
                  borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent'
                }}
              >
                {tab.key === 'playerstatus' ? t.tabPlayerStatus : tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'fdr' && (
        <>
        <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '18px' }}>
          {t.fdrIntro}
        </p>
        <div className="fpl-toolbar" style={{
          display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center',
          marginBottom: '24px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px'
        }}>
          <span className="fdr-status-badge" style={{
            fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
            background: isCustom ? '#4ECDC4' : 'rgba(255,255,255,0.1)',
            color: isCustom ? '#0B2E1B' : '#C9B8E0'
          }}>
            {isCustom ? t.customVersionBadge : t.defaultRatingBadge}
          </span>
          <div className="fpl-toolbar-actions">
          <span className="fpl-toolbar-secondary">
          <button onClick={handleCopyLink} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
            {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
            <span className="fdr-btn-label-full">{linkCopied ? t.linkCopiedFull : t.copyLinkFull}</span>
            <span className="fdr-btn-label-short">{linkCopied ? t.linkCopiedShort : t.copyLinkShort}</span>
          </button>
          <button onClick={handleDownloadImage} disabled={downloading} className="fdr-toolbar-btn" style={{
            ...secondaryToolbarBtnStyle,
            cursor: downloading ? 'default' : 'pointer',
            opacity: downloading ? 0.6 : 1
          }}>
            <Download size={14} />
            <span className="fdr-btn-label-full">{downloading ? t.loadingEllipsis : t.downloadFull}</span>
            <span className="fdr-btn-label-short">{downloading ? t.loadingEllipsis : t.downloadShort}</span>
          </button>
          <button onClick={handleReset} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
            <RotateCcw size={14} />
            <span className="fdr-btn-label-full">Reset FDR</span>
            <span className="fdr-btn-label-short">Reset</span>
          </button>
          <button onClick={handleSave} className="fdr-toolbar-btn" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#4ECDC4', color: '#0B2E1B',
            border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px',
            cursor: 'pointer'
          }}>
            <Check size={14} />
            <span className="fdr-btn-label-full">{saved ? t.savedFull : t.saveFull}</span>
            <span className="fdr-btn-label-short">{saved ? t.savedShort : t.saveShort}</span>
          </button>
          </span>
          <button onClick={() => setShowInfo(true)} aria-label="Uitleg" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
            background: 'transparent', color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', cursor: 'pointer', flexShrink: 0
          }}>
            <Info size={16} />
          </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>

          <section>
            <SectionHeader icon={Settings2} title={t.sectionSliders} sectionKey="sliders" isOpen={openSections.sliders} onToggle={toggleSection} />
            {openSections.sliders && (
            <div className="fdr-sliders-grid" style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '8px'
            }}>
              {TEAMS_ALPHA.map(team => {
                const r = ratings[team.code];
                const style = RATING_STYLE[r];
                const homeAdvantageOn = !!homeAdvantage[team.code];
                return (
                  <div key={team.code} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '10px', padding: '8px 10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img
                          src={`/club-logos/${team.code}.png`}
                          alt=""
                          className="club-logo"
                          style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 600 }}>{team.code}</span>
                      </span>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
                        background: style.bg, color: style.text
                      }}>{r}</span>
                    </div>
                    <input
                      type="range" min={1} max={5} step={1} value={r}
                      onChange={e => updateRating(team.code, Number(e.target.value))}
                      style={{ width: '100%' }}
                      aria-label={`Sterkte ${team.name}`}
                    />
                    {/* Thuisvoordeel: losstaand van de sterkte-slider hierboven, zie getEffectiveRating. */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                      <span style={{ color: '#C9B8E0', fontSize: '10px' }}>Thuisvoordeel</span>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={homeAdvantageOn}
                        aria-label={`Thuisvoordeel ${team.name}`}
                        onClick={() => toggleHomeAdvantage(team.code)}
                        style={{
                          display: 'inline-flex', alignItems: 'center', width: '30px', height: '16px',
                          borderRadius: '999px', border: 'none', padding: '2px', cursor: 'pointer',
                          background: homeAdvantageOn ? '#4ECDC4' : 'rgba(255,255,255,0.15)',
                          justifyContent: homeAdvantageOn ? 'flex-end' : 'flex-start', transition: 'background 0.15s ease'
                        }}
                      >
                        <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#FFFFFF', display: 'block' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            )}
          </section>

          <section>
            <SectionHeader icon={Grid2x2} title="Fixture Difficulty Rating" sectionKey="table" isOpen={openSections.table} onToggle={toggleSection} />
            {openSections.table && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '8px', marginBottom: '10px'
            }}>
              <button onClick={(e) => { e.stopPropagation(); setSortByDifficulty(s => !s); }} style={{
                display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent',
                color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
              }}>
                <ArrowUpDown size={14} />
                {sortByDifficulty ? t.sortedEasiestFirst : t.sortByEasiest}
              </button>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6B5289', fontSize: '11px' }}>
                <Info size={12} />
                Tik op cellen met een * voor meer info
              </span>
            </div>
            )}
            <div ref={tableRef} id="fdr-capture-wrapper">
            <div className="fdr-table-scroll" style={{
              overflowX: 'auto', background: '#2A1440', padding: '4px',
              display: openSections.table ? 'block' : 'none'
            }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: '760px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left', color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase',
                    letterSpacing: '0.05em', padding: '6px 8px', position: 'sticky', left: 0,
                    background: '#2A1440', zIndex: 3, boxShadow: '-4px 0 0 0 #2A1440, 4px 0 0 0 #2A1440'
                  }}>Team</th>
                  {gwHeaderCells}
                </tr>
              </thead>
              <tbody>
                {displayedTeams.map(team => (
                  <tr key={team.code}>
                    <td style={{
                      color: '#FFF', fontWeight: 700, fontSize: '13px', padding: '6px 8px',
                      position: 'sticky', left: 0, background: '#2A1440', whiteSpace: 'nowrap',
                      zIndex: 3, boxShadow: '-4px 0 0 0 #2A1440, 4px 0 0 0 #2A1440'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <img
                          src={`/club-logos/${team.code}.png`}
                          alt=""
                          className="club-logo"
                          style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                        {team.code}
                      </span>
                    </td>

                    {FIXTURES[team.code].map((f, i) => {
                      const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
                        getFixtureInfo(team.code, f, i + 1, ratings, homeAdvantage);
                      return (
                        <FixtureCell
                          key={i}
                          opp={opp}
                          venue={venue}
                          isPostponed={isPostponed}
                          isPossiblyPostponed={isPossiblyPostponed}
                          bg={style?.bg}
                          textColor={style?.text}
                          postponedText={postponedText}
                          possiblyPostponedText={possiblyPostponedText}
                          isDoubleGameweek={isDoubleGameweek}
                          legs={legs}
                          stacked
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {openSections.table && (
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
              {[1,2,3,4,5].map(r => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: RATING_STYLE[r].bg, display: 'inline-block' }} />
                  <span style={{ color: '#C9B8E0', fontSize: '11px' }}>{t.ratingLabels[r]}</span>
                </div>
              ))}
            </div>
            )}
            </div>
          </section>

          <section>
            <SectionHeader icon={TrendingUp} title={t.sectionRuns} sectionKey="runs" isOpen={openSections.runs} onToggle={toggleSection} />
            {openSections.runs && (
            <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <label style={{ color: '#C9B8E0', fontSize: '12px' }}>GW</label>
              <select value={rangeStart} onChange={e => setRangeStart(Number(e.target.value))} style={selectStyle}>
                {gwOptionElements}
              </select>
              <span style={{ color: '#C9B8E0', fontSize: '12px' }}>t/m</span>
              <select value={rangeEnd} onChange={e => setRangeEnd(Number(e.target.value))} style={selectStyle}>
                {gwOptionElements}
              </select>
            </div>
            <div style={{ display: 'grid', gap: '8px' }}>
              {bestRuns.map((team, idx) => (
                <div key={team.code} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="fdr-title" style={{
                      color: idx === 0 ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '18px', width: '24px', flexShrink: 0
                    }}>{idx + 1}</span>
                    <img
                      src={`/club-logos/${team.code}.png`}
                      alt=""
                      className="club-logo"
                      style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div style={{ minWidth: '130px' }}>
                      <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px' }}>{team.name}</div>
                      <div style={{ color: '#8F79AD', fontSize: '11px' }}>Gem. moeilijkheid: {team.avg.toFixed(1)}</div>
                    </div>
                  </div>
                  <div
                    className={`fdr-mini-fixture-row${team.fixtures.length > 6 ? ' fdr-mini-fixture-row--compact' : ''}`}
                    style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '12px' }}
                  >
                    {team.fixtures.map((f, i) => (
                      <MiniFixtureBadge
                        key={i}
                        teamCode={team.code}
                        fixture={f}
                        gwNumber={team.startGW + i}
                        ratings={ratings}
                        homeAdvantage={homeAdvantage}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            </>
            )}
          </section>

          {/* COMPARE TEAMS */}
          <section>
            <SectionHeader icon={Scale} title={t.sectionCompare} sectionKey="compare" isOpen={openSections.compare} onToggle={toggleSection} />
            {openSections.compare && (
            <>
            <p style={{ color: '#8F79AD', fontSize: '12px', marginBottom: '10px' }}>
              {t.compareIntro}
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '6px', marginBottom: '16px'
            }}>
              {TEAMS_ALPHA.map(team => {
                const selected = compareTeams.includes(team.code);
                const disabled = !selected && compareTeams.length >= 5;
                return (
                  <button key={team.code} onClick={() => toggleCompareTeam(team.code)} disabled={disabled} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    background: selected ? '#4ECDC4' : 'rgba(255,255,255,0.04)',
                    color: selected ? '#0B2E1B' : disabled ? '#5A4A72' : '#FFF',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                    padding: '6px 4px', fontSize: '12px', fontWeight: 700,
                    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
                  }}>
                    <img
                      src={`/club-logos/${team.code}.png`}
                      alt=""
                      className="club-logo"
                      style={{ width: '14px', height: '14px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {team.code}
                  </button>
                );
              })}
            </div>
            {compareTeams.length === 0 && (
              <p style={{ color: '#6B5289', fontSize: '13px' }}>{t.noTeamsSelected}</p>
            )}
            {compareTeams.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: '600px', width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 8px' }}>Team</th>
                      {gwHeaderCells}
                    </tr>
                  </thead>
                  <tbody>
                    {compareTeams.map(code => {
                      const team = TEAMS.find(t => t.code === code);
                      return (
                        <tr key={code}>
                          <td style={{ color: '#FFF', fontWeight: 700, fontSize: '13px', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <img
                                src={`/club-logos/${team.code}.png`}
                                alt=""
                                className="club-logo"
                                style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                              {team.code}
                            </span>
                          </td>
                          {FIXTURES[code].map((f, i) => {
                            const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
                              getFixtureInfo(code, f, i + 1, ratings, homeAdvantage);
                            return (
                              <FixtureCell
                                key={i}
                                opp={opp}
                                venue={venue}
                                isPostponed={isPostponed}
                                isPossiblyPostponed={isPossiblyPostponed}
                                bg={style?.bg}
                                textColor={style?.text}
                                postponedText={postponedText}
                                possiblyPostponedText={possiblyPostponedText}
                                isDoubleGameweek={isDoubleGameweek}
                                legs={legs}
                              />
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            </>
            )}
          </section>
        </div>
        </>
        )}

        {activeTab === 'watchlist' && (
          <>
          <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
            {t.watchlistIntro}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
            <section>
              <div style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '16px', marginBottom: '20px'
              }}>
              <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
                <UserPlus size={18} color="#4ECDC4" /> {t.watchlistFormTitle}
              </h2>
              <form onSubmit={handleAddWatchlistPlayer} style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end'
              }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px'}}>{t.nameLabel}</span>
                  <input
                    type="text" required value={newPlayerName}
                    onChange={e => setNewPlayerName(e.target.value)}
                    placeholder={t.namePlaceholder}
                    style={watchlistInputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>{t.teamLabel}</span>
                  <select required value={newPlayerTeam} onChange={e => setNewPlayerTeam(e.target.value)} style={watchlistInputStyle}>
                    <option value="" disabled>{t.chooseTeam}</option>
                    {TEAMS_ALPHA.map(team => (
                      <option key={team.code} value={team.code}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>{t.priceLabel}</span>
                  <input
                    type="number" inputMode="decimal" step="0.1" min="0" max="12" placeholder={t.pricePlaceholder}
                    value={newPlayerPrice} onChange={e => setNewPlayerPrice(e.target.value)}
                    style={watchlistInputStyle}
                  />
                </label>
                <button type="submit" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: '#4ECDC4', color: '#0B2E1B', border: 'none', borderRadius: '8px',
                  padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                }}>
                  <Plus size={18} /> {t.addButton}
                </button>
              </form>
              </div>
            </section>

            <section>
              <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
                <Eye size={18} color="#4ECDC4" /> {t.myWatchlistTitle}
              </h2>
              {watchlist.length === 0 ? (
                <p style={{ color: '#6B5289', fontSize: '13px' }}>
                  {t.watchlistEmpty}
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '8px' }}>
                  {watchlist.map(player => {
                    const team = TEAMS.find(t => t.code === player.teamCode);
                    // Eerstvolgende (max. 5) fixtures vanaf CURRENT_GW — .slice() geeft vanzelf minder
                    // terug als het seizoen bijna afloopt, dus geen aparte "resterende fixtures"-logica nodig.
                    const upcomingFixtures = (FIXTURES[player.teamCode] ?? []).slice(CURRENT_GW - 1, CURRENT_GW - 1 + 5);
                    return (
                      <div key={player.id} style={{
                        position: 'relative', background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px'
                      }}>
                        <button
                          onClick={() => handleRemoveWatchlistPlayer(player.id)}
                          aria-label={`Verwijder ${player.name}`}
                          style={{
                            position: 'absolute', top: '6px', right: '6px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px',
                            background: 'transparent', color: '#8F79AD', border: 'none', borderRadius: '6px', cursor: 'pointer'
                          }}
                        >
                          <X size={14} />
                        </button>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '24px' }}>
                          <img
                            src={`/club-logos/${player.teamCode}.png`}
                            alt=""
                            className="club-logo"
                            style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px', lineHeight: 1.25 }}>{player.name}</div>
                            <div style={{ color: '#8F79AD', fontSize: '11px', marginTop: '1px' }}>{team?.name ?? player.teamCode}</div>
                          </div>
                          {player.price != null && (
                            <span style={{
                              fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px',
                              background: 'rgba(255,255,255,0.1)', color: '#4ECDC4', flexShrink: 0
                            }}>{player.price}M</span>
                          )}
                        </div>
                        <div className="fdr-mini-fixture-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '8px' }}>
                          {upcomingFixtures.map((fixture, idx) => (
                            <MiniFixtureBadge
                              key={idx}
                              teamCode={player.teamCode}
                              fixture={fixture}
                              gwNumber={CURRENT_GW + idx}
                              ratings={ratings}
                              homeAdvantage={homeAdvantage}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
          </>
        )}

        {activeTab === 'playerstatus' && (
          <div style={{ marginTop: '20px' }}>
            <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
              {t.playerStatusIntro}
            </p>

            {playerStatusLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px' }}>
                <Loader2 size={16} className="fdr-spin" /> Spelersstatus laden...
              </div>
            )}

            {!playerStatusLoading && playerStatusError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
                borderRadius: '10px', padding: '12px 14px'
              }}>
                <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
                <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{playerStatusError}</span>
                <button onClick={fetchPlayerStatuses} style={secondaryToolbarBtnStyle}>
                  <RotateCcw size={14} /> Probeer opnieuw
                </button>
              </div>
            )}

            {!playerStatusLoading && !playerStatusError && (
              <>
                {mostRecentUpdate && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#C9B8E0', fontSize: '12px', marginBottom: '10px' }}>
                    <Clock size={14} />
                    {t.lastUpdatedLabel}: {mostRecentUpdate.lastUpdateDate ? formatDateDDMMYYYY(mostRecentUpdate.lastUpdateDate) : mostRecentUpdate.lastUpdate}
                  </span>
                )}

                <div className="fdr-playerstatus-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                  <div className="fdr-playerstatus-search-row" style={{
                    display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 200px', minWidth: '160px'
                  }}>
                    <label style={{ position: 'relative', flex: 1 }}>
                      <Search size={14} color="#8F79AD" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                      <input
                        type="text"
                        value={playerSearch}
                        onChange={e => setPlayerSearch(e.target.value)}
                        placeholder={t.searchPlaceholder}
                        style={{
                          width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                          padding: '8px 10px 8px 32px', color: '#FFFFFF', fontSize: '13px'
                        }}
                      />
                    </label>
                    <button
                      onClick={fetchPlayerStatuses}
                      aria-label="Vernieuwen"
                      title="Vernieuwen"
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px', flexShrink: 0,
                        background: 'transparent', color: '#8F79AD', border: '1px solid rgba(255,255,255,0.15)',
                        borderRadius: '8px', cursor: 'pointer'
                      }}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {[
                      { key: 'all', label: `${t.filterAll} (${playerStatusCounts.out + playerStatusCounts.twijfel + playerStatusCounts.terugBeschikbaar})` },
                      { key: 'Out', label: `🔴 ${translateStatus('Out', language)} (${playerStatusCounts.out})` },
                      { key: 'Twijfel', label: `🟡 ${translateStatus('Twijfel', language)} (${playerStatusCounts.twijfel})` },
                      { key: 'Terug Beschikbaar', label: `🟢 ${translateStatus('Terug Beschikbaar', language)} (${playerStatusCounts.terugBeschikbaar})` },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setPlayerStatusFilter(opt.key)}
                        style={{
                          background: playerStatusFilter === opt.key ? '#4ECDC4' : 'transparent',
                          color: playerStatusFilter === opt.key ? '#0B2E1B' : '#C9B8E0',
                          border: '1px solid rgba(255,255,255,0.2)', borderRadius: '999px',
                          padding: '6px 12px', fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {visiblePlayerStatuses.length === 0 ? (
                  <p style={{ color: '#6B5289', fontSize: '13px' }}>
                    {playerStatuses.filter(p => PLAYER_STATUS_ORDER.includes(p.status)).length === 0
                      ? t.playerStatusEmptyNone
                      : t.playerStatusEmptyFiltered}
                  </p>
                ) : (
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {visiblePlayerStatuses.map(player => (
                      <PlayerStatusRow
                        key={player.id}
                        player={player}
                        isExpanded={expandedPlayers.has(player.id)}
                        onToggle={togglePlayerExpanded}
                        language={language}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {activeTab === 'teamplanner' && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '16px'
            }}>
              <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
                Hier kan je binnenkort je teamopstelling en transfers vooruit plannen.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'pricechanges' && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '16px'
            }}>
              <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
                Hier worden binnenkort alle prijswijzigingen gedocumenteerd.
              </p>
            </div>
          </div>
        )}

        <footer style={{ marginTop: '28px', textAlign: 'center', color: '#6B5289', fontSize: '12px', lineHeight: 1.5 }}>
          {t.footerMadeBy}{' '}
          <a href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer" className="fdr-footer-link">
            <img src="/x-logo.png" alt="" style={{ width: '12px', height: '12px', verticalAlign:'-2px' }} />
            @fpl_proleague
          </a>
          {' '}{t.footerSuffix}<br />
          {t.lastUpdatedLabel}: {LAST_UPDATED}
        </footer>
      </div>

      {showInfo && (
        <div onClick={() => setShowInfo(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 50
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#3D1E5C', borderRadius: '14px', padding: '24px', maxWidth: '440px',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
              <h3 className="fdr-title" style={{ color: '#4ECDC4', fontSize: '16px', margin: 0, textTransform: 'uppercase' }}>Hoe werkt dit?</h3>
              <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6 }}>
              De kleur van elke fixture komt van de <strong>sterkte-rating van de tegenstander</strong> (1 = makkelijkst, 5 = moeilijkst). Sleep de sliders om een team sterker of zwakker in te schatten. Bij de berekening van fixture runs tellen Blank Gameweeks als 5 (moeilijkst) en Double Gameweeks als 1 (makkelijkst).
            </p>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6, marginTop: '8px' }}>
              <strong>"Bewaar in browser"</strong> onthoudt jouw versie op dit toestel voor de volgende keer. <strong>"Beste fixture runs"</strong> toont de 5 teams met de laagste gemiddelde moeilijkheid over de gekozen periode.
            </p>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6, marginTop: '8px' }}>
              <strong>Thuisvoordeel</strong> is een aparte toggle per team: zet je hem aan voor een team, dan wordt de moeilijkheidsgraad met 1 verhoogd (tot maximum 5) voor elk team dat bij hen op verplaatsing speelt. Handig omdat sommige teams nu eenmaal moeilijker te verslaan zijn op hun eigen veld.
            </p>
          </div>
        </div>
      )}

      {showHomeAdvantageIntro && (
        <div role="status" style={{
          position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)',
          zIndex: 60, width: 'calc(100% - 40px)', maxWidth: '320px',
          display: 'flex', alignItems: 'flex-start', gap: '10px',
          background: '#3D1E5C', color: '#EDE4F5', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px', padding: '12px 14px', boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          fontFamily: "'Inter', sans-serif"
        }}>
          <Info size={16} color="#4ECDC4" style={{ flexShrink: 0, marginTop: '2px' }} />
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, flex: 1 }}>
            <strong style={{ color: '#FFFFFF' }}>Thuisvoordeel</strong> verhoogt de moeilijkheidsgraad met 1 voor teams die hier op bezoek komen.
          </p>
          <button
            onClick={() => setShowHomeAdvantageIntro(false)}
            aria-label="Sluiten"
            style={{ background: 'transparent', border: 'none', color: '#C9B8E0', cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
