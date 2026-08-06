// De volledige exporteerbare oppervlakte: grasveld + belijning, club-header, formatielabel, en alle
// speler-kaartjes. Dit is de ENIGE component die binnen de forwardRef zit die exportImage.js capture't
// — niets anders (notities, drafts-lijst, zoekpaneel) mag hier ooit binnen komen te staan.
import { forwardRef, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PITCH_GRADIENT, PITCH_ASPECT_RATIO } from './theme';
import { POSITION_PRESETS } from './formations';
import { computeCardPositions, COMPACT_BREAKPOINT_PX } from './cardLayout';
import PitchSlot from './PitchSlot';

// Redelijke standaardbreedte vóór de eerste ResizeObserver-meting (zie hieronder) — voorkomt een
// layout-flits waarbij kaarten heel even op hun ongecorrigeerde, mogelijk overlappende positie staan.
// Komt overeen met de container's aanvankelijke maxWidth (560px) min padding.
const DEFAULT_PITCH_WIDTH_PX = 520;

// De viewBox-hoogte wordt afgeleid van PITCH_ASPECT_RATIO (breedte blijft 68 SVG-eenheden, dezelfde
// orde-grootte als de echte veldbreedte in meters) zodat viewBox en container-aspectratio altijd exact
// overeenkomen. preserveAspectRatio="none" rekt dan uniform (geen vervorming) i.p.v. de middencirkel
// scheef te trekken zoals zou gebeuren als de viewBox-verhouding niet meer overeenkwam met de container
// na het compacter maken van het veld. Strafschop-/doelgebied-diepte (Y-richting) wordt proportioneel
// mee-verkleind zodat ze niet onrealistisch diep ogen op het kortere veld; hun breedte (X-richting,
// zelfde eenheden als de echte 40.32m/18.32m) blijft ongewijzigd.
const VIEWBOX_WIDTH = 68;
const VIEWBOX_HEIGHT = VIEWBOX_WIDTH / PITCH_ASPECT_RATIO;
const DEPTH_SCALE = VIEWBOX_HEIGHT / 105; // 105 = echte veldlengte in meters, referentie voor de originele diepte-maten

function PitchMarkings() {
  const stripeCount = 8;
  const penaltyDepth = 16.5 * DEPTH_SCALE;
  const goalDepth = 5.5 * DEPTH_SCALE;
  return (
    <svg viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
      {Array.from({ length: stripeCount }).map((_, i) => (
        <rect
          key={i} x={0} y={i * (VIEWBOX_HEIGHT / stripeCount)} width={VIEWBOX_WIDTH} height={VIEWBOX_HEIGHT / stripeCount}
          fill={i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)'}
        />
      ))}
      <g fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="0.4">
        <rect x="1" y="1" width={VIEWBOX_WIDTH - 2} height={VIEWBOX_HEIGHT - 2} />
        <line x1="1" y1={VIEWBOX_HEIGHT / 2} x2={VIEWBOX_WIDTH - 1} y2={VIEWBOX_HEIGHT / 2} />
        <circle cx="34" cy={VIEWBOX_HEIGHT / 2} r="9.15" />
        <circle cx="34" cy={VIEWBOX_HEIGHT / 2} r="0.4" fill="rgba(255,255,255,0.55)" />
        {/* strafschop-/doelgebied bovenaan (bij de aanvalslinie) */}
        <rect x="13.84" y="1" width="40.32" height={penaltyDepth} />
        <rect x="24.84" y="1" width="18.32" height={goalDepth} />
        {/* strafschop-/doelgebied onderaan (bij de doelman) */}
        <rect x="13.84" y={VIEWBOX_HEIGHT - 1 - penaltyDepth} width="40.32" height={penaltyDepth} />
        <rect x="24.84" y={VIEWBOX_HEIGHT - 1 - goalDepth} width="18.32" height={goalDepth} />
      </g>
    </svg>
  );
}

