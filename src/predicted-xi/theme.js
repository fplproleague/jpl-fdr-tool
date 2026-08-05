// Gedeelde stijlconstanten voor de Predicted XI Builder. Kleuren hergebruiken bewust bestaande tokens
// uit ../constants.js (RATING_STYLE) i.p.v. nieuwe hex-waarden te verzinnen — groen/oranje/rood zaten
// daar al klaar voor exact dit doel (moeilijkheidsgraad-kleuren, hier hergebruikt als safety-kleuren).

// Safety-indicator per speler-slot: volledig lokale state (geen databron levert een "starter-kans"),
// door de gebruiker zelf ingesteld via een klik-cyclus op elke kaart.
export const SAFETY_CYCLE = ['green', 'orange', 'red'];

export const SAFETY_STYLE = {
  // RATING_STYLE[1]/[2] uit constants.js
  green: { border: '#1F7A4D', badgeBg: '#5BAE7A', badgeText: '#0B2E1B', label: 'Basisspeler (90-100%)' },
  // RATING_STYLE[4]
  orange: { border: '#E08A3E', badgeBg: '#E08A3E', badgeText: '#2E1500', label: 'Twijfelgeval (50-89%)' },
  // RATING_STYLE[5]
  red: { border: '#C2402C', badgeBg: '#C2402C', badgeText: '#FBEAE7', label: 'Onwaarschijnlijk (0-49%)' },
};

export function nextSafety(current) {
  const index = SAFETY_CYCLE.indexOf(current);
  return SAFETY_CYCLE[(index + 1) % SAFETY_CYCLE.length];
}

// Grasverloop voor het veld — zelfde donkergroen-schaal als RATING_STYLE[1]'s achtergrond, verdiept
// naar onder voor een subtiel 3D-effect.
export const PITCH_GRADIENT = 'linear-gradient(180deg, #1F7A4D 0%, #16532F 100%)';

// Watermerk-tekst, zelfde stijl als de bestaande FDR-export (handleDownloadImage, FDRTool.jsx) — deze
// beelden worden publiek op het @fpl_proleague-account gepost, consistente branding is dus zinvol.
export const WATERMARK_TEXT = 'Siebe x @fpl_proleague';
export const WATERMARK_FONT = 'bold 26px Archivo, Arial, sans-serif';
export const WATERMARK_COLOR = '#4ECDC4';
export const EXPORT_BACKGROUND = '#2A1440';
