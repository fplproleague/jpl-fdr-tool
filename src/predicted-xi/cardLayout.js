// Botsingsvrije kaartlayout voor de Predicted XI Builder. Geen React-afhankelijkheid (zelfde conventie
// als formations.js) — enkel pure geometrie.
//
// Kaartbreedte groeit voortaan mee met de spelersnaam (zie PitchSlot.jsx — geen wrap/afkapping meer,
// namen staan altijd volledig op één regel), dus de vaste xPercent-coördinaten uit POSITION_PRESETS
// garanderen niet langer dat kaarten elkaar nooit raken. Deze module herberekent daarom, in echte
// pixels, de werkelijke linker-positie van elke gevulde kaart: kaarten die te dicht bij hun buur zouden
// komen (of buiten de veldrand zouden vallen) schuiven net genoeg opzij om minstens MIN_GAP_PX ertussen
// en MIN_EDGE_MARGIN_PX tot de rand te houden.
//
// Botsingsgevaar zit meestal HORIZONTAAL, binnen één "rij" (bv. de DEF-achterlinie): de Y-percentages
// in POSITION_PRESETS verschillen binnen zo'n rij hooguit 5 punten (71-76 voor LB/LCB/CCB/RCB/RB).
// Kaarten worden daarom eerst per rij gegroepeerd (Y binnen ROW_CLUSTER_THRESHOLD van elkaar), en
// binnen zo'n rij horizontaal ontward.
//
// (Een eerdere versie voegde opeenvolgende rijen die volledig uit DEF-slots bestonden samen tot één rij
// — bedoeld om wing-backs en center-backs, die in POSITION_PRESETS een net iets groter Y-gat hebben dan
// ROW_CLUSTER_THRESHOLD, als één achterlijn te tonen. Dat gaf niet het gewenste resultaat en is
// teruggedraaid: elke Y-cluster blijft gewoon zijn eigen rij, zoals vóór die wijziging.)
//
// Maar posities zijn niet strikt gebonden aan hun formatie-sjabloon — een speler kan handmatig naar om
// het even welke preset verplaatst worden (bv. een CM manueel naar CAM). Daardoor kan de afstand tussen
// twee opeenvolgende rijen soms kleiner zijn dan de kaarthoogte (concreet ontdekt: een CAM op yPercent 28,
// slechts 10 punten van de aanvalslinie op 18 — merkbaar overlappend op smalle/mobiele schermen, waar
// dezelfde procentuele afstand in minder pixels vertaalt terwijl de kaarthoogte grotendeels vast blijft).
// Naast de bestaande horizontale ontwarring lost resolveVerticalPositions() daarom ook VERTICALE
// overlap tussen rijen op: rijen worden top-naar-onder afgelopen en een rij schuift naar beneden als ze
// te dicht bij de vorige rij zou komen.
const MIN_GAP_PX = 5;
const MIN_EDGE_MARGIN_PX = 12;
// Ondergrenzen waarnaar gap/marge pas krimpen als een rij écht niet past bij de comfortabele
// standaardwaarden (bv. meerdere lange namen tegelijk in een 5-brede achterlinie) — nooit tot 0, want
// "nooit raken" (gap) en "nooit buiten het veld" (marge, met voorrang — zie resolveRow) blijven altijd
// harde eisen, ook in dat geval.
const GAP_FLOOR_PX = 1;
const EDGE_MARGIN_FLOOR_PX = 2;
const ROW_CLUSTER_THRESHOLD = 8;

