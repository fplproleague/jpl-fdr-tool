// Eén speler-kaartje (of lege plek) op het veld. Absoluut gepositioneerd — gevulde kaarten krijgen hun
// exacte leftPx/widthPx van de aanroeper (PitchField.jsx, zie cardLayout.js) omdat de kaartbreedte met
// de spelersnaam meegroeit en de vaste xPercent-coördinaten dus niet langer garanderen dat kaarten
// elkaar nooit raken — die botsingsvrije herberekening gebeurt één niveau hoger, dit component tekent
// enkel het resultaat. Lege slots hebben een vaste breedte (geen naam om rekening mee te houden) en
// gebruiken nog de eenvoudige percentage-positionering. Verder regelt dit component enkel het kaartje
// zelf: kleuren/opmaak, de safety-rand+cyclus-badge, de verwijder-knop, en drag/klik-handlers. Gevulde
// kaarten bestaan uit TWEE los ogende stukken (bewust géén gedeelde kader, GEEN van beide heeft een eigen
// achtergrond/rand): een groot, kaal shirt dat rechtstreeks "op het gras" zweeft (slagschaduw — het shirt
// is de dominante marker, vergelijkbaar met een echte opstellingsgrafiek), en daaronder kale naam-/
// prijstekst (géén kaartje eromheen — enkel een tekst-schaduw houdt de tekst leesbaar tegen het
// wisselende groene veld/shirtkleuren, zie de spans hieronder) — beide zitten in dezelfde onzichtbare
// flex-kolom, die alle interactie draagt, dus functioneel blijft dit één geheel. Gevulde kaarten
// ondersteunen zowel klikken (opent de positiekiezer,
// zie PositionPicker.jsx) als slepen (automatische settle naar de dichtstbije positie, zie
// PitchField.jsx) — allebei komen uiteindelijk uit bij dezelfde toewijzingslogica.
import { Plus, X } from 'lucide-react';
import { SAFETY_STYLE } from './theme';
import { SHIRT_WIDTH_PX_IDEAL } from './cardLayout';

// Lege slots hebben een vaste breedte (70px, zie ook EMPTY_CARD_WIDTH_PX in cardLayout.js) — een
// eenvoudige CSS-klem (helft van de breedte + kleine randmarge) volstaat hier, in dezelfde geest als de
// pixel-nauwkeurige klem die cardLayout.js voor gevulde kaarten toepast.
const EMPTY_CARD_EDGE_CLAMP_PX = 47;

// Tekst-schaduw voor de kale naam-/prijstekst (zie de spans hieronder — geen kaartachtergrond meer om de
// leesbaarheid te garanderen). Een enkele blur-schaduw bleek onvoldoende tegen LICHTE achtergronden zoals
// de witte veldlijnen (bv. de GK-kaart, die vaak op de doelgebiedlijn staat) — daar smelt een simpele
// schaduw grotendeels weg. Dit stapelt vier kleine, tegenovergestelde offsets + een bredere blur-halo, een
// gekende CSS-truc om een pseudo-outline te simuleren (`text-stroke` zelf heeft geen betrouwbare
// cross-browser ondersteuning) — dat houdt de tekst leesbaar tegen zowel donker gras, felle shirtkleuren
// als witte lijnen.
const TEXT_SHADOW = [
  '1px 1px 2px rgba(0,0,0,0.9)',
  '-1px -1px 2px rgba(0,0,0,0.9)',
  '1px -1px 2px rgba(0,0,0,0.9)',
  '-1px 1px 2px rgba(0,0,0,0.9)',
  '0 0 4px rgba(0,0,0,0.75)',
].join(', ');

// Safety-badge en verwijderknop schaalden voorheen niet mee met de adaptieve shirt-breedte (shirtWidthPx,
// zie computeAdaptiveShirtWidth in cardLayout.js) — een vaste 18px bleef even groot ongeacht hoe klein het
// shirt zelf werd (bv. mobiel, of een opstelling met veel rijen), en kon het shirt daardoor grotendeels
// verbergen. BADGE_SIZE_RATIO houdt dezelfde verhouding aan als het oorspronkelijke 18px-bij-56px-ideaal-
// shirt (18/56 ≈ 0.32); BADGE_MAX_PX plafonneert op die oorspronkelijke 18px (nooit groter dan voorheen),
// BADGE_MIN_PX voorkomt dat het bolletje bij een extreem klein shirt onleesbaar/ontappable klein wordt.
const BADGE_SIZE_RATIO = 0.32;
const BADGE_MIN_PX = 8;
const BADGE_MAX_PX = 18;

