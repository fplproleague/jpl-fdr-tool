// Inhoud van de Team Planner-tab: handmatige invoer van een 15-koppige selectie, met live budget-/
// club-validatie, een veld-weergave met per-GW fixtures/bank/kapitein, en een transfer-laag erbovenop
// (spelers vervangen vanaf een gekozen GW, tijdgebonden — zie het commentaar bij TransferPanel/
// resolvedIndexedPlayers hieronder). Ontvangt alle state en handlers als props vanuit FDRTool.jsx
// (geen domein-state hier) — de tab-content wordt conditioneel gemount/unmount bij het wisselen van
// tab, dus lokale state zou resetten telkens de gebruiker weg- en terugnavigeert. Uitzondering: de
// transfer-DRAFT in TransferPanel (welke OUT/IN nog niet bevestigd is) is bewust wél lokale useState,
// net als PlayerSearchInput's eigen zoekveld-state — voorbijgaande UI-invoer, geen domein-data.

import { useState } from 'react';
import {
  Users, Shirt, ChevronLeft, ChevronRight, Loader2, AlertCircle, RotateCcw,
  ArrowLeftRight, ArrowRight, X,
} from 'lucide-react';
import {
  TEAMS, FIXTURES, GW_COUNT,
  TEAM_PLANNER_BUDGET, TEAM_PLANNER_MAX_PER_CLUB, TEAM_PLANNER_BENCH_SIZE, VALID_FORMATIONS,
  sectionTitleStyle,
} from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { SectionHeader } from '../components/SectionHeader';
import { PlayerSearchInput } from '../components/PlayerSearchInput';

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

// Alleen voor de veld-weergave hieronder — GK onderaan, FWD bovenaan (omgekeerd van POSITIONS,
// dat de canonieke volgorde voor het formulier en de positie-telling levert).
const PITCH_ROW_ORDER = ['FWD', 'MID', 'DEF', 'GK'];

// Kleurstaat voor een "x/y"-telling: compleet (teal), te vol (rood, zelfde rood als elders in de app
// voor "moeilijkst"/waarschuwingen), nog te kort (neutraal gedempt — geen waarschuwingskleur, want
// een half ingevuld formulier of een nog niet volledige bank is nog geen fout). Gebruikt voor zowel
// de positie-tellers als de bank-teller in de veld-sectie hieronder.
function countBadgeStyle(count, required) {
  if (count === required) return { background: '#4ECDC4', color: '#0B2E1B' };
  if (count > required) return { background: '#C2402C', color: '#FBEAE7' };
  return { background: 'rgba(255,255,255,0.08)', color: '#C9B8E0' };
}

