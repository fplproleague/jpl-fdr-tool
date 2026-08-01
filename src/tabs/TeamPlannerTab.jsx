// Inhoud van de Team Planner-tab: handmatige invoer van een 15-koppige selectie (Fase 1, geen
// externe spelersdatabank), met live budget-/positie-/club-validatie en een eenvoudige veld-
// weergave met per-GW fixtures. Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen
// lokale useState hier) — de tab-content wordt conditioneel gemount/unmount bij het wisselen van
// tab, dus lokale state zou resetten telkens de gebruiker weg- en terugnavigeert.

import { Users, Shirt, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  TEAMS, TEAMS_ALPHA, FIXTURES, GW_COUNT, POSITIONS, POSITION_REQUIREMENTS,
  TEAM_PLANNER_BUDGET, TEAM_PLANNER_MAX_PER_CLUB, sectionTitleStyle,
} from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';

const teamPlannerInputStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '6px 8px', fontSize: '13px', width: '100%'
};

const thStyle = {
  textAlign: 'left', color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase',
  letterSpacing: '0.05em', padding: '6px 8px'
};

// Alleen voor de veld-weergave hieronder — GK onderaan, FWD bovenaan (omgekeerd van POSITIONS,
// dat de canonieke volgorde voor het formulier en de positie-telling levert).
const PITCH_ROW_ORDER = ['FWD', 'MID', 'DEF', 'GK'];

// Kleurstaat per positie-teller: compleet (teal), te vol (rood, zelfde rood als elders in de app
// voor "moeilijkst"/waarschuwingen), nog te kort (neutraal gedempt — geen waarschuwingskleur, want
// een half ingevuld formulier is nog geen fout).
function positionBadgeStyle(count, required) {
  if (count === required) return { background: '#4ECDC4', color: '#0B2E1B' };
  if (count > required) return { background: '#C2402C', color: '#FBEAE7' };
  return { background: 'rgba(255,255,255,0.08)', color: '#C9B8E0' };
}

// Eén speler-kaartje op het veld of de bank: clublogo, naam, en (indien een team gekozen is) de
// fixture van de geselecteerde GW via de bestaande MiniFixtureBadge — die regelt zelf al DGW/
// postponed/possibly-postponed-weergave, dus hier hoeft enkel de juiste fixture-string doorgegeven
// te worden. Leeg gebleven slots (geen naam, geen team) worden niet getoond.
function PlayerPitchCard({ player, gw, ratings, homeAdvantage, onToggleBench }) {
  if (!player.name && !player.teamCode) return null;
  const fixture = player.teamCode ? FIXTURES[player.teamCode]?.[gw - 1] : null;
  return (
    <button
      onClick={onToggleBench}
      title="Klik om bank-status te wisselen"
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
        background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px', padding: '8px 10px', minWidth: '78px', cursor: 'pointer'
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
  );
}

