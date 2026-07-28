import { useState, useMemo, useRef, useCallback, useEffect, useId, memo } from 'react';
import { createPortal } from 'react-dom';
import { RotateCcw, TrendingUp, Info, X, Link2, Download, Check, ChevronDown, ArrowUpDown, Settings2, Grid2x2, Scale } from 'lucide-react';
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
  LOM: 1, KOR: 1, BEV: 1, LLV: 1,
  ZWA: 2, OHL: 2, CER: 2,
  STA: 3, KVM: 3, WES: 3, CHA: 3, ANT: 3, STV: 3,
  GNK: 4, AND: 4, GNT: 4,
  USG: 5, CLU: 5,
};

const RATING_STYLE = {
  1: { bg: '#1F7A4D', text: '#EAFBF1', label: 'Makkelijkst' },
  2: { bg: '#5BAE7A', text: '#0B2E1B', label: 'Makkelijk' },
  3: { bg: '#E8C547', text: '#3D2E00', label: 'Gemiddeld' },
  4: { bg: '#E08A3E', text: '#2E1500', label: 'Moeilijk' },
  5: { bg: '#C2402C', text: '#FBEAE7', label: 'Moeilijkst' },
};

const GW_COUNT = 8;
const LAST_UPDATED = '28 juli 2026';
const STORAGE_KEY = 'fpl_proleague_fdr_ratings_v1';

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

function average(numbers) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

function getFixtureScores(teamCode, fixtures, ratings, startGW) {
  return fixtures.map((f, idx) => {
    const gwNumber = startGW + idx;
    if (POSTPONED.has(`${teamCode}-${gwNumber}`)) return 5; // gemiste speeldag = nadeel, telt als moeilijkst
    return ratings[f.split('-')[0]] ?? 3;
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
  return `${home} - ${away} is ${reason}.`;
}

function getFixtureInfo(teamCode, fixture, gwNumber, ratings) {
  const [opp, venue] = fixture.split('-');
  const key = `${teamCode}-${gwNumber}`;
  const isPostponed = POSTPONED.has(key);
  const isPossiblyPostponed = !isPostponed && POSSIBLY_POSTPONED.has(key);
  const style = isPostponed ? null : RATING_STYLE[ratings[opp] ?? 3];
  const postponedText = isPostponed ? buildPostponedTooltipText(teamCode, opp, venue) : null;
  const possiblyPostponedText = isPossiblyPostponed ? buildPossiblyPostponedTooltipText(teamCode, opp, venue) : null;
  return { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText };
}

const selectStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '4px 8px', fontSize: '12px'
};

const sectionToggleButtonStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
  background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
};

const sectionTitleStyle = {
  color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0,
  display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
};

const secondaryToolbarBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'transparent', color: '#C9B8E0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px',
  fontWeight: 600, fontSize: '13px', cursor: 'pointer'
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

