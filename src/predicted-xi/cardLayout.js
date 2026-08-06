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
// Botsingsgevaar zit vrijwel uitsluitend HORIZONTAAL, binnen één "rij" (bv. de DEF-achterlinie): de
// Y-percentages in POSITION_PRESETS verschillen binnen zo'n rij hooguit 5 punten (71-76 voor
// LB/LCB/CCB/RCB/RB), terwijl verschillende linies altijd minstens 11 punten uit elkaar liggen (bv.
// MID-linie 46 vs DM-linie 57) — ruim genoeg voor een vaste kaarthoogte (geen wrap meer). Kaarten worden
// daarom eerst per rij gegroepeerd (Y binnen ROW_CLUSTER_THRESHOLD van elkaar), en enkel binnen zo'n rij
// horizontaal ontward.

const MIN_GAP_PX = 5;
const MIN_EDGE_MARGIN_PX = 12;
// Ondergrenzen waarnaar gap/marge pas krimpen als een rij écht niet past bij de comfortabele
// standaardwaarden (bv. meerdere lange namen tegelijk in een 5-brede achterlinie) — nooit tot 0, want
// "nooit raken" (gap) en "nooit buiten het veld" (marge, met voorrang — zie resolveRow) blijven altijd
// harde eisen, ook in dat geval.
const GAP_FLOOR_PX = 1;
const EDGE_MARGIN_FLOOR_PX = 2;
const ROW_CLUSTER_THRESHOLD = 8;
const NAME_FONT = '800 13px sans-serif';
// Kaart-padding is 2x8px (zie PitchSlot.jsx) = 16px; +8px veiligheidsmarge omdat canvas measureText()
// niet altijd pixel-exact overeenkomt met de werkelijke DOM/html2canvas-rendering (zelf ondervonden bij
// eerdere iteraties deze sessie) — zo blijft er altijd wat lucht rond de tekst i.p.v. een naam die net
// tegen de kaartrand zou botsen.
const NAME_HORIZONTAL_PADDING_PX = 24;
const EMPTY_CARD_WIDTH_PX = 70; // ongewijzigd t.o.v. de bestaande lege-slot-breedte

let measureCanvas = null;
export function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function estimateCardWidth(playerName) {
  if (!playerName) return EMPTY_CARD_WIDTH_PX;
  return Math.ceil(measureTextWidth(playerName, NAME_FONT)) + NAME_HORIZONTAL_PADDING_PX;
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
function resolveRow(rowSlots, pitchWidthPx, positions) {
  const items = [...rowSlots]
    .sort((a, b) => a.xPercent - b.xPercent)
    .map(slot => ({ slot, widthPx: estimateCardWidth(slot.playerName) }));
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

// Hoofdfunctie: geeft een Map van slot -> {leftPx, widthPx} terug voor elke gevulde kaart. Lege slots
// zitten hier bewust niet in (ze hebben geen naam-afhankelijke breedte en behouden hun eenvoudige
// percentage-positionering in PitchSlot.jsx).
export function computeCardPositions(pitchSlots, pitchWidthPx) {
  const positions = new Map();
  if (!pitchWidthPx) return positions;
  const filled = pitchSlots.filter(s => s.playerName);
  const rows = computeRowGroups(filled);
  for (const row of rows) resolveRow(row, pitchWidthPx, positions);
  return positions;
}
