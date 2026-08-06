// Past een spelersnaam in een vaste kaartbreedte zonder ooit tekst weg te laten. Eerdere aanpak (JS-
// gebaseerde afkapping met "…") bleek onvoldoende: de gebruiker wil namen ALTIJD volledig zichtbaar,
// en de kaartbreedte moet vast blijven (78px) om het wiskundig gegarandeerde overlapvrije venster voor
// de gedeelde xPercent-coördinaten (LCM/RCM, LCB/RCB — zie formations.js) niet te doorbreken. Oplossing:
// woordafbreking over max. 2 regels, en enkel als dat nog niet past, het lettertype stap voor stap
// verkleinen (tot een leesbare ondergrens) — en als zelfs dat niet volstaat (bv. één extreem lang
// woord zonder spatie), regels op letterniveau afbreken. Elke regel is hierdoor GEGARANDEERD nooit
// breder dan de beschikbare ruimte, en de volledige naam blijft altijd zichtbaar, hoe lang ook.
let measureCanvas = null;
function measureTextWidth(text, font) {
  if (!measureCanvas) measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  ctx.font = font;
  return ctx.measureText(text).width;
}

function splitWordToFit(word, maxWidthPx, font) {
  if (measureTextWidth(word, font) <= maxWidthPx) return [word];
  const parts = [];
  let current = '';
  for (const ch of word) {
    const candidate = current + ch;
    if (measureTextWidth(candidate, font) <= maxWidthPx || !current) {
      current = candidate;
    } else {
      parts.push(current);
      current = ch;
    }
  }
  if (current) parts.push(current);

  // Een greedy split vult regel 1 tot de rand en dumpt de rest op regel 2 — bij een woord dat net over
  // de grens gaat, blijft daar vaak maar één eenzame letter over (bv. "Dejaeger" / "e"). Bij precies 2
  // stukken zoeken we daarom het splitpunt dat beide helften zo gelijk mogelijk breed maakt (nog steeds
  // gegarandeerd elk binnen maxWidthPx), voor een verzorgder tweeregelig resultaat.
  if (parts.length === 2) {
    let best = null;
    let bestDiff = Infinity;
    for (let i = 1; i < word.length; i++) {
      const a = word.slice(0, i);
      const b = word.slice(i);
      const widthA = measureTextWidth(a, font);
      const widthB = measureTextWidth(b, font);
      if (widthA <= maxWidthPx && widthB <= maxWidthPx) {
        const diff = Math.abs(widthA - widthB);
        if (diff < bestDiff) { bestDiff = diff; best = [a, b]; }
      }
    }
    if (best) return best;
  }
  return parts;
}

function computeLines(words, maxWidthPx, font) {
  const lines = [];
  let current = '';
  const pushCurrent = () => { if (current) { lines.push(current); current = ''; } };

  for (const rawWord of words) {
    if (measureTextWidth(rawWord, font) <= maxWidthPx) {
      const candidate = current ? `${current} ${rawWord}` : rawWord;
      if (measureTextWidth(candidate, font) <= maxWidthPx || !current) {
        current = candidate;
      } else {
        pushCurrent();
        current = rawWord;
      }
      continue;
    }
    // Eén woord past zelf niet, zelfs niet op een eigen regel: breek het op letterniveau. De stukken
    // zijn een midden-in-het-woord-breuk, geen woordgrens — nooit met een spatie samenvoegen (dat zou
    // een vreemde spatie MIDDEN in een naam tonen), dus elk stuk krijgt gegarandeerd zijn eigen regel.
    pushCurrent();
    const fragments = splitWordToFit(rawWord, maxWidthPx, font);
    fragments.forEach((fragment, i) => {
      if (i < fragments.length - 1) lines.push(fragment);
      else current = fragment;
    });
  }
  pushCurrent();
  return lines;
}

// Zoekt het grootste lettertype (van maxFontPx tot minFontPx) waarbij de naam in maxLines regels past.
// Lukt dat bij geen enkele grootte, dan wint "volledig zichtbaar" altijd: val terug op minFontPx met
// zoveel regels als nodig (computeLines garandeert sowieso dat geen regel ooit maxWidthPx overschrijdt).
export function fitNameDisplay(name, maxWidthPx, {
  maxFontPx = 13, minFontPx = 9, maxLines = 2, fontWeight = 800, fontFamily = 'sans-serif',
} = {}) {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return { lines: [], fontPx: maxFontPx };

  for (let fontPx = maxFontPx; fontPx >= minFontPx; fontPx--) {
    const font = `${fontWeight} ${fontPx}px ${fontFamily}`;
    const lines = computeLines(words, maxWidthPx, font);
    if (lines.length <= maxLines) return { lines, fontPx };
  }
  const font = `${fontWeight} ${minFontPx}px ${fontFamily}`;
  return { lines: computeLines(words, maxWidthPx, font), fontPx: minFontPx };
}