export default function FDRTool() {
  const [ratings, setRatings] = useState(() => loadRatingsFromURL() || loadStoredRatings() || DEFAULT_RATINGS);
  const [rangeStart, setRangeStart] = useState(1);
  const [rangeEnd, setRangeEnd] = useState(5);
  const [saved, setSaved] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [openSections, setOpenSections] = useState({
    sliders: false,
    table: true,
    runs: false,
    compare: false,
  });
  const [sortByDifficulty, setSortByDifficulty] = useState(false);
  const [compareTeams, setCompareTeams] = useState([]);
  const tableRef = useRef(null);

  // isCustom volgt exact of ratings de gedeelde DEFAULT_RATINGS-referentie is (zie updateRating/handleReset).
  const isCustom = ratings !== DEFAULT_RATINGS;

  const updateRating = (code, value) => {
    setRatings(prev => ({ ...prev, [code]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ratings));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // storage unavailable — silently ignore, ratings still work this session
    }
  };

  const handleReset = () => {
    setRatings(DEFAULT_RATINGS);
    try {
      window.localStorage?.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('r');
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore
    }
  };

  const handleCopyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('r', encodeRatingsToParam(ratings));
      window.history.replaceState({}, '', url.toString());
      await navigator.clipboard.writeText(url.toString());
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
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
      const scores = getFixtureScores(team.code, fixtures, ratings, start);
      return { ...team, avg: average(scores), fixtures, startGW: start };
    });
    return results.sort((a, b) => a.avg - b.avg).slice(0, 5);
  }, [ratings, rangeStart, rangeEnd]);

  const teamAvgDifficulty = useMemo(() => {
    const map = {};
    TEAMS.forEach(team => {
      map[team.code] = average(getFixtureScores(team.code, FIXTURES[team.code], ratings, 1));
    });
    return map;
  }, [ratings]);

  const displayedTeams = useMemo(() => {
    if (!sortByDifficulty) return TEAMS;
    return TEAMS.slice().sort((a, b) => teamAvgDifficulty[a.code] - teamAvgDifficulty[b.code]);
  }, [sortByDifficulty, teamAvgDifficulty]);

  const toggleCompareTeam = (code) => {
    setCompareTeams(prev => {
      if (prev.includes(code)) return prev.filter(c => c !== code);
      if (prev.length >= 3) return prev;
      return [...prev, code];
    });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#2A1440', fontFamily: "'Archivo', 'Arial Black', sans-serif" }}>
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
          top: -4px;
          right: -4px;
          font-size: 13px;
          font-weight: 900;
          line-height: 1;
          color: inherit;
          pointer-events: none;
        }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #4ECDC4; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: #3D1E5C; }
        .fdr-toolbar-buttons {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
        }
        .fdr-toolbar-row {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        @media (max-width: 640px) {
          .club-logo {
            display: none !important;
          }
          .fdr-section-title {
            font-size: 14px !important;
            gap: 6px !important;
          }
          .fdr-toolbar-spacer {
            display: none !important;
          }
          .fdr-toolbar-buttons {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .fdr-toolbar-btn {
            width: 100% !important;
          }
          .fdr-toolbar-row {
            display: flex !important;
            width: 100% !important;
            gap: 8px !important;
          }
          .fdr-toolbar-row .fdr-toolbar-btn {
            flex: 1 !important;
          }
        }

      `}</style>

      <div style={{
        position: 'absolute', top: 0, left: 0, width: '220px', height: '220px',
        backgroundImage: 'radial-gradient(#4ECDC4 1.5px, transparent 1.5px)',
        backgroundSize: '18px 18px', opacity: 0.25, pointerEvents: 'none'
      }} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 32px', position: 'relative' }}>

        <header style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span style={{ color: '#4ECDC4', fontWeight: 700, letterSpacing: '0.08em', fontSize: '13px', textTransform: 'uppercase' }}>
              @fpl_proleague
            </span>
            <span style={{ color: '#7A5A9E', fontSize: '13px' }}>·</span>
            <span style={{ color: '#B79ED4', fontSize: '13px' }}>Fantasy Pro League 26/27</span>
          </div>
          <h1 className="fdr-title" style={{
            color: '#FFFFFF', fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900,
            textTransform: 'uppercase', lineHeight: 1.05, margin: 0, letterSpacing: '-0.01em'
          }}>
            FDR Tool <span style={{ color: '#4ECDC4' }}>GW1–{GW_COUNT}</span>
          </h1>
          <p style={{ color: '#C9B8E0', fontSize: '15px', marginTop: '10px', maxWidth: '640px' }}>
            Mijn eigen fixture difficulty ratings — pas ze aan naar jouw mening en ontdek meteen welke teams de beste run hebben.
          </p>
        </header>

        <div className="fdr-toolbar" style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
          marginBottom: '24px', padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px'
        }}>
          <span className="fdr-status-badge" style={{
            fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
            background: isCustom ? '#4ECDC4' : 'rgba(255,255,255,0.1)',
            color: isCustom ? '#0B2E1B' : '#C9B8E0'
          }}>
            {isCustom ? 'JOUW AANGEPASTE VERSIE' : 'STANDAARD — RATING VAN @FPL_PROLEAGUE'}
          </span>
          <div className="fdr-toolbar-spacer" style={{ flex: 1 }} />
          <div className="fdr-toolbar-buttons">
          <button onClick={handleCopyLink} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
            {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
            {linkCopied ? 'Link gekopieerd!' : 'Kopieer link'}
          </button>
          <button onClick={handleDownloadImage} disabled={downloading} className="fdr-toolbar-btn" style={{
            ...secondaryToolbarBtnStyle,
            cursor: downloading ? 'default' : 'pointer',
            opacity: downloading ? 0.6 : 1
          }}>
            <Download size={14} />
            {downloading ? 'Bezig...' : 'Download als afbeelding'}
          </button>
          <button onClick={handleSave} className="fdr-toolbar-btn" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#4ECDC4', color: '#0B2E1B',
            border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px',
            cursor: 'pointer'
          }}>
            {saved ? 'Opgeslagen ✓' : 'Bewaar in browser'}
          </button>
          <div className="fdr-toolbar-row">
          <button onClick={handleReset} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
            <RotateCcw size={14} /> Reset FDR
          </button>
          <button onClick={() => setShowInfo(true)} aria-label="Uitleg" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
            background: 'transparent', color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', cursor: 'pointer', flexShrink: 0
          }}>
            <Info size={16} />
          </button>
          </div>
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
                return (
                  <div key={team.code} style={{
                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', padding: '8px 10px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 600 }}>{team.code}</span>
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
              display: 'flex', alignItems: 'center', gap: '6px', background: sortByDifficulty ? '#4ECDC4' : 'transparent',
              color: sortByDifficulty ? '#0B2E1B' : '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '6px 12px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
              marginBottom: '10px'
            }}>
              <ArrowUpDown size={13} />
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
                        getFixtureInfo(team.code, f, i + 1, ratings);
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
                  <div style={{ minWidth: '130px' }}>
                    <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px' }}>{team.name}</div>
                    <div style={{ color: '#8F79AD', fontSize: '11px' }}>Gem. moeilijkheid: {team.avg.toFixed(1)}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {team.fixtures.map((f, i) => {
                      const gwNumber = team.startGW + i;
                      const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText } =
                        getFixtureInfo(team.code, f, gwNumber, ratings);
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
              Kies tot 3 teams om hun fixtures onder elkaar te zien.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '6px', marginBottom: '16px'
            }}>
              {TEAMS_ALPHA.map(team => {
                const selected = compareTeams.includes(team.code);
                const disabled = !selected && compareTeams.length >= 3;
                return (
                  <button key={team.code} onClick={() => toggleCompareTeam(team.code)} disabled={disabled} style={{
                    background: selected ? '#4ECDC4' : 'rgba(255,255,255,0.04)',
                    color: selected ? '#0B2E1B' : disabled ? '#5A4A72' : '#FFF',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                    padding: '6px 4px', fontSize: '12px', fontWeight: 700,
                    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
                  }}>
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
                            {team.code}
                          </td>
                          {FIXTURES[code].map((f, i) => {
                            const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText } =
                              getFixtureInfo(code, f, i + 1, ratings);
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
              <h3 className="fdr-title" style={{ color: '#FFF', fontSize: '16px', margin: 0, textTransform: 'uppercase' }}>Hoe werkt dit?</h3>
              <button onClick={() => setShowInfo(false)} style={{ background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6 }}>
              De kleur van elke fixture komt van de <strong>sterkte-rating van de tegenstander</strong> (1 = makkelijkst, 5 = moeilijkst). Sleep de sliders om een team sterker of zwakker in te schatten — alle fixtures tegen dat team passen automatisch aan, voor alle 18 teams.
            </p>
            <p style={{ color: '#C9B8E0', fontSize: '13px', lineHeight: 1.6, marginTop: '8px' }}>
              "Bewaar in browser" onthoudt jouw versie op dit toestel voor de volgende keer. "Beste fixture runs" toont de 5 teams met de laagste gemiddelde moeilijkheid over de gekozen periode.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
