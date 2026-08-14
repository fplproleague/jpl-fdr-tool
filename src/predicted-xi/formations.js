// Formatie-data + zuivere herberekeningslogica voor de Predicted XI Builder. Geen React-afhankelijkheid
// (zelfde conventie als src/constants.js) — enkel data en pure functies.
//
// POSITION_PRESETS is de vaste bibliotheek van alle klikbare tactische posities (GK/LCB/RCB/CCB/LWB/
// RW/RM/...) met een vaste veldcoördinaat. Vrij (pixel-precies) verslepen is bewust vervangen door een
// klik-gebaseerde positiekiezer (zie PositionPicker.jsx) — kies een positie uit deze lijst; is die al
// bezet, dan wisselen de twee spelers van plek. Elke formatie is gewoon een geordende lijst van
// preset-id's uit deze bibliotheek (11 stuks, telkens exact overeenkomend met de formatienaam).
// yPercent-waarden zijn een lineaire herschaling van het oude bereik [5,92] naar het compactere [10,85]
// (behoudt dezelfde relatieve volgorde/verhoudingen van de lijnen — GK onderaan, FWD bovenaan — maar
// met minder ruimte tussen de linies). Zie PITCH_ASPECT_RATIO in theme.js voor de bijhorende
// compactere veld-container.
//
// LCB/RCB (36/64) en LCM/RCM (33/67) zijn xPercent-waarden die in meerdere formaties met tegengestelde
// buur-afstandseisen hergebruikt worden (bv. LCM staat naast LM=16 in 4-4-2/3-4-3, maar naast CM=50 in
// 4-3-3/3-5-2/5-3-2; zelfde spanning voor LCB tussen LB=16 en CCB=50 in 5-3-2). Deze xPercent-waarden
// zijn enkel nog een IDEALE startpositie: de kaartbreedte groeit mee met de spelersnaam (zie
// PitchSlot.jsx — namen staan altijd volledig op één regel), dus deze coördinaten garanderen op zichzelf
// geen overlapvrije layout meer. Die garantie komt nu van een aparte, op de werkelijke gerenderde
// naambreedte gebaseerde herberekening in cardLayout.js (aangeroepen vanuit PitchField.jsx) — die schuift
// kaarten die te dicht bij een buur of de veldrand zouden komen net genoeg opzij.
//
// LCB/RCB was 33/67 (LB-LCB/RCB-RB-gap 17, LCB-RCB-gap 34 — exact het dubbele): in een zuivere 4-mans
// achterlijn (4-3-3/4-2-3-1/4-4-2, LB+LCB+RCB+RB, geen CCB) oogde dat te ongelijk verdeeld, met de twee
// centrale verdedigers ver uit elkaar t.o.v. de backs. Verschoven naar 36/64 (gaps 20/28/20) — merkbaar
// evenwichtiger voor de 4-mans lijn, maar bewust niet verder verkleind: LCB/RCB zit ook in de 5-mans
// achterlijn (5-3-2, LB+LCB+CCB+RCB+RB), waar de vorige 33/67 exact symmetrisch was met LB=16/CCB=50/RB=84
// (elke 17 punten). Bij 36/64 wordt die 5-mans-lijn iets minder gelijkmatig (gaps 20/14/14/20 i.p.v.
// 17/17/17/17), maar blijft ruim behapbaar — een bewuste, kleine afweging tussen de twee formaties die
// deze preset delen.
export const POSITION_PRESETS = {
  GK: { label: 'GK', broadPosition: 'GK', section: 'GK', xPercent: 50, yPercent: 85 },

  LB: { label: 'LB', broadPosition: 'DEF', section: 'DEF', xPercent: 16, yPercent: 71 },
  LCB: { label: 'LCB', broadPosition: 'DEF', section: 'DEF', xPercent: 36, yPercent: 74 },
  CCB: { label: 'CCB', broadPosition: 'DEF', section: 'DEF', xPercent: 50, yPercent: 76 },
  RCB: { label: 'RCB', broadPosition: 'DEF', section: 'DEF', xPercent: 64, yPercent: 74 },
  RB: { label: 'RB', broadPosition: 'DEF', section: 'DEF', xPercent: 84, yPercent: 71 },
  LWB: { label: 'LWB', broadPosition: 'DEF', section: 'DEF', xPercent: 16, yPercent: 61 },
  RWB: { label: 'RWB', broadPosition: 'DEF', section: 'DEF', xPercent: 84, yPercent: 61 },

  LDM: { label: 'LDM', broadPosition: 'MID', section: 'MID', xPercent: 28, yPercent: 57 },
  CDM: { label: 'CDM', broadPosition: 'MID', section: 'MID', xPercent: 50, yPercent: 57 },
  RDM: { label: 'RDM', broadPosition: 'MID', section: 'MID', xPercent: 72, yPercent: 57 },
  LM: { label: 'LM', broadPosition: 'MID', section: 'MID', xPercent: 16, yPercent: 46 },
  LCM: { label: 'LCM', broadPosition: 'MID', section: 'MID', xPercent: 33, yPercent: 46 },
  CM: { label: 'CM', broadPosition: 'MID', section: 'MID', xPercent: 50, yPercent: 46 },
  RCM: { label: 'RCM', broadPosition: 'MID', section: 'MID', xPercent: 67, yPercent: 46 },
  RM: { label: 'RM', broadPosition: 'MID', section: 'MID', xPercent: 84, yPercent: 46 },
  LAM: { label: 'LAM', broadPosition: 'MID', section: 'MID', xPercent: 28, yPercent: 33 },
  CAM: { label: 'CAM', broadPosition: 'MID', section: 'MID', xPercent: 50, yPercent: 30 },
  RAM: { label: 'RAM', broadPosition: 'MID', section: 'MID', xPercent: 72, yPercent: 33 },

  LW: { label: 'LW', broadPosition: 'FWD', section: 'FWD', xPercent: 16, yPercent: 21 },
  LST: { label: 'LST', broadPosition: 'FWD', section: 'FWD', xPercent: 28, yPercent: 15 },
  ST: { label: 'ST', broadPosition: 'FWD', section: 'FWD', xPercent: 50, yPercent: 10 },
  RST: { label: 'RST', broadPosition: 'FWD', section: 'FWD', xPercent: 72, yPercent: 15 },
  RW: { label: 'RW', broadPosition: 'FWD', section: 'FWD', xPercent: 84, yPercent: 21 },
  CF: { label: 'CF', broadPosition: 'FWD', section: 'FWD', xPercent: 50, yPercent: 23 },
};

