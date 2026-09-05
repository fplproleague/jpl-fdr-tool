// Publieke, volledig read-only weergave van de 18 voorspelde basiselven (één per club) — presentational
// component zonder gedeelde/aanpasbare state vanuit FDRTool.jsx (enkel lokale UI-state voor "welke club
// is geselecteerd"). Hergebruikt PitchField/PitchSlot rechtstreeks uit de privé Predicted XI Builder
// (../predicted-xi/) via hun readOnly-prop, zodat de visuele stijl (veld, kaartjes, kleuren, header)
// gegarandeerd exact dezelfde is als de privé-tool — geen duplicatie, geen risico op visuele drift.
import { useState } from 'react';
import { AlertTriangle, CalendarOff } from 'lucide-react';
import { TEAMS, CURRENT_GW, PREDICTED_LINEUPS_GW, POSTPONED, FIXTURES, buildPostponedTooltipText } from '../constants';
import { COLORS } from '../theme';
import { FORMATIONS } from '../predicted-xi/formations';
import PitchField from '../predicted-xi/PitchField';
import { SAFETY_STYLE } from '../predicted-xi/theme';
import { PREDICTED_LINEUPS } from '../predictedLineupsData';

const noop = () => {};

// Legt uit wat de kaartrand-kleur op elke kaart betekent (zie SAFETY_STYLE in theme.js voor de
// kleurwaarden zelf — hier enkel de korte, publieksvriendelijke labels, bewust anders/beknopter dan de
// interne titels op de safety-badge in de privé-tool, die daar als hover-tooltip dienen i.p.v. een
// permanent zichtbare legende). labelKey i.p.v. een kant-en-klare tekst, zodat de legende meevertaalt.
const SAFETY_LEGEND = [
  { level: 'darkgreen', labelKey: 'predictedLineups.legend.certain' },
  { level: 'green', labelKey: 'predictedLineups.legend.starter' },
  { level: 'orange', labelKey: 'predictedLineups.legend.doubtful' },
  { level: 'red', labelKey: 'predictedLineups.legend.risk' },
];

// Filtert lineups zonder één enkele geplaatste speler eruit (bv. een club die nog niet af is) — zo
// verschijnt zo'n club nooit als een lege, verwarrende kaart in de kiezer, ook niet als
// predictedLineupsData.js per ongeluk een halfafgewerkte entry bevat.
const readyLineups = PREDICTED_LINEUPS.filter(l => l.slots.some(s => s.positionId !== '_unassigned' && s.playerName));

// Clubs zonder wedstrijd in de GW waarvoor deze opstellingen gelden (uitgestelde fixture — zie
// POSTPONED in constants.js, al de bestaande bron van waarheid hiervoor, gebruikt door o.a. de
// FDR-hoofdtabel). Deze clubs horen nog steeds in de klub-kiezer hieronder (anders lijkt het alsof de
// site ze vergeten is), maar tonen een placeholder i.p.v. een opstelling: er valt nu eenmaal niets te
// voorspellen voor een wedstrijd die niet doorgaat.
const notPlayingClubCodes = TEAMS.filter(t => POSTPONED.has(`${t.code}-${PREDICTED_LINEUPS_GW}`)).map(t => t.code);

// De opstellingen zijn verouderd zodra de speeldag waarvoor ze gemaakt zijn achterloopt op de
// gameweek die nu aan de beurt is. Beide waarden komen uit constants.js (PREDICTED_LINEUPS_GW wordt
// handmatig bijgewerkt samen met de data; CURRENT_GW wordt afgeleid uit de echte deadlines), zodat
// deze check niet stilzwijgend kan verlopen zoals de vroeger hardgecodeerde tekst "GW2".
const isStale = PREDICTED_LINEUPS_GW < CURRENT_GW;

// Waarschuwingsbanner bovenaan de tab zodra de opstellingen van een vorige speeldag zijn. Bewust
// prominent en niet weg te klikken: verouderde team-info is voor een fantasymanager schadelijker dan
// géén team-info, want ze ziet er precies hetzelfde uit als actuele info.
function StaleWarning({ t }) {
  if (!isStale) return null;
  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '16px',
        background: 'rgba(232,197,71,0.12)', border: '1px solid rgba(232,197,71,0.45)',
        borderRadius: '10px', padding: '12px 14px',
      }}
    >
      <AlertTriangle size={18} color={COLORS.warning} style={{ flexShrink: 0, marginTop: '1px' }} aria-hidden="true" />
      <p style={{ margin: 0, color: COLORS.warning, fontSize: '13px', lineHeight: 1.55, fontWeight: 700 }}>
        {t('predictedLineups.staleWarning', { predictedGw: PREDICTED_LINEUPS_GW, currentGw: CURRENT_GW })}
      </p>
    </div>
  );
}

