// Herbruikbare zoek/autocomplete-component voor de spelersdatabank (zie constants.js/
// parsePlayerDatabaseCsv en de fetch-logica in FDRTool.jsx). Een tekstveld dat bij typen een dropdown
// met matchende spelers toont; bij selectie geeft het via onSelect het volledige speler-object terug
// zodat de aanroeper naam/team/prijs (en eventueel positie) automatisch kan invullen. Gebruikt door de
// initiële 15-koppige teaminvoer in TeamPlannerTab.jsx, en straks ook door de transfer-functie —
// vandaar hier in components/ i.p.v. lokaal in een tab-bestand.

import { useState, useRef, useEffect, memo } from 'react';
import { Search } from 'lucide-react';

const dropdownItemStyle = {
  display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
  background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
  cursor: 'pointer', padding: '8px 10px', color: '#FFF', fontSize: '13px',
};

// Zoekt op elk deel van de naam (case-insensitief), niet enkel het begin — zo vindt "iels" ook
// "Thielemans". `filterPosition`, indien gezet, beperkt de kandidaten vooraf tot die ene positie
// (gebruikt door TeamPlannerTab.jsx omdat elk speler-slot daar een vaste, vereiste positie heeft).
// Maximaal 8 suggesties, zodat de dropdown leesbaar blijft ook bij een erg korte zoekterm.
function findMatches(players, query, filterPosition) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return players
    .filter(p => !filterPosition || p.position === filterPosition)
    .filter(p => p.name.toLowerCase().includes(trimmed))
    .slice(0, 8);
}

export const PlayerSearchInput = memo(function PlayerSearchInput({
  value, onSelect, players, filterPosition, placeholder, disabled,
}) {
  // Lokale state (getypte tekst, dropdown open/dicht) is hier bewust wél toegestaan ondanks de regel
  // "alle state blijft in FDRTool.jsx" — dat gaat over domein-state die tab-wissels moet overleven
  // (bank, budget, ...). Dit is voorbijgaande UI-state van één invoerveld: als de gebruiker halverwege
  // typen wegnavigeert is het prima dat dat resetten, net als een gewoon zoekveld in de browser.
  const [query, setQuery] = useState(value ?? '');
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Synct het zoekveld met de van buitenaf geselecteerde speler (bv. na een reset of bij het laden
  // vanuit localStorage) — niet tijdens het typen zelf, anders zou elke toetsaanslag de tekst overschrijven.
  useEffect(() => {
    setQuery(value ?? '');
  }, [value]);

  // Sluit de dropdown bij een klik/tik buiten de component, zelfde patroon (pointerdown op document)
  // als useTooltipTrigger in components/Tooltip.jsx.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e) => {
      if (!containerRef.current?.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen]);

  const matches = findMatches(players, query, filterPosition);

  const handleSelect = (player) => {
    setQuery(player.name);
    setIsOpen(false);
    onSelect(player);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative' }}>
        <Search size={13} color="#8F79AD" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          style={{
            background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px', padding: '6px 8px 6px 26px', fontSize: '13px', width: '100%',
            boxSizing: 'border-box', opacity: disabled ? 0.6 : 1,
          }}
        />
      </div>
      {isOpen && matches.length > 0 && (
        <div style={{
          position: 'absolute', zIndex: 5, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#3D1E5C', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.35)', maxHeight: '220px', overflowY: 'auto',
        }}>
          {matches.map((p, i) => (
            <button
              key={`${p.teamCode}-${p.name}-${i}`}
              type="button"
              onClick={() => handleSelect(p)}
              style={dropdownItemStyle}
            >
              <img
                src={`/club-logos/${p.teamCode}.png`}
                alt=""
                className="club-logo"
                style={{ width: '18px', height: '18px', objectFit: 'contain', flexShrink: 0 }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                {p.name}
              </span>
              <span style={{ color: '#8F79AD', fontSize: '11px', flexShrink: 0 }}>{p.teamName}</span>
              <span style={{ color: '#C9B8E0', fontSize: '11px', flexShrink: 0 }}>{p.position}</span>
              <span style={{ color: '#4ECDC4', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>
                {p.price != null ? `${p.price.toFixed(1)}M` : '—'}
              </span>
            </button>
          ))}
        </div>
      )}
      {isOpen && query.trim() && matches.length === 0 && (
        <div style={{
          position: 'absolute', zIndex: 5, top: 'calc(100% + 4px)', left: 0, right: 0,
          background: '#3D1E5C', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
          padding: '10px', color: '#8F79AD', fontSize: '12px',
        }}>
          Geen spelers gevonden.
        </div>
      )}
    </div>
  );
});
