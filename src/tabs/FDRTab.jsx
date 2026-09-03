// Inhoud van de FDR-tab: team-sterkte sliders, de hoofdtabel (Fixture Difficulty Rating) met
// GW-horizon-selector en sorteerknop, "Beste fixture runs", en "Vergelijk teams".
// Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen lokale useState hier) — de
// tab-content wordt conditioneel gemount/unmount bij het wisselen van tab, dus lokale state zou
// resetten (open secties, sortering, gekozen GW-ranges, ...) telkens de gebruiker weg- en
// terugnavigeert.

import { memo } from 'react';
import { RotateCcw, TrendingUp, Info, Link2, Download, Check, ArrowUpDown, Settings2, Grid2x2, Scale } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, FIXTURES, RATING_STYLE, TEAM_FORM, GW_INDEXES, getFixtureInfo } from '../constants';
import { COLORS, selectStyle, secondaryButtonStyle, primaryButtonStyle, iconButtonStyle } from '../theme';
import { SectionHeader } from '../components/SectionHeader';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { PostponedIndicator, TooltipTrigger } from '../components/Tooltip';

// Gedeelde knop-/veldstijlen komen uit ../theme (zie daar waarom). Vroeger stonden selectStyle en
// secondaryToolbarBtnStyle hier lokaal, met net iets andere waarden dan de equivalenten in de andere
// tabs.
const secondaryToolbarBtnStyle = secondaryButtonStyle;

// Gedempte variant voor de destructieve "Reset FDR"-knop (zie de toelichting bij de knop zelf) — geen
// border/achtergrond, gedempte tekstkleur, zodat hij duidelijk minder gewicht draagt dan de veilige
// acties (Kopieer link/Download) ernaast zonder als een rode waarschuwing op te vallen.
const mutedToolbarBtnStyle = {
  ...secondaryButtonStyle,
  background: 'transparent', border: '1px solid transparent', color: COLORS.textSubtle,
};

// Sticky eerste kolom voor brede, horizontaal scrollbare tabellen. De hoofdtabel gebruikte dit al;
// nu ook de vergelijk-tabel, die anders bij het naar rechts scrollen geen enkel houvast bood over
// welke rij bij welk team hoort. De dubbele box-shadow maskeert de border-spacing-opening links en
// rechts van de cel, zodat er niets onder de sticky kolom doorschijnt.
const stickyTeamCellStyle = {
  position: 'sticky', left: 0, background: '#2A1440', zIndex: 3,
  boxShadow: '-4px 0 0 0 #2A1440, 4px 0 0 0 #2A1440',
};

// FDR-tab-only: gebruikt voor de GW-horizon-selector, de "Beste fixture runs"-range-selectors en als
// bron voor compareGwHeaderCells (zie FDRTool.jsx) — laatstgenoemde slicet dit vanaf CURRENT_GW, want
// "Vergelijk teams" toont geen afgelopen GW's meer.
const gwOptionElements = GW_INDEXES.map(i => (
  <option key={i} value={i + 1}>{i + 1}</option>
));

