// Inhoud van de Team Planner-tab (spec §7.3): het veld eerst, de lijst tweede. Een 15-koppige
// selectie met live budget-/clubvalidatie, een veld per GW met fixtures/bank/kapitein, en een
// transfer-laag erbovenop (spelers vervangen vanaf een gekozen GW, tijdgebonden — zie TransferPanel en
// resolvedIndexedPlayers hieronder).
//
// Ontvangt alle domein-state en handlers als props vanuit FDRTool.jsx; die blijven ongewijzigd. De tab
// wordt bij elk tabwissel opnieuw gemount, dus lokale state reset dan — enkel voorbijgaande UI-state
// staat hier: de transfer-draft (TransferPanel), de Recharge-draft, de herschik-modus van de bank, de
// gekozen weergave op gsm (Veld/Lijst/Transfers), het open "⋯"-menu en de open spelerskiezer.
//
// Opbouw: desktop (≥1100px) twee kolommen (60/40): links GW-kiezer, boosters, transfer plannen, het
// veld en de bank; rechts de selectielijst en de transfers. Gsm: een sticky statusregel en een
// Segmented Veld | Lijst | Transfers.

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ChevronLeft, ChevronRight, Loader2, ArrowLeftRight, X, Wand2, Trash2, ArrowUpDown, MoreHorizontal,
} from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT, GW_DEADLINES, CURRENT_GW,
  TEAM_PLANNER_BUDGET, TEAM_PLANNER_MAX_PER_CLUB, TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_SQUAD_SIZE,
  VALID_FORMATIONS, TEAM_PLANNER_SLOT_POSITIONS,
  isRechargeActiveForGw as isRechargeActiveForGwRule, AUTO_RECHARGE_GWS,
} from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { TooltipTrigger } from '../components/Tooltip';
import { SectionHeader } from '../components/SectionHeader';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { TeamScreenshotUpload } from './TeamScreenshotUpload';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Segmented from '../ui/Segmented';
import Select from '../ui/Select';
import DataTable from '../ui/DataTable';
import PlayerCell from '../ui/PlayerCell';
import ActionMenu from '../ui/ActionMenu';
import PlayerPicker from '../ui/PlayerPicker';
import ErrorBanner from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import usePlayerIndex from '../data/usePlayerIndex';
import { findInDatabase } from '../data/playerDatabase';
import { AvailabilityMini } from '../ui/AvailabilityMark';
import { useAvailabilityLookup } from '../availabilityContext';
import './TeamPlannerTab.css';

// Veldvolgorde: GK bovenaan, FWD onderaan, zoals de echte FPL-app.
const PITCH_ROW_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

function hasPrice(price) {
  return price != null && price !== '' && Number.isFinite(Number(price));
}

function formatPrice(price) {
  return hasPrice(price) ? `€${Number(price).toFixed(1)}` : '—';
}

function teamNameFor(teamCode) {
  return TEAMS.find(t => t.code === teamCode)?.name ?? teamCode;
}

// Twee spelers zijn "dezelfde speler" bij gelijke naam + club — dat combo is uniek per rij in de
// spelersdatabank-CSV. Gebruikt om te verhinderen dat eenzelfde speler twee keer in de 15-koppige
// selectie terechtkomt (zowel bij de initiële teaminvoer als bij een transfer).
function isSamePlayer(a, b) {
  return a.name === b.name && a.teamCode === b.teamCode;
}

// Filtert databank-kandidaten die al ergens anders in `usedPlayers` zitten weg — enkel ingevulde
// spelers (met een naam) tellen als "in gebruik", lege slots blokkeren niets.
function excludeUsedPlayers(candidates, usedPlayers) {
  const used = usedPlayers.filter(p => p.name);
  return candidates.filter(candidate => !used.some(u => isSamePlayer(u, candidate)));
}

const isEmptySlot = (player) => !player?.name && !player?.teamCode;

// Booster als secondary-knop (spec §7.3). Actief in deze GW = omgekeerd (aria-pressed). Al gebruikt in
// een andere GW = uitgeschakeld (--text-4) met "gebruikt in GW9". 'automatic' = de gratis Recharge op
// AUTO_RECHARGE_GWS: opgelicht maar niet klikbaar. De logica is dezelfde als vroeger (boosterState).
function BoosterButton({ t, label, description, state, usedGw, gw, onClick }) {
  const isAutomatic = state === 'automatic';
  const isActive = state === 'active' || isAutomatic;
  const isUsedElsewhere = state === 'used-elsewhere';
  const statusText = isAutomatic
    ? t('teamPlanner.booster.automatic')
    : isActive ? t('teamPlanner.booster.active', { gw })
    : isUsedElsewhere ? t('teamPlanner.booster.usedIn', { gw: usedGw }) : t('teamPlanner.booster.available');
  return (
    <Button
      variant="secondary"
      className={`tp-booster${isAutomatic ? ' is-auto' : ''}`}
      onClick={isAutomatic ? undefined : onClick}
      disabled={isUsedElsewhere || isAutomatic}
      aria-pressed={isActive}
      aria-label={`${label} — ${statusText}. ${description}`}
      title={description}
    >
      {label}
      {(isUsedElsewhere || isAutomatic) && <span className="tp-booster__state">{statusText}</span>}
    </Button>
  );
}

// Eén slot op het veld of de bank (spec §5.13): shirt, naamlabel, MiniFixture voor de bekeken GW. Een
// leeg slot is een gestippeld kader met het positielabel. Tik = het slot-menu (of de spelerskiezer bij
// een leeg slot, of selecteren om te wisselen in de herschik-modus van de bank).
// Een speler die niet (meer) in de spelersdatabank staat, krijgt een klein label in plaats van te
// verdwijnen (spec B1). Zelfde vorm als een beschikbaarheidsstatus, zodat AvailabilityMini hem toont.
const NOT_FOUND_STATUS = { kind: 'notFound', tone: 'outline', labelKey: 'teamPlanner.notFound', titleKey: 'teamPlanner.notFoundTitle', vars: {} };

function PitchSlot({ player, label, gw, ratings, homeAdvantage, captainGlyph, status = null, onClick, ariaLabel, className = '', disabled, title }) {
  if (isEmptySlot(player)) {
    return (
      <button type="button" className={`tp-slot is-empty ${className}`} onClick={onClick} aria-label={ariaLabel} disabled={disabled}>
        <span className="tp-slot__frame">{player.position}</span>
      </button>
    );
  }
  const fixture = player.teamCode ? FIXTURES[player.teamCode]?.[gw - 1] : null;
  return (
    <button type="button" className={`tp-slot ${className}`} onClick={onClick} aria-label={ariaLabel} disabled={disabled} title={title}>
      <span className="tp-slot__shirt">
        {player.teamCode && (
          <img src={`/club-shirts/${player.teamCode}.webp`} alt="" width="40" height="40" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        )}
        {captainGlyph && <Badge tone="accent" className="tp-slot__cap">{captainGlyph}</Badge>}
        <AvailabilityMini status={status} className="tp-slot__avail" />
      </span>
      <span className="tp-slot__name">{label || player.name || '—'}</span>
      <span className="tp-slot__fix">
        <MiniFixtureBadge teamCode={player.teamCode} fixture={fixture} gwNumber={gw} ratings={ratings} homeAdvantage={homeAdvantage} />
      </span>
    </button>
  );
}

