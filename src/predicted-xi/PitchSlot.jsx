// Eén speler-kaartje (of lege plek) op het veld. Absoluut gepositioneerd door de aanroeper (PitchField)
// via slot.xPercent/yPercent — dit component regelt enkel het kaartje zelf: kleuren/opmaak, de
// safety-rand+cyclus-badge, de verwijder-knop, en drag/klik-handlers. Bewust geen clublogo/positielabel
// op gevulde kaarten (die zijn overbodig — elke kaart hoort al bij precies één club/lijn) — enkel de
// naam (prominent) en de prijs (subtiel eronder, als label). Gevulde kaarten ondersteunen zowel klikken
// (opent de positiekiezer, zie PositionPicker.jsx) als slepen (automatische settle naar de dichtstbije
// positie, zie PitchField.jsx) — allebei komen uiteindelijk uit bij dezelfde toewijzingslogica.
import { useMemo } from 'react';
import { Plus, X } from 'lucide-react';
import { SAFETY_STYLE } from './theme';
import { fitNameDisplay } from './textFit';

// Beschikbare tekstbreedte voor de naam: kaartbreedte (78px) min horizontale padding (2x8px), met een
// paar px veiligheidsmarge omdat canvas measureText() niet altijd pixel-exact overeenkomt met de
// werkelijke DOM/html2canvas-rendering.
const NAME_MAX_WIDTH_PX = 60;

export default function PitchSlot({
  slot, index, isActiveSearchTarget,
  onSlotClick, onRemove, onCycleSafety, onDragStart,
}) {
  const isEmpty = !slot.playerName;
  const safety = SAFETY_STYLE[slot.safety] ?? SAFETY_STYLE.green;
  // Namen worden NOOIT afgekapt: fitNameDisplay() breekt over max. 2 regels en verkleint het lettertype
  // pas als woordafbreking alleen niet volstaat (zie textFit.js) — de volledige naam blijft altijd
  // zichtbaar, terwijl elke regel gegarandeerd binnen NAME_MAX_WIDTH_PX blijft.
  const { lines: nameLines, fontPx: nameFontPx } = useMemo(
    () => (isEmpty ? { lines: [], fontPx: 13 } : fitNameDisplay(slot.playerName, NAME_MAX_WIDTH_PX)),
    [isEmpty, slot.playerName],
  );

  return (
    <div
      style={{
        position: 'absolute',
        // Klemt het kaartje tussen 88px en (100% - 88px) van de linker-/rechterrand — een extra,
        // CSS-niveau vangnet bovenop de al verbrede preset-marges (16%/84% in formations.js), voor élke
        // positie op het veld, ook toekomstige of vrij-gekozen posities dicht bij de rand. 88px blijft
        // ruim voldoende nu gevulde kaarten altijd een vaste breedte van 78px hebben (nooit meer breder,
        // ongeacht de naamlengte — zie fitNameDisplay hierboven): zelf getest op de smalste flankposities
        // (LB/LWB/LM/LW en hun R-tegenhangers) in de breedste formaties (5-3-2/3-5-2/4-4-2/4-3-3).
        left: `max(88px, min(${slot.xPercent}%, calc(100% - 88px)))`, top: `${slot.yPercent}%`,
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
            {/* pxi-no-export: enkel een bewerk-knop, mag nooit op de geëxporteerde afbeelding staan —
                exportImage.js sluit dit element expliciet uit via html2canvas's ignoreElements, dus dit
                blijft onafhankelijk van React-rendertiming gegarandeerd verborgen op de export. */}
            <button
              onClick={(e) => { e.stopPropagation(); onRemove(index); }}
              title="Verwijder speler"
              className="pxi-no-export"
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
          onClick={() => onSlotClick(index)}
          title={isEmpty ? `Klik om een ${slot.role}-speler te zoeken` : 'Sleep om te verplaatsen, of klik om een positie te kiezen'}
          data-player-name={isEmpty ? undefined : slot.playerName}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '2px',
            background: isEmpty ? 'rgba(42,20,64,0.45)' : 'rgba(42,20,64,0.9)',
            border: isEmpty
              ? `2px dashed ${isActiveSearchTarget ? '#4ECDC4' : 'rgba(255,255,255,0.3)'}`
              : `2px solid ${safety.border}`,
            borderRadius: '10px', padding: isEmpty ? '8px 9px' : '9px 8px',
            boxSizing: 'border-box',
            // Vaste breedte i.p.v. minWidth voor gevulde kaarten: laat de breedte NIET met de
            // spelersnaam meegroeien (zie formations.js-commentaar bij LCB/RCB/LCM/RCM) — dat is wat
            // een wiskundig gegarandeerd overlapvrij venster voor de gedeelde xPercent-coördinaten
            // mogelijk maakt. Lange namen worden nooit afgekapt: fitNameDisplay() (zie textFit.js) breekt
            // ze i.p.v. dat over max. 2 regels en verkleint indien nodig het lettertype — de kaart groeit
            // dus in HOOGTE (ruim voorradig na de linie-compactie), nooit in breedte (dat zou het
            // overlapvrije venster doorbreken).
            minWidth: isEmpty ? '70px' : undefined,
            width: isEmpty ? undefined : '78px',
            cursor: isEmpty ? 'pointer' : 'grab', boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
          }}
        >
          {isEmpty ? (
            <>
              <Plus size={17} color={isActiveSearchTarget ? '#4ECDC4' : '#8F79AD'} />
              <span style={{
                color: '#8F79AD', fontSize: '11px', fontWeight: 700,
                textAlign: 'center', lineHeight: 1.15,
              }}>
                {slot.role}
              </span>
            </>
          ) : (
            <>
              <span
                style={{
                  color: '#FFF', fontSize: `${nameFontPx}px`, fontWeight: 800,
                  textAlign: 'center', lineHeight: 1.2, whiteSpace: 'pre-line',
                }}
              >
                {nameLines.join('\n')}
              </span>
              {slot.playerPrice != null && (
                <span style={{ color: '#8F79AD', fontSize: '10px', fontWeight: 700 }}>
                  {slot.playerPrice.toFixed(1)}M
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
