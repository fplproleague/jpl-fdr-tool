// Klik-gebaseerde positiekiezer — vervangt vrij (pixel-precies) verslepen volledig. Toont alle
// beschikbare tactische posities uit POSITION_PRESETS, gegroepeerd per sectie (GK/DEF/MID/FWD). Een
// positie die al door een andere speler bezet is, wordt gemarkeerd — klikken wisselt dan de twee
// spelers van plek (dezelfde swap-mechaniek als vroeger bij het slepen, nu via een klik op een naam
// i.p.v. een pixel-coördinaat). Gerenderd als JSX-sibling van PitchField (zie PredictedXiBuilder.jsx),
// dus nooit onderdeel van de geëxporteerde afbeelding.
import { X } from 'lucide-react';
import { POSITION_PRESETS } from './formations';

const SECTIONS = ['GK', 'DEF', 'MID', 'FWD'];
const SECTION_LABELS = { GK: 'Doelman', DEF: 'Verdediging', MID: 'Middenveld', FWD: 'Aanval' };

export default function PositionPicker({ slots, activeIndex, onAssign, onClose }) {
  if (activeIndex == null) return null;
  const activeSlot = slots[activeIndex];

  function occupantFor(presetId) {
    return slots.find((s, i) => i !== activeIndex && s.positionId === presetId && s.playerName);
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(10,4,20,0.72)', zIndex: 50,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#2A1440', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '14px',
          padding: '20px', maxWidth: '480px', width: '100%', maxHeight: '80vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ color: '#FFF', fontSize: '15px', fontWeight: 900, margin: 0 }}>
            Kies positie voor {activeSlot?.playerName}
          </h3>
          <button onClick={onClose} style={{ display: 'flex', background: 'transparent', border: 'none', color: '#8F79AD', cursor: 'pointer', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        {SECTIONS.map(section => {
          const presets = Object.entries(POSITION_PRESETS).filter(([, p]) => p.section === section);
          return (
            <div key={section} style={{ marginBottom: '14px' }}>
              <p style={{ color: '#8F79AD', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
                {SECTION_LABELS[section]}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {presets.map(([id, preset]) => {
                  const isCurrent = activeSlot?.positionId === id;
                  const occupant = occupantFor(id);
                  return (
                    <button
                      key={id}
                      onClick={() => !isCurrent && onAssign(activeIndex, id)}
                      disabled={isCurrent}
                      title={occupant ? `Wisselt met ${occupant.playerName}` : undefined}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                        background: isCurrent ? 'rgba(78,205,196,0.18)' : occupant ? 'rgba(232,197,71,0.1)' : 'rgba(255,255,255,0.05)',
                        border: isCurrent ? '1px solid #4ECDC4' : occupant ? '1px solid rgba(232,197,71,0.4)' : '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px', padding: '6px 10px', minWidth: '54px',
                        cursor: isCurrent ? 'default' : 'pointer',
                      }}
                    >
                      <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 800 }}>{preset.label}</span>
                      {occupant && !isCurrent && (
                        <span style={{ color: '#E8C547', fontSize: '9px', maxWidth: '66px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {occupant.playerName}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
