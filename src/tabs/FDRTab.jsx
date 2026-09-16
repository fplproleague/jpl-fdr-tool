// Inhoud van de FDR-tab: team-sterkte sliders, de hoofdtabel (Fixture Difficulty Rating) met
// GW-horizon-selector en sorteerknop, "Beste fixture runs", en "Vergelijk teams".
// Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen lokale useState hier) — de
// tab-content wordt conditioneel gemount/unmount bij het wisselen van tab, dus lokale state zou
// resetten (open secties, sortering, gekozen GW-ranges, ...) telkens de gebruiker weg- en
// terugnavigeert.

import React, { memo } from 'react';
import { RotateCcw, TrendingUp, Info, Link2, Download, Check, ArrowUpDown, Settings2, Grid2x2, Scale } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, FIXTURES, RATING_STYLE, TEAM_FORM, GW_INDEXES, getFixtureInfo } from '../constants';
import { COLORS, selectStyle, secondaryButtonStyle, primaryButtonStyle, iconButtonStyle } from '../theme';
import { SectionHeader } from '../components/SectionHeader';
import { FixtureStrip } from '../components/FixtureStrip';
import { PostponedIndicator, TooltipTrigger } from '../components/Tooltip';

// Gedeelde knop-/veldstijlen komen uit ../theme (zie daar waarom). Vroeger stonden selectStyle en
// secondaryToolbarBtnStyle hier lokaal, met net iets andere waarden dan de equivalenten in de andere
// tabs.
const secondaryToolbarBtnStyle = secondaryButtonStyle;

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

// Zichtbaar moeilijkheidscijfer (1-5) in de rechterbovenhoek van een fixture-cel. Tot nu toe zat de
// moeilijkheid uitsluitend in de achtergrondkleur; dat maakt de tabel onleesbaar voor wie rood en
// groen niet uit elkaar houdt, en onbestaand voor een screenreader. Het cijfer is bewust klein en
// halftransparant zodat de kleur het hoofdsignaal blijft (en de gedownloade afbeelding er niet
// drukker uit gaat zien), maar het staat er wél. currentColor i.p.v. een vaste kleur: elke
// RATING_STYLE-combinatie heeft z'n eigen tekstkleur die al op contrast gecontroleerd is.
function CellRating({ rating }) {
  if (!rating) return null;
  return <span className="fdr-cell-rating" aria-hidden="true">{rating}</span>;
}

// Bouwt de toegankelijke naam van een fixture-cel. Zit hier (en niet inline in de JSX) omdat alle vier
// de cel-varianten — normaal, mogelijk uitgesteld, uitgesteld en DGW — hem nodig hebben.
function buildFixtureCellAriaLabel(t, info) {
  const venueLabel = (venue) => t(venue === 'H' ? 'fdr.venue.home' : 'fdr.venue.away');
  if (info.isPostponed) return t('fdr.cellPostponedAria');
  if (info.isDoubleGameweek) {
    const legs = info.legs
      .map(leg => t('fdr.cellAria', { opp: leg.opp, venue: venueLabel(leg.venue), rating: leg.rating }))
      .join('; ');
    return t('fdr.cellDgwAria', { legs });
  }
  const base = t('fdr.cellAria', { opp: info.opp, venue: venueLabel(info.venue), rating: info.rating });
  // Bij een mogelijk uitgestelde wedstrijd blijft de uitleg over dat uitstel onderdeel van de naam —
  // anders verdwijnt de betekenis van het "*" volledig voor wie de tabel niet ziet.
  return info.isPossiblyPostponed && info.possiblyPostponedText
    ? `${base}. ${info.possiblyPostponedText}`
    : base;
}

// Hoort deze cel bij de aangevinkte moeilijkheidsgraden? Leeg filter = alles hoort erbij. Een DGW telt
// mee zodra één van de twee wedstrijden past. Een uitgestelde cel valt altijd buiten een actief filter:
// die is grijs en draagt dus geen van de vijf kleuren waarop gefilterd wordt.
function matchesRatingFilter(info, highlighted) {
  if (!highlighted || highlighted.length === 0) return true;
  if (info.isPostponed) return false;
  if (info.isDoubleGameweek) return info.legs.some(leg => highlighted.includes(leg.rating));
  return highlighted.includes(info.rating);
}

