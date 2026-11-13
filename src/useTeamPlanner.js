// De state van de Team Planner (FUNCTIONALITEIT_SPEC fase C) als één React-hook, zodat FDRTool.jsx er
// enkel nog `const planner = useTeamPlanner(...)` voor nodig heeft. Het rekenwerk zelf zit in
// teamPlanner.js (puur en getest); hier staan enkel de state, de opslag en de meldingen met
// "Ongedaan maken".
//
// Eén plannerobject (zie teamPlanner.js voor de velden) + de bekeken speeldag. Elke wijziging is een
// nieuw object, zodat ongedaan maken gewoon de vorige versie terugzet.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CURRENT_GW, GW_COUNT, PREDICTED_LINEUPS_GW, AUTO_RECHARGE_GWS, TEAM_PLANNER_MAX_PER_CLUB,
  TEAM_PLANNER_SLOT_POSITIONS, computeTeamPlannerTransferBudget, resolveForGw,
} from './constants';
import { PREDICTED_LINEUPS } from './predictedLineupsData';
import { buildLineupSafetyLookup } from './availability';
import { findInDatabase } from './data/playerDatabase';
import { lineupScore } from './lineupScore';
import {
  DEFAULT_BENCH, applyTransfer, bestLineup, buildTransferHistory, canSwap, clearCalibrationAt,
  computeBankByGw, createEmptyPlanner, hasCalibrationAt, isPlannerComplete, isPlannerEmpty,
  isValidBench, lineupForGw, loadTeamPlanner, removeTransferCascade, saveTeamPlanner, setBenchAt,
  setCalibrationAt, setRoleAt, suggestCaptains, swapInBench, teamAtGw, teamValue, withStartLineup,
} from './teamPlanner';

const NOTICE_MS = 8000;
const playerKey = (p) => `${p?.name ?? ''}|${p?.teamCode ?? ''}`;
const priceOf = (p) => {
  const n = parseFloat(p?.price);
  return Number.isFinite(n) ? n : 0;
};

function getStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// De Verwachte XI's tellen enkel voor de speeldag waarvoor ze gepubliceerd zijn (C6).
const LINEUP_GW = PREDICTED_LINEUPS_GW >= CURRENT_GW ? PREDICTED_LINEUPS_GW : null;
const safetyOf = buildLineupSafetyLookup(LINEUP_GW ? PREDICTED_LINEUPS : null);

