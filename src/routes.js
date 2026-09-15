// Eén bron van waarheid voor de tabs én hun URL's.
//
// Waarom: vroeger was de actieve tab enkel `useState('fdr')` in FDRTool.jsx. Daardoor had elk
// onderdeel van de site dezelfde URL ("/"), wat drie concrete problemen gaf:
//   1. Je kon geen link naar een specifieke tool delen — elke link opende de FDR-tab.
//   2. De terugknop van de browser verliet de site i.p.v. naar de vorige tab te gaan (op mobiel is
//      dat de belangrijkste navigatiehandeling die er is).
//   3. Zoekmachines konden maar één pagina indexeren, en élke gedeelde link toonde de FDR-titel als
//      social preview.
//
// Elke tab heeft nu een echt pad (/fdr, /team-planner, ...). Vercel serveert index.html voor die
// paden via de rewrites in vercel.json; de client leest het pad hieronder terug uit.

export const ROUTES = [
  {
    key: 'fdr',
    path: '/fdr',
    label: 'FDR',
    title: 'FDR — Fixture Difficulty Rating | Fantasy Pro League Tools',
    description: 'Interactieve Fixture Difficulty Rating voor alle 18 clubs van de Jupiler Pro League. Pas de ratings aan naar jouw eigen inschatting.',
  },
  {
    key: 'teamplanner',
    path: '/team-planner',
    label: 'Team Planner',
    title: 'Team Planner — plan je transfers | Fantasy Pro League Tools',
    description: 'Stel je 15-koppige selectie samen, plan transfers per gameweek en beheer bank, kapitein en boosters.',
  },
  {
    key: 'predictedlineups',
    path: '/predicted-lineups',
    label: "Verwachte XI's",
    title: 'Predicted Lineups — verwachte opstellingen | Fantasy Pro League Tools',
    description: 'Verwachte basiselftallen voor alle 18 clubs van de Jupiler Pro League, met een duidelijke inschatting van de startkans per speler.',
  },
  {
    key: 'bonuspunten',
    path: '/bonuspunten',
    label: 'Bonuspunten',
    title: 'Bonuspunten — spelersranking | Fantasy Pro League Tools',
    description: 'Ranking van Jupiler Pro League-spelers op bonuspunten, met een zoekbalk om een specifieke speler op te zoeken.',
  },
  {
    key: 'setpieces',
    path: '/set-pieces',
    label: 'Set Pieces',
    title: 'Set Pieces — strafschop-, corner- en vrijetrapnemers | Fantasy Pro League Tools',
    description: 'Huidige strafschop-, corner- en vrijetrapnemers voor elke Belgische Pro League-club.',
  },
  {
    key: 'watchlist',
    path: '/watchlist',
    label: 'Watchlist',
    title: 'Watchlist — volg je spelers | Fantasy Pro League Tools',
    description: 'Houd je favoriete Fantasy Pro League-spelers in de gaten, met hun eerstvolgende fixtures en moeilijkheidsgraad.',
  },
  {
    key: 'kaarten',
    path: '/kaarten',
    label: 'Kaarten',
    title: 'Kaarten — schorsingsrisico | Fantasy Pro League Tools',
    description: 'Gele kaarten per speler en wie het dichtst bij een schorsing zit.',
  },
  {
    key: 'pricechanges',
    path: '/price-changes',
    label: 'Price Changes',
    title: 'Price Changes — prijswijzigingen | Fantasy Pro League Tools',
    description: 'Prijswijzigingen in Fantasy Pro League. In het spel veranderen prijzen pas vanaf gameweek 7.',
  },
];

export const DEFAULT_ROUTE_KEY = 'fdr';

// --- Taal in de URL ---
//
// De NL/FR-toggle veranderde tot nu toe alleen React-state: de URL bleef in beide talen identiek. Dat
// heeft één groot gevolg dat niets met de code te maken heeft — voor een zoekmachine BESTAAT de Franse
// versie dan niet. Er is geen URL om te indexeren, geen hreflang om naar te verwijzen, en geen link om
// te delen die in het Frans opent. In een land waar de helft van de competitie Franstalig is, is dat
// het grootste stuk publiek dat deze site onbenut laat.
//
// Nederlands blijft op de kale paden (/fdr, /team-planner, ...) — geen enkele bestaande link verandert.
// Frans krijgt hetzelfde pad met een /fr-voorvoegsel (/fr/fdr, /fr/team-planner, ...).
export const SUPPORTED_LANGUAGES = ['nl', 'fr'];
export const DEFAULT_ROUTE_LANGUAGE = 'nl';
const LANGUAGE_PREFIX = { nl: '', fr: '/fr' };

export function prefixForLanguage(language) {
  return LANGUAGE_PREFIX[language] ?? '';
}

function normalizePath(pathname) {
  return (pathname || '/').replace(/\/+$/, '') || '/';
}

// Splitst een pad in taal + resterend pad. Onbekende voorvoegsels blijven gewoon deel van het pad en
// vallen dus door naar de bestaande Nederlandse afhandeling.
export function splitLanguageFromPath(pathname) {
  const normalized = normalizePath(pathname);
  if (normalized === '/fr' || normalized.startsWith('/fr/')) {
    return { language: 'fr', path: normalized.slice(3) || '/' };
  }
  return { language: DEFAULT_ROUTE_LANGUAGE, path: normalized };
}

// De taal die bij een URL hoort. Geeft null terug als de URL er niets over zegt (alle Nederlandse
// paden) — de aanroeper mag dan zelf beslissen, bv. op basis van een eerder opgeslagen voorkeur.
export function languageFromPath(pathname) {
  return splitLanguageFromPath(pathname).language === 'fr' ? 'fr' : null;
}

// Pad -> tabsleutel. "/" (en "/fr") vallen terug op de FDR-tab, zodat de bestaande homepage-URL (en
// alle links die daar al naar verwijzen) blijft werken zoals voorheen.
export function routeKeyFromPath(pathname) {
  const { path } = splitLanguageFromPath(pathname);
  if (path === '/') return DEFAULT_ROUTE_KEY;
  const match = ROUTES.find(r => r.path === path);
  return match ? match.key : DEFAULT_ROUTE_KEY;
}

export function routeByKey(key) {
  return ROUTES.find(r => r.key === key) ?? ROUTES[0];
}

// Het pad van een tab in een bepaalde taal, zonder query-string. Gedeeld door de client-side navigatie
// en door scripts/build-routes.mjs, zodat de gegenereerde HTML-bestanden en de links in de app nooit
// uit elkaar kunnen lopen.
export function pathForRoute(key, language = DEFAULT_ROUTE_LANGUAGE) {
  return `${prefixForLanguage(language)}${routeByKey(key).path}`;
}

// Bouwt de volledige URL voor een tab, mét behoud van de bestaande query-parameters. Dat laatste is
// essentieel: de FDR-tab codeert aangepaste ratings in ?r= en thuisvoordeel in ?ha=, en die mogen
// niet verloren gaan wanneer iemand van tab wisselt.
export function urlForRoute(key, search = '', language = DEFAULT_ROUTE_LANGUAGE) {
  return `${pathForRoute(key, language)}${search || ''}`;
}
