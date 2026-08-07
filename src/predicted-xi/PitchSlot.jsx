// Eén speler-kaartje (of lege plek) op het veld. Absoluut gepositioneerd — gevulde kaarten krijgen hun
// exacte leftPx/widthPx van de aanroeper (PitchField.jsx, zie cardLayout.js) omdat de kaartbreedte met
// de spelersnaam meegroeit en de vaste xPercent-coördinaten dus niet langer garanderen dat kaarten
// elkaar nooit raken — die botsingsvrije herberekening gebeurt één niveau hoger, dit component tekent
// enkel het resultaat. Lege slots hebben een vaste breedte (geen naam om rekening mee te houden) en
// gebruiken nog de eenvoudige percentage-positionering. Verder regelt dit component enkel het kaartje
// zelf: kleuren/opmaak, de safety-rand+cyclus-badge, de verwijder-knop, en drag/klik-handlers. Bewust
// geen clublogo/positielabel op gevulde kaarten (die zijn overbodig — elke kaart hoort al bij precies
// één club/lijn) — enkel de naam (prominent) en de prijs (subtiel eronder, als label). Gevulde kaarten
// ondersteunen zowel klikken (opent de positiekiezer, zie PositionPicker.jsx) als slepen (automatische
// settle naar de dichtstbije positie, zie PitchField.jsx) — allebei komen uiteindelijk uit bij dezelfde
// toewijzingslogica.
import { Plus, X } from 'lucide-react';
import { SAFETY_STYLE } from './theme';

// Lege slots hebben een vaste breedte (70px, zie ook EMPTY_CARD_WIDTH_PX in cardLayout.js) — een
// eenvoudige CSS-klem (helft van de breedte + kleine randmarge) volstaat hier, in dezelfde geest als de
// pixel-nauwkeurige klem die cardLayout.js voor gevulde kaarten toepast.
const EMPTY_CARD_EDGE_CLAMP_PX = 47;

export default function PitchSlot({
  slot, index, leftPx, widthPx, topPx, isActiveSearchTarget,
  onSlotClick, onRemove, onCycleSafety, onDragStart,
  // Puur-visuele weergave voor de publieke Predicted Lineups-tab (zie PredictedLineupsTab.jsx): geen
  // enkele interactie — geen klik/sleep, geen verwijder-knop, geen safety-badge (niet enkel
  // non-functioneel, ook niet gerenderd). Standaard false, dus de privé Predicted XI Builder is
  // hierdoor op geen enkele manier veranderd.
  readOnly = false,
}) {
  const isEmpty = !slot.playerName;
  const safety = SAFETY_STYLE[slot.safety] ?? SAFETY_STYLE.green;
  const hasComputedPosition = !isEmpty && leftPx != null;
  // Verticale positie komt, net als leftPx/widthPx, van cardLayout.js's botsingsvrije herberekening
  // zodra die beschikbaar is (topPx) — enkel als terugval (bv. vóór de eerste layout-meting) valt dit
  // terug op de ruwe, onaangepaste yPercent-positionering van vroeger.
  const hasComputedTop = !isEmpty && topPx != null;

  return (
    <div
      style={{
        position: 'absolute',
        ...(hasComputedTop ? { top: `${topPx}px` } : { top: `${slot.yPercent}%` }),
        ...(hasComputedPosition
          ? { left: `${leftPx}px`, transform: 'translateY(-50%)' }
          : {
            left: `max(${EMPTY_CARD_EDGE_CLAMP_PX}px, min(${slot.xPercent}%, calc(100% - ${EMPTY_CARD_EDGE_CLAMP_PX}px)))`,
            transform: 'translate(-50%, -50%)',
          }),
        zIndex: isActiveSearchTarget ? 3 : 2,
      }}
    >
      <div style={{ position: 'relative' }}>
        {!isEmpty && !readOnly && (
          <>
            {/* Safety-cyclus: klik doorloopt de 4 niveaus (zie SAFETY_CYCLE in theme.js). Zelfde
                cirkel-badge-offset als de bestaande kapitein-badge in PlayerPitchCard (top:-6px), maar
                rechtsboven i.p.v. gecentreerd, met een spiegelbeeldige verwijder-knop linksboven. */}
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
          draggable={!isEmpty && !readOnly}
          onDragStart={readOnly ? undefined : (e) => onDragStart(e, index)}
          onClick={readOnly ? undefined : () => onSlotClick(index)}
          title={readOnly ? undefined : (isEmpty ? `Klik om een ${slot.role}-speler te zoeken` : 'Sleep om te verplaatsen, of klik om een positie te kiezen')}
          data-player-name={isEmpty ? undefined : slot.playerName}
          // pxi-card--empty/--filled: mobiele padding-overrides staan in PitchField.jsx's MOBILE_STYLE
          // (@media max-width: 640px, dezelfde conventie als elders in de codebase) i.p.v. hier een JS-
          // berekende drempel — de basisstijl (desktop) hieronder blijft ongewijzigd.
          className={isEmpty ? 'pxi-card--empty' : 'pxi-card--filled'}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '2px',
            background: isEmpty ? 'rgba(42,20,64,0.45)' : 'rgba(42,20,64,0.9)',
            border: isEmpty
              ? `2px dashed ${isActiveSearchTarget ? '#4ECDC4' : 'rgba(255,255,255,0.3)'}`
              : `2px solid ${safety.border}`,
            borderRadius: '10px',
            padding: isEmpty ? '8px 9px' : '9px 8px',
            boxSizing: 'border-box',
            // Gevulde kaarten krijgen hun exacte breedte van de ouder (widthPx, zie hierboven) — die is
            // al berekend om de naam op één regel volledig te tonen ZONDER een buurkaart te raken.
            // Lege kaarten hebben geen naam-afhankelijke breedte, dus een simpele vaste minWidth volstaat.
            minWidth: isEmpty ? '70px' : undefined,
            width: hasComputedPosition ? `${widthPx}px` : undefined,
            cursor: readOnly ? 'default' : (isEmpty ? 'pointer' : 'grab'), boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
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
              <span className="pxi-card-name" style={{
                color: '#FFF', fontSize: '13px', fontWeight: 800,
                textAlign: 'center', lineHeight: 1.15, whiteSpace: 'nowrap',
              }}>
                {slot.playerName}
              </span>
              {slot.playerPrice != null && (
                <span className="pxi-card-price" style={{ color: '#8F79AD', fontSize: '10px', fontWeight: 700 }}>
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
