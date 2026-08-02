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
  TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_BENCH_SIZE, getFixtureScores, average,
} from './constants';
import FDRTab from './tabs/FDRTab';
import WatchlistTab from './tabs/WatchlistTab';
import PlayerStatusTab from './tabs/PlayerStatusTab';
import TeamPlannerTab from './tabs/TeamPlannerTab';

// Tab-navigatie bovenaan de pagina — array-gedreven zodat toekomstige onderdelen naast de FDR-tool
// gewoon een extra entry kunnen worden.
const TABS = [
  { key: 'fdr', label: 'FDR' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'playerstatus', label: 'Spelerstatus' },
  { key: 'teamplanner', label: 'Team Planner' },
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

// Unieke id per watch-list entry, met een eenvoudige fallback voor browsers zonder crypto.randomUUID.
function createWatchlistId() {
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
// GW2 op de bank staan.
function createEmptyTeamPlannerPlayers() {
  return Array.from({ length: TEAM_PLANNER_SQUAD_SIZE }, () => ({
    name: '', teamCode: '', position: '', price: '',
  }));
}

// Leest het volledige, opgeslagen Team Planner-blok (spelers + per-GW bank/kapitein) in één keer in,
// zodat de 3 useState-initializers hieronder er stuk voor stuk uit kunnen putten.
function loadStoredTeamPlanner() {
  const empty = { players: createEmptyTeamPlannerPlayers(), benchByGw: {}, captainByGw: {} };
  try {
    const raw = window.localStorage?.getItem(TEAM_PLANNER_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    // Oudere opslag (vóór per-GW bank/kapitein) was gewoon het spelers-array zelf, met een
    // "isBench"-veld per speler dat nu vervallen is — dat veld wordt hier stilzwijgend genegeerd.
    const rawPlayers = Array.isArray(parsed) ? parsed : parsed?.players;
    const players = Array.isArray(rawPlayers) && rawPlayers.length === TEAM_PLANNER_SQUAD_SIZE
      ? rawPlayers.map(p => ({
          name: p?.name ?? '', teamCode: p?.teamCode ?? '', position: p?.position ?? '', price: p?.price ?? '',
        }))
      : empty.players;
    const benchByGw = (!Array.isArray(parsed) && parsed?.benchByGw && typeof parsed.benchByGw === 'object') ? parsed.benchByGw : {};
    const captainByGw = (!Array.isArray(parsed) && parsed?.captainByGw && typeof parsed.captainByGw === 'object') ? parsed.captainByGw : {};
    return { players, benchByGw, captainByGw };
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
  // Geselecteerde gameweek voor de veld-weergave — bewust NIET opgeslagen (localStorage), start
  // altijd op GW1 bij het (her)laden van de pagina, zelfde patroon als gwHorizonStart/End in de FDR-tab.
  const [teamPlannerGw, setTeamPlannerGw] = useState(1);

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

  // Telt hoeveel slots per positie al gekozen zijn — een slot telt mee zodra de positie-dropdown
  // een waarde heeft, ongeacht of naam/team/prijs ook al ingevuld zijn.
  const teamPlannerPositionCounts = useMemo(() => {
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    teamPlannerPlayers.forEach(p => {
      if (p.position) counts[p.position] += 1;
    });
    return counts;
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
  // teamPlannerPositionCounts/teamPlannerClubCounts hierboven.
  const teamPlannerFormationCounts = useMemo(() => {
    const bench = teamPlannerBenchByGw[teamPlannerGw] ?? [];
    const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    teamPlannerPlayers.forEach((p, index) => {
      if (!p.position || bench.includes(index)) return;
      counts[p.position] += 1;
    });
    return counts;
  }, [teamPlannerPlayers, teamPlannerBenchByGw, teamPlannerGw]);

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
  // Spelers + per-GW bank/kapitein worden samen als één blok opgeslagen (zie loadStoredTeamPlanner).
  useEffect(() => {
    try {
      window.localStorage?.setItem(TEAM_PLANNER_STORAGE_KEY, JSON.stringify({
        players: teamPlannerPlayers, benchByGw: teamPlannerBenchByGw, captainByGw: teamPlannerCaptainByGw,
      }));
    } catch {
      // storage unavailable — silently ignore, team planner still works this session
    }
  }, [teamPlannerPlayers, teamPlannerBenchByGw, teamPlannerCaptainByGw]);

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

  // Kapitein is per GW: klikken op de huidige kapitein heft de band op, klikken op een andere
  // basisspeler verplaatst 'm. Een bankspeler kan geen kapitein worden (zie PlayerPitchCard, die de
  // knop enkel toont voor niet-gebankte spelers).
  const setTeamPlannerCaptain = (index) => {
    setTeamPlannerCaptainByGw(prev => {
      const updated = { ...prev };
      if (updated[teamPlannerGw] === index) {
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
                  borderBottom: isActive ? '2px solid #4ECDC4' : '2px solid transparent'
                }}
              >
                {tab.label}
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
          />
        )}

        {activeTab === 'playerstatus' && <PlayerStatusTab />}

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
            teamPlannerPositionCounts={teamPlannerPositionCounts}
            teamPlannerClubCounts={teamPlannerClubCounts}
            teamPlannerFormationCounts={teamPlannerFormationCounts}
          />
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
