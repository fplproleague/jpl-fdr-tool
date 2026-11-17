// Tekent de preview-afbeeldingen (1200x630 PNG) bij het bouwen van de site. Wat er op een card staat,
// komt uit src/ogCards.js; dit bestand zet dat om in een afbeelding.
//
// Hoe: satori zet een opmaak (dezelfde flexbox-regels als CSS) om in een SVG, met de letters als
// vormen; resvg zet die SVG om in een PNG. Beide draaien enkel tijdens `npm run build`, niets ervan
// komt op de site zelf.
//
// Kleuren en lettertypes volgen docs/redesign/DESIGN_SPEC.md §3: het logopalet (petrol + aqua),
// Archivo (smal en vet voor titels) en Martian Mono voor cijfers. De FDR-kleuren komen uit
// RATING_STYLE, net als op de site. De lettertypes staan als bestand in scripts/og/fonts/ (vrije
// licentie, zie de OFL-bestanden daar); clublogo's als PNG in scripts/og/club-logos/, omdat resvg
// geen WebP kan lezen. Komt er een club bij, zet dan ook daar zijn logo als PNG (96x96).
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { RATING_STYLE } from '../../src/constants.js';
import { OG_HEIGHT, OG_WIDTH, fitFontSize } from '../../src/ogCards.js';

const here = path => fileURLToPath(new URL(path, import.meta.url));

const C = {
  ink0: '#061B1C', ink1: '#09282A', ink2: '#0F3231', line: '#24514F',
  text1: '#EEF5F2', text2: '#B4C7C2', text3: '#8AA5A0', accent: '#33EDD5',
};

const FONTS = [
  { name: 'Archivo', file: 'Archivo-Medium.ttf', weight: 500 },
  { name: 'Archivo', file: 'Archivo-Bold.ttf', weight: 700 },
  { name: 'Archivo Condensed', file: 'ArchivoExtraCondensed-ExtraBold.ttf', weight: 800 },
  { name: 'Martian Mono', file: 'MartianMono-SemiBold.ttf', weight: 600 },
].map(f => ({ name: f.name, weight: f.weight, style: 'normal', data: readFileSync(here(`./fonts/${f.file}`)) }));

const dataUri = file => `data:image/png;base64,${readFileSync(file).toString('base64')}`;
const LOGO_MARK = dataUri(here('../../public/app-icon-mark.png'));
const clubLogos = new Map();
function clubLogo(code) {
  if (!clubLogos.has(code)) {
    const file = here(`./club-logos/${code}.png`);
    if (!existsSync(file)) console.warn(`  ⚠ geen clublogo voor ${code} in scripts/og/club-logos/`);
    clubLogos.set(code, existsSync(file) ? dataUri(file) : null);
  }
  return clubLogos.get(code);
}

// Kleine hulp om de opmaak leesbaar te schrijven zonder JSX: h('div', { ...stijl }, kinderen).
function h(type, style = {}, children = [], extra = {}) {
  const kids = (Array.isArray(children) ? children : [children]).filter(c => c !== null && c !== false && c !== undefined);
  return { type, props: { style: { display: 'flex', ...style }, ...extra, children: kids.length === 1 ? kids[0] : kids } };
}
const img = (src, size, style = {}) => ({ type: 'img', props: { src, width: size, height: size, style } });

const PAD_X = 64;
const INNER = OG_WIDTH - 2 * PAD_X;

// Bovenrand van elke card: het logo, de naam van de site en het X-account.
function header() {
  return h('div', { alignItems: 'center', width: '100%' }, [
    img(LOGO_MARK, 64, { borderRadius: 2 }),
    h('div', { marginLeft: 20, fontFamily: 'Archivo', fontWeight: 700, fontSize: 26, letterSpacing: 2, color: C.text2 }, 'FANTASY PRO LEAGUE TOOLS'),
    h('div', { marginLeft: 'auto', fontFamily: 'Archivo', fontWeight: 500, fontSize: 26, color: C.text3 }, '@fpl_proleague'),
  ]);
}

const PAD_TOP = 52;
const PAD_BOTTOM = 56;

// De volledige card: petrol achtergrond, binnenin een vlak met vaste maten (zo kan niets over de rand).
function frame(children) {
  return h('div', {
    width: OG_WIDTH, height: OG_HEIGHT, background: C.ink0, color: C.text1,
    paddingTop: PAD_TOP, paddingLeft: PAD_X,
  }, h('div', {
    width: INNER, height: OG_HEIGHT - PAD_TOP - PAD_BOTTOM, flexDirection: 'column',
  }, [header(), ...children]));
}

const urlLine = url => h('div', { fontFamily: 'Martian Mono', fontWeight: 600, fontSize: 24, color: C.accent }, url);

// De vijf FDR-kleuren als schaal (enkel op de startpagina- en FDR-card).
function fdrScale() {
  return h('div', { gap: 6 }, [1, 2, 3, 4, 5].map(r => h('div', {
    width: 52, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 2,
    background: RATING_STYLE[r].bg, color: RATING_STYLE[r].text, fontFamily: 'Martian Mono', fontWeight: 600, fontSize: 24,
  }, String(r))));
}

