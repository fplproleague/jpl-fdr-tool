// FdrCell (spec §5.9): één fixture-cel in de FDR-tabel. Neemt het resultaat van getFixtureInfo()
// (constants.js) en tekent het als vol gekleurd vlak met het moeilijkheidscijfer in de hoek (de
// toegankelijke backup voor kleurenblinden). DGW = twee helften, uitgesteld = arcering + tooltip,
// geen wedstrijd = streepje. Is de aftraptijd gekend (spec F4, KickoffContext), dan toont een hover of
// tik die in een tooltip ("za 21 nov 18:15").
import { memo } from 'react';
import { PostponedIndicator, TooltipTrigger } from '../components/Tooltip';
import { useI18n } from '../i18nContext';
import { fixtureInfoText } from '../postponed';
import { kickoffTextFor, useKickoffLookup } from '../data/kickoffs';
import './FdrCell.css';

const FdrCell = memo(function FdrCell({ info, ariaLabel, dimmed = false, as: Tag = 'td', className = '' }) {
  const { t, language } = useI18n();
  const kickoffs = useKickoffLookup();
  const postponedTip = fixtureInfoText(t, language, info);
  // Aftraptijd: bij een dubbele speeldag per wedstrijd ("AND H za 21 nov 18:15 · CLU A wo 25 nov 20:45").
  let kickoff = null;
  if (info && !info.isPostponed && kickoffs) {
    if (info.isDoubleGameweek) {
      const legs = info.legs
        .map(leg => [leg, kickoffTextFor(kickoffs, info.gw, info.teamCode, leg.opp, leg.venue, language)])
        .filter(([, text]) => text);
      kickoff = legs.length ? legs.map(([leg, text]) => `${leg.opp} ${leg.venue} ${text}`).join(' · ') : null;
    } else {
      kickoff = kickoffTextFor(kickoffs, info.gw, info.teamCode, info.opp, info.venue, language);
    }
  }
  const tipText = [kickoff, postponedTip].filter(Boolean).join(' · ') || null;
  const label = kickoff && ariaLabel ? `${ariaLabel}, ${kickoff}` : ariaLabel;
  const cls = (extra) => ['ui-fdr', extra, dimmed && 'is-dimmed', className].filter(Boolean).join(' ');

  if (!info) {
    return <Tag className={cls('is-blank')} aria-label={ariaLabel}>—</Tag>;
  }

  if (info.isPostponed) {
    return <PostponedIndicator as={Tag} className={cls('is-postponed')} text={tipText} ariaLabel={ariaLabel} />;
  }

  // Met een tooltip (aftraptijd en/of mogelijk uitgesteld) of zonder.
  const cell = (className, style, children) => (tipText
    ? <TooltipTrigger as={Tag} className={className} text={tipText} ariaLabel={label} style={style}>{children}</TooltipTrigger>
    : <Tag className={className} aria-label={label} style={style}>{children}</Tag>);

  if (info.isDoubleGameweek) {
    return cell(cls(tipText ? 'is-dgw is-tip' : 'is-dgw'), undefined, (
        <div className="ui-fdr__legs">
          {info.legs.map((leg, i) => (
            <div key={i} className="ui-fdr__leg" style={{ background: leg.style.bg, color: leg.style.text }}>
              {leg.opp}<span className="ui-fdr__venue">{leg.venue}</span>
            </div>
          ))}
        </div>
    ));
  }

  const style = { background: info.style.bg, color: info.style.text };
  const content = (
    <>
      {info.opp}
      <span className={`ui-fdr__venue${info.isPossiblyPostponed ? ' ui-fdr__maybe' : ''}`}>{info.venue}</span>
      {info.rating && <span className="ui-fdr__rating" aria-hidden="true">{info.rating}</span>}
    </>
  );

  return cell(cls(tipText ? 'is-tip' : ''), style, content);
});

export default FdrCell;
