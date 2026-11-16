// Eén paneel met alles wat de site over één club weet (spec §7.10): recente vorm, xG van de laatste
// vijf wedstrijden (spec F2, enkel als API-Football antwoordt), de komende acht
// speeldagen in FDR-kleur, wie de stilstaande fases neemt, de verwachte XI en de spelers van die club
// met de meeste bonuspunten.
//
// Deelt zijn frame (dialoog, focus, Escape, lade op desktop / bottom sheet op gsm) met de spelerskaart,
// zie Sheet.jsx. Vanuit hier een speler openen vervángt deze sheet: FDRTool.jsx houdt één sheet-state
// bij, dus er kan nooit een stapel ontstaan.
import { CURRENT_GW, FIXTURES, GW_COUNT, PREDICTED_LINEUPS_GW, TEAMS, getFixtureInfo } from '../constants';
import { buildBonuspuntenEntries, rankByBonusPoints, SORT_MODES } from '../bonuspunten';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';
import Sheet, { SheetSection as Section } from './Sheet';
import FdrCell from '../ui/FdrCell';
import StatusDot from '../ui/StatusDot';
import { PlayerFaceByName } from '../ui/PlayerFace';
import { ClubLogo } from './SpelersParts';
import { XG_MATCHES, resultOf, summarizeXg, useTeamXg } from '../data/teamXg';
import './ClubSheet.css';

// Acht speeldagen vooruit, zoals de FDR-tabel standaard toont.
const FIXTURES_AHEAD = 8;
// Hoeveel spelers van deze club in de bonuspunten-top.
const TOP_PLAYERS = 5;

const SAFETY_LABEL_KEYS = {
  darkgreen: 'predictedLineups.legend.certain',
  green: 'predictedLineups.legend.starter',
  orange: 'predictedLineups.legend.doubtful',
  red: 'predictedLineups.legend.risk',
};

