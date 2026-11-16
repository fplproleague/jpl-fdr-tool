// Hoofdbestand van de FDR-tool: pagina-chrome (header, minileague-code, tab-navigatie, footer, info-
// modal, Thuisvoordeel-toast) en alle gedeelde/persistente state die de tabs nodig hebben (ratings,
// homeAdvantage, watchlist, ...). De tab-specifieke content zelf zit in src/tabs/*.jsx en ontvangt
// die state + handlers als props — geen lokale state daar, want die tabs worden conditioneel
// gemount/unmount bij het wisselen van tab.

import { useState, useMemo, useRef, useCallback, useEffect, lazy, Suspense } from 'react';
import { Info, X, Loader2 } from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT, CURRENT_GW, DEFAULT_GW_HORIZON_END,
  MINILEAGUE_CODE, formatLastUpdatedLong, GW_INDEXES, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE, PREVIOUS_DEFAULT_RATINGS,
  TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_SLOT_POSITIONS, VALID_FORMATIONS,
  resolveSlotPlayerAtGw, PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv, getFixtureScores, average,
  POSTPONED, computeTeamPlannerTransferBudget, getGwDeadlineDate, AUTO_RECHARGE_GWS, PREDICTED_LINEUPS_GW,
} from './constants';
import { SET_PIECES_CSV_URL } from './constants';
import { parseSetPiecesCsv } from './setPieces';
import { COLORS } from './theme';
import {
  ROUTES, routeKeyFromPath, urlForRoute, pathForRoute, languageFromPath, SUPPORTED_LANGUAGES,
  pathForSheet, sheetFromPath, playerSlug, searchForTab, legacyRedirectUrl,
} from './routes';
import { t as translate, LANGUAGES, DEFAULT_LANGUAGE } from './i18n';
import { PREDICTED_LINEUPS } from './predictedLineupsData';
import { I18nContext } from './i18nContext';
import {
  applyOverrides, diffFromDefaults, setOverride, removeOverride, loadOverrides, saveOverrides,
  encodeRatingsParam, decodeRatingsParam, encodeHomeParam, decodeHomeParam,
} from './fdrRatings';
import FDRTab from './tabs/FDRTab';
import AppShell from './ui/AppShell';
import Sheet from './components/Sheet';
import './ui/Toast.css';

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
const TeamPlannerTab = lazy(() => import('./tabs/TeamPlannerTab'));
const PredictedLineupsTab = lazy(() => import('./tabs/PredictedLineupsTab'));
const BonuspuntenTab = lazy(() => import('./tabs/BonuspuntenTab'));
const KaartenTab = lazy(() => import('./tabs/KaartenTab'));
const SetPiecesTab = lazy(() => import('./tabs/SetPiecesTab'));
const SpelersTab = lazy(() => import('./tabs/SpelersTab'));
const KlassementTab = lazy(() => import('./tabs/KlassementTab'));

// Tab-navigatie bovenaan de pagina. De lijst zelf (labels, paden, per-tab titel/omschrijving) staat
// in src/routes.js, zodat de URL-afhandeling en de zichtbare tabs nooit uit elkaar kunnen lopen.
const TABS = ROUTES;

// De tabs die de spelersdatabank-CSV effectief nodig hebben (zie de fetch-useEffect verderop). De
// FDR-tab staat er bewust niet bij: die rendert volledig uit constants.js.
// De Spelers-tab haalt zijn eigen data uit /api/players, maar heeft de databank nodig om spelers aan de
// watchlist en "Mijn team" te koppelen (die kennen spelers op hun naam in de sheet).
const PLAYER_DATABASE_TABS = new Set(['teamplanner', 'bonuspunten', 'kaarten', 'spelers']);

// Eén plek voor de canonieke oorsprong van de site; stond eerder als letterlijke string in de
// title/canonical-useEffect en moet nu ook door de hreflang-alternates gebruikt worden.
const SITE_ORIGIN = 'https://fplproleague.vercel.app';

// De navigatie (topbalk, onderbalk op gsm, "Meer"-menu) zit sinds de rework in ui/AppShell.jsx; welke
// tabs waar staan, volgt uit het veld `group` in ROUTES (src/routes.js).

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

// De FDR-ratings staan sinds de functionaliteitsrework als afwijkingen onder eigen v2-sleutels; de
// v1-sleutels (fpl_proleague_fdr_ratings_v1 / _home_advantage_v1) blijven als back-up staan. Zie
// src/fdrRatings.js.
const TEAM_CODES = TEAMS.map(team => team.code);
// Eigen storage key voor de watch list — los van de FDR-ratings hierboven, zodat ze elkaar niet raken.
const WATCHLIST_STORAGE_KEY = 'fpl_proleague_watchlist_v1';
// Onthoudt of de eenmalige melding "je watchlist zit nu in Spelers" al getoond is (spec §8.6).
const WATCHLIST_MOVED_SEEN_KEY = 'fpl_proleague_watchlist_moved_seen_v1';
// Onthoudt of de first-time-uitleg over Thuisvoordeel al getoond is, zodat die maar één keer ooit verschijnt.
const HOME_ADVANTAGE_INTRO_SEEN_KEY = 'fpl_proleague_ha_intro_seen_v1';
// Eigen storage key voor de Team Planner — los van de watch list hierboven.
const TEAM_PLANNER_STORAGE_KEY = 'fpl_proleague_teamplanner_v1';
// Onthoudt de gekozen taal (NL/FR) tussen bezoeken — zie src/i18n.js.
const LANGUAGE_STORAGE_KEY = 'fpl_proleague_language_v1';
// Toont de FDR-tabel de kolom met de gemiddelde moeilijkheid? Standaard niet (feedback eigenaar).
const FDR_SHOW_AVG_STORAGE_KEY = 'fpl_proleague_fdr_show_avg_v1';

