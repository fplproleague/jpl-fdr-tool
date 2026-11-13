// Inhoud van de FDR-tab (spec §7.1): paginakop met de ratingstatus, een toolbar (GW-bereik, legende
// die ook filtert, knoppen), de hoofdtabel (de Σ-kolom met het gemiddelde is optioneel), "Beste fixture runs" en
// "Vergelijk teams". De team-sterktes pas je aan in een lade ("Ratings aanpassen").
//
// Alle data-state en handlers komen als props uit FDRTool.jsx: de tab wordt bij elke tabwissel
// opnieuw gemount, dus lokale state zou resetten (sortering, gekozen GW's, ...). Enkel "staat de
// ratings-lade open" is hier lokaal; die mag gerust dicht zijn als je terugkomt.

import { useState } from 'react';
import { RotateCcw, Link2, Download, Check, SlidersHorizontal, Info, Sigma } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, FIXTURES, RATING_STYLE, GW_COUNT, GW_INDEXES, getFixtureInfo } from '../constants';
import { SectionHeader } from '../components/SectionHeader';
import Sheet from '../components/Sheet';
import PageHeader from '../ui/PageHeader';
import Button from '../ui/Button';
import Select from '../ui/Select';
import Segmented from '../ui/Segmented';
import FdrCell from '../ui/FdrCell';
import { useOverflow } from '../ui/DataTable';
import '../ui/DataTable.css';
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

