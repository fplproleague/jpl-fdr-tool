// Kapt een spelersnaam af tot ze past binnen een vaste pixelbreedte, met een écht "…"-teken als
// onderdeel van de teruggegeven string. Bewust GEEN CSS text-overflow:ellipsis: html2canvas rasterizeert
// dat pseudo-element niet betrouwbaar (zelf getest — de tekst werd hard afgekapt zonder zichtbare "…" op
// de geëxporteerde PNG). Door hier zelf te meten (canvas measureText, dezelfde 800-gewicht/13px-stijl als
// de kaartnaam) en de "…" als gewone tekst toe te voegen, is het resultaat gegarandeerd identiek in de
// live weergave én de export.
let measureCanvas = null;
function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

export function truncateToFit(text, maxWidthPx, font = '800 13px sans-serif') {
  if (!text || measureTextWidth(text, font) <= maxWidthPx) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measureTextWidth(`${text.slice(0, mid)}…`, font) <= maxWidthPx) lo = mid;
    else hi = mid - 1;
  }
  return `${text.slice(0, lo)}…`;
}
