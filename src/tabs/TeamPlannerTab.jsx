// Inhoud van de Team Planner-tab: handmatige invoer van een 15-koppige selectie, met live budget-/
// club-validatie, een veld-weergave met per-GW fixtures/bank/kapitein, en een transfer-laag erbovenop
// (spelers vervangen vanaf een gekozen GW, tijdgebonden — zie het commentaar bij TransferPanel/
// resolvedIndexedPlayers hieronder). Ontvangt alle state en handlers als props vanuit FDRTool.jsx
// (geen domein-state hier) — de tab-content wordt conditioneel gemount/unmount bij het wisselen van
// tab, dus lokale state zou resetten telkens de gebruiker weg- en terugnavigeert. Uitzondering: de
// transfer-DRAFT in TransferPanel (welke OUT/IN nog niet bevestigd is) is bewust wél lokale useState,
// net als PlayerSearchInput's eigen zoekveld-state — voorbijgaande UI-invoer, geen domein-data.

import { useState, useRef, useEffect } from 'react';
import {
  Users, Shirt, ChevronLeft, ChevronRight, Loader2, AlertCircle, RotateCcw,
  ArrowLeftRight, ArrowRight, X, Wand2, Armchair, Zap, Star, RefreshCw, Trash2, ArrowUpDown,
} from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT, GW_DEADLINES,
  TEAM_PLANNER_BUDGET, TEAM_PLANNER_MAX_PER_CLUB, TEAM_PLANNER_BENCH_SIZE, TEAM_PLANNER_SQUAD_SIZE,
  VALID_FORMATIONS, TEAM_PLANNER_SLOT_POSITIONS, sectionTitleStyle,
  isRechargeActiveForGw as isRechargeActiveForGwRule,
} from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { SectionHeader } from '../components/SectionHeader';
import { PlayerSearchInput } from '../components/PlayerSearchInput';
import { TeamScreenshotUpload } from './TeamScreenshotUpload';

const teamPlannerInputStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '6px 8px', fontSize: '13px', width: '100%'
};

const thStyle = {
  textAlign: 'left', color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase',
  letterSpacing: '0.05em', padding: '6px 8px'
};

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

// Alleen voor de veld-weergave hieronder — GK bovenaan, FWD onderaan, zoals de echte FPL-app (gelijk
// aan POSITIONS, de canonieke volgorde voor het formulier en de positie-telling).
const PITCH_ROW_ORDER = ['GK', 'DEF', 'MID', 'FWD'];

// Kleurstaat voor een "x/y"-telling: compleet (teal), te vol (rood, zelfde rood als elders in de app
// voor "moeilijkst"/waarschuwingen), nog te kort (neutraal gedempt — geen waarschuwingskleur, want
// een half ingevuld formulier of een nog niet volledige bank is nog geen fout). Gebruikt voor zowel
// de positie-tellers als de bank-teller in de veld-sectie hieronder.
function countBadgeStyle(count, required) {
  if (count === required) return { background: '#4ECDC4', color: '#0B2E1B' };
  if (count > required) return { background: '#C2402C', color: '#FBEAE7' };
  return { background: 'rgba(255,255,255,0.08)', color: '#C9B8E0' };
}

// Kleurstaat voor de gratis-transfers-pill bij de GW-selector (zie teamPlannerTransferBudget,
// FDRTool.jsx/constants.js): goud tijdens een Recharge-GW (transfers zijn dan sowieso onbeperkt
// gratis, het aantal is niet relevant), teal zolang er nog minstens 1 gratis transfer over is voor
// de bekeken GW, neutraal grijs zodra dat op is (géén rood — "0 over" is op zich geen fout/waarschuwing,
// enkel de effectief gemaakte extra transfers die punten kosten krijgen de rode stijl, zie hieronder).
function transferBudgetBadgeStyle(isRecharge, remainingFree) {
  if (isRecharge) return { background: 'rgba(232,197,71,0.15)', color: '#E8C547' };
  return remainingFree > 0 ? { background: '#4ECDC4', color: '#0B2E1B' } : { background: 'rgba(255,255,255,0.08)', color: '#C9B8E0' };
}

// Kleurstaat voor de formatie-pill: neutraal zolang de bank nog niet exact 4 spelers telt (de
// basisploeg staat dan nog niet vast op 11), anders teal (geldig) of rood (ongeldig).
function formationBadgeStyle(isBenchComplete, isValidFormation) {
  if (!isBenchComplete) return { background: 'rgba(255,255,255,0.08)', color: '#C9B8E0' };
  return isValidFormation ? { background: '#4ECDC4', color: '#0B2E1B' } : { background: '#C2402C', color: '#FBEAE7' };
}

// Kleine, subtiele ronde icoon-knop voor de booster-stapel rechtsboven in het veld-kaartje (zie
// .fdr-pitch-container hieronder) — géén zichtbaar tekstlabel naast de knop, enkel het icoon/label
// erin + een title-attribuut voor een browser-tooltip bij hover, zelfde eenvoudige patroon als de
// GW-navigatiepijltjes hierboven. `state` is 'active' (booster loopt voor de bekeken GW — klikbaar
// om te annuleren), 'used-elsewhere' (al verbruikt op een andere GW — disabled) of 'available' (nog
// vrij te gebruiken). Ofwel `icon` (een lucide-component) ofwel `label` (korte tekst, bv. "3×" voor
// Driedubbele kapitein — zelfde glyph als de kapitein-badge op de kaart zelf) meegeven, niet beide.
function BoosterIconButton({ icon: Icon, label, title, state, onClick }) {
  const isActive = state === 'active';
  const isUsedElsewhere = state === 'used-elsewhere';
  return (
    <button
      onClick={onClick}
      disabled={isUsedElsewhere}
      title={isUsedElsewhere ? `${title} — al gebruikt` : title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '26px', height: '26px',
        borderRadius: '50%', flexShrink: 0,
        background: isActive ? 'rgba(78,205,196,0.25)' : 'rgba(42,20,64,0.55)',
        color: isActive ? '#4ECDC4' : isUsedElsewhere ? '#5A4A72' : '#C9B8E0',
        border: `1px solid ${isActive ? '#4ECDC4' : 'rgba(255,255,255,0.25)'}`,
        opacity: isUsedElsewhere ? 0.5 : 1,
        cursor: isUsedElsewhere ? 'not-allowed' : 'pointer',
        fontSize: '10px', fontWeight: 900, lineHeight: 1,
      }}
    >
      {Icon ? <Icon size={13} /> : label}
    </button>
  );
}