// Card voor de startpagina en elke tab: grote titel, één zin uitleg, onderaan het adres.
export function routeCard({ title, tagline, url, showScale = false }) {
  const size = fitFontSize(title, { width: INNER, max: 168, min: 96 });
  return frame([
    h('div', { flexDirection: 'column', justifyContent: 'center', flexGrow: 1 }, [
      h('div', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: size, lineHeight: 1, letterSpacing: -1, textTransform: 'uppercase' }, title),
      h('div', { marginTop: 28, maxWidth: INNER, fontFamily: 'Archivo', fontWeight: 500, fontSize: 38, lineHeight: 1.3, color: C.text2 }, tagline),
    ]),
    h('div', { alignItems: 'center', justifyContent: 'space-between', width: '100%' }, [urlLine(url), showScale ? fdrScale() : null]),
  ]);
}

const CELL_GAP = 12;
const CELL_W = Math.floor((INNER - 4 * CELL_GAP) / 5);
const CELL_H = 92;

function fixtureCell(cell, gwLabel) {
  let body;
  if (cell.kind === 'single' || cell.kind === 'double') {
    const legs = cell.kind === 'single' ? [cell] : cell.legs;
    const small = legs.length > 1;
    body = h('div', { flexDirection: 'column', width: CELL_W, height: CELL_H, gap: small ? 2 : 0 }, legs.map(leg => h('div', {
      flexGrow: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 2,
      background: RATING_STYLE[leg.rating].bg, color: RATING_STYLE[leg.rating].text,
    }, [
      h('div', { fontFamily: 'Archivo', fontWeight: 700, fontSize: small ? 26 : 40 }, leg.opp),
      h('div', { marginLeft: 8, fontFamily: 'Archivo', fontWeight: 500, fontSize: small ? 18 : 24, opacity: 0.85 }, leg.venue),
    ])));
  } else {
    // Uitgesteld of geen wedstrijd: een leeg vak met een streep, zoals op de site.
    body = h('div', {
      width: CELL_W, height: CELL_H, alignItems: 'center', justifyContent: 'center', borderRadius: 2,
      background: C.ink2, color: C.text3, fontFamily: 'Archivo', fontWeight: 700, fontSize: 40,
    }, cell.kind === 'postponed' ? '/' : '—');
  }
  return h('div', { flexDirection: 'column', alignItems: 'center' }, [
    h('div', { marginBottom: 8, fontFamily: 'Martian Mono', fontWeight: 600, fontSize: 20, color: C.text3 }, `${gwLabel}${cell.gw}`),
    body,
  ]);
}

function fixturesRow(cells, { heading, gwLabel }) {
  return h('div', { flexDirection: 'column', width: '100%' }, [
    h('div', { marginBottom: 10, fontFamily: 'Archivo', fontWeight: 700, fontSize: 20, letterSpacing: 2, color: C.text3, textTransform: 'uppercase' }, heading),
    h('div', { gap: CELL_GAP }, cells.map(cell => fixtureCell(cell, gwLabel))),
  ]);
}

// Card voor een speler: club en positie, naam, prijs en de volgende wedstrijden van zijn club.
export function playerCard({ name, clubCode, clubName, position, price, fixtures, labels }) {
  const logo = clubLogo(clubCode);
  const meta = [clubName, position].filter(Boolean).join(' · ');
  const nameWidth = price ? INNER - 260 : INNER;
  const size = fitFontSize(name, { width: nameWidth, max: 150, min: 72 });
  return frame([
    h('div', { flexDirection: 'column', justifyContent: 'center', flexGrow: 1 }, [
      h('div', { alignItems: 'center' }, [
        logo ? img(logo, 56, { marginRight: 16 }) : null,
        h('div', { fontFamily: 'Archivo', fontWeight: 700, fontSize: 32, letterSpacing: 1, color: C.text2, textTransform: 'uppercase' }, meta),
      ]),
      h('div', { alignItems: 'flex-end', justifyContent: 'space-between', width: '100%', marginTop: 6 }, [
        h('div', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -1, textTransform: 'uppercase' }, name),
        price ? h('div', { marginBottom: 14, fontFamily: 'Martian Mono', fontWeight: 600, fontSize: 60, color: C.accent }, price) : null,
      ]),
    ]),
    fixturesRow(fixtures, labels),
  ]);
}

// Card voor een club: logo, naam, wat je op de clubpagina vindt en de volgende wedstrijden.
export function clubCard({ clubCode, clubName, tagline, fixtures, labels }) {
  const logo = clubLogo(clubCode);
  const size = fitFontSize(clubName, { width: INNER - (logo ? 140 : 0), max: 140, min: 72 });
  return frame([
    h('div', { alignItems: 'center', flexGrow: 1 }, [
      logo ? img(logo, 112, { marginRight: 28 }) : null,
      h('div', { flexDirection: 'column' }, [
        h('div', { fontFamily: 'Archivo Condensed', fontWeight: 800, fontSize: size, lineHeight: 1.05, letterSpacing: -1, textTransform: 'uppercase' }, clubName),
        h('div', { marginTop: 4, fontFamily: 'Archivo', fontWeight: 500, fontSize: 32, color: C.text2 }, tagline),
      ]),
    ]),
    fixturesRow(fixtures, labels),
  ]);
}

export async function renderPng(element) {
  const svg = await satori(element, { width: OG_WIDTH, height: OG_HEIGHT, fonts: FONTS });
  // Satori zet alle tekst al om in vormen, dus resvg heeft geen lettertypes nodig. Ze toch laden (de
  // standaard) kost per afbeelding een volle zoektocht door de lettertypes van de computer: tot 20 keer
  // trager.
  return new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH }, font: { loadSystemFonts: false } }).render().asPng();
}
