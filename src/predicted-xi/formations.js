// Formatie-data + zuivere herberekeningslogica voor de Predicted XI Builder. Geen React-afhankelijkheid
// (zelfde conventie als src/constants.js) — enkel data en pure functies.
//
// POSITION_PRESETS is de vaste bibliotheek van alle klikbare tactische posities (GK/LCB/RCB/CCB/LWB/
// RW/RM/...) met een vaste veldcoördinaat. Vrij (pixel-precies) verslepen is bewust vervangen door een
// klik-gebaseerde positiekiezer (zie PositionPicker.jsx) — kies een positie uit deze lijst; is die al
// bezet, dan wisselen de twee spelers van plek. Elke formatie is gewoon een geordende lijst van
// preset-id's uit deze bibliotheek (11 stuks, telkens exact overeenkomend met de formatienaam).
export const POSITION_PRESETS = {
  GK: { label: 'GK', broadPosition: 'GK', section: 'GK', xPercent: 50, yPercent: 92 },

  LB: { label: 'LB', broadPosition: 'DEF', section: 'DEF', xPercent: 16, yPercent: 76 },
  LCB: { label: 'LCB', broadPosition: 'DEF', section: 'DEF', xPercent: 30, yPercent: 79 },
  CCB: { label: 'CCB', broadPosition: 'DEF', section: 'DEF', xPercent: 50, yPercent: 81 },
  RCB: { label: 'RCB', broadPosition: 'DEF', section: 'DEF', xPercent: 70, yPercent: 79 },
  RB: { label: 'RB', broadPosition: 'DEF', section: 'DEF', xPercent: 84, yPercent: 76 },
  LWB: { label: 'LWB', broadPosition: 'DEF', section: 'DEF', xPercent: 16, yPercent: 64 },
  RWB: { label: 'RWB', broadPosition: 'DEF', section: 'DEF', xPercent: 84, yPercent: 64 },

  LDM: { label: 'LDM', broadPosition: 'MID', section: 'MID', xPercent: 28, yPercent: 60 },
  CDM: { label: 'CDM', broadPosition: 'MID', section: 'MID', xPercent: 50, yPercent: 60 },
  RDM: { label: 'RDM', broadPosition: 'MID', section: 'MID', xPercent: 72, yPercent: 60 },
  LM: { label: 'LM', broadPosition: 'MID', section: 'MID', xPercent: 16, yPercent: 47 },
  LCM: { label: 'LCM', broadPosition: 'MID', section: 'MID', xPercent: 35, yPercent: 47 },
  CM: { label: 'CM', broadPosition: 'MID', section: 'MID', xPercent: 50, yPercent: 47 },
  RCM: { label: 'RCM', broadPosition: 'MID', section: 'MID', xPercent: 65, yPercent: 47 },
  RM: { label: 'RM', broadPosition: 'MID', section: 'MID', xPercent: 84, yPercent: 47 },
  LAM: { label: 'LAM', broadPosition: 'MID', section: 'MID', xPercent: 28, yPercent: 32 },
  CAM: { label: 'CAM', broadPosition: 'MID', section: 'MID', xPercent: 50, yPercent: 28 },
  RAM: { label: 'RAM', broadPosition: 'MID', section: 'MID', xPercent: 72, yPercent: 32 },

  LW: { label: 'LW', broadPosition: 'FWD', section: 'FWD', xPercent: 16, yPercent: 18 },
  LST: { label: 'LST', broadPosition: 'FWD', section: 'FWD', xPercent: 28, yPercent: 11 },
  ST: { label: 'ST', broadPosition: 'FWD', section: 'FWD', xPercent: 50, yPercent: 5 },
  RST: { label: 'RST', broadPosition: 'FWD', section: 'FWD', xPercent: 72, yPercent: 11 },
  RW: { label: 'RW', broadPosition: 'FWD', section: 'FWD', xPercent: 84, yPercent: 18 },
  CF: { label: 'CF', broadPosition: 'FWD', section: 'FWD', xPercent: 50, yPercent: 20 },
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
  return { playerName: '', playerTeamCode: '', playerPosition: '', playerPrice: null, safety: 'green' };
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