export default function PredictedLineupsTab({ t, dataUpdatedPredictedLineups }) {
  // TEAMS-volgorde (canoniek, alfabetisch op code) i.p.v. data-invoervolgorde: nu dat niet-spelende
  // clubs (zonder eigen entry in PREDICTED_LINEUPS) ertussen gemengd moeten worden, geeft dit een
  // voorspelbare, stabiele kiezer-volgorde voor alle clubs samen i.p.v. twee losse groepjes.
  const availableClubCodes = TEAMS.map(t => t.code).filter(code =>
    readyLineups.some(l => l.clubCode === code) || notPlayingClubCodes.includes(code)
  );
  const [selectedClubCode, setSelectedClubCode] = useState(availableClubCodes[0] ?? '');
  // Zolang de opstellingen verouderd zijn (isStale), blijft het veld zelf verborgen achter een
  // expliciete klik — de banner alleen missen een bezoeker gemakkelijk, en dan stelt die zijn team op
  // met data van vorige week. Bewust transiënte UI-state (geen localStorage): bij een volgend bezoek
  // moet de keuze weer bewust gemaakt worden, net als bij een niet-weg-te-klikken banner.
  const [showStaleReference, setShowStaleReference] = useState(false);

  if (availableClubCodes.length === 0) {
    return (
      <>
        <StaleWarning t={t} />
        <p style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '16px' }}>
          {t('predictedLineups.introEmpty', { gw: PREDICTED_LINEUPS_GW })}
        </p>
        {dataUpdatedPredictedLineups && (
          <p style={{ color: COLORS.textSubtle, fontSize: '11px', marginTop: '-12px', marginBottom: '16px' }}>
            {t('predictedLineups.datasetUpdatedLabel', { date: dataUpdatedPredictedLineups })}
          </p>
        )}
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '10px', padding: '16px',
        }}>
          <p style={{ color: COLORS.textBody, fontSize: '13px', margin: 0 }}>
            {t('predictedLineups.empty')}
          </p>
        </div>
      </>
    );
  }

  // isNotPlaying wint altijd van een eventuele (verouderde) lineup-entry voor diezelfde club — zie
  // notPlayingClubCodes hierboven. lineup/opponent/formationLabel hebben dan geen betekenis en worden
  // niet berekend; de placeholder-tak hieronder gebruikt enkel club/postponedMessage.
  const isNotPlaying = notPlayingClubCodes.includes(selectedClubCode);
  const club = TEAMS.find(team => team.code === selectedClubCode);
  // findLast i.p.v. find: predictedLineupsData.js wordt week na week AANGEVULD (nieuwe update voor een
  // club komt er gewoon achteraan bij, de oude entry van vorige GW blijft gewoon staan), dus zodra een
  // club twee entries heeft, is de LAATSTE altijd de meest recente. find() pakte hier voorheen
  // ongemerkt de EERSTE (oudste) entry — onschadelijk zolang de stale-gate hierboven toch alles
  // verborg, maar zou zodra PREDICTED_LINEUPS_GW wordt bijgewerkt gewoon de vorige speeldag als actueel
  // tonen voor elke club met een dubbele entry.
  const lineup = !isNotPlaying ? (readyLineups.findLast(l => l.clubCode === selectedClubCode) ?? readyLineups[0]) : null;
  const opponent = lineup?.opponentCode ? TEAMS.find(team => team.code === lineup.opponentCode) : null;
  const formationLabel = lineup
    ? (lineup.formationLabelOverride?.trim() || FORMATIONS[lineup.formationKey]?.label || lineup.formationKey)
    : null;
  // Hergebruikt buildPostponedTooltipText (constants.js) — dezelfde functie die de FDR-hoofdtabel al
  // gebruikt voor de tooltip op een uitgestelde fixture-cel, zodat de uitleg hier ("uitgesteld naar
  // X wegens Y") altijd woordelijk consistent is met wat elders op de site al over deze wedstrijd
  // staat, i.p.v. een aparte, los onderhouden placeholder-tekst.
  const postponedMessage = (() => {
    if (!isNotPlaying) return null;
    const fixtureEntry = FIXTURES[selectedClubCode]?.[PREDICTED_LINEUPS_GW - 1];
    if (typeof fixtureEntry !== 'string') return t('predictedLineups.noMatchGeneric', { club: club?.name ?? selectedClubCode, gw: PREDICTED_LINEUPS_GW });
    const [opp, venue] = fixtureEntry.split('-');
    return buildPostponedTooltipText(selectedClubCode, opp, venue);
  })();

  return (
    <>
      <StaleWarning t={t} />
      <p className="fdr-tab-intro" style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '16px' }}>
        {t('predictedLineups.intro', { gw: PREDICTED_LINEUPS_GW })}
      </p>
      {/* Datum waarop de opstellingen-dataset zelf (predictedLineupsData.js) voor het laatst
          bijgewerkt is — apart van de per-lineup lastUpdatedLabel verderop (dat is de datum van één
          specifieke club z'n opstelling; dit is de dataset als geheel, zie DATA_UPDATED_ISO in
          constants.js). */}
      {dataUpdatedPredictedLineups && (
        <p style={{ color: COLORS.textSubtle, fontSize: '11px', marginTop: '-12px', marginBottom: '16px' }}>
          {t('predictedLineups.datasetUpdatedLabel', { date: dataUpdatedPredictedLineups })}
        </p>
      )}

      {/* Responsief raster i.p.v. een flex-wrap van vaste 76px-blokken: op een telefoon leverde dat
          vijf rijen clublogo's op vóór je de opstelling zelf zag. auto-fill met een minimum van 58px
          geeft daar ~5-6 per rij, en op desktop vullen ze de breedte netjes op. */}
      <div
        role="group"
        aria-label={t('predictedLineups.pickClubAria')}
        className="fdr-club-picker"
        style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(58px, 1fr))',
          gap: '6px', marginBottom: '20px',
        }}
      >
        {availableClubCodes.map(code => {
          const clubTeam = TEAMS.find(team => team.code === code);
          const isSelected = code === selectedClubCode;
          // Gedimd (i.p.v. een apart icoontje): genoeg om in de kiezer zelf al te laten vermoeden dat
          // deze club iets anders toont, zonder de rest van het raster drukker te maken — de
          // placeholder na selectie legt de reden vervolgens expliciet uit.
          const clubIsNotPlaying = notPlayingClubCodes.includes(code);
          return (
            <button
              key={code}
              onClick={() => setSelectedClubCode(code)}
              title={clubIsNotPlaying ? t('predictedLineups.notPlayingTitle', { club: clubTeam?.name ?? code }) : (clubTeam?.name ?? code)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                background: isSelected ? 'rgba(78,205,196,0.12)' : 'rgba(255,255,255,0.04)',
                border: isSelected ? '1px solid #4ECDC4' : '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '6px 4px', width: '100%', cursor: 'pointer',
                fontFamily: 'inherit', opacity: clubIsNotPlaying && !isSelected ? 0.55 : 1,
              }}
              aria-pressed={isSelected}
            >
              <img
                src={`/club-logos/${code}.webp`}
                alt=""
                style={{ width: '24px', height: '24px', objectFit: 'contain' }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
              <span style={{
                color: isSelected ? '#4ECDC4' : COLORS.textBody, fontSize: '9px', fontWeight: 700,
                textAlign: 'center', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              }}>
                {clubTeam?.name ?? code}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        {isStale && !showStaleReference ? (
          /* Het veld zelf blijft verborgen zolang de data verouderd is (zie showStaleReference
             hierboven) — enkel de StaleWarning-banner missen is voor een fantasymanager schadelijker
             dan geen team-info krijgen, want een verouderd veld ziet er identiek uit aan een actueel
             veld. De clubkiezer blijft wél gewoon werken, zodat een bezoeker al kan kiezen welke club
             hij straks (na de klik) wil zien. */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '40px 24px', width: '100%', maxWidth: '420px', textAlign: 'center',
          }}>
            <CalendarOff size={22} color={COLORS.textSubtle} aria-hidden="true" />
            <p style={{ color: COLORS.textBody, fontSize: '14px', fontWeight: 700, margin: 0 }}>
              {t('predictedLineups.staleGateText', { gw: CURRENT_GW })}
            </p>
            <button
              onClick={() => setShowStaleReference(true)}
              className="fdr-touch-target"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                background: 'transparent', color: '#4ECDC4', border: '1px solid #4ECDC4',
                borderRadius: '8px', padding: '8px 16px', marginTop: '4px',
                fontWeight: 700, fontSize: '12px', fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {t('predictedLineups.staleGateButton', { gw: PREDICTED_LINEUPS_GW })}
            </button>
          </div>
        ) : isNotPlaying ? (
          /* Placeholder i.p.v. PitchField: er is voor deze club simpelweg geen wedstrijd (dus geen
             opstelling) deze speeldag — zie notPlayingClubCodes/postponedMessage hierboven. Zelfde
             kaart-look als de "nog geen lineups"-lege-staat verderop in dit bestand, maar dan
             per-club en met de specifieke uitstel-reden. */
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px',
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '10px', padding: '40px 24px', width: '100%', maxWidth: '420px', textAlign: 'center',
          }}>
            {club && (
              <img
                src={`/club-logos/${club.code}.webp`}
                alt=""
                style={{ width: '48px', height: '48px', objectFit: 'contain', opacity: 0.6 }}
                onError={(e) => { e.target.style.display = 'none'; }}
              />
            )}
            <CalendarOff size={22} color={COLORS.textSubtle} aria-hidden="true" />
            <p style={{ color: COLORS.textBody, fontSize: '14px', fontWeight: 700, margin: 0 }}>
              {t('predictedLineups.notPlaying')}
            </p>
            <p style={{ color: COLORS.textMuted, fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
              {postponedMessage}
            </p>
          </div>
        ) : (
          <>
            {/* Kleurenlegende voor de kaartranden — zonder dit weten publieke bezoekers niet wat een
                rode of oranje rand betekent (enkel de privé-tool toont de betekenis via een
                hover-tooltip op de safety-badge, die hier bewust niet gerenderd wordt — zie
                PitchSlot.jsx's readOnly-prop). */}
            <div style={{
              display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center',
              fontSize: '11px', fontWeight: 700, color: COLORS.textBody,
            }}>
              {SAFETY_LEGEND.map(({ level, labelKey }) => (
                <div key={level} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: SAFETY_STYLE[level].border, flexShrink: 0,
                  }} />
                  {t(labelKey)}
                </div>
              ))}
            </div>
            <PitchField
              readOnly
              club={club}
              opponent={opponent}
              formationLabel={formationLabel}
              gwLabel={t('predictedLineups.pitchGwLabel', { gw: PREDICTED_LINEUPS_GW })}
              slots={lineup.slots}
              activeSlotIndex={null}
              onSlotClick={noop}
              onRemove={noop}
              onCycleSafety={noop}
              onDragStart={noop}
              onSlotDrop={noop}
            />
            {/* Per-lineup "laatst geüpdatet" — een handmatig ingevuld tekstveld in
                predictedLineupsData.js (lastUpdatedLabel), bewust géén afgeleide/berekende datum: elke
                lineup wordt onregelmatig en los van elkaar bijgewerkt, dus enkel de samensteller weet
                wanneer een specifieke opstelling voor het laatst nagekeken is. */}
            {lineup.lastUpdatedLabel && (
              <p style={{ color: COLORS.textMuted, fontSize: '10px', margin: 0 }}>
                {t('predictedLineups.lastUpdated', { date: lineup.lastUpdatedLabel })}
              </p>
            )}
          </>
        )}
        {/* Publiek watermerk, specifiek voor deze read-only weergave — geen downloadknop (bewuste
            keuze, enkel bekijken). Zit bewust hier en niet in PitchField.jsx zelf: dat blijft ook door
            de privé-tool gebruikt, waar dit watermerk niet hoort. */}
        <div style={{ display: 'flex', gap: '16px', fontSize: '11px', fontWeight: 700 }}>
          <a
            href="https://discord.gg/6dqWVDkvf"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ECDC4', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            @5YSiebee
          </a>
          <a
            href="https://x.com/fpl_proleague"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#4ECDC4', textDecoration: 'underline', textUnderlineOffset: '2px' }}
          >
            @fpl_proleague
          </a>
        </div>
      </div>
    </>
  );
}
