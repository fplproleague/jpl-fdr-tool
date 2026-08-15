// Gedeelde stijlconstanten voor de Predicted XI Builder. Kleuren hergebruiken bewust bestaande tokens
// uit ../constants.js (RATING_STYLE) i.p.v. nieuwe hex-waarden te verzinnen — groen/oranje/rood zaten
// daar al klaar voor exact dit doel (moeilijkheidsgraad-kleuren, hier hergebruikt als safety-kleuren).

// Safety-indicator per speler-slot: volledig lokale state (geen databron levert een "starter-kans"),
// door de gebruiker zelf ingesteld via een klik-cyclus op elke kaart. Twee groentinten (RATING_STYLE[1]
// donkergroen/[2] lichtgroen) i.p.v. één, voor fijnere nuance tussen "zeker" en "waarschijnlijk maar
// niet zeker" — 'green' bestond al als opgeslagen waarde (betekende voorheen het volledige
// groen-bereik), dus blijft ongewijzigd bestaan (nu specifiek lichtgroen) i.p.v. een migratie te vereisen
// voor bestaande opgeslagen lineups; enkel 'darkgreen' is nieuw.
export const SAFETY_CYCLE = ['darkgreen', 'green', 'orange', 'red'];

// darkgreen/green zijn bewust NIET meer RATING_STYLE[1]/[2] (die waren te dicht bij elkaar EN te dicht bij
// PITCH_GRADIENT hieronder — RATING_STYLE[1] (#1F7A4D) is zelfs identiek aan de bovenkant van het
// grasverloop, dus die badge verdween daar bijna volledig in de achtergrond). Vervangen door een diep,
// bijna-zwart bosgroen en een helder, verzadigd mintgroen — een veel groter helderheidsverschil, zodat het
// onderscheid "zeker" vs. "waarschijnlijk" in één oogopslag duidelijk is, ook tegen het veld zelf.
export const SAFETY_STYLE = {
  darkgreen: { border: '#065F46', badgeBg: '#065F46', badgeText: '#EAFBF1', label: 'Zekere basisspeler (95-100%)' },
  green: { border: '#34D399', badgeBg: '#34D399', badgeText: '#0B2E1B', label: 'Basisspeler (80-94%)' },
  // RATING_STYLE[4]
  orange: { border: '#E08A3E', badgeBg: '#E08A3E', badgeText: '#2E1500', label: 'Twijfelgeval (40-79%)' },
  // RATING_STYLE[5]
  red: { border: '#C2402C', badgeBg: '#C2402C', badgeText: '#FBEAE7', label: 'Onwaarschijnlijk (0-39%)' },
};

export function nextSafety(current) {
  const index = SAFETY_CYCLE.indexOf(current);
  return SAFETY_CYCLE[(index + 1) % SAFETY_CYCLE.length];
}

// Grasverloop voor het veld — zelfde donkergroen-schaal als RATING_STYLE[1]'s achtergrond, verdiept
// naar onder voor een subtiel 3D-effect.
export const PITCH_GRADIENT = 'linear-gradient(180deg, #1F7A4D 0%, #16532F 100%)';

// Breedte/hoogte-verhouding van het veld (CSS aspect-ratio: width/height). Enige bron van waarheid voor
// zowel PitchField.jsx (de container zelf) als PitchMarkings' SVG-viewBox (zie PitchField.jsx) — zo
// blijven belijning en container gegarandeerd synchroon, ongeacht toekomstige aanpassingen. Een hogere
// waarde (dichter bij 1) = een minder langgerekt, compacter veld. 0.92 is bewust hoger dan de vorige
// '4/5' (0.8): '3/4' (0.75) — de eerder gesuggereerde "compactere" waarde — zou wiskundig net een
// LANGER veld hebben gegeven (aspect-ratio is width/height, dus een lagere waarde = hoger, niet
// compacter), wat het tegenovergestelde van het gevraagde effect was. Empirisch bepaald i.c.m. de
// verticale samendrukking in formations.js — zelf visueel getest.
export const PITCH_ASPECT_RATIO = 0.92;

// Mobiele drempel voor PitchField.jsx/PitchSlot.jsx — zelfde waarde als de bestaande @media
// (max-width: 640px)-conventie elders in de codebase (zie de <style>-blok in FDRTool.jsx). Eén bron van
// waarheid, gebruikt zowel in de geïnjecteerde CSS (@media (max-width: ${MOBILE_BREAKPOINT_PX}px)) als in
// de JS matchMedia-check die bepaalt welke kaartmaten cardLayout.js voor zijn botsingsvrije herberekening
// moet aannemen — zo blijft de pixel-wiskunde altijd exact overeenkomen met wat de CSS werkelijk rendert.
export const MOBILE_BREAKPOINT_PX = 640;

// Extra-smalle drempel, enkel voor het shirt-icoon op speler-kaartjes (zie SHIRT_WIDTH_PX_NARROW in
// cardLayout.js) — bij de smalste ondersteunde telefoons (bv. iPhone SE, ~320-360px) is er fysiek te
// weinig veldhoogte voor een 5-rijen-formatie (bv. 4-2-3-1) om zowel het normale mobiele shirt (28px) als
// een gegarandeerd overlapvrije rij-afstand te combineren — zelf doorgerekend en met Playwright bevestigd.
// Vanaf 375px (alle courante telefoons) is er wél genoeg ruimte, dus enkel dit smalste segment krijgt een
// extra verkleind shirt. Zelfde eén-bron-van-waarheid-opzet als MOBILE_BREAKPOINT_PX hierboven.
export const NARROW_BREAKPOINT_PX = 360;

// Watermerk-tekst, zelfde stijl als de bestaande FDR-export (handleDownloadImage, FDRTool.jsx) — deze
// beelden worden publiek op het @fpl_proleague-account gepost, consistente branding is dus zinvol.
export const WATERMARK_TEXT = '@5YSiebee x @fpl_proleague';
export const WATERMARK_FONT = 'bold 26px Archivo, Arial, sans-serif';
export const WATERMARK_COLOR = '#4ECDC4';
export const EXPORT_BACKGROUND = '#2A1440';
