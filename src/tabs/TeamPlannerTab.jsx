// Inhoud van de Team Planner-tab (spec §7.3, FUNCTIONALITEIT_SPEC fase C): het veld eerst, de lijst
// tweede. Alle state en regels zitten in useTeamPlanner.js (via de prop `planner`); hier staat enkel
// voorbijgaande UI-state: de weergave op gsm, het open "⋯"-menu, de open spelerskiezer, de
// wisselmodus, de modus "Startteam bewerken" en het open venster voor budget en gratis transfers.
//
// Twee toestanden:
// - Starttoestand (team nog niet compleet, of "Startteam bewerken"): je vult het startteam in. Geen
//   transfers, boosters of speeldagpijlen (C8).
// - Planner: het team van de bekeken speeldag. Tik op een speler voor Wissel, Transfer, Kapitein,
//   Vice-kapitein of de spelerskaart. Elke wijziging neemt over naar de volgende speeldagen (C2).
//
// Opbouw: desktop (≥1100px) twee kolommen (60/40): links speeldag, boosters, veld en bank; rechts de
// selectielijst en de transfers. Gsm: een sticky statusregel en Veld | Lijst | Transfers.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X, Wand2, Trash2, MoreHorizontal, Pencil } from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT, GW_DEADLINES, CURRENT_GW,
  TEAM_PLANNER_BUDGET, TEAM_PLANNER_MAX_PER_CLUB, TEAM_PLANNER_SQUAD_SIZE, TEAM_PLANNER_SLOT_POSITIONS,
  TEAM_PLANNER_FREE_TRANSFER_CAP, isRechargeActiveForGw, AUTO_RECHARGE_GWS,
} from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { TooltipTrigger } from '../components/Tooltip';
import { SectionHeader } from '../components/SectionHeader';
import { UpcomingFixtures } from '../components/SpelersParts';
import { FORM_GWS, formAverage, formatForm } from '../spelers';
import { TeamScreenshotUpload } from './TeamScreenshotUpload';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Segmented from '../ui/Segmented';
import Select from '../ui/Select';
import DataTable from '../ui/DataTable';
import PlayerCell from '../ui/PlayerCell';
import ActionMenu from '../ui/ActionMenu';
import Sheet from '../components/Sheet';
import PlayerPicker from '../ui/PlayerPicker';
import ErrorBanner, { Notice } from '../ui/ErrorBanner';
import EmptyState from '../ui/EmptyState';
import usePlayerIndex from '../data/usePlayerIndex';
import { findInDatabase } from '../data/playerDatabase';
import { AvailabilityMini } from '../ui/AvailabilityMark';
import { useAvailabilityLookup } from '../availabilityContext';
import { isEmptySlot } from '../teamPlanner';
import './TeamPlannerTab.css';

// Veldvolgorde: GK bovenaan, FWD onderaan, zoals de echte FPL-app.
const PITCH_ROW_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

function hasPrice(price) {
  return price != null && price !== '' && Number.isFinite(Number(price));
}

function formatPrice(price) {
  return hasPrice(price) ? `€${Number(price).toFixed(1)}` : '—';
}

const formatMoney = (value) => `${value < 0 ? '−' : ''}€${Math.abs(value).toFixed(1)}M`;

function teamNameFor(teamCode) {
  return TEAMS.find(t => t.code === teamCode)?.name ?? teamCode;
}

// Booster als secondary-knop (spec §7.3). Actief in deze GW = omgekeerd (aria-pressed). Al gebruikt in
// een andere GW = uitgeschakeld met "gebruikt in GW9". 'automatic' = de gratis Recharge op
// AUTO_RECHARGE_GWS: opgelicht maar niet klikbaar.
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

// Een speler die niet (meer) in de spelersdatabank staat, krijgt een klein label in plaats van te
// verdwijnen (spec B1). Zelfde vorm als een beschikbaarheidsstatus, zodat AvailabilityMini hem toont.
const NOT_FOUND_STATUS = { kind: 'notFound', tone: 'outline', labelKey: 'teamPlanner.notFound', titleKey: 'teamPlanner.notFoundTitle', vars: {} };

// Eén slot op het veld of de bank (spec §5.13): shirt, naamlabel, MiniFixture voor de bekeken GW. Een
// leeg slot is een gestippeld kader met het positielabel.
function PitchSlot({ player, label, gw, ratings, homeAdvantage, roleGlyph = null, roleTone = 'accent', status = null, onClick, ariaLabel, className = '', disabled }) {
  if (isEmptySlot(player)) {
    return (
      <button type="button" className={`tp-slot is-empty ${className}`} onClick={onClick} aria-label={ariaLabel} disabled={disabled}>
        <span className="tp-slot__frame">{player.position}</span>
      </button>
    );
  }
  const fixture = player.teamCode ? FIXTURES[player.teamCode]?.[gw - 1] : null;
  return (
    <button type="button" className={`tp-slot ${className}`} onClick={onClick} aria-label={ariaLabel} disabled={disabled}>
      <span className="tp-slot__shirt">
        {player.teamCode && (
          <img src={`/club-shirts/${player.teamCode}.webp`} alt="" width="40" height="40" loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} />
        )}
        {roleGlyph && <Badge tone={roleTone} className="tp-slot__cap">{roleGlyph}</Badge>}
        <AvailabilityMini status={status} className="tp-slot__avail" />
      </span>
      <span className="tp-slot__name">{label || player.name || '—'}</span>
      <span className="tp-slot__fix">
        <MiniFixtureBadge teamCode={player.teamCode} fixture={fixture} gwNumber={gw} ratings={ratings} homeAdvantage={homeAdvantage} />
      </span>
    </button>
  );
}

