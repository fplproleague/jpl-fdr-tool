// Inhoud van de FDR-tab (spec §7.1): paginakop met de ratingstatus, een toolbar (één periode met
// snelknoppen, legende die ook filtert, knoppen), de hoofdtabel (de Σ-kolom met het gemiddelde is
// optioneel) en "Beste fixture runs". De team-sterktes pas je aan in een lade ("Ratings aanpassen");
// welke clubs de tabel toont, kies je in een tweede lade ("Clubs kiezen", vervangt "Vergelijk teams").
//
// Alle data-state en handlers komen als props uit FDRTool.jsx: de tab wordt bij elke tabwissel
// opnieuw gemount, dus lokale state zou resetten (sortering, gekozen GW's, ...). Enkel "staat een
// lade open" is hier lokaal; die mag gerust dicht zijn als je terugkomt.

import { useState } from 'react';
import { RotateCcw, Link2, Download, Check, SlidersHorizontal, Info, Sigma, ListFilter } from 'lucide-react';
import { TEAMS_ALPHA, FIXTURES, RATING_STYLE, GW_COUNT, GW_INDEXES, DEFAULT_RATINGS, getFixtureInfo } from '../constants';
import { SectionHeader } from '../components/SectionHeader';
import Sheet from '../components/Sheet';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Segmented from '../ui/Segmented';
import FdrCell from '../ui/FdrCell';
import Badge from '../ui/Badge';
import FilterChip, { FilterChips } from '../ui/FilterChip';
import { FDR_QUICK_PERIODS } from '../fdrPeriod';
import { possiblyPostponedText } from '../postponed';
import { useOverflow } from '../ui/DataTable';
import '../ui/DataTable.css';
import '../ui/States.css';
import './FDRTab.css';

// Opties voor een GW-kiezer, begrensd tot wat een geldige keuze oplevert: de "vanaf"-kiezer loopt
// nooit voorbij het gekozen eindpunt, de "tot"-kiezer begint nooit vóór het gekozen beginpunt. De
// normalisatie in FDRTool.jsx blijft als vangnet voor een oude gedeelde link.
function gwOptions(vanaf, tot) {
  return GW_INDEXES
    .map(i => i + 1)
    .filter(gw => gw >= vanaf && gw <= tot)
    .map(gw => <option key={gw} value={gw}>{gw}</option>);
}

function GwRange({ t, from, to, setFrom, setTo, fromAria, toAria, quickPeriod, chooseQuickPeriod }) {
  return (
    <div className="fdr-range">
      <span className="label">{t('fdr.gwLabel')}</span>
      {/* aria-label per select: het zichtbare "GW … t/m …" is één label voor twee velden. */}
      <Select size="sm" value={from} onChange={v => setFrom(Number(v))} aria-label={fromAria}>
        {gwOptions(1, to)}
      </Select>
      <span className="fdr-range__to">{t('fdr.gwTo')}</span>
      <Select size="sm" value={to} onChange={v => setTo(Number(v))} aria-label={toAria}>
        {gwOptions(from, GW_COUNT)}
      </Select>
      {/* Snelknoppen "Volgende 3 · 5 · 8" (spec D2). Een eigen periode laat ze alle drie uit. */}
      {chooseQuickPeriod && (
        <span className="fdr-quick">
          <span className="fdr-range__to">{t('fdr.quickLabel')}</span>
          <Segmented
            size="sm"
            options={FDR_QUICK_PERIODS.map(n => ({ value: n, label: String(n), title: t('fdr.quickTitle', { n }) }))}
            value={quickPeriod}
            onChange={v => chooseQuickPeriod(Number(v))}
            ariaLabel={t('fdr.quickAria')}
          />
        </span>
      )}
    </div>
  );
}

