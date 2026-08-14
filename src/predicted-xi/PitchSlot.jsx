// Eén speler-kaartje (of lege plek) op het veld. Absoluut gepositioneerd — gevulde kaarten krijgen hun
// exacte leftPx/widthPx van de aanroeper (PitchField.jsx, zie cardLayout.js) omdat de kaartbreedte met
// de spelersnaam meegroeit en de vaste xPercent-coördinaten dus niet langer garanderen dat kaarten
// elkaar nooit raken — die botsingsvrije herberekening gebeurt één niveau hoger, dit component tekent
// enkel het resultaat. Lege slots hebben een vaste breedte (geen naam om rekening mee te houden) en
// gebruiken nog de eenvoudige percentage-positionering. Verder regelt dit component enkel het kaartje
// zelf: kleuren/opmaak, de safety-rand+cyclus-badge, de verwijder-knop, en drag/klik-handlers. Gevulde
// kaarten bestaan uit TWEE los ogende stukken (bewust géén gedeelde kader): een groot, kaal shirt dat
// rechtstreeks "op het gras" zweeft (slagschaduw i.p.v. een eigen achtergrond/rand — het shirt is de
// dominante marker, vergelijkbaar met een echte opstellingsgrafiek), en daaronder een klein label met
// naam+prijs dat wél de bestaande kaart-look behoudt (donkere achtergrond, safety-gekleurde rand,
// afgeronde hoeken) — beide zitten in dezelfde onzichtbare flex-kolom, die alle interactie draagt, dus
// functioneel blijft dit één geheel. Gevulde kaarten ondersteunen zowel klikken (opent de positiekiezer,
// zie PositionPicker.jsx) als slepen (automatische settle naar de dichtstbije positie, zie
// PitchField.jsx) — allebei komen uiteindelijk uit bij dezelfde toewijzingslogica.
import { Plus, X } from 'lucide-react';
import { SAFETY_STYLE } from './theme';
import { SHIRT_WIDTH_PX_IDEAL } from './cardLayout';

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
  // Fallback-teamcode voor het shirt-icoon (zie effectiveTeamCode hieronder) — de club waarvan dit veld
  // de opstelling toont, doorgegeven vanuit PitchField.jsx. Enkel nodig als slot.playerTeamCode leeg is
  // (bv. een handmatig ingevoerde speler die niet uit de spelersdatabank kwam, zie handleManualAdd in
  // PredictedXiBuilder.jsx) — in de praktijk hoort een speler bijna altijd bij dezelfde club als het veld.
  teamCode,
  // Per-render adaptieve shirt-breedte (zie computeAdaptiveShirtWidth in cardLayout.js) — afhankelijk van
  // het werkelijke aantal rijen in DEZE opstelling en de gemeten veldhoogte, dus als expliciete
  // inline-stijl doorgegeven i.p.v. een vaste CSS-klasse-override (die een per-render waarde niet kan
  // volgen). Terugval op SHIRT_WIDTH_PX_IDEAL enkel voor het zeldzame geval dat deze prop ontbreekt (bv.
  // vóór de eerste layout-meting in PitchField.jsx).
  shirtWidthPx = SHIRT_WIDTH_PX_IDEAL,
}) {
  const isEmpty = !slot.playerName;
  const safety = SAFETY_STYLE[slot.safety] ?? SAFETY_STYLE.green;
  const effectiveTeamCode = slot.playerTeamCode || teamCode || '';
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
          // Gap = shirt→label-afstand voor gevulde kaarten (zie pxi-card-shirt/pxi-card-label
          // hieronder) — die twee stukken dragen zelf hun eigen achtergrond/rand, deze rij-container
          // niet meer. Lege kaarten (Plus-icoon + rol-label) behouden hun bestaande, krappere gap en
          // eigen achtergrond/rand — geen shirt, dus die kaart is verder volledig ongewijzigd.
          gap: isEmpty ? '2px' : '6px',
          background: isEmpty ? 'rgba(42,20,64,0.45)' : 'transparent',
          border: isEmpty
            ? `2px dashed ${isActiveSearchTarget ? '#4ECDC4' : 'rgba(255,255,255,0.3)'}`
            : 'none',
          borderRadius: isEmpty ? '10px' : 0,
          padding: isEmpty ? '8px 9px' : 0,
          boxSizing: 'border-box',
          // Gevulde kaarten krijgen hun exacte breedte van de ouder (widthPx, zie hierboven) — die is
          // al berekend om zowel het (adaptief gemaate) shirt als de naam op één regel volledig te tonen
          // ZONDER een buurkaart te raken (zie computeAdaptiveShirtWidth in cardLayout.js). Lege kaarten
          // hebben geen naam-afhankelijke breedte, dus een simpele vaste minWidth volstaat.
          minWidth: isEmpty ? '70px' : undefined,
          width: hasComputedPosition ? `${widthPx}px` : undefined,
          cursor: readOnly ? 'default' : (isEmpty ? 'pointer' : 'grab'),
          boxShadow: isEmpty ? '0 2px 6px rgba(0,0,0,0.25)' : 'none',
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
            {effectiveTeamCode && (
              // Shirt-scoped position:relative wrapper: krimpt naar exact de afbeeldingsgrootte (flex-
              // kolom-ouder met alignItems:'center' rekt geen kinderen in de dwarsas), dus de badge/
              // verwijderknop hieronder landen automatisch op de hoeken van het SHIRT, niet van de
              // hele (nu veel bredere/hogere) kaart.
              <div style={{ position: 'relative' }}>
                {!readOnly && (
                  <>
                    {/* Safety-cyclus: klik doorloopt de 4 niveaus (zie SAFETY_CYCLE in theme.js). */}
                    <button
                      onClick={(e) => { e.stopPropagation(); onCycleSafety(index); }}
                      title={safety.label}
                      style={{
                        position: 'absolute', top: '-6px', right: '-6px', zIndex: 1,
                        width: '18px', height: '18px', borderRadius: '50%',
                        background: safety.badgeBg, border: '1px solid rgba(255,255,255,0.5)', cursor: 'pointer',
                      }}
                    />
                    {/* pxi-no-export: enkel een bewerk-knop, mag nooit op de geëxporteerde afbeelding
                        staan — exportImage.js sluit dit element expliciet uit via html2canvas's
                        ignoreElements, dus dit blijft onafhankelijk van React-rendertiming gegarandeerd
                        verborgen op de export. */}
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
                <img
                  src={`/club-shirts/${effectiveTeamCode}.png`}
                  alt=""
                  // Standaard native-draggable <img>'s zouden anders de eigen "sleep om te verplaatsen"-
                  // handler van de kaart (draggable hierboven, op de ouder-div) kunnen kapen.
                  draggable={false}
                  className="pxi-card-shirt"
                  style={{
                    width: `${shirtWidthPx}px`, height: `${shirtWidthPx}px`, objectFit: 'contain', flexShrink: 0,
                    // display:block is niet cosmetisch: een <img> is standaard inline-vervangen en krijgt
                    // dan "fantoomruimte" van de omringende line-height/font-metrics (het gekende
                    // CSS-euvel "gap onder een image") — zelf ontdekt via Playwright-meting: de
                    // position:relative-wrapper hierboven rendert dan hoger dan het shirt zelf (bv. 18px
                    // i.p.v. 8px), wat de verticale botsingsvrije herberekening in cardLayout.js
                    // (die van een exacte shirt→label-afstand uitgaat) ondermijnt.
                    display: 'block',
                    // Slagschaduw i.p.v. een eigen achtergrond/rand — het shirt "zweeft" los op het
                    // gras, zelfde effect (en exacte waarde) als het bestaande clublogo boven het veld.
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))',
                  }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
              </div>
            )}
            <div className="pxi-card-label" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              background: 'rgba(42,20,64,0.9)', border: `2px solid ${safety.border}`,
              borderRadius: '8px', padding: '4px 8px', boxSizing: 'border-box',
              boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
            }}>
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
            </div>
          </>
        )}
      </div>
    </div>
  );
}