// "Klopt niet? Pas aan" (C1): budget en gratis transfers aan het begin van een speeldag. Enkel wat de
// bezoeker wijzigt (of al eerder zelf invulde), wordt bewaard; de rest blijft berekend.
function CalibrationPanel({ t, gw, values, ownFields, onSave, onReset, onCancel }) {
  const [bank, setBank] = useState(values.bank != null ? values.bank.toFixed(1) : '');
  const [free, setFree] = useState(values.freeTransfers != null ? String(values.freeTransfers) : '1');
  const bankNumber = Number(String(bank).replace(',', '.'));
  const bankValid = bank !== '' && Number.isFinite(bankNumber) && bankNumber >= 0 && bankNumber <= TEAM_PLANNER_BUDGET;

  const handleSave = (e) => {
    e.preventDefault();
    if (!bankValid) return;
    const next = {};
    const roundedBank = Math.round(bankNumber * 10) / 10;
    if (ownFields.bank || roundedBank !== values.bank) next.bank = roundedBank;
    if (values.hasFreeTransfers && (ownFields.freeTransfers || Number(free) !== values.freeTransfers)) next.freeTransfers = Number(free);
    onSave(next);
  };

  return (
    <form className="tp-calib" onSubmit={handleSave} aria-labelledby="tp-calib-title">
      <h2 id="tp-calib-title" className="tp-calib__title">{t('teamPlanner.calib.title', { gw })}</h2>
      <p className="tp-note">{t('teamPlanner.calib.hint')}</p>
      <div className="tp-calib__fields">
        <label className="tp-field">
          <span className="label">{t('teamPlanner.calib.bank')}</span>
          <input
            className="ui-input ui-input--plain num"
            type="text"
            inputMode="decimal"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            aria-invalid={!bankValid}
            autoFocus
          />
        </label>
        {values.hasFreeTransfers && (
          <label className="tp-field">
            <span className="label">{t('teamPlanner.calib.free')}</span>
            <Select
              value={free}
              onChange={setFree}
              options={Array.from({ length: TEAM_PLANNER_FREE_TRANSFER_CAP + 1 }, (_, n) => ({ value: String(n), label: String(n) }))}
            />
          </label>
        )}
      </div>
      {!bankValid && <p className="tp-warn">{t('teamPlanner.calib.invalid', { max: TEAM_PLANNER_BUDGET })}</p>}
      <div className="tp-calib__actions">
        <Button variant="primary" size="sm" type="submit" disabled={!bankValid}>{t('teamPlanner.calib.save')}</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>{t('teamPlanner.cancel')}</Button>
        {values.custom && <Button variant="ghost" size="sm" onClick={onReset}>{t('teamPlanner.calib.reset')}</Button>}
      </div>
    </form>
  );
}