const FixtureCell = memo(function FixtureCell({
  opp, venue, isPostponed, isPossiblyPostponed, bg, textColor, stacked, postponedText, possiblyPostponedText,
  isDoubleGameweek, legs
}) {
  const stackingStyle = stacked ? { position: 'relative', zIndex: 1 } : null;

  if (isPostponed) {
    return (
      <PostponedIndicator
        as="td"
        className="fdr-cell"
        text={postponedText}
        style={{
          // #C2BBD1 i.p.v. het vroegere #9B93AD: dat haalde maar 3.10:1 op deze grijze achtergrond,
          // nu 4.90:1 (WCAG AA).
          background: '#4A4560', color: '#C2BBD1', textAlign: 'center',
          fontSize: '14px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
          cursor: 'pointer',
          ...stackingStyle
        }}
      />
    );
  }

  // DGW: cel gesplitst in 2 gestapelde helften (elk hun eigen achtergrondkleur o.b.v. de rating van die
  // tegenstander), in een kleiner lettertype dan de normale enkele cel zodat beide passen. Een <td> is
  // van zichzelf al block-level voor z'n kinderen, dus de twee <div>'s stapelen vanzelf boven/onder.
  // padding/fontSize zijn bewust krap: de 2 helften + border-bottom moeten samen binnen de hoogte van
  // een normale enkele cel (~32px) blijven, anders wordt de hele rij (alle 8 kolommen) hoger dan de rest.
  if (isDoubleGameweek) {
    return (
      <td className="fdr-cell" style={{ padding: 0, borderRadius: '6px', overflow: 'hidden', ...stackingStyle }}>
        {legs.map((leg, i) => (
          <div key={i} style={{
            background: leg.style.bg, color: leg.style.text, textAlign: 'center',
            fontSize: '9px', fontWeight: 700, padding: '2px 2px', lineHeight: 1.2,
            // Duidelijke scheiding tussen de 2 helften: border-bottom op de bovenste (i===0), niet
            // border-top op de onderste, zodat de lijn zichtbaar bij de bovenste fixture "hoort".
            // Zelfde paarse kleur als de achtergrond/gutter tussen de tabelcellen, zodat de lijn oogt
            // als een echte scheiding tussen 2 cellen i.p.v. een schaduwrand.
            borderBottom: i === 0 ? '2px solid #2A1440' : undefined
          }}>
            {leg.opp} <span style={{ opacity: 0.75, fontWeight: 500 }}>({leg.venue})</span>
          </div>
        ))}
      </td>
    );
  }

  const content = (
    <>
      {opp}{' '}
      <span style={{ position: isPossiblyPostponed ? 'relative' : undefined }}>
        <span style={{ opacity: 0.75, fontWeight: 500 }}>({venue})</span>
        {isPossiblyPostponed && <span className="fdr-maybe-postponed-marker" aria-hidden="true">*</span>}
      </span>
    </>
  );

  if (isPossiblyPostponed) {
    return (
      <TooltipTrigger
        as="td"
        className="fdr-cell"
        text={possiblyPostponedText}
        style={{
          background: bg, color: textColor, textAlign: 'center',
          fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
          cursor: 'pointer',
          ...stackingStyle
        }}
      >
        {content}
      </TooltipTrigger>
    );
  }

  return (
    <td className="fdr-cell" style={{
      background: bg, color: textColor, textAlign: 'center',
      fontSize: '12px', fontWeight: 700, borderRadius: '6px', padding: '8px 2px',
      ...stackingStyle
    }}>
      {content}
    </td>
  );
});

// Eigen, bewust subtielere kleurtaal dan RATING_STYLE hierboven: die kleuren betekenen in de tabel iets
// heel anders (ingeschatte fixture-moeilijkheid, geen echte uitslag), dus een vormbalk in exact dezelfde
// groen/geel/rood-schaal zou de twee te makkelijk laten verwarren.
const FORM_RESULT_STYLE = {
  W: { bg: 'rgba(78,205,196,0.9)', text: '#0B2E1B' },
  G: { bg: 'rgba(255,255,255,0.18)', text: '#C9B8E0' },
  V: { bg: 'rgba(194,64,44,0.65)', text: '#FFFFFF' },
};

