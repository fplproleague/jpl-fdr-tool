import { useState, useMemo, useRef, useCallback, useEffect, useId, memo } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, TrendingUp, Info, X, Link2, Download, Check, ChevronDown, ArrowUpDown, Settings2, Grid2x2, Scale, Plus, Eye, UserPlus, Copy } from 'lucide-react';
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
  STV: ['LOM-H','CER-A','USG-H','ANT-A','LLV-H','BEV-A','WES-H','KVM-A'],
  STA: ['CER-H','KVM-A','LLV-H','OHL-A','ANT-H','WES-A','GNT-A','CHA-H'],
  USG: ['WES-A','ZWA-H','STV-A','AND-H','CHA-A','LOM-H','ANT-A','OHL-H'],
  WES: ['USG-H','GNK-A','LOM-A','ZWA-H','KVM-A','STA-H','STV-A','ANT-H'],
  ZWA: ['GNK-H','USG-A','BEV-H','WES-A','KOR-A','CHA-H','AND-A','GNT-H'],
};

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

// Tab-navigatie bovenaan de pagina — array-gedreven zodat toekomstige onderdelen naast de FDR-tool
// gewoon een extra entry kunnen worden.
const TABS = [
  { key: 'fdr', label: 'FDR' },
  { key: 'watchlist', label: 'Watchlist' },
  { key: 'playerstatus', label: 'Spelerstatus' },
  { key: 'teamplanner', label: 'Team Planner' },
  { key: 'pricechanges', label: 'Price Changes' },
];

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
// Onthoudt of de first-time-uitleg over Thuisvoordeel al getoond is, zodat die maar één keer ooit verschijnt.
const HOME_ADVANTAGE_INTRO_SEEN_KEY = 'fpl_proleague_ha_intro_seen_v1';

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
  const [opp, venue] = fixture.split('-');
  const key = `${teamCode}-${gwNumber}`;
  const isPostponed = POSTPONED.has(key);
  const isPossiblyPostponed = !isPostponed && POSSIBLY_POSTPONED.has(key);
  const style = isPostponed ? null : RATING_STYLE[getEffectiveRating(opp, venue, ratings, homeAdvantage)];
  const postponedText = isPostponed ? buildPostponedTooltipText(teamCode, opp, venue) : null;
  const possiblyPostponedText = isPossiblyPostponed ? buildPossiblyPostponedTooltipText(teamCode, opp, venue) : null;
  return { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText };
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
  opp, venue, isPostponed, isPossiblyPostponed, bg, textColor, stacked, postponedText, possiblyPostponedText
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
  const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText } =
    getFixtureInfo(teamCode, fixture, gwNumber, ratings, homeAdvantage);

  if (isPostponed) {
    return (
      <PostponedIndicator
        as="span"
        text={postponedText}
        style={{
          background: '#4A4560', color: '#9B93AD', fontSize: '10px', fontWeight: 700,
          padding: '3px 6px', borderRadius: '5px', cursor: 'pointer'
        }}
      />
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
          padding: '3px 6px', borderRadius: '5px', cursor: 'pointer'
        }}
      >
        {badgeContent}
      </TooltipTrigger>
    );
  }

  return (
    <span style={{
      background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
      padding: '3px 6px', borderRadius: '5px'
    }}>
      {badgeContent}
    </span>
  );
});

