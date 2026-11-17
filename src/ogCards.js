// De inhoud van de preview-afbeeldingen ("og-cards") die verschijnen als iemand een link van de site
// deelt op X, WhatsApp, Discord, ... Dit bestand beslist enkel WAT er op een card staat; hoe die
// getekend wordt, staat in scripts/og/render.mjs. Zo blijft dit stuk puur en testbaar
// (src/ogCards.test.js), los van de tekenbibliotheken die enkel bij het bouwen draaien.
import {
  CURRENT_GW, DEFAULT_HOME_ADVANTAGE, DEFAULT_RATINGS, FIXTURES, GW_COUNT, getFixtureInfo,
} from './constants.js';

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
// Hoeveel wedstrijden een speler- en clubcard vooruit toont. Vijf vakken passen naast elkaar en blijven
// op een gsm-voorbeeld nog leesbaar; meer wordt te klein.
export const OG_FIXTURES_AHEAD = 5;

// De volgende wedstrijden van een club, met de standaard-FDR (iemand die de link opent, heeft zijn eigen
// ratings nog niet: de card toont dus wat een nieuwe bezoeker ziet). Elk vak is één van:
//   { gw, kind: 'single', opp, venue, rating }
//   { gw, kind: 'double', legs: [{ opp, venue, rating }, ...] }
//   { gw, kind: 'postponed' }  (uitgesteld)
//   { gw, kind: 'blank' }      (geen wedstrijd)
export function upcomingFixtures(teamCode, startGw = CURRENT_GW, count = OG_FIXTURES_AHEAD) {
  const fixtures = FIXTURES[teamCode] ?? [];
  const cells = [];
  for (let gw = startGw; gw < startGw + count && gw <= GW_COUNT; gw++) {
    const fixture = fixtures[gw - 1];
    if (!fixture) { cells.push({ gw, kind: 'blank' }); continue; }
    const info = getFixtureInfo(teamCode, fixture, gw, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE);
    if (info.isPostponed) cells.push({ gw, kind: 'postponed' });
    else if (info.isDoubleGameweek) {
      cells.push({ gw, kind: 'double', legs: info.legs.map(({ opp, venue, rating }) => ({ opp, venue, rating })) });
    } else cells.push({ gw, kind: 'single', opp: info.opp, venue: info.venue, rating: info.rating });
  }
  return cells;
}

// Prijs zoals de Team Planner hem toont, met een "M" erbij: op een losse afbeelding is "€8.0" zonder
// context minder duidelijk.
export function formatOgPrice(price) {
  const value = Number(price);
  return price != null && price !== '' && Number.isFinite(value) ? `€${value.toFixed(1)}M` : null;
}

// Lettergrootte voor een naam in het smalle, vette titellettertype: zo groot mogelijk (max `max`),
// maar klein genoeg om op één regel in `width` pixels te passen. 0.46 is de gemeten gemiddelde breedte
// van een hoofdletter in dat lettertype (ruim genomen, zodat brede letters als M en W ook passen).
export function fitFontSize(text, { width, max, min = 56, charWidth = 0.46 }) {
  const length = Math.max(1, (text ?? '').length);
  return Math.max(min, Math.min(max, Math.floor(width / (length * charWidth))));
}

// Korte vingerafdruk van de inhoud van een card. Die komt als "?v=..." achter het adres van de
// afbeelding: X en andere platformen bewaren een preview dagenlang per adres. Verandert de card (een
// nieuwe prijs, een volgende speeldag), dan verandert het adres, en tonen ze de nieuwe versie.
export function contentHash(value) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

// Het pad van de afbeelding bij een paginapad: "/fr/speler/clu-x" -> "/og/fr/speler/clu-x.png".
// De startpagina heeft geen eigen paginapad en krijgt "home".
export function ogImagePath(pagePath) {
  return `/og${pagePath}.png`;
}
