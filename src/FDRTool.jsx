import React, { useState, useMemo, useRef } from 'react';
import { RotateCcw, TrendingUp, Info, X, Link2, Download, Check, ChevronDown } from 'lucide-react';
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
const LAST_UPDATED = '26 juli 2026';
const STORAGE_KEY = 'fpl_proleague_fdr_ratings_v1';

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
  const [isCustom, setIsCustom] = useState(() => {
    return !!(loadRatingsFromURL() || loadStoredRatings());
  });
  const tableRef = useRef(null);

  const updateRating = (code, value) => {
    setRatings(prev => ({ ...prev, [code]: value }));
    setIsCustom(true);
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
    setIsCustom(false);
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

    const prevWidth = el.style.width;
    const prevMaxWidth = el.style.maxWidth;
    const prevOverflow = el.style.overflow;
    el.style.width = `${el.scrollWidth}px`;
    el.style.maxWidth = 'none';
    el.style.overflow = 'visible';
    el.scrollLeft = 0;

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
      el.style.width = prevWidth;
      el.style.maxWidth = prevMaxWidth;
      el.style.overflow = prevOverflow;
      if (!wasOpen) {
        setOpenSections(prev => ({ ...prev, table: false }));
      }
      setDownloading(false);
    }
  };

  const toggleSection = (key) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const bestRuns = useMemo(() => {
    const start = Math.min(rangeStart, rangeEnd);
    const end = Math.max(rangeStart, rangeEnd);
    const results = TEAMS.map(team => {
            const slice = FIXTURES[team.code].slice(start - 1, end);
      const scores = slice.map((f, idx) => {
        const gwNumber = start + idx;
        if (POSTPONED.has(`${team.code}-${gwNumber}`)) return 5; // gemiste speeldag = nadeel, telt als moeilijkst
        return ratings[f.split('-')[0]] ?? 3;
      });
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { ...team, avg, fixtures: slice, scores, startGW: start };
    });
    return results.sort((a, b) => a.avg - b.avg).slice(0, 5);
  }, [ratings, rangeStart, rangeEnd]);
    const teamAvgDifficulty = useMemo(() => {
    const map = {};
    TEAMS.forEach(team => {
      const scores = FIXTURES[team.code].map((f, idx) => {
        const gwNumber = idx + 1;
        if (POSTPONED.has(`${team.code}-${gwNumber}`)) return 5; // gemiste speeldag = nadeel, telt als moeilijkst
        return ratings[f.split('-')[0]] ?? 3;
      });
      map[team.code] = scores.reduce((a, b) => a + b, 0) / scores.length;
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
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: #4ECDC4; border-radius: 4px; }
        ::-webkit-scrollbar-track { background: #3D1E5C; }
        @media (max-width: 640px) {
          .club-logo { 
            display: none !important; 
          }
        }

      `}</style>

      <div style={{
        position: 'absolute', top: 0, left: 0, width: '220px', height: '220px',
        backgroundImage: 'radial-gradient(#4ECDC4 1.5px, transparent 1.5px)',
        backgroundSize: '18px 18px', opacity: 0.25, pointerEvents: 'none'
      }} />

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 80px', position: 'relative' }}>

        <header style={{ marginBottom: '28px' }}>
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

        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center',
          marginBottom: '20px', padding: '12px 16px', background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px'
        }}>
          <span style={{
            fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
            background: isCustom ? '#4ECDC4' : 'rgba(255,255,255,0.1)',
            color: isCustom ? '#0B2E1B' : '#C9B8E0'
          }}>
            {isCustom ? 'JOUW AANGEPASTE VERSIE' : 'STANDAARD — RATING VAN @FPL_PROLEAGUE'}
          </span>
          <div style={{ flex: 1 }} />
          <button onClick={handleCopyLink} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', color: '#C9B8E0',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px',
            fontWeight: 600, fontSize: '13px', cursor: 'pointer'
          }}>
            {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
            {linkCopied ? 'Link gekopieerd!' : 'Kopieer link'}
          </button>
          <button onClick={handleDownloadImage} disabled={downloading} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', color: '#C9B8E0',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px',
            fontWeight: 600, fontSize: '13px', cursor: downloading ? 'default' : 'pointer',
            opacity: downloading ? 0.6 : 1
          }}>
            <Download size={14} />
            {downloading ? 'Bezig...' : 'Download als afbeelding'}
          </button>
          <button onClick={handleSave} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: '#4ECDC4', color: '#0B2E1B',
            border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px',
            cursor: 'pointer'
          }}>
            {saved ? 'Opgeslagen ✓' : 'Bewaar in browser'}
          </button>
          <button onClick={handleReset} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent', color: '#C9B8E0',
            border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px',
            fontWeight: 600, fontSize: '13px', cursor: 'pointer'
          }}>
            <RotateCcw size={14} /> Reset FDR
          </button>
          <button onClick={() => setShowInfo(true)} aria-label="Uitleg" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
            background: 'transparent', color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', cursor: 'pointer'
          }}>
            <Info size={16} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>

          <section>
            <button onClick={() => toggleSection('sliders')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
            }}>
              <h2 className="fdr-title" style={{ color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                Team-sterkte instellen
              </h2>
              <ChevronDown size={20} color="#C9B8E0" style={{
                transform: openSections.sliders ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease'
              }} />
            </button>
            {openSections.sliders && (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '8px'
            }}>
              {TEAMS.slice().sort((a,b) => a.code.localeCompare(b.code)).map(team => {
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
            <button onClick={() => toggleSection('table')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
            }}>
              <h2 className="fdr-title" style={{ color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0 }}>
                Fixture Difficulty Rating
              </h2>
              <ChevronDown size={20} color="#C9B8E0" style={{
                transform: openSections.table ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease'
              }} />
            </button>
            {openSections.table && (
            <button onClick={(e) => { e.stopPropagation(); setSortByDifficulty(s => !s); }} style={{
              display: 'flex', alignItems: 'center', gap: '6px', background: sortByDifficulty ? '#4ECDC4' : 'transparent',
              color: sortByDifficulty ? '#0B2E1B' : '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '6px 12px', fontWeight: 600, fontSize: '12px', cursor: 'pointer',
              marginBottom: '10px'
            }}>
              <TrendingUp size={13} />
              {sortByDifficulty ? 'Gesorteerd: makkelijkste eerst' : 'Sorteer op makkelijkste run'}
            </button>
            )}
            <div ref={tableRef} style={{
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
                  {Array.from({ length: GW_COUNT }, (_, i) => (
                    <th key={i} style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 4px', minWidth: '58px' }}>
                      GW{i + 1}
                    </th>
                  ))}
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
                      const [opp, venue] = f.split('-');
                      const isPostponed = POSTPONED.has(`${team.code}-${i + 1}`);
                      if (isPostponed) {
                        return (
                          <td key={i} className="fdr-cell" style={{
                            background: '#4A4560', color: '#9B93AD', textAlign: 'center',
                            fontSize: '14px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
                            position: 'relative', zIndex: 1
                          }} title={`${opp} (${venue}) — uitgesteld`}>
                            /
                          </td>
                        );
                      }
                      const r = ratings[opp] ?? 3;
                      const style = RATING_STYLE[r];
                      return (
                        <td key={i} className="fdr-cell" style={{
                          background: style.bg, color: style.text, textAlign: 'center',
                          fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
                          position: 'relative', zIndex: 1
                        }}>
                          {opp} <span style={{ opacity: 0.75, fontWeight: 500 }}>({venue})</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
              {[1,2,3,4,5].map(r => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: RATING_STYLE[r].bg, display: 'inline-block' }} />
                  <span style={{ color: '#C9B8E0', fontSize: '11px' }}>{RATING_STYLE[r].label}</span>
                </div>
              ))}
            </div>
            </div>
          </section>

          <section>
            <button onClick={() => toggleSection('runs')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
            }}>
              <h2 className="fdr-title" style={{ color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={18} color="#4ECDC4" /> Beste fixture runs
              </h2>
              <ChevronDown size={20} color="#C9B8E0" style={{
                transform: openSections.runs ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease'
              }} />
            </button>
            {openSections.runs && (
            <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
              <label style={{ color: '#C9B8E0', fontSize: '12px' }}>GW</label>
              <select value={rangeStart} onChange={e => setRangeStart(Number(e.target.value))} style={selectStyle}>
                {Array.from({ length: GW_COUNT }, (_, i) => <option key={i} value={i+1}>{i+1}</option>)}
              </select>
              <span style={{ color: '#C9B8E0', fontSize: '12px' }}>t/m</span>
              <select value={rangeEnd} onChange={e => setRangeEnd(Number(e.target.value))} style={selectStyle}>
                {Array.from({ length: GW_COUNT }, (_, i) => <option key={i} value={i+1}>{i+1}</option>)}
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
                      const [opp, venue] = f.split('-');
                      const gwNumber = team.startGW + i;
                      const isPostponed = POSTPONED.has(`${team.code}-${gwNumber}`);
                      if (isPostponed) {
                        return (
                          <span key={i} style={{
                            background: '#4A4560', color: '#9B93AD', fontSize: '10px', fontWeight: 700,
                            padding: '3px 6px', borderRadius: '5px'
                          }} title={`${opp} (${venue}) — uitgesteld`}>/</span>
                        );
                      }
                      const r = ratings[opp] ?? 3;
                      const style = RATING_STYLE[r];
                      return (
                        <span key={i} style={{
                          background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
                          padding: '3px 6px', borderRadius: '5px'
                        }}>{opp} ({venue})</span>
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
            <button onClick={() => toggleSection('compare')} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px'
            }}>
              <h2 className="fdr-title" style={{ color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.04em', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                Vergelijk teams
              </h2>
              <ChevronDown size={20} color="#C9B8E0" style={{
                transform: openSections.compare ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease'
              }} />
            </button>
            {openSections.compare && (
            <>
            <p style={{ color: '#8F79AD', fontSize: '12px', marginBottom: '10px' }}>
              Kies tot 3 teams om hun fixtures onder elkaar te zien.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '6px', marginBottom: '16px'
            }}>
              {TEAMS.slice().sort((a,b) => a.code.localeCompare(b.code)).map(team => {
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
                      {Array.from({ length: GW_COUNT }, (_, i) => (
                        <th key={i} style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 4px', minWidth: '58px' }}>
                          GW{i + 1}
                        </th>
                      ))}
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
                            const [opp, venue] = f.split('-');
                            const isPostponed = POSTPONED.has(`${code}-${i + 1}`);
                            if (isPostponed) {
                              return (
                                <td key={i} className="fdr-cell" style={{
                                  background: '#4A4560', color: '#9B93AD', textAlign: 'center',
                                  fontSize: '14px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px'
                                }} title={`${opp} (${venue}) — uitgesteld`}>
                                  /
                                </td>
                              );
                            }
                            const r = ratings[opp] ?? 3;
                            const style = RATING_STYLE[r];
                            return (
                              <td key={i} className="fdr-cell" style={{
                                background: style.bg, color: style.text, textAlign: 'center',
                                fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px'
                              }}>
                                {opp} <span style={{ opacity: 0.75, fontWeight: 500 }}>({venue})</span>
                              </td>
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

        <footer style={{ marginTop: '40px', textAlign: 'center', color: '#6B5289', fontSize: '12px' }}>
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

const selectStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '4px 8px', fontSize: '12px'
};
