// Hoofdbestand van de FDR-tool: pagina-chrome (header, minileague-code, tab-navigatie, footer, info-
// modal, Thuisvoordeel-toast) en alle gedeelde/persistente state die de tabs nodig hebben (ratings,
// homeAdvantage, watchlist, ...). De tab-specifieke content zelf zit in src/tabs/*.jsx en ontvangt
// die state + handlers als props — geen lokale state daar, want die tabs worden conditioneel
// gemount/unmount bij het wisselen van tab.

import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { Info, X, Check, Copy, Undo2, Loader2, ChevronDown, Grid2x2, Users, Shirt } from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT, CURRENT_GW, DEFAULT_GW_HORIZON_END, MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS,
  MINILEAGUE_CODE, formatLastUpdatedLong, GW_INDEXES, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE,
  TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_SLOT_POSITIONS, VALID_FORMATIONS,
  resolveSlotPlayerAtGw, PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv, getFixtureScores, average,
  POSTPONED, computeTeamPlannerTransferBudget, getGwDeadlineDate,
} from './constants';
import { SET_PIECES_CSV_URL } from './constants';
import { parseSetPiecesCsv } from './setPieces';
import { COLORS } from './theme';
import {
  ROUTES, routeKeyFromPath, urlForRoute, pathForRoute, languageFromPath, SUPPORTED_LANGUAGES,
  pathForSheet, sheetFromPath, playerSlug,
} from './routes';
import { t as translate, LANGUAGES, DEFAULT_LANGUAGE } from './i18n';
import { PREDICTED_LINEUPS } from './predictedLineupsData';
import FDRTab from './tabs/FDRTab';

// Enkel de FDR-tab (de standaardweergave) zit in de hoofdbundle. De andere tabs worden pas
// opgehaald wanneer iemand er effectief naartoe navigeert.
//
// Waarom dit uitmaakt: PredictedLineupsTab trekt via PitchField de volledige veld-renderer én
// html2canvas mee — samen goed voor ~372 kB. Die stond vroeger als `modulepreload` in index.html,
// dus élke bezoeker downloadde dat vóór de pagina bruikbaar was, ook wie enkel de FDR-tabel kwam
// bekijken. Voor een tool die vaak vlak vóór de deadline op mobiele data geopend wordt, is dat
// precies de verkeerde afweging.
// Eigen chunk: de sheet wordt vanuit meerdere lazy tabs gebruikt, dus zonder aparte lazy-import
// zou hij in de hoofdbundel belanden en de FDR-tab (die 'm niet nodig heeft) mee laten groeien.
const PlayerSheet = lazy(() => import('./components/PlayerSheet'));
const ClubSheet = lazy(() => import('./components/ClubSheet'));
const WatchlistTab = lazy(() => import('./tabs/WatchlistTab'));
const TeamPlannerTab = lazy(() => import('./tabs/TeamPlannerTab'));
const PredictedLineupsTab = lazy(() => import('./tabs/PredictedLineupsTab'));
const BonuspuntenTab = lazy(() => import('./tabs/BonuspuntenTab'));
const KaartenTab = lazy(() => import('./tabs/KaartenTab'));
const SetPiecesTab = lazy(() => import('./tabs/SetPiecesTab'));

// Tab-navigatie bovenaan de pagina. De lijst zelf (labels, paden, per-tab titel/omschrijving) staat
// in src/routes.js, zodat de URL-afhandeling en de zichtbare tabs nooit uit elkaar kunnen lopen.
const TABS = ROUTES;

// De tabs die de spelersdatabank-CSV effectief nodig hebben (zie de fetch-useEffect verderop). De
// FDR-tab staat er bewust niet bij: die rendert volledig uit constants.js.
const PLAYER_DATABASE_TABS = new Set(['watchlist', 'teamplanner', 'bonuspunten', 'kaarten']);

// Eén plek voor de canonieke oorsprong van de site; stond eerder als letterlijke string in de
// title/canonical-useEffect en moet nu ook door de hreflang-alternates gebruikt worden.
const SITE_ORIGIN = 'https://fplproleague.vercel.app';

// Op mobiel (zie .fdr-tabs-mobile) blijven enkel de eerste MOBILE_PRIMARY_TAB_COUNT tabs los
// zichtbaar (elk zijn eigen kolom in een grid, zie .fdr-tab-btn-mobile-primary); de rest komt in het
// "Meer"-menu (de laatste kolom). 3 is de grens: "FDR" + "Team Planner" + "Verwachte XI's" + "Meer"
// zijn dan 4 gelijke kolommen. Volledige tab-labels bleken daar op een telefoon niet in te passen
// (zelfs verkort en met 2 regels tekst brak "Verwachte" nog middenin het woord af) — vandaar het
// icoon+kort-label-patroon hieronder i.p.v. de volledige nav.*-tekst, hetzelfde compacte patroon als
// een bottom-nav-bar in een native app.
const MOBILE_PRIMARY_TAB_COUNT = 3;
const MOBILE_PRIMARY_TABS = TABS.slice(0, MOBILE_PRIMARY_TAB_COUNT);
const MOBILE_OVERFLOW_TABS = TABS.slice(MOBILE_PRIMARY_TAB_COUNT);

// Icoon per vaste mobiele tab (zie MOBILE_PRIMARY_TABS) — enkel voor deze 3, dus geen aparte
// ROUTES-kolom nodig; Grid2x2/Users/Shirt hergebruiken bewust dezelfde iconen als de sectietitel
// "Fixture Difficulty Rating" (FDRTab.jsx) / "Mijn selectie" (TeamPlannerTab.jsx) verderop in de site.
const MOBILE_PRIMARY_TAB_ICONS = { fdr: Grid2x2, teamplanner: Users, predictedlineups: Shirt };

// Subtiele "nieuw"-stip naast een tab-label (zie NEW_TAB_KEYS/seenNewTabs) — goud i.p.v. het teal van
// een actieve tab, zodat de twee signalen (actief vs. nieuw) nooit door elkaar lopen.
const newTabDotStyle = {
  display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%',
  background: '#E8C547', flexShrink: 0,
};

// Getoond terwijl een lui geladen tab binnenkomt. Bewust minimaal en even hoog als een gemiddelde
// sectie, zodat de pagina niet zichtbaar springt.
function TabLoading({ text }) {
  return (
    <div role="status" aria-live="polite" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
      minHeight: '240px', color: COLORS.textMuted, fontSize: '13px',
    }}>
      <Loader2 size={18} className="fdr-spin" aria-hidden="true" /> {text}
    </div>
  );
}

const STORAGE_KEY = 'fpl_proleague_fdr_ratings_v1';
const HOME_ADVANTAGE_STORAGE_KEY = 'fpl_proleague_fdr_home_advantage_v1';
// Eigen storage key voor de watch list — los van de FDR-ratings hierboven, zodat ze elkaar niet raken.
const WATCHLIST_STORAGE_KEY = 'fpl_proleague_watchlist_v1';
// Onthoudt of de first-time-uitleg over Thuisvoordeel al getoond is, zodat die maar één keer ooit verschijnt.
const HOME_ADVANTAGE_INTRO_SEEN_KEY = 'fpl_proleague_ha_intro_seen_v1';
// Eigen storage key voor de Team Planner — los van de watch list hierboven.
const TEAM_PLANNER_STORAGE_KEY = 'fpl_proleague_teamplanner_v1';
// Onthoudt de gekozen taal (NL/FR) tussen bezoeken — zie src/i18n.js.
const LANGUAGE_STORAGE_KEY = 'fpl_proleague_language_v1';

