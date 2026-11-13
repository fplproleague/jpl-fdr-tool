// Het rekenmodel van de Team Planner (FUNCTIONALITEIT_SPEC fase C), los van React zodat het getest kan
// worden. FDRTool.jsx houdt de state bij (useTeamPlanner), TeamPlannerTab.jsx toont ze.
//
// Opslag (C9): één blok onder fpl_proleague_teamplanner_v2:
//   { version: 2, startGw, startBank, startFreeTransfers, checkpoints, players[15], transfersBySlot,
//     benchByGw, captainByGw, viceByGw, boosters, checkConfirmed }
// - startGw: de speeldag van het ingevulde startteam. Wie zijn team al vóór deze versie bijhield,
//   krijgt startGw 1: alles rekent dan verder zoals vroeger.
// - startBank: het budget bij de start, of null = "100 − waarde van het startteam" (het spel kent geen
//   prijswijzigingen, zie DESIGN_SPEC §6.3). Zo volgt het budget mee als je het startteam rechtzet.
// - startFreeTransfers: gratis transfers in de startspeeldag. Bij startGw 1 telt de oude regel (GW1 =
//   teamopbouw, GW2 begint met 1) en wordt dit veld niet gebruikt.
// - checkpoints: { [gw]: { bank, freeTransfers } } = de echte waarden aan het begin van die speeldag
//   (vóór de geplande transfers van die speeldag), door de bezoeker ingevuld ("Klopt niet? Pas aan").
// - benchByGw / captainByGw / viceByGw: enkel de speeldagen waar de bezoeker iets wijzigde. Een
//   speeldag zonder eigen keuze neemt die van de vorige over (resolveForGw in constants.js). null bij
//   kapitein of vice = bewust leeg vanaf die speeldag.
// - checkConfirmed: de eenmalige controle "Klopt dit voor GW12?" is beantwoord.
//
// De oude sleutel fpl_proleague_teamplanner_v1 blijft onaangeroerd staan als back-up.
import {
  GW_COUNT, TEAM_PLANNER_BUDGET, TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_SLOT_POSITIONS,
  TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_FREE_TRANSFER_CAP, VALID_FORMATIONS, resolveForGw,
} from './constants';

export const TEAM_PLANNER_V1_KEY = 'fpl_proleague_teamplanner_v1';
export const TEAM_PLANNER_V2_KEY = 'fpl_proleague_teamplanner_v2';

export const EMPTY_BOOSTERS = Object.freeze({ benchBoost: null, tripleCaptain: null, recharge: null });

export function createUniqueId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Vast array van 15 slots (2 GK, 5 DEF, 5 MID, 3 FWD). Elk slot heeft altijd een object, ook leeg.
export function createEmptyPlayers() {
  return Array.from({ length: TEAM_PLANNER_SQUAD_SIZE }, (_, index) => ({
    name: '', teamCode: '', position: TEAM_PLANNER_SLOT_POSITIONS[index], price: '',
  }));
}

export function createEmptyPlanner(currentGw) {
  return {
    version: 2,
    startGw: clampGw(currentGw),
    startBank: null,
    startFreeTransfers: 1,
    checkpoints: {},
    players: createEmptyPlayers(),
    transfersBySlot: {},
    benchByGw: {},
    captainByGw: {},
    viceByGw: {},
    boosters: { ...EMPTY_BOOSTERS },
    checkConfirmed: false,
  };
}

