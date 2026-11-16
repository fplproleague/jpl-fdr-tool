// Eén spelersdetail, overal hetzelfde (spec §7.9): vroeger waren er twee (deze sheet en de popup van de
// Spelers-tab). Nu toont deze sheet alles van beide.
//
// De sheet krijgt één identificerende prop (`player`: naam + clubcode, zoals in de spelersdatabank) en
// zoekt de rest zelf op:
//   - de Fantasy Pro League-speler via usePlayerIndex (foto, positie, prijs, seizoenscijfers). De
//     Spelers-tab geeft die speler al mee als `apiPlayer`, zodat er niets opgezocht hoeft te worden;
//   - de Google Sheet-gegevens (gele kaarten, bonusstatistieken, set pieces, startzekerheid).
// Heeft de speler een API-id, dan komen de wedstrijden per speeldag uit /api/player/{id}. Die worden
// pas opgehaald wanneer de sheet opent, in de achtergrond, en per sessie onthouden. Zonder API-id toont
// de sheet enkel de Google Sheet-gegevens.
//
// Het paneel zelf (dialoog, focus, Escape, lade op desktop / bottom sheet op gsm) komt uit Sheet.jsx.
import { useEffect, useState } from 'react';
import { Scale, Share2, Users } from 'lucide-react';
import Sheet, { SheetSection as Section } from './Sheet';
import { FixtureStrip } from './FixtureStrip';
import { ClubLogo } from './SpelersParts';
import { CURRENT_GW, FIXTURES, PREDICTED_LINEUPS_GW } from '../constants';
import {
  buildBonuspuntenEntries, findPlayerBonusEntry, perGameLabel, meetsThresholdPerGame, BONUS_THRESHOLD,
} from '../bonuspunten';
import { buildKaartenEntries } from '../kaarten';
import { buildRow } from '../spelers';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';
import { languageFromPath, pathForSheet } from '../routes';
import usePlayerIndex from '../data/usePlayerIndex';
import { findInDatabase } from '../data/playerDatabase';
import AvailabilityMark from '../ui/AvailabilityMark';
import { PlayerFace, PlayerFaceByName } from '../ui/PlayerFace';
import StarButton from '../ui/StarButton';
import StatusDot from '../ui/StatusDot';
import Button from '../ui/Button';
import ErrorBanner from '../ui/ErrorBanner';
import { Skeleton } from '../ui/Skeleton';
import './PlayerSheet.css';

// Vijf speeldagen vooruit: genoeg om een reeks te beoordelen, en het past op 390px op één regel.
const FIXTURES_AHEAD = 5;

const SAFETY_LABEL_KEYS = {
  darkgreen: 'predictedLineups.legend.certain',
  green: 'predictedLineups.legend.starter',
  orange: 'predictedLineups.legend.doubtful',
  red: 'predictedLineups.legend.risk',
};

const detailCache = new Map();

