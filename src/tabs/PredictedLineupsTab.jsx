// Verwachte XI's (spec §7.2): de voorspelde basiselftallen van @5YSiebee, read-only.
//
// - Eén duidelijke toestand: zijn de opstellingen van de komende speeldag er (PREDICTED_LINEUPS_GW ===
//   CURRENT_GW), dan gewoon tonen. Zo niet, dan een statusregel "verschijnen vrijdag … om 16:00" met
//   aftelklok, en meteen daaronder de opstellingen van de vorige speeldag (labels iets gedimd).
// - Kiezen per wedstrijd: desktop toont beide ploegen naast elkaar, gsm één ploeg met een Segmented
//   (en vegen of pijlen om te wisselen).
// - "Overzicht": één tabel met alle 18 clubs, met de schakelaar "Enkel twijfels".
//
// Het veld komt uit de privé Predicted XI Builder (../predicted-xi/PitchField) met variant="site";
// zonder die prop ziet het veld er exact uit zoals in de builder en de PNG-export.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  TEAMS, TEAMS_ALPHA, CURRENT_GW, PREDICTED_LINEUPS_GW, POSTPONED, FIXTURES,
  getPredictedLineupsRelease,
} from '../constants';
import PitchField from '../predicted-xi/PitchField';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';
import PageHeader from '../ui/PageHeader';
import Segmented from '../ui/Segmented';
import Switch from '../ui/Switch';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { formatShellCountdown } from '../ui/AppShell';
import { postponedText } from '../postponed';
import '../ui/DataTable.css';
import './PredictedLineupsTab.css';

const noop = () => {};

// Stijlwaarden voor het veld op de site (spec §5.13): vlak, geen gradient, geen strepen, radius 0.
// Doorgegeven aan PitchField via siteTheme; src/predicted-xi/theme.js blijft onaangeroerd.
const SITE_PITCH_THEME = {
  field: { background: 'transparent', padding: 0, display: 'flex', flexDirection: 'column', gap: 0, maxWidth: '520px', width: '100%' },
  pitch: { background: 'var(--pitch)', borderRadius: 0, border: '1px solid var(--pitch-line)' },
  markings: { line: 'var(--pitch-line)' },
};

// Startzekerheid (spec §3.3). De sleutels zijn die uit de data van de builder.
const SAFETY_LEVELS = [
  { level: 'darkgreen', labelKey: 'predictedLineups.legend.certain' },
  { level: 'green', labelKey: 'predictedLineups.legend.starter' },
  { level: 'orange', labelKey: 'predictedLineups.legend.doubtful' },
  { level: 'red', labelKey: 'predictedLineups.legend.risk' },
];
const DOUBT_LEVELS = new Set(['orange', 'red']);
const safetyLabelKey = (level) => (SAFETY_LEVELS.find(s => s.level === level) ?? SAFETY_LEVELS[1]).labelKey;

const SHOWN_GW = PREDICTED_LINEUPS_GW;
const PUBLISHED = PREDICTED_LINEUPS_GW >= CURRENT_GW;

// Enkel opstellingen met minstens één geplaatste speler (een halfafgewerkte entry toont nooit als leeg veld).
const readyLineups = PREDICTED_LINEUPS.filter(l => l.slots.some(s => s.positionId !== '_unassigned' && s.playerName));
// findLast: komt een club twee keer voor, dan is de laatste de meest recente.
const lineupFor = (code) => readyLineups.findLast(l => l.clubCode === code) ?? null;
const teamByCode = (code) => TEAMS.find(team => team.code === code);

function fixtureEntries(code, gw) {
  const entry = FIXTURES[code]?.[gw - 1];
  if (!entry) return [];
  return (Array.isArray(entry) ? entry : [entry]).filter(x => typeof x === 'string' && x.includes('-'));
}