function clampGw(gw) {
  const n = Math.round(Number(gw));
  return Number.isFinite(n) ? Math.min(GW_COUNT, Math.max(1, n)) : 1;
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const priceOf = (p) => {
  const n = parseFloat(p?.price);
  return Number.isFinite(n) ? n : 0;
};

export const isEmptySlot = (player) => !player?.name && !player?.teamCode;

export function isPlannerEmpty(players) {
  return !Array.isArray(players) || players.every(p => !p?.name);
}

export function isPlannerComplete(players) {
  return Array.isArray(players) && players.length === TEAM_PLANNER_SQUAD_SIZE && players.every(p => p?.name);
}

export function teamValue(players) {
  return (players ?? []).reduce((sum, p) => sum + priceOf(p), 0);
}

// --- Inlezen van de oude opslag (v1), exact zoals FDRTool.jsx dat vroeger deed ---------------------

function sanitizeTransfer(raw) {
  if (!isObject(raw)) return null;
  const gw = Number(raw.gw);
  if (!Number.isFinite(gw) || gw < 1) return null;
  const player = raw.player;
  if (!isObject(player) || !player.name) return null;
  return {
    id: typeof raw.id === 'string' ? raw.id : createUniqueId(),
    gw,
    player: {
      name: player.name ?? '', teamCode: player.teamCode ?? '',
      position: player.position ?? '', price: player.price ?? null,
    },
  };
}

function sanitizeTransfersBySlot(raw) {
  const result = {};
  if (!isObject(raw)) return result;
  Object.entries(raw).forEach(([slotIndex, transfers]) => {
    const slot = Number(slotIndex);
    if (!Number.isInteger(slot) || slot < 0 || slot >= TEAM_PLANNER_SQUAD_SIZE || !Array.isArray(transfers)) return;
    const sanitized = transfers.map(sanitizeTransfer).filter(Boolean).sort((a, b) => a.gw - b.gw);
    if (sanitized.length > 0) result[slotIndex] = sanitized;
  });
  return result;
}

function sanitizeBoosterGw(raw) {
  const gw = Number(raw);
  return Number.isInteger(gw) && gw >= 1 && gw <= GW_COUNT ? gw : null;
}

function sanitizeBoosters(raw) {
  const b = isObject(raw) ? raw : {};
  return {
    benchBoost: sanitizeBoosterGw(b.benchBoost),
    tripleCaptain: sanitizeBoosterGw(b.tripleCaptain),
    recharge: sanitizeBoosterGw(b.recharge),
  };
}

function sanitizePlayers(raw) {
  if (!Array.isArray(raw) || raw.length !== TEAM_PLANNER_SQUAD_SIZE) return null;
  return raw.map((p, index) => ({
    name: typeof p?.name === 'string' ? p.name : '',
    teamCode: typeof p?.teamCode === 'string' ? p.teamCode : '',
    position: TEAM_PLANNER_SLOT_POSITIONS[index],
    price: p?.price ?? '',
  }));
}

// Per-GW-kaarten (bank, kapitein, vice). Gewoon overnemen wat er staat (C9: niets herschrijven); enkel
// sleutels die geen speeldag zijn, vallen weg.
function sanitizeByGw(raw, isValue) {
  const result = {};
  if (!isObject(raw)) return result;
  Object.entries(raw).forEach(([gw, value]) => {
    const n = Number(gw);
    if (Number.isInteger(n) && n >= 1 && n <= GW_COUNT && isValue(value)) result[gw] = value;
  });
  return result;
}
const isSlot = (v) => Number.isInteger(v) && v >= 0 && v < TEAM_PLANNER_SQUAD_SIZE;
const isBenchArray = (v) => Array.isArray(v) && v.every(isSlot);
const isSlotOrNull = (v) => v === null || isSlot(v);

// Leest de v1-opslag in zoals de site dat vóór fase C deed. Heel oude opslag was gewoon het spelers-
// array zelf. null = onleesbaar.
export function sanitizeV1(parsed) {
  if (Array.isArray(parsed)) {
    const players = sanitizePlayers(parsed);
    return players ? { players, benchByGw: {}, captainByGw: {}, transfersBySlot: {}, boosters: { ...EMPTY_BOOSTERS } } : null;
  }
  if (!isObject(parsed)) return null;
  const players = sanitizePlayers(parsed.players) ?? createEmptyPlayers();
  return {
    players,
    benchByGw: sanitizeByGw(parsed.benchByGw, isBenchArray),
    captainByGw: sanitizeByGw(parsed.captainByGw, isSlot),
    transfersBySlot: sanitizeTransfersBySlot(parsed.transfersBySlot),
    boosters: sanitizeBoosters(parsed.boosters),
  };
}

// C9: eenmalige omzetting van v1 naar v2. Team, transfers, bank, kapiteins en boosters gaan
// ongewijzigd mee. startGw 1, budget = 100 − waarde van het basisteam (startBank null), de oude regel
// voor gratis transfers, en de eenmalige controle staat klaar. Een lege of onleesbare v1 wordt een
// lege v2 die op de huidige speeldag start.
export function migrateTeamPlannerV1(v1, currentGw) {
  const old = sanitizeV1(v1);
  if (!old || isPlannerEmpty(old.players)) return createEmptyPlanner(currentGw);
  return {
    version: 2,
    startGw: 1,
    startBank: null,
    startFreeTransfers: 1,
    checkpoints: {},
    players: old.players,
    transfersBySlot: old.transfersBySlot,
    benchByGw: old.benchByGw,
    captainByGw: old.captainByGw,
    viceByGw: {},
    boosters: old.boosters,
    checkConfirmed: false,
  };
}

function sanitizeCheckpoints(raw) {
  const result = {};
  if (!isObject(raw)) return result;
  Object.entries(raw).forEach(([gw, cp]) => {
    const n = Number(gw);
    if (!Number.isInteger(n) || n < 1 || n > GW_COUNT || !isObject(cp)) return;
    const bank = Number(cp.bank);
    const free = Number(cp.freeTransfers);
    const entry = {};
    if (cp.bank !== null && cp.bank !== '' && Number.isFinite(bank)) entry.bank = Math.round(bank * 10) / 10;
    if (cp.freeTransfers !== null && cp.freeTransfers !== '' && Number.isInteger(free)) {
      entry.freeTransfers = Math.min(TEAM_PLANNER_FREE_TRANSFER_CAP, Math.max(0, free));
    }
    if (Object.keys(entry).length > 0) result[gw] = entry;
  });
  return result;
}

export function sanitizeV2(raw, currentGw) {
  if (!isObject(raw) || raw.version !== 2) return null;
  const players = sanitizePlayers(raw.players);
  if (!players) return null;
  const startBank = raw.startBank === null || raw.startBank === undefined || !Number.isFinite(Number(raw.startBank))
    ? null : Math.round(Number(raw.startBank) * 10) / 10;
  const startFree = Number(raw.startFreeTransfers);
  return {
    version: 2,
    startGw: Number.isFinite(Number(raw.startGw)) ? clampGw(raw.startGw) : clampGw(currentGw),
    startBank,
    startFreeTransfers: Number.isInteger(startFree) ? Math.min(TEAM_PLANNER_FREE_TRANSFER_CAP, Math.max(0, startFree)) : 1,
    checkpoints: sanitizeCheckpoints(raw.checkpoints),
    players,
    transfersBySlot: sanitizeTransfersBySlot(raw.transfersBySlot),
    benchByGw: sanitizeByGw(raw.benchByGw, isBenchArray),
    captainByGw: sanitizeByGw(raw.captainByGw, isSlotOrNull),
    viceByGw: sanitizeByGw(raw.viceByGw, isSlotOrNull),
    boosters: sanitizeBoosters(raw.boosters),
    checkConfirmed: raw.checkConfirmed === true,
  };
}

// Leest v2; bestaat die nog niet, dan eenmalig v1 omzetten en meteen als v2 bewaren. v1 blijft staan.
export function loadTeamPlanner(storage, currentGw) {
  try {
    const rawV2 = storage?.getItem(TEAM_PLANNER_V2_KEY);
    if (rawV2) {
      const v2 = sanitizeV2(JSON.parse(rawV2), currentGw);
      if (v2) return v2;
    }
  } catch {
    // onleesbare v2: verder met v1
  }
  let migrated;
  try {
    const rawV1 = storage?.getItem(TEAM_PLANNER_V1_KEY);
    migrated = migrateTeamPlannerV1(rawV1 ? JSON.parse(rawV1) : null, currentGw);
  } catch {
    migrated = createEmptyPlanner(currentGw);
  }
  saveTeamPlanner(storage, migrated);
  return migrated;
}

export function saveTeamPlanner(storage, planner) {
  try {
    storage?.setItem(TEAM_PLANNER_V2_KEY, JSON.stringify(planner));
  } catch {
    // opslag vol of geblokkeerd: de planner werkt deze sessie gewoon verder
  }
}

// --- Afgeleide gegevens ----------------------------------------------------------------------------

// Wie speelt op elk slot op GW `gw` (de basisspeler of de laatste transfer op of vóór die GW).
export function resolveSlotAtGw(basePlayer, transfers, gw) {
  let current = basePlayer;
  let currentGw = -Infinity;
  for (const t of transfers ?? []) {
    if (t.gw <= gw && t.gw > currentGw) { current = t.player; currentGw = t.gw; }
  }
  return current;
}

export function teamAtGw(players, transfersBySlot, gw) {
  return players.map((base, index) => ({
    ...resolveSlotAtGw(base, transfersBySlot[index], gw),
    position: base.position,
  }));
}

// Platte transferlijst over alle slots, met de uitgaande speler erbij, gesorteerd op GW en slot.
export function buildTransferHistory(players, transfersBySlot) {
  const entries = [];
  Object.entries(transfersBySlot ?? {}).forEach(([slotStr, transfers]) => {
    const slotIndex = Number(slotStr);
    const base = players[slotIndex];
    if (!base) return;
    transfers.forEach((transfer, i) => {
      const outPlayer = i === 0 ? base : transfers[i - 1].player;
      entries.push({ id: transfer.id, gw: transfer.gw, slotIndex, outPlayer, inPlayer: transfer.player });
    });
  });
  entries.sort((a, b) => a.gw - b.gw || a.slotIndex - b.slotIndex);
  return entries;
}

// Budget per speeldag (C1): { [gw]: { start, net, end, fromCheckpoint } } voor startGw..GW_COUNT.
// start = budget aan het begin van de speeldag, net = Σ(prijs in − prijs uit) van de transfers in die
// speeldag, end = start − net (wat de statusregel toont). Een ijkpunt vervangt `start` van zijn speeldag;
// alles ervoor blijft ongewijzigd.
export function computeBankByGw(history, { startGw = 1, startBank = null, players = [], checkpoints = {} } = {}) {
  const netByGw = {};
  for (const e of history) {
    netByGw[e.gw] = (netByGw[e.gw] ?? 0) + priceOf(e.inPlayer) - priceOf(e.outPlayer);
  }
  const round = (v) => Math.round(v * 10) / 10;
  const result = {};
  // players = het startteam (vóór de transfers van de startspeeldag).
  let bank = startBank ?? (TEAM_PLANNER_BUDGET - teamValue(players));
  for (let gw = startGw; gw <= GW_COUNT; gw++) {
    const cp = checkpoints[gw];
    const fromCheckpoint = Number.isFinite(cp?.bank);
    if (fromCheckpoint) bank = cp.bank;
    const net = netByGw[gw] ?? 0;
    result[gw] = { start: round(bank), net: round(net), end: round(bank - net), fromCheckpoint };
    bank -= net;
  }
  return result;
}

// --- Opstelling ------------------------------------------------------------------------------------

// Is deze bank (4 slot-indices) geldig voor het team: precies 1 keeper erop en een toegelaten formatie?
export function isValidBench(bench, players) {
  if (!Array.isArray(bench) || bench.length !== TEAM_PLANNER_BENCH_SIZE) return false;
  if (new Set(bench).size !== bench.length || !bench.every(isSlot)) return false;
  const counts = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
  players.forEach((p, i) => { if (!bench.includes(i)) counts[TEAM_PLANNER_SLOT_POSITIONS[i]] += 1; });
  return counts.GK === 1 && VALID_FORMATIONS.some(([d, m, f]) => d === counts.DEF && m === counts.MID && f === counts.FWD);
}

export function formationOf(bench) {
  const counts = { DEF: 0, MID: 0, FWD: 0 };
  TEAM_PLANNER_SLOT_POSITIONS.forEach((pos, i) => { if (pos !== 'GK' && !bench.includes(i)) counts[pos] += 1; });
  return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
}

// Beste opstelling volgens een score per slot (hoger = beter): de beste keeper en de toegelaten
// formatie met de hoogste som. Gelijke scores: het laagste slotnummer speelt (stabiel resultaat).
// Geeft { bench, starters } terug; bench in volgorde keeper, dan de beste invaller eerst.
export function bestLineup(scoreForSlot) {
  const slots = TEAM_PLANNER_SLOT_POSITIONS.map((pos, index) => ({ index, pos, score: scoreForSlot(index) }));
  const byScore = (a, b) => b.score - a.score || a.index - b.index;
  const gks = slots.filter(s => s.pos === 'GK').sort(byScore);
  const byPos = {
    DEF: slots.filter(s => s.pos === 'DEF').sort(byScore),
    MID: slots.filter(s => s.pos === 'MID').sort(byScore),
    FWD: slots.filter(s => s.pos === 'FWD').sort(byScore),
  };
  let best = null;
  for (const [d, m, f] of VALID_FORMATIONS) {
    const starters = [...byPos.DEF.slice(0, d), ...byPos.MID.slice(0, m), ...byPos.FWD.slice(0, f)];
    const total = starters.reduce((sum, s) => sum + s.score, 0);
    if (!best || total > best.total + 1e-9) best = { total, starters };
  }
  const starterSet = new Set([gks[0].index, ...best.starters.map(s => s.index)]);
  const outfieldBench = slots.filter(s => s.pos !== 'GK' && !starterSet.has(s.index)).sort(byScore).map(s => s.index);
  return { bench: [gks[1].index, ...outfieldBench], starters: [...starterSet] };
}

// Kan slot `a` met slot `b` wisselen (C3)? Twee bankspelers = de bankvolgorde wisselen (geen keeper).
// Een basisspeler met een bankspeler: keeper enkel met keeper, en de formatie moet geldig blijven.
export function canSwap(bench, a, b, players) {
  if (a === b) return false;
  const aBench = bench.includes(a);
  const bBench = bench.includes(b);
  const posA = TEAM_PLANNER_SLOT_POSITIONS[a];
  const posB = TEAM_PLANNER_SLOT_POSITIONS[b];
  if (aBench && bBench) return posA !== 'GK' && posB !== 'GK';
  if (!aBench && !bBench) return false;
  if ((posA === 'GK') !== (posB === 'GK')) return false;
  return isValidBench(swapInBench(bench, a, b), players);
}

// De nieuwe bank na een wissel: de bankspeler neemt de plek van de basisspeler in, of twee bankspelers
// ruilen van plaats.
export function swapInBench(bench, a, b) {
  const next = [...bench];
  const ia = next.indexOf(a);
  const ib = next.indexOf(b);
  if (ia !== -1 && ib !== -1) { [next[ia], next[ib]] = [next[ib], next[ia]]; return next; }
  if (ia !== -1) next[ia] = b;
  else if (ib !== -1) next[ib] = a;
  return next;
}

// De opstelling van één speeldag zoals de planner ze toont (C2): de eigen of overgeërfde keuze, of een
// automatische opstelling (lineupIsAuto) als er nog niets (geldigs) is. Een kapitein of vice die op de
// bank staat, verschuift niet stil: dan is er geen.
export function lineupForGw(planner, gw, autoBench) {
  const stored = resolveForGw(planner.benchByGw, gw, planner.startGw);
  const players = planner.players;
  const storedValid = isValidBench(stored, players);
  const bench = storedValid ? stored : autoBench;
  const captainRaw = resolveForGw(planner.captainByGw, gw, planner.startGw);
  const viceRaw = resolveForGw(planner.viceByGw, gw, planner.startGw);
  const onPitch = (slot) => isSlot(slot) && !bench.includes(slot);
  return {
    bench,
    lineupIsAuto: !storedValid,
    captain: onPitch(captainRaw) ? captainRaw : null,
    vice: onPitch(viceRaw) && viceRaw !== captainRaw ? viceRaw : null,
  };
}
