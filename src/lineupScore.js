// Eén eenvoudige, uitlegbare score per speler per speeldag (FUNCTIONALITEIT_SPEC C6), voor
// "Optimaliseer opstelling", de automatische opstelling van een nieuw team en het kapiteinsvoorstel.
//
//   score = basis × fixtureFactor × startFactor
//   basis         = gemiddelde punten per gespeelde speeldag, laatste 5 speeldagen (min. 1 gespeeld);
//                   anders het seizoensgemiddelde; anders 1
//   fixtureFactor = { 1: 1.20, 2: 1.10, 3: 1.00, 4: 0.90, 5: 0.80 }[effectieve FDR]
//                   (dubbele speeldag: de som over beide wedstrijden; geen wedstrijd: 0)
//   startFactor   = geschorst 0 · risico 0.3 · twijfel 0.7 · starter/zeker 1 · onbekend 0.9
//                   (enkel voor de speeldag waarvoor de Verwachte XI's gepubliceerd zijn; later 1,
//                   behalve bij een schorsing voor die speeldag)
//
// Dit is GEEN voorspelmodel en heet nergens "verwachte punten". De getallen zelf toont de site niet.
// Blessures tellen niet mee (beslissing eigenaar, 13 november 2026).
import { FIXTURES, POSTPONED, getFixtureLegs, getEffectiveRating } from './constants';

export const FORM_WINDOW = 5;
export const FIXTURE_FACTOR = { 1: 1.2, 2: 1.1, 3: 1.0, 4: 0.9, 5: 0.8 };
const SAFETY_FACTOR = { darkgreen: 1, green: 1, orange: 0.7, red: 0.3 };
const UNKNOWN_START_FACTOR = 0.9;
// Een negatief of nulgemiddelde zou de volgorde omdraaien (een makkelijke tegenstander zou dan lager
// scoren). Daarom een kleine ondergrens.
const MIN_BASIS = 0.1;

export function basisScore({ weeklyPts = null, weeklyMin = null, lastGw = 0, seasonPts = 0, seasonMatches = 0 } = {}) {
  if (Array.isArray(weeklyPts) && lastGw > 0) {
    let total = 0;
    let played = 0;
    for (let i = Math.max(0, lastGw - FORM_WINDOW); i < lastGw; i++) {
      const minutes = Array.isArray(weeklyMin) ? weeklyMin[i] : null;
      if ((minutes ?? 0) > 0) { total += weeklyPts[i] ?? 0; played += 1; }
    }
    if (played > 0) return Math.max(MIN_BASIS, total / played);
  }
  if (seasonMatches > 0) return Math.max(MIN_BASIS, seasonPts / seasonMatches);
  return 1;
}

export function fixtureFactorFor(teamCode, gw, ratings, homeAdvantage) {
  if (!teamCode) return 0;
  const fixture = FIXTURES[teamCode]?.[gw - 1];
  if (!fixture || POSTPONED.has(`${teamCode}-${gw}`)) return 0;
  return getFixtureLegs(fixture).reduce((sum, leg) => {
    const [opp, venue] = String(leg).split('-');
    if (!opp) return sum;
    const rating = getEffectiveRating(opp, venue, ratings, homeAdvantage);
    return sum + (FIXTURE_FACTOR[rating] ?? 1);
  }, 0);
}

// suspension = { gw } uit de spelersdatabank; lineupGw = de speeldag van de gepubliceerde Verwachte
// XI's (of null); lineupSafety = de stip van de speler daarin (of null als hij er niet in staat).
export function startFactorFor({ gw, suspension = null, lineupGw = null, lineupSafety = null } = {}) {
  if (suspension && suspension.gw === gw) return 0;
  if (lineupGw && lineupGw === gw) return SAFETY_FACTOR[lineupSafety] ?? UNKNOWN_START_FACTOR;
  return 1;
}

export function lineupScore({ player, gw, ratings, homeAdvantage, lineupGw = null, lineupSafety = null }) {
  if (!player?.teamCode) return 0;
  const basis = basisScore({
    weeklyPts: player.weekly?.pts ?? null,
    weeklyMin: player.weekly?.min ?? null,
    lastGw: player.apiGw ?? 0,
    seasonPts: player.points ?? 0,
    seasonMatches: player.games ?? 0,
  });
  return basis
    * fixtureFactorFor(player.teamCode, gw, ratings, homeAdvantage)
    * startFactorFor({ gw, suspension: player.suspension, lineupGw, lineupSafety });
}