export default function ClubSheet({
  t, clubCode, onClose, playerDatabase = [], setPiecesEntries = [],
  ratings, homeAdvantage, teamForm, onOpenPlayer,
}) {
  const headingId = 'fdr-club-sheet-title';
  const club = TEAMS.find(x => x.code === clubCode);
  const clubName = club?.name ?? clubCode;

  const fixtures = FIXTURES[clubCode] ?? [];
  const upcomingGws = [];
  for (let gw = CURRENT_GW; gw < CURRENT_GW + FIXTURES_AHEAD && gw <= GW_COUNT; gw++) upcomingGws.push(gw);

  // teamForm komt uit FDRTool.jsx (berekend door api/team-form.js): één bron voor de hele site.
  const form = teamForm?.[clubCode] ?? [];
  const setPieces = setPiecesEntries.find(e => e.clubCode === clubCode) ?? null;
  const xgClubs = useTeamXg();
  const xg = summarizeXg(xgClubs?.[clubCode]);

  // De laatst beschikbare verwachte opstelling (findLast: bij een oude én een nieuwe telt de nieuwste).
  const lineup = PREDICTED_LINEUPS.findLast(l => l.clubCode === clubCode) ?? null;
  const lineupPlayers = (lineup?.slots ?? []).filter(s => s.positionId !== '_unassigned' && s.playerName);
  const isStaleLineup = PREDICTED_LINEUPS_GW < CURRENT_GW;

  // Enkel de spelers van deze club, met dezelfde rangschikking als de Bonuspunten-tab.
  const topPlayers = rankByBonusPoints(
    buildBonuspuntenEntries(playerDatabase).filter(e => e.clubCode === clubCode),
    SORT_MODES.total,
    0,
  ).slice(0, TOP_PLAYERS);

  // De vorm komt als W/G/V (Nederlands) uit api/team-form.js; toon de letters in de taal van de pagina,
  // zodat ze overeenkomen met de uitslagen in het xG-blok (in het Frans is "V" net een overwinning).
  const formLetter = (r) => t(({ W: 'spelers.popup.resultW', G: 'spelers.popup.resultD', V: 'spelers.popup.resultL' })[r] ?? '') || r;

  const header = (
    <div className="cs-head">
      <img
        className="cs-logo" src={`/club-logos/${clubCode}.webp`} alt="" width={48} height={48}
        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
      />
      <div className="cs-head__text">
        <h2 id={headingId} className="cs-name">{clubName}</h2>
        {form.length > 0 && (
          <div className="cs-form" role="img" aria-label={t('clubSheet.formAria', { results: form.map(formLetter).join(', ') })}>
            {form.map((r, i) => <span key={i} className={`cs-form__r is-${r}`} aria-hidden="true">{formLetter(r)}</span>)}
          </div>
        )}
      </div>
    </div>
  );

  const openPlayer = (name, code) => onOpenPlayer?.(name, code || clubCode);

  return (
    <Sheet titleId={headingId} closeLabel={t('clubSheet.closeAria')} onClose={onClose} header={header}>
      {xg && <XgSection t={t} xg={xg} />}

      <Section title={t('clubSheet.fixturesHeading')}>
        {upcomingGws.length > 0 ? (
          <div className="cs-fdr" style={{ '--cs-cols': upcomingGws.length }}>
            {upcomingGws.map(gw => {
              const fixture = fixtures[gw - 1];
              const info = fixture ? getFixtureInfo(clubCode, fixture, gw, ratings, homeAdvantage) : null;
              return (
                <div key={gw} className="cs-fdr__col">
                  <span className="cs-fdr__gw num" aria-hidden="true">{t('fdr.gwLabel')}{gw}</span>
                  <FdrCell as="span" info={info} ariaLabel={`${t('fdr.gwLabel')}${gw}`} />
                </div>
              );
            })}
          </div>
        ) : <p className="cs-empty">{t('clubSheet.noData')}</p>}
      </Section>

      <Section title={t('clubSheet.setPiecesHeading')}>
        {setPieces ? (
          <dl className="cs-sp">
            <dt>{t('setpieces.col.penalties')}</dt><dd>{setPieces.penalties || '—'}</dd>
            <dt>{t('setpieces.col.corners')}</dt><dd>{setPieces.corners || '—'}</dd>
            <dt>{t('setpieces.col.freeKicks')}</dt><dd>{setPieces.freeKicks || '—'}</dd>
          </dl>
        ) : <p className="cs-empty">{t('clubSheet.noData')}</p>}
      </Section>

      <Section title={t('clubSheet.lineupHeadingGw', { gw: PREDICTED_LINEUPS_GW })}>
        {lineupPlayers.length > 0 ? (
          <>
            {isStaleLineup && <p className="cs-note">{t('clubSheet.lineupOld', { gw: CURRENT_GW })}</p>}
            <ol className="cs-xi">
              {lineupPlayers.map((slot, i) => (
                <li key={`${slot.playerName}-${i}`}>
                  <span className="cs-xi__nr num">{i + 1}</span>
                  <StatusDot level={slot.safety} label={t(SAFETY_LABEL_KEYS[slot.safety] ?? 'predictedLineups.legend.starter')} />
                  {onOpenPlayer ? (
                    <button
                      type="button" className="cs-xi__name"
                      onClick={() => openPlayer(slot.playerName, slot.playerTeamCode)}
                      aria-label={t('playerSheet.openAria', { name: slot.playerName })}
                    >
                      {slot.playerName}
                    </button>
                  ) : <span className="cs-xi__name">{slot.playerName}</span>}
                </li>
              ))}
            </ol>
          </>
        ) : <p className="cs-empty">{t('clubSheet.noLineup')}</p>}
      </Section>

      <Section title={t('clubSheet.topPlayersHeading')}>
        {topPlayers.length > 0 ? (
          <ol className="cs-top">
            {topPlayers.map((entry, i) => (
              <li key={entry.player}>
                <button
                  type="button" className="cs-top__row" disabled={!onOpenPlayer}
                  onClick={() => openPlayer(entry.player, entry.clubCode)}
                  aria-label={t('playerSheet.openAria', { name: entry.player })}
                >
                  <span className="cs-xi__nr num">{i + 1}</span>
                  <PlayerFaceByName name={entry.player} clubCode={entry.clubCode} size={24} />
                  <span className="cs-top__name">{entry.player}</span>
                  <span className={`cs-top__val num${i === 0 ? ' is-top' : ''}`}>{entry.bonusPoints}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : <p className="cs-empty">{t('clubSheet.noData')}</p>}
      </Section>
    </Sheet>
  );
}

const fmt = (v) => (v == null ? '—' : v.toFixed(1));

// xG voor en tegen (laatste vijf), met de echte doelpunten ernaast, en per wedstrijd een rijtje.
function XgSection({ t, xg }) {
  const resultLetter = { W: t('spelers.popup.resultW'), D: t('spelers.popup.resultD'), L: t('spelers.popup.resultL') };
  return (
    <Section title={t('clubSheet.xgHeading', { n: XG_MATCHES })}>
      <dl className="cs-xg">
        <div className="cs-xg__tile">
          <dt>{t('clubSheet.xgFor')}</dt>
          <dd><span className="cs-xg__val num">{fmt(xg.xg)}</span> <span className="cs-xg__unit">{t('clubSheet.xgPerMatch')}</span></dd>
          <dd className="cs-xg__goals">{t('clubSheet.xgGoals', { value: fmt(xg.gf) })}</dd>
        </div>
        <div className="cs-xg__tile">
          <dt>{t('clubSheet.xgAgainst')}</dt>
          <dd><span className="cs-xg__val num">{fmt(xg.xga)}</span> <span className="cs-xg__unit">{t('clubSheet.xgPerMatch')}</span></dd>
          <dd className="cs-xg__goals">{t('clubSheet.xgGoals', { value: fmt(xg.ga) })}</dd>
        </div>
      </dl>
      <table className="cs-xgt">
        <thead>
          <tr>
            <th scope="col">{t('spelers.popup.opponent')}</th>
            <th scope="col">{t('clubSheet.xgResult')}</th>
            <th scope="col" className="is-num" title={t('clubSheet.xgFor')}>{t('clubSheet.xgShort')}</th>
            <th scope="col" className="is-num" title={t('clubSheet.xgAgainst')}>{t('clubSheet.xgaShort')}</th>
          </tr>
        </thead>
        <tbody>
          {xg.matches.map((m, i) => {
            const result = resultOf(m);
            return (
              <tr key={`${m.date}-${i}`}>
                <td>
                  <span className="cs-xgt__opp">
                    <ClubLogo code={m.opp} size={14} />
                    <span>{m.opp}</span>
                    <span className="cs-xgt__venue">{m.home ? t('spelers.popup.home') : t('spelers.popup.away')}</span>
                  </span>
                </td>
                <td>
                  <span className="num">{m.gf ?? '?'}–{m.ga ?? '?'}</span>
                  {result && <span className={`cs-xgt__res is-${result}`}>{resultLetter[result]}</span>}
                </td>
                <td className="is-num num">{fmt(m.xg)}</td>
                <td className="is-num num">{fmt(m.xga)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="cs-xg__hint">{t('clubSheet.xgHint')}</p>
    </Section>
  );
}
