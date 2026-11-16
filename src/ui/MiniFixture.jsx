// MiniFixture (spec §5.9): blokje van 36x18px met de FDR-kleur, tegenstander in caps + kleine H/A.
// Neemt het resultaat van getFixtureInfo(); de logica (uitgesteld, DGW, mogelijk uitgesteld) blijft in
// components/MiniFixtureBadge.jsx, dat dit component gebruikt voor de weergave.
import { memo } from 'react';
import { PostponedIndicator, TooltipTrigger } from '../components/Tooltip';
import { useI18n } from '../i18nContext';
import { fixtureInfoText } from '../postponed';
import './FdrCell.css';

const MiniFixture = memo(function MiniFixture({ info, ariaLabel, title }) {
  const { t, language } = useI18n();
  const tipText = fixtureInfoText(t, language, info);
  if (!info) return <span className="ui-mini is-blank" aria-label={ariaLabel}>—</span>;

  if (info.isPostponed) {
    return <PostponedIndicator as="span" className="ui-mini is-postponed fdr-postponed-mini" text={tipText} ariaLabel={ariaLabel} />;
  }

  if (info.isDoubleGameweek) {
    return (
      <span className="ui-mini is-dgw fdr-dgw-badge" aria-label={ariaLabel} title={title}>
        {info.legs.map((leg, i) => (
          <span key={i} className="ui-mini__leg" style={{ background: leg.style.bg, color: leg.style.text }}>
            {leg.opp}&nbsp;<span className="ui-mini__venue">{leg.venue}</span>
          </span>
        ))}
      </span>
    );
  }

  const style = { background: info.style.bg, color: info.style.text };
  const content = (
    <>
      {info.opp}<span className="ui-mini__venue">{info.venue}{info.isPossiblyPostponed ? '*' : ''}</span>
    </>
  );
  if (info.isPossiblyPostponed) {
    return (
      <TooltipTrigger as="span" className="ui-mini is-tip" text={tipText} ariaLabel={ariaLabel} style={style}>
        {content}
      </TooltipTrigger>
    );
  }
  return <span className="ui-mini" style={style} aria-label={ariaLabel} title={title}>{content}</span>;
});

export default MiniFixture;
