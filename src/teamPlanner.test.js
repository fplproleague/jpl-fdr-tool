import { describe, it, expect } from 'vitest';
import {
  GW_COUNT, TEAM_PLANNER_FREE_TRANSFER_CAP, TEAM_PLANNER_TRANSFER_PENALTY, TEAM_PLANNER_SLOT_POSITIONS,
  computeTeamPlannerTransferBudget, isRechargeActiveForGw, resolveForGw,
} from './constants';
import {
  TEAM_PLANNER_V1_KEY, TEAM_PLANNER_V2_KEY, migrateTeamPlannerV1, loadTeamPlanner, sanitizeV2,
  buildTransferHistory, computeBankByGw, isValidBench, canSwap, swapInBench, bestLineup, lineupForGw,
  createEmptyPlanner, teamAtGw,
} from './teamPlanner';
import { basisScore, fixtureFactorFor, startFactorFor } from './lineupScore';

// De berekening zoals ze vóór fase C in constants.js stond, letterlijk overgenomen als referentie.
function referenceBudget(transferHistory, boosters) {
  const transfersUsedByGw = {};
  transferHistory.forEach(entry => { transfersUsedByGw[entry.gw] = (transfersUsedByGw[entry.gw] ?? 0) + 1; });
  const budgetByGw = {};
  let freeAvailable = 1;
  for (let gw = 2; gw <= GW_COUNT; gw++) {
    const isRecharge = isRechargeActiveForGw(boosters, gw);
    const used = transfersUsedByGw[gw] ?? 0;
    const pointsCost = isRecharge ? 0 : Math.max(0, used - freeAvailable) * TEAM_PLANNER_TRANSFER_PENALTY;
    budgetByGw[gw] = { freeAvailable, used, pointsCost, isRecharge };
    if (!isRecharge) {
      const consumed = Math.min(used, freeAvailable);
      freeAvailable = Math.min(TEAM_PLANNER_FREE_TRANSFER_CAP, freeAvailable - consumed + 1);
    }
  }
  return budgetByGw;
}

const NAMES = ['Sommer', 'Roef', 'Seys', 'Mechele', 'Ordonez', 'Spileers', 'Sabbe', 'Vanaken', 'Onyedika', 'Tzolis', 'Nilsson', 'Skov', 'Jutglà', 'Vermant', 'Hornby'];
const CLUBS = ['CLU', 'GNT', 'CLU', 'CLU', 'AND', 'AND', 'AND', 'GNT', 'GNT', 'STV', 'STV', 'STV', 'GNK', 'GNK', 'GNK'];
const team = () => NAMES.map((name, i) => ({ name, teamCode: CLUBS[i], position: TEAM_PLANNER_SLOT_POSITIONS[i], price: 6 + (i % 4) }));
const tr = (id, gw, name, price, teamCode = 'USG') => ({ id, gw, player: { name, teamCode, position: 'X', price } });

describe('computeTeamPlannerTransferBudget', () => {
  const history = [
    { gw: 2 }, { gw: 4 }, { gw: 4 }, { gw: 4 }, { gw: 8 }, { gw: 8 }, { gw: 9 }, { gw: 12 }, { gw: 12 }, { gw: 20 },
  ];
  const cases = [
    [[], { benchBoost: null, tripleCaptain: null, recharge: null }],
    [history, { benchBoost: null, tripleCaptain: null, recharge: null }],
    [history, { benchBoost: 3, tripleCaptain: 5, recharge: 12 }],
  ];

  it('zonder startpunt of ijkpunten exact hetzelfde als vóór fase C', () => {
    for (const [h, b] of cases) {
      expect(computeTeamPlannerTransferBudget(h, b)).toEqual(referenceBudget(h, b));
      expect(computeTeamPlannerTransferBudget(h, b, { startGw: 1, checkpoints: {} })).toEqual(referenceBudget(h, b));
    }
  });

  it('later startpunt: de startspeeldag begint met de ingevulde gratis transfers', () => {
    const b = computeTeamPlannerTransferBudget([{ gw: 13 }, { gw: 13 }], { benchBoost: null, tripleCaptain: null, recharge: null }, { startGw: 13, startFreeTransfers: 1 });
    expect(b[12]).toBeUndefined();
    expect(b[13]).toEqual({ freeAvailable: 1, used: 2, pointsCost: 4, isRecharge: false });
    expect(b[14].freeAvailable).toBe(1);
  });

  it('een ijkpunt verandert enkel die speeldag en later', () => {
    const boosters = { benchBoost: null, tripleCaptain: null, recharge: null };
    const before = computeTeamPlannerTransferBudget(history, boosters);
    const after = computeTeamPlannerTransferBudget(history, boosters, { checkpoints: { 12: { freeTransfers: 1 } } });
    for (let gw = 2; gw < 12; gw++) expect(after[gw]).toEqual(before[gw]);
    expect(after[12].freeAvailable).toBe(1);
    expect(after[12].pointsCost).toBe(4);
    expect(after[13].freeAvailable).toBe(1);
  });
});