function loadStoredLanguage() {
  try {
    const raw = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGES.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

// Welke tabs een "nieuw"-stip krijgen in de tabbalk (zie NEW_TAB_KEYS-gebruik verderop) totdat de
// bezoeker ze minstens één keer heeft geopend — zelfde eenmalig-tonen-opzet als
// hasSeenHomeAdvantageIntro hierboven, maar dan per tab i.p.v. één globale vlag: een array van
// reeds-bezochte tab-keys i.p.v. een simpele '1'/geen-waarde.
const NEW_TABS_SEEN_STORAGE_KEY = 'fpl_proleague_new_tabs_seen_v1';
const NEW_TAB_KEYS = ['bonuspunten', 'setpieces', 'kaarten'];

function loadSeenNewTabs() {
  try {
    const raw = window.localStorage?.getItem(NEW_TABS_SEEN_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(key => NEW_TAB_KEYS.includes(key)) : [];
  } catch {
    return [];
  }
}

function markNewTabSeen(key, alreadySeen) {
  try {
    window.localStorage?.setItem(NEW_TABS_SEEN_STORAGE_KEY, JSON.stringify([...alreadySeen, key]));
  } catch {
    // localStorage niet beschikbaar (privénavigatie e.d.) — de stip toont dan gewoon elke keer
    // opnieuw, geen harde fout.
  }
}

// Gedeelde vaste hoogte voor de deadline- en minileague-chip in de header — beide gebruiken exact
// deze waarde (i.p.v. losse padding/lineHeight-berekeningen) zodat ze gegarandeerd even hoog zijn,
// ongeacht dat de ene chip enkel tekst bevat en de andere een geneste knop met eigen randen/padding.
const HEADER_CHIP_HEIGHT = '28px';

// GW-headers voor de hoofdtabel en de vergelijk-tabel. Blijft hier i.p.v. in constants.js: dat is een
// .js-bestand en Vite/esbuild parsen JSX-syntax enkel in .jsx-bestanden.
//
// Niet langer één statische module-constante maar een functie van de taal: het voorvoegsel stond hard
// als "GW" in de JSX, terwijl de Franse versie overal elders "J" (journée) gebruikt — de kolomkoppen
// waren daardoor het enige stuk van de Franse tabel dat Nederlands bleef. t('fdr.gwLabel') levert al
// "GW"/"J", dus dezelfde bron als de selector eronder. scope="col" + aria-label maken van elke kop
// bovendien een echte, uitgeschreven kolomkop ("Gameweek 7" i.p.v. "GW7") voor screenreaders.
// Zonder onSortGw levert dit de gewone, niet-klikbare koppen (de vergelijk-tabel heeft geen eigen
// sortering). Mét onSortGw wordt elke kop een knop die op die ene speeldag sorteert; aria-sort vertelt
// een screenreader op welke kolom de tabel op dit moment geordend staat.
// Zoekt bij een slug uit de URL de echte speler. De naam valt niet uit de slug af te leiden (accenten
// en leestekens zijn eruit), dus we slugificeren de kandidaten en vergelijken. De spelersdatabank komt
// pas na een fetch binnen; PREDICTED_LINEUPS staat meteen klaar, dus een gedeelde link opent al vóór
// die fetch. Geeft null als niets past — dan blijft gewoon de onderliggende tab staan i.p.v. een lege
// kaart te tonen voor een verzonnen URL.
function resolvePlayerSlug(slug, playerDatabase) {
  const fromDatabase = playerDatabase.find(p => playerSlug(p.name, p.teamCode) === slug);
  if (fromDatabase) return { name: fromDatabase.name, teamCode: fromDatabase.teamCode };
  for (const lineup of PREDICTED_LINEUPS) {
    for (const slot of lineup.slots) {
      if (!slot.playerName) continue;
      const teamCode = slot.playerTeamCode || lineup.clubCode;
      if (playerSlug(slot.playerName, teamCode) === slug) return { name: slot.playerName, teamCode };
    }
  }
  return null;
}

function buildGwHeaderCells(t, { sortedGw = null, onSortGw = null } = {}) {
  const prefix = t('fdr.gwLabel');
  return GW_INDEXES.map(i => {
    const gw = i + 1;
    const isSorted = sortedGw === gw;
    const baseStyle = { color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 4px', minWidth: '58px' };
    if (!onSortGw) {
      return (
        <th key={i} scope="col" aria-label={t('fdr.gwColumnAria', { gw })} style={baseStyle}>
          {prefix}{gw}
        </th>
      );
    }
    return (
      <th
        key={i}
        scope="col"
        aria-sort={isSorted ? 'ascending' : 'none'}
        style={{ ...baseStyle, padding: 0 }}
      >
        <button
          type="button"
          onClick={() => onSortGw(gw)}
          aria-label={t('fdr.sortByGwAria', { gw })}
          aria-pressed={isSorted}
          className="fdr-touch-target"
          style={{
            width: '100%', minHeight: '32px', padding: '6px 4px',
            background: isSorted ? 'rgba(78,205,196,0.15)' : 'transparent',
            color: isSorted ? '#4ECDC4' : '#C9B8E0',
            border: isSorted ? '1px solid rgba(78,205,196,0.55)' : '1px solid transparent',
            borderRadius: '6px', font: 'inherit', fontSize: '11px', fontWeight: 700,
            textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          {prefix}{gw}
        </button>
      </th>
    );
  });
}

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

// Generieke unieke id (watch-list entries, Team Planner-transfers, ...), met een eenvoudige fallback
// voor browsers zonder crypto.randomUUID.
function createUniqueId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Team Planner: vast array van TEAM_PLANNER_SQUAD_SIZE (15) "slots" i.p.v. een open add/remove-lijst
// zoals de watch list — elk slot is altijd aanwezig (leeg of ingevuld), want de positie-/budget-/
// club-validaties en de veld-weergave veronderstellen een compleet, adresseerbaar array van vaste
// lengte. Array.from-callback i.p.v. Array(15).fill({...}): anders zouden alle 15 slots dezelfde
// objectreferentie delen en zou het wijzigen van slot 1 per ongeluk alle andere slots meewijzigen.
// Bank- en kapiteinskeuze zijn GEEN veld op de speler zelf: die zijn per GW instelbaar (zie
// teamPlannerBenchByGw/teamPlannerCaptainByGw hieronder), dus een speler kan in GW1 basis zijn en in
// GW2 op de bank staan. Positie ligt wél vast per slot-index (TEAM_PLANNER_SLOT_POSITIONS) — de
// gebruiker kiest 'm niet meer zelf, dus de positie-aantallen (2 GK/5 DEF/5 MID/3 FWD) kloppen altijd.
function createEmptyTeamPlannerPlayers() {
  return Array.from({ length: TEAM_PLANNER_SQUAD_SIZE }, (_, index) => ({
    name: '', teamCode: '', position: TEAM_PLANNER_SLOT_POSITIONS[index], price: '',
  }));
}

// Eén geplande transfer, zoals opgeslagen: { id, gw, player }. `player` is de INKOMENDE speler
// ({ name, teamCode, position, price } — de echte positie uit de databank, niet per se gelijk aan de
// vaste slot-positie, want een transfer met een andere positie mag, met waarschuwing). Defensief
// gevalideerd zodat corrupte/handmatig aangepaste localStorage-data nooit crasht, enkel genegeerd wordt.
function sanitizeTransfer(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const gw = Number(raw.gw);
  if (!Number.isFinite(gw) || gw < 1) return null;
  const player = raw.player;
  if (!player || typeof player !== 'object' || !player.name) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : createUniqueId(),
    gw,
    player: {
      name: player.name ?? '', teamCode: player.teamCode ?? '',
      position: player.position ?? '', price: player.price ?? null,
    },
  };
}

// Booster-gebruik: een geheel getal 1-7 (de GW waarop 'm gebruikt is) of null (nog niet gebruikt).
// Boosters gelden enkel binnen GW1-7 (nooit GW8), zie toggleTeamPlannerBooster hieronder.
function sanitizeBoosterGw(raw) {
  const gw = Number(raw);
  return Number.isFinite(gw) && gw >= 1 && gw <= 7 ? gw : null;
}

// Leest het volledige, opgeslagen Team Planner-blok (spelers + per-GW bank/kapitein + transfer-
// tijdlijn + boosters) in één keer in, zodat de useState-initializers hieronder er stuk voor stuk uit
// kunnen putten.
function loadStoredTeamPlanner() {
  const empty = {
    players: createEmptyTeamPlannerPlayers(), benchByGw: {}, captainByGw: {}, transfersBySlot: {},
    boosters: { benchBoost: null, tripleCaptain: null, recharge: null },
  };
  try {
    const raw = window.localStorage?.getItem(TEAM_PLANNER_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    // Oudere opslag (vóór per-GW bank/kapitein, en vóór de vaste positie per slot) was gewoon het
    // spelers-array zelf, met een "isBench"-veld per speler dat nu vervallen is — dat veld wordt hier
    // stilzwijgend genegeerd. Positie wordt altijd herberekend uit de slot-index, ongeacht wat er
    // eventueel nog aan oude, handmatig gekozen positie in de opslag stond.
    const rawPlayers = Array.isArray(parsed) ? parsed : parsed?.players;
    const players = Array.isArray(rawPlayers) && rawPlayers.length === TEAM_PLANNER_SQUAD_SIZE
      ? rawPlayers.map((p, index) => ({
          name: p?.name ?? '', teamCode: p?.teamCode ?? '', position: TEAM_PLANNER_SLOT_POSITIONS[index], price: p?.price ?? '',
        }))
      : empty.players;
    const benchByGw = (!Array.isArray(parsed) && parsed?.benchByGw && typeof parsed.benchByGw === 'object') ? parsed.benchByGw : {};
    const captainByGw = (!Array.isArray(parsed) && parsed?.captainByGw && typeof parsed.captainByGw === 'object') ? parsed.captainByGw : {};
    const rawTransfersBySlot = (!Array.isArray(parsed) && parsed?.transfersBySlot && typeof parsed.transfersBySlot === 'object') ? parsed.transfersBySlot : {};
    const transfersBySlot = {};
    Object.entries(rawTransfersBySlot).forEach(([slotIndex, transfers]) => {
      if (!Array.isArray(transfers)) return;
      const sanitized = transfers.map(sanitizeTransfer).filter(Boolean);
      if (sanitized.length > 0) transfersBySlot[slotIndex] = sanitized;
    });
    const rawBoosters = (!Array.isArray(parsed) && parsed?.boosters && typeof parsed.boosters === 'object') ? parsed.boosters : {};
    const boosters = {
      benchBoost: sanitizeBoosterGw(rawBoosters.benchBoost),
      tripleCaptain: sanitizeBoosterGw(rawBoosters.tripleCaptain),
      recharge: sanitizeBoosterGw(rawBoosters.recharge),
    };
    return { players, benchByGw, captainByGw, transfersBySlot, boosters };
  } catch {
    return empty;
  }
}

// Rekent de resterende tijd tot een deadline om naar losse eenheden. null zodra de deadline voorbij
// is (of onbekend), zodat de aanroeper zelf beslist wat er dan getoond wordt.
function getTimeRemaining(deadline, now) {
  if (!deadline) return null;
  const ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(totalMinutes / 1440),
    hours: Math.floor((totalMinutes % 1440) / 60),
    minutes: totalMinutes % 60,
    totalMinutes,
  };
}

// Compacte, voorleesbare weergave: "3d 4u", "4u 12m", "12m". Bewust kort — dit staat in de header.
function formatCountdown(remaining) {
  if (!remaining) return null;
  if (remaining.days > 0) return `${remaining.days}d ${remaining.hours}u`;
  if (remaining.hours > 0) return `${remaining.hours}u ${remaining.minutes}m`;
  return `${remaining.minutes}m`;
}

export default function FDRTool() {
  // Actieve tab komt uit de URL (zie src/routes.js) i.p.v. uit losse component-state, zodat elke tool
  // een deelbare link heeft en de terugknop van de browser tussen tabs navigeert.
  const [activeTab, setActiveTab] = useState(() =>
    typeof window === 'undefined' ? 'fdr' : routeKeyFromPath(window.location.pathname)
  );

  // "Nieuw"-stip in de tabbalk voor Bonuspunten/Set Pieces/Kaarten (zie NEW_TAB_KEYS hierboven) totdat
  // een bezoeker die tab minstens één keer geopend heeft — ook via een directe link of de terug-/
  // vooruitknop, vandaar gekoppeld aan activeTab i.p.v. enkel aan een klik op de tabbalk zelf.
  const [seenNewTabs, setSeenNewTabs] = useState(() => new Set(loadSeenNewTabs()));
  useEffect(() => {
    if (!NEW_TAB_KEYS.includes(activeTab)) return;
    setSeenNewTabs(prev => {
      if (prev.has(activeTab)) return prev;
      markNewTabSeen(activeTab, prev);
      return new Set(prev).add(activeTab);
    });
  }, [activeTab]);

  // --- Taal (NL/FR) — zie src/i18n.js. Persistent (localStorage), zodat de keuze bezoek-overschrijdend
  // is; default Nederlands, de oorspronkelijke (en enige) taal vóór deze toggle. `t` is een simpele
  // curried helper zodat de rest van deze component en alle tabs gewoon t('key') kunnen aanroepen i.p.v.
  // overal translate(language, 'key') te herhalen.
  //
  // De URL gaat vóór op de opgeslagen voorkeur: wie een /fr/...-link krijgt doorgestuurd hoort die in
  // het Frans te zien, ook als hij hier ooit zelf op NL stond. Enkel wanneer de URL niets over de taal
  // zegt (alle Nederlandse paden) telt localStorage.
  const [language, setLanguage] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_LANGUAGE;
    return languageFromPath(window.location.pathname) ?? loadStoredLanguage() ?? DEFAULT_LANGUAGE;
  });
  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  // Van taal wisselen is nu een echte navigatie: /fdr <-> /fr/fdr. Dat is het hele punt van de
  // taal-URL's — zonder pushState blijft de adresbalk hetzelfde en valt er nog altijd geen Franse
  // pagina te delen of te bookmarken. De query-string blijft behouden, net als bij het wisselen van tab
  // (?r= en ?ha= dragen de aangepaste FDR-ratings).
  const changeLanguage = useCallback((next) => {
    if (!SUPPORTED_LANGUAGES.includes(next)) return;
    setLanguage(next);
    try {
      window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // storage unavailable — taalkeuze werkt nog wel deze sessie, onthoudt 'm enkel niet
    }
    if (typeof window === 'undefined') return;
    const url = urlForRoute(routeKeyFromPath(window.location.pathname), window.location.search, next);
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState({ lang: next }, '', url);
    }
  }, []);

  // Iemand met FR als opgeslagen voorkeur die op een Nederlands pad binnenkomt, krijgt de Franse
  // interface op een Nederlandse URL — inhoud en adres lopen dan uiteen. replaceState (geen pushState)
  // zet het adres recht zonder een extra stap in de terug-knop-geschiedenis en zonder netwerkverkeer.
  // Crawlers hebben geen localStorage en komen hier dus nooit terecht: de canonicals blijven onaangeroerd.
  useEffect(() => {
    if (language === DEFAULT_LANGUAGE) return;
    if (languageFromPath(window.location.pathname)) return;
    const url = urlForRoute(routeKeyFromPath(window.location.pathname), window.location.search, language);
    window.history.replaceState({ lang: language }, '', url);
    // Alleen bij het laden relevant; daarna houdt changeLanguage de URL zelf bij.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab wisselen = een echte navigatie. De query-string blijft bewust behouden: de FDR-tab codeert
  // aangepaste ratings in ?r= en thuisvoordeel in ?ha=, en die mogen niet sneuvelen bij het wisselen.
  const navigateToTab = useCallback((key) => {
    setActiveTab(key);
    if (typeof window === 'undefined') return;
    const url = urlForRoute(key, window.location.search, language);
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState({ tab: key }, '', url);
    }
  }, [language]);

  // Terug-/vooruitknop van de browser. Leest ook de taal terug uit het pad, zodat terugkeren naar een
  // /fr-URL de interface weer in het Frans zet i.p.v. een Franse URL met Nederlandse inhoud.
  //
  // Hier bewust GEEN terugval op de opgeslagen voorkeur (anders dan bij het eerste laden): tijdens
  // terug-/vooruitnavigatie is de URL de enige waarheid. Met een terugval bleef de site Frans na een
  // terugknop-stap naar een Nederlandse URL — Frans scherm, Nederlands adres, Franse canonical.
  // De opgeslagen voorkeur wordt hier ook niet overschreven: die hoort bij wat de gebruiker expliciet
  // koos met de toggle, niet bij waar de terugknop toevallig uitkomt.
  useEffect(() => {
    const handlePopState = () => {
      setActiveTab(routeKeyFromPath(window.location.pathname));
      setLanguage(languageFromPath(window.location.pathname) ?? DEFAULT_LANGUAGE);
      // De sheet hoort ook bij de geschiedenis: zonder dit blijft een spelerskaart openstaan nadat de
      // terugknop al naar de lijst eronder is teruggekeerd.
      const fromUrl = sheetFromPath(window.location.pathname);
      setSheet(fromUrl?.kind === 'club' ? fromUrl : null);
      setPendingPlayerSlug(fromUrl?.kind === 'player' ? fromUrl.slug : null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // <html lang> volgt de taalkeuze. Stond hard op "nl" in index.html, ook nadat iemand op FR was
  // overgeschakeld: een screenreader las de volledige Franse interface dan met Nederlandse uitspraak
  // voor, en zoekmachines/vertaalhulpmiddelen kregen hetzelfde verkeerde signaal.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  // Documenttitel en meta-description volgen de actieve tab, zodat een gedeelde link niet langer
  // altijd "FDR Tool" als preview toont en elke tool apart indexeerbaar is.
  useEffect(() => {
    document.title = t(`route.${activeTab}.title`);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t(`route.${activeTab}.description`));
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', `${SITE_ORIGIN}${pathForRoute(activeTab, language)}`);
    // De hreflang-alternates staan statisch in de gegenereerde HTML (zie scripts/build-routes.mjs),
    // maar wijzen dan nog naar de route waarop de bezoeker binnenkwam. Bij client-side navigatie
    // schuiven ze mee, zodat ze ook na een paar tabwissels nog kloppen.
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(link => {
      const hreflang = link.getAttribute('hreflang');
      const targetLanguage = hreflang === 'fr-BE' ? 'fr' : 'nl';
      link.setAttribute('href', `${SITE_ORIGIN}${pathForRoute(activeTab, targetLanguage)}`);
    });
  }, [activeTab, language, t]);

  // --- Deadline-aftelklok in de header ---
  // Tikt elke 30 seconden. De minuutweergave is daarmee hooguit een halve minuut oud, en we vermijden
  // een timer die elke seconde een re-render van de volledige app veroorzaakt.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  const currentDeadline = useMemo(() => getGwDeadlineDate(CURRENT_GW), []);
  const deadlineRemaining = useMemo(() => getTimeRemaining(currentDeadline, now), [currentDeadline, now]);

  // Laatste watch-list-wijziging, als één melding onderaan het scherm. Bij het verwijderen bewaart
  // dit ook de oorspronkelijke positie, zodat "ongedaan maken" de speler terugzet waar hij stond
  // (zie handleRemoveWatchlistPlayer verderop). Bewust één state en niet twee: zo kan er nooit een
  // "toegevoegd"- en een "verwijderd"-melding tegelijk over elkaar heen staan.
  // Vorm: { kind: 'removed', player, index } of { kind: 'added', player }. null = geen melding.
  const [watchlistNotice, setWatchlistNotice] = useState(null);

  // Houdt bij of de tabbalk helemaal naar rechts gescrold staat, zodat de uitfade-mask (zie de
  // .fdr-tabs-regels in de <style> hieronder) verdwijnt zodra er niets meer te ontdekken valt.
  const tabsRef = useRef(null);
  const [tabsAtEnd, setTabsAtEnd] = useState(false);
  const updateTabsScrollState = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    // 2px speling: sub-pixel-afrondingen zorgen anders voor een mask die nooit helemaal uit gaat.
    setTabsAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    updateTabsScrollState();
    window.addEventListener('resize', updateTabsScrollState);
    return () => window.removeEventListener('resize', updateTabsScrollState);
  }, [updateTabsScrollState]);


  // Mobiele "Meer"-tabmenu (zie .fdr-tabs-mobile hieronder): op smalle schermen is er ruimte voor
  // maar 3 tabs naast elkaar (zie MOBILE_PRIMARY_TAB_COUNT) — de rest verdwijnt in een dropdown i.p.v.
  // enkel te vertrouwen op de horizontale scroll die de brede/desktop-tabbalk wél gebruikt, want die
  // scroll-affordance (vervagende rand) is op mobiel makkelijk te missen en "Kaarten"/"Price Changes"
  // zaten daardoor 6-7 tabs diep buiten beeld.
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handleOutside = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) setMoreMenuOpen(false);
    };
    const handleEscape = (e) => { if (e.key === 'Escape') setMoreMenuOpen(false); };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [moreMenuOpen]);
  const [ratings, setRatings] = useState(() => loadRatingsFromURL() || loadStoredRatings() || DEFAULT_RATINGS);
  const [homeAdvantage, setHomeAdvantage] = useState(() => loadHomeAdvantageFromURL() || loadStoredHomeAdvantage() || DEFAULT_HOME_ADVANTAGE);
  // rangeStart start standaard op CURRENT_GW (i.p.v. hardcoded GW1) zodat de default range vanzelf
  // meeschuift bij het wekelijks bijwerken van CURRENT_GW in constants.js — geen aparte aanpassing
  // hier nodig. rangeEnd gebruikt DEFAULT_GW_HORIZON_END (=7) i.p.v. een CURRENT_GW-afhankelijke
  // formule: vanaf GW8 krijgen spelers onbeperkte gratis transfers (zie DEFAULT_GW_HORIZON_END in
  // constants.js) en begint dus een nieuw "seizoen" qua planning, dus "Beste fixture runs" hoort
  // nooit voorbij GW7 te kijken in de standaardweergave.
  const [rangeStart, setRangeStart] = useState(CURRENT_GW);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_GW_HORIZON_END);
  // GW-horizon van de hoofdtabel (Fixture Difficulty Rating) — los van rangeStart/rangeEnd hierboven,
  // die enkel "Beste fixture runs" sturen. Start standaard op CURRENT_GW-DEFAULT_GW_HORIZON_END (schuift
  // vanzelf mee met CURRENT_GW, zelfde redenering als rangeStart hierboven); de gebruiker kan dit zelf
  // nog verruimen tot GW_COUNT via de selector. Bewust NIET opgeslagen (localStorage/deelbare link) —
  // een tijdelijke weergave-instelling per sessie, geen permanente voorkeur.
  const [gwHorizonStart, setGwHorizonStart] = useState(CURRENT_GW);
  const [gwHorizonEnd, setGwHorizonEnd] = useState(DEFAULT_GW_HORIZON_END);
  const [linkCopied, setLinkCopied] = useState(false);
  // Transiënte succes-melding na "Optimaliseer opstelling" in Team Planner — zelfde patroon als
  // linkCopied hierboven (verdwijnt vanzelf na 2s).
  const [teamPlannerOptimized, setTeamPlannerOptimized] = useState(false);
  const [minileagueCodeCopied, setMinileagueCodeCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHomeAdvantageIntro, setShowHomeAdvantageIntro] = useState(false);
  const [openSections, setOpenSections] = useState({
    sliders: false,
    table: true,
    runs: false,
    compare: false,
    teamPlannerRoster: true,
    teamPlannerTransfers: false,
  });
  // Sortering van de hoofdtabel. Vroeger een simpele boolean ("op gemiddelde run of niet"); nu kan er
  // ook op één kolom gesorteerd worden, wat een derde toestand vereist i.p.v. aan/uit.
  // mode: 'none' (TEAMS-volgorde) | 'avg' (gemiddelde over de horizon) | 'gw' (één speeldag).
  const [sortBy, setSortBy] = useState({ mode: 'none', gw: null });

  // Welke moeilijkheidsgraden opgelicht blijven; leeg = geen filter, alles even zichtbaar. Bewust
  // dimmen i.p.v. verbergen: een rij waar plots cellen uit verdwijnen is niet meer te lezen als tabel.
  const [highlightedRatings, setHighlightedRatings] = useState([]);
  const toggleSortByAverage = () =>
    setSortBy(prev => (prev.mode === 'avg' ? { mode: 'none', gw: null } : { mode: 'avg', gw: null }));

  // Nogmaals op dezelfde kolom klikken zet de sortering weer uit — anders is er geen weg terug naar de
  // gewone volgorde zonder de andere knop te gebruiken.
  const toggleSortByGw = (gw) =>
    setSortBy(prev => (prev.mode === 'gw' && prev.gw === gw ? { mode: 'none', gw: null } : { mode: 'gw', gw }));

  const toggleRatingFilter = (rating) =>
    setHighlightedRatings(prev => (prev.includes(rating) ? prev.filter(r => r !== rating) : [...prev, rating]));

  const clearRatingFilter = () => setHighlightedRatings([]);
  const [compareTeams, setCompareTeams] = useState([]);
  const tableRef = useRef(null);

  // --- Watch list (Watch List-tab), los van de FDR-state hierboven ---
  const [watchlist, setWatchlist] = useState(() => loadStoredWatchlist());
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerTeam, setNewPlayerTeam] = useState('');
  const [newPlayerPrice, setNewPlayerPrice] = useState('');

  // --- Team Planner (Team Planner-tab), los van de FDR-/watch-list-state hierboven ---
  const [teamPlannerPlayers, setTeamPlannerPlayers] = useState(() => loadStoredTeamPlanner().players);
  // Bank- en kapiteinskeuze zijn per GW ({ [gw]: [slot-indices] } resp. { [gw]: slot-index }), zodat
  // dezelfde 15-koppige selectie elke GW een andere bank/kapitein kan hebben — zie toggleTeamPlannerBench/
  // setTeamPlannerCaptain hieronder. Wél opgeslagen (localStorage), in tegenstelling tot teamPlannerGw.
  const [teamPlannerBenchByGw, setTeamPlannerBenchByGw] = useState(() => loadStoredTeamPlanner().benchByGw);
  const [teamPlannerCaptainByGw, setTeamPlannerCaptainByGw] = useState(() => loadStoredTeamPlanner().captainByGw);
  // Transfer-tijdlijn: { [slotIndex]: [{ id, gw, player }, ...] } — per slot een lijst van geplande
  // transfers, elk vanaf zijn GW geldig tot een latere transfer op datzelfde slot. Zie
  // resolveSlotPlayerAtGw (constants.js) voor hoe dit naar "team op GW X" herleid wordt, en
  // planTeamPlannerTransfer/removeTeamPlannerTransfer hieronder voor het aanmaken/verwijderen.
  const [teamPlannerTransfersBySlot, setTeamPlannerTransfersBySlot] = useState(() => loadStoredTeamPlanner().transfersBySlot);
  // Boosters: { benchBoost, tripleCaptain, recharge }, elk null (nog niet gebruikt) of de GW (1-7)
  // waarop 'm gebruikt is — zie toggleTeamPlannerBooster hieronder voor de vergrendel-/vervang-logica.
  const [teamPlannerBoosters, setTeamPlannerBoosters] = useState(() => loadStoredTeamPlanner().boosters);
  // Geselecteerde gameweek voor de veld-weergave — bewust NIET opgeslagen (localStorage), start
  // altijd op CURRENT_GW bij het (her)laden van de pagina (schuift vanzelf mee met CURRENT_GW, zelfde
  // patroon als gwHorizonStart/End in de FDR-tab). Boosters/transfers uit eerdere GW's blijven gewoon
  // meetellen: resolveSlotPlayerAtGw/computeTeamPlannerTransferBudget herleiden de weergave altijd
  // cumulatief vanaf GW1, ongeacht welke GW hier als startwaarde gekozen is.
  const [teamPlannerGw, setTeamPlannerGw] = useState(CURRENT_GW);

  // Spelersdatabank (Google Sheet CSV) voor de zoek/autocomplete bij teaminvoer — en straks transfers
  // — in Team Planner. Los van teamPlannerPlayers hierboven: dit is de externe, gedeelde spelerslijst
  // om UIT te kiezen, niet de 15-koppige selectie zelf. Niet in localStorage: elke sessie haalt de
  // meest actuele sheet-inhoud op (zie fetchPlayerDatabase hieronder).
  const [playerDatabase, setPlayerDatabase] = useState([]);
  const [playerDatabaseLoading, setPlayerDatabaseLoading] = useState(true);
  const [playerDatabaseError, setPlayerDatabaseError] = useState(null);

  // Set-pieces-sheet, hier i.p.v. in SetPiecesTab: de speler-sheet toont de nemer-rol ook wanneer hij
  // vanuit een andere tab opent, en die data moet dan al binnen zijn (zie fetchSetPieces hieronder).
  const [setPiecesData, setSetPiecesData] = useState({ entries: [], updatedGw: '' });
  const [setPiecesLoading, setSetPiecesLoading] = useState(true);
  const [setPiecesError, setSetPiecesError] = useState(null);

  // Het detailpaneel dat openstaat, of null. Eén state voor speler én club: daardoor kan een sheet die
  // vanuit een sheet opent de vorige enkel vervángen, nooit erbovenop komen — op een telefoon zijn drie
  // lagen diep onbruikbaar. Vorm: { kind: 'player', name, teamCode } of { kind: 'club', code }.
  const [sheet, setSheet] = useState(() => {
    if (typeof window === 'undefined') return null;
    const fromUrl = sheetFromPath(window.location.pathname);
    // Een club-URL kan meteen open: de clubcode staat er letterlijk in. Een speler-URL moet eerst
    // opgezocht worden (zie pendingPlayerSlug hieronder).
    return fromUrl?.kind === 'club' ? fromUrl : null;
  });

  // Spelers-slug uit de URL die nog een naam moet krijgen. Blijft staan tot de spelersdatabank binnen
  // is, zodat een gedeelde link ook opent als hij vóór die fetch geopend wordt.
  const [pendingPlayerSlug, setPendingPlayerSlug] = useState(() => {
    if (typeof window === 'undefined') return null;
    const fromUrl = sheetFromPath(window.location.pathname);
    return fromUrl?.kind === 'player' ? fromUrl.slug : null;
  });

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

  // De FDR-ratings waren het enige wat NIET automatisch opsloeg: de watch list en de Team Planner deden
  // dat al, maar hier was "Bewaar in browser" de enige manier waarop een aangepaste rating een
  // herlaadbeurt overleefde. Dat is precies het soort werk dat je stil verliest. Zelfde patroon als de
  // twee effects hierboven, en bewust vóór het weghalen van die knop toegevoegd — andersom zou elke
  // aanpassing tussen beide wijzigingen in verdwijnen.
  //
  // isCustom als voorwaarde: zolang de ratings nog exact de gedeelde DEFAULT-referentie zijn valt er
  // niets te bewaren, en zou dit bij het eerste bezoek meteen een standaardwaarde wegschrijven die
  // handleReset net weer opruimt.
  useEffect(() => {
    if (!isCustom) return;
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ratings));
      window.localStorage?.setItem(HOME_ADVANTAGE_STORAGE_KEY, JSON.stringify(homeAdvantage));
    } catch {
      // storage niet beschikbaar (privénavigatie e.d.) — de ratings werken deze sessie gewoon door
    }
  }, [ratings, homeAdvantage, isCustom]);

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
      // Dynamisch geïmporteerd i.p.v. bovenaan het bestand: html2canvas is ~199 kB en enkel nodig
      // wanneer iemand effectief op "Download als afbeelding" klikt. Statisch geïmporteerd zat het
      // in de bundle die élke bezoeker bij het openen van de site binnenhaalt.
      const { default: html2canvas } = await import('html2canvas');
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

  // Horizon van de hoofdtabel, genormaliseerd — zelfde Math.min/max-patroon als bestRuns hierboven,
  // zodat een omgekeerde keuze (bv. eind vóór start) nooit een lege/negatieve range oplevert.
  const gwHorizonRange = useMemo(() => ({
    start: Math.min(gwHorizonStart, gwHorizonEnd),
    end: Math.max(gwHorizonStart, gwHorizonEnd),
  }), [gwHorizonStart, gwHorizonEnd]);

  // Alle GW-headers voor de huidige taal, één keer per taalwissel opgebouwd; de twee tabellen slicen
  // hier elk hun eigen bereik uit.
  const gwHeaderCells = useMemo(() => buildGwHeaderCells(t), [t]);

  // Enkel de GW-headers binnen de gekozen horizon — gwHeaderCells zelf blijft ongewijzigd (ook
  // gebruikt door compareGwHeaderCells hieronder, met een eigen, vaste startpunt).
  // Aparte, sorteerbare set voor de hoofdtabel; gwHeaderCells zelf blijft de gewone, niet-klikbare
  // versie voor de vergelijk-tabel (die heeft geen eigen sortering).
  const sortableGwHeaderCells = useMemo(
    () => buildGwHeaderCells(t, {
      sortedGw: sortBy.mode === 'gw' ? sortBy.gw : null,
      onSortGw: toggleSortByGw,
    }),
    // toggleSortByGw is een stabiele setState-wrapper; alleen t en sortBy bepalen de uitkomst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, sortBy]
  );

  const visibleGwHeaderCells = useMemo(
    () => sortableGwHeaderCells.slice(gwHorizonRange.start - 1, gwHorizonRange.end),
    [sortableGwHeaderCells, gwHorizonRange]
  );

  // "Vergelijk teams" heeft geen eigen horizon-selector: die begint gewoon altijd bij CURRENT_GW en
  // loopt door tot GW_COUNT (afgelopen GW's zijn daar nooit relevant) — schuift dus vanzelf mee zodra
  // CURRENT_GW wekelijks bijgewerkt wordt in constants.js. Math.min voorkomt een out-of-range start
  // mocht CURRENT_GW ooit GW_COUNT overschrijden.
  const compareGwStart = Math.min(CURRENT_GW, GW_COUNT);
  const compareGwHeaderCells = useMemo(
    () => gwHeaderCells.slice(compareGwStart - 1),
    [gwHeaderCells, compareGwStart]
  );

  // MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS (760px) is gekalibreerd voor de Team-kolom + alle GW_COUNT
  // kolommen samen. De tabel heeft bewust GEEN width: '100%' (zie <table> in FDRTab) — anders rekt
  // de browser (table-layout: auto) elke kolom evenredig uit om de volledige breedte van de omringende
  // scroll-container te vullen, wat bij een kleine horizon (bv. maar 1-3 zichtbare GW's) grote lege
  // tussenruimtes tussen de kolommen oplevert. Door zowel het stretchen te vermijden als de min-width
  // evenredig te laten meekrimpen met het aantal zichtbare kolommen (Team-kolom meegeteld als 1 "slot"
  // naast de GW-kolommen), blijft de dichtheid/afstand tussen team-logo en tabel gelijk aan die bij de
  // volledige 8-GW-breedte, ongeacht de gekozen horizon.
  const mainTableMinWidth = useMemo(
    () => Math.round(MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS * (visibleGwHeaderCells.length + 1) / (GW_COUNT + 1)),
    [visibleGwHeaderCells]
  );

  // Zelfde evenredige berekening voor de vergelijk-tabel. Die had een harde minWidth van 600px die
  // niet meeschoof met het aantal zichtbare GW-kolommen: met twee kolommen werd die 600px verdeeld
  // over een teamkolom van 220px en twee fixture-kolommen, in een container van 350px. Nu krimpt hij
  // net als de hoofdtabel mee, zodat de teamkolom in beide tabellen even breed uitkomt.
  const compareTableMinWidth = useMemo(
    () => Math.round(MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS * (compareGwHeaderCells.length + 1) / (GW_COUNT + 1)),
    [compareGwHeaderCells]
  );

  // Gemiddelde moeilijkheid herberekend op enkel de zichtbare horizon (i.p.v. altijd GW1-GW_COUNT),
  // zodat "Sorteer op makkelijkste run" ook echt naar de getoonde kolommen sorteert.
  const teamAvgDifficulty = useMemo(() => {
    const { start, end } = gwHorizonRange;
    const map = {};
    TEAMS.forEach(team => {
      const fixtures = FIXTURES[team.code].slice(start - 1, end);
      map[team.code] = average(getFixtureScores(team.code, fixtures, ratings, homeAdvantage, start));
    });
    return map;
  }, [ratings, homeAdvantage, gwHorizonRange]);

  const displayedTeams = useMemo(() => {
    if (sortBy.mode === 'avg') {
      return TEAMS.slice().sort((a, b) => teamAvgDifficulty[a.code] - teamAvgDifficulty[b.code]);
    }
    if (sortBy.mode === 'gw') {
      // Dezelfde scoreberekening als het gemiddelde hierboven (getFixtureScores), maar dan op één
      // speeldag — zo telt een uitgestelde GW ook hier als 5 en een DGW als 1, i.p.v. dat één kolom
      // sorteren stilletjes andere regels zou hanteren dan "sorteer op makkelijkste run".
      const scoreFor = code => getFixtureScores(
        code, [FIXTURES[code][sortBy.gw - 1]], ratings, homeAdvantage, sortBy.gw,
      )[0];
      // Clubcode als laatste tiebreaker: zonder dat wisselt de volgorde van gelijk scorende clubs
      // willekeurig mee bij elke hersortering.
      return TEAMS.slice().sort((a, b) => scoreFor(a.code) - scoreFor(b.code) || a.code.localeCompare(b.code));
    }
    return TEAMS;
  }, [sortBy, teamAvgDifficulty, ratings, homeAdvantage]);


  const toggleCompareTeam = (code) => {
    setCompareTeams(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      if (prev.length >= 5) return prev;
      return [...prev, code];
    });
  };

  // Som van alle ingevulde prijzen — lege/ongeldige velden tellen niet mee, zodat je tijdens het
  // invullen nooit een NaN of onverwacht sprongetje in het budget ziet.
  const teamPlannerTotalPrice = useMemo(() => {
    return teamPlannerPlayers.reduce((sum, p) => {
      const price = parseFloat(p.price);
      return Number.isFinite(price) ? sum + price : sum;
    }, 0);
  }, [teamPlannerPlayers]);

  // Telt hoeveel spelers per club gekozen zijn, voor de "max 3 per club"-waarschuwing in de tab.
  const teamPlannerClubCounts = useMemo(() => {
    const counts = {};
    teamPlannerPlayers.forEach(p => {
      if (p.teamCode) counts[p.teamCode] = (counts[p.teamCode] ?? 0) + 1;
    });
    return counts;
  }, [teamPlannerPlayers]);

  // Positie-tellingen van de BASISPLOEG (niet-bank) voor de op dit moment bekeken GW — dit voedt
  // zowel de bank-teller ("Bank: x/4") als de formatie-validatie (3-4-3, 4-4-2, ...) in de tab. Een
  // reduce over het volledige spelers-array, dus hier i.p.v. lokaal in TeamPlannerTab.jsx, net als
  // teamPlannerClubCounts hierboven.
  //
  // Telt enkel slots waar effectief iemand in staat. Vroeger telde dit élk niet-gebankt slot, en omdat
  // de 15 slots een vaste positie hebben (2 GK, 5 DEF, 5 MID, 3 FWD) toonde een gloednieuwe, volledig
  // lege planner meteen "Formatie: 5-5-3" — een formatie die de gebruiker nooit gekozen heeft, bij een
  // ploeg die nog geen enkele speler bevat. Nu groeit de telling mee met wat er ingevuld is.
  const teamPlannerFormationCounts = useMemo(() => {
    const bench = teamPlannerBenchByGw[teamPlannerGw] ?? [];
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    teamPlannerPlayers.forEach((p, index) => {
      if (!p.position || bench.includes(index)) return;
      if (!p.name && !p.teamCode) return;
      counts[p.position] += 1;
    });
    return counts;
  }, [teamPlannerPlayers, teamPlannerBenchByGw, teamPlannerGw]);

  // Het team ZOALS HET ERUIT ZIET op de bekeken GW: voor elk slot wordt via resolveSlotPlayerAtGw
  // (constants.js) bepaald wie er op dat moment speelt — de oorspronkelijke speler, of de meest
  // recente transfer op of vóór teamPlannerGw. Dit (en niet de statische teamPlannerPlayers) is wat de
  // veld-weergave en de "OUT"-keuze in de transfer-UI tonen; de spelerslijst/budget-validatie bovenaan
  // blijft bewust op de statische GW1-basisploeg werken (zie teamPlannerTotalPrice/ClubCounts hierboven
  // — die zijn niet gewijzigd). Positie blijft altijd de vaste slot-positie (TEAM_PLANNER_SLOT_POSITIONS),
  // ook als een transfer een speler met een andere echte positie inbracht (dat mag, met waarschuwing in
  // de transfer-UI) — anders zou de veld-indeling/formatie-telling hierboven door de war raken.
  const teamPlannerResolvedPlayers = useMemo(() => {
    return teamPlannerPlayers.map((basePlayer, index) => {
      const transfersForSlot = teamPlannerTransfersBySlot[index] ?? [];
      const resolved = resolveSlotPlayerAtGw(basePlayer, transfersForSlot, teamPlannerGw);
      return { ...resolved, position: basePlayer.position };
    });
  }, [teamPlannerPlayers, teamPlannerTransfersBySlot, teamPlannerGw]);

  // Platte, gesorteerde lijst van ALLE geplande transfers (over alle slots en GW's heen), elk verrijkt
  // met de uitgaande speler — voor de transfer-tijdlijn in TeamPlannerTab.jsx (die ze zelf per GW
  // groepeert). Transfers per slot staan al gesorteerd op GW (zie planTeamPlannerTransfer), dus de
  // "outPlayer" van transfer i is gewoon de inPlayer van transfer i-1 op datzelfde slot (of de
  // oorspronkelijke basisspeler voor de allereerste transfer van dat slot) — geen aparte
  // resolveSlotPlayerAtGw-aanroep per entry nodig.
  const teamPlannerTransferHistory = useMemo(() => {
    const entries = [];
    Object.entries(teamPlannerTransfersBySlot).forEach(([slotIndexStr, transfers]) => {
      const slotIndex = Number(slotIndexStr);
      const basePlayer = teamPlannerPlayers[slotIndex];
      if (!basePlayer) return; // defensief: een corrupte/verouderde slot-index in de opslag negeren
      transfers.forEach((transfer, i) => {
        const outPlayer = i === 0 ? basePlayer : transfers[i - 1].player;
        entries.push({ id: transfer.id, gw: transfer.gw, slotIndex, outPlayer, inPlayer: transfer.player });
      });
    });
    entries.sort((a, b) => a.gw - b.gw || a.slotIndex - b.slotIndex);
    return entries;
  }, [teamPlannerPlayers, teamPlannerTransfersBySlot]);

  // Gratis-transfersaldo + puntenkost per GW — zie computeTeamPlannerTransferBudget (constants.js) voor
  // de volledige regeltoelichting (opbouw met plafond, Recharge-uitzondering). Puur afgeleid van
  // teamPlannerTransferHistory/teamPlannerBoosters hierboven, dus herberekent vanzelf zodra de
  // gebruiker een transfer toevoegt/verwijdert (in eender welke GW) of een booster aan-/uitzet.
  const teamPlannerTransferBudget = useMemo(
    () => computeTeamPlannerTransferBudget(teamPlannerTransferHistory, teamPlannerBoosters),
    [teamPlannerTransferHistory, teamPlannerBoosters],
  );

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

  // Team Planner slaat zichzelf ook automatisch op — zelfde patroon als de watch list hierboven.
  // Spelers + per-GW bank/kapitein + transfer-tijdlijn worden samen als één blok opgeslagen (zie
  // loadStoredTeamPlanner).
  useEffect(() => {
    try {
      window.localStorage?.setItem(TEAM_PLANNER_STORAGE_KEY, JSON.stringify({
        players: teamPlannerPlayers, benchByGw: teamPlannerBenchByGw, captainByGw: teamPlannerCaptainByGw,
        transfersBySlot: teamPlannerTransfersBySlot, boosters: teamPlannerBoosters,
      }));
    } catch {
      // storage unavailable — silently ignore, team planner still works this session
    }
  }, [teamPlannerPlayers, teamPlannerBenchByGw, teamPlannerCaptainByGw, teamPlannerTransfersBySlot, teamPlannerBoosters]);

  // Haalt de spelersdatabank-CSV op en parset ze naar playerDatabase. Losse useCallback (i.p.v.
  // rechtstreeks in de useEffect hieronder) zodat zowel de automatische fetch bij het laden als de
  // "opnieuw proberen"-knop in TeamPlannerTab.jsx exact dezelfde logica hergebruiken. cache: 'no-store'
  // zodat elke fetch altijd de meest actuele sheet-inhoud ophaalt — de gebruiker werkt de sheet
  // regelmatig bij tijdens de zomermercato, dus verouderde gecachete data zou hier vervelend zijn.
  const fetchPlayerDatabase = useCallback(async () => {
    setPlayerDatabaseLoading(true);
    setPlayerDatabaseError(null);
    try {
      const response = await fetch(PLAYER_DATABASE_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      // Een gepubliceerde Google Sheet kan bij verkeerde/ingetrokken publish-rechten een HTML-
      // foutpagina teruggeven i.p.v. CSV — die herkennen we hier zodat de UI een duidelijke
      // foutmelding toont i.p.v. stilzwijgend brokkenrijen te parsen.
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      setPlayerDatabase(parsePlayerDatabaseCsv(text));
    } catch {
      setPlayerDatabaseError('Kon spelersdatabank niet laden, probeer opnieuw.');
    } finally {
      setPlayerDatabaseLoading(false);
    }
  }, []);

  // Haalt de spelersdatabank eenmalig op bij het laden van de app. Nog steeds vooraf (los van de
  // actieve tab), zodat ze klaarstaat zodra iemand naar Team Planner of Bonuspunten navigeert — maar
  // niet langer midden in het eerste scherm.
  //
  // Waarom: de FDR-tab (de standaardweergave, en veruit het meest bezochte scherm) gebruikt deze data
  // helemaal niet, en toch vertrok de fetch naar Google Sheets meteen bij het laden. Die kostte ~570 ms
  // en concurreert precies op het moment dat de tabel zelf moet renderen — op mobiele data vlak vóór een
  // deadline is dat de duurste seconde van het bezoek. requestIdleCallback wacht tot de browser klaar is
  // met het eerste scherm; is de gebruiker al op een tab die de data wél nodig heeft, dan halen we ze
  // zoals voorheen onmiddellijk op. De setTimeout-fallback is voor Safari-versies zonder
  // requestIdleCallback.
  useEffect(() => {
    if (PLAYER_DATABASE_TABS.has(activeTab)) {
      fetchPlayerDatabase();
      return undefined;
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => fetchPlayerDatabase(), { timeout: 3000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(fetchPlayerDatabase, 1200);
    return () => clearTimeout(timer);
    // activeTab bewust NIET in de dependency-lijst: fetchPlayerDatabase is idempotent qua resultaat,
    // maar bij elke tabwissel opnieuw afvuren zou een extra netwerkrondje per klik betekenen. Deze
    // effect draait één keer, met de tab waarop de bezoeker binnenkwam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPlayerDatabase]);

  // De set-pieces-sheet werd tot nu toe door SetPiecesTab zelf opgehaald. Die fetch staat hier omdat de
  // speler-sheet de nemer-rol ook moet kunnen tonen wanneer hij vanuit Bonuspunten of Kaarten opent —
  // en een sheet mag geen fetch kosten op het moment dat je 'm opent. Zelfde uitgestelde afhandeling
  // als de spelersdatabank hierboven: meteen als de bezoeker al op de Set Pieces-tab staat, anders
  // wanneer de browser toch niets te doen heeft.
  const fetchSetPieces = useCallback(async () => {
    setSetPiecesLoading(true);
    setSetPiecesError(null);
    try {
      const response = await fetch(SET_PIECES_CSV_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('Netwerkfout');
      const text = await response.text();
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
      setSetPiecesData(parseSetPiecesCsv(text));
    } catch {
      setSetPiecesError('setpieces.loadError');
    } finally {
      setSetPiecesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'setpieces') {
      fetchSetPieces();
      return undefined;
    }
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => fetchSetPieces(), { timeout: 4000 });
      return () => window.cancelIdleCallback?.(handle);
    }
    const timer = setTimeout(fetchSetPieces, 1600);
    return () => clearTimeout(timer);
    // Zelfde reden als hierboven om activeTab weg te laten: één keer ophalen, niet per tabwissel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchSetPieces]);

  const handleAddWatchlistPlayer = (e) => {
    e.preventDefault();
    const name = newPlayerName.trim();
    if (!name || !newPlayerTeam) return; // extra guard naast de native 'required' velden
    const parsedPrice = newPlayerPrice.trim() === '' ? null : Number(newPlayerPrice);
    setWatchlist(prev => [
      ...prev,
      { id: createUniqueId(), name, teamCode: newPlayerTeam, price: Number.isFinite(parsedPrice) ? parsedPrice : null },
    ]);
    setNewPlayerName('');
    setNewPlayerTeam('');
    setNewPlayerPrice('');
  };

  // Verwijderen uit de watch list is nu terugdraaibaar i.p.v. definitief bij één tik. Bewust "undo"
  // en geen bevestigingsdialoog: een dialoog onderbreekt élke verwijdering (ook de bedoelde), terwijl
  // undo enkel de zeldzame vergissing opvangt. De verwijderde speler wordt mét zijn oorspronkelijke
  // positie bewaard, zodat herstellen 'm terugzet waar hij stond i.p.v. onderaan de lijst.
  const undoTimerRef = useRef(null);
  const showWatchlistNotice = (notice) => {
    setWatchlistNotice(notice);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setWatchlistNotice(null), 8000);
  };

  const handleRemoveWatchlistPlayer = (id) => {
    const index = watchlist.findIndex(p => p.id === id);
    if (index === -1) return;
    setWatchlist(prev => prev.filter(p => p.id !== id));
    showWatchlistNotice({ kind: 'removed', player: watchlist[index], index });
  };

  // Ster op een spelersrij in Bonuspunten/Kaarten: dezelfde watch list als de Watchlist-tab, maar
  // bereikbaar tíjdens het browsen i.p.v. via het formulier op die aparte tab. Matcht op naam +
  // clubcode, want de rangschikkingen kennen de watch-list-id niet — die bestaat pas na toevoegen.
  // De prijs wordt hier opgezocht i.p.v. door de tab meegegeven: dan hoeft de aanroeper enkel te
  // weten wie hij aanklikt, en blijft de spelersdatabank de enige bron voor de prijs.
  const toggleWatchlistPlayer = ({ name, teamCode }) => {
    if (!name || !teamCode) return;
    const index = watchlist.findIndex(p => p.name === name && p.teamCode === teamCode);
    if (index !== -1) {
      // Bewust hetzelfde undo-pad als verwijderen op de Watchlist-tab: een ster is minstens even
      // makkelijk per ongeluk aangetikt als een prullenbakje.
      setWatchlist(prev => prev.filter((_, i) => i !== index));
      showWatchlistNotice({ kind: 'removed', player: watchlist[index], index });
      return;
    }
    const price = playerDatabase.find(p => p.name === name && p.teamCode === teamCode)?.price ?? null;
    const added = { id: createUniqueId(), name, teamCode, price };
    setWatchlist(prev => [...prev, added]);
    showWatchlistNotice({ kind: 'added', player: added });
  };

  const isPlayerWatched = (name, teamCode) =>
    watchlist.some(p => p.name === name && p.teamCode === teamCode);

  // Lost een spelers-URL op zodra er data is om in te zoeken. Draait opnieuw wanneer de
  // spelersdatabank binnenkomt, zodat een deeplink naar iemand die niet in de verwachte opstellingen
  // staat alsnog opent.
  useEffect(() => {
    if (!pendingPlayerSlug) return;
    const found = resolvePlayerSlug(pendingPlayerSlug, playerDatabase);
    if (!found) return;
    setSheet({ kind: 'player', ...found });
    setPendingPlayerSlug(null);
  }, [pendingPlayerSlug, playerDatabase]);

  // Eén ingang voor alle zes de plekken die een spelerskaart kunnen openen (rij in Bonuspunten of
  // Kaarten, naam in Set Pieces, watch-list-item, Team Planner-slot, speler op het veld).
  // Een sheet openen of sluiten is een echte navigatie: alleen zo valt een spelerskaart te delen, en
  // brengt de terugknop je terug naar de lijst i.p.v. de site te verlaten. De query-string blijft
  // behouden, net als bij het wisselen van tab (?r= en ?ha= dragen de aangepaste FDR-ratings).
  const pushSheetUrl = (next) => {
    if (typeof window === 'undefined') return;
    const path = next
      ? pathForSheet(next, language)
      : pathForRoute(activeTab, language);
    const url = `${path}${window.location.search || ''}`;
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState({ sheet: next?.kind ?? null }, '', url);
    }
  };

  const openPlayerSheet = (name, teamCode) => {
    if (!name || !teamCode) return;
    const next = { kind: 'player', name, teamCode };
    setSheet(next);
    setPendingPlayerSlug(null);
    pushSheetUrl(next);
  };

  // Idem voor de clubkaart: elk clublogo in de hoofdtabel, elke kaart in Set Pieces, de clubnaam op het
  // veld en de clubnaam in een spelerskaart komen hier uit.
  const openClubSheet = (code) => {
    if (!code) return;
    const next = { kind: 'club', code };
    setSheet(next);
    setPendingPlayerSlug(null);
    pushSheetUrl(next);
  };

  const closeSheet = () => {
    setSheet(null);
    setPendingPlayerSlug(null);
    pushSheetUrl(null);
  };

  const handleUndoRemoveWatchlistPlayer = () => {
    if (watchlistNotice?.kind !== 'removed') return;
    setWatchlist(prev => {
      const restored = [...prev];
      restored.splice(Math.min(watchlistNotice.index, restored.length), 0, watchlistNotice.player);
      return restored;
    });
    setWatchlistNotice(null);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
  };

  useEffect(() => () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current); }, []);

  // --- Team Planner-handlers: updaten van één speler/veld, bank/kapitein per GW, en GW-navigatie ---
  const updateTeamPlannerPlayer = (index, field, value) => {
    setTeamPlannerPlayers(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  // Bank is per GW: togglet slot `index` in/uit de bank van de GEZIEN GW (teamPlannerGw). Toevoegen
  // wordt genegeerd zodra die GW al TEAM_PLANNER_BENCH_SIZE (4) bankspelers heeft — de bank kan dus
  // nooit groter dan 4 worden (wel tijdelijk kleiner, tot de gebruiker een andere speler bankt).
  const toggleTeamPlannerBench = (index) => {
    const currentBench = teamPlannerBenchByGw[teamPlannerGw] ?? [];
    const wasBenched = currentBench.includes(index);
    setTeamPlannerBenchByGw(prev => {
      const current = prev[teamPlannerGw] ?? [];
      if (wasBenched) {
        return { ...prev, [teamPlannerGw]: current.filter(i => i !== index) };
      }
      if (current.length >= TEAM_PLANNER_BENCH_SIZE) return prev; // bank is al vol voor deze GW
      return { ...prev, [teamPlannerGw]: [...current, index] };
    });
    // Een kapitein moet basisspeler zijn — als deze speler net gebankt wordt terwijl hij kapitein
    // was voor deze GW, vervalt de band (geen vice-kapitein-concept in Fase 1).
    if (!wasBenched && teamPlannerCaptainByGw[teamPlannerGw] === index) {
      setTeamPlannerCaptainByGw(prev => {
        const updated = { ...prev };
        delete updated[teamPlannerGw];
        return updated;
      });
    }
  };

  // Kapitein is per GW: `index` is de slot-index van de nieuwe kapitein, of null om de band voor deze
  // GW te wissen (zie de kapitein-dropdown in TeamPlannerTab.jsx, die expliciet één keuze doorgeeft
  // i.p.v. te togglen). De dropdown biedt enkel niet-gebankte spelers aan, dus een bankspeler kan
  // hier sowieso niet als kapitein binnenkomen.
  const setTeamPlannerCaptain = (index) => {
    setTeamPlannerCaptainByGw(prev => {
      const updated = { ...prev };
      if (index === null) {
        delete updated[teamPlannerGw];
      } else {
        updated[teamPlannerGw] = index;
      }
      return updated;
    });
  };

  const handleTeamPlannerGwPrev = () => {
    setTeamPlannerGw(gw => Math.max(1, gw - 1));
  };

  const handleTeamPlannerGwNext = () => {
    setTeamPlannerGw(gw => Math.min(GW_COUNT, gw + 1));
  };

  // Plant een transfer op `slotIndex`, geldig vanaf `gw`: `inPlayer` ({name,teamCode,position,price})
  // vervangt vanaf die GW wie er ook in dat slot zat, tot een latere transfer op hetzelfde slot. Als
  // er al een transfer op precies diezelfde (slotIndex, gw) bestaat, wordt die vervangen i.p.v.
  // gedupliceerd — zo werkt "een eerdere transfer aanpassen" gewoon door 'm opnieuw te plannen.
  const planTeamPlannerTransfer = (slotIndex, gw, inPlayer) => {
    setTeamPlannerTransfersBySlot(prev => {
      const existing = prev[slotIndex] ?? [];
      const withoutSameGw = existing.filter(t => t.gw !== gw);
      const newTransfer = { id: createUniqueId(), gw, player: inPlayer };
      return { ...prev, [slotIndex]: [...withoutSameGw, newTransfer].sort((a, b) => a.gw - b.gw) };
    });
  };

  const removeTeamPlannerTransfer = (slotIndex, transferId) => {
    setTeamPlannerTransfersBySlot(prev => {
      const existing = prev[slotIndex] ?? [];
      return { ...prev, [slotIndex]: existing.filter(t => t.id !== transferId) };
    });
  };

  // Optimaliseert de bank voor de bekeken GW in twee fases: EERST spelers zonder match (leeg slot, of
  // een uitgestelde wedstrijd — POSTPONED) naar de bank, en pas DAARNA, onder de spelers die wél
  // spelen, de moeilijkste fixture. Behoudt een geldige formatie (VALID_FORMATIONS) en exact 1 keeper
  // in de basisploeg. Werkt op teamPlannerResolvedPlayers (het team zoals het eruit ziet op déze GW,
  // dus ná transfers) — niet op de statische teamPlannerPlayers. Schrijft alleen naar
  // teamPlannerBenchByGw[teamPlannerGw], en wist de kapitein voor deze GW als die toevallig in de
  // nieuwe bank terechtkomt (zelfde gedrag als toggleTeamPlannerBench hierboven).
  const optimizeTeamPlannerLineup = () => {
    const hasNoMatch = (player) => {
      if (!player.teamCode) return true; // leeg slot = geen match
      const fixture = FIXTURES[player.teamCode]?.[teamPlannerGw - 1];
      if (!fixture) return true;
      return POSTPONED.has(`${player.teamCode}-${teamPlannerGw}`);
    };
    const scoreForSlot = (player) => {
      if (!player.teamCode) return 5; // geen team gekozen = worst-case, net als POSTPONED
      const fixture = FIXTURES[player.teamCode]?.[teamPlannerGw - 1];
      if (!fixture) return 5;
      return getFixtureScores(player.teamCode, [fixture], ratings, homeAdvantage, teamPlannerGw)[0];
    };
    // Fase 1: geen-match weegt zwaarder dan fixture difficulty — een speler zonder match komt altijd
    // ná spelers mét match, ongeacht hoe moeilijk hun fixture is. Fase 2 (score) is enkel de tie-
    // breaker onder spelers die wél spelen.
    const compareForBench = (a, b) => {
      if (a.noMatch !== b.noMatch) return a.noMatch ? 1 : -1;
      return a.score - b.score;
    };

    const indexed = teamPlannerResolvedPlayers.map((p, index) => (
      { ...p, index, score: scoreForSlot(p), noMatch: hasNoMatch(p) }
    ));

    // 2 GK-slots liggen vast — hou de "beste" (eerst: heeft een match, dan: laagste score), bank de andere.
    const gkSlots = indexed.filter(p => p.position === 'GK').sort((a, b) => compareForBench(a, b) || a.index - b.index);
    const gkBenched = gkSlots.slice(1);

    // Outfield: elke positie eerst gesorteerd volgens dezelfde twee fases, dan voor elke geldige
    // formatie (VALID_FORMATIONS) de top-d/m/f nemen. Kies de combinatie met (1) zo min mogelijk
    // "geen match"-spelers in de basis, en pas als tie-breaker (2) de laagste totaalscore.
    const byPos = {
      DEF: indexed.filter(p => p.position === 'DEF').sort(compareForBench),
      MID: indexed.filter(p => p.position === 'MID').sort(compareForBench),
      FWD: indexed.filter(p => p.position === 'FWD').sort(compareForBench),
    };
    let best = null;
    VALID_FORMATIONS.forEach(([d, m, f]) => {
      const starters = [...byPos.DEF.slice(0, d), ...byPos.MID.slice(0, m), ...byPos.FWD.slice(0, f)];
      const noMatchCount = starters.filter(p => p.noMatch).length;
      const total = starters.reduce((sum, p) => sum + p.score, 0);
      if (!best || noMatchCount < best.noMatchCount || (noMatchCount === best.noMatchCount && total < best.total)) {
        best = { noMatchCount, total, starters };
      }
    });
    const starterIndexes = new Set(best.starters.map(p => p.index));
    const outfieldBenched = [...byPos.DEF, ...byPos.MID, ...byPos.FWD].filter(p => !starterIndexes.has(p.index));

    const newBench = [...gkBenched, ...outfieldBenched].map(p => p.index);
    setTeamPlannerBenchByGw(prev => ({ ...prev, [teamPlannerGw]: newBench }));
    if (newBench.includes(teamPlannerCaptainByGw[teamPlannerGw])) {
      setTeamPlannerCaptainByGw(prev => {
        const updated = { ...prev };
        delete updated[teamPlannerGw];
        return updated;
      });
    }
  };

  const handleOptimizeTeamPlannerLineup = () => {
    optimizeTeamPlannerLineup();
    setTeamPlannerOptimized(true);
    setTimeout(() => setTeamPlannerOptimized(false), 2000);
  };

  // Boosters: exact 1x per booster-type te gebruiken over het hele seizoen, en max 1 actieve booster
  // per GW. Eenmaal geactiveerd op GW X, is de booster VERGRENDELD op GW X — pas als hij op die exacte
  // GW opnieuw aangeklikt wordt (annuleren) komt hij weer vrij. Op een andere GW aanklikken terwijl
  // hij al elders actief is, doet niets (de UI toont 'm daar disabled, zie TeamPlannerTab.jsx).
  const toggleTeamPlannerBooster = (boosterKey, gw) => {
    if (gw < 1 || gw > 7) return;
    setTeamPlannerBoosters(prev => {
      if (prev[boosterKey] === gw) {
        return { ...prev, [boosterKey]: null }; // annuleren, enkel mogelijk op de GW waar hij actief is
      }
      if (prev[boosterKey] != null) return prev; // al verbruikt op een andere GW — geblokkeerd
      const updated = { ...prev, [boosterKey]: gw };
      // Max 1 actieve booster per GW: een andere booster die toevallig al op déze GW actief stond,
      // wordt vervangen (niet gestapeld) — user-bevestigd gedrag.
      Object.keys(updated).forEach(key => {
        if (key !== boosterKey && updated[key] === gw) updated[key] = null;
      });
      return updated;
    });
  };

  // Wist de volledige 15-koppige selectie EN alle daaraan gekoppelde state (bank/kapitein per GW,
  // transfer-tijdlijn, boosters) — anders zou die achterblijven en verwijzen naar nu-lege slots (bv.
  // "GW3 kapitein = slot 5" terwijl slot 5 leeg is). Bevestiging via window.confirm, want dit is niet
  // ongedaan te maken.
  const handleClearTeamPlanner = () => {
    if (!window.confirm("Weet je zeker dat je je volledige team wilt wissen? Bank, kapitein, transfers en boosters voor alle GW's worden ook gereset.")) return;
    setTeamPlannerPlayers(createEmptyTeamPlannerPlayers());
    setTeamPlannerBenchByGw({});
    setTeamPlannerCaptainByGw({});
    setTeamPlannerTransfersBySlot({});
    setTeamPlannerBoosters({ benchBoost: null, tripleCaptain: null, recharge: null });
  };

  // Wist enkel de transfer-tijdlijn (alle GW's) — voor de "Wis alle transfers"-knop naast de Transfers-
  // sectiekop in TeamPlannerTab.jsx. Bank/kapitein/boosters blijven ongemoeid (in tegenstelling tot
  // handleClearTeamPlanner hierboven, dat de volledige selectie wist); teamPlannerTransferBudget
  // herberekent vanzelf naar de lege staat via zijn bestaande useMemo-afhankelijkheid op
  // teamPlannerTransferHistory. Bevestiging via window.confirm, want dit is niet ongedaan te maken.
  const handleClearTeamPlannerTransfers = () => {
    if (!window.confirm('Weet je zeker dat je alle geplande transfers wilt wissen? Dit kan niet ongedaan gemaakt worden.')) return;
    setTeamPlannerTransfersBySlot({});
  };

  // Herschikt de bank-volgorde voor de bekeken GW: wisselt de array-posities van de twee gegeven
  // slots — bedoeld voor "klik 2 bankspelers om te wisselen" in TeamPlannerTab.jsx (handleSelectForSwap).
  // Een gebankte keeper telt niet mee in deze volgorde en blijft altijd vooraan staan (zie de bench-
  // weergave in TeamPlannerTab.jsx, die GK-slots altijd eerst toont, ongeacht hun positie in dit
  // array) — de UI laat een keeper-slot dan ook nooit als swap-kandidaat selecteren, maar deze functie
  // no-opt defensief als een van beide slots toch niet (meer) gebankt is (bv. een verouderde/dubbel
  // verwerkte klik).
  const swapTeamPlannerBenchPlayers = (slotA, slotB) => {
    setTeamPlannerBenchByGw(prev => {
      const current = prev[teamPlannerGw] ?? [];
      const idxA = current.indexOf(slotA);
      const idxB = current.indexOf(slotB);
      if (idxA === -1 || idxB === -1) return prev;
      const updated = [...current];
      [updated[idxA], updated[idxB]] = [updated[idxB], updated[idxA]];
      return { ...prev, [teamPlannerGw]: updated };
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#2A1440', fontFamily: "'Archivo', 'Arial Black', sans-serif", position: 'relative' }}>
      <style>{`
        /* De lettertypes worden geladen via <link rel="stylesheet"> in index.html. Vroeger stond hier
           een @import: die kon pas ontdekt worden nadat de hele JS-bundle was uitgevoerd en React deze
           <style> had geïnjecteerd, waardoor het merklettertype altijd als laatste binnenkwam. */
        * { box-sizing: border-box; }
        html, body { background: #2A1440; margin: 0; padding: 0; }
        body { font-family: 'Inter', sans-serif; }
        .fdr-title { font-family: 'Archivo', sans-serif; }
        .fdr-cell { transition: transform 0.12s ease; }
        /* 8px -> 6px verticaal: scheelt ~4px per rij en dus ~72px over achttien rijen. Bewust het
           laatste wat we verkleind hebben — hieronder wordt het onaangenaam tikken, en de rijhoogte
           wordt toch mede bepaald door de teamcel ernaast (logo + vormbalk). */
        .fdr-cell { padding-top: 6px !important; padding-bottom: 6px !important; }
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
        /* Zie de skip-link bovenaan .fdr-content. Buiten beeld geparkeerd i.p.v. display:none, want
           een element met display:none kan geen focus krijgen en zou dus nooit verschijnen. */
        .fdr-skip-link {
          position: absolute;
          left: -9999px;
          top: 0;
          z-index: 100;
          background: #4ECDC4;
          color: #0B2E1B;
          font-weight: 700;
          font-size: 13px;
          padding: 10px 16px;
          border-radius: 0 0 8px 0;
          text-decoration: none;
        }
        .fdr-skip-link:focus {
          left: 0;
        }
        /* Moeilijkheidscijfer in de hoek van een fixture-cel — zie CellRating in tabs/FDRTab.jsx voor
           waarom dit er staat. De cel is al position: relative (stacked), en de 0.62em/absolute
           plaatsing houdt 'm buiten de tekstflow zodat de bestaande celbreedtes niet veranderen. */
        .fdr-cell-rating {
          position: absolute;
          top: 1px;
          right: 3px;
          font-size: 0.62em;
          font-weight: 900;
          line-height: 1;
          color: currentColor;
          opacity: 0.65;
          pointer-events: none;
        }
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
        .fdr-spin { animation: fdr-spin 0.8s linear infinite; }
        @keyframes fdr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fdr-tabs { scrollbar-width: none; -ms-overflow-style: none; }
        .fdr-tabs::-webkit-scrollbar { display: none; }
        /* De tabbalk scrollt horizontaal en de scrollbar is verborgen, dus zonder extra signaal is er
           niets dat verraadt dat er nog tabs rechts staan. Deze mask laat de laatste 28px subtiel
           uitfaden; zodra er niet meer te scrollen valt zet de JS-klasse .fdr-tabs--end de mask uit,
           zodat de laatste tab nooit onnodig vervaagd oogt. */
        .fdr-tabs {
          -webkit-mask-image: linear-gradient(to right, black calc(100% - 28px), transparent 100%);
          mask-image: linear-gradient(to right, black calc(100% - 28px), transparent 100%);
        }
        .fdr-tabs.fdr-tabs--end {
          -webkit-mask-image: none;
          mask-image: none;
        }

        /* Onder de 700px-drempel (telefoons) wisselt de tabbalk van "alle 8 tabs, horizontaal
           scrollend" naar "3 vaste tabs + Meer" in een grid met evenveel kolommen als items — geen
           scroll meer nodig (zie MOBILE_PRIMARY_TAB_COUNT hierboven): een eerdere versie liet dat
           stripje zelf ook scrollen, maar dat oogde op een telefoon gewoon als "2 tabs + Meer" zonder
           enig duidelijk signaal dat Verwachte XI's nog een derde, verborgen tab was. Elke kolom is nu
           altijd volledig zichtbaar; lange labels breken desnoods over 2 regels (zie
           .fdr-tab-btn-mobile-primary). Boven de drempel is er ruim plaats voor alle 8 tabs, dus blijft
           de vertrouwde scrollbalk daar actief. */
        .fdr-tabs-mobile { display: none; }
        @media (max-width: 700px) {
          .fdr-tabs-desktop { display: none !important; }
          .fdr-tabs-mobile { display: grid; }
        }
        /* Icoon boven een kort label, zelfde verticale opbouw als een bottom-nav-bar in een native app
           — gekozen nadat het vroegere patroon (volledige tab-naam, evt. over 2 regels) op smalle
           telefoons alsnog middenin woorden ("Verwachte" -> "Verwa/chte") bleek af te breken. */
        .fdr-tab-btn-mobile-primary {
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          gap: 3px; text-align: center; white-space: nowrap !important; line-height: 1.1;
          min-height: 44px; min-width: 0; padding: 6px 2px !important;
          font-size: 10px !important; letter-spacing: 0.01em !important;
        }

        /* Zichtbare toetsenbord-focus. De browserstandaard is op deze donkerpaarse achtergrond
           nauwelijks te zien; :focus-visible raakt enkel toetsenbordgebruikers, nooit muisklikken. */
        :focus-visible {
          outline: 2px solid #4ECDC4;
          outline-offset: 2px;
          border-radius: 4px;
        }

        /* --- Interactielaag -------------------------------------------------------------
           Tot hiertoe had de site precies twee hover-regels, allebei op .fdr-footer-link, terwijl
           alleen de FDR-pagina al zo'n 150 aanklikbare elementen telt en Bonuspunten 75 klikbare
           rijen. Eén gedeeld transitie-vocabulaire, hier op één plek, i.p.v. per component iets
           eigens te verzinnen.

           Expliciete properties i.p.v. 'all': dat laatste laat de browser bij elke repaint élke
           eigenschap bewaken, inclusief layout-properties. */
        button, select, [role="button"],
        .fdr-toolbar-btn, .fdr-icon-btn, .fdr-tab-btn, .fdr-touch-target,
        .fdr-ranking-row, .fdr-club-chip {
          transition: background-color .15s ease, border-color .15s ease,
                      color .15s ease, transform .12s ease, filter .15s ease;
        }

        /* Hover ALLEEN achter deze guard. Zonder (hover: hover) blijft een hover-staat op touch
           "plakken" na een tap, tot de gebruiker ergens anders tikt — precies wat een site stuk
           laat aanvoelen op mobiel.

           De !important hieronder is geen luiheid maar noodzaak: achtergrond, rand en tekstkleur
           van deze knoppen komen uit inline style-objecten (zie theme.js en de tab-knoppen
           verderop in dit bestand), en een inline style wint het altijd van een klasse-regel.
           Zonder !important zou elke regel hieronder stilletjes niets doen. */
        @media (hover: hover) and (pointer: fine) {
          .fdr-toolbar-btn:not(:disabled):hover, .fdr-icon-btn:not(:disabled):hover {
            background: rgba(255,255,255,.08) !important;
            border-color: rgba(78,205,196,.55) !important;
            color: #FFF !important;
          }
          .fdr-ranking-row:hover {
            background: rgba(255,255,255,.07) !important;
            border-color: rgba(78,205,196,.35) !important;
          }
          /* Niet op de actieve tab: die staat al teal onderlijnd, en hem bij hover naar wit
             trekken leest juist als "niet actief". */
          .fdr-tab-btn:not([aria-current="page"]):hover {
            color: #FFF !important;
            border-bottom-color: rgba(78,205,196,.5) !important;
          }
          /* Een al geselecteerde chip houdt bewust zijn eigen staat: de vergelijk-chips in
             FDRTab zijn dan ingevuld teal met donkere tekst, en daar een halftransparante laag
             overheen leggen maakt die tekst onleesbaar. */
          .fdr-club-chip:not(:disabled):not([aria-pressed="true"]):hover {
            background: rgba(78,205,196,.2) !important;
          }
        }

        /* Alles wat klikbaar is krijgt feedback, ook zonder eigen klasse. De regels hierboven werken
           per klasse, en dat bleek in de praktijk het grootste deel van de site te missen: ruim
           zeventig knoppen verspreid over twintig bestanden, plus de keuzelijsten van de GW-horizon
           en de spelerskaartjes op het veld. Die stuk voor stuk een klasse geven betekent dat elke
           nieuwe knop het opnieuw vergeet, dus staat deze laag op elementniveau.

           filter: brightness i.p.v. een eigen achtergrondkleur, om twee redenen. Achtergrond, rand en
           tekstkleur komen hier overal uit inline style-objecten, en een klasse-regel verliest het
           daarvan — brightness werkt op het gerenderde resultaat en heeft dus geen !important nodig.
           En het past zich vanzelf aan de knop aan: een transparante icoonknop, een ingevulde teal
           chip en een spelerskaartje op het veld lichten er alle drie herkenbaar van op, zonder dat
           deze regel hun kleuren hoeft te kennen. */
        @media (hover: hover) and (pointer: fine) {
          button:not(:disabled):hover,
          select:not(:disabled):hover,
          [role="button"]:not([aria-disabled="true"]):hover {
            filter: brightness(1.22);
          }
        }

        /* Werkt óók op touch, en dat is hier de eigenlijke winst: een tap gaf tot nu toe geen
           enkele bevestiging dat er iets geregistreerd was. */
        button:not(:disabled):active,
        select:not(:disabled):active,
        [role="button"]:not([aria-disabled="true"]):active,
        .fdr-ranking-row:active {
          transform: translateY(1px);
        }

        /* Vergroot het AANRAAKDOEL van een klein knopje tot 44x44 zonder iets aan de lay-out te
           veranderen. Nodig voor de chips in de header (Kopieer, NL, FR): die zijn bewust klein omdat
           de header op een telefoon onder de 140px moet blijven, maar 20px hoog is te weinig om
           betrouwbaar te raken. Het pseudo-element vangt de tik op; het knopje zelf blijft even groot.
           Enkel op aanraakschermen, zodat een muisgebruiker geen onzichtbare klikzones krijgt die
           over buurelementen heen liggen. */
        @media (pointer: coarse) {
          .fdr-hit-44 { position: relative; }
          .fdr-hit-44::after {
            content: '';
            position: absolute;
            top: 50%; left: 50%;
            width: max(100%, 44px);
            height: 44px;
            transform: translate(-50%, -50%);
          }
        }

        /* Speler-sheet (zie components/PlayerSheet.jsx). Op desktop een gecentreerde modal, op
           mobiel een bottom sheet: daar is de bovenkant van het scherm buiten duimbereik, en een
           paneel dat van onder komt sluit aan bij wat een telefoongebruiker van een detailweergave
           verwacht. Zelfde breekpunt als de rest van de mobiele opmaak. */
        .fdr-sheet-overlay { align-items: center; padding: 20px; }
        .fdr-sheet { border-radius: 16px; }
        @media (max-width: 640px) {
          /* Gecentreerd i.p.v. vastgeplakt aan de onderrand. Als bottom sheet vulde hij het scherm tot
             de onderste pixel, waardoor het paneel eerder aanvoelde als een nieuwe pagina dan als iets
             dat bovenop de lijst ligt; met marge rondom en een rondom afgeronde rand blijft zichtbaar
             dat de lijst eronder gewoon blijft staan. */
          .fdr-sheet-overlay { align-items: center; padding: 12px; }
          .fdr-sheet {
            border-radius: 16px;
            max-width: none;
            max-height: 84vh;
            /* Respecteert de home-indicator op toestellen zonder fysieke knop. */
            margin-bottom: env(safe-area-inset-bottom, 0px);
          }
        }

        /* Alleen de transities, niet de animaties: de enige animatie op de site is de
           laad-spinner (.fdr-spin), en die stilzetten maakt van een "bezig"-signaal een
           bevroren icoontje. */
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            transition-duration: .01ms !important;
          }
        }

        /* Touch-doelen. Bewust gekoppeld aan het INVOERAPPARAAT (pointer: coarse) en niet aan de
           schermbreedte: een iPad is 820-1024px breed en kreeg daardoor de volledige desktoplay-out
           mét muisformaat-knopjes, terwijl het wel degelijk een aanraakscherm is. Alles wat als
           .fdr-icon-btn gemarkeerd staat groeit hier naar de aanbevolen 44x44px. */
        @media (pointer: coarse) {
          .fdr-icon-btn {
            min-width: 44px !important;
            min-height: 44px !important;
          }
          .fdr-tab-btn {
            min-height: 44px;
          }
          .fdr-touch-target {
            min-height: 44px;
          }
        }
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
          /* De "RATING VAN @FPL_PROLEAGUE"-badge kostte een eigen regel in de toolbar. Sinds de ratings
             zichzelf opslaan verschijnt het "Opgeslagen"-label precies wanneer er iets van de standaard
             afwijkt — dus datzelfde onderscheid (standaard vs. jouw versie) blijft zichtbaar, in een
             regel minder. Op desktop is er ruimte zat en blijft de badge gewoon staan. */
          .fdr-status-badge { display: none !important; }
          .fpl-toolbar {
            padding: 10px 12px !important;
            gap: 8px !important;
            margin-bottom: 14px !important;
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
          /* Van een 2x2-raster naar één rij van drie. Dat kon pas nadat de vierde knop ("Bewaar in
             browser") een statuslabel werd; het scheelt een volledige knoprij én maakt meteen ruimte
             om de resterende drie op de aanbevolen 44px te brengen i.p.v. de 31px van voorheen. Het
             blok wordt er per saldo niet hoger van. */
          .fpl-toolbar-secondary {
            flex: 1 !important;
            min-width: 0 !important;
            display: grid !important;
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 8px !important;
          }
          .fdr-toolbar-btn {
            width: 100% !important;
          }
          .fpl-toolbar-secondary .fdr-toolbar-btn {
            min-height: 44px !important;
            padding: 8px 4px !important;
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
          /* De header nam op een telefoon 246 van de 844 beschikbare pixels in — bijna een derde van
             het scherm, waardoor de eerste tabelrij pas op y=856 begon en je dus nul fixtures zag
             zonder te scrollen. Alles hieronder dient dat ene doel: de header onder de 140px.

             Logo en titel staan nu weer NAAST elkaar (i.p.v. gestapeld) en de titel past dankzij de
             kleinere maat hieronder op één regel — gestapeld kostte dat twee blokken onder elkaar,
             terwijl één regel met een kleiner logo hetzelfde zegt in de helft van de hoogte. */
          .fdr-header {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
          }
          .fdr-header img {
            margin-top: 0 !important;
            width: 30px !important;
            height: 30px !important;
          }
          .fdr-brand {
            flex-direction: row !important;
            align-items: center !important;
            gap: 10px !important;
          }
          /* Op één regel: 28px (de ondergrens van de clamp) brak "FPL PRO LEAGUE TOOLS" nog steeds in
             tweeën binnen 390px. */
          .fdr-brand-title {
            font-size: 19px !important;
            white-space: nowrap !important;
            letter-spacing: 0 !important;
          }
          /* De tagline legt uit wat de site is; dat weet je na één blik op de tabbalk eronder ook. Op
             een telefoon is die uitleg 3 regels waard die je van de tool zelf afhouden. */
          .fdr-tagline { display: none !important; }
          /* Intro-tekst van de FDR-tab: zelfde afweging, en de uitleg staat sowieso al achter de
             ⓘ-knop in de toolbar. */
          .fdr-tab-intro { display: none !important; }
          .fdr-content {
            padding-top: 10px !important;
          }
          /* Sectiekoppen staan op een telefoon dicht op elkaar gestapeld (vier stuks boven de tabel);
             12px eronder is daar meer lucht dan nodig. De kop zelf blijft 44px hoog, dus het
             aanraakdoel verandert niet. */
          .fdr-section-toggle { margin-bottom: 4px !important; }
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

          /* Team Planner-veld: de opstelling (GK/DEF/MID/FWD, telkens exact 1 rij) moet op mobiel altijd
             volledig binnen het vak passen zonder te moeten scrollen — vandaar kleinere kaartjes, minder
             gap, en minder padding op de rij/container dan op desktop. 5 kaarten (de breedste rij, DEF of
             MID) × ~48px + 4 gaps van 3px moet passen binnen de resterende breedte na de paginarand
             (20px) en de vak-padding (6px), ook op de allersmalste ondersteunde telefoons (320px, bv.
             iPhone SE) — getest tot en met die breedte, niet enkel de gangbare 360-390px.
             48px blijft de minimumbreedte (dat is wat de 5-kaartenrij nodig heeft om nooit te scrollen),
             maar de rijhoogte is niet beperkt: enkel horizontaal scrollen was het probleem, dus logo,
             naam en badges mogen ruimer/leesbaarder — en via flex-grow (met een max-width-cap) worden
             de kaarten in rijen met minder dan 5 spelers (GK, FWD) automatisch breder en dus nog beter
             leesbaar, voor zowel korte als lange spelersnamen. */
          .fdr-pitch-container {
            padding: 6px !important;
            /* Extra ruimte boven de rijen (los van de 6px rondom) — reserveert verticale plaats voor de
               booster-rij hieronder zodat GEEN enkele kaart, ongeacht rijbreedte (bv. bij 2 gevulde
               keeper-slots i.p.v. 1, wat de GK-rij breder maakt dan gebruikelijk), ooit onder de
               absoluut gepositioneerde iconen kan komen. De iconen zelf blijven op hun eigen top/right
               staan (position: absolute negeert padding van de ouder), enkel de normale rij-inhoud
               schuift hierdoor naar beneden. */
            padding-top: 40px !important;
          }
          /* Booster-stapel (Bankzitters/Driedubbele kapitein/Recharge): op desktop een verticale
             kolom van 3 ronde knoppen (~86px hoog) die in de lege ruimte rechtsboven de smalle GK-rij
             past. Op mobiel is de container krapper (padding 6px i.p.v. 16px) en kan die hoogte
             overlappen met de bredere DEF/MID/FWD-rij eronder — vandaar hier omgezet naar een
             horizontale rij (~26px hoog). Samen met de padding-top hierboven (die de rijen zelf naar
             beneden duwt) overlapt dit nooit meer met de veldweergave, ongeacht formatie of het aantal
             spelers per rij. */
          /* .fdr-pitch-boosters is weggevallen: de boosters staan niet langer absoluut gepositioneerd
             in de hoek van het veld, maar als gelabelde knoppen in een eigen rij erboven (zie
             BoosterButton in TeamPlannerTab.jsx). Daarmee vervalt ook de reden voor deze
             mobiel-specifieke herpositionering. */
          .fdr-pitch-row {
            gap: 3px !important;
            padding: 0 !important;
            margin-bottom: 8px !important;
          }
          .fdr-pitch-card {
            min-width: 48px !important;
            max-width: 88px !important;
            flex: 1 1 48px !important;
            padding: 4px 2px !important;
            gap: 3px !important;
          }
          .fdr-pitch-card .fdr-pitch-card-logo {
            width: 20px !important;
            height: 20px !important;
          }
          .fdr-pitch-card .fdr-pitch-card-name {
            font-size: 9px !important;
            line-height: 1.15 !important;
            /* Sommige achternamen bevatten een lang, aan-elkaar-geschreven woord zonder spatie (bv.
               "Vanwesemael") dat breder kan zijn dan de kaart — forceer daarom dat woorden zo nodig
               midden-in kunnen breken, zodat de kaart nooit breder wordt dan zijn eigen rij toelaat. */
            overflow-wrap: anywhere !important;
            word-break: break-word !important;
          }
          .fdr-pitch-card-captain {
            width: 16px !important;
            height: 16px !important;
            font-size: 8px !important;
            top: -5px !important;
            right: -5px !important;
          }
          /* Nog kleiner dan de algemene .fdr-mini-fixture-row-mobielstijl hierboven — deze badge zit in
             een kaartje dat op zijn smalst maar ~48px breed is, smaller dan waarvoor die algemene stijl
             bedoeld is; toch iets groter dan voorheen voor betere leesbaarheid. */
          .fdr-pitch-card-fixture {
            min-height: 0 !important;
          }
          .fdr-pitch-card-fixture > span {
            font-size: 8px !important;
            padding: 1px 4px !important;
          }
          .fdr-pitch-card-fixture > .fdr-postponed-mini {
            min-width: 22px !important;
          }
          .fdr-pitch-card-fixture > .fdr-dgw-badge > span {
            font-size: 8px !important;
            padding: 1px 4px !important;
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

        {/* Skip-link: onzichtbaar tot hij focus krijgt (zie .fdr-skip-link in de <style> hierboven),
            dan het eerste wat een toetsenbordgebruiker tegenkomt. Slaat kop + taalkeuze + acht tabs
            over. */}
        <a href="#fdr-main" className="fdr-skip-link">{t('a11y.skipToContent')}</a>

        {/* De koptekst gebruikt gewone flex-uitlijning i.p.v. de vroegere negatieve marges
            (marginTop: -36px op het logo, -18px op het minileague-blok). Die trokken elementen
            handmatig omhoog en werden maar deels teruggezet in de mobiele media query, wat de
            verticale ritmiek afhankelijk maakte van de schermbreedte. */}
        <header className="fdr-header" style={{
          marginBottom: '18px', display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap',
        }}>
          <div className="fdr-brand" style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', minWidth: 0 }}>
            <img
              src="/app-icon-mark.png"
              alt=""
              style={{ width: '44px', height: '44px', borderRadius: '2px', flexShrink: 0 }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div style={{ minWidth: 0 }}>
              <h1 className="fdr-title fdr-brand-title" style={{
                color: '#FFFFFF', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1.05, margin: 0, letterSpacing: '-0.01em'
              }}>
                FPL Pro League <span style={{ color: '#4ECDC4' }}>Tools</span>
              </h1>
              <p className="fdr-tagline" style={{ color: '#C9B8E0', fontSize: '15px', marginTop: '6px', maxWidth: '640px' }}>
                {t('header.tagline')}
              </p>
            </div>
          </div>

          {/* Deadline-aftelklok + minileague-code samen in één groep rechts van de titel — voorheen
              stond de minileague-chip als aparte volle rij ONDER de header, wat op mobiel een extra
              verticale regel kostte voor iets dat maar promotionele info is, geen tool. Nu staat hij
              naast de deadline (flexWrap zorgt dat ze bij plaatsgebrek alsnog nette losse regels
              worden i.p.v. overlappen), op zowel desktop als mobiel. */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {/* Deadline-aftelklok. Staat bewust in de header en dus op ELKE tab: het is de meest
                tijdkritische informatie die de site heeft, en ze stond vroeger enkel in de Team
                Planner, in 10px lichtpaarse tekst. De datum komt uit GW_DEADLINE_ISO (constants.js),
                waaruit ook CURRENT_GW afgeleid wordt — één bron, dus ze kunnen niet meer uiteenlopen. */}
            {deadlineRemaining && (
              <div
                className="fdr-deadline"
                // aria-live="off": de klok verandert elke 30 seconden en zou anders eindeloos
                // voorgelezen worden. De volledige tekst staat in het label hieronder.
                aria-live="off"
                style={{
                  // Eén regel (label + countdown naast elkaar) i.p.v. twee gestapelde regels. Expliciete
                  // height (i.p.v. op padding+lineHeight te vertrouwen) — zelfde reden als bij de
                  // Watchlist-knop hierboven: gedeeld met de minileague-chip hieronder, die dezelfde
                  // waarde gebruikt, zodat ze altijd EXACT gelijk zijn ongeacht lettertype-metrics.
                  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                  background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.borderSubtle}`,
                  borderRadius: '999px', height: HEADER_CHIP_HEIGHT, boxSizing: 'border-box', padding: '0 14px',
                }}
              >
                <span style={{
                  color: COLORS.textMuted, fontSize: '11px', textTransform: 'uppercase',
                  letterSpacing: '0.05em', fontWeight: 700, whiteSpace: 'nowrap',
                }}>
                  {t('header.deadlineLabel', { gw: CURRENT_GW })}
                </span>
                <span className="fdr-title" style={{
                  color: deadlineRemaining.totalMinutes <= 180 ? COLORS.warning : '#4ECDC4',
                  fontSize: '15px', fontWeight: 900, lineHeight: 1, whiteSpace: 'nowrap',
                }}>
                  {formatCountdown(deadlineRemaining)}
                </span>
              </div>
            )}

            {/* Minileague-code: compacte, inline chip. Zelfde HEADER_CHIP_HEIGHT als de deadline-chip
                hierboven, met boxSizing:border-box — voorheen liep de hoogte via padding+lineHeight
                een paar pixels uiteen, extra versterkt doordat de geneste "Kopieer"-knop tot voor kort
                de .fdr-touch-target-klasse droeg: die tilt op aanraakschermen (@media pointer:coarse)
                de knop naar minimaal 44px, terwijl de deadline-chip (geen knop erin) die regel nooit
                kreeg — op mobiel dus juist de grootste bron van het hoogteverschil. De knop hieronder
                heeft nu een eigen kleinere, expliciete hoogte i.p.v. die klasse. */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
              width: 'fit-content', maxWidth: '100%',
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.borderSubtle}`, borderRadius: '999px',
              height: HEADER_CHIP_HEIGHT, boxSizing: 'border-box', padding: '0 3px 0 10px',
            }}>
              <span style={{ color: COLORS.textMuted, fontSize: '12px' }}>
                {t('header.minileagueLabel')} <strong style={{ color: '#4ECDC4', fontWeight: 700, letterSpacing: '0.05em' }}>{MINILEAGUE_CODE}</strong>
              </span>
              <button
                onClick={handleCopyMinileagueCode}
                aria-label={t('header.copyMinileagueAria', { code: MINILEAGUE_CODE })}
                className="fdr-hit-44"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: 'transparent', color: COLORS.textBody, border: `1px solid ${COLORS.border}`,
                  borderRadius: '999px', padding: '0 10px', fontWeight: 700, fontSize: '12px',
                  fontFamily: 'inherit', cursor: 'pointer', height: '22px', boxSizing: 'border-box',
                }}
              >
                {minileagueCodeCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
                {minileagueCodeCopied ? t('header.copied') : t('header.copy')}
              </button>
            </div>

            {/* Taal-toggle (NL/FR) — zelfde chip-hoogte/vorm als de deadline-/minileague-chip hierboven,
                zodat hij zich naadloos in dezelfde header-rij voegt zonder een eigen, afwijkende stijl te
                introduceren. Frans is naast Nederlands een officiële taal in België; zie src/i18n.js. */}
            <div
              role="group"
              aria-label={t('header.languageToggleAria', { lang: language.toUpperCase() })}
              style={{
                display: 'inline-flex', alignItems: 'center', height: HEADER_CHIP_HEIGHT, boxSizing: 'border-box',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.borderSubtle}`,
                borderRadius: '999px', padding: '3px', gap: '2px', flexShrink: 0,
              }}
            >
              {LANGUAGES.map(lang => {
                const isActive = language === lang;
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => changeLanguage(lang)}
                    aria-pressed={isActive}
                    className="fdr-hit-44"
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      height: '100%', minWidth: '28px', padding: '0 8px', borderRadius: '999px',
                      border: 'none', fontFamily: 'inherit', fontSize: '11px', fontWeight: 700,
                      letterSpacing: '0.03em', cursor: isActive ? 'default' : 'pointer',
                      background: isActive ? '#4ECDC4' : 'transparent',
                      color: isActive ? '#0B2E1B' : COLORS.textBody,
                    }}
                  >
                    {lang.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* role="tablist" is bewust NIET gebruikt: dit zijn echte links naar echte URL's, geen
            ARIA-tabs. Een <nav> met aria-current geeft schermlezers de juiste boodschap.
            Twee varianten: de brede/desktop-balk toont alle tabs met horizontale scroll (zie
            .fdr-tabs hierboven), de mobiele balk (.fdr-tabs-mobile) toont enkel de eerste paar tabs
            plus een "Meer"-dropdown. Welke van de twee zichtbaar is, bepaalt de @media-regel bij
            .fdr-tabs-desktop/.fdr-tabs-mobile hieronder — geen JS-breakpointdetectie nodig. */}
        <nav
          ref={tabsRef}
          className={`fdr-tabs fdr-tabs-desktop${tabsAtEnd ? ' fdr-tabs--end' : ''}`}
          aria-label={t('nav.aria')}
          onScroll={updateTabsScrollState}
          style={{
            display: 'flex', gap: '4px', marginBottom: '18px', borderBottom: `1px solid ${COLORS.borderSubtle}`,
            overflowX: 'auto', overflowY: 'hidden', flexWrap: 'nowrap'
          }}
        >
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const isNewUnseen = NEW_TAB_KEYS.includes(tab.key) && !seenNewTabs.has(tab.key);
            return (
              <a
                key={tab.key}
                href={pathForRoute(tab.key, language)}
                // Echte href zodat midden-klik / "open in nieuw tabblad" / delen gewoon werken, maar
                // een gewone klik wordt onderschept zodat de app niet volledig herlaadt.
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateToTab(tab.key);
                }}
                className="fdr-title fdr-tab-btn"
                aria-current={isActive ? 'page' : undefined}
                style={{
                  color: isActive ? '#4ECDC4' : COLORS.textBody,
                  borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent',
                  display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none',
                }}
              >
                {t(`nav.${tab.key}`)}
                {isNewUnseen && <span style={newTabDotStyle} aria-hidden="true" />}
              </a>
            );
          })}
        </nav>

        <nav
          className="fdr-tabs-mobile"
          aria-label={t('nav.aria')}
          style={{
            gridTemplateColumns: `repeat(${MOBILE_PRIMARY_TABS.length + 1}, minmax(0, 1fr))`, gap: '2px',
            marginBottom: '18px', borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          {/* Vaste-breedte kolommen i.p.v. de eerdere scrollbare strook: die bleek op een telefoon geen
              duidelijk "hier kan je scrollen"-signaal te geven en oogde gewoon als 2 tabs + Meer, met
              Verwachte XI's onzichtbaar. Een grid met evenveel kolommen als items (3 vaste tabs + Meer)
              garandeert dat alle 4 altijd volledig zichtbaar zijn, zonder scrollen. Icoon + kort label
              i.p.v. de volledige tab-naam (zie MOBILE_PRIMARY_TAB_ICONS/nav.compact.* hierboven): die
              volledige labels bleken op een telefoon niet leesbaar in te passen, zelfs niet over 2
              regels. */}
          {MOBILE_PRIMARY_TABS.map(tab => {
            const isActive = activeTab === tab.key;
            const Icon = MOBILE_PRIMARY_TAB_ICONS[tab.key];
            return (
              <a
                key={tab.key}
                href={pathForRoute(tab.key, language)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  navigateToTab(tab.key);
                }}
                className="fdr-title fdr-tab-btn fdr-tab-btn-mobile-primary"
                aria-current={isActive ? 'page' : undefined}
                aria-label={t(`nav.${tab.key}`)}
                title={t(`nav.${tab.key}`)}
                style={{
                  color: isActive ? '#4ECDC4' : COLORS.textBody,
                  borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent',
                  textDecoration: 'none',
                }}
              >
                {Icon && <Icon size={17} aria-hidden="true" />}
                {t(`nav.compact.${tab.key}`)}
              </a>
            );
          })}

          <div ref={moreMenuRef} style={{ position: 'relative' }}>
            {(() => {
              // isActive/de teal-onderlijning volstaan om te tonen dat de huidige tab ergens in de
              // Meer-lijst zit; de knop toont daarnaast altijd gewoon "Meer" (i.p.v. voorheen de naam
              // van die actieve tab) — sommige tab-namen (bv. "Bonuspunten") zijn te lang voor deze
              // kolombreedte, en het label zelf hoeft niet te wisselen om toch duidelijk te blijven.
              const isActive = MOBILE_OVERFLOW_TABS.some(tab => tab.key === activeTab);
              // De Meer-knop krijgt zelf één stip zolang er nog minstens één nieuwe tab (Bonuspunten/
              // Set Pieces/Kaarten) verstopt zit in het dropdown-menu erachter — niet elk item apart,
              // dat is precies wat het "Meer"-niveau al samenvat.
              const hasUnseenNewTab = NEW_TAB_KEYS.some(key => !seenNewTabs.has(key));
              return (
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen(open => !open)}
                  aria-haspopup="true"
                  aria-expanded={moreMenuOpen}
                  className="fdr-title fdr-tab-btn fdr-tab-btn-mobile-primary"
                  style={{
                    color: isActive ? '#4ECDC4' : COLORS.textBody,
                    borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent',
                    background: 'none', border: 'none', borderBottomColor: isActive ? '#4ECDC4' : 'transparent',
                    borderBottomWidth: '2px', borderBottomStyle: 'solid', borderRadius: 0, cursor: 'pointer',
                    fontFamily: 'inherit', width: '100%', position: 'relative',
                  }}
                >
                  <ChevronDown size={17} style={{ transform: moreMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true" />
                  {t('nav.more')}
                  {hasUnseenNewTab && <span style={{ ...newTabDotStyle, position: 'absolute', top: '2px', right: 'calc(50% - 26px)' }} aria-hidden="true" />}
                </button>
              );
            })()}

            {moreMenuOpen && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 45, minWidth: '190px',
                background: '#2A1547', border: `1px solid ${COLORS.border}`, borderRadius: '10px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', overflow: 'hidden',
              }}>
                {MOBILE_OVERFLOW_TABS.map(tab => {
                  const isActive = activeTab === tab.key;
                  return (
                    <a
                      key={tab.key}
                      href={pathForRoute(tab.key, language)}
                      onClick={(e) => {
                        setMoreMenuOpen(false);
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                        e.preventDefault();
                        navigateToTab(tab.key);
                      }}
                      aria-current={isActive ? 'page' : undefined}
                      style={{
                        display: 'block', padding: '10px 14px', fontSize: '13px', fontWeight: 700,
                        color: isActive ? '#4ECDC4' : '#FFF', textDecoration: 'none',
                        background: isActive ? 'rgba(78,205,196,0.1)' : 'none',
                      }}
                    >
                      {t(`nav.${tab.key}`)}
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        </nav>

        {/* Eén <main>-landmark rond alle tab-inhoud. De pagina had tot nu toe <header>, <nav> en
            <footer> maar geen main: screenreaders en de "ga naar de inhoud"-snelkoppelingen van de
            browser hadden daardoor geen doel om naar toe te springen, en op mobiel betekende dat elke
            keer opnieuw door de volledige kop en de acht tabs navigeren vóór je bij de tabel was.
            tabIndex={-1} maakt het element focusbaar voor de skip-link bovenaan zonder het in de
            gewone tab-volgorde op te nemen. */}
        <main id="fdr-main" tabIndex={-1} style={{ outline: 'none' }}>

        {activeTab === 'fdr' && (
          <FDRTab
            t={t}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            updateRating={updateRating}
            toggleHomeAdvantage={toggleHomeAdvantage}
            isCustom={isCustom}
            linkCopied={linkCopied}
            downloading={downloading}
            handleCopyLink={handleCopyLink}
            handleDownloadImage={handleDownloadImage}
            handleReset={handleReset}
            setShowInfo={setShowInfo}
            openSections={openSections}
            toggleSection={toggleSection}
            sortBy={sortBy}
            toggleSortByAverage={toggleSortByAverage}
            highlightedRatings={highlightedRatings}
            toggleRatingFilter={toggleRatingFilter}
            clearRatingFilter={clearRatingFilter}
            gwHorizonStart={gwHorizonStart}
            setGwHorizonStart={setGwHorizonStart}
            gwHorizonEnd={gwHorizonEnd}
            setGwHorizonEnd={setGwHorizonEnd}
            gwHorizonRange={gwHorizonRange}
            visibleGwHeaderCells={visibleGwHeaderCells}
            compareGwHeaderCells={compareGwHeaderCells}
            compareTableMinWidth={compareTableMinWidth}
            compareGwStart={compareGwStart}
            mainTableMinWidth={mainTableMinWidth}
            displayedTeams={displayedTeams}
            tableRef={tableRef}
            rangeStart={rangeStart}
            setRangeStart={setRangeStart}
            rangeEnd={rangeEnd}
            setRangeEnd={setRangeEnd}
            bestRuns={bestRuns}
            compareTeams={compareTeams}
            toggleCompareTeam={toggleCompareTeam}
            onOpenClub={openClubSheet}
          />
        )}

        {activeTab === 'watchlist' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
          <WatchlistTab
            t={t}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            watchlist={watchlist}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            newPlayerTeam={newPlayerTeam}
            setNewPlayerTeam={setNewPlayerTeam}
            newPlayerPrice={newPlayerPrice}
            setNewPlayerPrice={setNewPlayerPrice}
            handleAddWatchlistPlayer={handleAddWatchlistPlayer}
            handleRemoveWatchlistPlayer={handleRemoveWatchlistPlayer}
            playerDatabase={playerDatabase}
            playerDatabaseLoading={playerDatabaseLoading}
            playerDatabaseError={playerDatabaseError}
            fetchPlayerDatabase={fetchPlayerDatabase}
            onOpenPlayer={openPlayerSheet}
          />
          </Suspense>
        )}

        {activeTab === 'teamplanner' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
          <TeamPlannerTab
            t={t}
            onOpenPlayer={openPlayerSheet}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            openSections={openSections}
            toggleSection={toggleSection}
            teamPlannerPlayers={teamPlannerPlayers}
            updateTeamPlannerPlayer={updateTeamPlannerPlayer}
            toggleTeamPlannerBench={toggleTeamPlannerBench}
            teamPlannerBenchByGw={teamPlannerBenchByGw}
            teamPlannerCaptainByGw={teamPlannerCaptainByGw}
            setTeamPlannerCaptain={setTeamPlannerCaptain}
            teamPlannerGw={teamPlannerGw}
            handleTeamPlannerGwPrev={handleTeamPlannerGwPrev}
            handleTeamPlannerGwNext={handleTeamPlannerGwNext}
            teamPlannerTotalPrice={teamPlannerTotalPrice}
            teamPlannerClubCounts={teamPlannerClubCounts}
            teamPlannerFormationCounts={teamPlannerFormationCounts}
            playerDatabase={playerDatabase}
            playerDatabaseLoading={playerDatabaseLoading}
            playerDatabaseError={playerDatabaseError}
            fetchPlayerDatabase={fetchPlayerDatabase}
            teamPlannerResolvedPlayers={teamPlannerResolvedPlayers}
            teamPlannerTransferHistory={teamPlannerTransferHistory}
            teamPlannerTransferBudget={teamPlannerTransferBudget}
            planTeamPlannerTransfer={planTeamPlannerTransfer}
            removeTeamPlannerTransfer={removeTeamPlannerTransfer}
            handleOptimizeTeamPlannerLineup={handleOptimizeTeamPlannerLineup}
            teamPlannerOptimized={teamPlannerOptimized}
            teamPlannerBoosters={teamPlannerBoosters}
            toggleTeamPlannerBooster={toggleTeamPlannerBooster}
            handleClearTeamPlanner={handleClearTeamPlanner}
            handleClearTeamPlannerTransfers={handleClearTeamPlannerTransfers}
            swapTeamPlannerBenchPlayers={swapTeamPlannerBenchPlayers}
          />
          </Suspense>
        )}

        {activeTab === 'predictedlineups' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <PredictedLineupsTab t={t} onOpenPlayer={openPlayerSheet} onOpenClub={openClubSheet} />
          </Suspense>
        )}

        {activeTab === 'bonuspunten' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <BonuspuntenTab
              t={t}
              playerDatabase={playerDatabase}
              playerDatabaseLoading={playerDatabaseLoading}
              playerDatabaseError={playerDatabaseError}
              fetchPlayerDatabase={fetchPlayerDatabase}
              toggleWatchlistPlayer={toggleWatchlistPlayer}
              isPlayerWatched={isPlayerWatched}
              onOpenPlayer={openPlayerSheet}
              onOpenClub={openClubSheet}
            />
          </Suspense>
        )}

        {activeTab === 'setpieces' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <SetPiecesTab
              t={t}
              entries={setPiecesData.entries}
              updatedGw={setPiecesData.updatedGw}
              loading={setPiecesLoading}
              error={setPiecesError}
              retry={fetchSetPieces}
              onOpenPlayer={openPlayerSheet}
              onOpenClub={openClubSheet}
              playerDatabase={playerDatabase}
            />
          </Suspense>
        )}

        {activeTab === 'kaarten' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <KaartenTab
              t={t}
              playerDatabase={playerDatabase}
              playerDatabaseLoading={playerDatabaseLoading}
              playerDatabaseError={playerDatabaseError}
              fetchPlayerDatabase={fetchPlayerDatabase}
              toggleWatchlistPlayer={toggleWatchlistPlayer}
              isPlayerWatched={isPlayerWatched}
              onOpenPlayer={openPlayerSheet}
              onOpenClub={openClubSheet}
            />
          </Suspense>
        )}

        {activeTab === 'pricechanges' && (
          <div style={{ marginTop: '20px' }}>
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: `1px solid ${COLORS.borderSubtle}`,
              borderRadius: '10px', padding: '16px'
            }}>
              {/* Expliciet vermelden wanneer prijzen überhaupt beginnen te bewegen: zonder die
                  context lijkt een lege tab op een onafgewerkte tool, terwijl er in het spel simpelweg
                  nog niets te tonen valt. */}
              <p style={{ color: COLORS.textBody, fontSize: '13px', margin: 0, lineHeight: 1.6 }}>
                {t('priceChanges.p1')}
              </p>
              <p style={{ color: COLORS.textSubtle, fontSize: '13px', margin: '8px 0 0', lineHeight: 1.6 }}>
                {t('priceChanges.p2')}
              </p>
            </div>
          </div>
        )}

        </main>

        <footer style={{ marginTop: '28px', textAlign: 'center', color: COLORS.textSubtle, fontSize: '12px', lineHeight: 1.5 }}>
          {t('footer.madeBy')}{' '}
          <a href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer" className="fdr-footer-link">
            <img src="/x-logo.png" alt="" style={{ width: '12px', height: '12px', verticalAlign:'-2px' }} />
            @fpl_proleague
          </a>
          {' '}· {t('footer.season')}<br />
          {t('footer.lastUpdated', { date: formatLastUpdatedLong(language) })}
        </footer>
      </div>

      {sheet?.kind === 'player' && (
        <Suspense fallback={null}>
          <PlayerSheet
            t={t}
            player={sheet}
            onClose={closeSheet}
            playerDatabase={playerDatabase}
            setPiecesEntries={setPiecesData.entries}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            isWatched={isPlayerWatched(sheet.name, sheet.teamCode)}
            onToggleWatch={() => toggleWatchlistPlayer(sheet)}
            onGoToTeamPlanner={() => { closeSheet(); navigateToTab('teamplanner'); }}
            onOpenClub={openClubSheet}
          />
        </Suspense>
      )}

      {sheet?.kind === 'club' && (
        <Suspense fallback={null}>
          <ClubSheet
            t={t}
            clubCode={sheet.code}
            onClose={closeSheet}
            playerDatabase={playerDatabase}
            setPiecesEntries={setPiecesData.entries}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            onOpenPlayer={openPlayerSheet}
          />
        </Suspense>
      )}

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
              <h3 className="fdr-title" style={{ color: '#4ECDC4', fontSize: '16px', margin: 0, textTransform: 'uppercase' }}>{t('infoModal.title')}</h3>
              <button onClick={() => setShowInfo(false)} aria-label={t('infoModal.close')} style={{ background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6 }}>
              {t('infoModal.p1')}
            </p>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6, marginTop: '8px' }}>
              {t('infoModal.p2')}
            </p>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6, marginTop: '8px' }}>
              {t('infoModal.p3')}
            </p>
          </div>
        </div>
      )}

      {/* Melding na een watch-list-wijziging. Verschijnt onderaan (binnen duimbereik op mobiel) en
          verdwijnt vanzelf na 8 seconden. "Ongedaan maken" hoort enkel bij een verwijdering: een
          toevoeging draai je gewoon terug door de ster nog eens aan te tikken. */}
      {watchlistNotice && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)',
          zIndex: 60, width: 'calc(100% - 40px)', maxWidth: '360px',
          display: 'flex', alignItems: 'center', gap: '10px',
          background: COLORS.surface, color: '#EDE4F5', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px', padding: '10px 12px', boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          fontFamily: "'Inter', sans-serif"
        }}>
          <span style={{ margin: 0, fontSize: '13px', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
            <strong style={{ color: '#FFFFFF' }}>{watchlistNotice.player.name}</strong>{' '}
            {watchlistNotice.kind === 'removed' ? t('undo.removedSuffix') : t('watchlist.addedSuffix')}
          </span>
          {watchlistNotice.kind === 'removed' && (
            <button
              onClick={handleUndoRemoveWatchlistPlayer}
              className="fdr-touch-target"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                background: 'transparent', color: '#4ECDC4', border: '1px solid #4ECDC4',
                borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px',
                fontFamily: 'inherit', cursor: 'pointer'
              }}
            >
              <Undo2 size={14} aria-hidden="true" /> {t('undo.action')}
            </button>
          )}
          <button
            onClick={() => setWatchlistNotice(null)}
            aria-label={t('undo.closeAria')}
            className="fdr-icon-btn"
            style={{ background: 'transparent', border: 'none', color: COLORS.textBody, cursor: 'pointer', flexShrink: 0, padding: 0, display: 'inline-flex' }}
          >
            <X size={14} aria-hidden="true" />
          </button>
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
            <strong style={{ color: '#FFFFFF' }}>{t('fdr.homeAdvantage')}</strong> {t('homeAdvantageToast.bodySuffix')}
          </p>
          <button
            onClick={() => setShowHomeAdvantageIntro(false)}
            aria-label={t('homeAdvantageToast.closeAria')}
            style={{ background: 'transparent', border: 'none', color: '#C9B8E0', cursor: 'pointer', flexShrink: 0, padding: 0 }}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