// Kleine vormindicator onder de clubcode in de hoofdtabel: max. 5 laatste uitslagen (oudste eerst), zie
// TEAM_FORM in constants.js. De team-cel se rijhoogte wordt gedreven door het 20px-hoge clublogo (padding
// 6px boven/onder erbij = 32px, exact gelijk aan de fixture-cellen ernaast) — dus de code-regel + stippenrij
// samen moeten binnen diezelfde 20px content-hoogte blijven, anders groeit de hele rij mee (en krijgen
// vooral de strak-passende DGW-cellen, 2 gestapelde helften, opeens lucht). Vandaar de expliciete, krappe
// lineHeight op de coderegel (13px, geen browser-standaard leading) en de kleine stip (6px): 13 + 1 (gap)
// + 6 = 20px, exact gelijk aan het logo. Rendert bewust niets zolang er geen uitslagen zijn (leeg
// seizoenbegin) — geen lege/grijze placeholder-stippen die een uitslag lijken te suggereren die er niet is.
function TeamFormBar({ results }) {
  if (!results || results.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }} aria-label={`Recente vorm: ${results.join(', ')}`}>
      {results.map((r, i) => {
        const style = FORM_RESULT_STYLE[r];
        return (
          <span key={i} aria-hidden="true" title={r} style={{
            display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
            background: style?.bg ?? 'rgba(255,255,255,0.25)',
          }} />
        );
      })}
    </span>
  );
}