describe('resolveForGw', () => {
  it('neemt de dichtstbijzijnde vorige keuze over, startGw inbegrepen', () => {
    const byGw = { 12: [1, 2], 15: [3, 4] };
    expect(resolveForGw(byGw, 11, 1)).toBeUndefined();
    expect(resolveForGw(byGw, 12, 1)).toEqual([1, 2]);
    expect(resolveForGw(byGw, 14, 1)).toEqual([1, 2]);
    expect(resolveForGw(byGw, 20, 1)).toEqual([3, 4]);
    expect(resolveForGw({ 12: 5, 14: null }, 16, 1)).toBeNull();
    expect(resolveForGw({ 10: 5 }, 12, 11)).toBeUndefined();
  });
});

describe('migrateTeamPlannerV1', () => {
  it('leeg team -> lege v2 die op de huidige speeldag start', () => {
    const v2 = migrateTeamPlannerV1({ players: Array(15).fill({ name: '' }) }, 12);
    expect(v2.startGw).toBe(12);
    expect(v2.players.every(p => p.name === '')).toBe(true);
    expect(migrateTeamPlannerV1(null, 12).startGw).toBe(12);
  });

  it('team zonder transfers: alles ongewijzigd, startGw 1, budget = 100 − teamwaarde', () => {
    const players = team();
    const v1 = { players, benchByGw: { 3: [1, 6, 11, 14] }, captainByGw: { 3: 7 }, transfersBySlot: {}, boosters: { benchBoost: 4, tripleCaptain: null, recharge: null } };
    const v2 = migrateTeamPlannerV1(v1, 12);
    expect(v2).toMatchObject({ version: 2, startGw: 1, startBank: null, checkpoints: {}, viceByGw: {}, checkConfirmed: false });
    expect(v2.players.map(p => p.name)).toEqual(NAMES);
    expect(v2.benchByGw).toEqual(v1.benchByGw);
    expect(v2.captainByGw).toEqual(v1.captainByGw);
    expect(v2.boosters).toEqual(v1.boosters);
    const value = players.reduce((s, p) => s + p.price, 0);
    expect(computeBankByGw([], { startGw: 1, players: v2.players })[1].start).toBe(Math.round((100 - value) * 10) / 10);
  });

  it('team met transfers sinds GW2 en een Recharge: gratis transfers en puntenkost per GW identiek', () => {
    const transfersBySlot = {
      2: [tr('a', 2, 'Patris', 7), tr('b', 6, 'Mbamba', 6)],
      7: [tr('c', 4, 'Ait El Hadj', 8), tr('d', 4, 'x', 8)].slice(0, 1),
      9: [tr('e', 4, 'Sadiki', 7)],
      12: [tr('f', 5, 'Ivanovic', 9), tr('g', 6, 'Akpom', 8)],
      13: [tr('h', 6, 'Dreyer', 9)],
    };
    const boosters = { benchBoost: null, tripleCaptain: 9, recharge: 6 };
    const v1 = { players: team(), benchByGw: {}, captainByGw: {}, transfersBySlot, boosters };
    const v2 = migrateTeamPlannerV1(JSON.parse(JSON.stringify(v1)), 12);
    expect(v2.transfersBySlot).toEqual(transfersBySlot);
    const oldHistory = buildTransferHistory(v1.players, v1.transfersBySlot);
    const newHistory = buildTransferHistory(v2.players, v2.transfersBySlot);
    expect(newHistory).toEqual(oldHistory);
    expect(computeTeamPlannerTransferBudget(newHistory, v2.boosters, { startGw: v2.startGw, startFreeTransfers: v2.startFreeTransfers, checkpoints: v2.checkpoints }))
      .toEqual(referenceBudget(oldHistory, boosters));
  });

  it('corrupte data valt terug op leeg zonder crash; v1 blijft staan', () => {
    expect(migrateTeamPlannerV1('kapot', 12).startGw).toBe(12);
    expect(migrateTeamPlannerV1({ players: 'x', transfersBySlot: 5 }, 12).players).toHaveLength(15);
    const store = new Map([[TEAM_PLANNER_V1_KEY, '{kapot']]);
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const loaded = loadTeamPlanner(storage, 12);
    expect(loaded.startGw).toBe(12);
    expect(store.get(TEAM_PLANNER_V1_KEY)).toBe('{kapot');
    expect(JSON.parse(store.get(TEAM_PLANNER_V2_KEY)).version).toBe(2);
  });

  it('loadTeamPlanner: zet v1 één keer om, daarna leest hij v2', () => {
    const v1 = JSON.stringify({ players: team(), transfersBySlot: { 3: [tr('x', 5, 'Patris', 7)] } });
    const store = new Map([[TEAM_PLANNER_V1_KEY, v1]]);
    const storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const first = loadTeamPlanner(storage, 12);
    expect(first.startGw).toBe(1);
    store.set(TEAM_PLANNER_V2_KEY, JSON.stringify({ ...first, checkConfirmed: true }));
    expect(loadTeamPlanner(storage, 12).checkConfirmed).toBe(true);
    expect(store.get(TEAM_PLANNER_V1_KEY)).toBe(v1);
  });

  it('sanitizeV2 weigert iets dat geen v2 is', () => {
    expect(sanitizeV2({ version: 1 }, 12)).toBeNull();
    expect(sanitizeV2(createEmptyPlanner(12), 12).startGw).toBe(12);
  });
});

