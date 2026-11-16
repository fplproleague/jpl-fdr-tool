// Aftraptijden (spec F4), uit /api/kickoffs (de kalender van Fantasy Pro League, zie api/kickoffs.js).
// FDRTool.jsx haalt ze één keer op en geeft een opzoekfunctie door via KickoffContext, zodat elke
// FDR-cel (ook in de clubkaart) en de wedstrijdstrip van de Verwachte XI's ze kunnen tonen. Lukt het
// ophalen niet, of ligt het uur nog niet vast, dan tonen ze gewoon geen tijd.
import { createContext, useContext, useEffect, useState } from 'react';

export const KickoffContext = createContext(null);

// (gw, thuisclub, uitclub) -> Date of null.
export function useKickoffLookup() {
  return useContext(KickoffContext);
}

// Antwoord van /api/kickoffs -> opzoekfunctie. Pure functie (testbaar).
export function buildKickoffLookup(body) {
  const rows = Array.isArray(body?.matches) ? body.matches : [];
  if (rows.length === 0) return null;
  const map = new Map();
  for (const [gw, home, away, kickoff] of rows) {
    const time = Date.parse(kickoff);
    if (Number.isFinite(time)) map.set(`${gw}|${home}|${away}`, new Date(time));
  }
  return (gw, home, away) => map.get(`${gw}|${home}|${away}`) ?? null;
}

let request = null;

export function useKickoffs(enabled = true) {
  const [lookup, setLookup] = useState(null);
  useEffect(() => {
    if (!enabled || lookup) return undefined;
    let alive = true;
    request ??= fetch('/api/kickoffs')
      .then(r => (r.ok ? r.json() : null))
      .then(buildKickoffLookup)
      .catch(() => null);
    request.then(result => { if (alive && result) setLookup(() => result); });
    return () => { alive = false; };
  }, [enabled, lookup]);
  return lookup;
}

const LOCALES = { nl: 'nl-BE', fr: 'fr-BE', en: 'en-GB' };

// "za 21 nov 18:15" (of met withDate=false "za 18:15"), altijd in Belgische tijd.
export function formatKickoff(date, language = 'nl', { withDate = true } = {}) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const locale = LOCALES[language] ?? LOCALES.nl;
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: 'Europe/Brussels', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find(p => p.type === type)?.value?.replace(/\.$/, '') ?? '';
  const time = `${get('hour')}:${get('minute')}`;
  return withDate ? `${get('weekday')} ${get('day')} ${get('month')} ${time}` : `${get('weekday')} ${time}`;
}

// De aftraptijd van één wedstrijd van een club ({ opp, venue: 'H' | 'A' }) in een speeldag, als tekst.
export function kickoffTextFor(lookup, gw, teamCode, opp, venue, language) {
  if (!lookup || !gw || !teamCode || !opp) return null;
  const date = venue === 'H' ? lookup(gw, teamCode, opp) : lookup(gw, opp, teamCode);
  return date ? formatKickoff(date, language) : null;
}

// Chronologisch, wedstrijden zonder gekend uur achteraan (in hun oorspronkelijke volgorde).
// kickoffOf(wedstrijd) -> Date of null.
export function sortByKickoff(matches, kickoffOf) {
  const time = (m) => kickoffOf(m)?.getTime() ?? Infinity;
  return matches.map((m, i) => [m, i]).sort(([a, i], [b, j]) => ((time(a) - time(b)) || (i - j))).map(([m]) => m);
}