export default function FDRTool() {
  const [activeTab, setActiveTab] = useState('fdr');
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
          .fdr-watchlist-fixture-row {
            flex-wrap: nowrap !important;
            justify-content: center !important;
          }
          .fdr-watchlist-fixture-row > span {
            font-size: 9px !important;
            padding: 2px 4px !important;
          }
        }

      `}</style>

      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '480px',
        backgroundImage: 'radial-gradient(#4ECDC4 1.5px, transparent 1.5px)',
        backgroundSize: '18px 18px', opacity: 0.25,
        maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 100%)',
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
        <>
        <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '18px' }}>
          Mijn eigen fixture difficulty ratings — pas ze aan naar jouw mening en ontdek meteen welke teams de beste runs hebben.
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
            {isCustom ? 'JOUW AANGEPASTE VERSIE' : 'RATING VAN @FPL_PROLEAGUE'}
          </span>
          <div className="fpl-toolbar-actions">
          <span className="fpl-toolbar-secondary">
          <button onClick={handleCopyLink} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
            {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
            <span className="fdr-btn-label-full">{linkCopied ? 'Link gekopieerd!' : 'Kopieer link'}</span>
            <span className="fdr-btn-label-short">{linkCopied ? 'Gekopieerd!' : 'Kopieer'}</span>
          </button>
          <button onClick={handleDownloadImage} disabled={downloading} className="fdr-toolbar-btn" style={{
            ...secondaryToolbarBtnStyle,
            cursor: downloading ? 'default' : 'pointer',
            opacity: downloading ? 0.6 : 1
          }}>
            <Download size={14} />
            <span className="fdr-btn-label-full">{downloading ? 'Bezig...' : 'Download als afbeelding'}</span>
            <span className="fdr-btn-label-short">{downloading ? 'Bezig...' : 'Download'}</span>
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
            <span className="fdr-btn-label-full">{saved ? 'Opgeslagen ✓' : 'Bewaar in browser'}</span>
            <span className="fdr-btn-label-short">{saved ? 'Bewaard ✓' : 'Bewaar'}</span>
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
            <SectionHeader icon={Settings2} title="Team-sterkte instellen" sectionKey="sliders" isOpen={openSections.sliders} onToggle={toggleSection} />
            {openSections.sliders && (
            <div style={{
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
            <button onClick={(e) => { e.stopPropagation(); setSortByDifficulty(s => !s); }} style={{
              display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent',
              color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer',
              marginBottom: '10px'
            }}>
              <ArrowUpDown size={14} />
              {sortByDifficulty ? 'Gesorteerd: makkelijkste eerst' : 'Sorteer op makkelijkste run'}
            </button>
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
                      const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText } =
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
                  <span style={{ color: '#C9B8E0', fontSize: '11px' }}>{RATING_STYLE[r].label}</span>
                </div>
              ))}
            </div>
            )}
            </div>
          </section>

          <section>
            <SectionHeader icon={TrendingUp} title="Beste fixture runs" sectionKey="runs" isOpen={openSections.runs} onToggle={toggleSection} />
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
                  display: 'flex', alignItems: 'center', gap: '12px', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px'
                }}>
                  <span className="fdr-title" style={{
                    color: idx === 0 ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '18px', width: '24px'
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
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {team.fixtures.map((f, i) => {
                      const gwNumber = team.startGW + i;
                      const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText } =
                        getFixtureInfo(team.code, f, gwNumber, ratings, homeAdvantage);
                      if (isPostponed) {
                        return (
                          <PostponedIndicator
                            key={i}
                            as="span"
                            text={postponedText}
                            style={{
                              background: '#4A4560', color: '#9B93AD', fontSize: '10px', fontWeight: 700,
                              padding: '3px 6px', borderRadius: '5px', cursor: 'pointer'
                            }}
                          />
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
                            key={i}
                            as="span"
                            text={possiblyPostponedText}
                            style={{
                              background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
                              padding: '3px 6px', borderRadius: '5px', cursor: 'pointer'
                            }}
                          >
                            {badgeContent}
                          </TooltipTrigger>
                        );
                      }
                      return (
                        <span key={i} style={{
                          background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
                          padding: '3px 6px', borderRadius: '5px'
                        }}>
                          {badgeContent}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            </>
            )}
          </section>

          {/* COMPARE TEAMS */}
          <section>
            <SectionHeader icon={Scale} title="Vergelijk teams" sectionKey="compare" isOpen={openSections.compare} onToggle={toggleSection} />
            {openSections.compare && (
            <>
            <p style={{ color: '#8F79AD', fontSize: '12px', marginBottom: '10px' }}>
              Kies tot 5 teams om hun fixtures onder elkaar te zien.
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
              <p style={{ color: '#6B5289', fontSize: '13px' }}>Nog geen teams geselecteerd.</p>
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
                            const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText } =
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
            Hou je favoriete spelers in de gaten — voeg ze toe aan je persoonlijke watchlist, samen met hun eerstvolgende fixtures. Deze lijst slaat automatisch op in je browser.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
            <section>
              <div style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '16px', marginBottom: '20px'
              }}>
              <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
                <UserPlus size={18} color="#4ECDC4" /> Speler toevoegen
              </h2>
              <form onSubmit={handleAddWatchlistPlayer} style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end'
              }}>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px'}}>Naam</span>
                  <input
                    type="text" required value={newPlayerName}
                    onChange={e => setNewPlayerName(e.target.value)}
                    placeholder="Bv. Zorgane"
                    style={watchlistInputStyle}
                  />
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>Team</span>
                  <select required value={newPlayerTeam} onChange={e => setNewPlayerTeam(e.target.value)} style={watchlistInputStyle}>
                    <option value="" disabled>Kies team</option>
                    {TEAMS_ALPHA.map(team => (
                      <option key={team.code} value={team.code}>{team.name}</option>
                    ))}
                  </select>
                </label>
                <label style={{ display: 'grid', gap: '4px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>Prijs (optioneel)</span>
                  <input
                    type="number" inputMode="decimal" step="0.1" min="0" max="12" placeholder="Bv. 8.5"
                    value={newPlayerPrice} onChange={e => setNewPlayerPrice(e.target.value)}
                    style={watchlistInputStyle}
                    placeholder="Bv. 8.5"
                  />
                </label>
                <button type="submit" style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  background: '#4ECDC4', color: '#0B2E1B', border: 'none', borderRadius: '8px',
                  padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                }}>
                  <Plus size={18} /> Toevoegen
                </button>
              </form>
              </div>
            </section>

            <section>
              <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
                <Eye size={18} color="#4ECDC4" /> Mijn watchlist
              </h2>
              {watchlist.length === 0 ? (
                <p style={{ color: '#6B5289', fontSize: '13px' }}>
                  Je watchlist is nog leeg. Voeg spelers toe die je in de gaten wil houden.
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
                        <div className="fdr-watchlist-fixture-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '8px' }}>
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
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '16px'
            }}>
              <p style={{ color: '#C9B8E0', fontSize: '13px', margin: 0 }}>
                Hier komen binnenkort alle relevante updates over spelers die niet beschikbaar zijn.
              </p>
            </div>
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
          Gemaakt door @fpl_proleague · Fantasy Pro League 26/27 · Data eigen analyse<br />
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
              De kleur van elke fixture komt van de <strong>sterkte-rating van de tegenstander</strong> (1 = makkelijkst, 5 = moeilijkst). Sleep de sliders om een team sterker of zwakker in te schatten — alle fixtures tegen dat team passen automatisch aan, voor alle 18 teams.
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
