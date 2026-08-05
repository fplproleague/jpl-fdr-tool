// Eén speler-kaartje (of lege plek) op het veld. Absoluut gepositioneerd door de aanroeper (PitchField)
// via slot.xPercent/yPercent — dit component regelt enkel het kaartje zelf: kleuren/opmaak (gebaseerd
// op PlayerPitchCard in TeamPlannerTab.jsx voor visuele consistentie met de rest van de app), de
// safety-rand+cyclus-badge, de verwijder-knop, en drag/drop-/klik-handlers.
import { Plus, X } from 'lucide-react';
import { SAFETY_STYLE } from './theme';

export default function PitchSlot({
  slot, index, isActiveSearchTarget,
  onSlotClick, onRemove, onCycleSafety, onDragStart, onDragOver, onDrop,
}) {
  const isEmpty = !slot.playerName;
  const safety = SAFETY_STYLE[slot.safety] ?? SAFETY_STYLE.green;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${slot.xPercent}%`, top: `${slot.yPercent}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isActiveSearchTarget ? 3 : 2,
      }}
    >
      <div style={{ position: 'relative' }}>
        {!isEmpty && (
          <>
            {/* Safety-cyclus: klik wisselt groen->oranje->rood->groen. Zelfde cirkel-badge-offset als
                de bestaande kapitein-badge in PlayerPitchCard (top:-6px), maar rechtsboven i.p.v.
                gecentreerd, met een spiegelbeeldige verwijder-knop linksboven. */}
            <button
              onClick={(e) => { e.stopPropagation(); onCycleSafety(index); }}
              title={safety.label}
              style={{
                position: 'absolute', top: '-6px', right: '-6px', zIndex: 1,
                width: '18px', height: '18px', borderRadius: '50%',
                background: safety.badgeBg, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer',
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              title="Verwijder speler"
              style={{
                position: 'absolute', top: '-6px', left: '-6px', zIndex: 1,
                width: '18px', height: '18px', borderRadius: '50%', display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: 0,
                background: 'rgba(42,20,64,0.9)', color: '#C9B8E0',
                border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer',
              }}
            >
              <X size={11} />
            </button>
          </>
        )}
        <div
          draggable={!isEmpty}
          onDragStart={(e) => onDragStart(e, index)}
          onDragOver={onDragOver}
          onDrop={(e) => onDrop(e, index)}
          onClick={() => onSlotClick(index)}
          title={isEmpty ? `Klik om een ${slot.role}-speler te zoeken` : 'Sleep om te wisselen'}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            background: isEmpty ? 'rgba(42,20,64,0.45)' : 'rgba(42,20,64,0.85)',
            border: isEmpty
              ? `2px dashed ${isActiveSearchTarget ? '#4ECDC4' : 'rgba(255,255,255,0.3)'}`
              : `2px solid ${safety.border}`,
            borderRadius: '10px', padding: '6px 8px', minWidth: '70px',
            cursor: isEmpty ? 'pointer' : 'grab', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          {isEmpty ? (
            <Plus size={16} color={isActiveSearchTarget ? '#4ECDC4' : '#8F79AD'} />
          ) : (
            <img
              src={`/club-logos/${slot.playerTeamCode}.png`}
              alt=""
              style={{ width: '22px', height: '22px', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
          <span style={{
            color: isEmpty ? '#8F79AD' : '#FFF', fontSize: '10px', fontWeight: 700,
            textAlign: 'center', lineHeight: 1.15, maxWidth: '80px',
            overflowWrap: 'anywhere',
          }}>
            {isEmpty ? slot.role : slot.playerName}
          </span>
          {!isEmpty && (
            <span style={{ color: '#8F79AD', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase' }}>
              {slot.role}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
