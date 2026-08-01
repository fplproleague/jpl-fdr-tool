// Inhoud van de Watch List-tab: spelers toevoegen/verwijderen en hun eerstvolgende fixtures tonen.
// Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen lokale useState hier) — de
// tab-content wordt conditioneel gemount/unmount bij het wisselen van tab, dus lokale state zou
// resetten telkens de gebruiker weg- en terugnavigeert.

import { X, Plus, Eye, UserPlus } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, CURRENT_GW, FIXTURES, sectionTitleStyle } from '../constants';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';

const watchlistInputStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '8px 10px', fontSize: '13px', width: '100%'
};

export default function WatchlistTab({
  ratings, homeAdvantage,
  watchlist, newPlayerName, setNewPlayerName, newPlayerTeam, setNewPlayerTeam, newPlayerPrice, setNewPlayerPrice,
  handleAddWatchlistPlayer, handleRemoveWatchlistPlayer,
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
            <UserPlus size={18} color="#4ECDC4" /> Speler toevoegen
          </h2>
          <form onSubmit={handleAddWatchlistPlayer} style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end'
          }}>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px'}}>Naam</span>
              <input
                type="text" required value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                placeholder="Bv. Zorgane"
                style={watchlistInputStyle}
              />
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>Team</span>
              <select required value={newPlayerTeam} onChange={e => setNewPlayerTeam(e.target.value)} style={watchlistInputStyle}>
                <option value="" disabled>Kies team</option>
                {TEAMS_ALPHA.map(team => (
                  <option key={team.code} value={team.code}>{team.name}</option>
                ))}
              </select>
            </label>
            <label style={{ display: 'grid', gap: '4px' }}>
              <span style={{ color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px' }}>Prijs (optioneel)</span>
              <input
                type="number" inputMode="decimal" step="0.1" min="0" max="12" placeholder="Bv. 8.5"
                value={newPlayerPrice} onChange={e => setNewPlayerPrice(e.target.value)}
                style={watchlistInputStyle}
                placeholder="Bv. 8.5"
              />
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
            <Eye size={18} color="#4ECDC4" /> Mijn watchlist
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
