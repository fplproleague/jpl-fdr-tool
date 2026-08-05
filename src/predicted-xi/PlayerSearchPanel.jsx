// Altijd-zichtbaar zoekpaneel: tekstveld + doorlopend zichtbare resultatenlijst, i.p.v. een dropdown-
// on-focus zoals het bestaande PlayerSearchInput-component (components/PlayerSearchInput.jsx) — dat
// component is ontworpen om één specifieke tabelcel inline in te vullen (Team Planner's 15-spelerslijst),
// terwijl deze feature "instant search, klik om toe te voegen" als een vast, doorlopend paneel vraagt.
// Hergebruikt wel dezelfde filter-/rij-opmaaklogica voor visuele/gedragsconsistentie.
import { useState } from 'react';
import { Search, UserPlus } from 'lucide-react';

function findMatches(players, query) {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  return players
    .filter(p => p.name.toLowerCase().includes(trimmed))
    .sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity))
    .slice(0, 20);
}

export default function PlayerSearchPanel({ players, onSelect, onManualAdd, activeSlotRole, disabled, placeholder }) {
  const [query, setQuery] = useState('');
  const matches = findMatches(players, query);
  const trimmedQuery = query.trim();

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: '10px' }}>
        <Search size={13} color="#8F79AD" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={disabled ? 'Databank laden...' : (placeholder ?? 'Zoek een speler...')}
          style={{
            background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '6px', padding: '8px 10px 8px 28px', fontSize: '13px', width: '100%',
            boxSizing: 'border-box', opacity: disabled ? 0.6 : 1,
          }}
        />
      </div>
      {activeSlotRole && (
        <p style={{ color: '#4ECDC4', fontSize: '11px', margin: '0 0 8px' }}>
          Geselecteerde plek: {activeSlotRole} — klik een speler om die plek te vullen.
        </p>
      )}
      <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px' }}>
        {trimmedQuery === '' ? (
          <p style={{ color: '#6B5289', fontSize: '12px', padding: '10px' }}>Typ een naam om te zoeken.</p>
        ) : (
          <>
            {matches.length === 0 ? (
              <p style={{ color: '#6B5289', fontSize: '12px', padding: '10px' }}>Geen spelers gevonden.</p>
            ) : (
              matches.map((p, i) => (
                <button
                  key={`${p.teamCode}-${p.name}-${i}`}
                  onClick={() => onSelect(p)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
                    background: 'none', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)',
                    cursor: 'pointer', padding: '8px 10px', color: '#FFF', fontSize: '13px',
                  }}
                >
                  <img
                    src={`/club-logos/${p.teamCode}.png`}
                    alt=""
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
              ))
            )}
            {/* Speler zit (nog) niet in de databank — handmatig toevoegen loopt via dezelfde
                plaatsingslogica als een databank-speler (zie handleManualAdd in PredictedXiBuilder.jsx),
                enkel zonder club/positie/prijs uit de sheet. */}
            <button
              onClick={() => onManualAdd(trimmedQuery)}
              style={{
                display: 'flex', alignItems: 'center', gap: '8px', width: '100%', textAlign: 'left',
                background: 'rgba(78,205,196,0.08)', border: 'none',
                borderTop: matches.length > 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
                cursor: 'pointer', padding: '8px 10px', color: '#4ECDC4', fontSize: '12px', fontWeight: 700,
              }}
            >
              <UserPlus size={13} style={{ flexShrink: 0 }} />
              Voeg "{trimmedQuery}" handmatig toe (niet in databank)
            </button>
          </>
        )}
      </div>
    </div>
  );
}
