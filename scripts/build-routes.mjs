// Genereert per route (zie src/routes.js) een eigen HTML-bestand in dist/, met title/description/
// canonical/og:*/twitter:*-meta-tags die de waarden van díe ene route dragen — i.p.v. altijd de
// generieke FDR-waarden uit index.html. Draait NA `vite build` (zie het "build"-script in
// package.json).
//
// Waarom dit nodig is: title/description/canonical worden in FDRTool.jsx client-side gezet via een
// useEffect (zie de "Documenttitel en meta-description volgen de actieve tab"-toelichting daar).
// Crawlers van social platforms (X, Facebook, ...) voeren geen JavaScript uit, dus die useEffect
// bereikt hen nooit — enkel wat hier statisch in de uitgeleverde HTML staat, telt voor een
// social-preview-kaart. vercel.json rewrit elke route voortaan naar zijn eigen gegenereerde bestand
// i.p.v. altijd naar het generieke index.html.
//
// Geen build-tijd-dependency op een HTML-parser: de tags die we vervangen staan altijd letterlijk en
// op precies deze vorm in index.html (zie de attributen hieronder), dus eenvoudige regex-vervanging
// volstaat en blijft leesbaar. Faalt een vervanging toch (bv. omdat iemand een tag herschrijft), dan
// verandert er simpelweg niets voor die ene tag — geen crash, wel een duidelijke waarschuwing in de
// build-log.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ROUTES } from '../src/routes.js';

const DIST_DIR = fileURLToPath(new URL('../dist', import.meta.url));
const TEMPLATE_PATH = `${DIST_DIR}/index.html`;
const SITE_URL = 'https://fplproleague.vercel.app';

// Minimale HTML-attribuut-escaping — de route-titels/-omschrijvingen bevatten vandaag geen speciale
// tekens, maar dit voorkomt dat een toekomstige route (bv. met een "&" of aanhalingsteken) de
// gegenereerde HTML per ongeluk breekt.
function escapeAttr(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Vervangt de waarde van precies één voorkomen van een tag. `pattern` moet twee capture-groups
// bevatten: het stuk vóór de waarde (openingstag tot en met content=") en het stuk erna (de
// sluitende aanhalingstekens/tag) — de waarde daartussen wordt vervangen.
function replaceTagValue(html, pattern, value, label) {
  if (!pattern.test(html)) {
    console.warn(`  ⚠ tag niet gevonden voor ${label}, overgeslagen`);
    return html;
  }
  return html.replace(pattern, `$1${escapeAttr(value)}$2`);
}

async function buildRoutePage(route) {
  let html = await readFile(TEMPLATE_PATH, 'utf8');
  const canonicalUrl = `${SITE_URL}${route.path}`;

  html = replaceTagValue(html, /(<title>)[^<]*(<\/title>)/, route.title, '<title>');
  html = replaceTagValue(html, /(<meta name="description" content=")[^"]*(")/, route.description, 'meta description');
  html = replaceTagValue(html, /(<link rel="canonical" href=")[^"]*(")/, canonicalUrl, 'canonical');
  html = replaceTagValue(html, /(<meta property="og:title" content=")[^"]*(")/, route.title, 'og:title');
  html = replaceTagValue(html, /(<meta property="og:description" content=")[^"]*(")/, route.description, 'og:description');
  html = replaceTagValue(html, /(<meta property="og:url" content=")[^"]*(")/, canonicalUrl, 'og:url');
  html = replaceTagValue(html, /(<meta name="twitter:title" content=")[^"]*(")/, route.title, 'twitter:title');
  html = replaceTagValue(html, /(<meta name="twitter:description" content=")[^"]*(")/, route.description, 'twitter:description');

  // dist/fdr.html, dist/team-planner.html, ... — route.path begint al met "/", dus enkel ".html" erbij.
  const outPath = `${DIST_DIR}${route.path}.html`;
  await writeFile(outPath, html, 'utf8');
  console.log(`  ${route.path}.html`);
}

console.log(`Route-specifieke social preview-pagina's bouwen (${ROUTES.length} routes)...`);
for (const route of ROUTES) {
  await buildRoutePage(route);
}
console.log('Klaar.');
