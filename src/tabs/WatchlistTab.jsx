// Inhoud van de Watch List-tab: spelers toevoegen/verwijderen en hun eerstvolgende fixtures tonen.
// Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen lokale useState hier) — de
// tab-content wordt conditioneel gemount/unmount bij het wisselen van tab, dus lokale state zou
// resetten telkens de gebruiker weg- en terugnavigeert.

import { X, Plus, Eye, UserPlus, Loader2, AlertCircle, RotateCcw } from 'lucide-react';
import { TEAMS, CURRENT_GW, FIXTURES, DEFAULT_GW_HORIZON_END, sectionTitleStyle, sectionTitleTextStyle } from '../constants';
import { COLORS, retryButtonStyle, primaryButtonStyle } from '../theme';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { PlayerSearchInput } from '../components/PlayerSearchInput';

export default function WatchlistTab({
  t,
  ratings, homeAdvantage,
  watchlist, newPlayerName, setNewPlayerName, newPlayerTeam, setNewPlayerTeam, newPlayerPrice, setNewPlayerPrice,
  handleAddWatchlistPlayer, handleRemoveWatchlistPlayer,
  playerDatabase, playerDatabaseLoading, playerDatabaseError, fetchPlayerDatabase,
}) {
  return (
    <>
      <p style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '16px' }}>
        {t('watchlist.intro')}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>
        <section>
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '16px', marginBottom: '20px'
          }}>
          <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
            <UserPlus size={18} color="#4ECDC4" style={{ flexShrink: 0 }} />
            <span style={sectionTitleTextStyle}>{t('watchlist.addHeading')}</span>
          </h2>

          {/* Laad-/foutstatus van de spelersdatabank (Google Sheet CSV, zie fetchPlayerDatabase in
              FDRTool.jsx) — zelfde patroon als Team Planner: spinner tijdens het laden, rode foutmelding
              met "opnieuw proberen"-knop bij een mislukte fetch. De zoek/autocomplete hieronder staat
              zolang op disabled (zie PlayerSearchInput). */}
          {/* aria-live: het laden/mislukken van de spelersdatabank gebeurt asynchroon en veranderde
              vroeger stilletjes de staat van het zoekveld (disabled) zonder dat een schermlezer daar
              iets van meekreeg. */}
          <div aria-live="polite">
          {playerDatabaseLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: COLORS.textBody, fontSize: '13px', marginBottom: '12px' }}>
              <Loader2 size={16} className="fdr-spin" /> {t('watchlist.loadingDb')}
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
              <button onClick={fetchPlayerDatabase} className="fdr-touch-target" style={retryButtonStyle}>
                <RotateCcw size={14} aria-hidden="true" /> {t('shared.retry')}
              </button>
            </div>
          )}
          </div>

          {/* Enkel nog het zoekveld + toevoegen-knop: het losse "Prijs"-vakje hierna is geschrapt, want
              de prijs wordt sowieso automatisch uit de spelersdatabank gehaald (zie onSelect hieronder)
              en verscheen daarna toch al als badge bij elke watchlist-kaart hieronder — een apart,
              niet-bewerkbaar veld ervoor had dus geen functie. Flex i.p.v. het vroegere grid met een 1fr-
              kolom: die reserveerde de VOLLEDIGE resterende breedte voor het zoekveld (dat zelf via zijn
              eigen maxWidth-prop maar ~320px breed rendert), waardoor de knop op brede schermen ver naar
              rechts kwam te staan i.p.v. naast het zoekveld. flex-basis 320px (met shrink) houdt de knop
              nu altijd vlak bij het zoekveld, en laat het zoekveld op smalle/mobiele schermen nog gewoon
              meekrimpen — dit blijft dus altijd één regel, ook op mobiel. */}
          <form onSubmit={handleAddWatchlistPlayer} style={{
            display: 'flex', flexWrap: 'nowrap', gap: '10px', alignItems: 'end'
          }}>
            <label style={{ display: 'grid', gap: '4px', minWidth: 0, flex: '0 1 320px' }}>
              <span style={{ color: COLORS.textBody, fontSize: '11px', textTransform: 'uppercase', marginLeft: '4px'}}>{t('watchlist.playerLabel')}</span>
              {/* Zoek/autocomplete op de spelersdatabank i.p.v. vrije-tekst naam + los team-dropdown —
                  bij selectie vullen newPlayerName/-Team/-Price automatisch (zie onSelect hieronder),
                  zelfde patroon als de 15-koppige teaminvoer in TeamPlannerTab.jsx. */}
              <PlayerSearchInput
                value={newPlayerName}
                players={playerDatabase}
                disabled={playerDatabaseLoading || !!playerDatabaseError}
                placeholder={playerDatabaseLoading ? t('watchlist.searchLoadingPlaceholder') : t('watchlist.searchPlaceholder')}
                onSelect={(selected) => {
                  setNewPlayerName(selected.name);
                  setNewPlayerTeam(selected.teamCode);
                  setNewPlayerPrice(selected.price != null ? String(selected.price) : '');
                }}
              />
            </label>
            <button
              type="submit"
              style={{
                ...primaryButtonStyle, minWidth: 0, borderRadius: '6px', height: '34px',
                boxSizing: 'border-box', padding: '0 12px', fontSize: '11px', gap: '5px',
              }}
            >
              <Plus size={16} /> {t('watchlist.add')}
            </button>
          </form>
          </div>
        </section>

        <section>
          <h2 className="fdr-title fdr-section-title" style={{ ...sectionTitleStyle, marginBottom: '12px' }}>
            <Eye size={18} color="#4ECDC4" style={{ flexShrink: 0 }} />
            <span style={sectionTitleTextStyle}>{t('watchlist.myWatchlist')}</span>
          </h2>
          {watchlist.length === 0 ? (
            <p style={{ color: COLORS.textSubtle, fontSize: '13px' }}>
              {t('watchlist.empty')}
            </p>
          ) : (
            <div style={{ display: 'grid', gap: '8px' }}>
              {watchlist.map(player => {
                const team = TEAMS.find(team => team.code === player.teamCode);
                // Eerstvolgende fixtures vanaf CURRENT_GW, nooit voorbij DEFAULT_GW_HORIZON_END (GW7) —
                // vanaf GW8 krijgen spelers onbeperkte gratis transfers en begint dus een nieuwe periode
                // (zelfde grens als "Beste fixture runs" op de FDR-tab, zie rangeEnd in FDRTool.jsx).
                // .slice() geeft vanzelf minder terug als CURRENT_GW dicht bij die grens zit, dus geen
                // aparte "resterende fixtures"-logica nodig.
                const upcomingFixtures = (FIXTURES[player.teamCode] ?? []).slice(CURRENT_GW - 1, DEFAULT_GW_HORIZON_END);
                return (
                  <div key={player.id} style={{
                    position: 'relative', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 12px'
                  }}>
                    <button
                      onClick={() => handleRemoveWatchlistPlayer(player.id)}
                      aria-label={t('watchlist.removeAria', { name: player.name })}
                      className="fdr-icon-btn"
                      style={{
                        position: 'absolute', top: '2px', right: '2px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px',
                        background: 'transparent', color: COLORS.textMuted, border: 'none', borderRadius: '6px', cursor: 'pointer'
                      }}
                    >
                      <X size={14} />
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingRight: '24px' }}>
                      <img
                        src={`/club-logos/${player.teamCode}.webp`}
                        alt=""
                        className="club-logo"
                        style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px', lineHeight: 1.25 }}>{player.name}</div>
                        <div style={{ color: COLORS.textMuted, fontSize: '11px', marginTop: '1px' }}>{team?.name ?? player.teamCode}</div>
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