describe('budget per speeldag', () => {
  it('volgt de transfers; een ijkpunt verandert enkel die speeldag en later', () => {
    const players = team();
    players[2].price = 6;
    const transfersBySlot = { 2: [tr('a', 13, 'Patris', 7)] };
    const history = buildTransferHistory(players, transfersBySlot);
    const bank = computeBankByGw(history, { startGw: 12, startBank: 1.5, players });
    expect(bank[12]).toMatchObject({ start: 1.5, end: 1.5 });
    expect(bank[13]).toMatchObject({ start: 1.5, net: 1, end: 0.5 });
    expect(bank[14].start).toBe(0.5);
    const withCp = computeBankByGw(history, { startGw: 12, startBank: 1.5, players, checkpoints: { 14: { bank: 3 } } });
    expect(withCp[13]).toEqual(bank[13]);
    expect(withCp[14]).toMatchObject({ start: 3, fromCheckpoint: true });
  });

  it('teamAtGw toont de transfer vanaf zijn speeldag', () => {
    const players = team();
    const t = { 2: [tr('a', 13, 'Patris', 7)] };
    expect(teamAtGw(players, t, 12)[2].name).toBe('Seys');
    expect(teamAtGw(players, t, 13)[2].name).toBe('Patris');
    expect(teamAtGw(players, t, 13)[2].position).toBe('DEF');
  });
});