function GwRange({ t, from, to, setFrom, setTo, fromAria, toAria }) {
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
    </div>
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
  return info.isPossiblyPostponed && info.possiblyPostponedText
    ? `${base}. ${info.possiblyPostponedText}`
    : base;
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

// De ratings-lade: 18 rijen met logo + club, een Segmented 1-5 en de thuisvoordeel-schakelaar.
// Zelfde state en handlers als de vroegere sliders; de tabel ernaast verandert live mee.
function RatingsSheet({ t, ratings, homeAdvantage, updateRating, toggleHomeAdvantage, onClose }) {
  const options = [1, 2, 3, 4, 5].map(n => ({ value: n, label: String(n) }));
  return (
    <Sheet titleId="fdr-ratings-title" title={t('fdr.ratingsSheetTitle')} closeLabel={t('infoModal.close')} onClose={onClose}>
      <p className="fdr-sheet-intro">{t('fdr.ratingsSheetIntro')}</p>
      <ul className="fdr-rating-list">
        {TEAMS_ALPHA.map(team => {
          const on = !!homeAdvantage[team.code];
          return (
            <li key={team.code} className="fdr-rating-row">
              <span className="fdr-rating-row__club">
                <ClubLogo code={team.code} />
                <span className="fdr-rating-row__name">{team.name}</span>
              </span>
              <Segmented
                className="fdr-rating-row__seg"
                options={options}
                value={ratings[team.code]}
                onChange={v => updateRating(team.code, Number(v))}
                ariaLabel={t('fdr.strengthGroupAria', { team: team.name })}
              />
              {/* Thuisvoordeel: los van de sterkte, zie getEffectiveRating. De hele rij met tekst is
                  de knop, niet enkel het schakelaartje. */}
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t('fdr.homeAdvantageAria', { team: team.name })}
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
  isCustom, linkCopied, downloading,
  handleCopyLink, handleDownloadImage, handleReset, setShowInfo,
  openSections, toggleSection,
  sortBy, toggleSortByAverage, showAvgColumn, toggleAvgColumn,
  highlightedRatings, toggleRatingFilter, clearRatingFilter,
  gwHorizonStart, setGwHorizonStart, gwHorizonEnd, setGwHorizonEnd, gwHorizonRange,
  visibleGwHeaderCells, compareGwHeaderCells, compareGwStart, compareGwEnd,
  displayedTeams, teamAvgDifficulty, tableRef,
  rangeStart, setRangeStart, rangeEnd, setRangeEnd, bestRuns,
  compareTeams, toggleCompareTeam,
  teamForm,
  onOpenClub,
}) {
  const [ratingsOpen, setRatingsOpen] = useState(false);
  // Beste runs: standaard de top 5, uitklapbaar naar alle clubs.
  const [showAllRuns, setShowAllRuns] = useState(false);
  const gwCount = visibleGwHeaderCells.length;
  const mainScroll = useOverflow(`${gwCount}-${displayedTeams.length}`);
  const compareScroll = useOverflow(`${compareGwHeaderCells.length}-${compareTeams.length}`);
  const visibleRuns = showAllRuns ? bestRuns : bestRuns.slice(0, 5);
  const runsScroll = useOverflow(`${compareGwHeaderCells.length}-${visibleRuns.length}-${openSections.runs}`);
  const sortedByAvg = sortBy.mode === 'avg';

  const legendProps = { t, highlightedRatings, toggleRatingFilter, clearRatingFilter };

  const meta = (
    <>
      {/* Het ratings-label is ook de weg naar de ratings-lade. */}
      <button type="button" className={`fdr-meta-link${isCustom ? ' is-custom' : ''}`} onClick={() => setRatingsOpen(true)} aria-haspopup="dialog">
        {t(isCustom ? 'fdr.metaCustom' : 'fdr.metaDefault')}
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
        />
        <RatingLegend {...legendProps} className="fdr-legend--top" />
        <div className="fdr-toolbar__actions">
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
          {isCustom && (
            <Button icon={RotateCcw} className="fdr-tool-btn" onClick={handleReset} aria-label={t('fdr.reset')}>
              <span className="fdr-tool-btn__text">{t('fdr.resetShort')}</span>
            </Button>
          )}
        </div>
        {/* Live bevestiging voor schermlezers wanneer de ratings afwijken (en dus bewaard zijn). */}
        <span className="ui-sr-only" role="status">{isCustom ? t('fdr.autoSaved') : ''}</span>
      </div>

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
            <GwRange
              t={t}
              from={rangeStart} to={rangeEnd} setFrom={setRangeStart} setTo={setRangeEnd}
              fromAria={t('fdr.runsRangeFromAria')} toAria={t('fdr.runsRangeToAria')}
            />
            <p className="fdr-hint">{t('fdr.sharedRangeHint')}</p>
            {/* Zelfde tabelvorm als de hoofdtabel: rang + club, het gemiddelde (daar draait de ranglijst
                om) en per speeldag een volle FDR-cel met tegenstander en thuis/uit. */}
            <div ref={runsScroll.ref} onScroll={runsScroll.onScroll} className={`ui-table-scroll${runsScroll.className}`}>
              <table className="fdr-grid fdr-grid--runs" style={{ '--fdr-gws': compareGwHeaderCells.length }}>
                <thead>
                  <tr>
                    <th scope="col" className="fdr-grid__team fdr-grid__corner">{t('fdr.teamColumn')}</th>
                    <th scope="col" className="fdr-grid__avg" title={t('fdr.avgColumnTitle')}>{t('fdr.runsAvg')}</th>
                    {compareGwHeaderCells}
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

      <section className="fdr-section">
        <SectionHeader title={t('fdr.section.compare')} sectionKey="compare" isOpen={openSections.compare} onToggle={toggleSection} />
        {openSections.compare && (
          <div id="fdr-section-compare">
            <p className="fdr-hint fdr-hint--lead">{t('fdr.compareIntro')}</p>
            {/* Zelfde periode als "Beste fixture runs" (rangeStart/rangeEnd). Bewust een tweede kiezer:
                de secties klappen los van elkaar open, dus één gedeelde kiezer zou vaak onbereikbaar zijn. */}
            <GwRange
              t={t}
              from={rangeStart} to={rangeEnd} setFrom={setRangeStart} setTo={setRangeEnd}
              fromAria={t('fdr.compareRangeFromAria')} toAria={t('fdr.compareRangeToAria')}
            />
            <p className="fdr-hint">{t('fdr.sharedRangeHint')}</p>
            <div className="fdr-compare-chips">
              {TEAMS_ALPHA.map(team => {
                const selected = compareTeams.includes(team.code);
                const disabled = !selected && compareTeams.length >= 5;
                return (
                  <Button key={team.code} size="sm" onClick={() => toggleCompareTeam(team.code)} disabled={disabled} aria-pressed={selected} className="fdr-compare-chip">
                    <ClubLogo code={team.code} size={14} />
                    {team.code}
                  </Button>
                );
              })}
            </div>
            {compareTeams.length === 0 && <p className="fdr-hint">{t('fdr.compareNoTeams')}</p>}
            {compareTeams.length > 0 && (
              <div ref={compareScroll.ref} onScroll={compareScroll.onScroll} className={`ui-table-scroll${compareScroll.className}`}>
                <table className="fdr-grid fdr-grid--compare" style={{ '--fdr-gws': compareGwHeaderCells.length }}>
                  <thead>
                    <tr>
                      <th scope="col" className="fdr-grid__team fdr-grid__corner">{t('fdr.teamColumn')}</th>
                      {compareGwHeaderCells}
                    </tr>
                  </thead>
                  <tbody>
                    {compareTeams.map(code => {
                      const team = TEAMS.find(x => x.code === code);
                      return (
                        <tr key={code}>
                          <TeamCell t={t} team={team} teamForm={null} onOpenClub={onOpenClub} />
                          {/* Zelfde venster als compareGwHeaderCells: kop en rijen uit één bron. */}
                          {FIXTURES[code].slice(compareGwStart - 1, compareGwEnd).map((f, i) => {
                            const gwNumber = compareGwStart + i;
                            const info = getFixtureInfo(code, f, gwNumber, ratings, homeAdvantage);
                            return <FdrCell key={gwNumber} info={info} ariaLabel={buildFixtureCellAriaLabel(t, info)} />;
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

      {ratingsOpen && (
        <RatingsSheet
          t={t}
          ratings={ratings}
          homeAdvantage={homeAdvantage}
          updateRating={updateRating}
          toggleHomeAdvantage={toggleHomeAdvantage}
          onClose={() => setRatingsOpen(false)}
        />
      )}
    </>
  );
}
