// Compacte fixture-badge (tegenstander + venue) inclusief POSTPONED/POSSIBLY_POSTPONED-afhandeling.
// De logica (welke fixture, welke rating) blijft hier; de weergave komt sinds de rework uit
// ui/MiniFixture (spec §5.9): een blokje van 36x18px, radius 0, in de FDR-kleur.
import { memo } from 'react';
import { getFixtureInfo } from '../constants';
import MiniFixture from '../ui/MiniFixture';

export const MiniFixtureBadge = memo(function MiniFixtureBadge({ teamCode, fixture, gwNumber, ratings, homeAdvantage }) {
  if (!fixture) return <MiniFixture info={null} />;
  const info = getFixtureInfo(teamCode, fixture, gwNumber, ratings, homeAdvantage);
  return <MiniFixture info={info} title={gwNumber ? `GW${gwNumber}` : undefined} />;
});
