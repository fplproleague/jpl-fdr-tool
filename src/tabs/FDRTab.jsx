// Inhoud van de FDR-tab: team-sterkte sliders, de hoofdtabel (Fixture Difficulty Rating) met
// GW-horizon-selector en sorteerknop, "Beste fixture runs", en "Vergelijk teams".
// Ontvangt alle state en handlers als props vanuit FDRTool.jsx (geen lokale useState hier) — de
// tab-content wordt conditioneel gemount/unmount bij het wisselen van tab, dus lokale state zou
// resetten (open secties, sortering, gekozen GW-ranges, ...) telkens de gebruiker weg- en
// terugnavigeert.

import { memo } from 'react';
import { RotateCcw, TrendingUp, Info, Link2, Download, Check, ArrowUpDown, Settings2, Grid2x2, Scale } from 'lucide-react';
import { TEAMS, TEAMS_ALPHA, FIXTURES, RATING_STYLE, GW_INDEXES, getFixtureInfo } from '../constants';
import { SectionHeader } from '../components/SectionHeader';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import { PostponedIndicator, TooltipTrigger } from '../components/Tooltip';

const selectStyle = {
  background: '#3D1E5C', color: '#FFF', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '6px', padding: '4px 8px', fontSize: '12px'
};

const secondaryToolbarBtnStyle = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: 'transparent', color: '#C9B8E0',
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: '8px 14px',
  fontWeight: 700, fontSize: '13px', cursor: 'pointer'
};

// FDR-tab-only: gebruikt voor de GW-horizon-selector en de "Beste fixture runs"-range-selectors.
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
          background: '#4A4560', color: '#9B93AD', textAlign: 'center',
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

