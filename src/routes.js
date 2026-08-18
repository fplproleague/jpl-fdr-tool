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
    label: 'Predicted Lineups',
    title: 'Predicted Lineups — verwachte opstellingen | Fantasy Pro League Tools',
    description: 'Verwachte basiselftallen voor alle 18 clubs van de Jupiler Pro League, met een duidelijke inschatting van de startkans per speler.',
  },
  {
    key: 'watchlist',
    path: '/watchlist',
    label: 'Watchlist',
    title: 'Watchlist — volg je spelers | Fantasy Pro League Tools',
    description: 'Houd je favoriete Fantasy Pro League-spelers in de gaten, met hun eerstvolgende fixtures en moeilijkheidsgraad.',
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

// Pad -> tabsleutel. "/" valt terug op de FDR-tab, zodat de bestaande homepage-URL (en alle links die
// daar al naar verwijzen) blijft werken zoals voorheen.
export function routeKeyFromPath(pathname) {
  const normalized = (pathname || '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') return DEFAULT_ROUTE_KEY;
  const match = ROUTES.find(r => r.path === normalized);
  return match ? match.key : DEFAULT_ROUTE_KEY;
}

export function routeByKey(key) {
  return ROUTES.find(r => r.key === key) ?? ROUTES[0];
}

// Bouwt de volledige URL voor een tab, mét behoud van de bestaande query-parameters. Dat laatste is
// essentieel: de FDR-tab codeert aangepaste ratings in ?r= en thuisvoordeel in ?ha=, en die mogen
// niet verloren gaan wanneer iemand van tab wisselt.
export function urlForRoute(key, search = '') {
  return `${routeByKey(key).path}${search || ''}`;
}