describe('opstelling', () => {
  const players = team();
  // slots: 0-1 GK, 2-6 DEF, 7-11 MID, 12-14 FWD
  const bench = [1, 6, 11, 14]; // 4-4-2

  it('geldige bank: 1 keeper en een toegelaten formatie', () => {
    expect(isValidBench(bench, players)).toBe(true);
    expect(isValidBench([1, 6, 11], players)).toBe(false);
    expect(isValidBench([0, 1, 6, 11], players)).toBe(false);
    expect(isValidBench([1, 12, 13, 14], players)).toBe(false); // geen aanvaller op het veld
  });

  it('wissel: keeper met keeper, formatie blijft geldig, bankvolgorde', () => {
    expect(canSwap(bench, 0, 1, players)).toBe(true);
    expect(canSwap(bench, 0, 6, players)).toBe(false);
    expect(canSwap(bench, 2, 6, players)).toBe(true); // DEF <-> DEF
    expect(canSwap(bench, 2, 14, players)).toBe(true); // 3-4-3
    expect(canSwap(bench, 7, 6, players)).toBe(true); // 5-3-2
    expect(canSwap(bench, 12, 11, players)).toBe(true); // 4-5-1
    expect(canSwap([1, 6, 12, 13], 14, 6, players)).toBe(false); // laatste aanvaller eruit
    expect(canSwap(bench, 6, 11, players)).toBe(true); // twee bankspelers
    expect(canSwap(bench, 1, 11, players)).toBe(false); // keeper op de bank verschuift niet
    expect(swapInBench(bench, 2, 6)).toEqual([1, 2, 11, 14]);
    expect(swapInBench(bench, 6, 11)).toEqual([1, 11, 6, 14]);
  });

  it('beste opstelling: hoogste som in een toegelaten formatie', () => {
    const scores = [5, 1, 9, 9, 9, 1, 1, 8, 8, 8, 1, 1, 7, 7, 1];
    const { bench: b } = bestLineup(i => scores[i]);
    expect(b[0]).toBe(1);
    expect(isValidBench(b, players)).toBe(true);
    expect(b.slice(1).every(i => scores[i] === 1)).toBe(true);
  });

  it('lineupForGw: overerving, automatische opstelling en geen stille kapiteinswissel', () => {
    const planner = { ...createEmptyPlanner(12), players, benchByGw: { 12: bench }, captainByGw: { 12: 7 }, viceByGw: { 12: 2 } };
    const auto = [0, 2, 7, 12];
    expect(lineupForGw(planner, 13, auto)).toEqual({ bench, lineupIsAuto: false, captain: 7, vice: 2 });
    const benched = { ...planner, benchByGw: { 12: bench, 14: [1, 2, 11, 14] } };
    expect(lineupForGw(benched, 14, auto).vice).toBeNull();
    expect(lineupForGw({ ...planner, benchByGw: {} }, 12, [1, 6, 11, 14]).lineupIsAuto).toBe(true);
    expect(lineupForGw({ ...planner, benchByGw: { 12: [1, 6] } }, 12, [1, 6, 11, 14]).bench).toEqual([1, 6, 11, 14]);
  });
});

describe('opstellingsscore', () => {
  it('basis: gemiddelde per gespeelde speeldag in de laatste 5, anders seizoen, anders 1', () => {
    const pts = [2, 2, 2, 2, 2, 2, 10, 0, 6, 8, 4];
    const min = [90, 90, 90, 90, 90, 90, 90, 0, 90, 90, 90];
    expect(basisScore({ weeklyPts: pts, weeklyMin: min, lastGw: 11 })).toBeCloseTo((10 + 6 + 8 + 4) / 4);
    expect(basisScore({ weeklyPts: [5], weeklyMin: [0], lastGw: 1, seasonPts: 12, seasonMatches: 3 })).toBe(4);
    expect(basisScore({})).toBe(1);
    expect(basisScore({ weeklyPts: [-2], weeklyMin: [30], lastGw: 1 })).toBe(0.1);
  });

  it('startkans: geschorst 0, Verwachte XI enkel voor de gepubliceerde speeldag', () => {
    expect(startFactorFor({ gw: 12, suspension: { gw: 12 } })).toBe(0);
    expect(startFactorFor({ gw: 13, suspension: { gw: 12 } })).toBe(1);
    expect(startFactorFor({ gw: 12, lineupGw: 12, lineupSafety: 'orange' })).toBe(0.7);
    expect(startFactorFor({ gw: 12, lineupGw: 12, lineupSafety: 'red' })).toBe(0.3);
    expect(startFactorFor({ gw: 12, lineupGw: 12, lineupSafety: null })).toBe(0.9);
    expect(startFactorFor({ gw: 13, lineupGw: 12, lineupSafety: 'red' })).toBe(1);
  });

  it('tegenstander: factor volgens de FDR, geen wedstrijd = 0', () => {
    const ratings = new Proxy({}, { get: () => 1 });
    const f = fixtureFactorFor('CLU', 12, ratings, {});
    expect([0, 1.2, 2.4]).toContain(Math.round(f * 10) / 10);
    expect(fixtureFactorFor('', 12, ratings, {})).toBe(0);
  });
});