// Lade "Wie gaat eruit?" (spec E2): de speler van de spelerskaart komt binnen, jij kiest wie vertrekt.
// Enkel spelers op dezelfde positie; wie niet kan (budget, clublimiet, ...), staat gedimd met de reden
// (dezelfde regels als de transferkiezer, useTeamPlanner.transferBlocker).
function IncomingSheet({ t, planner, shortLabel }) {
  const { incoming, gw, team } = planner;
  const options = TEAM_PLANNER_SLOT_POSITIONS
    .map((position, slot) => ({ position, slot, player: team[slot] }))
    .filter(o => o.position === incoming.position && o.player?.name)
    .map(o => ({ ...o, reason: planner.transferBlocker(o.slot)(incoming) }));
  const incomingPrice = hasPrice(incoming.price) ? formatPrice(incoming.price) : null;
  return (
    <Sheet
      titleId="tp-incoming-title"
      title={t('teamPlanner.incoming.title', { gw })}
      closeLabel={t('infoModal.close')}
      onClose={planner.cancelIncoming}
      footer={<Button variant="secondary" size="sm" onClick={planner.cancelIncoming}>{t('teamPlanner.incoming.cancel')}</Button>}
    >
      <div className="tp-incoming__in">
        <span className="tp-incoming__label">{t('teamPlanner.transferCol.in')}</span>
        <PlayerCell byName name={incoming.name} short={shortLabel(incoming)} clubCode={incoming.teamCode} price={incoming.price} />
      </div>
      <p className="tp-note">{t('teamPlanner.incoming.intro', { name: shortLabel(incoming), price: incomingPrice ?? '—' })}</p>
      <ul className="tp-incoming" aria-labelledby="tp-incoming-title">
        {options.map(({ slot, player, reason }) => (
          <li key={slot}>
            <button
              type="button"
              className={`tp-incoming__row${reason ? ' is-blocked' : ''}`}
              disabled={Boolean(reason)}
              onClick={() => planner.transferIncoming(slot)}
              aria-label={reason
                ? t('teamPlanner.incoming.blockedAria', { name: shortLabel(player), reason })
                : t('teamPlanner.incoming.outAria', { out: shortLabel(player), in: shortLabel(incoming), gw })}
            >
              <PlayerCell byName name={player.name} short={shortLabel(player)} clubCode={player.teamCode} price={player.price} />
              <span className="tp-incoming__state">{reason ?? t('teamPlanner.incoming.out')}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export default function TeamPlannerTab({
  t, onOpenPlayer, ratings, homeAdvantage, openSections, toggleSection,
  planner, playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
  isPlayerWatched, toggleWatchlistPlayer,
}) {
  const index = usePlayerIndex();
  const p = planner.planner;
  const [view, setView] = useState('pitch');
  const [menu, setMenu] = useState(null); // { anchor, items, label }
  // { mode: 'fill' | 'replace' | 'transfer', index, added }
  const [picker, setPicker] = useState(null);
  const [swapFrom, setSwapFrom] = useState(null);
  const [editStart, setEditStart] = useState(false);
  const [calibGw, setCalibGw] = useState(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  // Starttoestand: het startteam invullen of rechtzetten. Daarbuiten: het team van de bekeken GW.
  const baseMode = editStart || !planner.complete;
  const gw = baseMode ? planner.startGw : planner.gw;
  const displayTeam = useMemo(
    () => (baseMode ? p.players.map((player, i) => ({ ...player, index: i })) : planner.team),
    [baseMode, p.players, planner.team],
  );
  const lineup = baseMode ? planner.startLineup : planner.lineup;
  const bench = lineup.bench;

  // Wisselmodus stopt bij een andere speeldag, een andere toestand of Escape (C3).
  useEffect(() => { setSwapFrom(null); }, [planner.gw, baseMode]);
  useEffect(() => {
    if (swapFrom === null) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setSwapFrom(null); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [swapFrom]);
  const swapTargets = useMemo(
    () => (swapFrom === null ? new Set() : planner.swapTargets(swapFrom)),
    // planner.swapTargets hangt af van de opstelling van de bekeken GW
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [swapFrom, planner.lineup, p.players],
  );

  const shortLabel = (player) => index.find(player.name, player.teamCode)?.short || player.name;

  // Beschikbaarheid (spec B3) of "niet gevonden" (spec B1). Niet gevonden pas als de databank echt
  // geladen is, anders lijkt even iedereen verdwenen.
  const availability = useAvailabilityLookup();
  const databaseReady = !playerDatabaseLoading && playerDatabase.length > 0;
  const isNotFound = (player) => databaseReady && !!player?.name && !findInDatabase(playerDatabase, player.name, player.teamCode);
  const slotStatus = (player) => (isNotFound(player) ? NOT_FOUND_STATUS : availability(player.name, player.teamCode));

  const isBenchBoostActive = p.boosters.benchBoost === gw;
  const isTripleCaptainActive = p.boosters.tripleCaptain === gw;
  const isRecharge = isRechargeActiveForGw(p.boosters, gw);
  const boosterState = (key) => {
    if (key === 'recharge' && AUTO_RECHARGE_GWS.has(gw)) return 'automatic';
    const usedGw = p.boosters[key];
    if (usedGw === gw) return 'active';
    if (usedGw != null) return 'used-elsewhere';
    return 'available';
  };

  // --- Startteam: budget en clublimiet van de ingevulde spelers -----------------------------------
  const baseClubCounts = useMemo(() => {
    const counts = {};
    p.players.forEach(player => { if (player.teamCode && player.name) counts[player.teamCode] = (counts[player.teamCode] ?? 0) + 1; });
    return counts;
  }, [p.players]);
  const overCapClubs = baseMode ? Object.entries(baseClubCounts).filter(([, count]) => count > TEAM_PLANNER_MAX_PER_CLUB) : [];
  const overCapClubCodes = new Set(overCapClubs.map(([code]) => code));
  const baseBank = p.startBank ?? (TEAM_PLANNER_BUDGET - planner.startValue);

  // --- Statusregel: budget, gratis transfers en kosten van de bekeken GW (C1) -----------------------
  const bankInfo = planner.bankByGw[gw];
  const bankShown = baseMode ? baseBank : (bankInfo?.end ?? baseBank);
  const budget = baseMode ? null : planner.transferBudget[gw];
  const remainingFree = budget ? Math.max(0, budget.freeAvailable - budget.used) : null;
  const squadCount = p.players.filter(player => player.name).length;
  const checkGw = Math.max(planner.startGw, CURRENT_GW);
  const showCheck = planner.complete && !baseMode && !p.checkConfirmed && calibGw === null;

  const openCalibration = (g) => {
    setCalibGw(g);
    if (g !== planner.gw) planner.goTo(g);
  };
  const ownFieldsAt = (g) => (g === planner.startGw
    ? { bank: p.startBank !== null, freeTransfers: planner.startGw > 1 }
    : { bank: 'bank' in (p.checkpoints[g] ?? {}), freeTransfers: 'freeTransfers' in (p.checkpoints[g] ?? {}) });

  // --- Spelerskiezer ------------------------------------------------------------------------------
  const firstEmptySlot = (pos, skipIndex = -1) => p.players.findIndex(
    (player, i) => i !== skipIndex && TEAM_PLANNER_SLOT_POSITIONS[i] === pos && isEmptySlot(player),
  );
  const openFillPicker = (slot) => {
    if (playerDatabaseError) return;
    setPicker({ mode: isEmptySlot(p.players[slot]) ? 'fill' : 'replace', index: slot, added: [] });
  };
  const openTransferPicker = (slot) => {
    if (playerDatabaseError) return;
    setPicker({ mode: 'transfer', index: slot, added: [] });
  };

  const handlePick = (selected) => {
    if (picker.mode === 'transfer') {
      planner.transfer(picker.index, selected);
      setPicker(null);
      return;
    }
    planner.fillSlot(picker.index, selected);
    if (picker.mode !== 'fill') { setPicker(null); return; }
    // Vulmodus: door naar het volgende lege vak (eerst dezelfde positie), tot alles gevuld is.
    let next = firstEmptySlot(TEAM_PLANNER_SLOT_POSITIONS[picker.index], picker.index);
    if (next < 0) next = p.players.findIndex((player, i) => i !== picker.index && isEmptySlot(player));
    if (next < 0) { setPicker(null); return; }
    setPicker({ mode: 'fill', index: next, added: [...picker.added, selected.name] });
  };

  const pickerPositions = picker?.mode === 'fill'
    ? PITCH_ROW_ORDER.filter(pos => pos === TEAM_PLANNER_SLOT_POSITIONS[picker.index] || firstEmptySlot(pos) >= 0)
    : null;
  const switchPickerPosition = (pos) => {
    const next = firstEmptySlot(pos);
    if (next >= 0) setPicker(prev => ({ ...prev, index: next }));
  };
  const pickerEmptyLeft = picker?.mode === 'fill'
    ? p.players.filter((player, i) => TEAM_PLANNER_SLOT_POSITIONS[i] === TEAM_PLANNER_SLOT_POSITIONS[picker.index] && isEmptySlot(player)).length
    : 0;

  // Regels in de kiezer: in de starttoestand geen dubbele speler en max. 3 per club; bij een transfer
  // daarbovenop het budget en de latere speeldagen (useTeamPlanner.transferBlocker).
  const pickerBlocked = useMemo(() => {
    if (!picker) return null;
    if (picker.mode === 'transfer') return planner.transferBlocker(picker.index);
    const others = p.players.filter((player, i) => i !== picker.index && player.name);
    return (candidate) => {
      if (others.some(u => planner.isSamePlayer(u, candidate))) return t('picker.reasonInTeam');
      if (others.filter(u => u.teamCode === candidate.teamCode).length >= TEAM_PLANNER_MAX_PER_CLUB) {
        return t('picker.reasonClubLimit', { max: TEAM_PLANNER_MAX_PER_CLUB });
      }
      return null;
    };
    // planner.transferBlocker verandert met de planner zelf
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, p, planner.gw, t]);

  const pickerBudgetMax = (() => {
    if (!picker) return null;
    if (picker.mode === 'transfer') return planner.transferRules(picker.index).maxPrice;
    // Een zelf ingevuld startbudget ligt vast: rechtzetten van het startteam verandert het niet.
    if (p.startBank !== null) return null;
    return baseBank + (parseFloat(p.players[picker.index]?.price) || 0);
  })();
  const pickerOut = picker?.mode === 'transfer' ? planner.team[picker.index] : null;

  // --- Acties per speler ----------------------------------------------------------------------------
  const openMenu = (event, items, label) => {
    setMenu({ anchor: event.currentTarget.getBoundingClientRect(), items, label });
  };

  const startSwap = (slot) => {
    setView('pitch');
    setSwapFrom(slot);
  };

  const slotActions = (slot) => {
    const player = displayTeam[slot];
    const items = [];
    if (baseMode) {
      items.push({ key: 'replace', label: t('teamPlanner.menu.replace'), onSelect: () => openFillPicker(slot), disabled: !!playerDatabaseError });
      if (onOpenPlayer && player?.name && player?.teamCode) {
        items.push({ key: 'open', label: t('teamPlanner.menu.openPlayer'), onSelect: () => onOpenPlayer(player.name, player.teamCode) });
      }
      if (player?.name) items.push({ key: 'remove', label: t('teamPlanner.menu.remove'), danger: true, onSelect: () => planner.clearSlot(slot) });
      return items;
    }
    const onPitch = !bench.includes(slot);
    if (planner.swapTargets(slot).size > 0) {
      items.push({ key: 'swap', label: t('teamPlanner.menu.swap'), onSelect: () => startSwap(slot) });
    }
    if (planner.canTransfer) {
      items.push({ key: 'transfer', label: t('teamPlanner.menu.transfer'), onSelect: () => openTransferPicker(slot), disabled: !!playerDatabaseError || playerDatabaseLoading });
    }
    if (onPitch) {
      items.push(lineup.captain === slot
        ? { key: 'cap', label: t('teamPlanner.menu.removeCaptain'), onSelect: () => planner.setCaptain(null) }
        : { key: 'cap', label: t('teamPlanner.menu.captain', { gw }), onSelect: () => planner.setCaptain(slot) });
      items.push(lineup.vice === slot
        ? { key: 'vice', label: t('teamPlanner.menu.removeVice'), onSelect: () => planner.setVice(null) }
        : { key: 'vice', label: t('teamPlanner.menu.vice', { gw }), onSelect: () => planner.setVice(slot) });
    }
    if (onOpenPlayer && player?.name && player?.teamCode) {
      items.push({ key: 'open', label: t('teamPlanner.menu.openPlayer'), onSelect: () => onOpenPlayer(player.name, player.teamCode) });
    }
    return items;
  };

  const roleOf = (slot) => {
    if (lineup.captain === slot) return { glyph: isTripleCaptainActive ? '3×C' : 'C', tone: 'accent', title: t('teamPlanner.captain') };
    if (lineup.vice === slot) return { glyph: 'V', tone: 'vice', title: t('teamPlanner.vice') };
    return null;
  };

  const renderSlot = (player, { benched = false } = {}) => {
    if (isEmptySlot(player)) {
      return (
        <PitchSlot
          key={player.index}
          player={player}
          gw={gw}
          onClick={() => openFillPicker(player.index)}
          disabled={!!playerDatabaseError || !baseMode}
          ariaLabel={t('teamPlanner.emptySlot', { position: player.position })}
        />
      );
    }
    const role = benched ? null : roleOf(player.index);
    const swapping = swapFrom !== null;
    const isTarget = swapping && swapTargets.has(player.index);
    const classes = [
      swapping && player.index === swapFrom && 'is-selected',
      isTarget && 'is-swappable',
      swapping && !isTarget && player.index !== swapFrom && 'is-dimmed',
      benched && isBenchBoostActive && 'is-boosted',
    ].filter(Boolean).join(' ');
    const fromName = swapping ? displayTeam[swapFrom]?.name : '';
    return (
      <PitchSlot
        key={player.index}
        player={player}
        label={shortLabel(player)}
        gw={gw}
        ratings={ratings}
        homeAdvantage={homeAdvantage}
        roleGlyph={role?.glyph}
        roleTone={role?.tone}
        status={slotStatus(player)}
        className={classes}
        disabled={swapping && !isTarget && player.index !== swapFrom}
        ariaLabel={swapping
          ? (player.index === swapFrom
            ? t('teamPlanner.swapCancelAria', { name: player.name })
            : t('teamPlanner.swapTargetAria', { name: fromName, other: player.name }))
          : t('teamPlanner.slotAria', { name: player.name, position: player.position })}
        onClick={swapping
          ? () => {
              if (player.index !== swapFrom) planner.swap(swapFrom, player.index);
              setSwapFrom(null);
            }
          : (e) => openMenu(e, slotActions(player.index), player.name)}
      />
    );
  };

  // Bank: een keeper staat altijd vooraan, de rest in de volgorde van de invallers.
  const benchPlayers = [
    ...bench.filter(i => TEAM_PLANNER_SLOT_POSITIONS[i] === 'GK'),
    ...bench.filter(i => TEAM_PLANNER_SLOT_POSITIONS[i] !== 'GK'),
  ].map(i => displayTeam[i]).filter(Boolean);
  const formationLabel = (() => {
    const counts = { DEF: 0, MID: 0, FWD: 0 };
    TEAM_PLANNER_SLOT_POSITIONS.forEach((pos, i) => { if (pos !== 'GK' && !bench.includes(i)) counts[pos] += 1; });
    return `${counts.DEF}-${counts.MID}-${counts.FWD}`;
  })();

  // --- Lijst (C5): hetzelfde team als het veld, met dezelfde acties --------------------------------
  const apiGw = index.data?.gw ?? 0;
  const listRows = displayTeam.map((player, i) => ({ ...player, index: i, position: TEAM_PLANNER_SLOT_POSITIONS[i] }));
  const apiFor = (row) => (row.name ? index.find(row.name, row.teamCode) : null);

  const listColumns = [
    {
      key: 'player', label: t('teamPlanner.colPlayer'), rowHeader: true, sticky: true, stickyEdge: true,
      render: (row) => {
        if (isEmptySlot(row)) {
          return (
            <button type="button" className="tp-emptyslot" onClick={() => openFillPicker(row.index)} disabled={!!playerDatabaseError || !baseMode}>
              {t('teamPlanner.emptySlotShort', { position: row.position })}
            </button>
          );
        }
        const role = bench.includes(row.index) ? null : roleOf(row.index);
        return (
          <PlayerCell
            byName
            name={row.name}
            short={shortLabel(row)}
            clubCode={row.teamCode}
            price={row.price}
            subDesktop={false}
            badges={(
              <>
                {role && <Badge tone={role.tone} title={role.title}>{role.glyph}</Badge>}
                {bench.includes(row.index) && <span className="tp-benchtag">{t('teamPlanner.benchTag')}</span>}
                {isNotFound(row) && <Badge tone="outline" title={t('teamPlanner.notFoundTitle')}>{t('teamPlanner.notFound')}</Badge>}
              </>
            )}
          />
        );
      },
    },
    {
      key: 'club', label: t('teamPlanner.colClub'), className: 'tp-col-desktop',
      render: row => row.teamCode || null,
      cellClass: row => (row.teamCode && overCapClubCodes.has(row.teamCode) ? 'tp-danger-text' : ''),
    },
    { key: 'price', label: t('teamPlanner.colPriceEuro'), num: true, className: 'tp-col-desktop', render: row => (hasPrice(row.price) ? formatPrice(row.price) : null) },
    { key: 'pts', label: t('teamPlanner.colPts'), title: t('teamPlanner.colPtsTitle'), num: true, className: 'tp-col-desktop', render: row => apiFor(row)?.pts ?? null },
    {
      key: 'form', label: t('teamPlanner.colForm'), title: t('teamPlanner.colFormTitle', { count: FORM_GWS }), num: true, className: 'tp-col-desktop',
      render: row => { const api = apiFor(row); return api ? formatForm(formAverage(api.w?.pts, apiGw)) : null; },
    },
    {
      key: 'next3', label: t('teamPlanner.colNext'), className: 'tp-col-desktop tp-col-next',
      render: row => (row.teamCode ? <UpcomingFixtures club={row.teamCode} fromGw={gw} count={3} ratings={ratings} homeAdvantage={homeAdvantage} wrap={false} /> : null),
      blankWhenEmpty: true,
    },
    {
      key: 'next', label: `GW${gw}`, className: 'tp-col-fix tp-col-mobile',
      render: row => (row.teamCode ? (
        <MiniFixtureBadge teamCode={row.teamCode} fixture={FIXTURES[row.teamCode]?.[gw - 1]} gwNumber={gw} ratings={ratings} homeAdvantage={homeAdvantage} />
      ) : null),
      blankWhenEmpty: true,
    },
    {
      key: 'menu', label: <span className="ui-sr-only">{t('teamPlanner.colActions')}</span>, className: 'tp-col-menu', blankWhenEmpty: true,
      render: row => (isEmptySlot(row) ? null : (
        <Button
          variant="icon" size="sm" bare icon={MoreHorizontal}
          aria-haspopup="menu"
          aria-label={t('teamPlanner.slotMenuAria', { name: row.name })}
          onClick={(e) => openMenu(e, slotActions(row.index), row.name)}
        />
      )),
    },
  ];

  // --- Transfers -----------------------------------------------------------------------------------
  const transferGroups = [];
  planner.history.forEach(entry => {
    const lastGroup = transferGroups[transferGroups.length - 1];
    if (lastGroup && lastGroup.gw === entry.gw) lastGroup.entries.push(entry);
    else transferGroups.push({ gw: entry.gw, entries: [entry] });
  });

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
          onClick={() => planner.removeTransfer(e.slotIndex, e.id)}
          aria-label={t('teamPlanner.removeTransferAria', { out: e.outPlayer.name, in: e.inPlayer.name })}
        />
      ),
    },
  ];

  const swapName = swapFrom !== null ? displayTeam[swapFrom]?.name : '';
  const showPlannerControls = !baseMode;

  return (
    <>
      <PageHeader title={t('teamPlanner.pageTitle')} intro={t('teamPlanner.introShort')} />

      <TeamScreenshotUpload
        t={t}
        playerDatabase={playerDatabase}
        playerDatabaseLoading={playerDatabaseLoading}
        playerDatabaseError={playerDatabaseError}
        onApply={planner.importTeam}
        startGw={Math.max(CURRENT_GW, 1)}
        isRosterEmpty={planner.empty}
        extraActions={!planner.empty && (
          <Button variant="danger" size="sm" icon={Trash2} onClick={planner.clearTeam}>{t('teamPlanner.clearTeam')}</Button>
        )}
      />

      {playerDatabaseLoading && (
        <p className="tp-loading" role="status"><Loader2 className="fdr-spin" aria-hidden="true" /> {t('teamPlanner.loadingDb')}</p>
      )}
      {!playerDatabaseLoading && playerDatabaseError && (
        <ErrorBanner onRetry={fetchPlayerDatabase} retryLabel={t('shared.retry')}>{t(playerDatabaseError)}</ErrorBanner>
      )}

      {/* Eenmalige controle (C1): klopt het berekende budget voor de huidige speeldag? */}
      {showCheck && (
        <Notice
          action={(
            <span className="tp-check__actions">
              <Button variant="secondary" size="sm" onClick={planner.confirmCheck}>{t('teamPlanner.check.ok')}</Button>
              <Button variant="ghost" size="sm" onClick={() => openCalibration(checkGw)}>{t('teamPlanner.check.adjust')}</Button>
            </span>
          )}
        >
          <strong>{t('teamPlanner.check.question', { gw: checkGw })}</strong>{' '}
          {(() => {
            const values = planner.calibrationAt(checkGw);
            const bankText = t('teamPlanner.check.bank', { value: formatMoney(values.bank ?? 0) });
            if (!values.hasFreeTransfers) return bankText;
            return `${bankText} · ${t(values.freeTransfers === 1 ? 'teamPlanner.freeTransfer' : 'teamPlanner.freeTransfers', { count: values.freeTransfers })}`;
          })()}
        </Notice>
      )}

      {/* Statusregel (spec §7.3, C1): budget, gratis transfers en kosten van de bekeken GW. */}
      <div className="tp-status" aria-label={t('teamPlanner.status.aria')}>
        {(baseMode || squadCount < TEAM_PLANNER_SQUAD_SIZE) && (
          <span>{t('teamPlanner.status.squad', { count: squadCount, total: TEAM_PLANNER_SQUAD_SIZE })}</span>
        )}
        {showPlannerControls ? (
          <button
            type="button"
            className={`tp-status__edit${bankShown < 0 ? ' is-danger' : ''}`}
            onClick={() => openCalibration(gw)}
            aria-label={t('teamPlanner.status.calibrateAria', { gw })}
          >
            {t('teamPlanner.status.bank')} <span className="num">{formatMoney(bankShown)}</span>
          </button>
        ) : (
          <span className={bankShown < 0 ? 'is-danger' : undefined}>
            {t('teamPlanner.status.bank')} <span className="num">{formatMoney(bankShown)}</span>
          </span>
        )}
        {budget && (
          <button type="button" className="tp-status__edit" onClick={() => openCalibration(gw)} aria-label={t('teamPlanner.status.calibrateAria', { gw })}>
            {budget.isRecharge
              ? t('teamPlanner.rechargeFree')
              : (
                <>
                  <span className="tp-status__full">{t(remainingFree === 1 ? 'teamPlanner.freeTransfer' : 'teamPlanner.freeTransfers', { count: remainingFree })}</span>
                  <span className="tp-status__short">{t('teamPlanner.status.freeShort', { count: remainingFree })}</span>
                </>
              )}
          </button>
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
        {showPlannerControls && <span>{t('teamPlanner.formation', { formation: formationLabel })}</span>}
        {showPlannerControls && lineup.captain === null && <span className="is-danger">{t('teamPlanner.status.chooseCaptain')}</span>}
        {overCapClubs.length > 0 && (
          <span className="is-danger">
            {t('teamPlanner.overCapClubs', { max: TEAM_PLANNER_MAX_PER_CLUB, clubs: overCapClubs.map(([code, count]) => `${teamNameFor(code)} (${count})`).join(', ') })}
          </span>
        )}
        {planner.complete && !editStart && (
          <Button variant="ghost" size="sm" icon={Pencil} className="tp-status__action" onClick={() => { setEditStart(true); setCalibGw(null); }}>
            {t('teamPlanner.editStart')}
          </Button>
        )}
        {editStart && (
          <Button variant="secondary" size="sm" className="tp-status__action" onClick={() => setEditStart(false)} disabled={!planner.complete}>
            {t('teamPlanner.editStartDone')}
          </Button>
        )}
      </div>

      {editStart && <p className="tp-note is-accent">{t('teamPlanner.editStartNote', { gw: planner.startGw })}</p>}

      {calibGw !== null && !baseMode && (
        <CalibrationPanel
          key={calibGw}
          t={t}
          gw={calibGw}
          values={planner.calibrationAt(calibGw)}
          ownFields={ownFieldsAt(calibGw)}
          onSave={(values) => { planner.calibrate(calibGw, values); setCalibGw(null); }}
          onReset={() => { planner.resetCalibration(calibGw); setCalibGw(null); }}
          onCancel={() => setCalibGw(null)}
        />
      )}

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
        <section className={`tp-panel tp-panel--pitch${view !== 'pitch' ? ' is-hidden-narrow' : ''}`} aria-label={t('teamPlanner.pitchAria', { gw })}>
          {showPlannerControls && (
            <>
              <div className="tp-gwbar">
                <Button variant="icon" icon={ChevronLeft} onClick={() => { planner.goPrev(); setCalibGw(null); }} disabled={!planner.canPrev} aria-label={t('teamPlanner.prevGwAria')} />
                <span className="tp-gwbar__gw num">GW{gw}</span>
                <Button variant="icon" icon={ChevronRight} onClick={() => { planner.goNext(); setCalibGw(null); }} disabled={!planner.canNext || gw >= GW_COUNT} aria-label={t('teamPlanner.nextGwAria')} />
                {gw < CURRENT_GW && <span className="tp-gwbar__past">{t('teamPlanner.pastGw')}</span>}
                {/* De topbalk toont al de deadline van CURRENT_GW; hier enkel voor een andere GW. */}
                {gw !== CURRENT_GW && GW_DEADLINES[gw] && (
                  <span className="tp-gwbar__meta">{t('teamPlanner.deadline', { value: GW_DEADLINES[gw] })}</span>
                )}
              </div>

              <div className="tp-boosters" role="group" aria-label={t('teamPlanner.boosters')}>
                {['benchBoost', 'tripleCaptain', 'recharge'].map(key => (
                  <BoosterButton
                    key={key}
                    t={t}
                    label={t(`teamPlanner.booster.${key}.label`)}
                    description={key === 'recharge' && AUTO_RECHARGE_GWS.has(gw)
                      ? t('teamPlanner.booster.recharge.autoDescription', { gw })
                      : t(`teamPlanner.booster.${key}.description`)}
                    state={boosterState(key)}
                    usedGw={p.boosters[key]}
                    gw={gw}
                    onClick={() => planner.toggleBooster(key)}
                  />
                ))}
              </div>

              {AUTO_RECHARGE_GWS.has(gw) && <p className="tp-note">{t('teamPlanner.autoRechargeNote', { gw })}</p>}
              {isTripleCaptainActive && <p className="tp-note is-accent">{t('teamPlanner.tripleCaptainActive', { gw })}</p>}
              {isRecharge && <p className="tp-note is-warning">{t('teamPlanner.rechargeNote', { gw })}</p>}
              {lineup.lineupIsAuto && <p className="tp-note">{t('teamPlanner.autoLineupNote')}</p>}
            </>
          )}

          {/* Wisselmodus (C3): één regel die zegt wat er gebeurt, ook voor schermlezers. */}
          <div className="tp-swapbar" role="status" aria-live="polite">
            {swapFrom !== null && (
              <>
                <span>{t('teamPlanner.swapLive', { name: swapName })}</span>
                <Button variant="ghost" size="sm" onClick={() => setSwapFrom(null)}>{t('teamPlanner.cancel')}</Button>
              </>
            )}
          </div>

          <div className={`tp-pitch${swapFrom !== null ? ' is-swapping' : ''}`}>
            {PITCH_ROW_ORDER.map(pos => (
              <div key={pos} className="tp-pitch__row">
                {displayTeam
                  .filter(player => player.position === pos && !bench.includes(player.index))
                  .map(player => renderSlot(player))}
              </div>
            ))}
          </div>

          <div className="tp-bench">
            <div className="tp-bench__head">
              <h3 className="label tp-bench__title">{t('teamPlanner.benchDash', { gw })}</h3>
              {showPlannerControls && isBenchBoostActive && <span className="tp-note is-accent">{t('teamPlanner.benchBoostActive', { gw })}</span>}
            </div>
            <div className="tp-bench__row">{benchPlayers.map(player => renderSlot(player, { benched: true }))}</div>
            {showPlannerControls && (
              <div className="tp-bench__actions">
                <Button variant="secondary" size="sm" icon={Wand2} onClick={planner.optimize}>{t('teamPlanner.optimizeLineup')}</Button>
                <span className="tp-note tp-note--inline">{t('teamPlanner.optimizeExplain', { count: FORM_GWS })}</span>
              </div>
            )}
          </div>
        </section>

        <div className="tp-side">
          <section className={`tp-panel tp-panel--list${view !== 'list' ? ' is-hidden-narrow' : ''}`} aria-labelledby="tp-list-title">
            <div className="tp-panel__head">
              <h2 id="tp-list-title" className="tp-panel__title">
                {t('teamPlanner.selection')} <span className="tp-panel__meta num">GW{gw}</span>
              </h2>
            </div>
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
                if (isEmptySlot(row)) { if (baseMode) openFillPicker(row.index); }
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
              <Button variant="danger" size="sm" icon={Trash2} onClick={planner.clearTransfers} disabled={transferGroups.length === 0}>
                {t('teamPlanner.clearAllTransfers')}
              </Button>
            </div>
            {openSections.teamPlannerTransfers && (
              <div id="fdr-section-teamPlannerTransfers">
                {transferGroups.length === 0 ? (
                  <EmptyState>{t('teamPlanner.emptyTransfers')}</EmptyState>
                ) : transferGroups.map(group => {
                  const groupBudget = planner.transferBudget[group.gw];
                  return (
                    <div key={group.gw} className="tp-tgroup">
                      <h3 className="tp-tgroup__title">
                        <span className="num">GW{group.gw}</span>
                        {isRechargeActiveForGw(p.boosters, group.gw) && <span className="tp-tgroup__meta">Recharge</span>}
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

      {planner.incoming && !picker && <IncomingSheet t={t} planner={planner} shortLabel={shortLabel} />}

      {picker && (
        <PlayerPicker
          t={t}
          onClose={() => setPicker(null)}
          onSelect={handlePick}
          players={playerDatabase}
          loading={playerDatabaseLoading}
          position={TEAM_PLANNER_SLOT_POSITIONS[picker.index]}
          title={pickerOut ? t('teamPlanner.transferPickerTitle', { gw, name: shortLabel(pickerOut) }) : null}
          note={pickerOut ? t('teamPlanner.transferPickerNote', { max: pickerBudgetMax.toFixed(1) }) : null}
          switchablePositions={pickerPositions}
          onSwitchPosition={switchPickerPosition}
          added={picker.mode === 'fill' ? picker.added : null}
          emptyLeft={pickerEmptyLeft}
          blockedReason={pickerBlocked}
          budgetMax={pickerBudgetMax}
          gw={gw}
          ratings={ratings}
          homeAdvantage={homeAdvantage}
          isWatched={isPlayerWatched}
          onToggleWatch={toggleWatchlistPlayer}
        />
      )}
    </>
  );
}