// Transfer plannen voor de bekeken GW `gw`: OUT komt uit resolvedIndexedPlayers (het HUIDIGE team op
// dit punt in de tijd, dus al rekening houdend met eerder geplande transfers — niet per se het
// oorspronkelijke GW1-team), IN komt uit de spelersdatabank via PlayerSearchInput (zonder positie-
// filter: een andere positie mag, met waarschuwing). Alle validaties hieronder zijn waarschuwingen —
// "Bevestig transfer" blijft altijd klikbaar. De OUT/IN-keuze zelf is lokale draft-state: pas bij
// "Bevestig transfer" wordt het via onConfirm naar FDRTool.jsx doorgegeven en permanent (localStorage).
function TransferPanel({ t, gw, resolvedIndexedPlayers, playerDatabase, playerDatabaseLoading, playerDatabaseError, onConfirm, externalOutIndex, onExternalOutIndexConsumed, onOpenChange, panelRef }) {
  const [isOpen, setIsOpen] = useState(false);
  const [outIndex, setOutIndex] = useState('');
  const [inPlayer, setInPlayer] = useState(null);

  // Enkel gevulde slots kunnen "uit" — een leeg slot heeft niets om te vervangen.
  const outOptions = resolvedIndexedPlayers.filter(p => p.name || p.teamCode);
  const outPlayer = outIndex !== '' ? resolvedIndexedPlayers[Number(outIndex)] : null;

  const resetDraft = () => { setOutIndex(''); setInPlayer(null); };
  const handleToggle = () => { setIsOpen(o => !o); resetDraft(); };

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // "Transfer: deze speler eruit" in het slot-menu opent dit paneel meteen met die speler als OUT —
  // externalOutIndex is enkel een "signaal", vandaar dat de ouder 'm meteen weer op null zet.
  useEffect(() => {
    if (externalOutIndex === null || externalOutIndex === undefined) return;
    setOutIndex(String(externalOutIndex));
    setInPlayer(null);
    setIsOpen(true);
    onExternalOutIndexConsumed?.();
  }, [externalOutIndex, onExternalOutIndexConsumed]);

  const handleConfirm = () => {
    if (!outPlayer || !inPlayer) return;
    onConfirm(outPlayer.index, gw, {
      name: inPlayer.name, teamCode: inPlayer.teamCode, position: inPlayer.position, price: inPlayer.price,
    });
    resetDraft();
    setIsOpen(false);
  };

  // Budget/club-impact van de (nog niet bevestigde) transfer, berekend op het HUIDIGE team op deze GW.
  const currentTotal = resolvedIndexedPlayers.reduce((sum, p) => {
    const price = parseFloat(p.price);
    return Number.isFinite(price) ? sum + price : sum;
  }, 0);
  const newTotal = outPlayer && inPlayer
    ? currentTotal - (parseFloat(outPlayer.price) || 0) + (parseFloat(inPlayer.price) || 0)
    : currentTotal;
  const isOverBudgetAfter = outPlayer && inPlayer && newTotal > TEAM_PLANNER_BUDGET;

  let clubCountAfter = null;
  if (outPlayer && inPlayer && inPlayer.teamCode) {
    const currentInClub = resolvedIndexedPlayers.filter(p => p.teamCode === inPlayer.teamCode).length;
    clubCountAfter = outPlayer.teamCode === inPlayer.teamCode ? currentInClub : currentInClub + 1;
  }
  const isClubOverCapAfter = clubCountAfter !== null && clubCountAfter > TEAM_PLANNER_MAX_PER_CLUB;
  const isPositionMismatch = outPlayer && inPlayer && outPlayer.position !== inPlayer.position;

  return (
    <div className="tp-transfer" ref={panelRef}>
      <Button variant="secondary" icon={ArrowLeftRight} aria-pressed={isOpen} aria-expanded={isOpen} onClick={handleToggle}>
        {isOpen ? t('teamPlanner.cancelTransfer') : t('teamPlanner.planTransfer', { gw })}
      </Button>

      {isOpen && (
        <div className="tp-transfer__panel">
          <div className="tp-transfer__fields">
            <label className="tp-field">
              <span className="label">{t('teamPlanner.out')}</span>
              <Select value={outIndex} onChange={v => { setOutIndex(v); setInPlayer(null); }}>
                <option value="">{t('teamPlanner.choosePlayer')}</option>
                {outOptions.map(p => (
                  <option key={p.index} value={p.index}>
                    {p.position} — {p.name || t('teamPlanner.playerFallback', { number: p.index + 1 })} ({formatPrice(p.price)})
                  </option>
                ))}
              </Select>
            </label>
            <div className="tp-field">
              <span className="label">{t('teamPlanner.in')}</span>
              {/* excludeUsedPlayers sluit spelers uit die al ergens in het huidige team zitten (ook de
                  OUT-speler zelf) — zo kan een transfer nooit een speler binnenhalen die al in de 15 staat. */}
              <PlayerSearchInput
                value={inPlayer?.name ?? ''}
                players={excludeUsedPlayers(playerDatabase, resolvedIndexedPlayers)}
                disabled={outIndex === '' || playerDatabaseLoading || !!playerDatabaseError}
                placeholder={
                  outIndex === '' ? t('teamPlanner.chooseOutFirst')
                    : playerDatabaseLoading ? t('teamPlanner.searchLoadingPlaceholder') : t('teamPlanner.searchIncoming')
                }
                maxWidth="none"
                onSelect={setInPlayer}
                noResultsText={t('shared.noPlayersFound')}
              />
            </div>
          </div>

          {outPlayer && inPlayer && (
            <>
              <p className="tp-transfer__preview">
                {outPlayer.name || '—'} <span className="num">{formatPrice(outPlayer.price)}</span>
                <span className="tp-transfer__arrow" aria-hidden="true"> → </span>
                <strong>{inPlayer.name}</strong> <span className="num">{formatPrice(inPlayer.price)}</span>
                <span className="tp-transfer__club"> · {teamNameFor(inPlayer.teamCode)} · {inPlayer.position}</span>
              </p>
              {isPositionMismatch && (
                <p className="tp-warn">
                  {t('teamPlanner.positionMismatch', { inName: inPlayer.name, inPosition: inPlayer.position, outName: outPlayer.name, outPosition: outPlayer.position })}
                </p>
              )}
              {isOverBudgetAfter && (
                <p className="tp-warn">
                  {t('teamPlanner.overBudgetAfter', { newTotal: newTotal.toFixed(1), budget: TEAM_PLANNER_BUDGET, over: (newTotal - TEAM_PLANNER_BUDGET).toFixed(1) })}
                </p>
              )}
              {isClubOverCapAfter && (
                <p className="tp-warn">
                  {t('teamPlanner.overCapAfter', { max: TEAM_PLANNER_MAX_PER_CLUB, club: teamNameFor(inPlayer.teamCode) })}
                </p>
              )}
              {!isPositionMismatch && !isOverBudgetAfter && !isClubOverCapAfter && (
                <p className="tp-hint">
                  {t('teamPlanner.newBudgetAfter', { newTotal: newTotal.toFixed(1), budget: TEAM_PLANNER_BUDGET })}
                </p>
              )}
              <div>
                <Button variant="secondary" onClick={handleConfirm}>{t('teamPlanner.confirmTransfer')}</Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamPlannerTab({
  t, onOpenPlayer,
  ratings, homeAdvantage, openSections, toggleSection,
  teamPlannerPlayers, updateTeamPlannerPlayer, toggleTeamPlannerBench,
  teamPlannerBenchByGw, teamPlannerCaptainByGw, setTeamPlannerCaptain,
  teamPlannerGw, handleTeamPlannerGwPrev, handleTeamPlannerGwNext,
  teamPlannerTotalPrice, teamPlannerClubCounts, teamPlannerFormationCounts,
  playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
  teamPlannerResolvedPlayers, teamPlannerTransferHistory, teamPlannerTransferBudget, planTeamPlannerTransfer, removeTeamPlannerTransfer,
  handleOptimizeTeamPlannerLineup, teamPlannerOptimized,
  teamPlannerBoosters, toggleTeamPlannerBooster,
  handleClearTeamPlanner, handleClearTeamPlannerTransfers, swapTeamPlannerBenchPlayers,
  isPlayerWatched, toggleWatchlistPlayer,
}) {
  const index = usePlayerIndex();
  // "Wis team" heeft enkel zin als er iets ingevuld is. Gebaseerd op de echte basisploeg.
  const isRosterEmpty = teamPlannerPlayers.every(p => !p.name);

  // Recharge-bewerking (booster): tijdelijke, niet-bevestigde bewerking van de 15 spelers zoals ze op
  // de bekeken GW spelen. null = niet aan het bewerken; anders array van 15 { name, teamCode, price }.
  const [rechargeDraft, setRechargeDraft] = useState(null);
  const listRef = useRef(null);
  const transferRef = useRef(null);
  // Signaal naar TransferPanel (zie externalOutIndex daar); null zodra het verwerkt is.
  const [transferOutIndex, setTransferOutIndex] = useState(null);
  const [, setIsTransferPanelOpen] = useState(false);
  // Herschik-modus voor de bank: zolang AAN, selecteert een tik op een bankspeler die speler om te
  // wisselen (twee tikken = wissel) in plaats van het slot-menu te openen.
  const [isBenchReorderMode, setIsBenchReorderMode] = useState(false);
  const [benchSwapSlot, setBenchSwapSlot] = useState(null);
  // Weergave op gsm/tablet (<1100px): Veld | Lijst | Transfers.
  const [view, setView] = useState('pitch');
  // Open "⋯"-menu ({ anchor, items, label }) en open spelerskiezer ({ index }).
  const [menu, setMenu] = useState(null);
  const [picker, setPicker] = useState(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const consumeTransferOut = useCallback(() => setTransferOutIndex(null), []);

  useEffect(() => {
    setBenchSwapSlot(null);
  }, [teamPlannerGw, isBenchReorderMode]);

  const handleSelectForSwap = (slotIndex) => {
    if (benchSwapSlot === null) {
      setBenchSwapSlot(slotIndex);
    } else if (benchSwapSlot === slotIndex) {
      setBenchSwapSlot(null); // nogmaals dezelfde speler aantikken annuleert de selectie
    } else {
      swapTeamPlannerBenchPlayers(benchSwapSlot, slotIndex);
      setBenchSwapSlot(null);
    }
  };

  // Activeert Recharge voor de bekeken GW EN leidt de gebruiker meteen naar de selectielijst, waar hij
  // effectief kan bewerken (op gsm: de weergave "Lijst"). Enkel bij het ACTIVEREN is dat zinvol.
  const handleActivateRecharge = () => {
    const wasActive = boosterState('recharge') === 'active';
    toggleTeamPlannerBooster('recharge', teamPlannerGw);
    setRechargeDraft(null);
    if (!wasActive) {
      setView('list');
      requestAnimationFrame(() => {
        listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  // Budget-/club-validatie: normaal op de statische GW1-basisploeg (teamPlannerTotalPrice/ClubCounts,
  // berekend in FDRTool.jsx). Tijdens een Recharge-bewerking op de draft zelf, zodat overschrijden daar
  // onmogelijk is (isRechargeInvalid blokkeert "Bevestig recharge").
  const effectiveRosterList = rechargeDraft ?? teamPlannerPlayers;
  const effectiveTotalPrice = rechargeDraft
    ? rechargeDraft.reduce((sum, p) => {
        const price = parseFloat(p.price);
        return Number.isFinite(price) ? sum + price : sum;
      }, 0)
    : teamPlannerTotalPrice;
  const effectiveClubCounts = rechargeDraft
    ? effectiveRosterList.reduce((counts, p) => {
        if (p.teamCode) counts[p.teamCode] = (counts[p.teamCode] ?? 0) + 1;
        return counts;
      }, {})
    : teamPlannerClubCounts;
  const remainingBudget = TEAM_PLANNER_BUDGET - effectiveTotalPrice;
  const isOverBudget = effectiveTotalPrice > TEAM_PLANNER_BUDGET;
  const overCapClubs = Object.entries(effectiveClubCounts).filter(([, count]) => count > TEAM_PLANNER_MAX_PER_CLUB);
  const overCapClubCodes = new Set(overCapClubs.map(([code]) => code));
  const isRechargeInvalid = rechargeDraft !== null && (isOverBudget || overCapClubs.length > 0);

  // Het veld, de bank, de kapitein en de transfers gebruiken het team ZOALS HET ERUIT ZIET op de
  // bekeken GW (inclusief alle transfers t/m die GW). Elke speler krijgt zijn slot-index mee.
  const resolvedIndexedPlayers = teamPlannerResolvedPlayers.map((player, i) => ({ ...player, index: i }));

  const benchForGw = teamPlannerBenchByGw[teamPlannerGw] ?? [];
  const captainForGw = teamPlannerCaptainByGw[teamPlannerGw];
  const benchCount = benchForGw.length;
  const isBenchComplete = benchCount === TEAM_PLANNER_BENCH_SIZE;
  const isBenchFull = benchCount >= TEAM_PLANNER_BENCH_SIZE;
  // Bank-volgorde: een gebankte keeper staat altijd vooraan; de rest in de opgeslagen volgorde.
  const benchPlayersInStoredOrder = benchForGw.map(i => resolvedIndexedPlayers[i]).filter(Boolean);
  const benchOutfieldPlayers = benchPlayersInStoredOrder.filter(p => p.position !== 'GK');
  const benchPlayers = [
    ...benchPlayersInStoredOrder.filter(p => p.position === 'GK'),
    ...benchOutfieldPlayers,
  ];

  // Formatie-validatie (zie VALID_FORMATIONS in constants.js).
  const { GK: gkCount, DEF: defCount, MID: midCount, FWD: fwdCount } = teamPlannerFormationCounts;
  const matchesValidFormation = VALID_FORMATIONS.some(([d, m, f]) => d === defCount && m === midCount && f === fwdCount);
  const startingCount = gkCount + defCount + midCount + fwdCount;
  const hasFullStartingXi = startingCount === TEAM_PLANNER_SQUAD_SIZE - TEAM_PLANNER_BENCH_SIZE;
  const isValidFormation = isBenchComplete && hasFullStartingXi && gkCount === 1 && matchesValidFormation;
  const formationLabel = `${defCount}-${midCount}-${fwdCount}`;

  const isBenchBoostActive = teamPlannerBoosters.benchBoost === teamPlannerGw;
  const isTripleCaptainActive = teamPlannerBoosters.tripleCaptain === teamPlannerGw;
  // Eén bron van waarheid voor "Recharge loopt op deze GW" (ook gebruikt door het transferbudget).
  const isRechargeActiveForGw = isRechargeActiveForGwRule(teamPlannerBoosters, teamPlannerGw);

  // 'automatic' | 'active' | 'used-elsewhere' | 'available' — zie toggleTeamPlannerBooster (FDRTool.jsx).
  const boosterState = (key) => {
    if (key === 'recharge' && AUTO_RECHARGE_GWS.has(teamPlannerGw)) return 'automatic';
    const usedGw = teamPlannerBoosters[key];
    if (usedGw === teamPlannerGw) return 'active';
    if (usedGw != null) return 'used-elsewhere';
    return 'available';
  };

  // Zolang rechargeDraft niet null is, bewerkt de selectielijst het team ZOALS HET ERUIT ZIET op de
  // bekeken GW; bevestigen zet elke gewijzigde rij om in een transfer op teamPlannerGw.
  const rosterRowsData = rechargeDraft ?? teamPlannerPlayers;

  const handleStartRecharge = () => {
    setRechargeDraft(teamPlannerResolvedPlayers.map(p => ({ name: p.name, teamCode: p.teamCode, price: p.price })));
  };

  const handleConfirmRecharge = () => {
    if (!rechargeDraft || isRechargeInvalid) return;
    rechargeDraft.forEach((draftPlayer, i) => {
      const current = teamPlannerResolvedPlayers[i];
      const changed = draftPlayer.name !== current.name || draftPlayer.teamCode !== current.teamCode;
      if (changed && draftPlayer.name) {
        planTeamPlannerTransfer(i, teamPlannerGw, {
          name: draftPlayer.name, teamCode: draftPlayer.teamCode,
          position: TEAM_PLANNER_SLOT_POSITIONS[i], price: draftPlayer.price ?? null,
        });
      }
    });
    setRechargeDraft(null);
  };

  // Een keuze uit de spelerskiezer: buiten Recharge vult dit de GW1-basisploeg in
  // (updateTeamPlannerPlayer); tijdens Recharge enkel de lokale draft. Zelfde gedrag als de vroegere
  // 15 zoekvelden.
  const applyPick = (slotIndex, selected) => {
    if (rechargeDraft) {
      setRechargeDraft(prev => prev.map((p, i) => (
        i === slotIndex ? { name: selected.name, teamCode: selected.teamCode, price: selected.price ?? '' } : p
      )));
    } else {
      updateTeamPlannerPlayer(slotIndex, 'name', selected.name);
      updateTeamPlannerPlayer(slotIndex, 'teamCode', selected.teamCode);
      updateTeamPlannerPlayer(slotIndex, 'price', selected.price ?? '');
    }
  };

  const clearSlot = (slotIndex) => {
    updateTeamPlannerPlayer(slotIndex, 'name', '');
    updateTeamPlannerPlayer(slotIndex, 'teamCode', '');
    updateTeamPlannerPlayer(slotIndex, 'price', '');
  };

  // Een leeg slot invullen zet de kiezer in "vulmodus": na een keuze springt hij naar het volgende
  // lege slot (eerst dezelfde positie, dan de volgende positie) en blijft hij open, zodat je meerdere
  // spelers na elkaar kiest. Hij sluit pas als alles gevuld is of je op "Klaar" tikt. Een bezet slot
  // vervangen sluit de kiezer na één keuze, zoals voorheen.
  const openPicker = (slotIndex) => {
    if (playerDatabaseError) return;
    setPicker({ index: slotIndex, fill: isEmptySlot(rosterRowsData[slotIndex]), added: [] });
  };

  // Eerste lege slot van een positie, het net gekozen slot niet meegerekend (de state is op dat moment
  // nog niet bijgewerkt).
  const firstEmptySlot = (pos, skipIndex = -1) => rosterRowsData.findIndex(
    (p, i) => i !== skipIndex && TEAM_PLANNER_SLOT_POSITIONS[i] === pos && isEmptySlot(p),
  );

  const handlePick = (selected) => {
    applyPick(picker.index, selected);
    if (!picker.fill) { setPicker(null); return; }
    let next = firstEmptySlot(TEAM_PLANNER_SLOT_POSITIONS[picker.index], picker.index);
    if (next < 0) next = rosterRowsData.findIndex((p, i) => i !== picker.index && isEmptySlot(p));
    if (next < 0) { setPicker(null); return; }
    setPicker({ index: next, fill: true, added: [...picker.added, selected.name] });
  };

  // In vulmodus mag je van positie wisselen zolang die positie nog een leeg slot heeft.
  const pickerPositions = picker?.fill
    ? ['GK', 'DEF', 'MID', 'FWD'].filter(pos => pos === TEAM_PLANNER_SLOT_POSITIONS[picker.index] || firstEmptySlot(pos) >= 0)
    : null;
  const switchPickerPosition = (pos) => {
    const next = firstEmptySlot(pos);
    if (next >= 0) setPicker(prev => ({ ...prev, index: next }));
  };
  const pickerEmptyLeft = picker?.fill
    ? rosterRowsData.filter((p, i) => TEAM_PLANNER_SLOT_POSITIONS[i] === TEAM_PLANNER_SLOT_POSITIONS[picker.index] && isEmptySlot(p)).length
    : 0;

  const openMenu = (event, items, label) => {
    setMenu({ anchor: event.currentTarget.getBoundingClientRect(), items, label });
  };

  const startTransferOut = (slotIndex) => {
    setView('pitch');
    setTransferOutIndex(slotIndex);
    requestAnimationFrame(() => transferRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  const shortLabel = (player) => index.find(player.name, player.teamCode)?.short || player.name;

  // Beschikbaarheid (spec B3) of "niet gevonden" (spec B1). Niet gevonden pas als de databank echt
  // geladen is, anders lijkt even iedereen verdwenen.
  const availability = useAvailabilityLookup();
  const databaseReady = !playerDatabaseLoading && playerDatabase.length > 0;
  const isNotFound = (player) => databaseReady && !!player?.name && !findInDatabase(playerDatabase, player.name, player.teamCode);
  const slotStatus = (player) => (isNotFound(player) ? NOT_FOUND_STATUS : availability(player.name, player.teamCode));

  // Acties voor een slot (veld, bank of lijst). `isBenched` geldt voor de bekeken GW.
  const slotActions = (slotIndex, { fromList = false } = {}) => {
    const resolved = resolvedIndexedPlayers[slotIndex];
    const row = rosterRowsData[slotIndex];
    const filled = !isEmptySlot(resolved);
    const isBenched = benchForGw.includes(slotIndex);
    const items = [];
    if (fromList) {
      items.push({ key: 'replace', label: t('teamPlanner.menu.replace'), onSelect: () => openPicker(slotIndex), disabled: !!playerDatabaseError });
    }
    if (filled && !isBenched) {
      items.push(captainForGw === slotIndex
        ? { key: 'cap', label: t('teamPlanner.menu.removeCaptain'), onSelect: () => setTeamPlannerCaptain(null) }
        : { key: 'cap', label: t('teamPlanner.menu.captain', { gw: teamPlannerGw }), onSelect: () => setTeamPlannerCaptain(slotIndex) });
    }
    if (filled) {
      items.push(isBenched
        ? { key: 'bench', label: t('teamPlanner.menu.toPitch', { gw: teamPlannerGw }), onSelect: () => toggleTeamPlannerBench(slotIndex) }
        : {
            key: 'bench', disabled: isBenchFull, onSelect: () => toggleTeamPlannerBench(slotIndex),
            label: isBenchFull ? t('teamPlanner.menu.toBenchFull') : t('teamPlanner.menu.toBench', { gw: teamPlannerGw }),
          });
    }
    if (filled && !fromList) {
      items.push({ key: 'transfer', label: t('teamPlanner.menu.transferOut'), onSelect: () => startTransferOut(slotIndex) });
    }
    const sheetTarget = fromList ? row : resolved;
    if (onOpenPlayer && sheetTarget?.name && sheetTarget?.teamCode) {
      items.push({ key: 'open', label: t('teamPlanner.menu.openPlayer'), onSelect: () => onOpenPlayer(sheetTarget.name, sheetTarget.teamCode) });
    }
    if (fromList && !rechargeDraft && row?.name) {
      items.push({ key: 'remove', label: t('teamPlanner.menu.remove'), danger: true, onSelect: () => clearSlot(slotIndex) });
    }
    return items;
  };

  // Transfer-tijdlijn gegroepeerd per GW (teamPlannerTransferHistory staat al gesorteerd op GW).
  const transferGroups = [];
  teamPlannerTransferHistory.forEach(entry => {
    const lastGroup = transferGroups[transferGroups.length - 1];
    if (lastGroup && lastGroup.gw === entry.gw) lastGroup.entries.push(entry);
    else transferGroups.push({ gw: entry.gw, entries: [entry] });
  });

  // --- Statusregel ---------------------------------------------------------------------------------
  const squadCount = effectiveRosterList.filter(p => p.name).length;
  const resolvedCount = resolvedIndexedPlayers.filter(p => !isEmptySlot(p)).length;
  const budget = teamPlannerGw > 1 ? teamPlannerTransferBudget[teamPlannerGw] : null;
  const remainingFree = budget ? Math.max(0, budget.freeAvailable - budget.used) : null;
  let formationStatus;
  if (resolvedCount < TEAM_PLANNER_SQUAD_SIZE) {
    formationStatus = <span className="tp-status__muted">{t('teamPlanner.formationIncomplete')}</span>;
  } else if (!isBenchComplete) {
    const need = TEAM_PLANNER_BENCH_SIZE - benchCount;
    formationStatus = <span className="is-danger">{need === 1 ? t('teamPlanner.status.benchNeededOne') : t('teamPlanner.status.benchNeededMany', { count: need })}</span>;
  } else if (!isValidFormation) {
    formationStatus = <span className="is-danger">{t('teamPlanner.status.invalidFormation', { formation: formationLabel })}</span>;
  } else {
    formationStatus = <span>{t('teamPlanner.formation', { formation: formationLabel })}</span>;
  }

  const listRows = rosterRowsData.map((p, i) => ({ ...p, index: i, position: TEAM_PLANNER_SLOT_POSITIONS[i] }));

  const listColumns = [
    {
      key: 'player', label: t('teamPlanner.colPlayer'), rowHeader: true, sticky: true, stickyEdge: true,
      render: (row) => (isEmptySlot(row) ? (
        <button type="button" className="tp-emptyslot" onClick={() => openPicker(row.index)} disabled={!!playerDatabaseError}>
          {t('teamPlanner.emptySlotShort', { position: row.position })}
        </button>
      ) : (
        <PlayerCell
          byName
          name={row.name}
          short={shortLabel(row)}
          clubCode={row.teamCode}
          price={row.price}
          subDesktop={false}
          badges={(
            <>
              {!rechargeDraft && captainForGw === row.index && !benchForGw.includes(row.index) && (
                <Badge tone="accent" title={t('teamPlanner.captain')}>{isTripleCaptainActive ? '3×C' : 'C'}</Badge>
              )}
              {!rechargeDraft && benchForGw.includes(row.index) && <span className="tp-benchtag">{t('teamPlanner.benchTag')}</span>}
              {isNotFound(row) && <Badge tone="outline" title={t('teamPlanner.notFoundTitle')}>{t('teamPlanner.notFound')}</Badge>}
            </>
          )}
        />
      )),
    },
    {
      key: 'club', label: t('teamPlanner.colClub'), className: 'tp-col-desktop',
      render: row => row.teamCode || null,
      cellClass: row => (row.teamCode && overCapClubCodes.has(row.teamCode) ? 'tp-danger-text' : ''),
    },
    { key: 'price', label: t('teamPlanner.colPriceEuro'), num: true, className: 'tp-col-desktop', render: row => (hasPrice(row.price) ? formatPrice(row.price) : null) },
    {
      key: 'next', label: `GW${teamPlannerGw}`, className: 'tp-col-fix',
      render: row => (row.teamCode ? (
        <MiniFixtureBadge teamCode={row.teamCode} fixture={FIXTURES[row.teamCode]?.[teamPlannerGw - 1]} gwNumber={teamPlannerGw} ratings={ratings} homeAdvantage={homeAdvantage} />
      ) : null),
      blankWhenEmpty: true,
    },
    {
      key: 'menu', label: <span className="ui-sr-only">{t('teamPlanner.colActions')}</span>, className: 'tp-col-menu', blankWhenEmpty: true,
      render: row => (
        <Button
          variant="icon" size="sm" bare icon={MoreHorizontal}
          aria-haspopup="menu"
          aria-label={t('teamPlanner.slotMenuAria', { name: row.name || t('teamPlanner.emptySlotShort', { position: row.position }) })}
          onClick={(e) => openMenu(e, slotActions(row.index, { fromList: true }), row.name || row.position)}
        />
      ),
    },
  ];

  const transferColumns = [
    {
      key: 'out', label: t('teamPlanner.transferCol.out'), rowHeader: true,
      render: e => <PlayerCell byName name={e.outPlayer.name || '—'} short={shortLabel(e.outPlayer)} clubCode={e.outPlayer.teamCode} price={e.outPlayer.price} />,
    },
    { key: 'arrow', label: <span className="ui-sr-only">→</span>, className: 'tp-col-arrow', render: () => <span aria-hidden="true">→</span> },
    {
      key: 'in', label: t('teamPlanner.transferCol.in'),
      render: e => <PlayerCell byName name={e.inPlayer.name} short={shortLabel(e.inPlayer)} clubCode={e.inPlayer.teamCode} price={e.inPlayer.price} />,
    },
    {
      key: 'diff', label: t('teamPlanner.transferCol.diff'), title: t('teamPlanner.transferCol.diffTitle'), num: true,
      render: e => {
        if (!hasPrice(e.inPlayer.price) || !hasPrice(e.outPlayer.price)) return null;
        const diff = Number(e.inPlayer.price) - Number(e.outPlayer.price);
        return `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${Math.abs(diff).toFixed(1)}`;
      },
    },
    {
      key: 'remove', label: <span className="ui-sr-only">{t('teamPlanner.colActions')}</span>, className: 'tp-col-menu',
      render: e => (
        <Button
          variant="icon" size="sm" bare icon={X}
          onClick={() => removeTeamPlannerTransfer(e.slotIndex, e.id)}
          aria-label={t('teamPlanner.removeTransferAria', { out: e.outPlayer.name, in: e.inPlayer.name })}
        />
      ),
    },
  ];

  const pickerRow = picker ? rosterRowsData[picker.index] : null;
  const pickerBlocked = useCallback((candidate) => {
    if (!picker) return null;
    const others = rosterRowsData.filter((p, i) => i !== picker.index && p.name);
    if (others.some(u => isSamePlayer(u, candidate))) return t('picker.reasonInTeam');
    const sameClub = others.filter(u => u.teamCode === candidate.teamCode).length;
    if (sameClub >= TEAM_PLANNER_MAX_PER_CLUB) return t('picker.reasonClubLimit', { max: TEAM_PLANNER_MAX_PER_CLUB });
    return null;
  }, [picker, rosterRowsData, t]);

  const renderSlot = (player, { benched = false } = {}) => {
    const isCaptain = !benched && captainForGw === player.index;
    if (isEmptySlot(player)) {
      return (
        <PitchSlot
          key={player.index}
          player={player}
          gw={teamPlannerGw}
          onClick={() => openPicker(player.index)}
          disabled={!!playerDatabaseError}
          ariaLabel={t('teamPlanner.emptySlot', { position: player.position })}
        />
      );
    }
    const reorder = benched && isBenchReorderMode;
    const isGk = player.position === 'GK';
    const classes = [
      reorder && !isGk && 'is-swappable',
      reorder && benchSwapSlot === player.index && 'is-selected',
      benched && isBenchBoostActive && 'is-boosted',
    ].filter(Boolean).join(' ');
    return (
      <PitchSlot
        key={player.index}
        player={player}
        label={shortLabel(player)}
        gw={teamPlannerGw}
        ratings={ratings}
        homeAdvantage={homeAdvantage}
        captainGlyph={isCaptain ? (isTripleCaptainActive ? '3×C' : 'C') : null}
        status={slotStatus(player)}
        className={classes}
        disabled={reorder && isGk}
        title={reorder && isGk ? t('teamPlanner.reorderGkDisabled') : undefined}
        ariaLabel={reorder
          ? t('teamPlanner.swapAria', { name: player.name })
          : t('teamPlanner.slotAria', { name: player.name, position: player.position })}
        onClick={reorder
          ? () => handleSelectForSwap(player.index)
          : (e) => openMenu(e, slotActions(player.index), player.name)}
      />
    );
  };

  return (
    <>
      <PageHeader title={t('teamPlanner.pageTitle')} intro={t('teamPlanner.introShort')} />

      <TeamScreenshotUpload
        t={t}
        playerDatabase={playerDatabase}
        playerDatabaseLoading={playerDatabaseLoading}
        playerDatabaseError={playerDatabaseError}
        updateTeamPlannerPlayer={updateTeamPlannerPlayer}
        setTeamPlannerCaptain={setTeamPlannerCaptain}
        teamPlannerGw={teamPlannerGw}
        isRosterEmpty={isRosterEmpty}
        extraActions={!isRosterEmpty && (
          <Button variant="danger" size="sm" icon={Trash2} onClick={handleClearTeamPlanner}>{t('teamPlanner.clearTeam')}</Button>
        )}
      />

      {playerDatabaseLoading && (
        <p className="tp-loading" role="status"><Loader2 className="fdr-spin" aria-hidden="true" /> {t('teamPlanner.loadingDb')}</p>
      )}
      {!playerDatabaseLoading && playerDatabaseError && (
        <ErrorBanner onRetry={fetchPlayerDatabase} retryLabel={t('shared.retry')}>{t(playerDatabaseError)}</ErrorBanner>
      )}

      {/* Statusregel (spec §7.3): vervangt de vroegere pillen. Sticky onder de topbalk. */}
      <div className="tp-status" aria-label={t('teamPlanner.status.aria')}>
        <span>{t('teamPlanner.status.squad', { count: squadCount, total: TEAM_PLANNER_SQUAD_SIZE })}</span>
        <span className={isOverBudget ? 'is-danger' : undefined}>
          {t('teamPlanner.status.bank')} <span className="num">{remainingBudget < 0 ? '−' : ''}€{Math.abs(remainingBudget).toFixed(1)}M</span>
        </span>
        {budget && (
          <span>
            {budget.isRecharge
              ? t('teamPlanner.rechargeFree')
              : (
                <>
                  <span className="tp-status__full">{t(remainingFree === 1 ? 'teamPlanner.freeTransfer' : 'teamPlanner.freeTransfers', { count: remainingFree })}</span>
                  <span className="tp-status__short">{t('teamPlanner.status.freeShort', { count: remainingFree })}</span>
                </>
              )}
          </span>
        )}
        {budget?.pointsCost > 0 && (
          <TooltipTrigger
            as="span"
            className="is-danger tp-status__tip"
            text={t('teamPlanner.status.costTip', { used: budget.used, free: Math.min(budget.used, budget.freeAvailable) })}
          >
            {t('teamPlanner.pointsCost', { cost: budget.pointsCost })}
          </TooltipTrigger>
        )}
        {formationStatus}
        {overCapClubs.length > 0 && (
          <span className="is-danger">
            {t('teamPlanner.overCapClubs', { max: TEAM_PLANNER_MAX_PER_CLUB, clubs: overCapClubs.map(([code, count]) => `${teamNameFor(code)} (${count})`).join(', ') })}
          </span>
        )}
      </div>

      <Segmented
        className="tp-viewswitch"
        ariaLabel={t('teamPlanner.viewAria')}
        value={view}
        onChange={setView}
        options={[
          { value: 'pitch', label: t('teamPlanner.view.pitch') },
          { value: 'list', label: t('teamPlanner.view.list') },
          { value: 'transfers', label: t('teamPlanner.view.transfers') },
        ]}
      />

      <div className="tp-layout">
        <section className={`tp-panel tp-panel--pitch${view !== 'pitch' ? ' is-hidden-narrow' : ''}`} aria-label={t('teamPlanner.pitchAria', { gw: teamPlannerGw })}>
          <div className="tp-gwbar">
            <Button variant="icon" icon={ChevronLeft} onClick={handleTeamPlannerGwPrev} disabled={teamPlannerGw <= 1} aria-label={t('teamPlanner.prevGwAria')} />
            <span className="tp-gwbar__gw num">GW{teamPlannerGw}</span>
            <Button variant="icon" icon={ChevronRight} onClick={handleTeamPlannerGwNext} disabled={teamPlannerGw >= GW_COUNT} aria-label={t('teamPlanner.nextGwAria')} />
            {/* De topbalk toont al de deadline van CURRENT_GW; hier enkel voor een andere GW. */}
            {teamPlannerGw !== CURRENT_GW && GW_DEADLINES[teamPlannerGw] && (
              <span className="tp-gwbar__meta">{t('teamPlanner.deadline', { value: GW_DEADLINES[teamPlannerGw] })}</span>
            )}
          </div>

          <div className="tp-boosters" role="group" aria-label={t('teamPlanner.boosters')}>
            <BoosterButton
              t={t}
              label={t('teamPlanner.booster.benchBoost.label')}
              description={t('teamPlanner.booster.benchBoost.description')}
              state={boosterState('benchBoost')}
              usedGw={teamPlannerBoosters.benchBoost}
              gw={teamPlannerGw}
              onClick={() => toggleTeamPlannerBooster('benchBoost', teamPlannerGw)}
            />
            <BoosterButton
              t={t}
              label={t('teamPlanner.booster.tripleCaptain.label')}
              description={t('teamPlanner.booster.tripleCaptain.description')}
              state={boosterState('tripleCaptain')}
              usedGw={teamPlannerBoosters.tripleCaptain}
              gw={teamPlannerGw}
              onClick={() => toggleTeamPlannerBooster('tripleCaptain', teamPlannerGw)}
            />
            <BoosterButton
              t={t}
              label={t('teamPlanner.booster.recharge.label')}
              description={AUTO_RECHARGE_GWS.has(teamPlannerGw)
                ? t('teamPlanner.booster.recharge.autoDescription', { gw: teamPlannerGw })
                : t('teamPlanner.booster.recharge.description')}
              state={boosterState('recharge')}
              usedGw={teamPlannerBoosters.recharge}
              gw={teamPlannerGw}
              onClick={handleActivateRecharge}
            />
          </div>

          {AUTO_RECHARGE_GWS.has(teamPlannerGw) && <p className="tp-note">{t('teamPlanner.autoRechargeNote', { gw: teamPlannerGw })}</p>}
          {isTripleCaptainActive && <p className="tp-note is-accent">{t('teamPlanner.tripleCaptainActive', { gw: teamPlannerGw })}</p>}
          {isRechargeActiveForGw && <p className="tp-note is-warning">{t('teamPlanner.rechargeActiveEditAbove', { gw: teamPlannerGw })}</p>}
          {isBenchComplete && hasFullStartingXi && !isValidFormation && (
            <p className="tp-note is-danger">{t('teamPlanner.invalidFormation', { formation: formationLabel, gk: gkCount })}</p>
          )}

          <TransferPanel
            t={t}
            gw={teamPlannerGw}
            resolvedIndexedPlayers={resolvedIndexedPlayers}
            playerDatabase={playerDatabase}
            playerDatabaseLoading={playerDatabaseLoading}
            playerDatabaseError={playerDatabaseError}
            onConfirm={planTeamPlannerTransfer}
            externalOutIndex={transferOutIndex}
            onExternalOutIndexConsumed={consumeTransferOut}
            onOpenChange={setIsTransferPanelOpen}
            panelRef={transferRef}
          />

          <div className="tp-pitch">
            {PITCH_ROW_ORDER.map(pos => (
              <div key={pos} className="tp-pitch__row">
                {resolvedIndexedPlayers
                  .filter(p => p.position === pos && !benchForGw.includes(p.index))
                  .map(p => renderSlot(p))}
              </div>
            ))}
          </div>

          <div className="tp-bench">
            <div className="tp-bench__head">
              <h3 className="label tp-bench__title">{t('teamPlanner.benchDash', { gw: teamPlannerGw })}</h3>
              {isBenchBoostActive && <span className="tp-note is-accent">{t('teamPlanner.benchBoostActive', { gw: teamPlannerGw })}</span>}
            </div>
            {isBenchReorderMode && (
              <p className="tp-note is-accent" role="status">
                <strong>{t('teamPlanner.reorderModeActive')}.</strong>{' '}
                {benchSwapSlot === null ? t('teamPlanner.reorderModeHintFirst') : t('teamPlanner.reorderModeHintSecond')}
              </p>
            )}
            {benchPlayers.length === 0 ? (
              <p className="tp-note">{t('teamPlanner.emptyBench')}</p>
            ) : (
              <div className="tp-bench__row">{benchPlayers.map(p => renderSlot(p, { benched: true }))}</div>
            )}
            <div className="tp-bench__actions">
              <Button variant="secondary" size="sm" icon={Wand2} onClick={handleOptimizeTeamPlannerLineup}>{t('teamPlanner.optimizeLineup')}</Button>
              <Button
                variant="secondary" size="sm" icon={ArrowUpDown}
                aria-pressed={isBenchReorderMode}
                disabled={benchOutfieldPlayers.length < 2}
                onClick={() => setIsBenchReorderMode(o => !o)}
              >
                {isBenchReorderMode ? t('teamPlanner.reorderBenchDone') : t('teamPlanner.reorderBench')}
              </Button>
              {benchOutfieldPlayers.length < 2 && <span className="tp-note tp-note--inline">{t('teamPlanner.reorderBenchMinPlayers')}</span>}
            </div>
            {teamPlannerOptimized && <p className="tp-note is-accent">{t('teamPlanner.lineupOptimized', { gw: teamPlannerGw })}</p>}
          </div>
        </section>

        <div className="tp-side">
          <section ref={listRef} className={`tp-panel tp-panel--list${view !== 'list' ? ' is-hidden-narrow' : ''}`} aria-labelledby="tp-list-title">
            <div className="tp-panel__head">
              <h2 id="tp-list-title" className="tp-panel__title">{t('teamPlanner.selection')}</h2>
            </div>

            {/* Recharge-booster: laat de gebruiker het volledige team op de bekeken GW herbewerken
                via deze lijst (rechargeDraft/handleConfirmRecharge hierboven). */}
            {isRechargeActiveForGw && (
              <div className="tp-recharge" role="status">
                <p>{t('teamPlanner.rechargeActive', { gw: teamPlannerGw, editingSuffix: rechargeDraft ? t('teamPlanner.rechargeActiveEditingSuffix') : '' })}</p>
                {rechargeDraft === null ? (
                  <Button variant="secondary" size="sm" onClick={handleStartRecharge}>{t('teamPlanner.startEditing')}</Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" onClick={handleConfirmRecharge} disabled={isRechargeInvalid}>{t('teamPlanner.confirmRecharge')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => setRechargeDraft(null)}>{t('teamPlanner.cancel')}</Button>
                  </>
                )}
              </div>
            )}

            {!rechargeDraft && teamPlannerTransferHistory.length > 0 && (
              <p className="tp-note">{t('teamPlanner.listBaseNote')}</p>
            )}

            <DataTable
              className="tp-list"
              ariaLabel={t('teamPlanner.selection')}
              columns={listColumns}
              rows={listRows}
              rowKey={row => row.index}
              groupBy={row => row.position}
              renderGroup={(pos, items) => (
                <span className="tp-group">{pos} <span className="num">{items.filter(r => r.name).length}/{items.length}</span></span>
              )}
              onRowClick={row => {
                if (isEmptySlot(row)) openPicker(row.index);
                else if (onOpenPlayer && row.name && row.teamCode) onOpenPlayer(row.name, row.teamCode);
              }}
              rowLabel={row => (isEmptySlot(row) ? t('teamPlanner.emptySlot', { position: row.position }) : t('playerSheet.openAria', { name: row.name }))}
              rowClassName={row => (row.teamCode && overCapClubCodes.has(row.teamCode) ? 'tp-row-overcap' : undefined)}
            />
          </section>

          <section className={`tp-panel tp-panel--transfers${view !== 'transfers' ? ' is-hidden-narrow' : ''}`}>
            <div className="tp-panel__head tp-panel__head--toggle">
              <div className="tp-grow">
                <SectionHeader
                  title={t('teamPlanner.transfers')}
                  meta={transferGroups.length === 0 ? null
                    : transferGroups.length === 1 ? t('teamPlanner.transfersMetaOne', { gw: transferGroups[0].gw })
                    : t('teamPlanner.transfersMeta', { from: transferGroups[0].gw, to: transferGroups[transferGroups.length - 1].gw })}
                  sectionKey="teamPlannerTransfers"
                  isOpen={openSections.teamPlannerTransfers}
                  onToggle={toggleSection}
                />
              </div>
              <Button variant="danger" size="sm" icon={Trash2} onClick={handleClearTeamPlannerTransfers} disabled={transferGroups.length === 0}>
                {t('teamPlanner.clearAllTransfers')}
              </Button>
            </div>
            {openSections.teamPlannerTransfers && (
              <div id="fdr-section-teamPlannerTransfers">
                {transferGroups.length === 0 ? (
                  <EmptyState>{t('teamPlanner.emptyTransfers')}</EmptyState>
                ) : transferGroups.map(group => {
                  const groupBudget = teamPlannerTransferBudget[group.gw];
                  return (
                    <div key={group.gw} className="tp-tgroup">
                      <h3 className="tp-tgroup__title">
                        <span className="num">GW{group.gw}</span>
                        {/* Zelfde regel als de transfer-budgetberekening: handmatige Recharge of een
                            automatische Recharge-GW. */}
                        {isRechargeActiveForGwRule(teamPlannerBoosters, group.gw) && <span className="tp-tgroup__meta">Recharge</span>}
                        {groupBudget?.pointsCost > 0 && (
                          <span
                            className="tp-tgroup__meta is-danger"
                            title={t('teamPlanner.status.costTip', { used: groupBudget.used, free: Math.min(groupBudget.used, groupBudget.freeAvailable) })}
                          >
                            {t('teamPlanner.pointsCost', { cost: groupBudget.pointsCost })}
                          </span>
                        )}
                      </h3>
                      <DataTable
                        className="tp-transfers"
                        ariaLabel={`${t('teamPlanner.transfers')} GW${group.gw}`}
                        columns={transferColumns}
                        rows={group.entries}
                        rowKey={e => e.id}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>

      {menu && <ActionMenu anchor={menu.anchor} items={menu.items} label={t('teamPlanner.slotMenuAria', { name: menu.label })} onClose={closeMenu} />}

      {picker && (
        <PlayerPicker
          t={t}
          onClose={() => setPicker(null)}
          onSelect={handlePick}
          players={playerDatabase}
          loading={playerDatabaseLoading}
          position={TEAM_PLANNER_SLOT_POSITIONS[picker.index]}
          switchablePositions={pickerPositions}
          onSwitchPosition={switchPickerPosition}
          added={picker.fill ? picker.added : null}
          emptyLeft={pickerEmptyLeft}
          blockedReason={pickerBlocked}
          budgetMax={remainingBudget + (parseFloat(pickerRow?.price) || 0)}
          gw={teamPlannerGw}
          ratings={ratings}
          homeAdvantage={homeAdvantage}
          isWatched={isPlayerWatched}
          onToggleWatch={toggleWatchlistPlayer}
        />
      )}
    </>
  );
}
