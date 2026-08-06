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

// Vanaf hier wordt de kaartweergave "compact": kleinere naam/prijs-tekst en padding (zie PitchSlot.jsx,
// dat exact dezelfde drempel gebruikt via de geëxporteerde COMPACT_BREAKPOINT_PX) — dit is de directe
// invulling van "op mobiel iets kleinere kaarten". Moet in cardLayout.js zelf mee bepalen welke
// font/padding-waarden hieronder gebruikt worden, anders zouden de hier berekende breedtes/hoogtes niet
// meer overeenkomen met wat er werkelijk gerenderd wordt.
export const COMPACT_BREAKPOINT_PX = 400;

const NAME_FONT = '800 13px sans-serif';
const NAME_FONT_COMPACT = '800 10px sans-serif';
// Kaart-padding is 2x8px (zie PitchSlot.jsx) = 16px; +8px veiligheidsmarge omdat canvas measureText()
// niet altijd pixel-exact overeenkomt met de werkelijke DOM/html2canvas-rendering (zelf ondervonden bij
// eerdere iteraties deze sessie) — zo blijft er altijd wat lucht rond de tekst i.p.v. een naam die net
// tegen de kaartrand zou botsen.
const NAME_HORIZONTAL_PADDING_PX = 24;
const NAME_HORIZONTAL_PADDING_PX_COMPACT = 14; // padding compact 2x5px = 10 + 4px veiligheidsmarge
const EMPTY_CARD_WIDTH_PX = 70; // ongewijzigd t.o.v. de bestaande lege-slot-breedte
const EMPTY_CARD_WIDTH_PX_COMPACT = 50;

// Kaarthoogte in px, gemeten op de werkelijk gerenderde kaart (padding + naam-/prijsregel + rand) en
// licht naar boven afgerond als veiligheidsmarge — zelfde geest als NAME_HORIZONTAL_PADDING_PX hierboven.
// Nodig voor de verticale botsingsdetectie hieronder, wat bij de horizontale breedteberekening niet
// speelde (die kent enkel de kaartbreedte, niet de hoogte).
const CARD_HEIGHT_PX = 58;
const CARD_HEIGHT_PX_COMPACT = 40;
const MIN_VERTICAL_GAP_PX = 6;
const VERTICAL_EDGE_MARGIN_PX = 4;

let measureCanvas = null;
export function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function estimateCardWidth(playerName, compact = false) {
  if (!playerName) return compact ? EMPTY_CARD_WIDTH_PX_COMPACT : EMPTY_CARD_WIDTH_PX;
  const font = compact ? NAME_FONT_COMPACT : NAME_FONT;
  const padding = compact ? NAME_HORIZONTAL_PADDING_PX_COMPACT : NAME_HORIZONTAL_PADDING_PX;
  return Math.ceil(measureTextWidth(playerName, font)) + padding;
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
  return mergeAdjacentDefRows(rows);
}

