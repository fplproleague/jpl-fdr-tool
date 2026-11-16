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
  PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv, getFixtureScores, average,
  getGwDeadlineDate, PREDICTED_LINEUPS_GW,
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
import { AvailabilityContext } from './availabilityContext';
import { buildAvailabilityLookup } from './availability';
import { loadPlayers } from './data/playersApi';
import { playerDatabaseFromApi, findInDatabase } from './data/playerDatabase';
import {
  applyOverrides, diffFromDefaults, setOverride, removeOverride, loadOverrides, saveOverrides,
  encodeRatingsParam, decodeRatingsParam, encodeHomeParam, decodeHomeParam,
} from './fdrRatings';
import FDRTab from './tabs/FDRTab';
import {
  loadFdrPeriod, saveFdrPeriod, normalizePeriod, quickPeriod, activeQuickPeriod,
  parseClubsParam, isClubFilterActive,
} from './fdrPeriod';
import useTeamPlanner from './useTeamPlanner';
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
  // Ook de volledige naam (bv. een link gemaakt vanuit de Spelers-tabel) telt.
  const fromDatabase = playerDatabase.find(p => playerSlug(p.name, p.teamCode) === slug)
    ?? playerDatabase.find(p => p.fullName && playerSlug(p.fullName, p.teamCode) === slug);
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
  // Eén periode voor de hele FDR-pagina: de hoofdtabel, de Σ-kolom en "Beste fixture runs" (spec D2).
  // Vroeger waren dat twee aparte periodes met drie kiezers. Standaard de huidige speeldag + 7 (schuift
  // vanzelf mee met CURRENT_GW); een eigen keuze geldt enkel voor dit bezoek (sessionStorage), zodat
  // de standaard volgende week weer klopt.
  const [fdrPeriod, setFdrPeriod] = useState(() => loadFdrPeriod(
    typeof window !== 'undefined' ? window.sessionStorage : null,
    { start: CURRENT_GW, end: DEFAULT_GW_HORIZON_END },
    GW_COUNT,
  ));
  const changeFdrPeriod = useCallback((start, end) => {
    const next = normalizePeriod(start, end, GW_COUNT);
    setFdrPeriod(next);
    try { saveFdrPeriod(window.sessionStorage, next); } catch { /* geen opslag: enkel dit scherm */ }
  }, []);
  const gwHorizonStart = fdrPeriod.start;
  const gwHorizonEnd = fdrPeriod.end;
  const setGwHorizonStart = (v) => changeFdrPeriod(v, fdrPeriod.end);
  const setGwHorizonEnd = (v) => changeFdrPeriod(fdrPeriod.start, v);
  const fdrQuickPeriod = activeQuickPeriod(fdrPeriod, CURRENT_GW, GW_COUNT);
  const chooseFdrQuickPeriod = (n) => {
    const q = quickPeriod(n, CURRENT_GW, GW_COUNT);
    changeFdrPeriod(q.start, q.end);
  };

  // Clubfilter (spec D3, vervangt "Vergelijk teams"): met een deel van de clubs aangevinkt toont de
  // hoofdtabel enkel die clubs. Staat in de URL (?clubs=CLU,AND) zodat je een vergelijking kan delen.
  const [fdrClubs, setFdrClubs] = useState(() => {
    try { return parseClubsParam(new URLSearchParams(window.location.search).get('clubs'), TEAM_CODES); } catch { return []; }
  });
  const fdrClubFilterActive = isClubFilterActive(fdrClubs, TEAM_CODES.length);

  // Meldingen van de FDR-knoppen (spec D4): afbeelding maken mislukt, of klembord geblokkeerd. In dat
  // laatste geval tonen we de link zelf, zodat je hem kan kopiëren.
  const [fdrNotice, setFdrNotice] = useState(null); // null | { kind: 'downloadFailed' } | { kind: 'copyFailed', url }
  useEffect(() => {
    if (fdrNotice?.kind !== 'downloadFailed') return undefined;
    const timer = setTimeout(() => setFdrNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [fdrNotice]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [minileagueCodeCopied, setMinileagueCodeCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [showHomeAdvantageIntro, setShowHomeAdvantageIntro] = useState(false);
  const [openSections, setOpenSections] = useState({
    sliders: false,
    table: true,
    runs: false,
    teamPlannerTransfers: true,
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
  const tableRef = useRef(null);

  // --- Watch list, los van de FDR-state hierboven. Sinds de rework (spec §8) geen eigen tab meer: de
  // ster in Spelers/Bonuspunten/Kaarten/de spelerskiezer voegt toe, en Spelers toont de lijst via de
  // filter "★ Watchlist". Opslag en formaat zijn ongewijzigd.
  const [watchlist, setWatchlist] = useState(() => loadStoredWatchlist());
  const [showWatchlistMoved, setShowWatchlistMoved] = useState(false);
  // Verhogen = de Spelers-tab opnieuw opbouwen, zodat die zijn filters opnieuw uit de URL leest.
  const [spelersMountKey, setSpelersMountKey] = useState(0);

  // Spelersdatabank (Google Sheet CSV) voor de zoek/autocomplete bij teaminvoer — en straks transfers
  // — in Team Planner. Los van de selectie in de planner: dit is de externe, gedeelde spelerslijst
  // om UIT te kiezen, niet de 15-koppige selectie zelf. Niet in localStorage: elke sessie haalt de
  // meest actuele sheet-inhoud op (zie fetchPlayerDatabase hieronder).
  const [playerDatabase, setPlayerDatabase] = useState([]);
  const [playerDatabaseLoading, setPlayerDatabaseLoading] = useState(true);
  const [playerDatabaseError, setPlayerDatabaseError] = useState(null);

  // --- Team Planner (fase C): alle state, opslag (v2) en meldingen zitten in useTeamPlanner.js. ---
  const planner = useTeamPlanner({ playerDatabase, ratings, homeAdvantage, t });

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
    // De link gaat naar het klembord, niet in de eigen adresbalk: anders zou een herlaadbeurt je eigen
    // ratings als "gedeelde link" tonen. Een gekozen clubselectie (?clubs=) gaat mee.
    const url = new URL(window.location.href);
    url.searchParams.set('r', encodeRatingsParam(TEAM_CODES, ratings));
    url.searchParams.set('ha', encodeHomeParam(TEAM_CODES, homeAdvantage));
    const text = url.toString().replace(/%2C/g, ',');
    try {
      await navigator.clipboard.writeText(text);
      setLinkCopied(true);
      setFdrNotice(null);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      // Klembord geblokkeerd (bv. een ingebouwde browser): toon de link om zelf te kopiëren.
      setFdrNotice({ kind: 'copyFailed', url: text });
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
      setFdrNotice({ kind: 'downloadFailed' });
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

  // Horizon van de hoofdtabel (= de ene periode, al genormaliseerd in changeFdrPeriod).
  const gwHorizonRange = fdrPeriod;

  // "Beste fixture runs" volgt dezelfde periode als de hoofdtabel (spec D2).
  const bestRuns = useMemo(() => {
    const { start, end } = gwHorizonRange;
    const results = TEAMS.map(team => {
      const fixtures = FIXTURES[team.code].slice(start - 1, end);
      const scores = getFixtureScores(team.code, fixtures, ratings, homeAdvantage, start);
      return { ...team, avg: average(scores), fixtures, startGW: start };
    });
    // Alle clubs, makkelijkste eerst; de tab toont er standaard 5 en kan uitklappen naar alle 18.
    return results.sort((a, b) => a.avg - b.avg || a.code.localeCompare(b.code));
  }, [ratings, homeAdvantage, gwHorizonRange]);

  // Alle GW-headers voor de huidige taal, één keer per taalwissel opgebouwd. De gewone (niet-klikbare)
  // set is voor "Beste fixture runs", de sorteerbare voor de hoofdtabel.
  const gwHeaderCells = useMemo(() => buildGwHeaderCells(t), [t]);

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

  const runsGwHeaderCells = useMemo(
    () => gwHeaderCells.slice(gwHorizonRange.start - 1, gwHorizonRange.end),
    [gwHeaderCells, gwHorizonRange]
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

  // Met het clubfilter (D3) enkel de gekozen clubs, in dezelfde (gesorteerde) volgorde.
  const visibleTeams = useMemo(
    () => (fdrClubFilterActive ? displayedTeams.filter(team => fdrClubs.includes(team.code)) : displayedTeams),
    [displayedTeams, fdrClubs, fdrClubFilterActive]
  );


  // Clubfilter in de URL zolang je op de FDR-tab staat (andere tabs halen ?clubs= zelf weg, zie
  // TAB_QUERY_PARAMS in routes.js). Niets of alle clubs gekozen = geen parameter.
  useEffect(() => {
    if (activeTab !== 'fdr') return;
    try {
      const url = new URL(window.location.href);
      if (fdrClubFilterActive) url.searchParams.set('clubs', fdrClubs.join(','));
      else url.searchParams.delete('clubs');
      const next = url.pathname + url.search.replace(/%2C/g, ',') + url.hash;
      if (next !== window.location.pathname + window.location.search + window.location.hash) {
        window.history.replaceState(window.history.state, '', next);
      }
    } catch { /* geen URL-ondersteuning: enkel op dit scherm */ }
  }, [activeTab, fdrClubs, fdrClubFilterActive]);

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

  // Haalt de spelersdatabank op (spec B1). Losse useCallback (i.p.v. rechtstreeks in de useEffect
  // hieronder) zodat zowel de automatische fetch bij het laden als de "opnieuw proberen"-knop in
  // TeamPlannerTab.jsx exact dezelfde logica hergebruiken.
  //   1. /api/players: de officiële Fantasy Pro League-data, dezelfde request als de Spelers-tab en de
  //      spelersfoto's (één keer per sessie, zie src/data/playersApi.js).
  //   2. Lukt dat niet: de Google Sheet zoals vroeger. cache: 'no-store', zodat het altijd de meest
  //      actuele sheet-inhoud is.
  //   3. Lukt ook dat niet: de laatste kopie van /api/players in deze browser, als die er is.
  const fetchPlayerDatabase = useCallback(async () => {
    setPlayerDatabaseLoading(true);
    setPlayerDatabaseError(null);
    try {
      const fromApi = await loadPlayers();
      if (fromApi.data && !fromApi.fromLocal) {
        setPlayerDatabase(playerDatabaseFromApi(fromApi.data));
        return;
      }
      try {
        const response = await fetch(PLAYER_DATABASE_CSV_URL, { cache: 'no-store' });
        if (!response.ok) throw new Error('Netwerkfout');
        const text = await response.text();
        // Een gepubliceerde Google Sheet kan bij verkeerde/ingetrokken publish-rechten een HTML-
        // foutpagina teruggeven i.p.v. CSV — die herkennen we hier zodat de UI een duidelijke
        // foutmelding toont i.p.v. stilzwijgend brokkenrijen te parsen.
        if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Onverwacht antwoord');
        const rows = parsePlayerDatabaseCsv(text);
        if (rows.length === 0) throw new Error('Lege sheet');
        setPlayerDatabase(rows);
      } catch (err) {
        if (!fromApi.data) throw err;
        setPlayerDatabase(playerDatabaseFromApi(fromApi.data));
      }
    } catch {
      // Een i18n-sleutel, geen zin: de tabs vertalen hem bij het tonen (spec A3).
      setPlayerDatabaseError('shared.loadError');
    } finally {
      setPlayerDatabaseLoading(false);
    }
  }, []);

  // Beschikbaarheid per speler (spec B2/B3): schorsingen uit de API, twijfel/risico uit de Verwachte
  // XI's (enkel als die voor de komende speeldag gepubliceerd zijn) en één kaart van een schorsing.
  // Via AvailabilityContext beschikbaar voor PlayerCell, de kiezer, de planner en de spelerskaart.
  const availabilityLookup = useMemo(() => {
    const published = PREDICTED_LINEUPS_GW >= CURRENT_GW;
    return buildAvailabilityLookup(playerDatabase, {
      lineups: published ? PREDICTED_LINEUPS : null,
      lineupGw: published ? PREDICTED_LINEUPS_GW : null,
    });
  }, [playerDatabase]);

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
    const price = findInDatabase(playerDatabase, name, teamCode)?.price ?? null;
    const added = { id: createUniqueId(), name, teamCode, price };
    setWatchlist(prev => [...prev, added]);
    showWatchlistNotice({ kind: 'added', player: added });
  };

  const isPlayerWatched = (name, teamCode) =>
    watchlist.some(p => p.name === name && p.teamCode === teamCode);

  // "Zit deze speler in mijn ploeg?" — voor het scope-filter op Bonuspunten en Kaarten (zie
  // ScopeFilter.jsx). Bewust de ploeg van nu (planner.currentTeam) en niet de bekeken GW: die laatste is puur
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
    planner.currentTeam.forEach(p => { if (p?.name) keys.add(normaliseer(p.name, p.teamCode)); });
    return keys;
  }, [planner.currentTeam]);

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

  return (
    <I18nContext.Provider value={i18nValue}>
    <AvailabilityContext.Provider value={availabilityLookup}>
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
            quickPeriod={fdrQuickPeriod}
            chooseQuickPeriod={chooseFdrQuickPeriod}
            visibleGwHeaderCells={visibleGwHeaderCells}
            runsGwHeaderCells={runsGwHeaderCells}
            mainTableSlots={mainTableSlots}
            displayedTeams={visibleTeams}
            clubFilter={fdrClubs}
            clubFilterActive={fdrClubFilterActive}
            setClubFilter={setFdrClubs}
            teamAvgDifficulty={teamAvgDifficulty}
            tableRef={tableRef}
            bestRuns={bestRuns}
            teamForm={teamForm}
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
            planner={planner}
            playerDatabase={playerDatabase}
            playerDatabaseLoading={playerDatabaseLoading}
            playerDatabaseError={playerDatabaseError}
            fetchPlayerDatabase={fetchPlayerDatabase}
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
      {fdrNotice && activeTab === 'fdr' && (
        <div role="status" aria-live="polite" className="ui-toast ui-toast--stack">
          <p className="ui-toast__text">
            {t(fdrNotice.kind === 'copyFailed' ? 'fdr.copyFailed' : 'fdr.downloadFailed')}
          </p>
          {fdrNotice.kind === 'copyFailed' && (
            <input
              className="ui-toast__field"
              type="text"
              readOnly
              value={fdrNotice.url}
              aria-label={t('fdr.copyFailedAria')}
              onFocus={(e) => e.target.select()}
              autoFocus
            />
          )}
          <button type="button" onClick={() => setFdrNotice(null)} aria-label={t('undo.closeAria')} className="ui-toast__close">
            <X aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>
      )}

      {planner.notice && !fdrNotice && (
        <div role="status" aria-live="polite" className="ui-toast">
          <p className="ui-toast__text">{t(`teamPlanner.notice.${planner.notice.key}`, planner.notice.vars)}</p>
          {planner.notice.snapshot && (
            <button type="button" onClick={planner.undoNotice} className="ui-toast__action">
              {t('undo.action')}
            </button>
          )}
          <button type="button" onClick={planner.dismissNotice} aria-label={t('undo.closeAria')} className="ui-toast__close">
            <X aria-hidden="true" strokeWidth={2} />
          </button>
        </div>
      )}
      {watchlistNotice && !planner.notice && (
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
    </AvailabilityContext.Provider>
    </I18nContext.Provider>
  );
}