function formatPrice(price) {
  return price != null && price !== '' && Number.isFinite(Number(price)) ? `${Number(price).toFixed(1)}M` : '—';
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

// Eén speler-kaartje op het veld of de bank: clublogo, naam, en (indien een team gekozen is) de
// fixture van de geselecteerde GW via de bestaande MiniFixtureBadge — die regelt zelf al DGW/
// postponed/possibly-postponed-weergave, dus hier hoeft enkel de juiste fixture-string doorgegeven
// te worden. Leeg gebleven slots (geen naam, geen team) worden niet getoond. De "C"-badge is puur
// informatief (geen knop) en verschijnt enkel op de effectieve kapitein — de kapitein zelf wordt
// gekozen via de dropdown boven het veld, niet door op een kaart te klikken (dat zou anders 11
// zichtbare, grotendeels inactieve "C"-knoppen opleveren). `player` komt hier altijd uit
// resolvedIndexedPlayers, dus dit toont altijd wie er op de bekeken GW effectief speelt (na transfers).
// Het kruisje linksboven (onSelectForTransfer) selecteert deze speler als uitgaande transfer — zie
// transferOutIndex/handleSelectForTransfer in het hoofdcomponent hieronder: dat opent TransferPanel
// meteen met deze speler al gekozen als OUT, i.p.v. dat de gebruiker 'm nog moet opzoeken in de select.
// Enkel zichtbaar zolang TransferPanel effectief open staat (onSelectForTransfer is dan pas gezet,
// zie isTransferPanelOpen) — anders staan er 15 kruisjes op het scherm terwijl er nog niemand aan een
// transfer denkt.
//
// Bank-herschikken gebeurt NIET via een klein icoontje op de kaart (dat leidde tot per-ongeluk-
// mistikken naar de onderliggende "terug naar het veld"-knop op mobiel, precies de tiny-target-fout
// die zoiets veroorzaakt) — in plaats daarvan schakelt "Herschik bank" hieronder de betekenis van de
// hele kaart-klik zelf om: normaal = terug naar het veld, in herschik-modus = selecteren om te
// wisselen (onToggleBench/benchToggleDisabled worden dan al door de ouder op de wissel-logica gezet,
// zie de bench-render hieronder). Zo is er nooit twee gedragingen die om dezelfde krappe tikruimte
// concurreren: de volledige (ruime) kaart is altijd het enige klikdoel, en de betekenis ervan hangt af
// van de modus, niet van waar precies je tikt.
function PlayerPitchCard({ player, gw, ratings, homeAdvantage, isBenched, isCaptain, isTripleCaptainActive, accentActive, benchToggleDisabled, onToggleBench, onSelectForTransfer, benchReorderMode, isSelectedForSwap }) {
  if (!player.name && !player.teamCode) return null;
  const fixture = player.teamCode ? FIXTURES[player.teamCode]?.[gw - 1] : null;
  return (
    <div style={{ position: 'relative' }}>
      {isCaptain && (
        <span
          className="fdr-pitch-card-captain"
          title={isTripleCaptainActive ? 'Driedubbele kapitein voor deze GW' : 'Kapitein voor deze GW'}
          style={{
            position: 'absolute', top: '-6px', right: '-6px', zIndex: 1,
            width: '20px', height: '20px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900,
            lineHeight: 1,
            background: isTripleCaptainActive ? '#E8C547' : '#4ECDC4',
            color: '#0B2E1B',
            border: `1px solid ${isTripleCaptainActive ? '#E8C547' : '#4ECDC4'}`,
          }}
        >
          {isTripleCaptainActive ? '3×' : 'C'}
        </span>
      )}
      {onSelectForTransfer && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelectForTransfer(); }}
          title="Selecteer als uitgaande transfer"
          style={{
            position: 'absolute', top: '-6px', left: '-6px', zIndex: 1,
            width: '18px', height: '18px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 0,
            background: 'rgba(42,20,64,0.85)', color: '#8F79AD',
            border: '1px solid rgba(255,255,255,0.25)', cursor: 'pointer',
          }}
        >
          <X size={11} />
        </button>
      )}
      <button
        onClick={onToggleBench}
        disabled={benchToggleDisabled}
        className="fdr-pitch-card"
        title={
          isBenched
            ? (benchReorderMode
                ? (benchToggleDisabled ? 'Doelmannen kunnen niet van bankplaats wisselen'
                    : isSelectedForSwap ? 'Klik om te annuleren'
                      : 'Klik 2 bankspelers aan om ze van plaats te wisselen')
                : 'Klik om terug naar het veld te zetten')
            : benchToggleDisabled ? `Bank is al vol (${TEAM_PLANNER_BENCH_SIZE}/${TEAM_PLANNER_BENCH_SIZE}) voor GW${gw}`
              : 'Klik om naar de bank te sturen'
        }
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          background: 'rgba(255,255,255,0.06)',
          border: isSelectedForSwap ? '1px solid #4ECDC4' : accentActive ? '1px solid #4ECDC4' : benchReorderMode && !benchToggleDisabled ? '1px dashed rgba(78,205,196,0.5)' : '1px solid rgba(255,255,255,0.1)',
          boxShadow: isSelectedForSwap ? '0 0 0 2px rgba(78,205,196,0.6)' : accentActive ? '0 0 0 1px rgba(78,205,196,0.4)' : 'none',
          borderRadius: '10px', padding: '8px 10px', minWidth: '78px', flexShrink: 0,
          // Gedimd wanneer niet-klikbaar (bv. de keeper tijdens herschik-modus) — maakt in één oogopslag
          // duidelijk dat deze kaart nu geen wisselkandidaat is, i.p.v. dat de gebruiker het pas merkt
          // na een klik die niets doet.
          opacity: benchToggleDisabled ? 0.45 : 1,
          cursor: benchToggleDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {player.teamCode && (
          <img
            src={`/club-logos/${player.teamCode}.png`}
            alt=""
            className="club-logo fdr-pitch-card-logo"
            style={{ width: '24px', height: '24px', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <span className="fdr-pitch-card-name" style={{ color: '#FFF', fontSize: '11px', fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
          {player.name || '—'}
        </span>
        {fixture && (
          // .fdr-mini-fixture-row hergebruikt de al bestaande mobiele compacte badge-stijlen — oorspronkelijk
          // gebouwd voor de fixture-rijen in FDRTab/WatchlistTab, maar even goed toepasbaar op deze ene badge
          // in een klein kaartje hier. .fdr-pitch-card-fixture verkleint 'm nog verder (zie mediaquery), want
          // de pitch-kaartjes zelf zijn smaller dan waarvoor die algemene stijl oorspronkelijk bedoeld was.
          <span className="fdr-mini-fixture-row fdr-pitch-card-fixture">
            <MiniFixtureBadge teamCode={player.teamCode} fixture={fixture} gwNumber={gw} ratings={ratings} homeAdvantage={homeAdvantage} />
          </span>
        )}
      </button>
    </div>
  );
}

// Klein kaartje voor de "voor → na"-vergelijking in TransferPanel hieronder — enkel weergave, geen
// interactie (in tegenstelling tot PlayerPitchCard, dat een klikbare bank-toggle is).
function TransferPlayerCard({ player, highlight }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', minWidth: '120px',
      background: highlight ? 'rgba(78,205,196,0.1)' : 'rgba(255,255,255,0.06)',
      border: highlight ? '1px solid rgba(78,205,196,0.4)' : '1px solid rgba(255,255,255,0.1)',
      borderRadius: '10px', padding: '10px 12px',
    }}>
      {player.teamCode && (
        <img
          src={`/club-logos/${player.teamCode}.png`}
          alt=""
          className="club-logo"
          style={{ width: '22px', height: '22px', objectFit: 'contain' }}
          onError={(e) => { e.target.style.display = 'none'; }}
        />
      )}
      <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 700, textAlign: 'center' }}>{player.name || '—'}</span>
      <span style={{ color: '#8F79AD', fontSize: '10px' }}>{teamNameFor(player.teamCode)} · {player.position}</span>
      <span style={{ color: '#4ECDC4', fontSize: '11px', fontWeight: 700 }}>{formatPrice(player.price)}</span>
    </div>
  );
}

