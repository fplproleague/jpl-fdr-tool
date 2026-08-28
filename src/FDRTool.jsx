// Hoofdbestand van de FDR-tool: pagina-chrome (header, minileague-code, tab-navigatie, footer, info-
// modal, Thuisvoordeel-toast) en alle gedeelde/persistente state die de tabs nodig hebben (ratings,
// homeAdvantage, watchlist, ...). De tab-specifieke content zelf zit in src/tabs/*.jsx en ontvangt
// die state + handlers als props — geen lokale state daar, want die tabs worden conditioneel
// gemount/unmount bij het wisselen van tab.

import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { Info, X, Check, Copy, Undo2, Loader2, ChevronDown } from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT, CURRENT_GW, DEFAULT_GW_HORIZON_END, MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS,
  MINILEAGUE_CODE, PL_MINILEAGUE_CODE, LAST_UPDATED, GW_INDEXES, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE,
  TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_SLOT_POSITIONS, VALID_FORMATIONS,
  resolveSlotPlayerAtGw, PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv, getFixtureScores, average,
  POSTPONED, computeTeamPlannerTransferBudget, getGwDeadlineDate,
} from './constants';
import { COLORS } from './theme';
import { ROUTES, routeKeyFromPath, routeByKey, urlForRoute } from './routes';
import { t as translate, LANGUAGES, DEFAULT_LANGUAGE } from './i18n';
import FDRTab from './tabs/FDRTab';

// Enkel de FDR-tab (de standaardweergave) zit in de hoofdbundle. De andere tabs worden pas
// opgehaald wanneer iemand er effectief naartoe navigeert.
//
// Waarom dit uitmaakt: PredictedLineupsTab trekt via PitchField de volledige veld-renderer én
// html2canvas mee — samen goed voor ~372 kB. Die stond vroeger als `modulepreload` in index.html,
// dus élke bezoeker downloadde dat vóór de pagina bruikbaar was, ook wie enkel de FDR-tabel kwam
// bekijken. Voor een tool die vaak vlak vóór de deadline op mobiele data geopend wordt, is dat
// precies de verkeerde afweging.
const WatchlistTab = lazy(() => import('./tabs/WatchlistTab'));
const TeamPlannerTab = lazy(() => import('./tabs/TeamPlannerTab'));
const PredictedLineupsTab = lazy(() => import('./tabs/PredictedLineupsTab'));
const BonuspuntenTab = lazy(() => import('./tabs/BonuspuntenTab'));
const KaartenTab = lazy(() => import('./tabs/KaartenTab'));
const SetPiecesTab = lazy(() => import('./tabs/SetPiecesTab'));

// Tab-navigatie bovenaan de pagina. De lijst zelf (labels, paden, per-tab titel/omschrijving) staat
// in src/routes.js, zodat de URL-afhandeling en de zichtbare tabs nooit uit elkaar kunnen lopen.
const TABS = ROUTES;

// Op mobiel (zie .fdr-tabs-mobile) blijven enkel de eerste MOBILE_PRIMARY_TAB_COUNT tabs los
// zichtbaar; de rest komt in het "Meer"-menu. 3 is met opzet krap: bij 8 tabs passen "FDR" + "Team
// Planner" + "Verwachte XI's" (de verkorte NL-naam van Predicted Lineups) nog net naast de "Meer"-knop
// op een toestel van ~390px breed zonder dat er iets afgesneden wordt (gemeten met de effectief
// gerenderde tab-breedtes) — een vierde tab past daar niet meer bij.
const MOBILE_PRIMARY_TAB_COUNT = 3;
const MOBILE_PRIMARY_TABS = TABS.slice(0, MOBILE_PRIMARY_TAB_COUNT);
const MOBILE_OVERFLOW_TABS = TABS.slice(MOBILE_PRIMARY_TAB_COUNT);

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
// Onthoudt of de eenmalige PL-minileague-popup (zie PL_MINILEAGUE_CODE, constants.js) al getoond is —
// zelfde eenmalig-tonen-patroon als hasSeenHomeAdvantageIntro hieronder. Elke bezoeker ziet 'm precies
// één keer, ongeacht hoe vaak ze de site nadien nog openen.
const PL_MINILEAGUE_POPUP_SEEN_KEY = 'fpl_proleague_pl_minileague_popup_seen_v1';
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
// hasSeenHomeAdvantageIntro/PL_MINILEAGUE_POPUP_SEEN_KEY hierboven, maar dan per tab i.p.v. één
// globale vlag: een array van reeds-bezochte tab-keys i.p.v. een simpele '1'/geen-waarde.
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

