// Eén paneel met alles wat de site over één club weet: komende fixtures met hun FDR-kleur, recente
// vorm, wie de standaardsituaties neemt, de verwachte basiself en de vijf spelers van die club met de
// meeste bonuspunten.
//
// Tot nu toe waren de ruim honderd clublogo's op de site pure decoratie. Ze zijn nu de ingang naar dit
// paneel — het antwoord op "en hoe staat die club er eigenlijk voor?", zonder dat je vier tabs moet
// aflopen.
//
// Deelt zijn frame (dialoog-semantiek, focus, Escape, desktop-modal vs. bottom sheet) met de
// speler-sheet, zie Sheet.jsx. Vanuit hier een speler openen vervángt deze sheet: FDRTool.jsx houdt
// één sheet-state bij, dus er kan nooit een stapel ontstaan.
import { CURRENT_GW, FIXTURES, TEAM_FORM, TEAMS } from '../constants';
import { buildBonuspuntenEntries, rankByBonusPoints, SORT_MODES } from '../bonuspunten';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';
import { SAFETY_STYLE } from '../predicted-xi/theme';
import { MiniFixtureBadge } from './MiniFixtureBadge';
import Sheet, { SheetSection as Section, sheetEmptyTextStyle as emptyTextStyle } from './Sheet';

// Vijf speeldagen vooruit: genoeg om een run te beoordelen, kort genoeg om naast de rest van het
// paneel te passen. Bewust losgekoppeld van de GW-horizon van de hoofdtabel — dit is een
// detailweergave, geen planningsoverzicht.
const FIXTURES_AHEAD = 5;

// Hoeveel spelers van deze club in de bonuspunten-top. Vijf, zoals de "Beste fixture runs"-lijst.
const TOP_PLAYERS = 5;

// Zelfde kleurtaal als de vormbalk in de hoofdtabel (FDRTab.jsx): bewust subtieler dan RATING_STYLE,
// want die kleuren betekenen iets heel anders (ingeschatte moeilijkheid, geen echte uitslag).
const FORM_RESULT_STYLE = {
  W: { bg: 'rgba(78,205,196,0.9)', text: '#0B2E1B' },
  G: { bg: 'rgba(255,255,255,0.18)', text: '#C9B8E0' },
  V: { bg: 'rgba(194,64,44,0.65)', text: '#FFFFFF' },
};

function SetPieceLine({ label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '3px 0' }}>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        width: '20px', height: '20px', borderRadius: '50%',
        background: 'rgba(78,205,196,0.15)', border: '1px solid #4ECDC4', color: '#4ECDC4',
        fontSize: label.length > 1 ? '8px' : '10px', fontWeight: 800,
      }}>
        {label}
      </span>
      <span style={{ color: '#EDE4F5', fontSize: '13px', fontWeight: 600, lineHeight: 1.45, wordBreak: 'break-word' }}>
        {value || <span style={{ color: '#6B5289' }}>—</span>}
      </span>
    </div>
  );
}