// Lade "Clubs kiezen" (spec D3): 18 vinkjes. Niets of alles aangevinkt = alle clubs; met een deel
// toont de hoofdtabel enkel die clubs. De tabel ernaast verandert live mee.
function ClubsSheet({ t, selection, setSelection, onClose }) {
  const toggle = (code) => setSelection(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]));
  return (
    <Sheet
      titleId="fdr-clubs-title"
      title={t('fdr.clubs.title')}
      closeLabel={t('infoModal.close')}
      onClose={onClose}
      footer={(
        <div className="fdr-clubs__actions">
          <Button variant="secondary" size="sm" onClick={() => setSelection(TEAMS_ALPHA.map(team => team.code))}>{t('fdr.clubs.all')}</Button>
          <Button variant="ghost" size="sm" onClick={() => setSelection([])} disabled={selection.length === 0}>{t('fdr.clubs.clear')}</Button>
          <Button variant="primary" size="sm" className="fdr-clubs__done" onClick={onClose}>{t('fdr.clubs.done')}</Button>
        </div>
      )}
    >
      <p className="fdr-sheet-intro">{t('fdr.clubs.intro')}</p>
      <ul className="fdr-clubs">
        {TEAMS_ALPHA.map(team => (
          <li key={team.code}>
            <label className="fdr-clubs__row">
              <input type="checkbox" checked={selection.includes(team.code)} onChange={() => toggle(team.code)} />
              <ClubLogo code={team.code} />
              <span className="fdr-clubs__name">{team.name}</span>
              <span className="fdr-clubs__code">{team.code}</span>
            </label>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// Toegankelijke naam van een fixture-cel (normaal, mogelijk uitgesteld, uitgesteld en DGW).
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
  // Bij een mogelijk uitgestelde wedstrijd blijft de uitleg deel van de naam, anders verdwijnt de
  // betekenis van het "*" voor wie de tabel niet ziet.
  const maybeText = info.isPossiblyPostponed ? possiblyPostponedText(t, info.teamCode, info.opp, info.venue) : null;
  return maybeText ? `${base}. ${maybeText}` : base;
}

// Hoort deze cel bij de aangevinkte moeilijkheidsgraden? Leeg filter = alles. Een DGW telt mee zodra
// één van de twee wedstrijden past; een uitgestelde cel valt altijd buiten een actief filter.
function matchesRatingFilter(info, highlighted) {
  if (!highlighted || highlighted.length === 0) return true;
  if (info.isPostponed) return false;
  if (info.isDoubleGameweek) return info.legs.some(leg => highlighted.includes(leg.rating));
  return highlighted.includes(info.rating);
}

// Legende (5 vierkantjes, makkelijk → moeilijk) die tegelijk een filter is: een vierkantje aantikken
// dimt de cellen met een andere moeilijkheid. Meerdere tegelijk mag. Dimmen i.p.v. verbergen, zodat
// de tabel leesbaar blijft als tabel.
function RatingLegend({ t, highlightedRatings, toggleRatingFilter, clearRatingFilter, className = '' }) {
  return (
    <div role="group" aria-label={t('fdr.filterByRating')} className={`fdr-legend ${className}`}>
      <span className="fdr-legend__end">{t('fdr.legendEasy')}</span>
      {[1, 2, 3, 4, 5].map(r => {
        const active = highlightedRatings.includes(r);
        const label = t(`fdr.rating.${r}`);
        return (
          <button
            key={r}
            type="button"
            className="fdr-legend__swatch"
            onClick={() => toggleRatingFilter(r)}
            aria-pressed={active}
            aria-label={label}
            title={label}
          >
            <span aria-hidden="true" style={{ background: RATING_STYLE[r].bg }} />
          </button>
        );
      })}
      <span className="fdr-legend__end">{t('fdr.legendHard')}</span>
      {highlightedRatings.length > 0 && (
        <Button variant="ghost" size="sm" onClick={clearRatingFilter}>{t('fdr.filterClearAll')}</Button>
      )}
    </div>
  );
}

// Vorm als 5 vierkantjes van 6x6 (W/G/V), oudste eerst. Niets tonen zolang er geen uitslagen zijn:
// lege vierkantjes zouden een uitslag suggereren die er niet is.
function FormSquares({ t, results }) {
  if (!results || results.length === 0) return null;
  const spoken = results.map(r => t(`fdr.form.${r}`)).join(', ');
  return (
    <span className="fdr-form" role="img" aria-label={t('fdr.formAria', { results: spoken })}>
      {results.map((r, i) => <span key={i} className={`fdr-form__sq is-${r}`} />)}
    </span>
  );
}

function ClubLogo({ code, size = 16 }) {
  return (
    <img
      src={`/club-logos/${code}.webp`}
      alt=""
      className="club-logo"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
      onError={(e) => { e.target.style.display = 'none'; }}
    />
  );
}

// Balk boven de tabel (en bovenaan de lade) zolang de ratings uit een gedeelde link komen (spec A1).
// Pas "Overnemen" bewaart iets; "Terug" toont weer je eigen ratings.
function SharedRatingsBanner({ t, onAdopt, onLeave }) {
  return (
    <div className="ui-banner fdr-shared" role="status">
      <Link2 aria-hidden="true" strokeWidth={1.75} />
      <span className="ui-banner__text">{t('fdr.shared.text')}</span>
      <span className="ui-banner__actions">
        <Button variant="primary" size="sm" onClick={onAdopt}>{t('fdr.shared.adopt')}</Button>
        <Button variant="secondary" size="sm" onClick={onLeave}>{t('fdr.shared.leave')}</Button>
      </span>
    </div>
  );
}

// De ratings-lade: 18 rijen met logo + club, een Segmented 1-5 en de thuisvoordeel-schakelaar.
// Zelfde state en handlers als de vroegere sliders; de tabel ernaast verandert live mee. Een club die
// je zelf aanpaste, krijgt een label "aangepast" en een knop om enkel die club terug te zetten. Bij
// een gedeelde link is de lade alleen-lezen: eerst overnemen of terug naar je eigen ratings.
function RatingsSheet({
  t, ratings, homeAdvantage, updateRating, toggleHomeAdvantage, ratingOverrides, homeOverrides,
  resetRating, readOnly, onAdopt, onLeave, onClose,
}) {
  const options = [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n), disabled: readOnly }));
  return (
    <Sheet titleId="fdr-ratings-title" title={t('fdr.ratingsSheetTitle')} closeLabel={t('infoModal.close')} onClose={onClose}>
      {readOnly && <SharedRatingsBanner t={t} onAdopt={onAdopt} onLeave={onLeave} />}
      <p className="fdr-sheet-intro">{t('fdr.ratingsSheetIntro')}</p>
      <ul className="fdr-rating-list">
        {TEAMS_ALPHA.map(team => {
          const on = !!homeAdvantage[team.code];
          const changed = !readOnly && (team.code in ratingOverrides || team.code in homeOverrides);
          const resetLabel = t('fdr.ratingResetOneAria', { team: team.name, value: DEFAULT_RATINGS[team.code] });
          return (
            <li key={team.code} className="fdr-rating-row">
              <span className="fdr-rating-row__club">
                <ClubLogo code={team.code} />
                <span className="fdr-rating-row__name">{team.name}</span>
                {changed && (
                  <>
                    <Badge tone="outline" className="fdr-rating-row__changed">{t('fdr.ratingChanged')}</Badge>
                    <button type="button" className="fdr-rating-row__reset" onClick={() => resetRating(team.code)} aria-label={resetLabel} title={resetLabel}>
                      <RotateCcw aria-hidden="true" strokeWidth={1.75} />
                    </button>
                  </>
                )}
              </span>
              <Segmented
                className="fdr-rating-row__seg"
                options={options}
                value={ratings[team.code]}
                onChange={v => { if (!readOnly) updateRating(team.code, Number(v)); }}
                ariaLabel={t('fdr.strengthGroupAria', { team: team.name })}
              />
              {/* Thuisvoordeel: los van de sterkte, zie getEffectiveRating. De hele rij met tekst is
                  de knop, niet enkel het schakelaartje. */}
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t('fdr.homeAdvantageAria', { team: team.name })}
                disabled={readOnly}
                onClick={() => toggleHomeAdvantage(team.code)}
                className="fdr-switch"
              >
                <span className="fdr-switch__label">{t('fdr.homeAdvantage')}</span>
                <span className="fdr-switch__track" aria-hidden="true"><span className="fdr-switch__knob" /></span>
              </button>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

function TeamCell({ t, team, teamForm, onOpenClub }) {
  const inner = (
    <>
      <ClubLogo code={team.code} />
      <span className="fdr-team__meta">
        <span className="fdr-team__code">{team.code}</span>
        <FormSquares t={t} results={teamForm?.[team.code]} />
      </span>
    </>
  );
  return (
    <th scope="row" className="fdr-grid__team">
      {onOpenClub ? (
        <button type="button" className="fdr-team" onClick={() => onOpenClub(team.code)} aria-label={t('clubSheet.openAria', { club: team.name })}>
          {inner}
        </button>
      ) : <span className="fdr-team">{inner}</span>}
    </th>
  );
}

export default function FDRTab({
  t,
  ratings, homeAdvantage, updateRating, toggleHomeAdvantage,
  isCustom, ratingOverrides, homeOverrides, resetRating,
  isViewingShared, adoptSharedRatings, leaveSharedRatings,
  linkCopied, downloading,
  handleCopyLink, handleDownloadImage, handleReset, setShowInfo,
  openSections, toggleSection,
  sortBy, toggleSortByAverage, showAvgColumn, toggleAvgColumn,
  highlightedRatings, toggleRatingFilter, clearRatingFilter,
  gwHorizonStart, setGwHorizonStart, gwHorizonEnd, setGwHorizonEnd, gwHorizonRange,
  quickPeriod, chooseQuickPeriod,
  visibleGwHeaderCells, runsGwHeaderCells,
  displayedTeams, teamAvgDifficulty, tableRef,
  clubFilter, clubFilterActive, setClubFilter,
  bestRuns,
  teamForm,
  onOpenClub,
}) {
  const [ratingsOpen, setRatingsOpen] = useState(false);
  const [clubsOpen, setClubsOpen] = useState(false);
  // Beste runs: standaard de top 5, uitklapbaar naar alle clubs.
  const [showAllRuns, setShowAllRuns] = useState(false);
  const gwCount = visibleGwHeaderCells.length;
  const mainScroll = useOverflow(`${gwCount}-${displayedTeams.length}`);
  const visibleRuns = showAllRuns ? bestRuns : bestRuns.slice(0, 5);
  const runsScroll = useOverflow(`${runsGwHeaderCells.length}-${visibleRuns.length}-${openSections.runs}`);
  const sortedByAvg = sortBy.mode === 'avg';

  const legendProps = { t, highlightedRatings, toggleRatingFilter, clearRatingFilter };

  const meta = (
    <>
      {/* Het ratings-label is ook de weg naar de ratings-lade. */}
      <button type="button" className={`fdr-meta-link${isCustom || isViewingShared ? ' is-custom' : ''}`} onClick={() => setRatingsOpen(true)} aria-haspopup="dialog">
        {t(isViewingShared ? 'fdr.metaShared' : isCustom ? 'fdr.metaCustom' : 'fdr.metaDefault')}
      </button>
      <span aria-hidden="true"> · </span>
      <span className="num">{t('fdr.metaRange', { from: gwHorizonRange.start, to: gwHorizonRange.end })}</span>
    </>
  );

  const intro = (
    <>
      {t('fdr.intro')}{' '}
      <button type="button" className="fdr-intro-link" onClick={() => setRatingsOpen(true)} aria-haspopup="dialog">
        {t('fdr.introLink')}
      </button>{' '}
      <button type="button" className="ui-disclosure-btn" onClick={() => setShowInfo(true)} aria-haspopup="dialog">
        <Info aria-hidden="true" strokeWidth={1.75} /> {t('fdr.infoAria')}
      </button>
    </>
  );

  // Labels die op gsm verdwijnen (icoonknoppen): de knop houdt altijd een toegankelijke naam.
  const linkLabel = linkCopied ? t('fdr.linkCopied') : t('fdr.copyLink');
  const downloadLabel = downloading ? t('fdr.downloading') : t('fdr.downloadImageShort');

  return (
    <>
      <PageHeader title={t('fdr.pageTitle')} meta={meta} intro={intro} />

      <div className="fdr-toolbar">
        <GwRange
          t={t}
          from={gwHorizonStart} to={gwHorizonEnd} setFrom={setGwHorizonStart} setTo={setGwHorizonEnd}
          fromAria={t('fdr.tableRangeFromAria')} toAria={t('fdr.tableRangeToAria')}
          quickPeriod={quickPeriod} chooseQuickPeriod={chooseQuickPeriod}
        />
        <RatingLegend {...legendProps} className="fdr-legend--top" />
        <div className="fdr-toolbar__actions">
          <Button icon={ListFilter} className="fdr-tool-btn" onClick={() => setClubsOpen(true)} aria-haspopup="dialog" aria-pressed={clubFilterActive} aria-label={t('fdr.clubs.button')}>
            <span className="fdr-tool-btn__text">{t('fdr.clubs.button')}</span>
          </Button>
          <Button icon={SlidersHorizontal} className="fdr-tool-btn" onClick={() => setRatingsOpen(true)} aria-haspopup="dialog" aria-label={t('fdr.editRatings')}>
            <span className="fdr-tool-btn__text">{t('fdr.editRatings')}</span>
          </Button>
          <Button icon={linkCopied ? Check : Link2} className="fdr-tool-btn" onClick={handleCopyLink} aria-label={linkLabel}>
            <span className="fdr-tool-btn__text">{linkLabel}</span>
          </Button>
          <Button icon={Download} className="fdr-tool-btn" onClick={handleDownloadImage} disabled={downloading} aria-label={downloadLabel}>
            <span className="fdr-tool-btn__text">{downloadLabel}</span>
          </Button>
          <Button icon={Sigma} className="fdr-tool-btn" onClick={toggleAvgColumn} aria-pressed={showAvgColumn} aria-label={t('fdr.avgToggle')} title={t('fdr.avgColumnTitle')}>
            <span className="fdr-tool-btn__text">{t('fdr.avgToggleShort')}</span>
          </Button>
          {isCustom && !isViewingShared && (
            <Button icon={RotateCcw} className="fdr-tool-btn" onClick={handleReset} aria-label={t('fdr.reset')}>
              <span className="fdr-tool-btn__text">{t('fdr.resetShort')}</span>
            </Button>
          )}
        </div>
        {/* Live bevestiging voor schermlezers wanneer de ratings afwijken (en dus bewaard zijn). */}
        <span className="ui-sr-only" role="status">{isCustom ? t('fdr.autoSaved') : ''}</span>
      </div>

      {isViewingShared && <SharedRatingsBanner t={t} onAdopt={adoptSharedRatings} onLeave={leaveSharedRatings} />}

      {clubFilterActive && (
        <div className="fdr-chipsline">
          <FilterChips>
            <FilterChip
              label={t('fdr.clubs.chip', { count: clubFilter.length })}
              onRemove={() => setClubFilter([])}
              removeLabel={t('fdr.clubs.chipRemove')}
            />
          </FilterChips>
        </div>
      )}

      {/* tableRef + .fdr-table-scroll: hierop werkt de afbeelding-export in FDRTool.jsx. */}
      <div ref={tableRef} id="fdr-capture-wrapper">
        <div
          id="fdr-section-table"
          ref={mainScroll.ref}
          onScroll={mainScroll.onScroll}
          className={`fdr-table-scroll ui-table-scroll${mainScroll.className}`}
        >
          <table className={`fdr-grid${showAvgColumn ? '' : ' fdr-grid--no-avg'}`} style={{ '--fdr-gws': gwCount }}>
            <thead>
              <tr>
                <th scope="col" className="fdr-grid__team fdr-grid__corner">{t('fdr.teamColumn')}</th>
                {showAvgColumn && (
                  <th scope="col" className="fdr-grid__avg" aria-sort={sortedByAvg ? 'ascending' : 'none'}>
                    <button
                      type="button"
                      onClick={toggleSortByAverage}
                      aria-pressed={sortedByAvg}
                      aria-label={t('fdr.sortByAvgAria')}
                      title={t('fdr.avgColumnTitle')}
                      className={`fdr-grid__sort${sortedByAvg ? ' is-sorted' : ''}`}
                    >
                      {t('fdr.avgColumn')}
                    </button>
                  </th>
                )}
                {visibleGwHeaderCells}
              </tr>
            </thead>
            <tbody>
              {displayedTeams.map(team => {
                const avg = teamAvgDifficulty?.[team.code];
                return (
                  <tr key={team.code}>
                    <TeamCell t={t} team={team} teamForm={teamForm} onOpenClub={onOpenClub} />
                    {showAvgColumn && (
                      <td className="fdr-grid__avg num" aria-label={avg != null ? t('fdr.avgCellAria', { value: avg.toFixed(1) }) : undefined}>
                        {avg != null ? avg.toFixed(1) : '—'}
                      </td>
                    )}
                    {FIXTURES[team.code].slice(gwHorizonRange.start - 1, gwHorizonRange.end).map((f, i) => {
                      const gwNumber = gwHorizonRange.start + i;
                      const info = getFixtureInfo(team.code, f, gwNumber, ratings, homeAdvantage);
                      return (
                        <FdrCell
                          key={gwNumber}
                          info={info}
                          ariaLabel={buildFixtureCellAriaLabel(t, info)}
                          dimmed={!matchesRatingFilter(info, highlightedRatings)}
                        />
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="fdr-under-table">
        <RatingLegend {...legendProps} className="fdr-legend--bottom" />
        <p className="fdr-hint">{t('fdr.tapHint')}</p>
      </div>

      <section className="fdr-section">
        <SectionHeader title={t('fdr.section.runs')} sectionKey="runs" isOpen={openSections.runs} onToggle={toggleSection} />
        {openSections.runs && (
          <div id="fdr-section-runs">
            <p className="fdr-hint fdr-hint--lead">{t('fdr.runsPeriodHint', { from: gwHorizonRange.start, to: gwHorizonRange.end })}</p>
            {/* Zelfde tabelvorm als de hoofdtabel: rang + club, het gemiddelde (daar draait de ranglijst
                om) en per speeldag een volle FDR-cel met tegenstander en thuis/uit. */}
            <div ref={runsScroll.ref} onScroll={runsScroll.onScroll} className={`ui-table-scroll${runsScroll.className}`}>
              <table className="fdr-grid fdr-grid--runs" style={{ '--fdr-gws': runsGwHeaderCells.length }}>
                <thead>
                  <tr>
                    <th scope="col" className="fdr-grid__team fdr-grid__corner">{t('fdr.teamColumn')}</th>
                    <th scope="col" className="fdr-grid__avg" title={t('fdr.avgColumnTitle')}>{t('fdr.runsAvg')}</th>
                    {runsGwHeaderCells}
                  </tr>
                </thead>
                <tbody>
                  {visibleRuns.map((team, idx) => (
                    <tr key={team.code}>
                      <th scope="row" className="fdr-grid__team">
                        <button
                          type="button" className="fdr-team"
                          onClick={() => onOpenClub?.(team.code)} disabled={!onOpenClub}
                          aria-label={t('clubSheet.openAria', { club: team.name })}
                        >
                          <span className={`fdr-runs__rank num${idx === 0 ? ' is-first' : ''}`}>{idx + 1}</span>
                          <ClubLogo code={team.code} />
                          <span className="fdr-team__code">{team.code}</span>
                        </button>
                      </th>
                      <td className="fdr-grid__avg num" aria-label={t('fdr.avgDifficulty', { value: team.avg.toFixed(1) })}>
                        {team.avg.toFixed(1)}
                      </td>
                      {team.fixtures.map((f, i) => {
                        const gwNumber = team.startGW + i;
                        const info = getFixtureInfo(team.code, f, gwNumber, ratings, homeAdvantage);
                        return <FdrCell key={gwNumber} info={info} ariaLabel={buildFixtureCellAriaLabel(t, info)} />;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button variant="ghost" size="sm" className="fdr-runs__more" onClick={() => setShowAllRuns(v => !v)} aria-expanded={showAllRuns}>
              {showAllRuns ? t('fdr.runsShowTop') : t('fdr.runsShowAll', { count: bestRuns.length })}
            </Button>
          </div>
        )}
      </section>

      {ratingsOpen && (
        <RatingsSheet
          t={t}
          ratings={ratings}
          homeAdvantage={homeAdvantage}
          updateRating={updateRating}
          toggleHomeAdvantage={toggleHomeAdvantage}
          ratingOverrides={ratingOverrides}
          homeOverrides={homeOverrides}
          resetRating={resetRating}
          readOnly={isViewingShared}
          onAdopt={adoptSharedRatings}
          onLeave={leaveSharedRatings}
          onClose={() => setRatingsOpen(false)}
        />
      )}
      {clubsOpen && (
        <ClubsSheet t={t} selection={clubFilter} setSelection={setClubFilter} onClose={() => setClubsOpen(false)} />
      )}
    </>
  );
}