// Mobiele kaartweergave: kleinere naam/prijs-tekst en padding, minder marge/gap — zie PitchSlot.jsx en
// PitchField.jsx, die dezelfde @media (max-width: 640px)-drempel gebruiken (MOBILE_BREAKPOINT_PX in
// theme.js) via CSS-klassen i.p.v. een JS-berekende drempel op de gemeten veldbreedte. Deze module kent
// zelf geen viewport en bepaalt "compact" dus niet meer zelf (zie computeCardPositions hieronder) — de
// aanroeper (PitchField.jsx) geeft door of de @media-regel actief is, zodat de hier berekende
// breedtes/hoogtes altijd overeenkomen met wat er werkelijk gerenderd wordt.
const NAME_FONT = '800 13px sans-serif';
const NAME_FONT_COMPACT = '800 9px sans-serif';
// De prijs staat op een eigen regel ONDER de naam (zie PitchSlot.jsx) — bij een korte naam ("Flo",
// "Ilic", "Ito") kan de prijstekst ("12.5M") net breder zijn dan de naam zelf. estimateCardWidth houdt
// daarom rekening met BEIDE regels (zie hieronder), niet enkel de naam — anders zou de kaart precies
// rond de korte naam passen terwijl de prijs eronder net buiten die smalle kaart zou uitsteken.
const PRICE_FONT = '700 10px sans-serif';
const PRICE_FONT_COMPACT = '700 7px sans-serif';
// Padding van het LABEL (naam/prijs-doosje, zie PitchSlot.jsx — niet meer van de hele kaart: het shirt
// erboven heeft geen eigen padding, dat zweeft los op het gras). Label-padding is 2x8px = 16px; +8px
// veiligheidsmarge omdat canvas measureText() niet altijd pixel-exact overeenkomt met de werkelijke
// DOM/html2canvas-rendering (zelf ondervonden bij eerdere iteraties) — zo blijft er altijd wat lucht rond
// de tekst i.p.v. een naam die net tegen de labelrand zou botsen. Zelfde padding geldt voor de prijsregel
// (beide regels zitten in dezelfde label-box).
const NAME_HORIZONTAL_PADDING_PX = 24;
const NAME_HORIZONTAL_PADDING_PX_COMPACT = 10; // padding compact 2x4px = 8 + 2px veiligheidsmarge
const EMPTY_CARD_WIDTH_PX = 70; // ongewijzigd t.o.v. de bestaande lege-slot-breedte
const EMPTY_CARD_WIDTH_PX_COMPACT = 42;

// Shirt-grootte — het dominante visuele element op een gevulde kaart (zie PitchSlot.jsx). Spelers kunnen
// vrij naar om het even welke positie-preset verplaatst worden (zie formations.js), dus het aantal
// "rijen" (Y-clusters, zie computeRowGroups) op een gegeven veld is NIET vast aan een formatiesjabloon
// gebonden — reële Predicted Lineups-data laat rijentallen tot 7 zien (bv. Genk: een 3-CB-plus-aparte-
// wingbacks-opstelling met daarbovenop nog eens gesplitste linies), ruim boven het "standaard" maximum
// van 5 (4-2-3-1/4-3-3). Eén vaste shirt-maat per viewport-tier kan dat onmogelijk garanderen zonder voor
// ALLE opstellingen even klein te worden, ook de overgrote meerderheid met maar 4-5 rijen.
//
// Daarom is de shirt-breedte per RENDER adaptief (zie computeAdaptiveShirtWidth hieronder): begin bij een
// "ideale", opvallend grote maat, en verklein enkel zoveel als het werkelijke aantal rijen van DEZE
// specifieke opstelling en de werkelijk gemeten veldhoogte vereisen — nooit verder dan een ondergrens
// waarop een clubshirt nog betrouwbaar herkenbaar blijft. Typische 4-5-rijen-opstellingen (verreweg de
// meeste) tonen zo het volle, dominante shirt; enkel een ongewone 6+-rijen-opstelling krimpt automatisch.
export const SHIRT_WIDTH_PX_IDEAL = 56;
export const SHIRT_WIDTH_PX_IDEAL_COMPACT = 28;
export const SHIRT_WIDTH_PX_IDEAL_NARROW = 20;

