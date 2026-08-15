// Inhoud van de Watch List-tab: spelers toevoegen/verwijderen en hun eerstvolgende fixtures tonen.
// Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen lokale useState hier) — de
// tab-content wordt conditioneel gemount/unmount bij het wisselen van tab, dus lokale state zou
// resetten telkens de gebruiker weg- en terugnavigeert.

import { X, Plus, Eye, UserPlus, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { TEAMS, CURRENT_GW, FIXTURES, sectionTitleStyle, sectionTitleTextStyle } from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { PlayerSearchInput } from '../components/PlayerSearchInput';

const watchlistInputStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '8px 10px', fontSize: '13px', width: '100%'
};

const retryButtonStyle = {
  display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
  background: 'transparent', color: '#FBEAE7', border: '1px solid rgba(251,234,231,0.4)',
  borderRadius: '8px', padding: '6px 12px', fontWeight: 700, fontSize: '12px', cursor: 'pointer',
};

export default function WatchlistTab({
  ratings, homeAdvantage,
  watchlist, newPlayerName, setNewPlayerName, newPlayerTeam, setNewPlayerTeam, newPlayerPrice, setNewPlayerPrice,
  handleAddWatchlistPlayer, handleRemoveWatchlistPlayer,
  playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
}) {
  return (
    <>
      <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '16px' }}>
        Houd je favoriete spelers in de gaten — voeg ze toe aan je persoonlijke watchlist, samen met hun eerstvolgende fixtures. Deze lijst slaat automatisch op in je browser.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
        <section>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px', marginBottom: '20px'
          }}>
          <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
            <UserPlus size={18} color="#4ECDC4" style={{ flexShrink: 0 }} />
            <span style={sectionTitleTextStyle}>Speler toevoegen</span>
          </h2>

          {/* Laad-/foutstatus van de spelersdatabank (Google Sheet CSV, zie fetchPlayerDatabase in
              FDRTool.jsx) — zelfde patroon als Team Planner: spinner tijdens het laden, rode foutmelding
              met "opnieuw proberen"-knop bij een mislukte fetch. De zoek/autocomplete hieronder staat
              zolang op disabled (zie PlayerSearchInput). */}
          {playerDatabaseLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginBottom: '12px' }}>
              <Loader2 size={16} className="fdr-spin" /> Spelersdatabank laden...
            </div>
          )}
          {!playerDatabaseLoading && playerDatabaseError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
              background: 'rgba(194,64,44,0.12)', border: '1px solid rgba(194,64,44,0.4)',
              borderRadius: '10px', padding: '12px 14px', marginBottom: '12px'
            }}>
              <AlertCircle size={16} color="#C2402C" style={{ flexShrink: 0 }} />
              <span style={{ color: '#FBEAE7', fontSize: '13px', flex: 1 }}>{playerDatabaseError}</span>
              <button onClick={fetchPlayerDatabase} style={retryButtonStyle}>
                <RotateCcw size={14} /> Probeer opnieuw
              </button>
            </div>
          )}

          <form onSubmit={handleAddWatchlistPlayer} style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end'
          }}>
            <label style={{ display: 'grid', gap: '4px', gridColumn: 'span 2' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px'}}>Speler</span>
              {/* Zoek/autocomplete op de spelersdatabank i.p.v. vrije-tekst naam + los team-dropdown —
                  bij selectie vullen newPlayerName/-Team/-Price automatisch (zie onSelect hieronder),
                  zelfde patroon als de 15-koppige teaminvoer in TeamPlannerTab.jsx. */}
              <PlayerSearchInput
                value={newPlayerName}
                players={playerDatabase}
                disabled={playerDatabaseLoading || !!playerDatabaseError}
                placeholder={playerDatabaseLoading ? 'Databank laden...' : 'Zoek speler...'}
                onSelect={(selected) => {
                  setNewPlayerName(selected.name);
                  setNewPlayerTeam(selected.teamCode);
                  setNewPlayerPrice(selected.price != null ? String(selected.price) : '');
                }}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>Prijs</span>
              <div style={{ ...watchlistInputStyle, color: newPlayerPrice !== '' ? '#FFF' : '#8F79AD', fontWeight: 700 }}>
                {newPlayerPrice !== '' ? `${Number(newPlayerPrice).toFixed(1)}M` : '—'}
              </div>
            </label>
            <button type="submit" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              background: '#4ECDC4', color: '#0B2E1B', border: 'none', borderRadius: '8px',
              padding: '9px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
            }}>
              <Plus size={18} /> Toevoegen
            </button>
          </form>
          </div>
        </section>

        <section>
          <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
            <Eye size={18} color="#4ECDC4" style={{ flexShrink: 0 }} />
            <span style={sectionTitleTextStyle}>Mijn watchlist</span>
          </h2>
          {watchlist.length === 0 ? (
            <p style={{ color: '#6B5289', fontSize: '13px' }}>
              Je watchlist is nog leeg. Voeg spelers toe die je in de gaten wil houden.
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {watchlist.map(player => {
                const team = TEAMS.find(t => t.code === player.teamCode);
                // Eerstvolgende (max. 5) fixtures vanaf CURRENT_GW — .slice() geeft vanzelf minder
                // terug als het seizoen bijna afloopt, dus geen aparte "resterende fixtures"-logica nodig.
                const upcomingFixtures = (FIXTURES[player.teamCode] ?? []).slice(CURRENT_GW - 1, CURRENT_GW - 1 + 5);
                return (
                  <div key={player.id} style={{
                    position: 'relative', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px'
                  }}>
                    <button
                      onClick={() => handleRemoveWatchlistPlayer(player.id)}
                      aria-label={`Verwijder ${player.name}`}
                      style={{
                        position: 'absolute', top: '6px', right: '6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px',
                        background: 'transparent', color: '#8F79AD', border: 'none', borderRadius: '6px', cursor: 'pointer'
                      }}
                    >
                      <X size={14} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '24px' }}>
                      <img
                        src={`/club-logos/${player.teamCode}.png`}
                        alt=""
                        className="club-logo"
                        style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px', lineHeight: 1.25 }}>{player.name}</div>
                        <div style={{ color: '#8F79AD', fontSize: '11px', marginTop: '1px' }}>{team?.name ?? player.teamCode}</div>
                      </div>
                      {player.price != null && (
                        <span style={{
                          fontSize: '12px', fontWeight: 700, padding: '3px 8px', borderRadius: '999px',
                          background: 'rgba(255,255,255,0.1)', color: '#4ECDC4', flexShrink: 0
                        }}>{player.price}M</span>
                      )}
                    </div>
                    <div className="fdr-mini-fixture-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '8px' }}>
                      {upcomingFixtures.map((fixture, idx) => (
                        <MiniFixtureBadge
                          key={idx}
                          teamCode={player.teamCode}
                          fixture={fixture}
                          gwNumber={CURRENT_GW + idx}
                          ratings={ratings}
                          homeAdvantage={homeAdvantage}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