function loadStoredLanguage() {
  try {
    const raw = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGES.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

// Hier stond de machinerie achter een gouden "nieuw"-stip op Bonuspunten/Set Pieces/Kaarten, met een
// lijst reeds-bezochte tabs in localStorage. Die tabs zijn intussen geen nieuws meer, en een stip die
// per bezoeker moet worden "afgezet" blijft anders eeuwig bestaan zonder dat iemand hem nog opmerkt.
// Volledig weg i.p.v. een lege lijst achterlaten: dan blijft er geen slapende UI-laag staan die bij de
// volgende nieuwe tab per ongeluk weer aanslaat. De oude localStorage-sleutel
// (fpl_proleague_new_tabs_seen_v1) wordt niet meer gelezen of geschreven en verdwijnt vanzelf.


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

// GW-kolomkoppen voor de FDR-tabellen. Met onSortGw wordt elke kop een sorteerknop (hoofdtabel);
// zonder is het een gewone kop (vergelijk-tabel). De vormgeving staat in tabs/FDRTab.css.
function buildGwHeaderCells(t, { sortedGw = null, onSortGw = null } = {}) {
  const prefix = t('fdr.gwLabel');
  return GW_INDEXES.map(i => {
    const gw = i + 1;
    const isSorted = sortedGw === gw;
    if (!onSortGw) {
      return (
        <th key={i} scope="col" className="fdr-grid__gw" aria-label={t('fdr.gwColumnAria', { gw })}>
          {prefix}{gw}
        </th>
      );
    }
    return (
      <th key={i} scope="col" className="fdr-grid__gw" aria-sort={isSorted ? 'ascending' : 'none'}>
        <button
          type="button"
          onClick={() => onSortGw(gw)}
          aria-label={t('fdr.sortByGwAria', { gw })}
          aria-pressed={isSorted}
          className={`fdr-grid__sort${isSorted ? ' is-sorted' : ''}`}
        >
          {prefix}{gw}
        </button>
      </th>
    );
  });
}

// Ratings uit een gedeelde link (?r= / ?ha=). Die tonen we enkel om te bekijken (spec A1): ze komen
// nooit vanzelf in de eigen opslag terecht. Geeft null zonder geldige link-ratings. Een link met
// enkel ?ha= (of enkel ?r=) vult het andere deel aan met de eigen waarden.
function loadSharedRatingsFromURL(ownRatings, ownHome) {
  try {
    const params = new URLSearchParams(window.location.search);
    const ratings = decodeRatingsParam(params.get('r'), TEAM_CODES);
    const home = decodeHomeParam(params.get('ha'), TEAM_CODES);
    if (!ratings && !home) return null;
    return { ratings: ratings ?? ownRatings, homeAdvantage: home ?? ownHome };
  } catch {
    return null;
  }
}

function removeSharedRatingsFromURL() {
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete('r');
    url.searchParams.delete('ha');
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // ignore
  }
}

function hasSeenHomeAdvantageIntro() {
  try {
    return window.localStorage?.getItem(HOME_ADVANTAGE_INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
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


export default function FDRTool() {
  // Actieve tab komt uit de URL (zie src/routes.js) i.p.v. uit losse component-state, zodat elke tool
  // een deelbare link heeft en de terugknop van de browser tussen tabs navigeert.
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === 'undefined') return 'fdr';
    // Oude links naar /watchlist of /price-changes (PWA, cache): meteen de nieuwe URL in de adresbalk
    // zetten, vóór de Spelers-tab zijn filters uit de URL leest (spec §6.3).
    const legacy = legacyRedirectUrl(window.location.pathname, window.location.search);
    if (legacy) window.history.replaceState(window.history.state, '', legacy);
    return routeKeyFromPath(window.location.pathname);
  });

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
  // Voor kleine bouwstenen zonder `t`-prop (FDR-cel, mini-fixture): zie src/i18nContext.js.
  const i18nValue = useMemo(() => ({ t, language }), [t, language]);

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
    // Parameters die enkel bij een andere tab horen (filters van Spelers/Klassement) vallen weg.
    const url = urlForRoute(key, searchForTab(window.location.search, key), language);
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
      const targetLanguage = { 'fr-BE': 'fr', en: 'en' }[hreflang] ?? 'nl';
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
  // CURRENT_GW wordt één keer berekend bij het laden. Blijft de pagina open over de deadline heen, dan
  // staat de rest van de site nog op de oude GW: de topbalk vraagt dan om te herladen (spec A7).
  const deadlinePassed = !!currentDeadline && now.getTime() >= currentDeadline.getTime();

  // Laatste watch-list-wijziging, als één melding onderaan het scherm. Bij het verwijderen bewaart
  // dit ook de oorspronkelijke positie, zodat "ongedaan maken" de speler terugzet waar hij stond
  // (zie handleRemoveWatchlistPlayer verderop). Bewust één state en niet twee: zo kan er nooit een
  // "toegevoegd"- en een "verwijderd"-melding tegelijk over elkaar heen staan.
  // Vorm: { kind: 'removed', player, index } of { kind: 'added', player }. null = geen melding.
  const [watchlistNotice, setWatchlistNotice] = useState(null);

  // Eigen ratings = de standaard + de clubs die de bezoeker zelf aanpaste (spec A2). Enkel die
  // afwijkingen worden bewaard, zodat een nieuwe standaard (bv. Charleroi naar 4) iedereen bereikt die
  // die club niet zelf veranderde.
  const [storedOverrides] = useState(() => {
    let storage = null;
    try { storage = window.localStorage ?? null; } catch { storage = null; }
    return loadOverrides(storage, {
      defaultRatings: DEFAULT_RATINGS,
      defaultHome: DEFAULT_HOME_ADVANTAGE,
      previousDefaultRatings: PREVIOUS_DEFAULT_RATINGS,
    });
  });
  const [ratingOverrides, setRatingOverrides] = useState(storedOverrides.ratings);
  const [homeOverrides, setHomeOverrides] = useState(storedOverrides.home);
  const ownRatings = useMemo(() => applyOverrides(DEFAULT_RATINGS, ratingOverrides), [ratingOverrides]);
  const ownHomeAdvantage = useMemo(() => applyOverrides(DEFAULT_HOME_ADVANTAGE, homeOverrides), [homeOverrides]);
  // Ratings uit een gedeelde link: enkel om te bekijken, tot de bezoeker ze zelf overneemt (spec A1).
  const [sharedRatings, setSharedRatings] = useState(() => {
    if (typeof window === 'undefined') return null;
    const shared = loadSharedRatingsFromURL(ownRatings, ownHomeAdvantage);
    if (!shared) return null;
    // Een link met exact je eigen ratings hoeft geen keuze: gewoon je eigen ratings tonen.
    const same = TEAM_CODES.every(code => shared.ratings[code] === ownRatings[code]
      && !!shared.homeAdvantage[code] === !!ownHomeAdvantage[code]);
    if (same) { removeSharedRatingsFromURL(); return null; }
    return shared;
  });
  const ratings = sharedRatings?.ratings ?? ownRatings;
  const homeAdvantage = sharedRatings?.homeAdvantage ?? ownHomeAdvantage;
  // rangeStart start standaard op CURRENT_GW (i.p.v. hardcoded GW1) zodat de default range vanzelf
  // meeschuift bij het wekelijks bijwerken van CURRENT_GW in constants.js — geen aparte aanpassing
  // hier nodig. Deze twee sturen de gedeelde analyse-periode van "Beste fixture runs" en "Vergelijk
  // teams" (zie analysisRange verderop). rangeEnd volgt DEFAULT_GW_HORIZON_END, dat sinds de volledige kalender (GW1-34) zelf
  // ook afgeleid is: huidige speeldag + acht. Vroeger stond daar het vaste getal 7, omdat iedereen na
  // GW7 onbeperkte gratis transfers kreeg; die grens ligt intussen achter ons, dus een meeschuivend
  // venster i.p.v. een vast eindpunt (zie DEFAULT_GW_HORIZON_LENGTH in constants.js).
  const [rangeStart, setRangeStart] = useState(CURRENT_GW);
  const [rangeEnd, setRangeEnd] = useState(DEFAULT_GW_HORIZON_END);
  // GW-horizon van de hoofdtabel (Fixture Difficulty Rating) — los van rangeStart/rangeEnd hierboven,
  // die samen "Beste fixture runs" én "Vergelijk teams" sturen (zie analysisRange verderop). De
  // hoofdtabel houdt bewust een eigen horizon: dat is de leesweergave van alle ploegen, geen analyse
  // van een handvol ploegen, en je wil die twee los van elkaar kunnen instellen. Start standaard op CURRENT_GW-DEFAULT_GW_HORIZON_END (schuift
  // vanzelf mee met CURRENT_GW, zelfde redenering als rangeStart hierboven); de gebruiker kan dit zelf
  // nog verruimen tot GW34 via de selector. Bewust NIET opgeslagen (localStorage/deelbare link) —
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

  // De Σ-kolom (gemiddelde moeilijkheid) staat standaard verborgen; wie ze aanzet, ziet ze ook bij
  // een volgend bezoek. Verbergen zet een sortering op die kolom terug naar de gewone volgorde.
  const [showAvgColumn, setShowAvgColumn] = useState(() => {
    try { return window.localStorage?.getItem(FDR_SHOW_AVG_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const toggleAvgColumn = () => {
    const next = !showAvgColumn;
    setShowAvgColumn(next);
    try {
      if (next) window.localStorage?.setItem(FDR_SHOW_AVG_STORAGE_KEY, '1');
      else window.localStorage?.removeItem(FDR_SHOW_AVG_STORAGE_KEY);
    } catch { /* geen opslag: enkel voor dit bezoek */ }
    if (!next) setSortBy(s => (s.mode === 'avg' ? { mode: 'none', gw: null } : s));
  };

  // Nogmaals op dezelfde kolom klikken zet de sortering weer uit — anders is er geen weg terug naar de
  // gewone volgorde zonder de andere knop te gebruiken.
  const toggleSortByGw = (gw) =>
    setSortBy(prev => (prev.mode === 'gw' && prev.gw === gw ? { mode: 'none', gw: null } : { mode: 'gw', gw }));

  const toggleRatingFilter = (rating) =>
    setHighlightedRatings(prev => (prev.includes(rating) ? prev.filter(r => r !== rating) : [...prev, rating]));

  const clearRatingFilter = () => setHighlightedRatings([]);
  const [compareTeams, setCompareTeams] = useState([]);
  const tableRef = useRef(null);

  // --- Watch list, los van de FDR-state hierboven. Sinds de rework (spec §8) geen eigen tab meer: de
  // ster in Spelers/Bonuspunten/Kaarten/de spelerskiezer voegt toe, en Spelers toont de lijst via de
  // filter "★ Watchlist". Opslag en formaat zijn ongewijzigd.
  const [watchlist, setWatchlist] = useState(() => loadStoredWatchlist());
  const [showWatchlistMoved, setShowWatchlistMoved] = useState(false);
  // Verhogen = de Spelers-tab opnieuw opbouwen, zodat die zijn filters opnieuw uit de URL leest.
  const [spelersMountKey, setSpelersMountKey] = useState(0);

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

  // Aangepast = er is minstens één eigen afwijking. Vroeger vergeleek dit objectreferenties, waardoor
  // wie alles handmatig terugzette toch "eigen (aangepast)" bleef zien.
  const isCustom = Object.keys(ratingOverrides).length > 0 || Object.keys(homeOverrides).length > 0;
  const isViewingShared = sharedRatings !== null;

  // Aanpassen gebeurt altijd op de eigen ratings. Zolang een gedeelde link getoond wordt, is de lade
  // alleen-lezen (zie RatingsSheet in tabs/FDRTab.jsx), dus hier komt geen gedeelde waarde binnen.
  const updateRating = (code, value) => {
    setRatingOverrides(prev => setOverride(prev, DEFAULT_RATINGS, code, value));
  };

  const resetRating = (code) => {
    setRatingOverrides(prev => removeOverride(prev, code));
    setHomeOverrides(prev => removeOverride(prev, code));
  };

  // Thuisvoordeel is losstaand van de sterkte-rating: een aparte aan/uit-toggle per team.
  const toggleHomeAdvantage = (code) => {
    setHomeOverrides(prev => setOverride(prev, DEFAULT_HOME_ADVANTAGE, code, !ownHomeAdvantage[code]));
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

  // Elke wijziging van de eigen afwijkingen meteen bewaren. Een gedeelde link raakt deze state niet,
  // dus die kan de eigen ratings ook niet meer overschrijven (spec A1).
  const overridesInitialized = useRef(false);
  useEffect(() => {
    if (!overridesInitialized.current) { overridesInitialized.current = true; return; }
    let storage = null;
    try { storage = window.localStorage ?? null; } catch { storage = null; }
    saveOverrides(storage, ratingOverrides, homeOverrides);
  }, [ratingOverrides, homeOverrides]);

  const handleReset = () => {
    setRatingOverrides({});
    setHomeOverrides({});
  };

  // Gedeelde link: overnemen als eigen ratings, of terug naar de eigen ratings. In beide gevallen
  // verdwijnen ?r= en ?ha= uit de adresbalk.
  const adoptSharedRatings = () => {
    if (!sharedRatings) return;
    setRatingOverrides(diffFromDefaults(sharedRatings.ratings, DEFAULT_RATINGS));
    setHomeOverrides(diffFromDefaults(sharedRatings.homeAdvantage, DEFAULT_HOME_ADVANTAGE));
    setSharedRatings(null);
    removeSharedRatingsFromURL();
  };
  const leaveSharedRatings = () => {
    setSharedRatings(null);
    removeSharedRatingsFromURL();
  };

  // De gedeelde ratings horen enkel bij de FDR-tab: wie van tab wisselt, verliest ?r=/?ha= (zie
  // TAB_QUERY_PARAMS.fdr in routes.js) en ziet bij terugkeer zijn eigen ratings.
  useEffect(() => {
    if (activeTab !== 'fdr' && sharedRatings) setSharedRatings(null);
  }, [activeTab, sharedRatings]);

  const handleCopyLink = async () => {
    try {
      // De link gaat naar het klembord, niet in de eigen adresbalk: anders zou een herlaadbeurt je eigen
      // ratings als "gedeelde link" tonen.
      const url = new URL(window.location.href);
      url.searchParams.set('r', encodeRatingsParam(TEAM_CODES, ratings));
      url.searchParams.set('ha', encodeHomeParam(TEAM_CODES, homeAdvantage));
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
      // Wacht tot de lettertypes geladen zijn, anders rendert de export met het fallback-font.
      if (document.fonts?.ready) await document.fonts.ready;
      const canvas = await html2canvas(el, {
        backgroundColor: '#061B1C', // = --ink-0 (canvas kent geen CSS-variabelen)
        scale: 2,
        windowWidth: el.scrollWidth,
        width: el.scrollWidth,
      });

      const watermarkHeight = 44 * 2;
      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = canvas.width;
      finalCanvas.height = canvas.height + watermarkHeight;
      const ctx = finalCanvas.getContext('2d');
      ctx.fillStyle = '#061B1C'; // = --ink-0
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height);
      ctx.drawImage(canvas, 0, 0);
      ctx.fillStyle = '#33EDD5'; // = --accent
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

  // Genormaliseerde analyse-periode, gedeeld door "Beste fixture runs" en "Vergelijk teams" — zelfde
  // Math.min/max-patroon als gwHorizonRange hieronder, zodat een omgekeerde keuze (eind vóór start)
  // nooit een lege of negatieve range oplevert.
  //
  // De twee secties stellen dezelfde vraag ("over welke reeks speeldagen beoordeel ik ploegen?"), en
  // twee aparte periodes naast elkaar leveren stil tegenstrijdige antwoorden op: een team dat bovenaan
  // "beste runs" staat over GW8-15 kan er in een vergelijking over GW8-12 slechter uitzien. Eén periode
  // dus, met in beide secties een eigen kiezer op diezelfde state — je kan 'm overal aanpassen, ook als
  // de andere sectie dichtgeklapt staat.
  const analysisRange = useMemo(() => ({
    start: Math.min(rangeStart, rangeEnd),
    end: Math.max(rangeStart, rangeEnd),
  }), [rangeStart, rangeEnd]);

  const bestRuns = useMemo(() => {
    const { start, end } = analysisRange;
    const results = TEAMS.map(team => {
      const fixtures = FIXTURES[team.code].slice(start - 1, end);
      const scores = getFixtureScores(team.code, fixtures, ratings, homeAdvantage, start);
      return { ...team, avg: average(scores), fixtures, startGW: start };
    });
    // Alle clubs, makkelijkste eerst; de tab toont er standaard 5 en kan uitklappen naar alle 18.
    return results.sort((a, b) => a.avg - b.avg || a.code.localeCompare(b.code));
  }, [ratings, homeAdvantage, analysisRange]);

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

  // "Vergelijk teams" had helemaal geen kiezer: het begon altijd bij CURRENT_GW en liep tot een vast
  // eindpunt. Nu volgt het de gedeelde analyse-periode hierboven, met een eigen kiezer in de sectie
  // zelf. Vroeger liep dit bovendien door tot GW_COUNT — met 34 speeldagen zou dat 27 kolommen naast
  // elkaar zetten in een blok dat bedoeld is om twee ploegen snel te vergelijken.
  const compareGwStart = analysisRange.start;
  const compareGwEnd = analysisRange.end;
  const compareGwHeaderCells = useMemo(
    () => gwHeaderCells.slice(compareGwStart - 1, compareGwEnd),
    [gwHeaderCells, compareGwStart, compareGwEnd]
  );

  // --fdr-table-slot (84px, zie FDRTab.css) is de breedte van één kolom, met de Team-kolom meegeteld als 1 "slot"
  // naast de GW-kolommen. De tabel heeft bewust GEEN width: '100%' (zie <table> in FDRTab) — anders
  // rekt de browser (table-layout: auto) elke kolom evenredig uit om de volledige breedte van de
  // omringende scroll-container te vullen, wat bij een kleine horizon (bv. maar 1-3 zichtbare GW's)
  // grote lege tussenruimtes tussen de kolommen oplevert. Door zowel het stretchen te vermijden als de
  // min-width recht evenredig met het aantal zichtbare kolommen te laten meegroeien, blijft de
  // dichtheid tussen team-logo en tabel identiek, ongeacht of je acht of dertig speeldagen toont.
  //
  // De breedte per slot komt uit een CSS-variabele (--fdr-table-slot) i.p.v. uit een getal hier: op een
  // telefoon krijgt die variabele een kleinere waarde (zie FDRTab.css), en dan krimpt de
  // tabel mee zonder dat React iets van de schermbreedte hoeft te weten. Hier blijft enkel het AANTAL
  // slots staan, want dat is het enige dat van de app-state afhangt.
  const mainTableSlots = visibleGwHeaderCells.length + 1;

  // Zelfde berekening voor de vergelijk-tabel. Die had een harde minWidth van 600px die niet meeschoof
  // met het aantal zichtbare GW-kolommen: met twee kolommen werd die 600px verdeeld over een teamkolom
  // van 220px en twee fixture-kolommen, in een container van 350px. Nu telt hij per kolom, net als de
  // hoofdtabel, dus bij een gelijk aantal kolommen zijn beide tabellen exact even breed. De teamkolom
  // blijft een paar pixels verschillen — die cel bevat in de hoofdtabel een knop met eigen padding en
  // in de vergelijk-tabel een kale span — maar de kolomindeling is dezelfde.
  const compareTableSlots = compareGwHeaderCells.length + 1;

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
      // Een i18n-sleutel, geen zin: de tabs vertalen hem bij het tonen (spec A3).
      setPlayerDatabaseError('shared.loadError');
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
  // Vorm per club, automatisch berekend uit de competitie-uitslagen door api/team-form.js (API-Football).
  // Geen loading- of foutstatus: zolang er niets binnen is, of als de ophaling mislukt, toont de tabel
  // gewoon geen vormbalk — nooit een verouderde of geraden uitslag.
  const [teamForm, setTeamForm] = useState({});

  useEffect(() => {
    let geannuleerd = false;
    const ophalen = async () => {
      try {
        // Geen cache: 'no-store' hier: de functie zelf wordt op Vercels CDN gecachet (zie CACHE_OK in
        // api/team-form.js), en dat is precies wat het aantal API-Football-requests laag houdt.
        const response = await fetch('/api/team-form');
        if (!response.ok) return;
        const data = await response.json();
        if (!geannuleerd && data?.form && typeof data.form === 'object') setTeamForm(data.form);
      } catch {
        // offline, of lokaal via `vite` zonder serverfuncties — dan gewoon geen vormbalk
      }
    };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(() => ophalen(), { timeout: 4000 });
      return () => { geannuleerd = true; window.cancelIdleCallback?.(handle); };
    }
    const timer = setTimeout(ophalen, 1600);
    return () => { geannuleerd = true; clearTimeout(timer); };
  }, []);

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

  // Eenmalige melding voor wie al een watchlist had (spec §8.6): de oude Watchlist-tab is weg, de lijst
  // zit nu in Spelers. Wie binnenkomt via de /watchlist-redirect ziet de filter al aanstaan en krijgt
  // de melding niet. Kan de browser niets onthouden, dan tonen we ze niet (anders bij elk bezoek).
  useEffect(() => {
    if (watchlist.length === 0) return;
    let seen = true;
    try { seen = window.localStorage?.getItem(WATCHLIST_MOVED_SEEN_KEY) === '1'; } catch { seen = true; }
    if (seen) return;
    try { window.localStorage?.setItem(WATCHLIST_MOVED_SEEN_KEY, '1'); } catch { return; }
    const viaRedirect = activeTab === 'spelers' && new URLSearchParams(window.location.search).get('scope') === 'watchlist';
    if (!viaRedirect) setShowWatchlistMoved(true);
    // Bewust enkel bij het laden van de pagina.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!showWatchlistMoved) return undefined;
    const timer = setTimeout(() => setShowWatchlistMoved(false), 12000);
    return () => clearTimeout(timer);
  }, [showWatchlistMoved]);

  const openWatchlistInSpelers = () => {
    setShowWatchlistMoved(false);
    const params = new URLSearchParams(searchForTab(window.location.search, 'spelers'));
    params.set('scope', 'watchlist');
    params.delete('speler');
    const search = `?${params.toString().replace(/%2C/g, ',')}`;
    window.history.pushState({ tab: 'spelers' }, '', urlForRoute('spelers', search, language));
    setActiveTab('spelers');
    setSpelersMountKey(k => k + 1);
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

  // "Zit deze speler in mijn ploeg?" — voor het scope-filter op Bonuspunten en Kaarten (zie
  // ScopeFilter.jsx). Bewust op CURRENT_GW herleid en niet op teamPlannerGw: die laatste is puur
  // weergave-state van de planner-tab, en het zou raar zijn als een filter op een ándere tab stil
  // verandert omdat je in de planner naar GW22 hebt gebladerd. Ook niet de statische GW1-ploeg: dan
  // zouden al je transfers genegeerd worden.
  //
  // Vergelijking hoofdletter- en spatie-ongevoelig, maar wél op naam én clubcode samen: de planner
  // vult namen via dezelfde CSV in als deze ranglijsten, maar een handmatig getypte naam kan een
  // spatie of hoofdletter schelen. Enkel op naam vergelijken zou naamgenoten bij twee clubs
  // samengooien.
  const myTeamPlayerKeys = useMemo(() => {
    const normaliseer = (name, teamCode) => `${(name ?? '').trim().toLowerCase()}|${(teamCode ?? '').toUpperCase()}`;
    const keys = new Set();
    teamPlannerPlayers.forEach((basePlayer, index) => {
      const resolved = resolveSlotPlayerAtGw(basePlayer, teamPlannerTransfersBySlot[index] ?? [], CURRENT_GW);
      if (resolved?.name) keys.add(normaliseer(resolved.name, resolved.teamCode));
    });
    return keys;
  }, [teamPlannerPlayers, teamPlannerTransfersBySlot]);

  const isPlayerInMyTeam = (name, teamCode) =>
    myTeamPlayerKeys.has(`${(name ?? '').trim().toLowerCase()}|${(teamCode ?? '').toUpperCase()}`);

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

  // Boosters: exact 1x per booster-type te gebruiken over het hele seizoen, en max 1 zelfgekozen
  // booster per GW. Eenmaal geactiveerd op GW X, is de booster VERGRENDELD op GW X — pas als hij op
  // die exacte GW opnieuw aangeklikt wordt (annuleren) komt hij weer vrij. Op een andere GW aanklikken
  // terwijl hij al elders actief is, doet niets (de UI toont 'm daar disabled, zie TeamPlannerTab.jsx).
  //
  // De bovengrens stond op GW7, uit de tijd dat het seizoen in dit bestand niet verder liep. Nu de
  // volledige kalender erin zit, mag je een booster op elke speeldag plaatsen.
  //
  // Op een automatische Recharge-GW (AUTO_RECHARGE_GWS: GW8, GW20, GW27) loopt de Recharge sowieso al
  // voor iedereen. Je eigen Recharge-booster daar verbruiken zou die dus weggooien, vandaar geblokkeerd
  // — de twee andere boosters mogen er wél bovenop, dat is precies het voordeel van zo'n speeldag.
  const toggleTeamPlannerBooster = (boosterKey, gw) => {
    if (gw < 1 || gw > GW_COUNT) return;
    if (boosterKey === 'recharge' && AUTO_RECHARGE_GWS.has(gw)) return;
    setTeamPlannerBoosters(prev => {
      if (prev[boosterKey] === gw) {
        return { ...prev, [boosterKey]: null }; // annuleren, enkel mogelijk op de GW waar hij actief is
      }
      if (prev[boosterKey] != null) return prev; // al verbruikt op een andere GW — geblokkeerd
      const updated = { ...prev, [boosterKey]: gw };
      // Max 1 zelfgekozen booster per GW: een andere booster die toevallig al op déze GW actief stond,
      // wordt vervangen (niet gestapeld) — user-bevestigd gedrag. De automatische Recharge telt hier
      // niet in mee; die staat niet in deze state.
      Object.keys(updated).forEach(key => {
        if (key !== boosterKey && updated[key] === gw) updated[key] = null;
      });
      return updated;
    });
  };

  // Wissen in de planner gebeurt meteen, met "Ongedaan maken" in een melding (8 s) in plaats van een
  // bevestigingsvenster (spec A3): window.confirm toonde altijd Nederlands, ook op de Franse en Engelse
  // site, en een melding met undo is sneller en even veilig. De melding bewaart een kopie van wat er
  // stond, zodat ongedaan maken alles exact terugzet.
  const [plannerNotice, setPlannerNotice] = useState(null);
  const plannerNoticeTimerRef = useRef(null);
  const showPlannerNotice = (notice) => {
    setPlannerNotice(notice);
    if (plannerNoticeTimerRef.current) clearTimeout(plannerNoticeTimerRef.current);
    plannerNoticeTimerRef.current = setTimeout(() => setPlannerNotice(null), 8000);
  };
  useEffect(() => () => { if (plannerNoticeTimerRef.current) clearTimeout(plannerNoticeTimerRef.current); }, []);

  // Wist de volledige 15-koppige selectie EN alle daaraan gekoppelde state (bank/kapitein per GW,
  // transfer-tijdlijn, boosters) — anders zou die achterblijven en verwijzen naar nu-lege slots (bv.
  // "GW3 kapitein = slot 5" terwijl slot 5 leeg is).
  const handleClearTeamPlanner = () => {
    showPlannerNotice({
      kind: 'teamCleared',
      snapshot: {
        players: teamPlannerPlayers,
        benchByGw: teamPlannerBenchByGw,
        captainByGw: teamPlannerCaptainByGw,
        transfersBySlot: teamPlannerTransfersBySlot,
        boosters: teamPlannerBoosters,
      },
    });
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
  // teamPlannerTransferHistory.
  const handleClearTeamPlannerTransfers = () => {
    showPlannerNotice({ kind: 'transfersCleared', snapshot: { transfersBySlot: teamPlannerTransfersBySlot } });
    setTeamPlannerTransfersBySlot({});
  };

  const handleUndoPlannerNotice = () => {
    const snapshot = plannerNotice?.snapshot;
    if (!snapshot) return;
    if (snapshot.players) setTeamPlannerPlayers(snapshot.players);
    if (snapshot.benchByGw) setTeamPlannerBenchByGw(snapshot.benchByGw);
    if (snapshot.captainByGw) setTeamPlannerCaptainByGw(snapshot.captainByGw);
    if (snapshot.transfersBySlot) setTeamPlannerTransfersBySlot(snapshot.transfersBySlot);
    if (snapshot.boosters) setTeamPlannerBoosters(snapshot.boosters);
    setPlannerNotice(null);
    if (plannerNoticeTimerRef.current) clearTimeout(plannerNoticeTimerRef.current);
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
    <I18nContext.Provider value={i18nValue}>
    <div style={{ minHeight: '100vh', background: 'var(--ink-0)', fontFamily: 'var(--font-ui)', position: 'relative' }}>

      <AppShell
        t={t}
        language={language}
        languages={LANGUAGES}
        onChangeLanguage={changeLanguage}
        activeTab={activeTab}
        onNavigate={navigateToTab}
        hrefFor={(key) => pathForRoute(key, language)}
        deadlineGw={CURRENT_GW}
        deadlineRemaining={deadlineRemaining}
        deadlinePassed={deadlinePassed}
        nextGw={CURRENT_GW < GW_COUNT ? CURRENT_GW + 1 : null}
        minileagueCode={MINILEAGUE_CODE}
        onCopyMinileague={handleCopyMinileagueCode}
        minileagueCopied={minileagueCodeCopied}
        newMarkerTab={PREDICTED_LINEUPS_GW === CURRENT_GW && deadlineRemaining ? 'predictedlineups' : null}
        lastUpdated={formatLastUpdatedLong(language)}
      >

        {activeTab === 'fdr' && (
          <FDRTab
            t={t}
            ratings={ratings}
            homeAdvantage={homeAdvantage}
            updateRating={updateRating}
            toggleHomeAdvantage={toggleHomeAdvantage}
            isCustom={isCustom}
            ownRatings={ownRatings}
            ratingOverrides={ratingOverrides}
            homeOverrides={homeOverrides}
            resetRating={resetRating}
            isViewingShared={isViewingShared}
            adoptSharedRatings={adoptSharedRatings}
            leaveSharedRatings={leaveSharedRatings}
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
            showAvgColumn={showAvgColumn}
            toggleAvgColumn={toggleAvgColumn}
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
            compareTableSlots={compareTableSlots}
            compareGwStart={compareGwStart}
            compareGwEnd={compareGwEnd}
            mainTableSlots={mainTableSlots}
            displayedTeams={displayedTeams}
            teamAvgDifficulty={teamAvgDifficulty}
            tableRef={tableRef}
            rangeStart={rangeStart}
            setRangeStart={setRangeStart}
            rangeEnd={rangeEnd}
            setRangeEnd={setRangeEnd}
            bestRuns={bestRuns}
            compareTeams={compareTeams}
            teamForm={teamForm}
            toggleCompareTeam={toggleCompareTeam}
            onOpenClub={openClubSheet}
          />
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
            isPlayerWatched={isPlayerWatched}
            toggleWatchlistPlayer={toggleWatchlistPlayer}
          />
          </Suspense>
        )}

        {activeTab === 'predictedlineups' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <PredictedLineupsTab t={t} language={language} onOpenPlayer={openPlayerSheet} onOpenClub={openClubSheet} />
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
              isPlayerInMyTeam={isPlayerInMyTeam}
              hasMyTeam={myTeamPlayerKeys.size > 0}
              hasWatchlist={watchlist.length > 0}
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
              isPlayerInMyTeam={isPlayerInMyTeam}
              hasMyTeam={myTeamPlayerKeys.size > 0}
              hasWatchlist={watchlist.length > 0}
              onOpenPlayer={openPlayerSheet}
              onOpenClub={openClubSheet}
            />
          </Suspense>
        )}

        {activeTab === 'spelers' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <SpelersTab
              key={spelersMountKey}
              t={t}
              ratings={ratings}
              homeAdvantage={homeAdvantage}
              playerDatabase={playerDatabase}
              watchlist={watchlist}
              onRemoveWatchlistPlayer={handleRemoveWatchlistPlayer}
              setPiecesEntries={setPiecesData.entries}
              onGoToTeamPlanner={() => navigateToTab('teamplanner')}
              isPlayerWatched={isPlayerWatched}
              isPlayerInMyTeam={isPlayerInMyTeam}
              toggleWatchlistPlayer={toggleWatchlistPlayer}
              hasMyTeam={myTeamPlayerKeys.size > 0}
              hasWatchlist={watchlist.length > 0}
              onOpenClub={openClubSheet}
            />
          </Suspense>
        )}

        {activeTab === 'klassement' && (
          <Suspense fallback={<TabLoading text={t('shared.loading')} />}>
            <KlassementTab
              t={t}
              minileagueCode={MINILEAGUE_CODE}
              onCopyMinileague={handleCopyMinileagueCode}
              minileagueCopied={minileagueCodeCopied}
            />
          </Suspense>
        )}


      </AppShell>

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
            teamForm={teamForm}
            onOpenPlayer={openPlayerSheet}
          />
        </Suspense>
      )}

      {/* Uitleg bij de FDR (ⓘ in de toolbar): sinds de rework een Sheet, net als alle andere panelen. */}
      {showInfo && (
        <Sheet titleId="fdr-info-title" title={t('infoModal.title')} closeLabel={t('infoModal.close')} onClose={() => setShowInfo(false)}>
          <div className="ui-prose">
            <p>{t('infoModal.p1')}</p>
            <p>{t('infoModal.p2')}</p>
            <p>{t('infoModal.p3')}</p>
          </div>
        </Sheet>
      )}

      {/* Melding na een watch-list-wijziging (spec §5.10: omgekeerde toast, boven de onderbalk op gsm).
          Verdwijnt vanzelf na 8 seconden. "Ongedaan maken" hoort enkel bij een verwijdering: een
          toevoeging draai je terug door de ster nog eens aan te tikken. */}
      {plannerNotice && (
        <div role="status" aria-live="polite" className="ui-toast">
          <p className="ui-toast__text">{t(`teamPlanner.notice.${plannerNotice.kind}`)}</p>
          <button type="button" onClick={handleUndoPlannerNotice} className="ui-toast__action">
            {t('undo.action')}
          </button>
          <button type="button" onClick={() => setPlannerNotice(null)} aria-label={t('undo.closeAria')} className="ui-toast__close">
            <X aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      )}
      {watchlistNotice && !plannerNotice && (
        <div role="status" aria-live="polite" className="ui-toast">
          <p className="ui-toast__text">
            <strong>{watchlistNotice.player.name}</strong>{' '}
            {watchlistNotice.kind === 'removed' ? t('undo.removedSuffix') : t('watchlist.addedSuffix')}
          </p>
          {watchlistNotice.kind === 'removed' && (
            <button type="button" onClick={handleUndoRemoveWatchlistPlayer} className="ui-toast__action">
              {t('undo.action')}
            </button>
          )}
          {/* Na een toevoeging: rechtstreeks naar de watchlist (Spelers, filter "Watchlist"). */}
          {watchlistNotice.kind !== 'removed' && (
            <button
              type="button"
              className="ui-toast__action"
              onClick={() => { setWatchlistNotice(null); setSheet(null); setPendingPlayerSlug(null); openWatchlistInSpelers(); }}
            >
              {t('watchlist.viewAction')}
            </button>
          )}
          <button type="button" onClick={() => setWatchlistNotice(null)} aria-label={t('undo.closeAria')} className="ui-toast__close">
            <X aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      )}

      {showWatchlistMoved && !watchlistNotice && !showHomeAdvantageIntro && (
        <div role="status" aria-live="polite" className="ui-toast">
          <p className="ui-toast__text">
            {t('watchlistMoved.lead')} <strong>{t('watchlistMoved.place')}</strong> {t('watchlistMoved.tail')}
          </p>
          <button type="button" onClick={openWatchlistInSpelers} className="ui-toast__action">
            {t('watchlistMoved.action')}
          </button>
          <button type="button" onClick={() => setShowWatchlistMoved(false)} aria-label={t('undo.closeAria')} className="ui-toast__close">
            <X aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      )}

      {showHomeAdvantageIntro && (
        <div role="status" className="ui-toast">
          <p className="ui-toast__text">
            <strong>{t('fdr.homeAdvantage')}</strong> {t('homeAdvantageToast.bodySuffix')}
          </p>
          <button type="button" onClick={() => setShowHomeAdvantageIntro(false)} aria-label={t('homeAdvantageToast.closeAria')} className="ui-toast__close">
            <X aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      )}
    </div>
    </I18nContext.Provider>
  );
}
