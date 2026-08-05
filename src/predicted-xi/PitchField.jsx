// De volledige exporteerbare oppervlakte: grasveld + belijning, club-header, formatielabel, en alle
// speler-kaartjes. Dit is de ENIGE component die binnen de forwardRef zit die exportImage.js capture't
// — niets anders (notities, drafts-lijst, zoekpaneel) mag hier ooit binnen komen te staan.
import { forwardRef } from 'react';
import { PITCH_GRADIENT } from './theme';
import PitchSlot from './PitchSlot';

// Echte veldverhoudingen (68m x 105m) als SVG-viewBox-eenheden — middencirkel/strafschopgebied/
// doelgebied staan zo op hun letterlijke werkelijke proportie, wat het "realistisch" laat aanvoelen
// i.p.v. een willekeurige rechthoek. preserveAspectRatio="none" laat de belijning licht meestrekken
// naar de portret-aspect-ratio van de buitenste container (geschikt voor X) zonder zichtbare vervorming.
function PitchMarkings() {
  const stripeCount = 8;
  return (
    <svg viewBox="0 0 68 105" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {Array.from({ length: stripeCount }).map((_, i) => (
        <rect
          key={i} x={0} y={i * (105 / stripeCount)} width={68} height={105 / stripeCount}
          fill={i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)'}
        />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4">
        <rect x="1" y="1" width="66" height="103" />
        <line x1="1" y1="52.5" x2="67" y2="52.5" />
        <circle cx="34" cy="52.5" r="9.15" />
        <circle cx="34" cy="52.5" r="0.4" fill="rgba(255,255,255,0.55)" />
        {/* strafschop-/doelgebied bovenaan (bij de aanvalslinie) */}
        <rect x="13.84" y="1" width="40.32" height="16.5" />
        <rect x="24.84" y="1" width="18.32" height="5.5" />
        {/* strafschop-/doelgebied onderaan (bij de doelman) */}
        <rect x="13.84" y="87.5" width="40.32" height="16.5" />
        <rect x="24.84" y="99.5" width="18.32" height="5.5" />
      </g>
    </svg>
  );
}

const PitchField = forwardRef(function PitchField({
  club, formationLabel, slots, activeSlotIndex,
  onSlotClick, onRemove, onCycleSafety, onDragStart, onDragOver, onDrop,
}, ref) {
  const pitchSlots = slots.filter(s => s.line !== '_unassigned');

  return (
    <div
      ref={ref}
      style={{
        background: '#2A1440', borderRadius: '18px', padding: '18px',
        display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '560px', width: '100%',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
        {club && (
          <img
            src={`/club-logos/${club.code}.png`}
            alt=""
            style={{ width: '36px', height: '36px', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#FFF', fontWeight: 900, fontSize: '18px', lineHeight: 1.1 }}>
            {club?.name ?? 'Kies een club'}
          </div>
          <div style={{ color: '#4ECDC4', fontWeight: 700, fontSize: '12px', letterSpacing: '0.05em' }}>
            {formationLabel}
          </div>
        </div>
      </div>

      <div style={{
        position: 'relative', width: '100%', aspectRatio: '4 / 5',
        borderRadius: '14px', overflow: 'hidden', background: PITCH_GRADIENT,
        border: '1px solid rgba(255,255,255,0.15)',
      }}>
        <PitchMarkings />
        {pitchSlots.map((slot) => {
          const index = slots.indexOf(slot);
          return (
            <PitchSlot
              key={index}
              slot={slot}
              index={index}
              isActiveSearchTarget={activeSlotIndex === index}
              onSlotClick={onSlotClick}
              onRemove={onRemove}
              onCycleSafety={onCycleSafety}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
            />
          );
        })}
      </div>
    </div>
  );
});

export default PitchField;