// Absolute ondergrens — enkel een laatste-redmiddel-sanity-clamp tegen een onzichtbaar (≤0px) shirt bij
// een extreem hoog aantal rijen. Bewust GEEN "mooie minimum"-grootte meer die boven de garantie uitgaat
// (zie de eerdere bug hieronder bij computeAdaptiveShirtWidth) — "nooit buiten het veld vallen" weegt
// zwaarder dan een iets groter shirt. Laag gehouden (4px): bij 7 rijen op de smalste 320px-telefoon (reëel
// voorgekomen, zie Genk-voorbeeld) is het per-rij-budget na aftrek van de labelhoogte al krap genoeg dat
// een te hoge ondergrens de garantie zelf zou breken — zelf ontdekt (zie hieronder).
const SHIRT_WIDTH_PX_ABS_MIN = 4;

// Vaste "overhead" bovenop de shirt-breedte om de totale kaarthoogte te bepalen: shirt→label-gap (zie
// PitchSlot.jsx) + labelhoogte (padding + naam-/prijsregel) — onafhankelijk van de shirt-grootte zelf,
// dus geen apart getal per tier nodig.
//
// Empirisch herbevestigd via Playwright (`getBoundingClientRect()` op de werkelijk gerenderde `<img>` en
// `.pxi-card-label`): 45.94px desktop, 32.34px compact/narrow (identieke label-stijl in beide tiers), plus
// een kleine veiligheidsmarge hierboven. Een eerdere meting had hier `display:block` op het shirt-`<img>`
// nog niet toegepast (zie PitchSlot.jsx) — zonder die regel kreeg de `position:relative`-wrapper er "fantoom-
// ruimte" bij van de omringende line-height/font-metrics (het gekende CSS-euvel "gap onder een inline
// image"), tot 10px extra hoogte die niets met de werkelijke shirt/label-afmetingen te maken had. Dat
// zorgde voor een dubbele fout: de eerste (te hoge) overhead-schatting hier maskeerde het probleem soms,
// maar bij een zeer klein adaptief shirt (bv. 8px op een 7-rijen-opstelling) woog die fantoomruimte relatief
// zwaar genoeg om alsnog daadwerkelijke rij-overlap te veroorzaken (zelf gemeten: 38px overloop bij Club
// Brugge/Genk op 375px). Met `display:block` gefixt EN deze overhead-waarden opnieuw op de echte (nu
// betrouwbare) meting gebaseerd, in plaats van indirect afgeleid uit een oudere, met een andere shirt-
// grootte gemeten totaalhoogte.
const CARD_OVERHEAD_PX = 48;
const CARD_OVERHEAD_PX_COMPACT = 34; // geldt voor zowel compact als narrow (identieke label-stijl)

const MIN_VERTICAL_GAP_PX = 6;
const MIN_VERTICAL_GAP_PX_COMPACT = 4;
const MIN_VERTICAL_GAP_PX_NARROW = 2;
const VERTICAL_EDGE_MARGIN_PX = 4;
const VERTICAL_EDGE_MARGIN_PX_NARROW = 2;
// Ondergrenzen waarnaar de verticale gap/randmarge pas krimpen als rijen écht niet passen bij hun
// comfortabele standaardwaarden — zelfde "nooit 0, wel een harde bodem"-filosofie als GAP_FLOOR_PX/
// EDGE_MARGIN_FLOOR_PX hierboven, nu ook toegepast op resolveVerticalPositions (zie hieronder).
const VERTICAL_GAP_FLOOR_PX = 1;
const VERTICAL_EDGE_MARGIN_FLOOR_PX = 2;

