// Compacte fixture-badge (tegenstander + venue) inclusief POSTPONED/POSSIBLY_POSTPONED-afhandeling,
// in mini-formaat — gebruikt voor "Beste fixture runs" in FDRTab én de fixture-strip per speler in
// WatchlistTab.

import { memo } from 'react';
import { getFixtureInfo } from '../constants';
import { PostponedIndicator, TooltipTrigger } from './Tooltip';

export const MiniFixtureBadge = memo(function MiniFixtureBadge({ teamCode, fixture, gwNumber, ratings, homeAdvantage }) {
  const { opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText, isDoubleGameweek, legs } =
    getFixtureInfo(teamCode, fixture, gwNumber, ratings, homeAdvantage);

  if (isPostponed) {
    return (
      <PostponedIndicator
        as="span"
        className="fdr-postponed-mini"
        text={postponedText}
        style={{
          background: '#4A4560', color: '#9B93AD', fontSize: '10px', fontWeight: 700,
          padding: '3px 6px', borderRadius: '5px', cursor: 'pointer', textAlign: 'center'
        }}
      />
    );
  }

  // DGW: mini-badge gesplitst in 2 gestapelde regels i.p.v. 1 — zelfde idee als FixtureCell, maar
  // dan als inline-flex span (blijft meelopen in de flex-wrap rij van badges). De "fdr-dgw-badge"-klasse
  // laat mobiele CSS de padding van deze wrapper resetten, los van de padding van de losse badges.
  if (isDoubleGameweek) {
    return (
      <span className="fdr-dgw-badge" style={{ display: 'inline-flex', flexDirection: 'column', borderRadius: '5px', overflow: 'hidden' }}>
        {legs.map((leg, i) => (
          <span key={i} style={{
            display: 'block', background: leg.style.bg, color: leg.style.text,
            fontSize: '8px', fontWeight: 700, padding: '2px 5px', lineHeight: 1.3, whiteSpace: 'nowrap',
            // Zie FixtureCell hierboven: border-bottom op de bovenste helft (i===0) i.p.v. border-top
            // op de onderste, in dezelfde paarse achtergrondkleur voor een consistente scheiding.
            borderBottom: i === 0 ? '2px solid #2A1440' : undefined
          }}>
            {leg.opp} ({leg.venue})
          </span>
        ))}
      </span>
    );
  }

  const badgeContent = (
    <>
      {opp}{' '}
      <span style={{ position: isPossiblyPostponed ? 'relative' : undefined }}>
        ({venue})
        {isPossiblyPostponed && <span className="fdr-maybe-postponed-marker" aria-hidden="true">*</span>}
      </span>
    </>
  );

  if (isPossiblyPostponed) {
    return (
      <TooltipTrigger
        as="span"
        text={possiblyPostponedText}
        style={{
          background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
          padding: '3px 6px', borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap'
        }}
      >
        {badgeContent}
      </TooltipTrigger>
    );
  }

  return (
    <span style={{
      background: style.bg, color: style.text, fontSize: '10px', fontWeight: 700,
      padding: '3px 6px', borderRadius: '5px', whiteSpace: 'nowrap'
    }}>
      {badgeContent}
    </span>
  );
});