// POSITION_PRESETS plaatst wing-backs (LWB/RWB, yPercent 61) merkbaar hoger dan center-backs (LCB/CCB/
// RCB, yPercent 74-76) — een bewuste tactische nuance, maar met een gat (13-15 punten) groter dan
// ROW_CLUSTER_THRESHOLD. Zonder correctie splitst de achterlinie daardoor altijd in twee rijen van 2,
// zelfs bij een gewone back-vier — herkenbaar gemeld als "de 4 verdedigers passen niet allemaal" (ze
// lijken niet te passen omdat ze nooit als één lijn naast elkaar getekend worden, niet omdat er
// werkelijk te weinig breedte is). DEF is de enige brede positie waarbij dit voorkomt: MID heeft wél
// bedoeld gescheiden lijnen (bv. CDM/RDM op 57 vs CAM op 30) die apart moeten blijven, dus dit mag geen
// generieke regel worden — enkel opeenvolgende rijen die VOLLEDIG uit DEF-slots bestaan, worden
// samengevoegd tot één rij (GK blijft altijd apart: andere broadPosition).
function mergeAdjacentDefRows(rows) {
  const merged = [];
  for (const row of rows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.every(s => s.broadPosition === 'DEF') && row.every(s => s.broadPosition === 'DEF')) {
      merged[merged.length - 1] = [...prev, ...row];
    } else {
      merged.push(row);
    }
  }
  return merged;
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
function resolveRow(rowSlots, pitchWidthPx, positions, compact) {
  const items = [...rowSlots]
    .sort((a, b) => a.xPercent - b.xPercent)
    .map(slot => ({ slot, widthPx: estimateCardWidth(slot.playerName, compact) }));
  const totalCardWidth = items.reduce((sum, item) => sum + item.widthPx, 0);
  const gapCount = Math.max(items.length - 1, 0);
  const availableWidth = pitchWidthPx - 2 * MIN_EDGE_MARGIN_PX;

  let prevRight = -Infinity;
  for (const item of items) {
    const idealLeft = (item.slot.xPercent / 100) * pitchWidthPx - item.widthPx / 2;
    item.leftPx = prevRight === -Infinity ? idealLeft : Math.max(idealLeft, prevRight + MIN_GAP_PX);
    prevRight = item.leftPx + item.widthPx;
  }
  const naturalSpan = items[items.length - 1].leftPx + items[items.length - 1].widthPx - items[0].leftPx;

  let edgeMargin = MIN_EDGE_MARGIN_PX;
  if (naturalSpan > availableWidth) {
    let gap = MIN_GAP_PX;
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
//    rij, herleid naar px), met minstens CARD_HEIGHT_PX + MIN_VERTICAL_GAP_PX tussen de centers van
//    opeenvolgende rijen — dit is de normale weg en behoudt de bedoelde formatie-vorm.
// 2. Passen alle rijen zelfs dan niet binnen de beschikbare veldhoogte (kan gebeuren bij een handmatig
//    verplaatste positie die ongewoon dicht bij een buurlijn ligt — zie CAM-voorbeeld hierboven), geef de
//    "blijf dicht bij ideaal"-voorkeur dan op en verdeel alle rijen gelijkmatig over de beschikbare hoogte.
//
// Geeft een array terug (zelfde volgorde/lengte als `rows`) met de finale center-Y in px per rij.
function resolveVerticalPositions(rows, pitchHeightPx, compact) {
  const cardHeight = compact ? CARD_HEIGHT_PX_COMPACT : CARD_HEIGHT_PX;
  const minSpacing = cardHeight + MIN_VERTICAL_GAP_PX;

  const idealTops = rows.map((row) => {
    const avgY = row.reduce((sum, slot) => sum + slot.yPercent, 0) / row.length;
    return (avgY / 100) * pitchHeightPx;
  });

  const natural = [...idealTops];
  for (let i = 1; i < natural.length; i++) {
    natural[i] = Math.max(natural[i], natural[i - 1] + minSpacing);
  }
  const naturalSpan = natural[natural.length - 1] - natural[0];
  const availableSpan = pitchHeightPx - 2 * VERTICAL_EDGE_MARGIN_PX - cardHeight;

  let tops = natural;
  if (rows.length > 1 && naturalSpan > availableSpan && availableSpan > 0) {
    const spacing = availableSpan / (rows.length - 1);
    const start = VERTICAL_EDGE_MARGIN_PX + cardHeight / 2;
    tops = rows.map((_, i) => start + i * spacing);
  } else {
    const first = tops[0];
    const last = tops[tops.length - 1];
    let shift = 0;
    const overflowBottom = (last + cardHeight / 2) - (pitchHeightPx - VERTICAL_EDGE_MARGIN_PX);
    if (overflowBottom > 0) shift = -overflowBottom;
    const underflowTop = (VERTICAL_EDGE_MARGIN_PX + cardHeight / 2) - (first + shift);
    if (underflowTop > 0) shift += underflowTop;
    if (shift !== 0) tops = tops.map(t => t + shift);
  }

  return tops;
}

// Hoofdfunctie: geeft een Map van slot -> {leftPx, widthPx, topPx} terug voor elke gevulde kaart. Lege
// slots zitten hier bewust niet in (ze hebben geen naam-afhankelijke breedte en behouden hun eenvoudige
// percentage-positionering in PitchSlot.jsx).
export function computeCardPositions(pitchSlots, pitchWidthPx, pitchHeightPx) {
  const positions = new Map();
  if (!pitchWidthPx) return positions;
  const compact = pitchWidthPx < COMPACT_BREAKPOINT_PX;
  const filled = pitchSlots.filter(s => s.playerName);
  const rows = computeRowGroups(filled);
  for (const row of rows) resolveRow(row, pitchWidthPx, positions, compact);

  if (pitchHeightPx) {
    const rowTops = resolveVerticalPositions(rows, pitchHeightPx, compact);
    rows.forEach((row, i) => {
      const topPx = rowTops[i];
      for (const slot of row) {
        const entry = positions.get(slot);
        if (entry) entry.topPx = topPx;
      }
    });
  }

  return positions;
}