// Bepaalt de effectieve shirt-breedte voor DEZE specifieke opstelling: start bij de ideale maat en
// verklein enkel zoveel als nodig zodat `rowCount` rijen (elk met hoogte shirt+overhead) GEGARANDEERD
// binnen de gemeten veldhoogte passen.
//
// Cruciaal: de ceiling-berekening hieronder gebruikt VERTICAL_GAP_FLOOR_PX/VERTICAL_EDGE_MARGIN_FLOOR_PX
// (de ABSOLUTE bodemwaarden van resolveVerticalPositions' eigen samengeperste fallback), niet de "mooie"
// standaard-marges/gap. Een eerdere versie gebruikte wél de mooie marges hier, wat een te optimistische —
// dus NIET gegarandeerde — shirt-grootte opleverde bij 6-7 rijen: resolveVerticalPositions kan altijd tot
// exact deze bodemwaarden degraderen, dus DAT is de werkelijke bindende grens, ongeacht welk plaatsings-
// pad (natuurlijk of samengeperst) uiteindelijk gebruikt wordt. Zelf ontdekt via reële Predicted
// Lineups-data (Club Brugge/Genk, 6-7 rijen): met de mooie-marges-versie stak de onderste rij tot 38px
// buiten het veld — deze bodemwaarden-versie garandeert dat wiskundig uit, per constructie.
function computeAdaptiveShirtWidth(rowCount, pitchHeightPx, compact, narrow) {
  const idealShirt = narrow ? SHIRT_WIDTH_PX_IDEAL_NARROW : compact ? SHIRT_WIDTH_PX_IDEAL_COMPACT : SHIRT_WIDTH_PX_IDEAL;
  if (!pitchHeightPx || rowCount <= 1) return idealShirt;
  const overhead = compact ? CARD_OVERHEAD_PX_COMPACT : CARD_OVERHEAD_PX;
  const maxGuaranteedCardHeight = (pitchHeightPx - 2 * VERTICAL_EDGE_MARGIN_FLOOR_PX - (rowCount - 1) * VERTICAL_GAP_FLOOR_PX) / rowCount;
  const guaranteedShirt = maxGuaranteedCardHeight - overhead;
  return Math.max(SHIRT_WIDTH_PX_ABS_MIN, Math.min(idealShirt, guaranteedShirt));
}

// Compacte varianten van de veiligheidsmarges hierboven — kleinere kaarten laten kleinere marges toe
// zonder dat "nooit raken"/"nooit buiten het veld" in gevaar komt (zie resolveRow/resolveVerticalPositions),
// en een kleinere marge betekent meer bruikbare breedte voor de kaarten zelf op een toch al smal scherm.
const MIN_GAP_PX_COMPACT = 3;
const MIN_EDGE_MARGIN_PX_COMPACT = 6;
const MIN_GAP_PX_NARROW = 2;
const MIN_EDGE_MARGIN_PX_NARROW = 4;

let measureCanvas = null;
export function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

// `minWidthPx` komt van de aanroeper (computeCardPositions) — afgeleid van de per-render adaptieve
// shirt-breedte (zie computeAdaptiveShirtWidth hierboven), want het shirt is vrijwel altijd de bindende
// breedte-eis, niet de naamtekst. Lettertype/label-padding blijven wél gewoon per `compact`-tier vast
// (die zijn al krap genoeg, en onafhankelijk van de shirt-grootte).
export function estimateCardWidth(playerName, playerPrice, compact = false, minWidthPx = 0) {
  if (!playerName) return compact ? EMPTY_CARD_WIDTH_PX_COMPACT : EMPTY_CARD_WIDTH_PX;
  const nameFont = compact ? NAME_FONT_COMPACT : NAME_FONT;
  const priceFont = compact ? PRICE_FONT_COMPACT : PRICE_FONT;
  const padding = compact ? NAME_HORIZONTAL_PADDING_PX_COMPACT : NAME_HORIZONTAL_PADDING_PX;
  const nameWidth = measureTextWidth(playerName, nameFont);
  const priceWidth = playerPrice != null ? measureTextWidth(`${playerPrice.toFixed(1)}M`, priceFont) : 0;
  const contentWidth = Math.max(nameWidth, priceWidth);
  return Math.max(Math.ceil(contentWidth) + padding, minWidthPx);
}

// Groepeert slots in rijen op basis van Y-nabijheid: sorteert op yPercent en start een nieuwe rij
// zodra de afstand tot de vorige waarde ROW_CLUSTER_THRESHOLD overschrijdt.
function computeRowGroups(pitchSlots) {
  const sorted = [...pitchSlots].sort((a, b) => a.yPercent - b.yPercent);
  const rows = [];
  let currentRow = [];
  let lastY = null;
  for (const slot of sorted) {
    if (lastY !== null && slot.yPercent - lastY > ROW_CLUSTER_THRESHOLD) {
      rows.push(currentRow);
      currentRow = [];
    }
    currentRow.push(slot);
    lastY = slot.yPercent;
  }
  if (currentRow.length) rows.push(currentRow);
  return rows;
}

