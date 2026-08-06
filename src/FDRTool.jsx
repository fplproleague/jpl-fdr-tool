// Hoofdbestand van de FDR-tool: pagina-chrome (header, minileague-code, tab-navigatie, footer, info-
// modal, Thuisvoordeel-toast) en alle gedeelde/persistente state die de tabs nodig hebben (ratings,
// homeAdvantage, watchlist, ...). De tab-specifieke content zelf zit in src/tabs/*.jsx en ontvangt
// die state + handlers als props — geen lokale state daar, want die tabs worden conditioneel
// gemount/unmount bij het wisselen van tab.

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Info, X, Check, Copy } from 'lucide-react';
import html2canvas from 'html2canvas';
import {
  TEAMS, FIXTURES, GW_COUNT, DEFAULT_GW_HORIZON_END, MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS,
  MINILEAGUE_CODE, LAST_UPDATED, GW_INDEXES, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE,
  TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_SLOT_POSITIONS, VALID_FORMATIONS,
  resolveSlotPlayerAtGw, PLAYER_DATABASE_CSV_URL, parsePlayerDatabaseCsv, getFixtureScores, average,
  POSTPONED,
} from './constants';
import FDRTab from './tabs/FDRTab';
import WatchlistTab from './tabs/WatchlistTab';
import TeamPlannerTab from './tabs/TeamPlannerTab';
import PredictedLineupsTab from './tabs/PredictedLineupsTab';

// Tab-navigatie bovenaan de pagina — array-gedreven zodat toekomstige onderdelen naast de FDR-tool
// gewoon een extra entry kunnen worden.
const TABS = [
  { key: 'fdr', label: 'FDR' },
  { key: 'teamplanner', label: 'Team Planner', isNew: true },
  { key: 'predictedlineups', label: 'Predicted Lineups', isNew: true },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'pricechanges', label: 'Price Changes' },
];

const STORAGE_KEY = 'fpl_proleague_fdr_ratings_v1';
const HOME_ADVANTAGE_STORAGE_KEY = 'fpl_proleague_fdr_home_advantage_v1';
// Eigen storage key voor de watch list — los van de FDR-ratings hierboven, zodat ze elkaar niet raken.
const WATCHLIST_STORAGE_KEY = 'fpl_proleague_watchlist_v1';
// Onthoudt of de first-time-uitleg over Thuisvoordeel al getoond is, zodat die maar één keer ooit verschijnt.
const HOME_ADVANTAGE_INTRO_SEEN_KEY = 'fpl_proleague_ha_intro_seen_v1';
// Eigen storage key voor de Team Planner — los van de watch list hierboven.
const TEAM_PLANNER_STORAGE_KEY = 'fpl_proleague_teamplanner_v1';

// Statische GW-headers, eenmalig opgebouwd — nodig voor visibleGwHeaderCells (hoofdtabel-horizon,
// zie hieronder) en doorgegeven aan FDRTab voor de vergelijk-tabel (die altijd alle GW's toont).
// Blijft hier i.p.v. in constants.js: dat is een .js-bestand en Vite/esbuild parsen JSX-syntax
// enkel in .jsx-bestanden.
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

export default function FDRTool() {
  const [activeTab, setActiveTab] = useState('fdr');
  const [ratings, setRatings] = useState(() => loadRatingsFromURL() || loadStoredRatings() || DEFAULT_RATINGS);
  const [homeAdvantage, setHomeAdvantage] = useState(() => loadHomeAdvantageFromURL() || loadStoredHomeAdvantage() || DEFAULT_HOME_ADVANTAGE);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(5);
  // GW-horizon van de hoofdtabel (Fixture Difficulty Rating) — los van rangeStart/rangeEnd hierboven,
  // die enkel "Beste fixture runs" sturen. Start standaard op GW1-DEFAULT_GW_HORIZON_END; de
  // gebruiker kan dit zelf nog verruimen tot GW_COUNT via de selector. Bewust NIET opgeslagen
  // (localStorage/deelbare link) — een tijdelijke weergave-instelling per sessie, geen permanente voorkeur.
  const [gwHorizonStart, setGwHorizonStart] = useState(1);
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
  // altijd op GW1 bij het (her)laden van de pagina, zelfde patroon als gwHorizonStart/End in de FDR-tab.
  const [teamPlannerGw, setTeamPlannerGw] = useState(1);

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

  // Enkel de GW-headers binnen de gekozen horizon — gwHeaderCells zelf blijft ongewijzigd (de
  // vergelijk-tabel verderop toont nog altijd alle GW1-GW_COUNT, los van deze instelling).
  const visibleGwHeaderCells = useMemo(
    () => gwHeaderCells.slice(gwHorizonRange.start - 1, gwHorizonRange.end),
    [gwHorizonRange]
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

  const handleRemoveWatchlistPlayer = (id) => {
    setWatchlist(prev => prev.filter(p => p.id !== id));
  };

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
        .fdr-spin { animation: fdr-spin 0.8s linear infinite; }
        @keyframes fdr-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
          }
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

        <header className="fdr-header" style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '14px' }}>
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
              Interactieve tools voor Fantasy Pro League — gemaakt door @fpl_proleague.
            </p>
          </div>
        </header>

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
                  borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent',
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                }}
              >
                {tab.label}
                {tab.isNew && (
                  <span
                    title="Nieuw"
                    style={{
                      width: '6px', height: '6px', borderRadius: '50%',
                      background: '#4ECDC4', flexShrink: 0,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {activeTab === 'fdr' && (
          <FDRTab
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
            gwHeaderCells={gwHeaderCells}
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
          <WatchlistTab
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
        )}

        {activeTab === 'teamplanner' && (
          <TeamPlannerTab
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
            planTeamPlannerTransfer={planTeamPlannerTransfer}
            removeTeamPlannerTransfer={removeTeamPlannerTransfer}
            handleOptimizeTeamPlannerLineup={handleOptimizeTeamPlannerLineup}
            teamPlannerOptimized={teamPlannerOptimized}
            teamPlannerBoosters={teamPlannerBoosters}
            toggleTeamPlannerBooster={toggleTeamPlannerBooster}
            handleClearTeamPlanner={handleClearTeamPlanner}
            swapTeamPlannerBenchPlayers={swapTeamPlannerBenchPlayers}
          />
        )}

        {activeTab === 'predictedlineups' && <PredictedLineupsTab />}

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
          Gemaakt door{' '}
          <a href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer" className="fdr-footer-link">
            <img src="/x-logo.png" alt="" style={{ width: '12px', height: '12px', verticalAlign:'-2px' }} />
            @fpl_proleague
          </a>
          {' '}· Fantasy Pro League 26/27 · Data eigen analyse<br />
          Laatst bijgewerkt: {LAST_UPDATED}
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