// De wedstrijden van een speeldag, uit FIXTURES (in die volgorde; aftraptijden zijn niet gekend).
function buildMatches(gw) {
  const seen = new Set();
  const matches = [];
  for (const team of TEAMS) {
    for (const entry of fixtureEntries(team.code, gw)) {
      const [opp, venue] = entry.split('-');
      const home = venue === 'H' ? team.code : opp;
      const away = venue === 'H' ? opp : team.code;
      const id = `${home}-${away}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const postponed = POSTPONED.has(`${home}-${gw}`) && POSTPONED.has(`${away}-${gw}`);
      matches.push({ id, home, away, postponed });
    }
  }
  return matches;
}

// Speler-slots in leesvolgorde: doelman, verdediging, middenveld, aanval; binnen een linie van links naar rechts.
function orderedSlots(lineup) {
  return lineup.slots
    .filter(s => s.positionId !== '_unassigned' && s.playerName)
    .slice()
    .sort((a, b) => (b.yPercent - a.yPercent) || (a.xPercent - b.xPercent));
}

// Spelers per linie (keeper, verdediging, middenveld, aanval), volgens de formatie: "4-3-3" geeft
// groepen van 1, 4, 3 en 3 in de volgorde van orderedSlots. Klopt het aantal niet (een onvolledige
// opstelling), dan één groep.
function groupByLine(lineup, players) {
  const sizes = [1, ...String(lineup.formationKey ?? '').split('-').map(Number)];
  if (sizes.some(n => !Number.isFinite(n) || n <= 0) || sizes.reduce((a, b) => a + b, 0) !== players.length) return [players];
  const groups = [];
  let at = 0;
  for (const n of sizes) { groups.push(players.slice(at, at + n)); at += n; }
  return groups;
}

// --- URL-state: ?match=CLU-AND&team=CLU&view=overzicht&twijfel=1 ---------------------------------
function readUrlState(matches) {
  const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const matchParam = (p.get('match') || '').toUpperCase();
  const teamParam = (p.get('team') || '').toUpperCase();
  let match = matches.find(m => m.id === matchParam);
  // Een oude link met enkel ?team=CLU: open de wedstrijd van die club.
  if (!match && teamParam) match = matches.find(m => m.home === teamParam || m.away === teamParam);
  match = match ?? matches.find(m => !m.postponed) ?? matches[0] ?? null;
  const team = match && (teamParam === match.home || teamParam === match.away) ? teamParam : match?.home ?? null;
  return {
    matchId: match?.id ?? null,
    team,
    view: p.get('view') === 'overzicht' ? 'overview' : 'pitch',
    onlyDoubts: p.get('twijfel') === '1',
  };
}

function writeUrlState(state) {
  const p = new URLSearchParams(window.location.search);
  if (state.matchId) p.set('match', state.matchId); else p.delete('match');
  if (state.team) p.set('team', state.team); else p.delete('team');
  if (state.view === 'overview') p.set('view', 'overzicht'); else p.delete('view');
  if (state.onlyDoubts) p.set('twijfel', '1'); else p.delete('twijfel');
  const search = p.toString();
  const url = window.location.pathname + (search ? `?${search}` : '');
  if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
}

// Tikt elke 30 seconden: genoeg voor een aftelklok in dagen/uren/minuten.
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function remainingParts(ms) {
  if (ms <= 0) return null;
  const totalMinutes = Math.floor(ms / 60000);
  return { days: Math.floor(totalMinutes / 1440), hours: Math.floor((totalMinutes % 1440) / 60), minutes: totalMinutes % 60, totalMinutes };
}

function formatRelease(date, language, t) {
  const locale = { fr: 'fr-BE', en: 'en-GB' }[language] ?? 'nl-BE';
  const day = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Brussels', weekday: 'long', day: 'numeric', month: 'short' }).format(date).replace(/\.$/, '');
  const time = new Intl.DateTimeFormat(locale, { timeZone: 'Europe/Brussels', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return `${day} ${t('predictedLineups.releaseAt')} ${time}`;
}

// --- Kleine stukken ------------------------------------------------------------------------------
function ClubLogo({ code, size = 20 }) {
  return (
    <img
      src={`/club-logos/${code}.webp`} alt="" width={size} height={size} className="club-logo"
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}

function SafetyDot({ level, t }) {
  return <span className={`pxl-dot is-${level ?? 'green'}`} role="img" aria-label={t(safetyLabelKey(level))} />;
}

function Legend({ t }) {
  return (
    <ul className="pxl-legend" aria-label={t('predictedLineups.legendAria')}>
      {SAFETY_LEVELS.map(({ level, labelKey }) => (
        <li key={level}><span className={`pxl-dot is-${level}`} aria-hidden="true" />{t(labelKey)}</li>
      ))}
    </ul>
  );
}

function MatchButton({ match, active, onSelect, t }) {
  const home = teamByCode(match.home);
  const away = teamByCode(match.away);
  return (
    <button
      type="button"
      className={`pxl-match${active ? ' is-active' : ''}${match.postponed ? ' is-postponed' : ''}`}
      aria-pressed={active}
      aria-label={`${t('predictedLineups.matchAria', { home: home?.name ?? match.home, away: away?.name ?? match.away })}${match.postponed ? ` (${t('predictedLineups.postponed')})` : ''}`}
      onClick={() => onSelect(match)}
    >
      <ClubLogo code={match.home} />
      <span className="pxl-match__code">{match.home}</span>
      <span className="pxl-match__sep" aria-hidden="true">–</span>
      <span className="pxl-match__code">{match.away}</span>
      <ClubLogo code={match.away} />
    </button>
  );
}

// Eén kant van een wedstrijd: kop (logo, club, formatie) + veld, of een melding.
function Side({ t, language, code, oppCode, isHome, onOpenPlayer, onOpenClub, hiddenOnMobile }) {
  const club = teamByCode(code);
  const lineup = lineupFor(code);
  const postponed = POSTPONED.has(`${code}-${SHOWN_GW}`);
  const className = `pxl-side${hiddenOnMobile ? ' is-hidden-mobile' : ''}`;

  let body;
  if (postponed) {
    const entry = fixtureEntries(code, SHOWN_GW)[0];
    const [opp, venue] = entry ? entry.split('-') : [oppCode, isHome ? 'H' : 'A'];
    body = <EmptyState>{t('predictedLineups.notPlaying')}. {postponedText(t, language, code, opp, venue)}</EmptyState>;
  } else if (!lineup) {
    body = <EmptyState>{t('predictedLineups.noLineup', { club: club?.name ?? code })}</EmptyState>;
  } else {
    body = (
      <PitchField
        readOnly
        variant="site"
        siteTheme={SITE_PITCH_THEME}
        club={club}
        opponent={teamByCode(oppCode)}
        onViewPlayer={onOpenPlayer}
        viewPlayerLabel={name => t('playerSheet.openAria', { name })}
        slots={lineup.slots}
        activeSlotIndex={null}
        onSlotClick={noop}
        onRemove={noop}
        onCycleSafety={noop}
        onDragStart={noop}
        onSlotDrop={noop}
      />
    );
  }

  return (
    <section className={className} aria-label={club?.name ?? code}>
      <header className="pxl-side__head">
        <ClubLogo code={code} size={24} />
        <button type="button" className="pxl-side__club" onClick={() => onOpenClub?.(code)} aria-label={t('clubSheet.openAria', { club: club?.name ?? code })}>
          {club?.name ?? code}
        </button>
        {lineup && !postponed && <span className="pxl-side__formation num">{lineup.formationKey}</span>}
        {lineup?.lastUpdatedLabel && !postponed && (
          <span className="pxl-side__updated">{t('predictedLineups.lastUpdated', { date: lineup.lastUpdatedLabel })}</span>
        )}
      </header>
      {body}
    </section>
  );
}

function Overview({ t, onlyDoubts, onOpenPlayer, onOpenClub }) {
  const rows = TEAMS_ALPHA.map(team => {
    const lineup = lineupFor(team.code);
    const entries = fixtureEntries(team.code, SHOWN_GW);
    const postponed = POSTPONED.has(`${team.code}-${SHOWN_GW}`);
    const players = lineup ? orderedSlots(lineup) : [];
    const groups = lineup ? groupByLine(lineup, players)
      .map(g => (onlyDoubts ? g.filter(s => DOUBT_LEVELS.has(s.safety)) : g))
      .filter(g => g.length > 0) : [];
    const shown = groups.flat();
    return { team, lineup, entries, postponed, shown, groups };
  }).filter(r => !onlyDoubts || r.shown.length > 0);

  if (onlyDoubts && rows.length === 0) return <EmptyState>{t('predictedLineups.noDoubts')}</EmptyState>;

  return (
    <div className="ui-table-scroll">
      <table className="ui-table pxl-overview">
        <thead>
          <tr>
            <th scope="col">{t('predictedLineups.colClub')}</th>
            <th scope="col">{t('predictedLineups.colMatch')}</th>
            <th scope="col">{t('predictedLineups.colFormation')}</th>
            <th scope="col">{t('predictedLineups.colPlayers')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ team, lineup, entries, postponed, groups }) => (
            <tr key={team.code}>
              <th scope="row" className="pxl-overview__club">
                <button type="button" onClick={() => onOpenClub?.(team.code)} aria-label={t('clubSheet.openAria', { club: team.name })}>
                  <ClubLogo code={team.code} size={16} />
                  <span>{team.code}</span>
                </button>
              </th>
              <td className="pxl-overview__match">
                {postponed ? <span className="pxl-muted">{t('predictedLineups.postponed')}</span>
                  : entries.length === 0 ? <span className="pxl-muted">—</span>
                  : entries.map(e => {
                    const [opp, venue] = e.split('-');
                    return <span key={e} className="pxl-overview__opp">{t('predictedLineups.vs')} {opp} <span className="pxl-muted">({venue})</span></span>;
                  })}
              </td>
              <td className="pxl-overview__formation num">{lineup ? lineup.formationKey : '—'}</td>
              <td className="pxl-overview__players">
                {lineup ? (
                  // Eén lijstje per linie: op gsm elk op een eigen regel, op desktop naast elkaar met een
                  // scheidingslijn. Zo lees je de opstelling als opstelling i.p.v. als één lange rij.
                  <div className="pxl-lines">
                    {groups.map((group, gi) => (
                      <ul key={gi} className="pxl-names">
                        {group.map((slot, i) => (
                          <li key={`${slot.playerName}-${i}`}>
                            <button type="button" className="pxl-name" onClick={() => onOpenPlayer?.(slot.playerName, slot.playerTeamCode || team.code)}>
                              <SafetyDot level={slot.safety} t={t} />
                              {slot.playerName}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ))}
                  </div>
                ) : <span className="pxl-muted">{t('predictedLineups.noLineup', { club: team.name })}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PredictedLineupsTab({ t, language = 'nl', onOpenPlayer, onOpenClub }) {
  const matches = useMemo(() => buildMatches(SHOWN_GW), []);
  const [state, setState] = useState(() => readUrlState(matches));
  useEffect(() => { writeUrlState(state); }, [state]);

  const now = useNow();
  const release = PUBLISHED ? null : getPredictedLineupsRelease(CURRENT_GW);
  const remaining = release ? remainingParts(release.getTime() - now) : null;

  const matchIndex = Math.max(0, matches.findIndex(m => m.id === state.matchId));
  const match = matches[matchIndex] ?? null;
  const selectMatch = (m, team) => setState(s => ({ ...s, matchId: m.id, team: team ?? m.home }));
  const stepMatch = (delta) => {
    if (matches.length === 0) return;
    const next = matches[(matchIndex + delta + matches.length) % matches.length];
    selectMatch(next);
  };

  // Gsm: horizontaal vegen op het veld = de andere ploeg van dezelfde wedstrijd.
  const touch = useRef(null);
  const onTouchStart = (e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start || !match || window.matchMedia('(min-width: 900px)').matches) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setState(s => ({ ...s, team: s.team === match.home ? match.away : match.home }));
  };

  const credits = (
    <>
      <a href="https://discord.gg/EhEQjvdgW" target="_blank" rel="noopener noreferrer" className="pxl-credit">@5YSiebee</a>
      <span aria-hidden="true"> · </span>
      <a href="https://x.com/fpl_proleague" target="_blank" rel="noopener noreferrer" className="pxl-credit">@fpl_proleague</a>
    </>
  );
  const meta = (
    <>
      {PUBLISHED
        ? <span className="num">{t('predictedLineups.pitchGwLabel', { gw: SHOWN_GW })}</span>
        : <span>{t('predictedLineups.metaPrevious', { gw: SHOWN_GW })}</span>}
      <span aria-hidden="true"> · </span>
      {t('predictedLineups.by')} {credits}
    </>
  );

  const header = <PageHeader title={t('predictedLineups.pageTitle')} meta={meta} intro={t('predictedLineups.intro')} />;

  if (readyLineups.length === 0) {
    return (<>{header}<EmptyState>{t('predictedLineups.empty')}</EmptyState></>);
  }

  const viewOptions = [
    { value: 'pitch', label: t('predictedLineups.view.pitch') },
    { value: 'overview', label: t('predictedLineups.view.overview') },
  ];

  return (
    <div className={`pxl${PUBLISHED ? '' : ' pxl--previous'}`}>
      {header}

      {!PUBLISHED && release && (
        <p className="pxl-status" role="status">
          <strong>{t('predictedLineups.releaseLine', { gw: CURRENT_GW, when: formatRelease(release, language, t) })}</strong>
          {remaining && <> <span className="pxl-status__in">({t('predictedLineups.releaseIn', { time: '' })}<span className="num">{formatShellCountdown(remaining, language)}</span>)</span></>}
        </p>
      )}

      <div className="pxl-toolbar">
        <Segmented options={viewOptions} value={state.view} onChange={v => setState(s => ({ ...s, view: v }))} ariaLabel={t('predictedLineups.viewAria')} />
        {state.view === 'overview' && (
          <Switch checked={state.onlyDoubts} onChange={v => setState(s => ({ ...s, onlyDoubts: v }))} label={t('predictedLineups.onlyDoubts')} />
        )}
        <Legend t={t} />
      </div>

      {state.view === 'overview' ? (
        <Overview t={t} onlyDoubts={state.onlyDoubts} onOpenPlayer={onOpenPlayer} onOpenClub={onOpenClub} />
      ) : (
        <>
          <div className="pxl-matches" role="group" aria-label={t('predictedLineups.pickMatchAria')}>
            {matches.map(m => (
              <MatchButton key={m.id} match={m} active={m.id === match?.id} onSelect={selectMatch} t={t} />
            ))}
          </div>

          {match && (
            <>
              <div className="pxl-teamswitch">
                <Segmented
                  options={[match.home, match.away].map(code => ({ value: code, label: code }))}
                  value={state.team ?? match.home}
                  onChange={v => setState(s => ({ ...s, team: v }))}
                  ariaLabel={t('predictedLineups.pickTeamAria')}
                />
              </div>
              <div className="pxl-pitches" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
                <Side t={t} language={language} code={match.home} oppCode={match.away} isHome onOpenPlayer={onOpenPlayer} onOpenClub={onOpenClub} hiddenOnMobile={state.team === match.away} />
                <span className="pxl-vs" aria-hidden="true">{t('predictedLineups.vs')}</span>
                <Side t={t} language={language} code={match.away} oppCode={match.home} isHome={false} onOpenPlayer={onOpenPlayer} onOpenClub={onOpenClub} hiddenOnMobile={state.team !== match.away} />
              </div>
              <div className="pxl-steppers">
                <Button variant="icon" icon={ChevronLeft} onClick={() => stepMatch(-1)} aria-label={t('predictedLineups.prevMatch')} />
                <span className="pxl-steppers__pos num">{matchIndex + 1}/{matches.length}</span>
                <Button variant="icon" icon={ChevronRight} onClick={() => stepMatch(1)} aria-label={t('predictedLineups.nextMatch')} />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