// Lost horizontale botsingen op binnen één rij op, in twee stappen:
//
// 1. Probeer zo dicht mogelijk bij ieders ideale xPercent-positie te blijven (de natuurlijke
//    formatie-spreiding), met minstens MIN_GAP_PX tussen elke kaart — dit is de normale, gebruikelijke
//    weg, en behoudt de bedoelde vorm van de linie.
// 2. Past de rij zelfs dan niet binnen de beschikbare veldbreedte (bv. meerdere lange namen naast elkaar
//    in een 5-brede achterlinie), geef de "blijf dicht bij ideaal"-voorkeur dan volledig op en pak
//    volledig compact in (rand-aan-rand, met een net genoeg verkleinde gap en pas als allerlaatste
//    redmiddel ook een verkleinde randmarge). Dat garandeert per constructie dat de rij past — in
//    tegenstelling tot een eerdere versie die de gap verkleinde maar de kaarten toch nog op hun ideale
//    positie probeerde te houden: sommige buurparen behielden daardoor een natuurlijke afstand die groter
//    was dan de verkleinde gap, waardoor de rij alsnog net over de rand kon steken (zelf ontdekt en
//    hierdoor gefixt tijdens het testen).
function resolveRow(rowSlots, pitchWidthPx, positions, compact, narrow, minCardWidthPx) {
  const minGap = narrow ? MIN_GAP_PX_NARROW : compact ? MIN_GAP_PX_COMPACT : MIN_GAP_PX;
  const minEdgeMargin = narrow ? MIN_EDGE_MARGIN_PX_NARROW : compact ? MIN_EDGE_MARGIN_PX_COMPACT : MIN_EDGE_MARGIN_PX;
  const items = [...rowSlots]
    .sort((a, b) => a.xPercent - b.xPercent)
    .map(slot => ({ slot, widthPx: estimateCardWidth(slot.playerName, slot.playerPrice, compact, minCardWidthPx) }));
  const totalCardWidth = items.reduce((sum, item) => sum + item.widthPx, 0);
  const gapCount = Math.max(items.length - 1, 0);
  const availableWidth = pitchWidthPx - 2 * minEdgeMargin;

  let prevRight = -Infinity;
  for (const item of items) {
    const idealLeft = (item.slot.xPercent / 100) * pitchWidthPx - item.widthPx / 2;
    item.leftPx = prevRight === -Infinity ? idealLeft : Math.max(idealLeft, prevRight + minGap);
    prevRight = item.leftPx + item.widthPx;
  }
  const naturalSpan = items[items.length - 1].leftPx + items[items.length - 1].widthPx - items[0].leftPx;

  let edgeMargin = minEdgeMargin;
  if (naturalSpan > availableWidth) {
    let gap = minGap;
    if (gapCount > 0 && totalCardWidth + gapCount * gap > availableWidth) {
      gap = Math.max(GAP_FLOOR_PX, (availableWidth - totalCardWidth) / gapCount);
    }
    const compactWidth = totalCardWidth + gapCount * gap;
    if (compactWidth > pitchWidthPx - 2 * EDGE_MARGIN_FLOOR_PX) {
      // (Past zelfs dan nog niet — enkel mogelijk bij onrealistisch lange namen — dan blijft de kleinst
      // toegestane marge gehandhaafd; bewust aanvaard, uiterst zeldzaam restrisico.)
      edgeMargin = EDGE_MARGIN_FLOOR_PX;
    } else {
      edgeMargin = Math.max(EDGE_MARGIN_FLOOR_PX, (pitchWidthPx - compactWidth) / 2);
    }
    let left = edgeMargin;
    for (const item of items) {
      item.leftPx = left;
      left += item.widthPx + gap;
    }
  }

  const first = items[0];
  const last = items[items.length - 1];
  let shift = 0;
  const overflowRight = (last.leftPx + last.widthPx) - (pitchWidthPx - edgeMargin);
  if (overflowRight > 0) shift = -overflowRight;
  const underflowLeft = edgeMargin - (first.leftPx + shift);
  if (underflowLeft > 0) shift += underflowLeft;

  for (const item of items) {
    positions.set(item.slot, { leftPx: item.leftPx + shift, widthPx: item.widthPx });
  }
}