export default function ClubSheet({
  t, clubCode, onClose, playerDatabase = [], setPiecesEntries = [],
  ratings, homeAdvantage, onOpenPlayer,
}) {
  const headingId = 'fdr-club-sheet-title';
  const club = TEAMS.find(x => x.code === clubCode);
  const clubName = club?.name ?? clubCode;

  const upcoming = (FIXTURES[clubCode] ?? []).slice(CURRENT_GW - 1, CURRENT_GW - 1 + FIXTURES_AHEAD);
  const form = TEAM_FORM[clubCode] ?? [];
  const setPieces = setPiecesEntries.find(e => e.clubCode === clubCode) ?? null;

  // findLast, net als in PredictedLineupsTab: mocht er ooit weer een oude en een nieuwe opstelling voor
  // dezelfde club naast elkaar in de data staan, dan telt de laatste (de nieuwste).
  const lineup = PREDICTED_LINEUPS.findLast(l => l.clubCode === clubCode) ?? null;
  const lineupPlayers = (lineup?.slots ?? [])
    .filter(s => s.positionId !== '_unassigned' && s.playerName);

  // Enkel de spelers van deze club, daarna dezelfde rangschikking als de Bonuspunten-tab gebruikt —
  // zo staat hier nooit een andere volgorde dan op die tab zelf.
  const topPlayers = rankByBonusPoints(
    buildBonuspuntenEntries(playerDatabase).filter(e => e.clubCode === clubCode),
    SORT_MODES.total,
    0,
  ).slice(0, TOP_PLAYERS);

  const header = (
    <>
      <img
        src={`/club-logos/${clubCode}.webp`}
        alt=""
        style={{ width: '34px', height: '34px', objectFit: 'contain', flexShrink: 0 }}
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <h3 id={headingId} className="fdr-title" style={{ color: '#FFF', fontSize: '17px', margin: 0 }}>
          {clubName}
        </h3>
        {form.length > 0 && (
          <div
            aria-label={t('clubSheet.formAria', { results: form.join(', ') })}
            style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}
          >
            {form.map((r, i) => (
              <span key={i} title={r} aria-hidden="true" style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '16px', height: '16px', borderRadius: '4px', padding: '0 3px',
                fontSize: '9px', fontWeight: 800,
                background: FORM_RESULT_STYLE[r]?.bg ?? 'rgba(255,255,255,0.25)',
                color: FORM_RESULT_STYLE[r]?.text ?? '#C9B8E0',
              }}>
                {r}
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );

  return (
    <Sheet titleId={headingId} closeLabel={t('clubSheet.closeAria')} onClose={onClose} header={header}>
      <Section title={t('clubSheet.fixturesHeading')}>
        {upcoming.length > 0 ? (
          <div className="fdr-mini-fixture-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
            {upcoming.map((fixture, i) => (
              <MiniFixtureBadge
                key={i}
                teamCode={clubCode}
                fixture={fixture}
                gwNumber={CURRENT_GW + i}
                ratings={ratings}
                homeAdvantage={homeAdvantage}
              />
            ))}
          </div>
        ) : <p style={emptyTextStyle}>{t('clubSheet.noData')}</p>}
      </Section>

      <Section title={t('clubSheet.setPiecesHeading')}>
        {setPieces ? (
          <>
            <SetPieceLine label="P" value={setPieces.penalties} />
            <SetPieceLine label="C" value={setPieces.corners} />
            <SetPieceLine label="FK" value={setPieces.freeKicks} />
          </>
        ) : <p style={emptyTextStyle}>{t('clubSheet.noData')}</p>}
      </Section>

      <Section title={t('clubSheet.lineupHeading')}>
        {lineupPlayers.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {lineupPlayers.map((slot, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onOpenPlayer?.(slot.playerName, slot.playerTeamCode || clubCode)}
                aria-label={t('playerSheet.openAria', { name: slot.playerName })}
                disabled={!onOpenPlayer}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  // Zelfde safety-kleur als de kaartrand op het veld, zodat "wie start er zeker"
                  // hier hetzelfde leest als op de Verwachte XI's-tab.
                  border: `1px solid ${SAFETY_STYLE[slot.safety]?.border ?? 'rgba(255,255,255,0.12)'}`,
                  borderRadius: '999px', padding: '4px 10px',
                  color: '#EDE4F5', fontSize: '11px', fontWeight: 700,
                  fontFamily: 'inherit', cursor: onOpenPlayer ? 'pointer' : 'default',
                }}
              >
                {slot.playerName}
              </button>
            ))}
          </div>
        ) : <p style={emptyTextStyle}>{t('clubSheet.noLineup')}</p>}
      </Section>

      <Section title={t('clubSheet.topPlayersHeading')}>
        {topPlayers.length > 0 ? (
          <div style={{ display: 'grid', gap: '4px' }}>
            {topPlayers.map((entry, i) => (
              <button
                key={entry.player}
                type="button"
                onClick={() => onOpenPlayer?.(entry.player, entry.clubCode)}
                aria-label={t('playerSheet.openAria', { name: entry.player })}
                disabled={!onOpenPlayer}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px', width: '100%',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '8px', padding: '7px 10px', textAlign: 'left',
                  fontFamily: 'inherit', cursor: onOpenPlayer ? 'pointer' : 'default',
                }}
              >
                <span style={{ color: i === 0 ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '13px', width: '14px', flexShrink: 0 }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: '#FFF', fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.player}
                </span>
                <span style={{ color: '#4ECDC4', fontWeight: 900, fontSize: '14px', flexShrink: 0 }}>
                  {entry.bonusPoints}
                </span>
              </button>
            ))}
          </div>
        ) : <p style={emptyTextStyle}>{t('clubSheet.noData')}</p>}
      </Section>
    </Sheet>
  );
}
