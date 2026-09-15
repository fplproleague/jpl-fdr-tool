// Eén paneel met alles wat de site over één speler weet. Die informatie zat tot nu toe verspreid over
// vier tabs (Bonuspunten, Kaarten, Set Pieces, Verwachte XI's) zonder dat er ergens één plek was waar
// het samenkwam.
//
// De sheet krijgt bewust maar één identificerende prop (`player`: naam + clubcode) en zoekt de rest
// zelf op in de databronnen die al geladen zijn. Zo hoeft elke ingang — een rij in een rangschikking,
// een naam in Set Pieces, een speler op het veld — enkel te weten wíe er aangeklikt is, en niet wat de
// sheet allemaal toont. Geen enkele lookup hieronder doet een netwerkverzoek: een klik vlak voor een
// deadline mag nooit een fetch kosten (zie de fetch-afhandeling in FDRTool.jsx).
//
// Op desktop een gecentreerde modal (zelfde patroon als de info-modal in FDRTool.jsx), op mobiel een
// bottom sheet — zie .fdr-sheet in het <style>-blok van FDRTool.jsx. Stapelen kan niet: FDRTool houdt
// één sheet-state bij, dus een sheet die vanuit een sheet opent, vervangt de vorige.
import { useEffect, useRef } from 'react';
import { X, Star, Users } from 'lucide-react';
import { CURRENT_GW, FIXTURES, PREDICTED_LINEUPS_GW, TEAMS } from '../constants';
import {
  buildBonuspuntenEntries, findPlayerBonusEntry, perGameLabel, meetsThresholdPerGame, BONUS_THRESHOLD,
} from '../bonuspunten';
import { buildKaartenEntries } from '../kaarten';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';
import { SAFETY_STYLE } from '../predicted-xi/theme';
import { MiniFixtureBadge } from './MiniFixtureBadge';

// Zelfde vlag als in BonuspuntenTab: zolang de Bonuspunten-kolom niet gevuld is, toont de tegel een
// melding i.p.v. een nul. Hier apart gehouden zodat de sheet niets uit een tab-module hoeft te
// importeren (dat zou een lazy tab-chunk in deze chunk trekken).
const BONUS_POINTS_DATA_AVAILABLE = true;

// Hoeveel speeldagen vooruit de sheet toont. Twee: genoeg om "speelt hij een dubbele makkelijke week"
// te beantwoorden, weinig genoeg om naast de rest te passen. Bewust losgekoppeld van de GW-horizon van
// de hoofdtabel — dit is een detailweergave, geen planningsoverzicht.
const FIXTURES_AHEAD = 2;

const SAFETY_LABEL_KEYS = {
  darkgreen: 'predictedLineups.legend.certain',
  green: 'predictedLineups.legend.starter',
  orange: 'predictedLineups.legend.doubtful',
  red: 'predictedLineups.legend.risk',
};

