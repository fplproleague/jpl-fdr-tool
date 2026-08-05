// Formatie-data + zuivere herberekeningslogica voor de Predicted XI Builder. Geen React-afhankelijkheid
// (zelfde conventie als src/constants.js) — enkel data en pure functies.
//
// Elke formatie is een geordende lijst "lijnen" i.p.v. plat GK/DEF/MID/FWD, zodat bv. 4-2-3-1 een
// echte DM/AM-opsplitsing kan tonen (5 rijen i.p.v. 4). Elke lijn heeft:
//   - broadPosition: GK/DEF/MID/FWD — het ENIGE dat telt voor matching tegen de spelersdatabank
//     (parsePlayerDatabaseCsv in ../constants.js kent enkel deze 4 posities).
//   - roleLabel: cosmetische tekst op de kaart (bv. "DM"), nooit gebruikt om te filteren/matchen.
//   - yPercent: verticale positie binnen het veld, GK onderaan (hoog percentage) en FWD bovenaan
//     (laag percentage) — de conventionele "matchday-graphic"-oriëntatie voor een deelbaar beeld,
//     bewust anders dan TeamPlannerTab.jsx's eigen GK-boven/FWD-onder-conventie (die dient een ander,
//     intern planningsdoel).
export const FORMATIONS = {
  '4-3-3': {
    label: '4-3-3',
    lines: [
      { id: 'FWD', broadPosition: 'FWD', roleLabel: 'ST', count: 3, yPercent: 12 },
      { id: 'MID', broadPosition: 'MID', roleLabel: 'MF', count: 3, yPercent: 45 },
      { id: 'DEF', broadPosition: 'DEF', roleLabel: 'DF', count: 4, yPercent: 75 },
      { id: 'GK', broadPosition: 'GK', roleLabel: 'GK', count: 1, yPercent: 92 },
    ],
  },
  '4-2-3-1': {
    label: '4-2-3-1',
    lines: [
      { id: 'FWD', broadPosition: 'FWD', roleLabel: 'ST', count: 1, yPercent: 10 },
      { id: 'AM', broadPosition: 'MID', roleLabel: 'AM', count: 3, yPercent: 33 },
      { id: 'DM', broadPosition: 'MID', roleLabel: 'DM', count: 2, yPercent: 55 },
      { id: 'DEF', broadPosition: 'DEF', roleLabel: 'DF', count: 4, yPercent: 78 },
      { id: 'GK', broadPosition: 'GK', roleLabel: 'GK', count: 1, yPercent: 93 },
    ],
  },
  '4-4-2': {
    label: '4-4-2',
    lines: [
      { id: 'FWD', broadPosition: 'FWD', roleLabel: 'ST', count: 2, yPercent: 12 },
      { id: 'MID', broadPosition: 'MID', roleLabel: 'MF', count: 4, yPercent: 48 },
      { id: 'DEF', broadPosition: 'DEF', roleLabel: 'DF', count: 4, yPercent: 76 },
      { id: 'GK', broadPosition: 'GK', roleLabel: 'GK', count: 1, yPercent: 92 },
    ],
  },
  '3-5-2': {
    label: '3-5-2',
    lines: [
      { id: 'FWD', broadPosition: 'FWD', roleLabel: 'ST', count: 2, yPercent: 12 },
      { id: 'MID', broadPosition: 'MID', roleLabel: 'MF', count: 5, yPercent: 48 },
      { id: 'DEF', broadPosition: 'DEF', roleLabel: 'DF', count: 3, yPercent: 76 },
      { id: 'GK', broadPosition: 'GK', roleLabel: 'GK', count: 1, yPercent: 92 },
    ],
  },
  '3-4-3': {
    label: '3-4-3',
    lines: [
      { id: 'FWD', broadPosition: 'FWD', roleLabel: 'ST', count: 3, yPercent: 12 },
      { id: 'MID', broadPosition: 'MID', roleLabel: 'MF', count: 4, yPercent: 48 },
      { id: 'DEF', broadPosition: 'DEF', roleLabel: 'DF', count: 3, yPercent: 76 },
      { id: 'GK', broadPosition: 'GK', roleLabel: 'GK', count: 1, yPercent: 92 },
    ],
  },
  '5-3-2': {
    label: '5-3-2',
    lines: [
      { id: 'FWD', broadPosition: 'FWD', roleLabel: 'ST', count: 2, yPercent: 12 },
      { id: 'MID', broadPosition: 'MID', roleLabel: 'MF', count: 3, yPercent: 48 },
      { id: 'DEF', broadPosition: 'DEF', roleLabel: 'DF', count: 5, yPercent: 76 },
      { id: 'GK', broadPosition: 'GK', roleLabel: 'GK', count: 1, yPercent: 92 },
    ],
  },
};

export const DEFAULT_FORMATION_KEY = '4-3-3';

// Slot dat nog geen speler bevat — playerName === '' is de "leeg"-conventie (zelfde patroon als
// createEmptyTeamPlannerPlayers() in FDRTool.jsx), nooit null: elke array-index is altijd een object.
function emptySlotFields() {
  return { playerName: '', playerTeamCode: '', playerPosition: '', safety: 'green' };
}

// Zet een formatie om in een platte, renderbare lijst — xPercent wordt hier afgeleid (niet opgeslagen
// in FORMATIONS), zodat elke lijn automatisch gelijkmatig verdeeld wordt ongeacht het aantal spelers.
const LEFT_PAD = 12; // percent — houdt kaarten weg van de veldranden/afgeronde hoeken
export function flattenFormationSlots(formationKey) {
  const formation = FORMATIONS[formationKey] ?? FORMATIONS[DEFAULT_FORMATION_KEY];
  return formation.lines.flatMap(line =>
    Array.from({ length: line.count }, (_, i) => ({
      line: line.id,
      role: line.roleLabel,
      broadPosition: line.broadPosition,
      xPercent: LEFT_PAD + ((i + 0.5) / line.count) * (100 - LEFT_PAD * 2),
      yPercent: line.yPercent,
    }))
  );
}

export function generateEmptySlotsForFormation(formationKey) {
  return flattenFormationSlots(formationKey).map(slot => ({ ...slot, ...emptySlotFields() }));
}

// Herbouwt de line-up voor een nieuwe formatie: vult per brede positie (GK/DEF/MID/FWD) de nieuwe
// lijnen greedy met reeds geplaatste spelers van diezelfde brede positie (in hun bestaande volgorde).
// Overschot verdwijnt NOOIT stilzwijgend — spelers die niet meer passen krijgen line:'_unassigned' en
// blijven in de teruggegeven array staan (getoond in een bakje onder het veld), zodat een latere
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
      slot.safety = player.safety;
    }
  });

  const unassigned = currentSlots
    .filter(slot => slot.playerName && !consumed.has(slot))
    .map(slot => ({
      line: '_unassigned', role: slot.playerPosition, broadPosition: slot.broadPosition,
      xPercent: 0, yPercent: 0,
      playerName: slot.playerName, playerTeamCode: slot.playerTeamCode,
      playerPosition: slot.playerPosition, safety: slot.safety,
    }));

  return [...newSlots, ...unassigned];
}