// Statische GW-headers, eenmalig opgebouwd — nodig voor visibleGwHeaderCells (hoofdtabel-horizon,
// zie hieronder) en, geslicet vanaf CURRENT_GW, voor de vergelijk-tabel in FDRTab (compareGwHeaderCells
// hieronder). Blijft hier i.p.v. in constants.js: dat is een .js-bestand en Vite/esbuild parsen
// JSX-syntax enkel in .jsx-bestanden.
const gwHeaderCells = GW_INDEXES.map(i => (
  <th key={i} style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 4px', minWidth: '58px' }}>
    GW{i + 1}
  </th>
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

function hasSeenPLMinileaguePopup() {
  try {
    return window.localStorage?.getItem(PL_MINILEAGUE_POPUP_SEEN_KEY) === '1';
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
  const [language, setLanguage] = useState(() => loadStoredLanguage() ?? DEFAULT_LANGUAGE);
  const t = useCallback((key, vars) => translate(language, key, vars), [language]);
  const changeLanguage = useCallback((next) => {
    setLanguage(next);
    try {
      window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, next);
    } catch {
      // storage unavailable — taalkeuze werkt nog wel deze sessie, onthoudt 'm enkel niet
    }
  }, []);

  // Tab wisselen = een echte navigatie. De query-string blijft bewust behouden: de FDR-tab codeert
  // aangepaste ratings in ?r= en thuisvoordeel in ?ha=, en die mogen niet sneuvelen bij het wisselen.
  const navigateToTab = useCallback((key) => {
    setActiveTab(key);
    if (typeof window === 'undefined') return;
    const url = urlForRoute(key, window.location.search);
    if (url !== window.location.pathname + window.location.search) {
      window.history.pushState({ tab: key }, '', url);
    }
  }, []);

  // Terug-/vooruitknop van de browser.
  useEffect(() => {
    const handlePopState = () => setActiveTab(routeKeyFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Documenttitel en meta-description volgen de actieve tab, zodat een gedeelde link niet langer
  // altijd "FDR Tool" als preview toont en elke tool apart indexeerbaar is.
  useEffect(() => {
    const route = routeByKey(activeTab);
    document.title = t(`route.${activeTab}.title`);
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t(`route.${activeTab}.description`));
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.setAttribute('href', `https://fplproleague.vercel.app${route.path}`);
  }, [activeTab, t]);

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

  // Laatst verwijderde watch-list-speler, bewaard om "ongedaan maken" mogelijk te maken (zie
  // handleRemoveWatchlistPlayer verderop). null = geen actieve undo-melding.
  const [recentlyRemovedPlayer, setRecentlyRemovedPlayer] = useState(null);

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

  // Zelfde uitfade-mask-mechanisme als hierboven, maar dan voor het mobiele "vaste tabs"-stripje (zie
  // .fdr-tabs-mobile-primary): op smalle telefoons (~375px) passen FDR + Team Planner + Verwachte XI's
  // net niet naast elkaar en scrollt dat stripje binnen zijn eigen begrenzing (zie de toelichting bij
  // MOBILE_PRIMARY_TAB_COUNT) — zonder mask was daar geen enkel signaal dat Verwachte XI's nog
  // bereikbaar is door te scrollen.
  const mobilePrimaryTabsRef = useRef(null);
  const [mobilePrimaryTabsAtEnd, setMobilePrimaryTabsAtEnd] = useState(false);
  const updateMobilePrimaryTabsScrollState = useCallback(() => {
    const el = mobilePrimaryTabsRef.current;
    if (!el) return;
    setMobilePrimaryTabsAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
  }, []);
  useEffect(() => {
    updateMobilePrimaryTabsScrollState();
    window.addEventListener('resize', updateMobilePrimaryTabsScrollState);
    return () => window.removeEventListener('resize', updateMobilePrimaryTabsScrollState);
  }, [updateMobilePrimaryTabsScrollState]);

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
  // Beide starten standaard op CURRENT_GW (i.p.v. hardcoded GW1) zodat de default range vanzelf
  // meeschuift bij het wekelijks bijwerken van CURRENT_GW in constants.js — geen aparte aanpassing
  // hier nodig. Math.min met GW_COUNT voorkomt een out-of-range eind mocht CURRENT_GW ooit dicht bij
  // GW_COUNT liggen.
  const [rangeStart, setRangeStart] = useState(CURRENT_GW);
  const [rangeEnd, setRangeEnd] = useState(Math.min(CURRENT_GW + 4, GW_COUNT));
  // GW-horizon van de hoofdtabel (Fixture Difficulty Rating) — los van rangeStart/rangeEnd hierboven,
  // die enkel "Beste fixture runs" sturen. Start standaard op CURRENT_GW-DEFAULT_GW_HORIZON_END (schuift
  // vanzelf mee met CURRENT_GW, zelfde redenering als rangeStart hierboven); de gebruiker kan dit zelf
  // nog verruimen tot GW_COUNT via de selector. Bewust NIET opgeslagen (localStorage/deelbare link) —
  // een tijdelijke weergave-instelling per sessie, geen permanente voorkeur.
  const [gwHorizonStart, setGwHorizonStart] = useState(CURRENT_GW);
  const [gwHorizonEnd, setGwHorizonEnd] = useState(DEFAULT_GW_HORIZON_END);
  const [saved, setSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  // Transiënte succes-melding na "Optimaliseer opstelling" in Team Planner — zelfde patroon als
  // linkCopied/saved hierboven (verdwijnt vanzelf na 2s).
  const [teamPlannerOptimized, setTeamPlannerOptimized] = useState(false);
  const [minileagueCodeCopied, setMinileagueCodeCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHomeAdvantageIntro, setShowHomeAdvantageIntro] = useState(false);
  const [showPLMinileaguePopup, setShowPLMinileaguePopup] = useState(false);
  const [plCodeCopied, setPlCodeCopied] = useState(false);
  // Eenmalige PL-minileague-popup: verschijnt bij de allereerste keer dat iemand de site opent (niet
  // getriggerd door een klik, in tegenstelling tot de Thuisvoordeel-uitleg hierboven), en daarna nooit
  // meer — zie hasSeenPLMinileaguePopup/PL_MINILEAGUE_POPUP_SEEN_KEY.
  useEffect(() => {
    if (!hasSeenPLMinileaguePopup()) {
      setShowPLMinileaguePopup(true);
    }
  }, []);
  const handleClosePLMinileaguePopup = () => {
    setShowPLMinileaguePopup(false);
    try {
      window.localStorage?.setItem(PL_MINILEAGUE_POPUP_SEEN_KEY, '1');
    } catch {
      // storage unavailable — de popup verschijnt dan gewoon opnieuw bij een volgend bezoek
    }
  };
  const handleCopyPLMinileagueCode = async () => {
    try {
      await navigator.clipboard.writeText(PL_MINILEAGUE_CODE);
      setPlCodeCopied(true);
      setTimeout(() => setPlCodeCopied(false), 2000);
    } catch {
      // clipboard unavailable — zelfde stille fallback als handleCopyMinileagueCode
    }
  };
  const [openSections, setOpenSections] = useState({
    sliders: false,
    table: true,
    runs: false,
    compare: false,
    teamPlannerRoster: true,
    teamPlannerTransfers: false,
  });
  const [sortByDifficulty, setSortByDifficulty] = useState(false);
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

  // Enkel de GW-headers binnen de gekozen horizon — gwHeaderCells zelf blijft ongewijzigd (ook
  // gebruikt door compareGwHeaderCells hieronder, met een eigen, vaste startpunt).
  const visibleGwHeaderCells = useMemo(
    () => gwHeaderCells.slice(gwHorizonRange.start - 1, gwHorizonRange.end),
    [gwHorizonRange]
  );

  // "Vergelijk teams" heeft geen eigen horizon-selector: die begint gewoon altijd bij CURRENT_GW en
  // loopt door tot GW_COUNT (afgelopen GW's zijn daar nooit relevant) — schuift dus vanzelf mee zodra
  // CURRENT_GW wekelijks bijgewerkt wordt in constants.js. Math.min voorkomt een out-of-range start
  // mocht CURRENT_GW ooit GW_COUNT overschrijden.
  const compareGwStart = Math.min(CURRENT_GW, GW_COUNT);
  const compareGwHeaderCells = useMemo(
    () => gwHeaderCells.slice(compareGwStart - 1),
    [compareGwStart]
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
  const teamPlannerFormationCounts = useMemo(() => {
    const bench = teamPlannerBenchByGw[teamPlannerGw] ?? [];
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    teamPlannerPlayers.forEach((p, index) => {
      if (!p.position || bench.includes(index)) return;
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

  // Haalt de spelersdatabank eenmalig op bij het laden van de app, los van de actieve tab — zodat ze
  // al klaarstaat zodra de gebruiker naar Team Planner navigeert.
  useEffect(() => {
    fetchPlayerDatabase();
  }, [fetchPlayerDatabase]);

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
  const handleRemoveWatchlistPlayer = (id) => {
    setWatchlist(prev => {
      const index = prev.findIndex(p => p.id === id);
      if (index === -1) return prev;
      setRecentlyRemovedPlayer({ player: prev[index], index });
      return prev.filter(p => p.id !== id);
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setRecentlyRemovedPlayer(null), 8000);
  };

  const handleUndoRemoveWatchlistPlayer = () => {
    if (!recentlyRemovedPlayer) return;
    setWatchlist(prev => {
      const restored = [...prev];
      restored.splice(Math.min(recentlyRemovedPlayer.index, restored.length), 0, recentlyRemovedPlayer.player);
      return restored;
    });
    setRecentlyRemovedPlayer(null);
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
        .fdr-spin { animation: fdr-spin 0.8s linear infinite; }
        @keyframes fdr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .fdr-tabs, .fdr-tabs-mobile-primary { scrollbar-width: none; -ms-overflow-style: none; }
        .fdr-tabs-mobile-primary::-webkit-scrollbar { display: none; }
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
        /* Zelfde uitfade-mask als hierboven voor het mobiele "vaste tabs"-stripje, maar smaller (18px
           i.p.v. 28px) — die strook is zelf al vrij compact, dus een even brede mask zou er zwaarder
           uitzien dan de bedoeling "subtiel" is. */
        .fdr-tabs-mobile-primary {
          -webkit-mask-image: linear-gradient(to right, black calc(100% - 18px), transparent 100%);
          mask-image: linear-gradient(to right, black calc(100% - 18px), transparent 100%);
        }
        .fdr-tabs-mobile-primary.fdr-tabs-mobile-primary--end {
          -webkit-mask-image: none;
          mask-image: none;
        }

        /* Onder de 700px-drempel (telefoons) wisselt de tabbalk van "alle 8 tabs, horizontaal
           scrollend" naar "3 vaste tabs + Meer-dropdown" (zie MOBILE_PRIMARY_TAB_COUNT hierboven) —
           op dat formaat is de scroll-uitfaderand makkelijk te missen en zaten de laatste tabs
           daardoor te diep verstopt. Boven de drempel is er ruim plaats voor alle 8, dus blijft de
           vertrouwde scrollbalk actief. */
        .fdr-tabs-mobile { display: none; }
        @media (max-width: 700px) {
          .fdr-tabs-desktop { display: none !important; }
          .fdr-tabs-mobile { display: flex; }
        }

        /* Zichtbare toetsenbord-focus. De browserstandaard is op deze donkerpaarse achtergrond
           nauwelijks te zien; :focus-visible raakt enkel toetsenbordgebruikers, nooit muisklikken. */
        :focus-visible {
          outline: 2px solid #4ECDC4;
          outline-offset: 2px;
          border-radius: 4px;
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
          /* Logo boven de titeltekst i.p.v. ernaast — op mobiel duwde het logo (44px + 14px gap) de
             titel zo ver naar rechts dat "FPL Pro League Tools" over 3 regels brak. Zonder het logo
             ernaast heeft de tekst de volle breedte en wrapt ze compacter. */
          .fdr-brand {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 8px !important;
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
              <h1 className="fdr-title" style={{
                color: '#FFFFFF', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1.05, margin: 0, letterSpacing: '-0.01em'
              }}>
                FPL Pro League <span style={{ color: '#4ECDC4' }}>Tools</span>
              </h1>
              <p style={{ color: '#C9B8E0', fontSize: '15px', marginTop: '6px', maxWidth: '640px' }}>
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
                href={tab.path}
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
            gap: '4px', marginBottom: '18px', borderBottom: `1px solid ${COLORS.borderSubtle}`,
          }}
        >
          {/* Eigen scroll-container voor enkel de vaste tabs, los van de "Meer"-knop: op de meeste
              telefoons passen FDR + Team Planner + Verwachte XI's naast elkaar, maar op smallere
              toestellen (bv. 375px) is dat net te krap. I.p.v. de knoptekst daarvoor in te korten of de
              "Meer"-knop mee te laten verdringen, scrollt enkel dít stripje dan binnen zijn eigen
              begrenzing — de "Meer"-knop (buiten deze container, zie flexShrink hieronder) blijft
              altijd volledig zichtbaar en klikbaar. */}
          <div
            ref={mobilePrimaryTabsRef}
            className={`fdr-tabs-mobile-primary${mobilePrimaryTabsAtEnd ? ' fdr-tabs-mobile-primary--end' : ''}`}
            onScroll={updateMobilePrimaryTabsScrollState}
            style={{
              display: 'flex', gap: '4px', overflowX: 'auto', overflowY: 'hidden', flexWrap: 'nowrap', minWidth: 0,
            }}
          >
            {MOBILE_PRIMARY_TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <a
                  key={tab.key}
                  href={tab.path}
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
                    display: 'inline-flex', alignItems: 'center', gap: '5px', textDecoration: 'none', flexShrink: 0,
                  }}
                >
                  {t(`nav.${tab.key}`)}
                </a>
              );
            })}
          </div>

          <div ref={moreMenuRef} style={{ position: 'relative', marginLeft: 'auto', flexShrink: 0 }}>
            {(() => {
              const activeOverflowTab = MOBILE_OVERFLOW_TABS.find(tab => tab.key === activeTab);
              const isActive = Boolean(activeOverflowTab);
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
                  className="fdr-title fdr-tab-btn"
                  style={{
                    color: isActive ? '#4ECDC4' : COLORS.textBody,
                    borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent',
                    display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none',
                    border: 'none', borderRadius: 0, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                  }}
                >
                  {activeOverflowTab ? t(`nav.${activeOverflowTab.key}`) : t('nav.more')}
                  {hasUnseenNewTab && !activeOverflowTab && <span style={newTabDotStyle} aria-hidden="true" />}
                  <ChevronDown size={14} style={{ transform: moreMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} aria-hidden="true" />
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
                      href={tab.path}
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

        {activeTab === 'fdr' && (
          <FDRTab
            t={t}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            updateRating={updateRating}
            toggleHomeAdvantage={toggleHomeAdvantage}
            isCustom={isCustom}
            saved={saved}
            linkCopied={linkCopied}
            downloading={downloading}
            handleCopyLink={handleCopyLink}
            handleDownloadImage={handleDownloadImage}
            handleReset={handleReset}
            handleSave={handleSave}
            setShowInfo={setShowInfo}
            openSections={openSections}
            toggleSection={toggleSection}
            sortByDifficulty={sortByDifficulty}
            setSortByDifficulty={setSortByDifficulty}
            gwHorizonStart={gwHorizonStart}
            setGwHorizonStart={setGwHorizonStart}
            gwHorizonEnd={gwHorizonEnd}
            setGwHorizonEnd={setGwHorizonEnd}
            gwHorizonRange={gwHorizonRange}
            visibleGwHeaderCells={visibleGwHeaderCells}
            compareGwHeaderCells={compareGwHeaderCells}
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
          />
          </Suspense>
        )}

        {activeTab === 'teamplanner' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
          <TeamPlannerTab
            t={t}
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
            <PredictedLineupsTab t={t} />
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
            />
          </Suspense>
        )}

        {activeTab === 'setpieces' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <SetPiecesTab t={t} />
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

        <footer style={{ marginTop: '28px', textAlign: 'center', color: COLORS.textSubtle, fontSize: '12px', lineHeight: 1.5 }}>
          {t('footer.madeBy')}{' '}
          <a href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer" className="fdr-footer-link">
            <img src="/x-logo.png" alt="" style={{ width: '12px', height: '12px', verticalAlign:'-2px' }} />
            @fpl_proleague
          </a>
          {' '}· {t('footer.season')}<br />
          {t('footer.lastUpdated', { date: LAST_UPDATED })}
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

      {/* Eenmalige PL-minileague-popup — zie showPLMinileaguePopup hierboven voor de "toon precies één
          keer ooit"-logica. Bewust vereenvoudigd tot enkel de code zelf (geen aankondigingstekst meer)
          — PL_MINILEAGUE_POPUP_SEEN_KEY bleef ONGEWIJZIGD t.o.v. de vorige (uitgebreidere) versie, dus
          wie die al zag krijgt deze simpelere versie niet alsnog te zien. TIJDELIJKE content: dit hele
          blok (plus PL_MINILEAGUE_CODE in constants.js) mag weg zodra de hype rond de seizoensstart
          voorbij is. Zelfde overlay-opzet als de "Hoe werkt dit?"-modal hierboven (klik op de
          achtergrond sluit ook), maar met een eigen hogere zIndex zodat hij bij een eerste bezoek
          altijd bovenop verschijnt. */}
      {showPLMinileaguePopup && (
        <div onClick={handleClosePLMinileaguePopup} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 70
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#3D1E5C', borderRadius: '14px', padding: '20px', maxWidth: '340px',
            border: '1px solid rgba(78,205,196,0.35)',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
              <p style={{ color: '#FFF', fontSize: '15px', fontWeight: 700, lineHeight: 1.4, margin: 0 }}>
                {t('plPopup.body')} <span style={{ color: '#4ECDC4', letterSpacing: '0.05em' }}>{PL_MINILEAGUE_CODE}</span>
              </p>
              <button
                onClick={handleClosePLMinileaguePopup}
                aria-label={t('plPopup.closeAria')}
                style={{ background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer', flexShrink: 0 }}
              >
                <X size={18} />
              </button>
            </div>
            <button
              onClick={handleCopyPLMinileagueCode}
              className="fdr-touch-target"
              aria-label={t('plPopup.copyAria', { code: PL_MINILEAGUE_CODE })}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%',
                background: plCodeCopied ? 'transparent' : '#4ECDC4', color: plCodeCopied ? '#4ECDC4' : '#0B2E1B',
                border: '1px solid #4ECDC4', borderRadius: '8px', padding: '8px 12px', marginTop: '14px',
                fontWeight: 700, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {plCodeCopied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
              {plCodeCopied ? t('header.copied') : t('header.copy')}
            </button>
          </div>
        </div>
      )}

      {/* Undo-melding na het verwijderen van een watch-list-speler. Verschijnt onderaan (binnen
          duimbereik op mobiel) en verdwijnt vanzelf na 8 seconden. */}
      {recentlyRemovedPlayer && (
        <div role="status" aria-live="polite" style={{
          position: 'fixed', left: '50%', bottom: '20px', transform: 'translateX(-50%)',
          zIndex: 60, width: 'calc(100% - 40px)', maxWidth: '360px',
          display: 'flex', alignItems: 'center', gap: '10px',
          background: COLORS.surface, color: '#EDE4F5', border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: '10px', padding: '10px 12px', boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
          fontFamily: "'Inter', sans-serif"
        }}>
          <span style={{ margin: 0, fontSize: '13px', lineHeight: 1.4, flex: 1, minWidth: 0 }}>
            <strong style={{ color: '#FFFFFF' }}>{recentlyRemovedPlayer.player.name}</strong> {t('undo.removedSuffix')}
          </span>
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
          <button
            onClick={() => setRecentlyRemovedPlayer(null)}
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