export default function FDRTab({
  t,
  dataUpdatedFdrRatings,
  ratings, homeAdvantage, updateRating, toggleHomeAdvantage,
  isCustom, saved, linkCopied, downloading,
  handleCopyLink, handleDownloadImage, handleReset, handleSave, setShowInfo,
  openSections, toggleSection,
  sortByDifficulty, setSortByDifficulty,
  gwHorizonStart, setGwHorizonStart, gwHorizonEnd, setGwHorizonEnd, gwHorizonRange,
  visibleGwHeaderCells, compareGwHeaderCells, compareGwStart, mainTableMinWidth,
  displayedTeams, tableRef,
  rangeStart, setRangeStart, rangeEnd, setRangeEnd, bestRuns,
  runsRef, downloadingRuns, handleDownloadRunsImage,
  compareTeams, toggleCompareTeam,
}) {
  return (
    <>
    <p className="fdr-tab-intro" style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '18px' }}>
      {t('fdr.intro')}
    </p>
    {/* Kleine, gedempte datum-notitie — apart van de fpl-toolbar hieronder i.p.v. erin, want die
        toolbar-breedte is al fijn afgesteld zodat NL en FR er allebei op 1 regel in passen (zie de
        commit-geschiedenis daarover); hier tussenvoegen zou dat weer breken. */}
    {dataUpdatedFdrRatings && (
      <p style={{ color: COLORS.textSubtle, fontSize: '11px', marginTop: '-10px', marginBottom: '18px' }}>
        {t('fdr.ratingsUpdatedLabel', { date: dataUpdatedFdrRatings })}
      </p>
    )}
    <div className="fpl-toolbar" style={{
      display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center',
      marginBottom: '24px', padding: '14px 16px', background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px'
    }}>
      <span className="fdr-status-badge" style={{
        fontSize: '12px', fontWeight: 700, padding: '4px 10px', borderRadius: '999px',
        background: isCustom ? '#4ECDC4' : 'rgba(255,255,255,0.1)',
        color: isCustom ? '#0B2E1B' : '#C9B8E0'
      }}>
        {isCustom ? t('fdr.badge.custom') : t('fdr.badge.default')}
      </span>
      <div className="fpl-toolbar-actions">
      <span className="fpl-toolbar-secondary">
      <button onClick={handleCopyLink} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
        {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
        <span className="fdr-btn-label-full">{linkCopied ? t('fdr.linkCopied') : t('fdr.copyLink')}</span>
        <span className="fdr-btn-label-short">{linkCopied ? t('fdr.linkCopiedShort') : t('fdr.copyLinkShort')}</span>
      </button>
      <button onClick={handleDownloadImage} disabled={downloading} className="fdr-toolbar-btn" style={{
        ...secondaryToolbarBtnStyle,
        cursor: downloading ? 'default' : 'pointer',
        opacity: downloading ? 0.6 : 1
      }}>
        <Download size={14} />
        <span className="fdr-btn-label-full">{downloading ? t('fdr.downloading') : t('fdr.downloadImage')}</span>
        <span className="fdr-btn-label-short">{downloading ? t('fdr.downloading') : t('fdr.downloadImageShort')}</span>
      </button>
      {/* Bewust GEEN secondaryToolbarBtnStyle (zoals "Kopieer link"/"Download" hierboven): Reset is de
          enige destructieve actie in deze rij (verwijdert de eigen ratings) en verdiende niet hetzelfde
          visuele gewicht als de veilige acties ernaast. Geen border/achtergrond en gedempte tekstkleur
          i.p.v. rood/danger — dat zou juist méér aandacht trekken, terwijl het doel hier is: minder. */}
      <button onClick={handleReset} className="fdr-toolbar-btn" style={mutedToolbarBtnStyle}>
        <RotateCcw size={14} />
        <span className="fdr-btn-label-full">{t('fdr.reset')}</span>
        <span className="fdr-btn-label-short">{t('fdr.resetShort')}</span>
      </button>
      <button onClick={handleSave} className="fdr-toolbar-btn" style={primaryButtonStyle}>
        <Check size={14} />
        <span className="fdr-btn-label-full">{saved ? t('fdr.saved') : t('fdr.save')}</span>
        <span className="fdr-btn-label-short">{saved ? t('fdr.savedShort') : t('fdr.saveShort')}</span>
      </button>
      </span>
      <button onClick={() => setShowInfo(true)} aria-label={t('fdr.infoAria')} className="fdr-icon-btn" style={iconButtonStyle}>
        <Info size={16} />
      </button>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>


      <section>
        <SectionHeader icon={Grid2x2} title={t('fdr.section.table')} sectionKey="table" isOpen={openSections.table} onToggle={toggleSection} />
        {openSections.table && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px', marginBottom: '10px'
        }}>
          <button onClick={(e) => { e.stopPropagation(); setSortByDifficulty(s => !s); }} className="fdr-touch-target" style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent',
            color: COLORS.textBody, border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
          }}>
            <ArrowUpDown size={14} />
            {sortByDifficulty ? t('fdr.sortByDifficultySorted') : t('fdr.sortByDifficulty')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            {/* Expliciet "Bereik VAN DEZE TABEL" i.p.v. het generieke "GW" — er staat verderop nog een
                tweede, onafhankelijke GW-kiezer bij Beste fixture runs (zie fdr.gwRangeRunsLabel), en
                zonder dit label leken het twee keer dezelfde instelling. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwRangeTableLabel')}</label>
              <select value={gwHorizonStart} onChange={e => setGwHorizonStart(Number(e.target.value))} style={selectStyle}>
                {gwOptionElements}
              </select>
              <span style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwTo')}</span>
              <select value={gwHorizonEnd} onChange={e => setGwHorizonEnd(Number(e.target.value))} style={selectStyle}>
                {gwOptionElements}
              </select>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: COLORS.textSubtle, fontSize: '11px' }}>
              <Info size={12} />
              {t('fdr.tapHint')}
            </span>
          </div>
        </div>
        )}
        <div ref={tableRef} id="fdr-capture-wrapper">
        <div id="fdr-section-table" className="fdr-table-scroll" style={{
          overflowX: 'auto', background: '#2A1440', padding: '4px',
          display: openSections.table ? 'block' : 'none'
        }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: `${mainTableMinWidth}px` }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', color: COLORS.textBody, fontSize: '11px', textTransform: 'uppercase',
                letterSpacing: '0.05em', padding: '6px 8px', position: 'sticky', left: 0,
                background: '#2A1440', zIndex: 3, boxShadow: '-4px 0 0 0 #2A1440, 4px 0 0 0 #2A1440'
              }}>{t('fdr.teamColumn')}</th>
              {visibleGwHeaderCells}
            </tr>
          </thead>
          <tbody>
            {displayedTeams.map(team => (
              <tr key={team.code}>
                <td style={{
                  color: '#FFF', fontWeight: 700, fontSize: '13px', padding: '6px 8px',
                  position: 'sticky', left: 0, background: '#2A1440', whiteSpace: 'nowrap',
                  zIndex: 3, boxShadow: '-4px 0 0 0 #2A1440, 4px 0 0 0 #2A1440'
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <img
                      src={`/club-logos/${team.code}.webp`}
                      alt=""
                      className="club-logo"
                      style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ lineHeight: '13px' }}>{team.code}</span>
                      <TeamFormBar results={TEAM_FORM[team.code]} />
                    </span>
                  </span>
                </td>

                {FIXTURES[team.code].slice(gwHorizonRange.start - 1, gwHorizonRange.end).map((f, i) => {
                  const gwNumber = gwHorizonRange.start + i;
                  const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
                    getFixtureInfo(team.code, f, gwNumber, ratings, homeAdvantage);
                  return (
                    <FixtureCell
                      key={gwNumber}
                      opp={opp}
                      venue={venue}
                      isPostponed={isPostponed}
                      isPossiblyPostponed={isPossiblyPostponed}
                      bg={style?.bg}
                      textColor={style?.text}
                      postponedText={postponedText}
                      possiblyPostponedText={possiblyPostponedText}
                      isDoubleGameweek={isDoubleGameweek}
                      legs={legs}
                      stacked
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {openSections.table && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
          {[1,2,3,4,5].map(r => (
            <div key={r} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '3px', background: RATING_STYLE[r].bg, display: 'inline-block' }} />
              <span style={{ color: COLORS.textBody, fontSize: '11px' }}>{t(`fdr.rating.${r}`)}</span>
            </div>
          ))}
          {/* Legt uit wat de stippenrij onder elke teamcode betekent (zie TeamFormBar hierboven) —
              voorheen stond dat nergens, dus oogden ze als willekeurige versiering. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ display: 'inline-flex', gap: '2px' }}>
              {['W', 'G', 'V'].map(r => (
                <span key={r} aria-hidden="true" style={{
                  width: '6px', height: '6px', borderRadius: '50%', display: 'inline-block',
                  background: FORM_RESULT_STYLE[r].bg,
                }} />
              ))}
            </span>
            <span style={{ color: COLORS.textBody, fontSize: '11px' }}>{t('fdr.formLegend')}</span>
          </div>
        </div>
        )}
        </div>
      </section>

      <section>
        <SectionHeader icon={TrendingUp} title={t('fdr.section.runs')} sectionKey="runs" isOpen={openSections.runs} onToggle={toggleSection} />
        {openSections.runs && (
        <div id="fdr-section-runs">
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px', marginBottom: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {/* "Bereik VAN BESTE FIXTURE RUNS" — zie de toelichting bij fdr.gwRangeTableLabel
                hierboven: dit is een losstaande GW-keuze van die van de tabel, met opzet (Beste fixture
                runs kijkt standaard nooit voorbij GW7, de tabel mag wel het hele seizoen tonen). */}
            <label style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwRangeRunsLabel')}</label>
            <select value={rangeStart} onChange={e => setRangeStart(Number(e.target.value))} style={selectStyle}>
              {gwOptionElements}
            </select>
            <span style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwTo')}</span>
            <select value={rangeEnd} onChange={e => setRangeEnd(Number(e.target.value))} style={selectStyle}>
              {gwOptionElements}
            </select>
          </div>
          {/* Eigen exportknop, zelfde watermerk-logica als de hoofdtabel hierboven (zie
              captureSectionAsImage in FDRTool.jsx) — Beste fixture runs is de sectie die een bezoeker
              het vaakst effectief wil delen ("welk team plan ik?"), en had voorheen geen eigen
              downloadknop. */}
          <button onClick={handleDownloadRunsImage} disabled={downloadingRuns} className="fdr-toolbar-btn" style={{
            ...secondaryToolbarBtnStyle,
            cursor: downloadingRuns ? 'default' : 'pointer',
            opacity: downloadingRuns ? 0.6 : 1
          }}>
            <Download size={14} />
            {downloadingRuns ? t('fdr.downloading') : t('fdr.downloadRunsImage')}
          </button>
        </div>
        <div ref={runsRef} id="fdr-runs-capture-wrapper">
        <div style={{ display: 'grid', gap: '8px' }}>
          {bestRuns.map((team, idx) => (
            <div key={team.code} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '10px 14px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="fdr-title" style={{
                  color: idx === 0 ? '#4ECDC4' : '#C9B8E0', fontWeight: 900, fontSize: '18px', width: '24px', flexShrink: 0
                }}>{idx + 1}</span>
                <img
                  src={`/club-logos/${team.code}.webp`}
                  alt=""
                  className="club-logo"
                  style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ minWidth: '130px' }}>
                  <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px' }}>{team.name}</div>
                  <div style={{ color: COLORS.textMuted, fontSize: '11px' }}>{t('fdr.avgDifficulty', { value: team.avg.toFixed(1) })}</div>
                </div>
              </div>
              <div
                className={`fdr-mini-fixture-row${team.fixtures.length > 6 ? ' fdr-mini-fixture-row--compact' : ''}`}
                style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'flex-start', marginTop: '12px' }}
              >
                {team.fixtures.map((f, i) => (
                  <MiniFixtureBadge
                    key={i}
                    teamCode={team.code}
                    fixture={f}
                    gwNumber={team.startGW + i}
                    ratings={ratings}
                    homeAdvantage={homeAdvantage}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        </div>
        </div>
        )}
      </section>

      {/* COMPARE TEAMS */}
      <section>
        <SectionHeader icon={Scale} title={t('fdr.section.compare')} sectionKey="compare" isOpen={openSections.compare} onToggle={toggleSection} />
        {openSections.compare && (
        <div id="fdr-section-compare">
        <p style={{ color: COLORS.textMuted, fontSize: '12px', marginBottom: '10px' }}>
          {t('fdr.compareIntro', { gw: compareGwStart })}
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: '6px', marginBottom: '16px'
        }}>
          {TEAMS_ALPHA.map(team => {
            const selected = compareTeams.includes(team.code);
            const disabled = !selected && compareTeams.length >= 5;
            return (
              <button key={team.code} onClick={() => toggleCompareTeam(team.code)} disabled={disabled} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                background: selected ? '#4ECDC4' : 'rgba(255,255,255,0.04)',
                color: selected ? '#0B2E1B' : disabled ? COLORS.textDisabled : '#FFF',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                padding: '6px 4px', fontSize: '12px', fontWeight: 700,
                cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
              }}>
                <img
                  src={`/club-logos/${team.code}.webp`}
                  alt=""
                  className="club-logo"
                  style={{ width: '14px', height: '14px', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                {team.code}
              </button>
            );
          })}
        </div>
        {compareTeams.length === 0 && (
          <p style={{ color: COLORS.textSubtle, fontSize: '13px' }}>{t('fdr.compareNoTeams')}</p>
        )}
        {compareTeams.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: '600px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: COLORS.textBody, fontSize: '11px', textTransform: 'uppercase', padding: '6px 8px', ...stickyTeamCellStyle }}>Team</th>
                  {compareGwHeaderCells}
                </tr>
              </thead>
              <tbody>
                {compareTeams.map(code => {
                  const team = TEAMS.find(team => team.code === code);
                  return (
                    <tr key={code}>
                      <td style={{ color: '#FFF', fontWeight: 700, fontSize: '13px', padding: '6px 8px', whiteSpace: 'nowrap', ...stickyTeamCellStyle }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <img
                            src={`/club-logos/${team.code}.webp`}
                            alt=""
                            className="club-logo"
                            style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          {team.code}
                        </span>
                      </td>
                      {FIXTURES[code].slice(compareGwStart - 1).map((f, i) => {
                        const gwNumber = compareGwStart + i;
                        const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
                          getFixtureInfo(code, f, gwNumber, ratings, homeAdvantage);
                        return (
                          <FixtureCell
                            key={i}
                            opp={opp}
                            venue={venue}
                            isPostponed={isPostponed}
                            isPossiblyPostponed={isPossiblyPostponed}
                            bg={style?.bg}
                            textColor={style?.text}
                            postponedText={postponedText}
                            possiblyPostponedText={possiblyPostponedText}
                            isDoubleGameweek={isDoubleGameweek}
                            legs={legs}
                          />
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
        )}
      </section>

      {/* Team-sterkte instellen: bewust helemaal ONDERAAN en standaard dicht (zie openSections
          hierboven). Dit zijn 18 sliders die de tabel/Beste fixture runs/Vergelijk teams hierboven
          allemaal voeden, maar een instellingenpaneel hoort na het product te komen, niet ervoor —
          voorheen stond deze sectie als allereerste, dus begon de pagina met configuratie in plaats
          van met iets dat meteen een antwoord geeft. */}
      <section>
        <SectionHeader icon={Settings2} title={t('fdr.section.sliders')} sectionKey="sliders" isOpen={openSections.sliders} onToggle={toggleSection} />
        {openSections.sliders && (
        <div id="fdr-section-sliders" className="fdr-sliders-grid" style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '8px'
        }}>
          {TEAMS_ALPHA.map(team => {
            const r = ratings[team.code];
            const style = RATING_STYLE[r];
            const homeAdvantageOn = !!homeAdvantage[team.code];
            return (
              <div key={team.code} style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '10px', padding: '8px 10px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <img
                      src={`/club-logos/${team.code}.webp`}
                      alt=""
                      className="club-logo"
                      style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 600 }}>{team.code}</span>
                  </span>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '999px',
                    background: style.bg, color: style.text
                  }}>{r}</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1} value={r}
                  onChange={e => updateRating(team.code, Number(e.target.value))}
                  style={{ width: '100%' }}
                  aria-label={t('fdr.strengthAria', { team: team.name })}
                />
                {/* Thuisvoordeel: losstaand van de sterkte-slider hierboven, zie getEffectiveRating.
                    De VOLLEDIGE rij (label + schakelaar) is nu de knop, niet enkel het schakelaartje
                    van 30x16px. Dat was met afstand het kleinste aanraakdoel op de site, en er staan
                    er achttien van op één scherm — twee kolommen naast elkaar op een telefoon. De
                    .fdr-touch-target-klasse tilt de rij op aanraakapparaten naar 44px hoogte. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={homeAdvantageOn}
                  aria-label={t('fdr.homeAdvantageAria', { team: team.name })}
                  onClick={() => toggleHomeAdvantage(team.code)}
                  className="fdr-touch-target"
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                    width: '100%', marginTop: '6px', padding: '4px 0',
                    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ color: COLORS.textBody, fontSize: '10px' }}>{t('fdr.homeAdvantage')}</span>
                  {/* De knop verschoof voorheen via justifyContent (flex-start/flex-end) — dat is geen
                      animeerbare CSS-property, dus de knop "sprong" abrupt naar de overkant terwijl
                      enkel de achtergrondkleur vloeiend overging, wat als een flits oogde. Nu blijft
                      justifyContent weg en schuift de knop zelf via een getransitionde transform. */}
                  <span
                    aria-hidden="true"
                    style={{
                      position: 'relative', display: 'inline-flex', alignItems: 'center',
                      width: '34px', height: '18px', borderRadius: '999px', flexShrink: 0,
                      background: homeAdvantageOn ? '#4ECDC4' : 'rgba(255,255,255,0.15)',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <span style={{
                      position: 'absolute', top: '2px', left: '2px',
                      width: '14px', height: '14px', borderRadius: '50%', background: '#FFFFFF', display: 'block',
                      transform: homeAdvantageOn ? 'translateX(16px)' : 'translateX(0)',
                      transition: 'transform 0.15s ease',
                    }} />
                  </span>
                </button>
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
