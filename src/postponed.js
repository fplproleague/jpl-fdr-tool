// Tooltipteksten voor uitgestelde en mogelijk uitgestelde wedstrijden, per taal (spec A3).
// De gegevens (nieuwe datum als ISO, reden als sleutel) staan in constants.js; hier wordt er met t()
// een zin van gemaakt. De datum wordt per taal geformatteerd ("2 september", "2 septembre", ...).
import {
  TEAMS, POSTPONED_DATES, POSTPONED_REASONS, POSSIBLY_POSTPONED_REASONS, splitHomeAway,
} from './constants';

const LOCALES = { nl: 'nl-BE', fr: 'fr-BE', en: 'en-GB' };

function pairKey(a, b) {
  return [a, b].sort().join('-');
}

export function formatPostponedDate(iso, language) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  // Middag in UTC: valt in elke tijdzone op dezelfde kalenderdag.
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(LOCALES[language] ?? LOCALES.nl, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date);
}

export function postponedText(t, language, teamCode, opp, venue) {
  const [home, away] = splitHomeAway(teamCode, opp, venue);
  const key = pairKey(teamCode, opp);
  const iso = POSTPONED_DATES[key];
  const reasonKey = POSTPONED_REASONS[key];
  const reason = reasonKey ? ` ${t(`fixture.reason.${reasonKey}`)}` : '';
  if (!iso) return t('fixture.postponedNoDate', { home, away, reason });
  return t('fixture.postponed', { home, away, date: formatPostponedDate(iso, language), reason });
}

export function possiblyPostponedText(t, teamCode, opp, venue) {
  const [home, away] = splitHomeAway(teamCode, opp, venue);
  const entry = POSSIBLY_POSTPONED_REASONS[pairKey(teamCode, opp)];
  if (entry?.reason === 'europeClub') {
    const club = TEAMS.find(team => team.code === entry.club)?.name ?? entry.club;
    return t('fixture.possiblyPostponed.europeClub', { home, away, club });
  }
  return t('fixture.possiblyPostponed.europe', { home, away });
}

// Tekst bij een fixture-info uit getFixtureInfo (constants.js), of null.
export function fixtureInfoText(t, language, info) {
  if (!info) return null;
  if (info.isPostponed) return postponedText(t, language, info.teamCode, info.opp, info.venue);
  if (info.isPossiblyPostponed && !info.isDoubleGameweek) return possiblyPostponedText(t, info.teamCode, info.opp, info.venue);
  return null;
}