const PitchField = forwardRef(function PitchField({
  club, opponent, formationLabel, slots, activeSlotIndex,
  onSlotClick, onRemove, onCycleSafety, onDragStart, onSlotDrop,
  // Puur-visuele weergave voor de publieke Predicted Lineups-tab (zie PredictedLineupsTab.jsx) — zie
  // PitchSlot.jsx voor wat dit per kaartje uitschakelt. Hier laat het bovendien de sleep-naar-veld-
  // afhandeling van de container zelf weg. Standaard false: de privé Predicted XI Builder (die deze
  // prop nooit meegeeft) is hierdoor op geen enkele manier veranderd.
  readOnly = false,
}, ref) {
  const pitchSlots = slots.filter(s => s.positionId !== '_unassigned');
  const pitchInnerRef = useRef(null);
  const [pitchWidthPx, setPitchWidthPx] = useState(DEFAULT_PITCH_WIDTH_PX);

  // Houdt de werkelijke, gerenderde veldbreedte bij (verandert bij window-resize of bv. het
  // openen/sluiten van het zoekpaneel ernaast) — de botsingsvrije layout hieronder rekent in echte
  // pixels, dus moet altijd de actuele breedte kennen, niet enkel de breedte bij eerste render.
  useLayoutEffect(() => {
    const el = pitchInnerRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setPitchWidthPx(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Kaartbreedte groeit mee met de naam (zie PitchSlot.jsx), dus de vaste xPercent-coördinaten
  // garanderen geen overlapvrije positie meer — computeCardPositions herberekent de werkelijke
  // pixel-posities per "rij" (zie cardLayout.js), zowel horizontaal (kaarten raken elkaar nooit, vallen
  // nooit over de veldrand) als verticaal (rijen die ongewoon dicht bij een buurlijn liggen — bv. een
  // handmatig verplaatste CAM — schuiven net genoeg uit elkaar), ongeacht naamlengte of schermbreedte.
  const pitchHeightPx = pitchWidthPx / PITCH_ASPECT_RATIO;
  const isCompact = pitchWidthPx < COMPACT_BREAKPOINT_PX;
  const cardPositions = useMemo(
    () => computeCardPositions(pitchSlots, pitchWidthPx, pitchHeightPx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [slots, pitchWidthPx, pitchHeightPx],
  );

  // Automatische settle: bereken bij loslaten de dichtstbijzijnde vaste positie (in echte pixels,
  // niet ruwe procenten — het veld is geen vierkant, dus anders zou "dichtstbij" scheef getrokken
  // worden) en wijs de gesleepte speler daaraan toe. Dezelfde toewijzingslogica (incl. wisselen bij een
  // bezette positie) als de klik-positiekiezer — sleep en klik werken dus naast elkaar op hetzelfde pad.
  function handleDrop(e) {
    e.preventDefault();
    const sourceIndex = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isNaN(sourceIndex) || !pitchInnerRef.current) return;
    const rect = pitchInnerRef.current.getBoundingClientRect();
    const dropXPercent = ((e.clientX - rect.left) / rect.width) * 100;
    const dropYPercent = ((e.clientY - rect.top) / rect.height) * 100;

    let nearestId = null;
    let nearestDistance = Infinity;
    for (const [id, preset] of Object.entries(POSITION_PRESETS)) {
      const dx = (preset.xPercent - dropXPercent) * (rect.width / 100);
      const dy = (preset.yPercent - dropYPercent) * (rect.height / 100);
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }
    if (nearestId) onSlotDrop(sourceIndex, nearestId);
  }

  return (
    <div
      ref={ref}
      style={{
        background: '#2A1440', borderRadius: '18px', padding: '18px',
        display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '560px', width: '100%',
      }}
    >
      {/* Verticaal gecentreerde stack (logo boven naam boven formatie-pil) i.p.v. een naast-elkaar-rij —
          blijft symmetrisch gecentreerd ongeacht logobreedte, met een subtiele scheidingslijn naar het
          veld toe voor een rustiger, "cleaner" export-header. */}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        paddingBottom: '16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        {club && (
          <img
            src={`/club-logos/${club.code}.png`}
            alt=""
            style={{ width: '44px', height: '44px', objectFit: 'contain', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <div style={{ color: '#FFF', fontWeight: 900, fontSize: '20px', lineHeight: 1.1, textAlign: 'center' }}>
          {club?.name ?? 'Kies een club'}
        </div>
        <div style={{
          color: '#4ECDC4', fontWeight: 800, fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase',
          background: 'rgba(78,205,196,0.12)', border: '1px solid rgba(78,205,196,0.3)',
          borderRadius: '999px', padding: '3px 12px',
        }}>
          {formationLabel}
        </div>
        {opponent && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: '#8F79AD', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>vs</span>
            <img
              src={`/club-logos/${opponent.code}.png`}
              alt=""
              style={{ width: '18px', height: '18px', objectFit: 'contain' }}
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <span style={{ color: '#C9B8E0', fontSize: '13px', fontWeight: 700 }}>{opponent.name}</span>
          </div>
        )}
      </div>

      <div
        ref={pitchInnerRef}
        onDragOver={readOnly ? undefined : (e) => e.preventDefault()}
        onDrop={readOnly ? undefined : handleDrop}
        style={{
          position: 'relative', width: '100%', aspectRatio: PITCH_ASPECT_RATIO,
          borderRadius: '14px', overflow: 'hidden', background: PITCH_GRADIENT,
          border: '1px solid rgba(255,255,255,0.15)',
        }}>
        <PitchMarkings />
        {pitchSlots.map((slot) => {
          const index = slots.indexOf(slot);
          const position = cardPositions.get(slot);
          return (
            <PitchSlot
              key={index}
              slot={slot}
              index={index}
              leftPx={position?.leftPx}
              widthPx={position?.widthPx}
              topPx={position?.topPx}
              compact={isCompact}
              isActiveSearchTarget={activeSlotIndex === index}
              onSlotClick={onSlotClick}
              onRemove={onRemove}
              onCycleSafety={onCycleSafety}
              onDragStart={onDragStart}
              readOnly={readOnly}
            />
          );
        })}
      </div>
    </div>
  );
});

export default PitchField;