// Lost verticale botsingen tussen rijen op, in dezelfde twee-traps-geest als resolveRow hierboven:
//
// 1. Probeer zo dicht mogelijk bij ieders ideale Y-positie te blijven (het gemiddelde yPercent van de
//    rij, herleid naar px), met minstens cardHeight + minGap tussen de centers van opeenvolgende rijen —
//    dit is de normale weg en behoudt de bedoelde formatie-vorm.
// 2. Passen alle rijen zelfs dan niet binnen de beschikbare veldhoogte (kan gebeuren bij een handmatig
//    verplaatste positie die ongewoon dicht bij een buurlijn ligt, of bij een opstelling met ongewoon veel
//    rijen — zie SHIRT_WIDTH_PX_IDEAL hierboven), geef de "blijf dicht bij ideaal"-voorkeur dan volledig
//    op en pak compact in: verklein eerst de gap tot VERTICAL_GAP_FLOOR_PX, en pas als dat nog niet
//    volstaat ook de randmarge tot VERTICAL_EDGE_MARGIN_FLOOR_PX. Dat garandeert per constructie minstens
//    cardHeight tussen elke rij (dus NOOIT overlap) — in tegenstelling tot een eerdere versie die de
//    beschikbare hoogte blind gelijkmatig verdeelde zonder die garantie: bij genoeg rijen kon de
//    resulterende afstand kleiner uitvallen dan de kaarthoogte zelf, dus daadwerkelijk overlappende rijen
//    (zelf ontdekt via reële Predicted Lineups-data met 7 rijen, bv. Genk).
//
// Geeft een array terug (zelfde volgorde/lengte als `rows`) met de finale center-Y in px per rij.
function resolveVerticalPositions(rows, pitchHeightPx, cardHeight, minGap, edgeMargin) {
  const minSpacing = cardHeight + minGap;

  const idealTops = rows.map((row) => {
    const avgY = row.reduce((sum, slot) => sum + slot.yPercent, 0) / row.length;
    return (avgY / 100) * pitchHeightPx;
  });

  const natural = [...idealTops];
  for (let i = 1; i < natural.length; i++) {
    natural[i] = Math.max(natural[i], natural[i - 1] + minSpacing);
  }
  const naturalSpan = natural[natural.length - 1] - natural[0];
  const availableSpan = pitchHeightPx - 2 * edgeMargin - cardHeight;

  if (rows.length <= 1 || naturalSpan <= availableSpan) {
    const first = natural[0];
    const last = natural[natural.length - 1];
    let shift = 0;
    const overflowBottom = (last + cardHeight / 2) - (pitchHeightPx - edgeMargin);
    if (overflowBottom > 0) shift = -overflowBottom;
    const underflowTop = (edgeMargin + cardHeight / 2) - (first + shift);
    if (underflowTop > 0) shift += underflowTop;
    return shift !== 0 ? natural.map(t => t + shift) : natural;
  }

  const gapCount = rows.length - 1;
  const totalCardHeight = rows.length * cardHeight;
  let gap = minGap;
  if (totalCardHeight + gapCount * gap > pitchHeightPx - 2 * edgeMargin) {
    gap = Math.max(VERTICAL_GAP_FLOOR_PX, (pitchHeightPx - 2 * edgeMargin - totalCardHeight) / gapCount);
  }
  const compactSpan = totalCardHeight + gapCount * gap;
  let finalEdgeMargin;
  if (compactSpan > pitchHeightPx - 2 * VERTICAL_EDGE_MARGIN_FLOOR_PX) {
    // (Past zelfs dan nog niet — enkel mogelijk bij een extreem hoog aantal rijen — dan blijft de
    // kleinst toegestane marge gehandhaafd; bewust aanvaard, uiterst zeldzaam restrisico, zelfde
    // categorie als de "onrealistisch lange namen"-uitzondering in resolveRow hierboven.)
    finalEdgeMargin = VERTICAL_EDGE_MARGIN_FLOOR_PX;
  } else {
    finalEdgeMargin = Math.max(VERTICAL_EDGE_MARGIN_FLOOR_PX, (pitchHeightPx - compactSpan) / 2);
  }

  const tops = [];
  let top = finalEdgeMargin + cardHeight / 2;
  for (let i = 0; i < rows.length; i++) {
    tops.push(top);
    top += cardHeight + gap;
  }
  return tops;
}