// Transfer plannen voor de bekeken GW `gw`: OUT komt uit resolvedIndexedPlayers (het HUIDIGE team op
// dit punt in de tijd, dus al rekening houdend met eerder geplande transfers — niet per se het
// oorspronkelijke GW1-team), IN komt uit de spelersdatabank via dezelfde PlayerSearchInput als de
// spelerslijst hierboven (zonder positie-filter: een andere positie mag, met waarschuwing). Alle
// validaties hieronder zijn subtiele waarschuwingen — net als de budget-/club-validaties in de
// spelerslijst — "Bevestig transfer" blijft altijd klikbaar, ook als er een waarschuwing getoond wordt.
// De OUT/IN-keuze zelf is lokale draft-state (zie bestandscommentaar bovenaan): pas bij "Bevestig
// transfer" wordt het via onConfirm naar FDRTool.jsx doorgegeven en permanent (localStorage).
function TransferPanel({ gw, resolvedIndexedPlayers, playerDatabase, playerDatabaseLoading, playerDatabaseError, onConfirm, externalOutIndex, onExternalOutIndexConsumed, onOpenChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [outIndex, setOutIndex] = useState('');
  const [inPlayer, setInPlayer] = useState(null);

  // Enkel gevulde slots kunnen "uit" — een leeg slot heeft niets om te vervangen.
  const outOptions = resolvedIndexedPlayers.filter(p => p.name || p.teamCode);
  const outPlayer = outIndex !== '' ? resolvedIndexedPlayers[Number(outIndex)] : null;

  const resetDraft = () => { setOutIndex(''); setInPlayer(null); };
  const handleToggle = () => { setIsOpen(o => !o); resetDraft(); };

  // Meldt de open/dicht-status naar boven — TeamPlannerTab gebruikt dit om de "selecteer als
  // uitgaande transfer"-kruisjes op de veld-/bankkaartjes enkel te tonen zolang dit paneel open staat
  // (zie isTransferPanelOpen daar), i.p.v. dat die 15 kruisjes altijd op het scherm staan.
  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  // Selecteren als uitgaande transfer via het kruisje op een veld-/bankkaartje (zie TeamPlannerTab
  // hieronder, handleSelectForTransfer) opent dit paneel meteen met die speler al gekozen als OUT —
  // externalOutIndex is enkel een "signaal", vandaar dat de ouder 'm meteen weer terugzet naar null
  // via onExternalOutIndexConsumed zodra dit effect 'm verwerkt heeft (anders zou nogmaals op dezelfde
  // speler klikken niets meer doen, want de prop-waarde zou dan niet meer "veranderen").
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

  // Budget/club-impact van de (nog niet bevestigde) transfer, berekend op het HUIDIGE team op deze
  // GW (resolvedIndexedPlayers) — dus los van de statische GW1-budgetvalidatie in de spelerslijst.
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
    // Als OUT en IN toevallig dezelfde club hebben, blijft het aantal voor die club gelijk (één weg,
    // één erbij) — anders komt er simpelweg één bij voor IN's club.
    clubCountAfter = outPlayer.teamCode === inPlayer.teamCode ? currentInClub : currentInClub + 1;
  }
  const isClubOverCapAfter = clubCountAfter !== null && clubCountAfter > TEAM_PLANNER_MAX_PER_CLUB;
  const isPositionMismatch = outPlayer && inPlayer && outPlayer.position !== inPlayer.position;

  return (
    <div style={{ marginBottom: '16px', marginTop:'16px'}}>
      <button
        onClick={handleToggle}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', width: '100%',
          background: isOpen ? '#4ECDC4' : 'transparent', color: isOpen ? '#0B2E1B' : '#4ECDC4',
          border: '1px solid #4ECDC4', borderRadius: '8px', padding: '9px 14px',
          fontWeight: 700, fontSize: '13px', cursor: 'pointer',
        }}
      >
        <ArrowLeftRight size={15} /> {isOpen ? 'Annuleer transfer' : `Transfer plannen voor GW${gw}`}
      </button>

      {isOpen && (
        <div style={{
          marginTop: '10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '14px', display: 'grid', gap: '12px'
        }}>
          <div style={{ display: 'grid', gap: '10px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase' }}>Uit (OUT)</span>
              <select
                value={outIndex}
                onChange={e => { setOutIndex(e.target.value); setInPlayer(null); }}
                style={teamPlannerInputStyle}
              >
                <option value="">Kies speler...</option>
                {outOptions.map(p => (
                  <option key={p.index} value={p.index}>
                    {p.position} — {p.name || `Speler ${p.index + 1}`} ({formatPrice(p.price)})
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase' }}>In (IN)</span>
              {/* excludeUsedPlayers sluit spelers uit die al ergens in het huidige team zitten (inclusief
                  de OUT-speler zelf, want die zit ook in resolvedIndexedPlayers) — zo kan een transfer
                  nooit een speler binnenhalen die al elders in de 15 staat. */}
              <PlayerSearchInput
                value={inPlayer?.name ?? ''}
                players={excludeUsedPlayers(playerDatabase, resolvedIndexedPlayers)}
                disabled={outIndex === '' || playerDatabaseLoading || !!playerDatabaseError}
                placeholder={
                  outIndex === '' ? 'Kies eerst een uitgaande speler'
                    : playerDatabaseLoading ? 'Databank laden...' : 'Zoek inkomende speler...'
                }
                onSelect={setInPlayer}
              />
            </label>
          </div>

          {outPlayer && inPlayer && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <TransferPlayerCard player={outPlayer} />
                <ArrowRight size={18} color="#4ECDC4" style={{ flexShrink: 0 }} />
                <TransferPlayerCard player={inPlayer} highlight />
              </div>

              {isPositionMismatch && (
                <p style={{ color: '#C2402C', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                  Let op: {inPlayer.name} ({inPlayer.position}) heeft een andere positie dan {outPlayer.name} ({outPlayer.position}).
                </p>
              )}
              {isOverBudgetAfter && (
                <p style={{ color: '#C2402C', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                  Budget na transfer: {newTotal.toFixed(1)}M / {TEAM_PLANNER_BUDGET}M — {(newTotal - TEAM_PLANNER_BUDGET).toFixed(1)}M te veel.
                </p>
              )}
              {isClubOverCapAfter && (
                <p style={{ color: '#C2402C', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                  Max {TEAM_PLANNER_MAX_PER_CLUB} per club overschreden bij {teamNameFor(inPlayer.teamCode)} na deze transfer.
                </p>
              )}
              {!isPositionMismatch && !isOverBudgetAfter && !isClubOverCapAfter && (
                <p style={{ color: '#8F79AD', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                  Nieuw budget na transfer: {newTotal.toFixed(1)}M / {TEAM_PLANNER_BUDGET}M
                </p>
              )}

              <button
                onClick={handleConfirm}
                style={{
                  background: '#4ECDC4', color: '#0B2E1B', border: 'none', borderRadius: '8px',
                  padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
                }}
              >
                Bevestig transfer
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TeamPlannerTab({
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
}) {
  // Enkel gebruikt om "Wis team" te disablen als er toch al niets ingevuld is — voorkomt een zinloze
  // bevestigingsdialoog. Gebaseerd op de echte basisploeg (teamPlannerPlayers), niet op een eventuele
  // Recharge-draft.
  const isRosterEmpty = teamPlannerPlayers.every(p => !p.name);

  // Recharge-bewerking (booster, zie FDRTool.jsx): tijdelijke, niet-bevestigde bewerking van de 15
  // spelers zoals ze op de bekeken GW spelen — vergelijkbaar met TransferPanel's OUT/IN-draft
  // hierboven (bestandscommentaar bovenaan), dus bewust lokale state i.p.v. domein-state in
  // FDRTool.jsx. null = niet aan het bewerken; anders array van 15 { name, teamCode, price }.
  const [rechargeDraft, setRechargeDraft] = useState(null);
  // Ref op de "Mijn 15 spelers"-kaart, enkel om bij het activeren van Recharge automatisch daarnaartoe
  // te scrollen (zie handleActivateRecharge hieronder) — geen domein-state, puur een DOM-handle.
  const rosterSectionRef = useRef(null);
  // Slot-index van de speler die via het kruisje op een veld-/bankkaartje als uitgaande transfer
  // geselecteerd is — een "signaal" naar TransferPanel (zie externalOutIndex daar), niet zelf
  // domein-state: null zodra TransferPanel het verwerkt heeft (onExternalOutIndexConsumed).
  const [transferOutIndex, setTransferOutIndex] = useState(null);
  // Of TransferPanel op dit moment open staat — enkel dan tonen de kruisjes op de veld-/bankkaartjes
  // zich (zie PlayerPitchCard's onSelectForTransfer hieronder), zodat ze niet altijd op het scherm
  // staan terwijl er nog niemand een transfer aan het plannen is.
  const [isTransferPanelOpen, setIsTransferPanelOpen] = useState(false);
  // Herschik-modus voor de bank: staat UIT tenzij expliciet aangezet via de "Herschik bank"-knop bij
  // de bank-sectie hieronder. Zolang UIT, doet een klik op een bankkaartje wat het altijd deed (terug
  // naar het veld). Zolang AAN, doet diezelfde kaart-klik iets anders (selecteren om te wisselen) en
  // is "terug naar het veld" tijdelijk niet mogelijk — bewust zo, want een klein apart icoontje voor
  // "selecteer om te wisselen" bleek op mobiel makkelijk mis te tikken naar de onderliggende "terug
  // naar het veld"-knop ernaast. Door i.p.v. daarvan de betekenis van de VOLLEDIGE (ruime) kaart-klik
  // te laten afhangen van een expliciete modus, is er nooit twijfel over wat een tik zal doen.
  const [isBenchReorderMode, setIsBenchReorderMode] = useState(false);
  // Slot-index van de bankspeler die geselecteerd is om van plaats te wisselen — de eerste klik op een
  // niet-keeper bankkaartje (in herschik-modus) zet dit, een tweede klik op een ANDERE bankspeler
  // voert de wissel uit (zie handleSelectForSwap hieronder). Reset bij GW-wissel of het verlaten van
  // herschik-modus, want een oude selectie zou anders een verwarrende, ongerelateerde wissel kunnen
  // veroorzaken.
  const [benchSwapSlot, setBenchSwapSlot] = useState(null);
  useEffect(() => {
    setBenchSwapSlot(null);
  }, [teamPlannerGw, isBenchReorderMode]);

  const handleSelectForSwap = (slotIndex) => {
    if (benchSwapSlot === null) {
      setBenchSwapSlot(slotIndex);
    } else if (benchSwapSlot === slotIndex) {
      setBenchSwapSlot(null); // nogmaals dezelfde speler aanklikken annuleert de selectie
    } else {
      swapTeamPlannerBenchPlayers(benchSwapSlot, slotIndex);
      setBenchSwapSlot(null);
    }
  };

  // Activeert Recharge voor de bekeken GW EN leidt de gebruiker meteen naar zijn 15-spelerslijst, waar
  // hij effectief kan bewerken — vouwt die sectie open als ze toevallig dichtgeklapt was. Enkel bij het
  // ACTIVEREN (niet bij het annuleren via dezelfde knop) is scrollen zinvol, vandaar de wasActive-check
  // vóór het togglen.
  const handleActivateRecharge = () => {
    const wasActive = boosterState('recharge') === 'active';
    toggleTeamPlannerBooster('recharge', teamPlannerGw);
    setRechargeDraft(null);
    if (!wasActive) {
      if (!openSections.teamPlannerRoster) toggleSection('teamPlannerRoster');
      requestAnimationFrame(() => {
        rosterSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  };

  // Budget-/club-validatie: normaal gebaseerd op de statische GW1-basisploeg (teamPlannerTotalPrice/
  // ClubCounts, hierboven al herberekend in FDRTool.jsx). Tijdens een actieve Recharge-bewerking moet
  // dit ONMOGELIJK overschreden kunnen worden (in tegenstelling tot elders in de app, waar dit enkel
  // een waarschuwing is) — dus reken dan met de draft zelf i.p.v. de basisploeg. rechargeDraft is
  // geseed vanuit teamPlannerResolvedPlayers (handleStartRecharge hieronder), dus deze berekening
  // houdt vanzelf al rekening met eerder geplande transfers die de prijs beïnvloeden. Buiten Recharge
  // (rechargeDraft === null) is effectiveRosterList gewoon teamPlannerPlayers, dus dit gedraagt zich
  // dan identiek aan voorheen.
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
  // Clubs met te veel spelers — gebruikt voor zowel de waarschuwingstekst als het subtiel aanduiden
  // van de betrokken spelersrijen in de tabel hieronder (overCapClubCodes).
  const overCapClubs = Object.entries(effectiveClubCounts).filter(([, count]) => count > TEAM_PLANNER_MAX_PER_CLUB);
  const overCapClubCodes = new Set(overCapClubs.map(([code]) => code));
  // Blokkeert "Bevestig recharge" hieronder zolang de bewerking het budget of de clublimiet overschrijdt.
  const isRechargeInvalid = rechargeDraft !== null && (isOverBudget || overCapClubs.length > 0);

  // Voor de veld-weergave/bank/kapitein/transfer-UI gebruiken we teamPlannerResolvedPlayers (het team
  // ZOALS HET ERUIT ZIET op de bekeken GW, inclusief alle transfers t/m die GW) i.p.v. de statische
  // teamPlannerPlayers — die laatste blijft enkel gebruikt voor de spelerslijst/budget-tabel hierboven
  // (de oorspronkelijke GW1-basisploeg, ongewijzigd door transfers). Elke speler krijgt zijn slot-index
  // mee, want na filteren (per positie/bank) is de array-index niet meer bruikbaar om
  // toggleTeamPlannerBench/setTeamPlannerCaptain/planTeamPlannerTransfer op het juiste slot te laten
  // aangrijpen.
  const resolvedIndexedPlayers = teamPlannerResolvedPlayers.map((player, index) => ({ ...player, index }));

  // Bank en kapitein zijn per GW ingesteld (zie FDRTool.jsx) — hier enkel een triviale lookup voor
  // de op dit moment bekeken GW, geen reduce over het volledige spelers-array.
  const benchForGw = teamPlannerBenchByGw[teamPlannerGw] ?? [];
  const captainForGw = teamPlannerCaptainByGw[teamPlannerGw];
  const benchCount = benchForGw.length;
  const isBenchComplete = benchCount === TEAM_PLANNER_BENCH_SIZE;
  // Bank-volgorde: een gebankte keeper staat altijd vooraan (real-FPL-gedrag), ongeacht zijn positie
  // in benchForGw — de overige (niet-keeper) slots volgen in de door de gebruiker ingestelde volgorde,
  // dus benchForGw.map(...) i.p.v. filter(...) om die bewaarde array-volgorde effectief te tonen (zie
  // swapTeamPlannerBenchPlayers in FDRTool.jsx en handleSelectForSwap hierboven, die enkel de niet-
  // keeper slots laten wisselen van array-positie).
  const benchPlayersInStoredOrder = benchForGw.map(index => resolvedIndexedPlayers[index]).filter(Boolean);
  const benchOutfieldPlayers = benchPlayersInStoredOrder.filter(p => p.position !== 'GK');
  const benchPlayers = [
    ...benchPlayersInStoredOrder.filter(p => p.position === 'GK'),
    ...benchOutfieldPlayers,
  ];

  // Kandidaten voor de kapitein-dropdown: enkel basisspelers (niet gebankt) die al iets ingevuld
  // hebben — een volledig leeg slot heeft niets om kapitein van te maken.
  const captainOptions = resolvedIndexedPlayers.filter(p => !benchForGw.includes(p.index) && (p.name || p.teamCode));

  // Formatie-validatie: enkel zinvol zodra de bank exact 4 spelers telt (dan staat de basisploeg
  // vast op 11) — zie VALID_FORMATIONS in constants.js voor de toegestane DEF-MID-FWD-combinaties.
  const { GK: gkCount, DEF: defCount, MID: midCount, FWD: fwdCount } = teamPlannerFormationCounts;
  const matchesValidFormation = VALID_FORMATIONS.some(([d, m, f]) => d === defCount && m === midCount && f === fwdCount);
  const isValidFormation = isBenchComplete && gkCount === 1 && matchesValidFormation;

  // Boosters zijn actief voor de bekeken GW als hun opgeslagen GW exact teamPlannerGw is (zie
  // toggleTeamPlannerBooster in FDRTool.jsx voor de vergrendel-/vervang-logica).
  const isBenchBoostActive = teamPlannerBoosters.benchBoost === teamPlannerGw;
  const isTripleCaptainActive = teamPlannerBoosters.tripleCaptain === teamPlannerGw;
  // GW8 (de laatste GW) krijgt automatisch een gratis Recharge voor iedereen — telt niet als
  // "verbruikt" (teamPlannerBoosters.recharge blijft ongemoeid) en is niet uit te zetten. De regel
  // zelf (isRechargeActiveForGwRule, constants.js) is de ENIGE bron van waarheid hiervoor — ook de
  // transfer-budgetberekening (teamPlannerTransferBudget, FDRTool.jsx) roept 'm aan, dus deze twee
  // kunnen nooit uit sync raken.
  const isRechargeActiveForGw = isRechargeActiveForGwRule(teamPlannerBoosters, teamPlannerGw);

  // 'active' (loopt voor de bekeken GW), 'used-elsewhere' (al verbruikt op een andere GW, vergrendeld)
  // of 'available' (nog vrij) — zie BoosterIconButton en toggleTeamPlannerBooster (FDRTool.jsx).
  const boosterState = (key) => {
    const usedGw = teamPlannerBoosters[key];
    if (usedGw === teamPlannerGw) return 'active';
    if (usedGw != null) return 'used-elsewhere';
    return 'available';
  };

  // Zolang rechargeDraft niet null is, bewerkt de spelerslijst-tabel hieronder het team ZOALS HET
  // ERUIT ZIET op de bekeken GW (teamPlannerResolvedPlayers) i.p.v. de statische GW1-basisploeg
  // (teamPlannerPlayers) — bevestigen zet elke gewijzigde rij om in een transfer op teamPlannerGw
  // (planTeamPlannerTransfer), zonder teamPlannerPlayers zelf ooit aan te raken.
  const rosterRowsData = rechargeDraft ?? teamPlannerPlayers;

  const handleStartRecharge = () => {
    setRechargeDraft(teamPlannerResolvedPlayers.map(p => ({ name: p.name, teamCode: p.teamCode, price: p.price })));
  };

  const handleConfirmRecharge = () => {
    if (!rechargeDraft || isRechargeInvalid) return;
    rechargeDraft.forEach((draftPlayer, index) => {
      const current = teamPlannerResolvedPlayers[index];
      const changed = draftPlayer.name !== current.name || draftPlayer.teamCode !== current.teamCode;
      if (changed && draftPlayer.name) {
        planTeamPlannerTransfer(index, teamPlannerGw, {
          name: draftPlayer.name, teamCode: draftPlayer.teamCode,
          position: TEAM_PLANNER_SLOT_POSITIONS[index], price: draftPlayer.price ?? null,
        });
      }
    });
    setRechargeDraft(null);
  };

  // Transfer-tijdlijn gegroepeerd per GW voor de "Transfers"-sectie hieronder. teamPlannerTransferHistory
  // (FDRTool.jsx) staat al gesorteerd op GW, dus aangrenzende entries met dezelfde GW simpelweg samen
  // in één groep zetten volstaat — geen Map/object nodig.
  const transferGroups = [];
  teamPlannerTransferHistory.forEach(entry => {
    const lastGroup = transferGroups[transferGroups.length - 1];
    if (lastGroup && lastGroup.gw === entry.gw) lastGroup.entries.push(entry);
    else transferGroups.push({ gw: entry.gw, entries: [entry] });
  });

  return (
    <>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
        Stel je selectie samen, plan transfers en bekijk je team, bank en kapitein op elk moment in het seizoen. Deze planner slaat automatisch op in je browser.
      </p>
      <TeamScreenshotUpload
        playerDatabase={playerDatabase}
        playerDatabaseLoading={playerDatabaseLoading}
        playerDatabaseError={playerDatabaseError}
        updateTeamPlannerPlayer={updateTeamPlannerPlayer}
        setTeamPlannerCaptain={setTeamPlannerCaptain}
        teamPlannerGw={teamPlannerGw}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
        <section>
          <div ref={rosterSectionRef} style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px', marginBottom: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {/* SectionHeader is zelf al een <button> (toggle voor in-/uitklappen) — "Wis team" moet
                  daarom een sibling zijn, geen kind, anders geeft dat ongeldige geneste <button>'s. */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <SectionHeader icon={Users} title="Mijn 15 spelers" sectionKey="teamPlannerRoster" isOpen={openSections.teamPlannerRoster} onToggle={toggleSection} />
              </div>
              <button
                onClick={handleClearTeamPlanner}
                disabled={isRosterEmpty}
                title={isRosterEmpty ? 'Team is al leeg' : 'Wis je volledige 15-koppige selectie'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                  background: 'transparent', color: isRosterEmpty ? '#5A4A72' : '#C2402C',
                  border: `1px solid ${isRosterEmpty ? 'rgba(255,255,255,0.15)' : 'rgba(194,64,44,0.4)'}`,
                  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px',
                  cursor: isRosterEmpty ? 'not-allowed' : 'pointer', marginBottom: '12px',
                }}
              >
                <Trash2 size={13} /> Wis team
              </button>
            </div>
            {openSections.teamPlannerRoster && (
              <>
                {/* Recharge-booster (zie FDRTool.jsx): laat de gebruiker het volledige team op de bekeken
                    GW herbekijken/herbewerken via deze zelfde tabel, i.p.v. spelers één voor één via
                    "Transfer plannen" te vervangen — zie rechargeDraft/handleConfirmRecharge hierboven. */}
                {isRechargeActiveForGw && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.4)',
                    borderRadius: '10px', padding: '10px 14px', marginBottom: '16px',
                  }}>
                    <RefreshCw size={16} color="#E8C547" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#E8C547', fontSize: '13px', flex: 1, fontWeight: 700 }}>
                      Recharge actief voor GW{teamPlannerGw}{rechargeDraft ? ' — bewerk je team hieronder' : ''}.
                    </span>
                    {rechargeDraft === null ? (
                      <button onClick={handleStartRecharge} style={{
                        background: 'transparent', color: '#E8C547', border: '1px solid #E8C547',
                        borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                      }}>
                        Start bewerking
                      </button>
                    ) : (
                      <>
                        {/* Onmogelijk te bevestigen zolang de bewerking het budget of de clublimiet
                            overschrijdt (isRechargeInvalid) — het validatie-overzicht hierboven toont
                            ondertussen al de reden (rood budget/clubtekst), dus enkel disabled + title
                            hier, geen dubbele foutmelding. */}
                        <button
                          onClick={handleConfirmRecharge}
                          disabled={isRechargeInvalid}
                          title={isRechargeInvalid ? 'Los eerst het budget of de clublimiet hierboven op' : undefined}
                          style={{
                            background: isRechargeInvalid ? 'rgba(255,255,255,0.08)' : '#4ECDC4',
                            color: isRechargeInvalid ? '#6B5289' : '#0B2E1B', border: 'none',
                            borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px',
                            cursor: isRechargeInvalid ? 'not-allowed' : 'pointer',
                          }}
                        >
                          Bevestig recharge
                        </button>
                        <button onClick={() => setRechargeDraft(null)} style={{
                          background: 'transparent', color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
                        }}>
                          Annuleer
                        </button>
                      </>
                    )}
                  </div>
                )}

                {/* Laad-/foutstatus van de spelersdatabank (Google Sheet CSV, zie fetchPlayerDatabase in
                    FDRTool.jsx) — zelfde patroon als de Spelerstatus-tab: spinner tijdens het laden, rode
                    foutmelding met "opnieuw proberen"-knop bij een mislukte fetch. Zolang de databank niet
                    geladen is, staat de zoek/autocomplete hieronder op disabled (zie PlayerSearchInput). */}
                {playerDatabaseLoading && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '16px' }}>
                    <Loader2 size={16} className="fdr-spin" /> Spelersdatabank laden...
                  </div>
                )}
                {!playerDatabaseLoading && playerDatabaseError && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                    background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
                    borderRadius: '10px', padding: '12px 14px', marginBottom: '16px'
                  }}>
                    <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
                    <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{playerDatabaseError}</span>
                    <button onClick={fetchPlayerDatabase} style={retryButtonStyle}>
                      <RotateCcw size={14} /> Probeer opnieuw
                    </button>
                  </div>
                )}

                {/* Validatie-overzicht: aantal ingevulde spelers en resterend budget, tellend vanaf
                    TEAM_PLANNER_BUDGET (100M) — zelfde weergave als de echte FPL-app ("Squad: x/15" +
                    "In the bank"), i.p.v. een "besteed/totaal"-framing. Buiten een Recharge-bewerking
                    toont dit de statische GW1-basisploeg (teamPlannerTotalPrice/ClubCounts, live
                    herberekend in FDRTool.jsx telkens teamPlannerPlayers wijzigt) — transfers wijzigen
                    dit dan niet. Zodra rechargeDraft actief is, toont/valideert dit blok in plaats
                    daarvan de bewerking zelf (effectiveTotalPrice/ClubCounts hierboven), zodat
                    overschrijden onmogelijk wordt gemaakt (zie isRechargeInvalid, dat "Bevestig
                    recharge" blokkeert). Positie-aantallen staan hier bewust niet bij: die liggen vast
                    per slot (TEAM_PLANNER_SLOT_POSITIONS) en zijn dus altijd exact 2 GK/5 DEF/5 MID/3 FWD. */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
                  background: 'rgba(255,255,255,0.04)',
                  border: isOverBudget ? '1px solid #C2402C' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '16px'
                }}>
                  <div style={{ color: '#FFF', fontWeight: 700, fontSize: '15px' }}>
                    Spelers: {effectiveRosterList.filter(p => p.name).length}/{TEAM_PLANNER_SQUAD_SIZE}
                  </div>
                  {/* Bij overschrijding volstaat het negatieve bedrag zelf (bv. "-3.0M") als signaal — geen
                      aparte "X.XM te veel"-herhaling van hetzelfde getal. Budget- en club-overschrijding
                      delen bewust dezelfde tekststijl (rood, vet, 15px), zodat beide even prominent ogen. */}
                  <div style={{ color: isOverBudget ? '#C2402C' : '#4ECDC4', fontWeight: 700, fontSize: '15px' }}>
                    Resterend budget: {remainingBudget.toFixed(1)}M
                  </div>
                  {overCapClubs.length > 0 && (
                    <div style={{ color: '#C2402C', fontWeight: 700, fontSize: '15px' }}>
                      Max {TEAM_PLANNER_MAX_PER_CLUB} per club: {overCapClubs.map(([code, count]) => `${teamNameFor(code)} (${count})`).join(', ')}
                    </div>
                  )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ borderCollapse: 'separate', borderSpacing: '0 4px', width: '100%', minWidth: '520px' }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>#</th>
                        <th style={thStyle}>Speler</th>
                        <th style={thStyle}>Positie</th>
                        <th style={thStyle}>Prijs (M)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rosterRowsData.map((player, index) => {
                        // Subtiele markering van de rijen die het "max per club"-probleem veroorzaken —
                        // een dun rood randje + lichte tint, zelfde rode kleur als de waarschuwingstekst
                        // hierboven, maar zonder de tabel drukker te maken dan nodig.
                        const isOverCapClub = player.teamCode && overCapClubCodes.has(player.teamCode);
                        const rowBg = isOverCapClub ? 'rgba(194,64,44,0.08)' : 'transparent';
                        return (
                          <tr key={index}>
                            <td style={{
                              color: '#6B5289', fontSize: '12px', padding: '4px 8px', background: rowBg,
                              borderLeft: isOverCapClub ? '3px solid #C2402C' : '3px solid transparent',
                            }}>
                              {index + 1}
                            </td>
                            <td style={{ padding: '4px 6px', width: '110px', background: rowBg }}>
                              {/* filterPosition beperkt de suggesties tot de vaste positie van dit slot
                                  (TEAM_PLANNER_SLOT_POSITIONS) — zo blijft de 2 GK/5 DEF/5 MID/3 FWD-
                                  structuur altijd kloppen, ook tijdens een Recharge-bewerking. Buiten
                                  Recharge vult dit de GW1-basisploeg in (updateTeamPlannerPlayer); tijdens
                                  Recharge (rechargeDraft niet null) schrijft een keuze enkel naar de lokale
                                  draft, pas "Bevestig recharge" zet gewijzigde rijen om in transfers.
                                  excludeUsedPlayers verwijdert spelers die al in een ANDER slot zitten van
                                  dezelfde lijst (rosterRowsData) — zo kan dezelfde speler nooit twee keer
                                  in de 15 voorkomen, in beide modi. */}
                              <PlayerSearchInput
                                value={player.name}
                                players={excludeUsedPlayers(playerDatabase, rosterRowsData.filter((_, i) => i !== index))}
                                filterPosition={TEAM_PLANNER_SLOT_POSITIONS[index]}
                                disabled={playerDatabaseLoading || !!playerDatabaseError}
                                placeholder={playerDatabaseLoading ? 'Databank laden...' : `Zoek ${TEAM_PLANNER_SLOT_POSITIONS[index]}...`}
                                onSelect={(selected) => {
                                  if (rechargeDraft) {
                                    setRechargeDraft(prev => prev.map((p, i) => (
                                      i === index ? { name: selected.name, teamCode: selected.teamCode, price: selected.price ?? '' } : p
                                    )));
                                  } else {
                                    updateTeamPlannerPlayer(index, 'name', selected.name);
                                    updateTeamPlannerPlayer(index, 'teamCode', selected.teamCode);
                                    updateTeamPlannerPlayer(index, 'price', selected.price ?? '');
                                  }
                                }}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', color: '#C9B8E0', fontSize: '13px', fontWeight: 700, background: rowBg }}>
                              {TEAM_PLANNER_SLOT_POSITIONS[index]}
                            </td>
                            <td style={{ padding: '4px 6px', width: '80px', color: '#FFF', fontSize: '13px', fontWeight: 700, background: rowBg }}>
                              {formatPrice(player.price)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>

        <section>
          <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
            <Shirt size={18} color="#4ECDC4" /> Veld
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '4px' }}>
            <button
              onClick={handleTeamPlannerGwPrev}
              disabled={teamPlannerGw <= 1}
              aria-label="Vorige gameweek"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px',
                background: 'transparent', color: teamPlannerGw <= 1 ? '#5A4A72' : '#C9B8E0',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                cursor: teamPlannerGw <= 1 ? 'default' : 'pointer'
              }}
            >
              <ChevronLeft size={16} />
            </button>
            <span className="fdr-title" style={{ color: '#FFF', fontWeight: 900, fontSize: '16px', minWidth: '60px', textAlign: 'center' }}>
              GW{teamPlannerGw}
            </span>
            <button
              onClick={handleTeamPlannerGwNext}
              disabled={teamPlannerGw >= GW_COUNT}
              aria-label="Volgende gameweek"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px',
                background: 'transparent', color: teamPlannerGw >= GW_COUNT ? '#5A4A72' : '#C9B8E0',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                cursor: teamPlannerGw >= GW_COUNT ? 'default' : 'pointer'
              }}
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Handmatig bij te werken deadline-tekst per GW (zie GW_DEADLINES in constants.js) — klein en
              subtiel, enkel getoond als er voor deze GW iets is ingevuld. */}
          {GW_DEADLINES[teamPlannerGw] && (
            <p style={{ textAlign: 'center', color: '#8F79AD', fontSize: '10px', margin: '0 0 12px' }}>
              Deadline: {GW_DEADLINES[teamPlannerGw]}
            </p>
          )}

          {/* Transfer plannen voor de bekeken GW — zie TransferPanel hierboven. Geconfirmeerde transfers
              gelden meteen vanaf deze GW en alle latere GW's, tot een nieuwe transfer op datzelfde slot. */}
          <TransferPanel
            gw={teamPlannerGw}
            resolvedIndexedPlayers={resolvedIndexedPlayers}
            playerDatabase={playerDatabase}
            playerDatabaseLoading={playerDatabaseLoading}
            playerDatabaseError={playerDatabaseError}
            onConfirm={planTeamPlannerTransfer}
            externalOutIndex={transferOutIndex}
            onExternalOutIndexConsumed={() => setTransferOutIndex(null)}
            onOpenChange={setIsTransferPanelOpen}
          />

          {/* Bank-, formatie- en kapiteinsstatus voor de bekeken GW — klik op een speler op het veld/
              de bank hieronder om de bank aan te passen; de kapitein wordt expliciet gekozen via de
              dropdown (i.p.v. een knop per kaart, wat 11 grotendeels inactieve "C"-badges zou geven). */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', justifyContent: 'center', marginBottom: '6px' }}>
            <span style={{
              fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
              ...countBadgeStyle(benchCount, TEAM_PLANNER_BENCH_SIZE)
            }}>
              Bank: {benchCount}/{TEAM_PLANNER_BENCH_SIZE}
            </span>
            <span style={{
              fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
              ...formationBadgeStyle(isBenchComplete, isValidFormation)
            }}>
              Formatie: {defCount}-{midCount}-{fwdCount}
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ color: '#8F79AD', fontSize: '12px' }}>Kapitein</span>
              <select
                value={captainForGw ?? ''}
                onChange={e => setTeamPlannerCaptain(e.target.value === '' ? null : Number(e.target.value))}
                style={{ ...teamPlannerInputStyle, width: 'auto', padding: '4px 8px', fontSize: '12px' }}
              >
                <option value="">Geen kapitein</option>
                {captainOptions.map(p => (
                  <option key={p.index} value={p.index}>{p.name || `Speler ${p.index + 1}`}</option>
                ))}
              </select>
            </label>
          </div>
          {!isBenchComplete && (
            <p style={{ textAlign: 'center', color: '#8F79AD', fontSize: '12px', margin: '0 0 12px' }}>
              Kies exact {TEAM_PLANNER_BENCH_SIZE} bankspelers voor GW{teamPlannerGw} om je formatie te valideren.
            </p>
          )}
          {isBenchComplete && !isValidFormation && (
            <p style={{ textAlign: 'center', color: '#C2402C', fontSize: '12px', margin: '0 0 12px' }}>
              Ongeldige formatie ({defCount}-{midCount}-{fwdCount}, GK: {gkCount}). Geldige opties: 3-4-3, 3-5-2, 4-3-3, 4-4-2, 4-5-1, 5-3-2, 5-4-1 met exact 1 doelman.
            </p>
          )}

          {/* Zelfde korte-tekstje-patroon als de Bankzitters-banner bij de bank hieronder — maakt
              duidelijk dat de booster actief is voor deze GW, zonder dat de gebruiker de kapitein-
              badge op het veld hoeft op te merken. */}
          {isTripleCaptainActive && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px',
              background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.4)',
              borderRadius: '8px', padding: '6px 10px', color: '#E8C547', fontSize: '12px', fontWeight: 700,
            }}>
              <Star size={14} /> Driedubbele kapitein actief voor GW{teamPlannerGw} — de kapitein telt 3× mee.
            </div>
          )}
          {isRechargeActiveForGw && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '10px',
              background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.4)',
              borderRadius: '8px', padding: '6px 10px', color: '#E8C547', fontSize: '12px', fontWeight: 700,
            }}>
              <RefreshCw size={14} /> Recharge actief voor GW{teamPlannerGw} — bewerk je volledige team bij "Mijn 15 spelers" hierboven.
            </div>
          )}

          <div className="fdr-pitch-container" style={{
            position: 'relative',
            background: 'linear-gradient(180deg, rgba(78,205,196,0.08), rgba(78,205,196,0.02))',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px'
          }}>
            {/* Gratis-transfersaldo linksboven IN het veld-kaartje — de overkant van de booster-stapel
                rechtsboven hieronder. Zie teamPlannerTransferBudget (FDRTool.jsx/constants.js). GW1
                heeft geen entry (onbeperkte initiële teamopbouw, geen "echte" transfers), vandaar de
                guard. Toont hoeveel van het gratis aantal nog OVER is NA de transfers die al gepland
                zijn voor deze GW (freeAvailable - used), zodat de gebruiker vooraf weet of zijn
                volgende transfer hier nog gratis is — vóór hij "Transfer plannen" hierboven gebruikt. */}
            {teamPlannerGw > 1 && teamPlannerTransferBudget[teamPlannerGw] && (() => {
              const budget = teamPlannerTransferBudget[teamPlannerGw];
              const remainingFree = Math.max(0, budget.freeAvailable - budget.used);
              return (
                <div style={{ position: 'absolute', top: '8px', left: '8px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 2, maxWidth: '130px' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px',
                    ...transferBudgetBadgeStyle(budget.isRecharge, remainingFree),
                  }}>
                    {budget.isRecharge ? 'Recharge: gratis' : `${remainingFree} gratis transfer${remainingFree === 1 ? '' : 's'}`}
                  </span>
                  {/* Enkel getoond zodra er effectief al puntenkost is opgelopen deze GW — de volledige
                      "X transfers, Y gratis"-uitleg staat al in de title-tooltip én, voluit, bij de
                      Transfers-sectie verderop; hier blijft het compact voor de krappe hoek. */}
                  {budget.pointsCost > 0 && (
                    <span
                      title={`${budget.used} transfers, ${Math.min(budget.used, budget.freeAvailable)} gratis`}
                      style={{ color: '#C2402C', fontSize: '11px', fontWeight: 700 }}
                    >
                      -{budget.pointsCost} punten
                    </span>
                  )}
                </div>
              );
            })()}

            {/* Booster-stapel: subtiele iconen rechtsboven IN het veld-kaartje zelf (niet erboven) — zie
                toggleTeamPlannerBooster (FDRTool.jsx) voor de vergrendel-/vervang-logica. Enkel binnen
                GW1-7 handmatig te activeren; GW8 krijgt automatisch (en gratis — telt niet als
                "verbruikt") een Recharge voor iedereen, dus daar tonen we enkel dat ene, niet-klikbare,
                actief-gemarkeerde icoon i.p.v. de volledige 3-stapel (zie isRechargeActiveForGw). */}
            <div style={{ position: 'absolute', top: '8px', right: '8px', display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 2 }}>
              {teamPlannerGw <= 7 ? (
                <>
                  <BoosterIconButton icon={Armchair} title="Bankzitters" state={boosterState('benchBoost')} onClick={() => toggleTeamPlannerBooster('benchBoost', teamPlannerGw)} />
                  <BoosterIconButton label="3×" title="Driedubbele kapitein" state={boosterState('tripleCaptain')} onClick={() => toggleTeamPlannerBooster('tripleCaptain', teamPlannerGw)} />
                  <BoosterIconButton icon={RefreshCw} title="Recharge" state={boosterState('recharge')} onClick={handleActivateRecharge} />
                </>
              ) : (
                <BoosterIconButton icon={RefreshCw} title="Recharge — automatisch voor iedereen op GW8" state="active" onClick={() => {}} />
              )}
            </div>
            {PITCH_ROW_ORDER.map(pos => {
              const rowPlayers = resolvedIndexedPlayers.filter(p => p.position === pos && !benchForGw.includes(p.index));
              return (
                <div
                  key={pos}
                  className="fdr-pitch-row"
                  style={{
                    display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '16px',
                    // Nooit wrappen naar een 2de regel per positie (altijd exact 4 rijen: FWD/MID/DEF/GK).
                    // Geen overflowX/overflowY meer hier: kaartgroottes (zie mobile media query) zijn al zo
                    // afgestemd dat een rij nooit meer moet scrollen, en overflow:hidden sneed voorheen de
                    // kapitein-badge af (die met een negatieve top/right-offset net buiten zijn kaartje
                    // uitsteekt) — overflow:visible (het default, dus simpelweg weglaten) laat die badge
                    // altijd volledig zien.
                    flexWrap: 'nowrap', padding: '2px',
                  }}
                >
                  {rowPlayers.length === 0 ? (
                    <span style={{ color: '#6B5289', fontSize: '11px', textTransform: 'uppercase' }}>{pos}</span>
                  ) : (
                    rowPlayers.map(player => (
                      <PlayerPitchCard
                        key={player.index}
                        player={player}
                        gw={teamPlannerGw}
                        ratings={ratings}
                        homeAdvantage={homeAdvantage}
                        isBenched={false}
                        isCaptain={captainForGw === player.index}
                        isTripleCaptainActive={isTripleCaptainActive}
                        onToggleBench={() => toggleTeamPlannerBench(player.index)}
                        onSelectForTransfer={isTransferPanelOpen ? () => setTransferOutIndex(player.index) : undefined}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '16px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '10px', marginBottom: '10px',
            }}>
              {/* "Herschik bank" staat bewust vlak naast het label (links), niet meer samen met
                  "Optimaliseer opstelling" rechts — dat schakelt de betekenis van een klik op een
                  bankkaartje om (zie isBenchReorderMode/PlayerPitchCard hierboven) en hoort daardoor
                  qua betekenis dichter bij "wat toon/regel ik hier" dan een losstaande actie zoals
                  optimaliseren. flexWrap zorgt dat dit linkerdeel op erg smalle schermen netjes
                  onder elkaar/naast elkaar uitvalt i.p.v. iets af te knijpen. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <h3 className="fdr-title" style={{ color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0 }}>
                  Bank — GW{teamPlannerGw}
                </h3>
                <button
                  onClick={() => setIsBenchReorderMode(o => !o)}
                  disabled={benchOutfieldPlayers.length < 2}
                  title={benchOutfieldPlayers.length < 2 ? 'Minstens 2 niet-keeper bankspelers nodig om te herschikken' : undefined}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    background: isBenchReorderMode ? '#4ECDC4' : 'transparent',
                    color: isBenchReorderMode ? '#0B2E1B' : benchOutfieldPlayers.length < 2 ? '#5A4A72' : '#4ECDC4',
                    border: `1px solid ${isBenchReorderMode ? '#4ECDC4' : benchOutfieldPlayers.length < 2 ? 'rgba(255,255,255,0.15)' : '#4ECDC4'}`,
                    borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px',
                    cursor: benchOutfieldPlayers.length < 2 ? 'not-allowed' : 'pointer',
                  }}
                >
                  <ArrowUpDown size={14} /> {isBenchReorderMode ? 'Klaar met herschikken' : 'Herschik bank'}
                </button>
              </div>
              <button onClick={handleOptimizeTeamPlannerLineup} style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'transparent',
                color: '#4ECDC4', border: '1px solid #4ECDC4', borderRadius: '8px',
                padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', flexShrink: 0,
              }}>
                <Wand2 size={14} /> Optimaliseer opstelling
              </button>
            </div>
            {teamPlannerOptimized && (
              <p style={{ color: '#4ECDC4', fontSize: '12px', margin: '0 0 10px' }}>
                Opstelling geoptimaliseerd voor GW{teamPlannerGw}.
              </p>
            )}
            {isBenchBoostActive && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px',
                background: 'rgba(78,205,196,0.12)', border: '1px solid rgba(78,205,196,0.4)',
                borderRadius: '8px', padding: '6px 10px', color: '#4ECDC4', fontSize: '12px', fontWeight: 700,
              }}>
                <Zap size={14} /> Bankzitters actief voor GW{teamPlannerGw} — bankspelers tellen mee.
              </div>
            )}
            {isBenchReorderMode && (
              <p style={{ color: '#4ECDC4', fontSize: '11px', margin: '0 0 8px' }}>
                Herschik-modus actief: klik een bankspeler (niet de keeper) aan, en daarna een andere, om ze van plaats te wisselen.
              </p>
            )}
            {benchPlayers.length === 0 ? (
              <p style={{ color: '#6B5289', fontSize: '13px' }}>Nog geen bankspelers voor deze GW. Klik een speler op het veld aan om 'm naar de bank te sturen.</p>
            ) : (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {benchPlayers.map(player => {
                  const isGkCard = player.position === 'GK';
                  return (
                    <PlayerPitchCard
                      key={player.index}
                      player={player}
                      gw={teamPlannerGw}
                      ratings={ratings}
                      homeAdvantage={homeAdvantage}
                      isBenched
                      isCaptain={false}
                      accentActive={isBenchBoostActive}
                      benchToggleDisabled={isBenchReorderMode && isGkCard}
                      onToggleBench={
                        isBenchReorderMode
                          ? (isGkCard ? undefined : () => handleSelectForSwap(player.index))
                          : () => toggleTeamPlannerBench(player.index)
                      }
                      onSelectForTransfer={isTransferPanelOpen ? () => setTransferOutIndex(player.index) : undefined}
                      benchReorderMode={isBenchReorderMode}
                      isSelectedForSwap={benchSwapSlot === player.index}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px'
          }}>
            {/* SectionHeader is zelf al een <button> (toggle voor in-/uitklappen) — "Wis alle transfers"
                moet daarom een sibling zijn, geen kind (ongeldige geneste <button>'s), en blijft zo ook
                zichtbaar/bruikbaar zonder de sectie eerst open te klikken — zelfde patroon als "Wis
                team" bij "Mijn 15 spelers" hierboven. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <SectionHeader icon={ArrowLeftRight} title="Transfers" sectionKey="teamPlannerTransfers" isOpen={openSections.teamPlannerTransfers} onToggle={toggleSection} />
              </div>
              <button
                onClick={handleClearTeamPlannerTransfers}
                disabled={transferGroups.length === 0}
                title={transferGroups.length === 0 ? 'Nog geen transfers om te wissen' : 'Wis alle geplande transfers'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                  background: 'transparent', color: transferGroups.length === 0 ? '#5A4A72' : '#C2402C',
                  border: `1px solid ${transferGroups.length === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(194,64,44,0.4)'}`,
                  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px',
                  cursor: transferGroups.length === 0 ? 'not-allowed' : 'pointer', marginBottom: '12px',
                }}
              >
                <Trash2 size={13} /> Wis alle transfers
              </button>
            </div>
            {openSections.teamPlannerTransfers && (
              transferGroups.length === 0 ? (
                <p style={{ color: '#6B5289', fontSize: '13px' }}>
                  Nog geen transfers gepland. Gebruik "Transfer plannen" bij het veld hierboven om spelers vanaf een gekozen GW te vervangen.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {transferGroups.map(group => (
                    <div key={group.gw}>
                      <h3 className="fdr-title" style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 8px',
                      }}>
                        GW{group.gw}
                        {/* isRechargeActiveForGwRule (constants.js, zelfde bron van waarheid als hierboven
                            en als de transfer-budgetberekening) dekt zowel een handmatig geactiveerde
                            Recharge op precies deze GW als GW8's automatische Recharge voor iedereen. */}
                        {isRechargeActiveForGwRule(teamPlannerBoosters, group.gw) && (
                          <RefreshCw size={12} color="#E8C547" title="Recharge" />
                        )}
                        {teamPlannerTransferBudget[group.gw]?.pointsCost > 0 && (
                          <span
                            title={`${teamPlannerTransferBudget[group.gw].used} transfers, ${Math.min(teamPlannerTransferBudget[group.gw].used, teamPlannerTransferBudget[group.gw].freeAvailable)} gratis`}
                            style={{
                              background: 'rgba(194,64,44,0.15)', color: '#FF9E90', fontSize: '10px', fontWeight: 900,
                              padding: '1px 6px', borderRadius: '999px', textTransform: 'none', letterSpacing: 'normal',
                            }}
                          >
                            -{teamPlannerTransferBudget[group.gw].pointsCost} punten
                          </span>
                        )}
                      </h3>
                      <div style={{ display: 'grid', gap: '6px' }}>
                        {group.entries.map(entry => (
                          <div key={entry.id} style={{
                            display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
                            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '8px', padding: '8px 10px'
                          }}>
                            <img
                              src={`/club-logos/${entry.outPlayer.teamCode}.png`}
                              alt=""
                              className="club-logo"
                              style={{ width: '18px', height: '18px', objectFit: 'contain', flexShrink: 0 }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span style={{ color: '#FFF', fontSize: '13px' }}>
                              {entry.outPlayer.name || '—'}{' '}
                              <span style={{ color: '#8F79AD', fontSize: '11px' }}>({formatPrice(entry.outPlayer.price)})</span>
                            </span>
                            <ArrowRight size={14} color="#4ECDC4" style={{ flexShrink: 0 }} />
                            <img
                              src={`/club-logos/${entry.inPlayer.teamCode}.png`}
                              alt=""
                              className="club-logo"
                              style={{ width: '18px', height: '18px', objectFit: 'contain', flexShrink: 0 }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                            <span style={{ color: '#FFF', fontSize: '13px', fontWeight: 700, flex: 1, minWidth: 0 }}>
                              {entry.inPlayer.name}{' '}
                              <span style={{ color: '#4ECDC4', fontSize: '11px' }}>({formatPrice(entry.inPlayer.price)})</span>
                            </span>
                            <button
                              onClick={() => removeTeamPlannerTransfer(entry.slotIndex, entry.id)}
                              aria-label={`Verwijder transfer ${entry.outPlayer.name} naar ${entry.inPlayer.name}`}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', width: '24px', height: '24px', flexShrink: 0,
                                background: 'transparent', color: '#8F79AD', border: 'none', borderRadius: '6px', cursor: 'pointer'
                              }}
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        </section>
      </div>
    </>
  );
}