export default function TeamPlannerTab({
  ratings, homeAdvantage,
  teamPlannerPlayers, updateTeamPlannerPlayer, toggleTeamPlannerBench,
  teamPlannerGw, handleTeamPlannerGwPrev, handleTeamPlannerGwNext,
  teamPlannerTotalPrice, teamPlannerPositionCounts, teamPlannerClubCounts,
}) {
  const remainingBudget = TEAM_PLANNER_BUDGET - teamPlannerTotalPrice;
  const isOverBudget = teamPlannerTotalPrice > TEAM_PLANNER_BUDGET;

  // Clubs met te veel spelers — enkel gebruikt om de waarschuwingstekst hieronder op te bouwen,
  // de daadwerkelijke telling zelf gebeurt al in FDRTool.jsx (teamPlannerClubCounts).
  const overCapClubs = Object.entries(teamPlannerClubCounts).filter(([, count]) => count > TEAM_PLANNER_MAX_PER_CLUB);

  // Elke speler krijgt zijn oorspronkelijke slot-index mee, want na filteren (per positie/bank
  // hieronder) is de array-index niet meer bruikbaar om updateTeamPlannerPlayer/toggleTeamPlannerBench
  // op het juiste slot te laten aangrijpen.
  const indexedPlayers = teamPlannerPlayers.map((player, index) => ({ ...player, index }));
  const benchPlayers = indexedPlayers.filter(p => p.isBench);

  return (
    <>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
        Stel je 15-koppige selectie samen en bekijk per gameweek de fixture van elke speler. Deze planner slaat automatisch op in je browser.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
        <section>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px', marginBottom: '20px'
          }}>
            <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
              <Users size={18} color="#4ECDC4" /> Mijn 15 spelers
            </h2>

            {/* Validatie-overzicht: budget, positie-tellingen en club-limiet — alle 3 live herberekend
                in FDRTool.jsx (teamPlannerTotalPrice/PositionCounts/ClubCounts) telkens teamPlannerPlayers
                wijzigt, dus dit blok volgt vanzelf elke invoer hieronder zonder eigen state. */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center',
              background: 'rgba(255,255,255,0.04)',
              border: isOverBudget ? '1px solid #C2402C' : '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px', padding: '12px 14px', marginBottom: '16px'
            }}>
              <div>
                <div style={{ color: '#8F79AD', fontSize: '11px', textTransform: 'uppercase' }}>Budget</div>
                <div style={{ color: isOverBudget ? '#C2402C' : '#FFF', fontWeight: 700, fontSize: '15px' }}>
                  {teamPlannerTotalPrice.toFixed(1)}M / {TEAM_PLANNER_BUDGET}M
                  {isOverBudget && ` — ${Math.abs(remainingBudget).toFixed(1)}M te veel`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {POSITIONS.map(pos => {
                  const count = teamPlannerPositionCounts[pos];
                  const required = POSITION_REQUIREMENTS[pos];
                  return (
                    <span key={pos} style={{
                      fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
                      ...positionBadgeStyle(count, required)
                    }}>
                      {pos}: {count}/{required}
                    </span>
                  );
                })}
              </div>
              {overCapClubs.length > 0 && (
                <div style={{ color: '#C2402C', fontSize: '12px' }}>
                  Max {TEAM_PLANNER_MAX_PER_CLUB} per club overschreden bij:{' '}
                  {overCapClubs.map(([code, count]) => `${TEAMS.find(t => t.code === code)?.name ?? code} (${count})`).join(', ')}
                </div>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'separate', borderSpacing: '0 4px', width: '100%', minWidth: '620px' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Naam</th>
                    <th style={thStyle}>Team</th>
                    <th style={thStyle}>Positie</th>
                    <th style={thStyle}>Prijs (M)</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>Bank</th>
                  </tr>
                </thead>
                <tbody>
                  {teamPlannerPlayers.map((player, index) => (
                    <tr key={index}>
                      <td style={{ color: '#6B5289', fontSize: '12px', padding: '4px 8px' }}>{index + 1}</td>
                      <td style={{ padding: '4px 6px' }}>
                        <input
                          type="text" value={player.name}
                          onChange={e => updateTeamPlannerPlayer(index, 'name', e.target.value)}
                          placeholder="Naam"
                          style={teamPlannerInputStyle}
                        />
                      </td>
                      <td style={{ padding: '4px 6px', minWidth: '140px' }}>
                        <select
                          value={player.teamCode}
                          onChange={e => updateTeamPlannerPlayer(index, 'teamCode', e.target.value)}
                          style={teamPlannerInputStyle}
                        >
                          <option value="">Kies team</option>
                          {TEAMS_ALPHA.map(team => (
                            <option key={team.code} value={team.code}>{team.name}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', minWidth: '80px' }}>
                        <select
                          value={player.position}
                          onChange={e => updateTeamPlannerPlayer(index, 'position', e.target.value)}
                          style={teamPlannerInputStyle}
                        >
                          <option value="">-</option>
                          {POSITIONS.map(pos => (
                            <option key={pos} value={pos}>{pos}</option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '4px 6px', width: '90px' }}>
                        <input
                          type="number" inputMode="decimal" step="0.1" min="0"
                          value={player.price}
                          onChange={e => updateTeamPlannerPlayer(index, 'price', e.target.value)}
                          placeholder="0.0"
                          style={teamPlannerInputStyle}
                        />
                      </td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                        <input
                          type="checkbox" checked={player.isBench}
                          onChange={() => toggleTeamPlannerBench(index)}
                          aria-label={`${player.name || `Speler ${index + 1}`} op de bank`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section>
          <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
            <Shirt size={18} color="#4ECDC4" /> Veld
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '16px' }}>
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

          <div style={{
            background: 'linear-gradient(180deg, rgba(78,205,196,0.08), rgba(78,205,196,0.02))',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '16px'
          }}>
            {PITCH_ROW_ORDER.map(pos => {
              const rowPlayers = indexedPlayers.filter(p => p.position === pos && !p.isBench);
              return (
                <div key={pos} style={{ display: 'flex', justifyContent: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
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
              Bank
            </h3>
            {benchPlayers.length === 0 ? (
              <p style={{ color: '#6B5289', fontSize: '13px' }}>Nog geen spelers op de bank.</p>
            ) : (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {benchPlayers.map(player => (
                  <PlayerPitchCard
                    key={player.index}
                    player={player}
                    gw={teamPlannerGw}
                    ratings={ratings}
                    homeAdvantage={homeAdvantage}
                    onToggleBench={() => toggleTeamPlannerBench(player.index)}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