function computeBadgeSizePx(shirtWidthPx) {
  return Math.min(BADGE_MAX_PX, Math.max(BADGE_MIN_PX, shirtWidthPx * BADGE_SIZE_RATIO));
}

export default function PitchSlot({
  slot, index, leftPx, widthPx, topPx, isActiveSearchTarget,
  onSlotClick, onRemove, onCycleSafety, onDragStart,
  // Puur-visuele weergave voor de publieke Predicted Lineups-tab (zie PredictedLineupsTab.jsx): geen
  // enkele interactie — geen klik/sleep, geen verwijder-knop. De safety-badge blijft wél zichtbaar (enkel
  // niet-klikbaar) — die toont voor bezoekers relevante informatie (starterskans), in tegenstelling tot de
  // verwijder-knop die enkel een bewerk-actie is. Standaard false, dus de privé Predicted XI Builder is
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
  // Badge/verwijderknop-grootte volgt de adaptieve shirt-breedte (zie computeBadgeSizePx hierboven) —
  // enkel relevant voor gevulde kaarten, maar goedkoop genoeg om altijd te berekenen.
  const badgeSizePx = computeBadgeSizePx(shirtWidthPx);
  const badgeOffsetPx = -(badgeSizePx / 3);

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
          // Gap = shirt→naam/prijs-afstand voor gevulde kaarten (zie pxi-card-shirt/pxi-card-label
          // hieronder) — geen van beide stukken heeft een eigen achtergrond/rand, deze rij-container
          // ook niet. Lege kaarten (Plus-icoon + rol-label) behouden hun bestaande, krappere gap en
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
            <Plus size={17} color={isActiveSearchTarget ? '#4ECDC4' : '#A794C2'} />
            <span style={{
              color: '#A794C2', fontSize: '11px', fontWeight: 700,
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
                {/* Safety-cyclus: klik doorloopt de 4 niveaus (zie SAFETY_CYCLE in theme.js) — enkel
                    klikbaar buiten readOnly, maar het bolletje zelf blijft altijd zichtbaar (ook op de
                    publieke Predicted Lineups-tab): het toont relevante info (starterskans) voor
                    bezoekers, in tegenstelling tot de verwijder-knop hieronder. */}
                <button
                  onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onCycleSafety(index); }}
                  title={safety.label}
                  disabled={readOnly}
                  style={{
                    position: 'absolute', top: `${badgeOffsetPx}px`, right: `${badgeOffsetPx}px`, zIndex: 1,
                    width: `${badgeSizePx}px`, height: `${badgeSizePx}px`, borderRadius: '50%',
                    background: safety.badgeBg, border: '1px solid rgba(255,255,255,0.5)',
                    cursor: readOnly ? 'default' : 'pointer', padding: 0,
                  }}
                />
                {!readOnly && (
                  // pxi-no-export: enkel een bewerk-knop, mag nooit op de geëxporteerde afbeelding staan
                  // — exportImage.js sluit dit element expliciet uit via html2canvas's ignoreElements,
                  // dus dit blijft onafhankelijk van React-rendertiming gegarandeerd verborgen op de
                  // export.
                  <button
                    onClick={(e) => { e.stopPropagation(); onRemove(index); }}
                    title="Verwijder speler"
                    className="pxi-no-export"
                    style={{
                      position: 'absolute', top: `${badgeOffsetPx}px`, left: `${badgeOffsetPx}px`, zIndex: 1,
                      width: `${badgeSizePx}px`, height: `${badgeSizePx}px`, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', padding: 0,
                      background: 'rgba(42,20,64,0.9)', color: '#C9B8E0',
                      border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer',
                    }}
                  >
                    <X size={Math.max(7, badgeSizePx * 0.6)} />
                  </button>
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
            {/* Kaal (geen achtergrond/rand/padding meer, zie bestandscommentaar hierboven) — enkel de
                flex-kolom zelf, puur voor de layout-groepering van naam+prijs. De text-shadow op de
                spans hieronder draagt nu alleen de leesbaarheid, i.p.v. een achtergrondvlak. */}
            <div className="pxi-card-label" style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
            }}>
              <span className="pxi-card-name" style={{
                color: '#FFF', fontSize: '13px', fontWeight: 800,
                textAlign: 'center', lineHeight: 1.15, whiteSpace: 'nowrap',
                textShadow: TEXT_SHADOW,
              }}>
                {slot.playerName}
              </span>
              {slot.playerPrice != null && (
                <span className="pxi-card-price" style={{
                  color: '#A794C2', fontSize: '10px', fontWeight: 700,
                  textShadow: TEXT_SHADOW,
                }}>
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