const FixtureCell = memo(function FixtureCell({
  opp, venue, rating, isPostponed, isPossiblyPostponed, bg, textColor, stacked, postponedText, possiblyPostponedText,
  isDoubleGameweek, legs, ariaLabel, dimmed
}) {
  // Dimmen i.p.v. verbergen (zie de filterknoppen onder de tabel): de rij blijft leesbaar als rij.
  const stackingStyle = { ...(stacked ? { position: 'relative', zIndex: 1 } : null), ...(dimmed ? { opacity: 0.2 } : null) };

  if (isPostponed) {
    return (
      <PostponedIndicator
        as="td"
        className="fdr-cell"
        text={postponedText}
        ariaLabel={ariaLabel}
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
      <td className="fdr-cell" aria-label={ariaLabel} style={{ padding: 0, borderRadius: '6px', overflow: 'hidden', ...stackingStyle }}>
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
      <CellRating rating={rating} />
    </>
  );

  if (isPossiblyPostponed) {
    return (
      <TooltipTrigger
        as="td"
        className="fdr-cell"
        text={possiblyPostponedText}
        ariaLabel={ariaLabel}
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
    <td className="fdr-cell" aria-label={ariaLabel} style={{
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
  ratings, homeAdvantage, updateRating, toggleHomeAdvantage,
  isCustom, linkCopied, downloading,
  handleCopyLink, handleDownloadImage, handleReset, setShowInfo,
  openSections, toggleSection,
  sortBy, toggleSortByAverage,
  highlightedRatings, toggleRatingFilter, clearRatingFilter,
  gwHorizonStart, setGwHorizonStart, gwHorizonEnd, setGwHorizonEnd, gwHorizonRange,
  visibleGwHeaderCells, compareGwHeaderCells, compareGwStart, mainTableMinWidth, compareTableMinWidth,
  displayedTeams, tableRef,
  rangeStart, setRangeStart, rangeEnd, setRangeEnd, bestRuns,
  compareTeams, toggleCompareTeam,
  onOpenClub,
}) {
  return (
    <>
    <p className="fdr-tab-intro" style={{ color: COLORS.textMuted, fontSize: '13px', marginBottom: '18px' }}>
      {t('fdr.intro')}
    </p>
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
      <button onClick={handleReset} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
        <RotateCcw size={14} />
        <span className="fdr-btn-label-full">{t('fdr.reset')}</span>
        <span className="fdr-btn-label-short">{t('fdr.resetShort')}</span>
      </button>
      </span>
      <button onClick={() => setShowInfo(true)} aria-label={t('fdr.infoAria')} className="fdr-icon-btn" style={iconButtonStyle}>
        <Info size={16} />
      </button>
      </div>
      {/* Geen "Bewaar in browser"-knop meer: de ratings slaan zichzelf op (zie het effect in
          FDRTool.jsx). Wat rest is de bevestiging dát het gebeurd is — een knop die altijd hetzelfde
          doet als niets doen, is een knop te veel. Enkel zichtbaar zodra er iets afwijkt van de
          standaard; bij de standaardratings valt er niets te bewaren. */}
      {isCustom && (
        <span
          role="status"
          className="fdr-autosave-badge"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px', flexShrink: 0,
            color: '#4ECDC4', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap',
          }}
        >
          <Check size={13} aria-hidden="true" />
          {t('fdr.autoSaved')}
        </span>
      )}
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>

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
                borderRadius: '10px', padding: '6px 10px'
              }}>
                {/* Clubcode, ratingcijfer en de thuisvoordeel-schakelaar op ÉÉN regel, met de slider
                    eronder. Voorheen stapelde de kaart vier blokken (code, cijfer, slider, en een
                    aparte thuisvoordeel-rij met eigen label) tot 91px hoog; achttien van die kaarten
                    besloegen samen meer dan een volledig telefoonscherm. Nu ~58px, en de sectie past
                    weer in beeld. Twee kolommen blijven: bij drie wordt de slider te smal om met een
                    duim nauwkeurig een 1 t/m 5 te zetten.
                    Het label "Thuisvoordeel" is daarbij naar het aria-label verhuisd — op één regel is
                    er geen plaats voor, en de schakelaar zelf draagt zijn betekenis al via role=switch. */}
                {/* Clubcode + ratingcijfer op één regel, slider eronder, en het thuisvoordeel als
                    eigen regel MET het woord erbij. Die tekst stond even weg om de kaart korter te
                    maken, maar dan is een los schakelaartje niet meer te plaatsen: je ziet wel dát er
                    iets aan staat, niet waarvoor. De kaart blijft alsnog ruim korter dan de 91px van
                    voorheen doordat de rij geen 44px-minimum meer opgelegd krijgt. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
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
                    background: style.bg, color: style.text, flexShrink: 0,
                  }}>{r}</span>
                </div>
                <input
                  type="range" min={1} max={5} step={1} value={r}
                  onChange={e => updateRating(team.code, Number(e.target.value))}
                  style={{ width: '100%', display: 'block', margin: '2px 0' }}
                  aria-label={t('fdr.strengthAria', { team: team.name })}
                />
                {/* Thuisvoordeel: losstaand van de sterkte-slider, zie getEffectiveRating. De VOLLEDIGE
                    rij is de knop, niet enkel het schakelaartje van 34x18px — over de volle kaartbreedte
                    is dat een ruim aanraakdoel, zonder de kaart op te blazen met een 44px-minimum. */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={homeAdvantageOn}
                  aria-label={t('fdr.homeAdvantageAria', { team: team.name })}
                  onClick={() => toggleHomeAdvantage(team.code)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px',
                    width: '100%', padding: '4px 0',
                    background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <span style={{ color: COLORS.textBody, fontSize: '10px', whiteSpace: 'nowrap' }}>
                    {t('fdr.homeAdvantage')}
                  </span>
                  {/* De knop verschoof voorheen via justifyContent — dat is geen animeerbare property,
                      dus hij "sprong" naar de overkant terwijl enkel de achtergrond vloeiend overging.
                      Nu schuift hij via een getransitionde transform. */}
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

      <section>
        <SectionHeader icon={Grid2x2} title={t('fdr.section.table')} sectionKey="table" isOpen={openSections.table} onToggle={toggleSection} />
        {openSections.table && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px', marginBottom: '10px'
        }}>
          <button
            onClick={(e) => { e.stopPropagation(); toggleSortByAverage(); }}
            aria-pressed={sortBy.mode === 'avg'}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent',
              color: COLORS.textBody, border: '1px solid rgba(255,255,255,0.2)',
              borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
            }}
          >
            <ArrowUpDown size={14} />
            {/* Kort label op smalle schermen: met de volledige tekst brak deze knop samen met de
                GW-kiezer naar twee regels (95px), terwijl ze samen net op één rij van 44px passen.
                Zelfde .fdr-btn-label-full/-short-patroon als de toolbar-knoppen hierboven. */}
            <span className="fdr-btn-label-full">
              {sortBy.mode === 'avg' ? t('fdr.sortByDifficultySorted') : t('fdr.sortByDifficulty')}
            </span>
            <span className="fdr-btn-label-short">
              {sortBy.mode === 'avg' ? t('fdr.sortByDifficultySortedShort') : t('fdr.sortByDifficultyShort')}
            </span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwLabel')}</label>
              {/* aria-label per select: het zichtbare "GW … t/m …" is één label voor twee velden, dus
                  zonder deze namen kondigt een screenreader allebei enkel aan als "keuzelijst". */}
              <select
                value={gwHorizonStart}
                onChange={e => setGwHorizonStart(Number(e.target.value))}
                aria-label={t('fdr.tableRangeFromAria')}
                style={selectStyle}
              >
                {gwOptionElements}
              </select>
              <span style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwTo')}</span>
              <select
                value={gwHorizonEnd}
                onChange={e => setGwHorizonEnd(Number(e.target.value))}
                aria-label={t('fdr.tableRangeToAria')}
                style={selectStyle}
              >
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
              <th scope="col" style={{
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
                  {/* De hele team-cel opent de clubkaart. Logo en code waren tot nu toe decoratie,
                      terwijl dit precies de plek is waar je je afvraagt hoe die club ervoor staat.
                      Als knop i.p.v. een klikbaar logo alleen: 20px is een te klein tikdoel. */}
                  {React.createElement(
                    onOpenClub ? 'button' : 'span',
                    {
                      type: onOpenClub ? 'button' : undefined,
                      onClick: onOpenClub ? () => onOpenClub(team.code) : undefined,
                      'aria-label': onOpenClub ? t('clubSheet.openAria', { club: team.name }) : undefined,
                      // Bewust GEEN .fdr-touch-target hier: die tilt de knop op aanraakschermen naar
                      // 44px, en omdat de team-cel de hoogste cel van de rij is trok dat élke
                      // fixture-cel ernaast mee omhoog (rij 56px i.p.v. 32px). De cel is ~93px breed,
                      // dus als aanraakdoel ruim voldoende; de fixture-cellen ernaast zijn niet eens
                      // aanklikbaar en hoeven die hoogte dus zeker niet.
                      className: undefined,
                      style: {
                        display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
                        background: 'none', border: 'none', padding: 0, color: 'inherit',
                        font: 'inherit', fontWeight: 700, textAlign: 'left',
                        cursor: onOpenClub ? 'pointer' : undefined,
                      },
                    },
                    <img
                      key="logo"
                      src={`/club-logos/${team.code}.webp`}
                      alt=""
                      className="club-logo"
                      style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />,
                    <span key="meta" style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ lineHeight: '13px' }}>{team.code}</span>
                      <TeamFormBar results={TEAM_FORM[team.code]} />
                    </span>,
                  )}
                </td>

                {FIXTURES[team.code].slice(gwHorizonRange.start - 1, gwHorizonRange.end).map((f, i) => {
                  const gwNumber = gwHorizonRange.start + i;
                  const info = getFixtureInfo(team.code, f, gwNumber, ratings, homeAdvantage);
                  const { opp, venue, rating, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } = info;
                  return (
                    <FixtureCell
                      key={gwNumber}
                      opp={opp}
                      venue={venue}
                      rating={rating}
                      isPostponed={isPostponed}
                      isPossiblyPostponed={isPossiblyPostponed}
                      bg={style?.bg}
                      textColor={style?.text}
                      postponedText={postponedText}
                      possiblyPostponedText={possiblyPostponedText}
                      isDoubleGameweek={isDoubleGameweek}
                      legs={legs}
                      ariaLabel={buildFixtureCellAriaLabel(t, info)}
                      dimmed={!matchesRatingFilter(info, highlightedRatings)}
                      stacked
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {/* De legende was tot nu toe puur decoratief, terwijl "toon me enkel de makkelijke fixtures"
            precies de vraag is die een FDR-tool hoort te beantwoorden. Elk blokje is nu een filter;
            meerdere tegelijk mag. Niet-passende cellen worden gedimd, niet verborgen: de tabel moet
            leesbaar blijven als tabel, met alle rijen en kolommen op hun plaats. */}
        {openSections.table && (
        <div
          role="group"
          aria-label={t('fdr.filterByRating')}
          style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}
        >
          {/* Zonder label leest een rij gekleurde cijfers als een legende, niet als iets wat je kan
              aanzetten — precies de verwarring die de vorige, bredere knoppen mét tekst niet hadden.
              Eén woord ervoor is genoeg om duidelijk te maken dat er hier iets te kiezen valt. */}
          <span style={{
            color: COLORS.textBody, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.04em', flexShrink: 0,
          }}>
            {t('fdr.filterLabel')}
          </span>
          {/* Vijf vierkantjes met het cijfer erin i.p.v. knoppen met het volledige label. Die labels
              maakten elke knop 81-99px breed, waardoor de rij op een telefoon naar twee regels brak,
              terwijl ze met 23px hoogte juist te laag waren om comfortabel te tikken. Het cijfer sluit
              aan bij de cijfers die al in de fixture-cellen staan; de omschrijving verhuist naar het
              aria-label, zodat de betekenis voor een screenreader volledig blijft. 40x40 past ruim
              binnen 390px en is meteen een fatsoenlijk aanraakdoel. */}
          {[1,2,3,4,5].map(r => {
            const active = highlightedRatings.includes(r);
            const label = t(`fdr.rating.${r}`);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRatingFilter(r)}
                aria-pressed={active}
                aria-label={label}
                title={label}
                // 40x40 is de gevraagde maat en past precies met z'n vijven binnen 390px, maar ligt
                // net onder de 44px-vuistregel voor aanraken. .fdr-hit-44 vergroot enkel de
                // aanraakzone (zie het pseudo-element in FDRTool.jsx), niet het vierkantje zelf.
                className="fdr-hit-44"
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: '40px', height: '40px', flexShrink: 0, padding: 0,
                  background: RATING_STYLE[r].bg, color: RATING_STYLE[r].text,
                  border: active ? '2px solid #FFFFFF' : '2px solid transparent',
                  borderRadius: '8px', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '15px', fontWeight: 900,
                  // Een gekozen filter is te herkennen aan de witte rand; de lichte buitenschaduw
                  // maakt dat ook zichtbaar tegen de lichtste kleuren van de schaal.
                  boxShadow: active ? '0 0 0 2px rgba(0,0,0,0.35)' : 'none',
                }}
              >
                {r}
              </button>
            );
          })}
          {highlightedRatings.length > 0 && (
            <button
              type="button"
              onClick={clearRatingFilter}
              className="fdr-touch-target"
              style={{
                background: 'transparent', color: COLORS.textBody,
                border: '1px solid rgba(255,255,255,0.2)', borderRadius: '999px',
                padding: '5px 12px', fontSize: '11px', fontWeight: 700,
                fontFamily: 'inherit', cursor: 'pointer',
              }}
            >
              {t('fdr.filterClearAll')}
            </button>
          )}
        </div>
        )}
        </div>
      </section>

      <section>
        <SectionHeader icon={TrendingUp} title={t('fdr.section.runs')} sectionKey="runs" isOpen={openSections.runs} onToggle={toggleSection} />
        {openSections.runs && (
        <div id="fdr-section-runs">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <label style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwLabel')}</label>
          <select
            value={rangeStart}
            onChange={e => setRangeStart(Number(e.target.value))}
            aria-label={t('fdr.runsRangeFromAria')}
            style={selectStyle}
          >
            {gwOptionElements}
          </select>
          <span style={{ color: COLORS.textBody, fontSize: '12px' }}>{t('fdr.gwTo')}</span>
          <select
            value={rangeEnd}
            onChange={e => setRangeEnd(Number(e.target.value))}
            aria-label={t('fdr.runsRangeToAria')}
            style={selectStyle}
          >
            {gwOptionElements}
          </select>
        </div>
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
              {/* marginTop van 12 naar 8: het GW-labelregeltje boven de badges brengt zelf al
                  ~10px mee, dus de rij als geheel houdt zo ongeveer dezelfde hoogte. */}
              <FixtureStrip
                className={`fdr-mini-fixture-row${team.fixtures.length > 6 ? ' fdr-mini-fixture-row--compact' : ''}`}
                teamCode={team.code}
                fixtures={team.fixtures}
                startGw={team.startGW}
                ratings={ratings}
                homeAdvantage={homeAdvantage}
                gwLabel={t('fdr.gwLabel')}
                style={{ marginTop: '8px' }}
              />
            </div>
          ))}
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
              // aria-pressed maakt voor een screenreader het verschil tussen "geselecteerd" en
              // "niet geselecteerd" hoorbaar — dat zat tot nu toe enkel in de achtergrondkleur — en
              // is meteen de haak waarmee .fdr-club-chip een al gekozen chip met rust laat.
              <button key={team.code} onClick={() => toggleCompareTeam(team.code)} disabled={disabled}
                className="fdr-club-chip" aria-pressed={selected} style={{
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
            {/* Bewust GEEN width: '100%' — zie de toelichting bij mainTableMinWidth in FDRTool.jsx:
                met table-layout: auto rekt de browser dan elke kolom uit om de container te vullen,
                wat hier een teamkolom van 220px opleverde tegenover 93px in de hoofdtabel. */}
            <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: `${compareTableMinWidth}px` }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left', color: COLORS.textBody, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '6px 8px', ...stickyTeamCellStyle }}>{t('fdr.teamColumn')}</th>
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
    </div>
    </>
  );
}