// Kleurstaat voor de formatie-pill: neutraal zolang de bank nog niet exact 4 spelers telt (de
// basisploeg staat dan nog niet vast op 11), anders teal (geldig) of rood (ongeldig).
function formationBadgeStyle(isBenchComplete, isValidFormation) {
  if (!isBenchComplete) return { background: 'rgba(255,255,255,0.08)', color: '#C9B8E0' };
  return isValidFormation ? { background: '#4ECDC4', color: '#0B2E1B' } : { background: '#C2402C', color: '#FBEAE7' };
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
function PlayerPitchCard({ player, gw, ratings, homeAdvantage, isBenched, isCaptain, benchToggleDisabled, onToggleBench }) {
  if (!player.name && !player.teamCode) return null;
  const fixture = player.teamCode ? FIXTURES[player.teamCode]?.[gw - 1] : null;
  return (
    <div style={{ position: 'relative' }}>
      {isCaptain && (
        <span
          title="Kapitein voor deze GW"
          style={{
            position: 'absolute', top: '-6px', right: '-6px', zIndex: 1,
            width: '20px', height: '20px', borderRadius: '50%', display: 'flex',
            alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 900,
            lineHeight: 1, background: '#4ECDC4', color: '#0B2E1B', border: '1px solid #4ECDC4',
          }}
        >
          C
        </span>
      )}
      <button
        onClick={onToggleBench}
        disabled={benchToggleDisabled}
        title={
          isBenched ? 'Klik om terug naar het veld te zetten'
            : benchToggleDisabled ? `Bank is al vol (${TEAM_PLANNER_BENCH_SIZE}/${TEAM_PLANNER_BENCH_SIZE}) voor GW${gw}`
              : 'Klik om naar de bank te sturen'
        }
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '10px', padding: '8px 10px', minWidth: '78px', flexShrink: 0,
          cursor: benchToggleDisabled ? 'not-allowed' : 'pointer',
        }}
      >
        {player.teamCode && (
          <img
            src={`/club-logos/${player.teamCode}.png`}
            alt=""
            className="club-logo"
            style={{ width: '24px', height: '24px', objectFit: 'contain' }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <span style={{ color: '#FFF', fontSize: '11px', fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
          {player.name || '—'}
        </span>
        {fixture && (
          <MiniFixtureBadge teamCode={player.teamCode} fixture={fixture} gwNumber={gw} ratings={ratings} homeAdvantage={homeAdvantage} />
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
function TransferPanel({ gw, resolvedIndexedPlayers, playerDatabase, playerDatabaseLoading, playerDatabaseError, onConfirm }) {
  const [isOpen, setIsOpen] = useState(false);
  const [outIndex, setOutIndex] = useState('');
  const [inPlayer, setInPlayer] = useState(null);

  // Enkel gevulde slots kunnen "uit" — een leeg slot heeft niets om te vervangen.
  const outOptions = resolvedIndexedPlayers.filter(p => p.name || p.teamCode);
  const outPlayer = outIndex !== '' ? resolvedIndexedPlayers[Number(outIndex)] : null;

  const resetDraft = () => { setOutIndex(''); setInPlayer(null); };
  const handleToggle = () => { setIsOpen(o => !o); resetDraft(); };

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
    <div style={{ marginBottom: '16px' }}>
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
  teamPlannerResolvedPlayers, teamPlannerTransferHistory, planTeamPlannerTransfer, removeTeamPlannerTransfer,
}) {
  const remainingBudget = TEAM_PLANNER_BUDGET - teamPlannerTotalPrice;
  const isOverBudget = teamPlannerTotalPrice > TEAM_PLANNER_BUDGET;

  // Clubs met te veel spelers — enkel gebruikt om de waarschuwingstekst hieronder op te bouwen,
  // de daadwerkelijke telling zelf gebeurt al in FDRTool.jsx (teamPlannerClubCounts).
  const overCapClubs = Object.entries(teamPlannerClubCounts).filter(([, count]) => count > TEAM_PLANNER_MAX_PER_CLUB);

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
  const benchFull = benchCount >= TEAM_PLANNER_BENCH_SIZE;
  const benchPlayers = resolvedIndexedPlayers.filter(p => benchForGw.includes(p.index));

  // Kandidaten voor de kapitein-dropdown: enkel basisspelers (niet gebankt) die al iets ingevuld
  // hebben — een volledig leeg slot heeft niets om kapitein van te maken.
  const captainOptions = resolvedIndexedPlayers.filter(p => !benchForGw.includes(p.index) && (p.name || p.teamCode));

  // Formatie-validatie: enkel zinvol zodra de bank exact 4 spelers telt (dan staat de basisploeg
  // vast op 11) — zie VALID_FORMATIONS in constants.js voor de toegestane DEF-MID-FWD-combinaties.
  const { GK: gkCount, DEF: defCount, MID: midCount, FWD: fwdCount } = teamPlannerFormationCounts;
  const matchesValidFormation = VALID_FORMATIONS.some(([d, m, f]) => d === defCount && m === midCount && f === fwdCount);
  const isValidFormation = isBenchComplete && gkCount === 1 && matchesValidFormation;

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
        Stel je 15-koppige selectie samen, plan transfers per gameweek, en bekijk je team, bank en kapitein op elk moment in het seizoen. Deze planner slaat automatisch op in je browser.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
        <section>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px', marginBottom: '20px'
          }}>
            <SectionHeader icon={Users} title="Mijn 15 spelers" sectionKey="teamPlannerRoster" isOpen={openSections.teamPlannerRoster} onToggle={toggleSection} />
            {openSections.teamPlannerRoster && (
              <>
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

                {/* Validatie-overzicht: budget en club-limiet — live herberekend in FDRTool.jsx
                    (teamPlannerTotalPrice/ClubCounts) telkens teamPlannerPlayers wijzigt, dus dit blok
                    volgt vanzelf elke invoer hieronder zonder eigen state. Positie-aantallen staan hier
                    bewust niet meer bij: die liggen vast per slot (TEAM_PLANNER_SLOT_POSITIONS) en zijn
                    dus altijd exact 2 GK/5 DEF/5 MID/3 FWD. Dit blok toont bewust de GW1-basisploeg, niet
                    het team-op-de-bekeken-GW — transfers wijzigen dus dit budget-overzicht niet. */}
                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
                  background: 'rgba(255,255,255,0.04)',
                  border: isOverBudget ? '1px solid #C2402C' : '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '16px'
                }}>
                  <div style={{ color: isOverBudget ? '#C2402C' : '#FFF', fontWeight: 700, fontSize: '15px' }}>
                    {teamPlannerTotalPrice.toFixed(1)}M / {TEAM_PLANNER_BUDGET}M
                    {isOverBudget && ` — ${Math.abs(remainingBudget).toFixed(1)}M te veel`}
                  </div>
                  {overCapClubs.length > 0 && (
                    <div style={{ color: '#C2402C', fontSize: '12px' }}>
                      Max {TEAM_PLANNER_MAX_PER_CLUB} per club overschreden bij:{' '}
                      {overCapClubs.map(([code, count]) => `${teamNameFor(code)} (${count})`).join(', ')}
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
                      {teamPlannerPlayers.map((player, index) => (
                        <tr key={index}>
                          <td style={{ color: '#6B5289', fontSize: '12px', padding: '4px 8px' }}>{index + 1}</td>
                          <td style={{ padding: '4px 6px', minWidth: '220px' }}>
                            {/* filterPosition beperkt de suggesties tot de vaste positie van dit slot
                                (player.position, zie TEAM_PLANNER_SLOT_POSITIONS) — zo blijft de
                                2 GK/5 DEF/5 MID/3 FWD-structuur altijd kloppen: wat je ook kiest, het
                                is altijd een speler met de juiste positie voor dit slot. Dit vult de
                                GW1-basisploeg in; transfers (hieronder bij "Veld") wijzigen dit niet.
                                excludeUsedPlayers verwijdert spelers die al in een ANDER slot zitten
                                (niet dit slot zelf, anders zou je je eigen huidige keuze niet meer
                                terugzien) — zo kan dezelfde speler nooit twee keer in de 15 voorkomen. */}
                            <PlayerSearchInput
                              value={player.name}
                              players={excludeUsedPlayers(playerDatabase, teamPlannerPlayers.filter((_, i) => i !== index))}
                              filterPosition={player.position}
                              disabled={playerDatabaseLoading || !!playerDatabaseError}
                              placeholder={playerDatabaseLoading ? 'Databank laden...' : `Zoek ${player.position}...`}
                              onSelect={(selected) => {
                                updateTeamPlannerPlayer(index, 'name', selected.name);
                                updateTeamPlannerPlayer(index, 'teamCode', selected.teamCode);
                                updateTeamPlannerPlayer(index, 'price', selected.price ?? '');
                              }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px', color: '#C9B8E0', fontSize: '13px', fontWeight: 700 }}>
                            {player.position}
                          </td>
                          <td style={{ padding: '4px 6px', width: '80px', color: '#FFF', fontSize: '13px', fontWeight: 700 }}>
                            {formatPrice(player.price)}
                          </td>
                        </tr>
                      ))}
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

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '12px' }}>
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

          {/* Transfer plannen voor de bekeken GW — zie TransferPanel hierboven. Geconfirmeerde transfers
              gelden meteen vanaf deze GW en alle latere GW's, tot een nieuwe transfer op datzelfde slot. */}
          <TransferPanel
            gw={teamPlannerGw}
            resolvedIndexedPlayers={resolvedIndexedPlayers}
            playerDatabase={playerDatabase}
            playerDatabaseLoading={playerDatabaseLoading}
            playerDatabaseError={playerDatabaseError}
            onConfirm={planTeamPlannerTransfer}
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

          <div style={{
            background: 'linear-gradient(180deg, rgba(78,205,196,0.08), rgba(78,205,196,0.02))',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px'
          }}>
            {PITCH_ROW_ORDER.map(pos => {
              const rowPlayers = resolvedIndexedPlayers.filter(p => p.position === pos && !benchForGw.includes(p.index));
              return (
                <div
                  key={pos}
                  className="fdr-pitch-row"
                  style={{
                    display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '16px',
                    // Nooit wrappen naar een 2de regel per positie (altijd exact 4 rijen: FWD/MID/DEF/GK)
                    // — op smalle schermen past een volle rij van 5 kaarten niet, dus die rij scrollt dan
                    // gewoon horizontaal i.p.v. te wrappen. Moderne flexbox "safe center" zorgt ervoor dat
                    // een overlopende rij automatisch links start i.p.v. het begin onbereikbaar af te snijden.
                    flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden', padding: '2px',
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
                        benchToggleDisabled={benchFull}
                        onToggleBench={() => toggleTeamPlannerBench(player.index)}
                      />
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ marginTop: '16px' }}>
            <h3 className="fdr-title" style={{ color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 10px' }}>
              Bank — GW{teamPlannerGw}
            </h3>
            {benchPlayers.length === 0 ? (
              <p style={{ color: '#6B5289', fontSize: '13px' }}>Nog geen bankspelers voor deze GW. Klik een speler op het veld aan om 'm naar de bank te sturen.</p>
            ) : (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {benchPlayers.map(player => (
                  <PlayerPitchCard
                    key={player.index}
                    player={player}
                    gw={teamPlannerGw}
                    ratings={ratings}
                    homeAdvantage={homeAdvantage}
                    isBenched
                    isCaptain={false}
                    benchToggleDisabled={false}
                    onToggleBench={() => toggleTeamPlannerBench(player.index)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px'
          }}>
            <SectionHeader icon={ArrowLeftRight} title="Transfers" sectionKey="teamPlannerTransfers" isOpen={openSections.teamPlannerTransfers} onToggle={toggleSection} />
            {openSections.teamPlannerTransfers && (
              transferGroups.length === 0 ? (
                <p style={{ color: '#6B5289', fontSize: '13px' }}>
                  Nog geen transfers gepland. Gebruik "Transfer plannen" bij het veld hierboven om spelers vanaf een gekozen GW te vervangen.
                </p>
              ) : (
                <div style={{ display: 'grid', gap: '16px' }}>
                  {transferGroups.map(group => (
                    <div key={group.gw}>
                      <h3 className="fdr-title" style={{ color: '#C9B8E0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: '0 0 8px' }}>
                        GW{group.gw}
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