export default function useTeamPlanner({ playerDatabase, ratings, homeAdvantage, t }) {
  const [planner, setPlanner] = useState(() => loadTeamPlanner(getStorage(), CURRENT_GW));
  const [gwChoice, setGwChoice] = useState(CURRENT_GW);
  const [notice, setNotice] = useState(null);
  const noticeTimer = useRef(null);

  useEffect(() => { saveTeamPlanner(getStorage(), planner); }, [planner]);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const gw = Math.min(GW_COUNT, Math.max(planner.startGw, gwChoice));
  const complete = isPlannerComplete(planner.players);
  const empty = isPlannerEmpty(planner.players);

  // Score per slot voor de opstelling (C6). Een speler die niet in de databank staat, telt met een
  // neutrale vorm (1) mee, zodat hij niet zomaar op de bank belandt.
  const scoreForSlotAt = useCallback((p, g) => {
    const team = teamAtGw(p.players, p.transfersBySlot, g);
    return (slot) => {
      const player = team[slot];
      if (!player?.name) return 0;
      const row = findInDatabase(playerDatabase, player.name, player.teamCode);
      return lineupScore({
        player: row ?? { teamCode: player.teamCode },
        gw: g, ratings, homeAdvantage,
        lineupGw: LINEUP_GW,
        lineupSafety: safetyOf(player.name, player.teamCode),
      });
    };
  }, [playerDatabase, ratings, homeAdvantage]);

  // De opstelling zoals de planner ze toont: de eigen of overgeërfde keuze, anders automatisch.
  const lineupAt = useCallback((p, g) => {
    const stored = resolveForGw(p.benchByGw, g, p.startGw);
    const auto = isValidBench(stored, p.players) ? stored
      : isPlannerComplete(p.players) ? bestLineup(scoreForSlotAt(p, g)).bench
      : [...DEFAULT_BENCH];
    return lineupForGw(p, g, auto);
  }, [scoreForSlotAt]);

  const team = useMemo(
    () => teamAtGw(planner.players, planner.transfersBySlot, gw).map((p, index) => ({ ...p, index })),
    [planner.players, planner.transfersBySlot, gw],
  );
  const lineup = useMemo(() => lineupAt(planner, gw), [lineupAt, planner, gw]);
  const startLineup = useMemo(() => lineupAt(planner, planner.startGw), [lineupAt, planner]);

  const history = useMemo(
    () => buildTransferHistory(planner.players, planner.transfersBySlot),
    [planner.players, planner.transfersBySlot],
  );
  const transferBudget = useMemo(() => computeTeamPlannerTransferBudget(history, planner.boosters, {
    startGw: planner.startGw, startFreeTransfers: planner.startFreeTransfers, checkpoints: planner.checkpoints,
  }), [history, planner.boosters, planner.startGw, planner.startFreeTransfers, planner.checkpoints]);
  const bankByGw = useMemo(() => computeBankByGw(history, {
    startGw: planner.startGw, startBank: planner.startBank, players: planner.players, checkpoints: planner.checkpoints,
  }), [history, planner.startGw, planner.startBank, planner.players, planner.checkpoints]);

  // Het team op de huidige speeldag, voor "mijn spelers" op andere tabs (niet de bekeken speeldag).
  const currentTeam = useMemo(
    () => teamAtGw(planner.players, planner.transfersBySlot, Math.max(planner.startGw, CURRENT_GW)),
    [planner.players, planner.transfersBySlot, planner.startGw],
  );

  // Transfers kunnen vanaf de eerste speeldag met een transferbudget (bij startGw 1 is GW1 de
  // teamopbouw, zoals vroeger).
  const firstTransferGw = planner.startGw <= 1 ? 2 : planner.startGw;
  const canTransfer = complete && gw >= firstTransferGw;

  // --- Meldingen ---------------------------------------------------------------------------------
  const showNotice = useCallback((next) => {
    setNotice(next);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  const dismissNotice = useCallback(() => {
    setNotice(null);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);
  const undoNotice = () => {
    if (notice?.snapshot) setPlanner(notice.snapshot);
    dismissNotice();
  };

  // Wijzig de planner; met `withUndo` krijgt de bezoeker een melding met "Ongedaan maken".
  const commit = (next, noticeData = null) => {
    if (noticeData) showNotice({ ...noticeData, snapshot: planner });
    setPlanner(next);
  };

  // Een wijziging aan de opstelling van een speeldag die nog automatisch was, bewaart die
  // automatische opstelling eerst (C2: pas bewaren als de gebruiker iets wijzigt).
  const withLineupKept = (p, g) => (lineupAt(p, g).lineupIsAuto ? setBenchAt(p, g, lineupAt(p, g).bench) : p);

  // --- Navigatie ---------------------------------------------------------------------------------
  const goPrev = () => setGwChoice(Math.max(planner.startGw, gw - 1));
  const goNext = () => setGwChoice(Math.min(GW_COUNT, gw + 1));
  const goTo = (g) => setGwChoice(Math.min(GW_COUNT, Math.max(planner.startGw, g)));

  // --- Startteam (lege planner en "Startteam bewerken") ---------------------------------------------
  const fillSlot = (slot, player) => {
    // Een lege planner begint altijd op de huidige speeldag, ook als hij lang geleden leeg bewaard werd.
    const base = empty ? createEmptyPlanner(CURRENT_GW) : planner;
    const players = base.players.map((p, i) => (i === slot
      ? { name: player.name, teamCode: player.teamCode, position: TEAM_PLANNER_SLOT_POSITIONS[i], price: player.price ?? '' }
      : p));
    commit(withStartLineup(base, { ...base, players }, scoreForSlotAt));
  };

  const clearSlot = (slot) => {
    const players = planner.players.map((p, i) => (i === slot ? { ...p, name: '', teamCode: '', price: '' } : p));
    commit({ ...planner, players });
  };

  const clearTeam = () => {
    commit(createEmptyPlanner(CURRENT_GW), { key: 'teamCleared' });
    setGwChoice(CURRENT_GW);
  };

  // Screenshot-import (C8): over een bestaand team vervangt dit de planner (met ongedaan maken), want
  // de screenshot toont je team van vandaag, niet dat van je startspeeldag.
  const importTeam = ({ slots, captainSlot = null, viceSlot = null, bank = null, freeTransfers = null }) => {
    const fresh = createEmptyPlanner(CURRENT_GW);
    const players = fresh.players.map((p, i) => {
      const hit = slots.find(s => s.slot === i);
      return hit ? { name: hit.player.name, teamCode: hit.player.teamCode, position: TEAM_PLANNER_SLOT_POSITIONS[i], price: hit.player.price ?? '' } : p;
    });
    let next = {
      ...fresh, players,
      startBank: Number.isFinite(bank) ? Math.round(bank * 10) / 10 : null,
      startFreeTransfers: Number.isInteger(freeTransfers) ? Math.min(3, Math.max(0, freeTransfers)) : 1,
      checkConfirmed: Number.isFinite(bank) && Number.isInteger(freeTransfers),
    };
    if (captainSlot !== null) next.captainByGw = { [next.startGw]: captainSlot };
    if (viceSlot !== null && viceSlot !== captainSlot) next.viceByGw = { [next.startGw]: viceSlot };
    next = withStartLineup(fresh, next, scoreForSlotAt);
    commit(next, empty ? null : { key: 'imported' });
    setGwChoice(CURRENT_GW);
  };

  // --- Transfers (C4) -----------------------------------------------------------------------------
  // Dezelfde speler kan onder twee namen bewaard staan ("Scheidler" uit de kiezer, "Aurelien Scheidler"
  // uit een oude planner of een screenshot). Vergelijk daarom via de rij in de spelersdatabank.
  const keyOf = (p) => playerKey(findInDatabase(playerDatabase, p?.name, p?.teamCode) ?? p);

  // Wat een transfer op `slot` in de bekeken speeldag mag: de maximumprijs (budget + prijs van de
  // vertrekkende speler) en, per speeldag waarop de nieuwe speler in het team zit, de andere spelers
  // en clubs. Zo kan een transfer ook later geen dubbele speler of een 4e van een club opleveren.
  const transferRules = (slot) => {
    const current = team[slot];
    const slotTransfers = planner.transfersBySlot[slot] ?? [];
    const until = slotTransfers.find(tr => tr.gw > gw)?.gw ?? Infinity;
    const gws = [gw, ...new Set(history.filter(e => e.gw > gw && e.gw < until && e.slotIndex !== slot).map(e => e.gw))];
    const checks = gws.map(g => {
      const others = teamAtGw(planner.players, planner.transfersBySlot, g).filter((p, i) => i !== slot && p.name);
      const clubs = {};
      others.forEach(p => { clubs[p.teamCode] = (clubs[p.teamCode] ?? 0) + 1; });
      return { gw: g, keys: new Set(others.map(keyOf)), clubs };
    });
    const maxPrice = Math.round(((bankByGw[gw]?.end ?? 0) + priceOf(current)) * 10) / 10;
    return { current, checks, maxPrice };
  };

  const transferBlocker = (slot) => {
    const { current, checks, maxPrice } = transferRules(slot);
    return (candidate) => {
      if (keyOf(candidate) === keyOf(current)) return t('picker.reasonCurrent');
      for (const check of checks) {
        const later = check.gw !== gw;
        if (check.keys.has(keyOf(candidate))) {
          return later ? t('picker.reasonInTeamLater', { gw: check.gw }) : t('picker.reasonInTeam');
        }
        if ((check.clubs[candidate.teamCode] ?? 0) >= TEAM_PLANNER_MAX_PER_CLUB) {
          return later
            ? t('picker.reasonClubLimitLater', { max: TEAM_PLANNER_MAX_PER_CLUB, gw: check.gw })
            : t('picker.reasonClubLimit', { max: TEAM_PLANNER_MAX_PER_CLUB });
        }
      }
      if (Number.isFinite(candidate.price) && candidate.price > maxPrice + 1e-9) {
        return t('picker.reasonTooExpensive', { over: (candidate.price - maxPrice).toFixed(1) });
      }
      return null;
    };
  };

  const transfer = (slot, inPlayer) => {
    const result = applyTransfer(planner, slot, gw, inPlayer);
    commit(result.planner, result.kind === 'reverted'
      ? { key: 'transferReverted', vars: { name: inPlayer.name, gw } }
      : { key: 'transferDone', vars: { out: result.out?.name || '—', in: inPlayer.name, gw } });
  };

  const removeTransfer = (slot, transferId) => {
    const result = removeTransferCascade(planner, slot, transferId);
    if (result.removed === 0) return;
    commit(result.planner, result.removed === 1
      ? { key: 'transferRemoved' }
      : { key: 'transfersRemoved', vars: { count: result.removed } });
  };

  const clearTransfers = () => {
    commit({ ...planner, transfersBySlot: {} }, { key: 'transfersCleared' });
  };

  // --- Opstelling (C2, C3, C6) --------------------------------------------------------------------
  const swapTargets = (slot) => new Set(
    TEAM_PLANNER_SLOT_POSITIONS.map((_, i) => i).filter(i => canSwap(lineup.bench, slot, i, planner.players)),
  );

  const swap = (a, b) => {
    if (!canSwap(lineup.bench, a, b, planner.players)) return;
    commit(setBenchAt(planner, gw, swapInBench(lineup.bench, a, b)));
  };

  const setCaptain = (slot) => commit(setRoleAt(withLineupKept(planner, gw), gw, 'captain', slot));
  const setVice = (slot) => commit(setRoleAt(withLineupKept(planner, gw), gw, 'vice', slot));

  // "Optimaliseer opstelling": de beste opstelling volgens de score, met kapitein en vice. De melding
  // zegt wat er veranderde ("Van Den Kerkhof ↔ Sonko, kapitein: Zeneli").
  const optimize = () => {
    const score = scoreForSlotAt(planner, gw);
    const best = bestLineup(score);
    const { captain, vice } = suggestCaptains(best.bench, score);
    let next = setBenchAt(planner, gw, best.bench);
    next = setRoleAt(next, gw, 'captain', captain);
    next = setRoleAt(next, gw, 'vice', vice === captain ? null : vice);

    const name = (slot) => team[slot]?.name || '—';
    // Wie van de bank naar het veld gaat (ins) en omgekeerd (outs), in slotvolgorde: zo staat een
    // keeper altijd tegenover een keeper.
    const ins = best.starters.filter(s => lineup.bench.includes(s)).sort((a, b) => a - b);
    const outs = best.bench.filter(s => !lineup.bench.includes(s)).sort((a, b) => a - b);
    const parts = [];
    ins.forEach((s, i) => { if (outs[i] !== undefined) parts.push(`${name(outs[i])} ↔ ${name(s)}`); });
    if (captain !== lineup.captain) parts.push(t('teamPlanner.notice.captainPart', { name: name(captain) }));
    const benchOrderChanged = parts.length === 0 && best.bench.some((s, i) => s !== lineup.bench[i]);
    if (parts.length === 0 && !benchOrderChanged && vice === lineup.vice && !lineup.lineupIsAuto) {
      showNotice({ key: 'lineupUnchanged', vars: { gw } });
      return;
    }
    commit(next, parts.length > 0
      ? { key: 'lineupOptimized', vars: { gw, changes: parts.join(', ') } }
      : { key: 'lineupOptimizedSmall', vars: { gw } });
  };

  // --- Boosters (C7): 1× per seizoen, max. 1 per speeldag, geen eigen Recharge op een automatische
  // Recharge-speeldag. Ongewijzigd ten opzichte van vroeger.
  const toggleBooster = (key) => {
    if (key === 'recharge' && AUTO_RECHARGE_GWS.has(gw)) return;
    const boosters = { ...planner.boosters };
    if (boosters[key] === gw) boosters[key] = null;
    else if (boosters[key] != null) return;
    else {
      boosters[key] = gw;
      Object.keys(boosters).forEach(k => { if (k !== key && boosters[k] === gw) boosters[k] = null; });
    }
    commit({ ...planner, boosters });
  };

  // --- Budget en gratis transfers "Klopt niet? Pas aan" (C1) -------------------------------------
  const calibrationAt = (g) => ({
    bank: bankByGw[g]?.start ?? null,
    freeTransfers: transferBudget[g]?.freeAvailable ?? null,
    hasFreeTransfers: !!transferBudget[g],
    custom: hasCalibrationAt(planner, g),
  });
  const calibrate = (g, values) => commit({ ...setCalibrationAt(planner, g, values), checkConfirmed: true });
  const resetCalibration = (g) => commit(clearCalibrationAt(planner, g));
  const confirmCheck = () => commit({ ...planner, checkConfirmed: true });

  const startValue = teamValue(planner.players);

  return {
    planner, gw, startGw: planner.startGw, complete, empty, team, lineup, startLineup,
    history, transferBudget, bankByGw, currentTeam, canTransfer, startValue,
    goPrev, goNext, goTo, canPrev: gw > planner.startGw, canNext: gw < GW_COUNT,
    fillSlot, clearSlot, clearTeam, importTeam,
    transferRules, transferBlocker, transfer, removeTransfer, clearTransfers,
    isSamePlayer: (a, b) => keyOf(a) === keyOf(b),
    swapTargets, swap, setCaptain, setVice, optimize, toggleBooster,
    calibrationAt, calibrate, resetCalibration, confirmCheck,
    notice, undoNotice, dismissNotice,
  };
}