// Hoofdfunctie: geeft {positions, shirtWidthPx} terug — `positions` is een Map van slot ->
// {leftPx, widthPx, topPx} voor elke gevulde kaart, `shirtWidthPx` is de voor DEZE opstelling berekende
// adaptieve shirt-breedte (zie computeAdaptiveShirtWidth hierboven), die de aanroeper (PitchField.jsx)
// als expliciete inline-stijl aan elke <PitchSlot> doorgeeft — een per-render berekende waarde kan niet
// via een vaste CSS-klasse-override (zoals de vorige, viewport-tier-gebonden opzet) worden toegepast.
// Lege slots zitten in `positions` bewust niet in (ze hebben geen naam-afhankelijke breedte en behouden
// hun eenvoudige percentage-positionering in PitchSlot.jsx).
//
// `compact`/`narrow` komen van de aanroeper (PitchField.jsx), die bepaalt via dezelfde @media-drempels
// als de CSS (MOBILE_BREAKPOINT_PX/NARROW_BREAKPOINT_PX in theme.js) welke kaarttier van toepassing is —
// deze module meet zelf geen viewport, enkel de reeds gemeten pitchWidthPx/pitchHeightPx in px. `narrow`
// is enkel betekenisvol als `compact` ook true is.
export function computeCardPositions(pitchSlots, pitchWidthPx, pitchHeightPx, compact = false, narrow = false) {
  const idealShirt = narrow ? SHIRT_WIDTH_PX_IDEAL_NARROW : compact ? SHIRT_WIDTH_PX_IDEAL_COMPACT : SHIRT_WIDTH_PX_IDEAL;
  const positions = new Map();
  if (!pitchWidthPx) return { positions, shirtWidthPx: idealShirt };

  const filled = pitchSlots.filter(s => s.playerName);
  const rows = computeRowGroups(filled);

  const shirtWidthPx = computeAdaptiveShirtWidth(rows.length, pitchHeightPx, compact, narrow);
  const minCardWidthPx = shirtWidthPx + (narrow ? 4 : 6);
  const cardHeight = shirtWidthPx + (compact ? CARD_OVERHEAD_PX_COMPACT : CARD_OVERHEAD_PX);

  for (const row of rows) resolveRow(row, pitchWidthPx, positions, compact, narrow, minCardWidthPx);

  if (pitchHeightPx) {
    const minGap = narrow ? MIN_VERTICAL_GAP_PX_NARROW : compact ? MIN_VERTICAL_GAP_PX_COMPACT : MIN_VERTICAL_GAP_PX;
    const edgeMargin = narrow ? VERTICAL_EDGE_MARGIN_PX_NARROW : VERTICAL_EDGE_MARGIN_PX;
    const rowTops = resolveVerticalPositions(rows, pitchHeightPx, cardHeight, minGap, edgeMargin);
    rows.forEach((row, i) => {
      const topPx = rowTops[i];
      for (const slot of row) {
        const entry = positions.get(slot);
        if (entry) entry.topPx = topPx;
      }
    });
  }

  return { positions, shirtWidthPx };
}