export default function FDRTab({
  ratings, homeAdvantage, updateRating, toggleHomeAdvantage,
  isCustom, saved, linkCopied, downloading,
  handleCopyLink, handleDownloadImage, handleReset, handleSave, setShowInfo,
  openSections, toggleSection,
  sortByDifficulty, setSortByDifficulty,
  gwHorizonStart, setGwHorizonStart, gwHorizonEnd, setGwHorizonEnd, gwHorizonRange,
  visibleGwHeaderCells, gwHeaderCells, mainTableMinWidth,
  displayedTeams, tableRef,
  rangeStart, setRangeStart, rangeEnd, setRangeEnd, bestRuns,
  compareTeams, toggleCompareTeam,
}) {
  return (
    <>
    <p style={{ color: '#8F79AD', fontSize: '13px', marginBottom: '18px' }}>
      Mijn eigen fixture difficulty ratings — pas ze aan naar jouw mening en ontdek meteen welke teams de beste runs hebben.
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
        {isCustom ? 'JOUW AANGEPASTE VERSIE' : 'RATING VAN @FPL_PROLEAGUE'}
      </span>
      <div className="fpl-toolbar-actions">
      <span className="fpl-toolbar-secondary">
      <button onClick={handleCopyLink} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
        {linkCopied ? <Check size={14} /> : <Link2 size={14} />}
        <span className="fdr-btn-label-full">{linkCopied ? 'Link gekopieerd!' : 'Kopieer link'}</span>
        <span className="fdr-btn-label-short">{linkCopied ? 'Gekopieerd!' : 'Kopieer'}</span>
      </button>
      <button onClick={handleDownloadImage} disabled={downloading} className="fdr-toolbar-btn" style={{
        ...secondaryToolbarBtnStyle,
        cursor: downloading ? 'default' : 'pointer',
        opacity: downloading ? 0.6 : 1
      }}>
        <Download size={14} />
        <span className="fdr-btn-label-full">{downloading ? 'Bezig...' : 'Download als afbeelding'}</span>
        <span className="fdr-btn-label-short">{downloading ? 'Bezig...' : 'Download'}</span>
      </button>
      <button onClick={handleReset} className="fdr-toolbar-btn" style={secondaryToolbarBtnStyle}>
        <RotateCcw size={14} />
        <span className="fdr-btn-label-full">Reset FDR</span>
        <span className="fdr-btn-label-short">Reset</span>
      </button>
      <button onClick={handleSave} className="fdr-toolbar-btn" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#4ECDC4', color: '#0B2E1B',
        border: 'none', borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px',
        cursor: 'pointer'
      }}>
        <Check size={14} />
        <span className="fdr-btn-label-full">{saved ? 'Opgeslagen ✓' : 'Bewaar in browser'}</span>
        <span className="fdr-btn-label-short">{saved ? 'Bewaard ✓' : 'Bewaar'}</span>
      </button>
      </span>
      <button onClick={() => setShowInfo(true)} aria-label="Uitleg" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: '34px', height: '34px',
        background: 'transparent', color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '8px', cursor: 'pointer', flexShrink: 0
      }}>
        <Info size={16} />
      </button>
      </div>
    </div>

    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: '24px' }}>

      <section>
        <SectionHeader icon={Settings2} title="Team-sterkte instellen" sectionKey="sliders" isOpen={openSections.sliders} onToggle={toggleSection} />
        {openSections.sliders && (
        <div className="fdr-sliders-grid" style={{
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
                      src={`/club-logos/${team.code}.png`}
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
                  aria-label={`Sterkte ${team.name}`}
                />
                {/* Thuisvoordeel: losstaand van de sterkte-slider hierboven, zie getEffectiveRating. */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ color: '#C9B8E0', fontSize: '10px' }}>Thuisvoordeel</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={homeAdvantageOn}
                    aria-label={`Thuisvoordeel ${team.name}`}
                    onClick={() => toggleHomeAdvantage(team.code)}
                    style={{
                      display: 'inline-flex', alignItems: 'center', width: '30px', height: '16px',
                      borderRadius: '999px', border: 'none', padding: '2px', cursor: 'pointer',
                      background: homeAdvantageOn ? '#4ECDC4' : 'rgba(255,255,255,0.15)',
                      justifyContent: homeAdvantageOn ? 'flex-end' : 'flex-start', transition: 'background 0.15s ease'
                    }}
                  >
                    <span style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#FFFFFF', display: 'block' }} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </section>

      <section>
        <SectionHeader icon={Grid2x2} title="Fixture Difficulty Rating" sectionKey="table" isOpen={openSections.table} onToggle={toggleSection} />
        {openSections.table && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: '10px', marginBottom: '10px'
        }}>
          <button onClick={(e) => { e.stopPropagation(); setSortByDifficulty(s => !s); }} style={{
            display: 'flex', alignItems: 'center', gap: '6px', background: 'transparent',
            color: '#C9B8E0', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '8px', padding: '8px 14px', fontWeight: 700, fontSize: '13px', cursor: 'pointer'
          }}>
            <ArrowUpDown size={14} />
            {sortByDifficulty ? 'Gesorteerd: makkelijkste eerst' : 'Sorteer op makkelijkste run'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ color: '#C9B8E0', fontSize: '12px' }}>GW</label>
              <select value={gwHorizonStart} onChange={e => setGwHorizonStart(Number(e.target.value))} style={selectStyle}>
                {gwOptionElements}
              </select>
              <span style={{ color: '#C9B8E0', fontSize: '12px' }}>t/m</span>
              <select value={gwHorizonEnd} onChange={e => setGwHorizonEnd(Number(e.target.value))} style={selectStyle}>
                {gwOptionElements}
              </select>
            </div>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#6B5289', fontSize: '11px' }}>
              <Info size={12} />
              Tik op grijze cellen of die met een * voor meer info
            </span>
          </div>
        </div>
        )}
        <div ref={tableRef} id="fdr-capture-wrapper">
        <div className="fdr-table-scroll" style={{
          overflowX: 'auto', background: '#2A1440', padding: '4px',
          display: openSections.table ? 'block' : 'none'
        }}>
        <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: `${mainTableMinWidth}px` }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase',
                letterSpacing: '0.05em', padding: '6px 8px', position: 'sticky', left: 0,
                background: '#2A1440', zIndex: 3, boxShadow: '-4px 0 0 0 #2A1440, 4px 0 0 0 #2A1440'
              }}>Team</th>
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
                      src={`/club-logos/${team.code}.png`}
                      alt=""
                      className="club-logo"
                      style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                      onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    {team.code}
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
              <span style={{ color: '#C9B8E0', fontSize: '11px' }}>{RATING_STYLE[r].label}</span>
            </div>
          ))}
        </div>
        )}
        </div>
      </section>

      <section>
        <SectionHeader icon={TrendingUp} title="Beste fixture runs" sectionKey="runs" isOpen={openSections.runs} onToggle={toggleSection} />
        {openSections.runs && (
        <>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <label style={{ color: '#C9B8E0', fontSize: '12px' }}>GW</label>
          <select value={rangeStart} onChange={e => setRangeStart(Number(e.target.value))} style={selectStyle}>
            {gwOptionElements}
          </select>
          <span style={{ color: '#C9B8E0', fontSize: '12px' }}>t/m</span>
          <select value={rangeEnd} onChange={e => setRangeEnd(Number(e.target.value))} style={selectStyle}>
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
                  src={`/club-logos/${team.code}.png`}
                  alt=""
                  className="club-logo"
                  style={{ width: '24px', height: '24px', objectFit: 'contain', flexShrink: 0 }}
                  onError={(e) => { e.target.style.display = 'none'; }}
                />
                <div style={{ minWidth: '130px' }}>
                  <div style={{ color: '#FFF', fontWeight: 700, fontSize: '14px' }}>{team.name}</div>
                  <div style={{ color: '#8F79AD', fontSize: '11px' }}>Gem. moeilijkheid: {team.avg.toFixed(1)}</div>
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
        </>
        )}
      </section>

      {/* COMPARE TEAMS */}
      <section>
        <SectionHeader icon={Scale} title="Vergelijk teams" sectionKey="compare" isOpen={openSections.compare} onToggle={toggleSection} />
        {openSections.compare && (
        <>
        <p style={{ color: '#8F79AD', fontSize: '12px', marginBottom: '10px' }}>
          Kies tot 5 teams om hun fixtures onder elkaar te zien.
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
                color: selected ? '#0B2E1B' : disabled ? '#5A4A72' : '#FFF',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                padding: '6px 4px', fontSize: '12px', fontWeight: 700,
                cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1
              }}>
                <img
                  src={`/club-logos/${team.code}.png`}
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
          <p style={{ color: '#6B5289', fontSize: '13px' }}>Nog geen teams geselecteerd.</p>
        )}
        {compareTeams.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: '4px', minWidth: '600px', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: '#C9B8E0', fontSize: '11px', textTransform: 'uppercase', padding: '6px 8px' }}>Team</th>
                  {gwHeaderCells}
                </tr>
              </thead>
              <tbody>
                {compareTeams.map(code => {
                  const team = TEAMS.find(t => t.code === code);
                  return (
                    <tr key={code}>
                      <td style={{ color: '#FFF', fontWeight: 700, fontSize: '13px', padding: '6px 8px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <img
                            src={`/club-logos/${team.code}.png`}
                            alt=""
                            className="club-logo"
                            style={{ width: '20px', height: '20px', objectFit: 'contain', flexShrink: 0 }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                          {team.code}
                        </span>
                      </td>
                      {FIXTURES[code].map((f, i) => {
                        const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
                          getFixtureInfo(code, f, i + 1, ratings, homeAdvantage);
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
        </>
        )}
      </section>
    </div>
    </>
  );
}