function Section({ title, children }) {
  return (
    <section style={{ marginTop: '16px' }}>
      <h4 className="fdr-title" style={{
        color: '#8F79AD', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
        margin: '0 0 8px', fontWeight: 800,
      }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

// Eén statistiek in de sheet: de hoofdwaarde (seizoenstotaal) staat altijd gewoon wit — enkel de "per
// wedstrijd"-waarde op de tweede regel kleurt cyaan, en dan enkel zodra die PER WEDSTRIJD al minstens
// de bonuspunt-drempel haalt (meetsThresholdPerGame in bonuspunten.js): een "op koers voor dit
// bonuspunt"-indicator, los van de seizoenstotaal.
export function BonusStatTile({ label, value, perGame, perGameQualifies, detail, comingSoon }) {
  return (
    <div style={{
      background: 'rgba(0,0,0,0.15)', border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: '8px', padding: '8px 10px',
    }}>
      <div style={{ color: '#8F79AD', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ color: '#FFF', fontWeight: 900, fontSize: '18px', lineHeight: 1.3 }}>
        {value}
      </div>
      <div style={{ color: '#8F79AD', fontSize: '11px' }}>
        {comingSoon ? comingSoon : (
          <>
            {detail && `${detail} · `}
            {perGame && (
              <span style={{ color: perGameQualifies ? '#4ECDC4' : '#8F79AD', fontWeight: perGameQualifies ? 700 : 400 }}>
                {perGame}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Zoekt op of deze speler bij zijn club als nemer vermeld staat. De sheet-cel bevat vrije tekst
// ("Sikan / Ambros ?"), dus matchen we op het voorkomen van de naam i.p.v. op gelijkheid.
function setPieceRolesFor(entry, playerName, t) {
  if (!entry || !playerName) return [];
  const mentions = value => (value ?? '').toLowerCase().includes(playerName.toLowerCase());
  return [
    mentions(entry.penalties) && t('setpieces.legend.penalty'),
    mentions(entry.corners) && t('setpieces.legend.corner'),
    mentions(entry.freeKicks) && t('setpieces.legend.freeKick'),
  ].filter(Boolean);
}

export default function PlayerSheet({
  t, player, onClose,
  playerDatabase = [], setPiecesEntries = [], ratings, homeAdvantage,
  isWatched, onToggleWatch, onGoToTeamPlanner,
}) {
  const dialogRef = useRef(null);
  const headingId = 'fdr-player-sheet-title';

  // Focus naar de sheet bij openen en terug naar het element dat 'm opende bij sluiten. Zonder dit
  // staat de toetsenbordfocus na het openen nog achter de sheet, en na het sluiten bovenaan de pagina
  // i.p.v. bij de rij waar de gebruiker gebleven was.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const { name, teamCode } = player;
  const team = TEAMS.find(x => x.code === teamCode);
  const dbEntry = playerDatabase.find(p => p.name === name && p.teamCode === teamCode) ?? null;
  const bonusEntry = findPlayerBonusEntry(buildBonuspuntenEntries(playerDatabase), { name, teamCode });
  const cardsEntry = buildKaartenEntries(playerDatabase).find(e => e.player === name && e.clubCode === teamCode) ?? null;
  const setPieceRoles = setPieceRolesFor(setPiecesEntries.find(e => e.clubCode === teamCode), name, t);

  // findLast, net als in PredictedLineupsTab: mocht er ooit weer een oude en een nieuwe opstelling voor
  // dezelfde club naast elkaar in de data staan, dan telt de laatste (de nieuwste).
  const lineupSlot = PREDICTED_LINEUPS
    .findLast(l => l.clubCode === teamCode)?.slots
    ?.find(s => s.playerName === name) ?? null;

  const upcoming = (FIXTURES[teamCode] ?? []).slice(CURRENT_GW - 1, CURRENT_GW - 1 + FIXTURES_AHEAD);
  const isStaleLineup = PREDICTED_LINEUPS_GW < CURRENT_GW;
  const unit = t('bonuspunten.perMatchUnit');

  return (
    <div
      className="fdr-sheet-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 70,
        display: 'flex', justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="fdr-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#3D1E5C', border: '1px solid rgba(255,255,255,0.1)',
          width: '100%', maxWidth: '460px', maxHeight: '86vh', overflowY: 'auto',
          padding: '20px', outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <img
            src={`/club-logos/${teamCode}.webp`}
            alt=""
            style={{ width: '34px', height: '34px', objectFit: 'contain', flexShrink: 0 }}
            onError={(e) => { e.target.style.display = 'none'; }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id={headingId} className="fdr-title" style={{ color: '#FFF', fontSize: '17px', margin: 0 }}>
              {name}
            </h3>
            <div style={{ color: '#8F79AD', fontSize: '12px', marginTop: '2px' }}>
              {[team?.name ?? teamCode, dbEntry?.position, dbEntry?.price != null ? `${dbEntry.price}M` : null]
                .filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('playerSheet.closeAria')}
            className="fdr-icon-btn"
            style={{
              background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer',
              flexShrink: 0, padding: '4px', display: 'inline-flex',
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Acties bovenaan: dit zijn de twee dingen die je met een speler wíl doen nadat je 'm
            bekeken hebt, dus ze moeten niet onder alle statistieken weggestopt zitten. */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
          {onToggleWatch && (
            <button
              type="button"
              onClick={onToggleWatch}
              aria-pressed={Boolean(isWatched)}
              className="fdr-touch-target fdr-toolbar-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: isWatched ? 'rgba(78,205,196,0.14)' : 'transparent',
                color: isWatched ? '#4ECDC4' : '#C9B8E0',
                border: `1px solid ${isWatched ? '#4ECDC4' : 'rgba(255,255,255,0.2)'}`,
                borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '12px',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <Star size={14} fill={isWatched ? '#4ECDC4' : 'none'} aria-hidden="true" />
              {t(isWatched ? 'playerSheet.onWatchlist' : 'playerSheet.addToWatchlist')}
            </button>
          )}
          {onGoToTeamPlanner && (
            <button
              type="button"
              onClick={onGoToTeamPlanner}
              className="fdr-touch-target fdr-toolbar-btn"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: 'transparent', color: '#C9B8E0',
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px',
                padding: '8px 14px', fontWeight: 700, fontSize: '12px',
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              <Users size={14} aria-hidden="true" />
              {t('playerSheet.toTeamPlanner')}
            </button>
          )}
        </div>

        <Section title={t('playerSheet.fixturesHeading')}>
          {upcoming.length > 0 ? (
            <div className="fdr-mini-fixture-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
              {upcoming.map((fixture, i) => (
                <MiniFixtureBadge
                  key={i}
                  teamCode={teamCode}
                  fixture={fixture}
                  gwNumber={CURRENT_GW + i}
                  ratings={ratings}
                  homeAdvantage={homeAdvantage}
                />
              ))}
            </div>
          ) : <p style={emptyTextStyle}>{t('playerSheet.noData')}</p>}
        </Section>

        <Section title={t('playerSheet.lineupHeading')}>
          {lineupSlot ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  width: '12px', height: '12px', borderRadius: '3px', flexShrink: 0,
                  background: SAFETY_STYLE[lineupSlot.safety]?.border ?? '#8F79AD',
                }} />
                <span style={{ color: '#EDE4F5', fontSize: '13px', fontWeight: 700 }}>
                  {t(SAFETY_LABEL_KEYS[lineupSlot.safety] ?? 'playerSheet.noData')}
                </span>
              </div>
              {/* Zodra de opstellingen achterlopen op de speeldag die nu aan de beurt is, moet erbij
                  staan van wanneer ze zijn. Zonder dat label leest een startkans van vorige week
                  precies hetzelfde als een actuele — exact de verwarring die de waarschuwingsbanner
                  op de Verwachte XI's-tab al voorkomt. */}
              {isStaleLineup && (
                <p style={{ ...emptyTextStyle, marginTop: '6px', color: '#E8C547' }}>
                  {t('playerSheet.lineupFromGw', { gw: PREDICTED_LINEUPS_GW })}
                </p>
              )}
            </>
          ) : <p style={emptyTextStyle}>{t('playerSheet.notInLineup')}</p>}
        </Section>

        <Section title={t('playerSheet.setPiecesHeading')}>
          {setPieceRoles.length > 0 ? (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {setPieceRoles.map(role => (
                <span key={role} style={{
                  background: 'rgba(78,205,196,0.15)', border: '1px solid #4ECDC4', color: '#4ECDC4',
                  borderRadius: '999px', padding: '4px 12px', fontSize: '11px', fontWeight: 800,
                }}>
                  {role}
                </span>
              ))}
            </div>
          ) : <p style={emptyTextStyle}>{t('playerSheet.noSetPieces')}</p>}
        </Section>

        <Section title={t('playerSheet.cardsHeading')}>
          {cardsEntry ? (
            <p style={{ color: '#EDE4F5', fontSize: '13px', margin: 0 }}>
              <strong style={{ color: '#FFF' }}>{cardsEntry.cards}</strong> {t('kaarten.cardsUnit')}
              {cardsEntry.cardsRemaining > 0 && (
                <span style={{ color: cardsEntry.cardsRemaining === 1 ? '#E8C547' : '#8F79AD' }}>
                  {' · '}{t('playerSheet.cardsUntilSuspension', { count: cardsEntry.cardsRemaining })}
                </span>
              )}
            </p>
          ) : <p style={emptyTextStyle}>{t('playerSheet.noData')}</p>}
        </Section>

        <Section title={t('playerSheet.bonusHeading')}>
          {bonusEntry ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
              <BonusStatTile
                label={t('bonuspunten.stat.duels')} value={`${bonusEntry.duelDiff > 0 ? '+' : ''}${bonusEntry.duelDiff}`}
                perGame={perGameLabel(bonusEntry.duelDiff, bonusEntry.games, { showSign: true, unit })}
                perGameQualifies={meetsThresholdPerGame(bonusEntry.duelDiff, bonusEntry.games, BONUS_THRESHOLD.duels)}
                detail={t('bonuspunten.duelsDetail', { won: bonusEntry.duelsWon, lost: bonusEntry.duelsLost })}
              />
              <BonusStatTile
                label={t('bonuspunten.stat.headers')} value={bonusEntry.defensiveHeaders}
                perGame={perGameLabel(bonusEntry.defensiveHeaders, bonusEntry.games, { unit })}
                perGameQualifies={meetsThresholdPerGame(bonusEntry.defensiveHeaders, bonusEntry.games, BONUS_THRESHOLD.defensiveHeaders)}
              />
              <BonusStatTile
                label={t('bonuspunten.stat.recoveries')} value={bonusEntry.recoveries}
                perGame={perGameLabel(bonusEntry.recoveries, bonusEntry.games, { unit })}
                perGameQualifies={meetsThresholdPerGame(bonusEntry.recoveries, bonusEntry.games, BONUS_THRESHOLD.recoveries)}
              />
              <BonusStatTile
                label={t('bonuspunten.stat.bigChances')} value={bonusEntry.bigChances}
                perGame={perGameLabel(bonusEntry.bigChances, bonusEntry.games, { unit })}
                perGameQualifies={meetsThresholdPerGame(bonusEntry.bigChances, bonusEntry.games, BONUS_THRESHOLD.bigChances)}
              />
              <BonusStatTile
                label={t('bonuspunten.stat.bonusPoints')}
                value={BONUS_POINTS_DATA_AVAILABLE ? bonusEntry.bonusPoints : '—'}
                perGame={BONUS_POINTS_DATA_AVAILABLE ? perGameLabel(bonusEntry.bonusPoints, bonusEntry.games, { unit }) : null}
                comingSoon={BONUS_POINTS_DATA_AVAILABLE ? null : t('bonuspunten.comingSoonShort')}
              />
            </div>
          ) : <p style={emptyTextStyle}>{t('playerSheet.noData')}</p>}
        </Section>
      </div>
    </div>
  );
}

const emptyTextStyle = { color: '#8F79AD', fontSize: '12px', margin: 0 };
