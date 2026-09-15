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
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROUTES, SUPPORTED_LANGUAGES, DEFAULT_ROUTE_LANGUAGE, pathForRoute } from '../src/routes.js';
import { t } from '../src/i18n.js';

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

// hreflang-blok voor één route: elke taalversie verwijst naar zichzelf én naar de andere, plus een
// x-default. Zonder deze tags weet Google niet dat /fdr en /fr/fdr dezelfde pagina in twee talen zijn en
// behandelt het ze als concurrerende, bijna-identieke URL's.
function buildAlternateLinks(route) {
  const hreflangByLanguage = { nl: 'nl-BE', fr: 'fr-BE' };
  const links = SUPPORTED_LANGUAGES.map(language =>
    `    <link rel="alternate" hreflang="${hreflangByLanguage[language]}" href="${SITE_URL}${pathForRoute(route.key, language)}" />`
  );
  // x-default = wat een bezoeker krijgt als geen enkele taal past. Nederlands is de oorspronkelijke en
  // volledigste versie van de site.
  links.push(`    <link rel="alternate" hreflang="x-default" href="${SITE_URL}${pathForRoute(route.key, DEFAULT_ROUTE_LANGUAGE)}" />`);
  return links.join('\n');
}

async function buildRoutePage(route, language) {
  let html = await readFile(TEMPLATE_PATH, 'utf8');
  const routePath = pathForRoute(route.key, language);
  const canonicalUrl = `${SITE_URL}${routePath}`;
  // Titels/omschrijvingen komen uit src/i18n.js i.p.v. uit routes.js: die staan daar al in beide talen,
  // en zo is er één bron voor zowel de statische HTML hier als de client-side useEffect in FDRTool.jsx.
  const title = t(language, `route.${route.key}.title`);
  const description = t(language, `route.${route.key}.description`);
  const ogLocale = language === 'fr' ? 'fr_BE' : 'nl_BE';

  html = replaceTagValue(html, /(<html lang=")[^"]*(")/, language, '<html lang>');
  html = replaceTagValue(html, /(<title>)[^<]*(<\/title>)/, title, '<title>');
  html = replaceTagValue(html, /(<meta name="description" content=")[^"]*(")/, description, 'meta description');
  html = replaceTagValue(html, /(<link rel="canonical" href=")[^"]*(")/, canonicalUrl, 'canonical');
  html = replaceTagValue(html, /(<meta property="og:title" content=")[^"]*(")/, title, 'og:title');
  html = replaceTagValue(html, /(<meta property="og:description" content=")[^"]*(")/, description, 'og:description');
  html = replaceTagValue(html, /(<meta property="og:url" content=")[^"]*(")/, canonicalUrl, 'og:url');
  html = replaceTagValue(html, /(<meta property="og:locale" content=")[^"]*(")/, ogLocale, 'og:locale');
  html = replaceTagValue(html, /(<meta name="twitter:title" content=")[^"]*(")/, title, 'twitter:title');
  html = replaceTagValue(html, /(<meta name="twitter:description" content=")[^"]*(")/, description, 'twitter:description');

  // De hreflang-tags staan niet in index.html (ze verschillen per route), dus hier ingevoegd vlak vóór
  // </head> i.p.v. vervangen.
  html = html.replace('  </head>', `${buildAlternateLinks(route)}\n  </head>`);

  // dist/fdr.html, dist/fr/fdr.html, ... — routePath begint al met "/", dus enkel ".html" erbij.
  const outPath = `${DIST_DIR}${routePath}.html`;
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, html, 'utf8');
  console.log(`  ${routePath}.html`);
}

// De sitemap werd tot nu toe met de hand bijgehouden in public/sitemap.xml. Dat liep onvermijdelijk uit
// de pas: /bonuspunten, /set-pieces en /kaarten stonden er niet in, dus drie van de acht tools vroegen
// nooit om geïndexeerd te worden. Nu afgeleid uit exact dezelfde ROUTES-lijst die de tabbalk en de
// rewrites voedt — een nieuwe tool toevoegen kan niet meer betekenen dat je de sitemap vergeet.
//
// Wat er bewust NIET in staat: "/". Dat pad serveert dezelfde inhoud als /fdr en verwijst met z'n
// canonical ook naar /fdr. Het als aparte URL indienen is Google twee tegenstrijdige signalen geven
// ("indexeer dit" + "nee, indexeer dat andere").
//
// changefreq/priority zijn weggelaten: Google negeert beide al jaren. <lastmod> gebruikt het wél, en
// de build-datum is hier de eerlijke waarde — een deploy is precies het moment waarop de inhoud
// verandert.
async function buildSitemap() {
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = SUPPORTED_LANGUAGES.flatMap(language => ROUTES.map(route => `  <url>
    <loc>${SITE_URL}${pathForRoute(route.key, language)}</loc>
    <lastmod>${lastmod}</lastmod>
  </url>`)).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Gegenereerd door scripts/build-routes.mjs uit src/routes.js — niet met de hand bewerken. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  await writeFile(`${DIST_DIR}/sitemap.xml`, xml, 'utf8');
  console.log(`  sitemap.xml (${ROUTES.length * SUPPORTED_LANGUAGES.length} URL's)`);
}

console.log(`Route-specifieke social preview-pagina's bouwen (${ROUTES.length} routes x ${SUPPORTED_LANGUAGES.length} talen)...`);
for (const language of SUPPORTED_LANGUAGES) {
  for (const route of ROUTES) {
    await buildRoutePage(route, language);
  }
}
await buildSitemap();
console.log('Klaar.');