// Een keeper krijgt ?pos=GK mee: de wedstrijddata vermeldt de positie niet, en keepers kunnen enkel
// het duelpunt halen (spec A6). Voor de anderen blijft de URL (en dus de CDN-cache) zoals voorheen.
async function loadDetail(id, pos) {
  if (detailCache.has(id)) return detailCache.get(id);
  const response = await fetch(`/api/player/${id}${pos === 'GK' ? '?pos=GK' : ''}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Array.isArray(body.matches)) throw new Error(body?.error || `HTTP ${response.status}`);
  detailCache.set(id, body);
  return body;
}

function usePlayerDetail(id, pos) {
  const [state, setState] = useState(() => ({ loading: !!id && !detailCache.has(id), error: false, detail: detailCache.get(id) ?? null }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!id) { setState({ loading: false, error: false, detail: null }); return undefined; }
    if (detailCache.has(id)) { setState({ loading: false, error: false, detail: detailCache.get(id) }); return undefined; }
    let cancelled = false;
    setState({ loading: true, error: false, detail: null });
    loadDetail(id, pos)
      .then(detail => { if (!cancelled) setState({ loading: false, error: false, detail }); })
      .catch(() => { if (!cancelled) setState({ loading: false, error: true, detail: null }); });
    return () => { cancelled = true; };
  }, [id, pos, attempt]);
  return [state, () => setAttempt(a => a + 1)];
}

// Zoekt op of deze speler bij zijn club als nemer vermeld staat. De cel bevat vrije tekst
// ("Sikan / Ambros ?"), dus matchen we op het voorkomen van de naam i.p.v. op gelijkheid.
function setPieceRolesFor(entry, playerName, t) {
  if (!entry || !playerName) return [];
  const mentions = value => (value ?? '').toLowerCase().includes(playerName.toLowerCase());
  return [
    mentions(entry.penalties) && t('setpieces.col.penalties'),
    mentions(entry.corners) && t('setpieces.col.corners'),
    mentions(entry.freeKicks) && t('setpieces.col.freeKicks'),
  ].filter(Boolean);
}

const barTone = pts => (pts < 0 ? 'is-neg' : pts >= 8 ? 'is-high' : pts >= 4 ? 'is-mid' : 'is-low');

// Punten per speeldag: één staaf per speeldag 1..gw; een dubbele speeldag telt als de som.
function PointsChart({ matches, gw, t }) {
  const perGw = Array.from({ length: gw }, (_, i) => ({ gw: i + 1, pts: null }));
  for (const m of matches) {
    if (m.gw >= 1 && m.gw <= gw) perGw[m.gw - 1].pts = (perGw[m.gw - 1].pts ?? 0) + m.pts;
  }
  const max = Math.max(10, ...perGw.map(p => p.pts ?? 0));
  const min = Math.min(0, ...perGw.map(p => p.pts ?? 0));
  const height = 80;
  const range = max - min;
  const zeroY = (max / range) * height;
  // Ruimte onder de nullijn voor het label van een negatieve score, zodat het nooit over het
  // speeldagnummer eronder valt.
  const labelBelow = min < 0 ? 13 : 0;
  return (
    <div
      className="ps-chart" role="img"
      aria-label={t('spelers.popup.chartAria', { list: perGw.map(p => `${t('fdr.gwLabel')}${p.gw}: ${p.pts ?? '—'}`).join(', ') })}
    >
      {perGw.map(p => {
        const h = p.pts == null ? 0 : Math.max(2, (Math.abs(p.pts) / range) * height);
        const negative = (p.pts ?? 0) < 0;
        return (
          <div key={p.gw} className="ps-chart__col" aria-hidden="true">
            <div className="ps-chart__area" style={{ height: height + labelBelow }}>
              <span
                className={`ps-chart__val num${p.pts == null ? ' is-none' : ''}`}
                style={{ top: p.pts == null ? zeroY - 12 : negative ? zeroY + h + 1 : zeroY - h - 12 }}
              >
                {p.pts == null ? '–' : p.pts}
              </span>
              {p.pts != null && (
                <span className={`ps-chart__bar ${barTone(p.pts)}`} style={{ top: negative ? zeroY : zeroY - h, height: h }} />
              )}
            </div>
            <span className="ps-chart__gw num">{p.gw}</span>
          </div>
        );
      })}
    </div>
  );
}

// De API geeft de uitslag met de eigen goals eerst; hier tonen we ze zoals ze echt was: thuisploeg
// eerst. Bij een uitwedstrijd draaien we "1-2" dus om naar "2-1".
function homeAwayScore(score, home) {
  if (!score || home !== false) return score;
  const [own, opp] = score.split('-');
  return opp != null ? `${opp}-${own}` : score;
}

function MatchTable({ matches, t }) {
  const resultLetter = { W: t('spelers.popup.resultW'), D: t('spelers.popup.resultD'), L: t('spelers.popup.resultL') };
  return (
    <div className="ps-table-wrap">
      <table className="ps-table">
        <thead>
          <tr>
            <th scope="col" className="is-num">{t('fdr.gwLabel')}</th>
            <th scope="col">{t('spelers.popup.opponent')}</th>
            <th scope="col" className="is-num" title={t('spelers.col.min')}>{t('spelers.col.minShort')}</th>
            <th scope="col" className="is-num" title={t('spelers.col.g')}>{t('spelers.col.gShort')}</th>
            <th scope="col" className="is-num" title={t('spelers.col.a')}>{t('spelers.col.aShort')}</th>
            <th scope="col" className="is-num" title={t('spelers.col.bp')}>{t('spelers.popup.bonusShort')}</th>
            <th scope="col" className="is-num">{t('spelers.popup.pointsShort')}</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => (
            <tr key={`${m.gw}-${i}`}>
              <td className="is-num num">{m.gw}</td>
              <td>
                <span className="ps-opp">
                  <ClubLogo code={m.opp} size={14} />
                  <span>{m.opp ?? '?'}</span>
                  <span className="ps-opp__venue">{m.home === false ? t('spelers.popup.away') : t('spelers.popup.home')}</span>
                  {m.score && <span className="ps-opp__score num">{homeAwayScore(m.score, m.home)}</span>}
                  {m.result && <span className={`ps-opp__res is-${m.result}`}>{resultLetter[m.result]}</span>}
                  {m.yc > 0 && <span className="ps-card is-yellow" role="img" aria-label={t('spelers.col.yc')} />}
                  {m.rc > 0 && <span className="ps-card is-red" role="img" aria-label={t('spelers.col.rc')} />}
                </span>
              </td>
              <td className="is-num num">{m.min}</td>
              <td className="is-num num" title={m.goals.length ? m.goals.map(x => `${x}'`).join(', ') : undefined}>{m.goals.length || ''}</td>
              <td className="is-num num" title={m.assists.length ? m.assists.map(x => `${x}'`).join(', ') : undefined}>{m.assists.length || ''}</td>
              <td className={`is-num num${m.bonus > 0 ? ' is-bonus' : ' is-zero'}`}>{m.bonus}</td>
              <td className="is-num num ps-table__pts">{m.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeasonsTable({ seasons, t }) {
  return (
    <div className="ps-table-wrap">
      <table className="ps-table">
        <thead>
          <tr>
            <th scope="col">{t('spelers.popup.season')}</th>
            <th scope="col">{t('spelers.col.club')}</th>
            <th scope="col" className="is-num">{t('spelers.popup.pointsShort')}</th>
            <th scope="col" className="is-num" title={t('spelers.col.mp')}>{t('spelers.col.mpShort')}</th>
            <th scope="col" className="is-num">{t('spelers.col.minShort')}</th>
            <th scope="col" className="is-num">{t('spelers.col.gShort')}</th>
            <th scope="col" className="is-num">{t('spelers.col.aShort')}</th>
            <th scope="col" className="is-num" title={t('spelers.col.cs')}>{t('spelers.col.csShort')}</th>
          </tr>
        </thead>
        <tbody>
          {seasons.map(s => (
            <tr key={s.season}>
              <td className="num">{s.season}</td>
              <td>{s.club}</td>
              <td className="is-num num ps-table__pts">{s.pts}</td>
              <td className="is-num num">{s.mp}</td>
              <td className="is-num num">{s.min}</td>
              <td className="is-num num">{s.g}</td>
              <td className="is-num num">{s.a}</td>
              <td className="is-num num">{s.cs}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Een rij cijfers met een klein label erboven, gescheiden door 1px-lijnen (geen doosjes).
function StatStrip({ items, ariaLabel, className = '' }) {
  return (
    <dl className={`ps-stats ${className}`} aria-label={ariaLabel}>
      {items.map(item => (
        <div key={item.key} className="ps-stat">
          <dt className="ps-stat__label" title={item.title}>{item.label}</dt>
          <dd className={`ps-stat__value num${item.accent ? ' is-accent' : ''}`}>{item.value ?? '—'}</dd>
          {item.sub && <dd className={`ps-stat__sub num${item.subAccent ? ' is-accent' : ''}`}>{item.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

function ShareButton({ t, name, teamCode }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const language = languageFromPath(window.location.pathname) ?? 'nl';
    const url = `${window.location.origin}${pathForSheet({ kind: 'player', name, teamCode }, language)}`;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: name, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Delen geannuleerd of klembord niet beschikbaar: niets aan te doen.
    }
  };
  return (
    <>
      <button
        type="button" className="ui-btn ui-btn--icon ui-btn--bare ps-share" onClick={share}
        aria-label={t('playerSheet.shareAria', { name })} title={t('playerSheet.share')}
      >
        <Share2 aria-hidden="true" strokeWidth={1.75} />
      </button>
      {copied && <span className="ps-copied" role="status">{t('playerSheet.linkCopied')}</span>}
    </>
  );
}

export default function PlayerSheet({
  t, player, apiPlayer: apiPlayerProp, onClose,
  playerDatabase = [], setPiecesEntries = [], ratings, homeAdvantage,
  isWatched, onToggleWatch, onGoToTeamPlanner, onOpenClub,
  inCompare, compareFull, onToggleCompare,
}) {
  const headingId = 'fdr-player-sheet-title';
  const { name, teamCode } = player;
  const index = usePlayerIndex();
  const apiPlayer = apiPlayerProp ?? index.find(name, teamCode);
  const gw = index.data?.gw ?? 0;
  const season = apiPlayer ? buildRow(apiPlayer, 'season', gw) : null;
  const [{ loading, error, detail }, retry] = usePlayerDetail(apiPlayer?.id ?? null, apiPlayer?.pos ?? null);

  // De databank kent spelers op hun korte naam; de kaart kan ook met de volledige naam openen.
  const dbEntry = findInDatabase(playerDatabase, name, teamCode);
  const dbName = dbEntry?.name ?? name;
  const bonusEntry = findPlayerBonusEntry(buildBonuspuntenEntries(playerDatabase), { name: dbName, teamCode });
  const cardsEntry = buildKaartenEntries(playerDatabase).find(e => e.player === dbName && e.clubCode === teamCode) ?? null;
  const suspension = dbEntry?.suspension ?? null;
  const setPieceRoles = setPieceRolesFor(setPiecesEntries.find(e => e.clubCode === teamCode), name, t);

  // findLast: staan er ooit een oude en een nieuwe opstelling voor dezelfde club in de data, dan telt
  // de laatste (de nieuwste).
  const lineupSlot = PREDICTED_LINEUPS
    .findLast(l => l.clubCode === teamCode)?.slots
    ?.find(s => s.playerName === name) ?? null;
  // Enkel tonen als de opstellingen voor de KOMENDE speeldag online staan: die van vorige week leest
  // precies hetzelfde als een actuele.
  const isStaleLineup = PREDICTED_LINEUPS_GW < CURRENT_GW;

  const upcoming = (FIXTURES[teamCode] ?? []).slice(CURRENT_GW - 1, CURRENT_GW - 1 + FIXTURES_AHEAD);
  // Per wedstrijd zonder eenheid: "/wedstrijd" past niet onder elk cijfer. De legende eronder zegt het.
  const unit = '';
  const pos = apiPlayer?.pos || dbEntry?.position || null;
  const price = apiPlayer?.price || dbEntry?.price || null;

  const header = (
    <div className="ps-head">
      {apiPlayer ? <PlayerFace player={apiPlayer} name={name} size={72} /> : <PlayerFaceByName name={name} clubCode={teamCode} size={72} />}
      <div className="ps-head__text">
        <h2 id={headingId} className="ps-name">{name}</h2>
        <div className="ps-meta">
          {onOpenClub ? (
            <button
              type="button" className="ps-club" onClick={() => onOpenClub(teamCode)}
              aria-label={t('clubSheet.openAria', { club: teamCode })}
            >
              <ClubLogo code={teamCode} size={16} /> {teamCode}
            </button>
          ) : <span className="ps-club"><ClubLogo code={teamCode} size={16} /> {teamCode}</span>}
          {pos && <span title={t(`spelers.pos.${pos}`)}>· {pos}</span>}
          {price && <span className="num">· €{Number(price).toFixed(1)}</span>}
          <AvailabilityMark name={dbName} clubCode={teamCode} />
        </div>
        <div className="ps-head__actions">
          {onToggleWatch && (
            <StarButton
              active={Boolean(isWatched)} onClick={onToggleWatch}
              addLabel={t('watchlist.addAria', { name })} removeLabel={t('watchlist.removeAria', { name })}
            />
          )}
          <ShareButton t={t} name={name} teamCode={teamCode} />
        </div>
      </div>
    </div>
  );

  const footer = (onGoToTeamPlanner || onToggleCompare) ? (
    <>
      {onGoToTeamPlanner && <Button icon={Users} onClick={onGoToTeamPlanner}>{t('playerSheet.toTeamPlanner')}</Button>}
      {onToggleCompare && (
        <Button
          icon={Scale} onClick={onToggleCompare} aria-pressed={Boolean(inCompare)}
          disabled={!inCompare && compareFull}
        >
          {inCompare ? t('spelers.popup.inCompare') : t('spelers.popup.addCompare')}
        </Button>
      )}
    </>
  ) : null;

  const seasonStats = season ? [
    { key: 'pts', label: t('spelers.col.pts'), value: season.pts },
    { key: 'form', label: t('spelers.col.formShort'), title: t('spelers.col.form'), value: season.form },
    { key: 'sel', label: t('spelers.col.selShort'), title: t('spelers.col.sel'), value: season.sel != null ? `${season.sel}%` : null },
    { key: 'min', label: t('spelers.col.minShort'), title: t('spelers.col.min'), value: season.min },
    { key: 'g', label: t('spelers.col.g'), value: season.g },
    { key: 'a', label: t('spelers.col.a'), value: season.a },
  ] : null;

  const bonusStats = bonusEntry ? [
    {
      key: 'duels', label: t('bonuspunten.tab.duels'),
      value: `${bonusEntry.duelDiff > 0 ? '+' : ''}${bonusEntry.duelDiff}`,
      sub: perGameLabel(bonusEntry.duelDiff, bonusEntry.games, { showSign: true, unit }),
      subAccent: meetsThresholdPerGame(bonusEntry.duelDiff, bonusEntry.games, BONUS_THRESHOLD.duels),
      title: t('bonuspunten.duelsDetail', { won: bonusEntry.duelsWon, lost: bonusEntry.duelsLost }),
    },
    {
      key: 'headers', label: t('bonuspunten.tab.headers'), value: bonusEntry.defensiveHeaders,
      sub: perGameLabel(bonusEntry.defensiveHeaders, bonusEntry.games, { unit }),
      subAccent: meetsThresholdPerGame(bonusEntry.defensiveHeaders, bonusEntry.games, BONUS_THRESHOLD.defensiveHeaders),
    },
    {
      key: 'recoveries', label: t('bonuspunten.tab.recoveries'), value: bonusEntry.recoveries,
      sub: perGameLabel(bonusEntry.recoveries, bonusEntry.games, { unit }),
      subAccent: meetsThresholdPerGame(bonusEntry.recoveries, bonusEntry.games, BONUS_THRESHOLD.recoveries),
    },
    {
      key: 'bigChances', label: t('bonuspunten.tab.bigChances'), title: t('bonuspunten.stat.bigChances'), value: bonusEntry.bigChances,
      sub: perGameLabel(bonusEntry.bigChances, bonusEntry.games, { unit }),
      subAccent: meetsThresholdPerGame(bonusEntry.bigChances, bonusEntry.games, BONUS_THRESHOLD.bigChances),
    },
    {
      key: 'bonus', label: t('bonuspunten.tab.total'), title: t('bonuspunten.stat.bonusPoints'), value: bonusEntry.bonusPoints,
      sub: perGameLabel(bonusEntry.bonusPoints, bonusEntry.games, { unit }),
    },
  ].map(item => (
    // Keepers kunnen enkel het duelpunt halen (spec A6): de andere drie tellen niet en tonen "—".
    pos === 'GK' && ['headers', 'recoveries', 'bigChances'].includes(item.key)
      ? { ...item, value: '—', sub: null, subAccent: false, title: t('bonuspunten.gkNotCounted') }
      : item
  )) : null;

  return (
    <Sheet titleId={headingId} closeLabel={t('playerSheet.closeAria')} onClose={onClose} header={header} footer={footer} width="520px">
      {seasonStats && <StatStrip items={seasonStats} ariaLabel={t('playerSheet.statsAria')} />}

      <Section title={t('playerSheet.fixturesHeading')}>
        {upcoming.length > 0 ? (
          <FixtureStrip
            teamCode={teamCode} fixtures={upcoming} startGw={CURRENT_GW}
            ratings={ratings} homeAdvantage={homeAdvantage} gwLabel={t('fdr.gwLabel')}
          />
        ) : <p className="ps-empty">{t('playerSheet.noData')}</p>}
      </Section>

      <Section title={t('playerSheet.factsHeading')}>
        <dl className="ps-facts">
          {!isStaleLineup && (
            <>
              <dt>{t('playerSheet.lineupHeading')}</dt>
              <dd>
                {lineupSlot ? (
                  <span className="ps-facts__status">
                    <StatusDot level={lineupSlot.safety} />
                    {t(SAFETY_LABEL_KEYS[lineupSlot.safety] ?? 'playerSheet.noData')}
                  </span>
                ) : <span className="ps-muted">{t('playerSheet.notInLineup')}</span>}
              </dd>
            </>
          )}
          <dt>{t('playerSheet.setPiecesHeading')}</dt>
          <dd>{setPieceRoles.length > 0 ? setPieceRoles.join(' · ') : <span className="ps-muted">{t('playerSheet.noSetPieces')}</span>}</dd>
          <dt>{t('playerSheet.cardsHeading')}</dt>
          <dd>
            {cardsEntry ? (
              <>
                <span className="num">{cardsEntry.cards}</span>
                {suspension && (
                  <span className="ps-danger">
                    {' · '}{t(suspension.cause === 'red' ? 'availability.suspendedRed' : 'availability.suspendedYellow', { gw: suspension.gw, cardGw: suspension.cardGw, cards: suspension.cards })}
                  </span>
                )}
                {!suspension && cardsEntry.cardsRemaining > 0 && (
                  <span className={cardsEntry.cardsRemaining === 1 ? 'ps-warn' : 'ps-muted'}>
                    {' · '}{t('playerSheet.cardsUntilSuspension', { count: cardsEntry.cardsRemaining })}
                  </span>
                )}
              </>
            ) : <span className="ps-muted">{t('playerSheet.noData')}</span>}
          </dd>
        </dl>
      </Section>

      <Section title={t('playerSheet.bonusHeading')}>
        {bonusStats
          ? (
            <>
              <StatStrip items={bonusStats} ariaLabel={t('playerSheet.bonusHeading')} className="ps-stats--bonus" />
              <p className="ps-note">{t('playerSheet.bonusLegend')}</p>
            </>
          )
          : <p className="ps-empty">{t('playerSheet.noData')}</p>}
      </Section>

      {apiPlayer && loading && (
        <Section title={t('spelers.popup.pointsPerGw')}>
          <div role="status" aria-label={t('spelers.popup.loading')}>
            <Skeleton height={80} />
            <Skeleton height={12} style={{ marginTop: 'var(--s-3)' }} />
            <Skeleton height={12} style={{ marginTop: 'var(--s-2)' }} />
          </div>
        </Section>
      )}

      {apiPlayer && error && (
        <Section>
          <ErrorBanner onRetry={retry} retryLabel={t('shared.retry')}>{t('spelers.popup.error')}</ErrorBanner>
        </Section>
      )}

      {detail && (
        <>
          <Section title={t('spelers.popup.pointsPerGw')}>
            {detail.matches.length > 0 && gw > 0
              ? <PointsChart matches={detail.matches} gw={gw} t={t} />
              : <p className="ps-empty">{t('spelers.popup.noMatches')}</p>}
          </Section>

          {detail.matches.length > 0 && (
            <Section title={t('spelers.popup.matches')}>
              <MatchTable matches={[...detail.matches].reverse()} t={t} />
              <p className="ps-note">{t('spelers.popup.bonusNote')}</p>
            </Section>
          )}

          <Section title={t('spelers.popup.previousSeasons')}>
            {detail.seasons.length > 0
              ? <SeasonsTable seasons={detail.seasons} t={t} />
              : <p className="ps-empty">{t('spelers.popup.noPreviousSeasons')}</p>}
          </Section>
        </>
      )}
    </Sheet>
  );
}