export const FORMATIONS = {
  '4-3-3': { label: '4-3-3', positionIds: ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LW', 'ST', 'RW'] },
  '4-2-3-1': { label: '4-2-3-1', positionIds: ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LDM', 'RDM', 'LAM', 'CAM', 'RAM', 'ST'] },
  '4-4-2': { label: '4-4-2', positionIds: ['GK', 'LB', 'LCB', 'RCB', 'RB', 'LM', 'LCM', 'RCM', 'RM', 'LST', 'RST'] },
  '3-5-2': { label: '3-5-2', positionIds: ['GK', 'LCB', 'CCB', 'RCB', 'LWB', 'LCM', 'CM', 'RCM', 'RWB', 'LST', 'RST'] },
  '3-4-3': { label: '3-4-3', positionIds: ['GK', 'LCB', 'CCB', 'RCB', 'LM', 'LCM', 'RCM', 'RM', 'LW', 'ST', 'RW'] },
  '5-3-2': { label: '5-3-2', positionIds: ['GK', 'LB', 'LCB', 'CCB', 'RCB', 'RB', 'LCM', 'CM', 'RCM', 'LST', 'RST'] },
};

export const DEFAULT_FORMATION_KEY = '4-3-3';

// Slot dat nog geen speler bevat — playerName === '' is de "leeg"-conventie (zelfde patroon als
// createEmptyTeamPlannerPlayers() in FDRTool.jsx), nooit null: elke array-index is altijd een object.
function emptySlotFields() {
  return { playerName: '', playerTeamCode: '', playerPosition: '', playerPrice: null, safety: 'darkgreen' };
}

// Zet een formatie om in een platte, renderbare lijst — elke positieId levert zijn vaste coördinaat uit
// POSITION_PRESETS, dus elke formatie is gewoon een keuze van 11 vaste plekken uit dezelfde bibliotheek.
export function flattenFormationSlots(formationKey) {
  const formation = FORMATIONS[formationKey] ?? FORMATIONS[DEFAULT_FORMATION_KEY];
  return formation.positionIds.map(id => {
    const preset = POSITION_PRESETS[id];
    return {
      positionId: id,
      role: preset.label,
      broadPosition: preset.broadPosition,
      xPercent: preset.xPercent,
      yPercent: preset.yPercent,
    };
  });
}

export function generateEmptySlotsForFormation(formationKey) {
  return flattenFormationSlots(formationKey).map(slot => ({ ...slot, ...emptySlotFields() }));
}

// Herbouwt de line-up voor een nieuwe formatie: vult per brede positie (GK/DEF/MID/FWD) de nieuwe
// posities greedy met reeds geplaatste spelers van diezelfde brede positie (in hun bestaande volgorde).
// Overschot verdwijnt NOOIT stilzwijgend — spelers die niet meer passen krijgen positionId:'_unassigned'
// en blijven in de teruggegeven array staan (getoond in een bakje onder het veld), zodat een latere
// formatiewissel ze weer als geldige kandidaat kan terugplaatsen.
export function remapLineupToFormation(currentSlots, newFormationKey) {
  const newSlots = generateEmptySlotsForFormation(newFormationKey);

  const placedByPosition = { GK: [], DEF: [], MID: [], FWD: [] };
  currentSlots.forEach(slot => {
    if (slot.playerName) placedByPosition[slot.broadPosition]?.push(slot);
  });

  const consumed = new Set();
  newSlots.forEach(slot => {
    const pool = placedByPosition[slot.broadPosition];
    const player = pool?.find(p => !consumed.has(p));
    if (player) {
      consumed.add(player);
      slot.playerName = player.playerName;
      slot.playerTeamCode = player.playerTeamCode;
      slot.playerPosition = player.playerPosition;
      slot.playerPrice = player.playerPrice;
      slot.safety = player.safety;
    }
  });

  const unassigned = currentSlots
    .filter(slot => slot.playerName && !consumed.has(slot))
    .map(slot => ({
      positionId: '_unassigned', role: slot.playerPosition, broadPosition: slot.broadPosition,
      xPercent: 0, yPercent: 0,
      playerName: slot.playerName, playerTeamCode: slot.playerTeamCode,
      playerPosition: slot.playerPosition, playerPrice: slot.playerPrice, safety: slot.safety,
    }));

  return [...newSlots, ...unassigned];
}
