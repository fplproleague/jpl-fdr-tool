// FdrCell (spec §5.9): één fixture-cel in de FDR-tabel. Neemt het resultaat van getFixtureInfo()
// (constants.js) en tekent het als vol gekleurd vlak met het moeilijkheidscijfer in de hoek (de
// toegankelijke backup voor kleurenblinden). DGW = twee helften, uitgesteld = arcering + tooltip,
// geen wedstrijd = streepje.
import { memo } from 'react';
import { PostponedIndicator, TooltipTrigger } from '../components/Tooltip';
import { useI18n } from '../i18nContext';
import { fixtureInfoText } from '../postponed';
import './FdrCell.css';

const FdrCell = memo(function FdrCell({ info, ariaLabel, dimmed = false, as: Tag = 'td', className = '' }) {
  const { t, language } = useI18n();
  const tipText = fixtureInfoText(t, language, info);
  const cls = (extra) => ['ui-fdr', extra, dimmed && 'is-dimmed', className].filter(Boolean).join(' ');

  if (!info) {
    return <Tag className={cls('is-blank')} aria-label={ariaLabel}>—</Tag>;
  }

  if (info.isPostponed) {
    return <PostponedIndicator as={Tag} className={cls('is-postponed')} text={tipText} ariaLabel={ariaLabel} />;
  }

  if (info.isDoubleGameweek) {
    return (
      <Tag className={cls('is-dgw')} aria-label={ariaLabel}>
        <div className="ui-fdr__legs">
          {info.legs.map((leg, i) => (
            <div key={i} className="ui-fdr__leg" style={{ background: leg.style.bg, color: leg.style.text }}>
              {leg.opp}<span className="ui-fdr__venue">{leg.venue}</span>
            </div>
          ))}
        </div>
      </Tag>
    );
  }

  const style = { background: info.style.bg, color: info.style.text };
  const content = (
    <>
      {info.opp}
      <span className={`ui-fdr__venue${info.isPossiblyPostponed ? ' ui-fdr__maybe' : ''}`}>{info.venue}</span>
      {info.rating && <span className="ui-fdr__rating" aria-hidden="true">{info.rating}</span>}
    </>
  );

  if (info.isPossiblyPostponed) {
    return (
      <TooltipTrigger as={Tag} className={cls('is-tip')} text={tipText} ariaLabel={ariaLabel} style={style}>
        {content}
      </TooltipTrigger>
    );
  }

  return <Tag className={cls()} aria-label={ariaLabel} style={style}>{content}</Tag>;
});

export default FdrCell;
