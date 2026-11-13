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

// Volgorde = populariteit (spec §6.1). group: 'primary' = de 4 hoofdtools (op gsm elk een eigen plek in
// de onderbalk), 'secondary' = de extra's (op gsm onder "Meer").
// Watchlist en Price Changes zijn weg (spec §6.3): oude links worden doorgestuurd naar Spelers, zie
// LEGACY_ROUTES hieronder en de redirects in vercel.json.
export const ROUTES = [
  {
    key: 'fdr',
    path: '/fdr',
    group: 'primary',
    label: 'FDR',
    title: 'FDR — Fixture Difficulty Rating | Fantasy Pro League Tools',
    description: 'Interactieve Fixture Difficulty Rating voor alle 18 clubs van de Jupiler Pro League. Pas de ratings aan naar jouw eigen inschatting.',
  },
  {
    key: 'predictedlineups',
    path: '/predicted-lineups',
    group: 'primary',
    label: "Verwachte XI's",
    title: 'Predicted Lineups — verwachte opstellingen | Fantasy Pro League Tools',
    description: 'Verwachte basiselftallen voor alle 18 clubs van de Jupiler Pro League, met een duidelijke inschatting van de startkans per speler.',
  },
  {
    key: 'teamplanner',
    path: '/team-planner',
    group: 'primary',
    label: 'Team Planner',
    title: 'Team Planner — plan je transfers | Fantasy Pro League Tools',
    description: 'Stel je 15-koppige selectie samen, plan transfers per gameweek en beheer bank, kapitein en boosters.',
  },
  {
    key: 'spelers',
    path: '/spelers',
    group: 'primary',
    label: 'Spelers',
    title: 'Spelers — database met alle spelers | Fantasy Pro League Tools',
    description: 'Alle Fantasy Pro League-spelers: filter, sorteer en vergelijk op punten, vorm, prijs, bonuspunten en ownership.',
  },
  {
    key: 'bonuspunten',
    path: '/bonuspunten',
    group: 'secondary',
    label: 'Bonuspunten',
    title: 'Bonuspunten — spelersranking | Fantasy Pro League Tools',
    description: 'Ranking van Jupiler Pro League-spelers op bonuspunten, met een zoekbalk om een specifieke speler op te zoeken.',
  },
  {
    key: 'setpieces',
    path: '/set-pieces',
    group: 'secondary',
    label: 'Set pieces',
    title: 'Set Pieces — strafschop-, corner- en vrijetrapnemers | Fantasy Pro League Tools',
    description: 'Huidige strafschop-, corner- en vrijetrapnemers voor elke Belgische Pro League-club.',
  },
  {
    key: 'kaarten',
    path: '/kaarten',
    group: 'secondary',
    label: 'Kaarten',
    title: 'Kaarten — schorsingsrisico | Fantasy Pro League Tools',
    description: 'Gele kaarten per speler en wie het dichtst bij een schorsing zit.',
  },
  {
    key: 'klassement',
    path: '/klassement',
    group: 'secondary',
    label: 'Klassement',
    title: 'Klassement: zoek je team | Fantasy Pro League Tools',
    description: 'Zoek je Fantasy Pro League-team op naam in het algemene of speeldagklassement.',
  },
];

export const PRIMARY_ROUTES = ROUTES.filter(r => r.group === 'primary');
export const SECONDARY_ROUTES = ROUTES.filter(r => r.group === 'secondary');

// Verwijderde tabs (spec §6.3). vercel.json stuurt deze paden al door, maar een geïnstalleerde app of
// een oude cache kan ze nog openen: dan vangt de client ze hier op.
export const LEGACY_ROUTES = {
  '/watchlist': { key: 'spelers', params: { scope: 'watchlist' } },
  '/price-changes': { key: 'spelers', params: {} },
};

// Geeft de nieuwe URL voor een oud pad, of null als het pad gewoon bestaat.
export function legacyRedirectUrl(pathname, search = '') {
  const { language, path } = splitLanguageFromPath(pathname);
  const legacy = LEGACY_ROUTES[path];
  if (!legacy) return null;
  const params = new URLSearchParams(search || '');
  Object.entries(legacy.params).forEach(([k, v]) => params.set(k, v));
  const qs = params.toString();
  return `${pathForRoute(legacy.key, language)}${qs ? `?${qs}` : ''}`;
}

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
// Frans krijgt hetzelfde pad met een /fr-voorvoegsel (/fr/fdr, /fr/team-planner, ...), Engels een
// /en-voorvoegsel (/en/fdr, ...).
export const SUPPORTED_LANGUAGES = ['nl', 'fr', 'en'];
export const DEFAULT_ROUTE_LANGUAGE = 'nl';
const LANGUAGE_PREFIX = { nl: '', fr: '/fr', en: '/en' };

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
  for (const language of SUPPORTED_LANGUAGES) {
    const prefix = LANGUAGE_PREFIX[language];
    if (prefix && (normalized === prefix || normalized.startsWith(`${prefix}/`))) {
      return { language, path: normalized.slice(prefix.length) || '/' };
    }
  }
  return { language: DEFAULT_ROUTE_LANGUAGE, path: normalized };
}

// De taal die bij een URL hoort. Geeft null terug als de URL er niets over zegt (alle Nederlandse
// paden) — de aanroeper mag dan zelf beslissen, bv. op basis van een eerder opgeslagen voorkeur.
export function languageFromPath(pathname) {
  const { language } = splitLanguageFromPath(pathname);
  return language === DEFAULT_ROUTE_LANGUAGE ? null : language;
}

// Pad -> tabsleutel. "/" (en "/fr") vallen terug op de FDR-tab, zodat de bestaande homepage-URL (en
// alle links die daar al naar verwijzen) blijft werken zoals voorheen.
export function routeKeyFromPath(pathname) {
  const { path } = splitLanguageFromPath(pathname);
  if (path === '/') return DEFAULT_ROUTE_KEY;
  const match = ROUTES.find(r => r.path === path);
  if (match) return match.key;
  if (LEGACY_ROUTES[path]) return LEGACY_ROUTES[path].key;
  return DEFAULT_ROUTE_KEY;
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

// Query-parameters die bij één tab horen. Die worden bij het wisselen naar een ándere tab weggelaten,
// zodat bv. de filters van de Spelers-tab niet blijven plakken aan de FDR-URL. Parameters die hier
// niet staan (zoals ?r= en ?ha= van de FDR-ratings) gaan gewoon mee, zoals voorheen.
export const TAB_QUERY_PARAMS = {
  spelers: ['q', 'pos', 'club', 'pmin', 'pmax', 'mins', 'scope', 'per', 'mode', 'cols', 'sort', 'dir', 'compare', 'speler', 'diff'],
  predictedlineups: ['match', 'team', 'view', 'twijfel'],
  klassement: ['team', 'rgw'],
};

export function searchForTab(search, key) {
  const params = new URLSearchParams(search || '');
  // Een parameter die ook bij de doel-tab hoort (bv. 'team' bij Verwachte XI's én Klassement) blijft staan.
  const own = new Set(TAB_QUERY_PARAMS[key] ?? []);
  for (const [tab, keys] of Object.entries(TAB_QUERY_PARAMS)) {
    if (tab !== key) keys.forEach(k => { if (!own.has(k)) params.delete(k); });
  }
  const s = params.toString().replace(/%2C/g, ',');
  return s ? `?${s}` : '';
}

// Bouwt de volledige URL voor een tab, mét behoud van de bestaande query-parameters. Dat laatste is
// essentieel: de FDR-tab codeert aangepaste ratings in ?r= en thuisvoordeel in ?ha=, en die mogen
// niet verloren gaan wanneer iemand van tab wisselt.
export function urlForRoute(key, search = '', language = DEFAULT_ROUTE_LANGUAGE) {
  return `${pathForRoute(key, language)}${search || ''}`;
}

// --- Deelbare detailpagina's (speler en club) ---
//
// De sheets uit PR 3 en 5 hadden geen eigen adres: een spelerskaart kon je enkel beschrijven, niet
// doorsturen. Met een eigen pad wordt zo'n kaart iets wat je op X kan pósten, en gaat de site van acht
// indexeerbare pagina's naar enkele honderden.
//
// De segmenten blijven in beide talen hetzelfde ("/fr/speler/...", niet "/fr/joueur/..."): één
// vertaling minder om uit elkaar te laten lopen, en een gedeelde link blijft herkenbaar wanneer iemand
// hem van taal wisselt.
export const SHEET_SEGMENTS = { player: 'speler', club: 'club' };

// Naam -> URL-veilig stuk pad. Accenten worden hun kale letter ("Doku" en "Dokú" mogen niet twee
// verschillende URL's opleveren), al de rest wordt een koppelteken.
export function slugify(value) {
  return (value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// De clubcode staat vooraan in de slug, niet enkel omdat twee clubs een speler met dezelfde naam
// kunnen hebben, maar ook omdat de slug daardoor zonder spelersdatabank al verraadt over welke club
// het gaat — het build-script kan er zo een pagina voor genereren zonder de live CSV op te halen.
export function playerSlug(name, teamCode) {
  return `${(teamCode ?? '').toLowerCase()}-${slugify(name)}`;
}

export function pathForSheet(sheet, language = DEFAULT_ROUTE_LANGUAGE) {
  const prefix = prefixForLanguage(language);
  if (sheet?.kind === 'club') return `${prefix}/${SHEET_SEGMENTS.club}/${(sheet.code ?? '').toLowerCase()}`;
  if (sheet?.kind === 'player') return `${prefix}/${SHEET_SEGMENTS.player}/${playerSlug(sheet.name, sheet.teamCode)}`;
  return null;
}

// Pad -> welk detailpaneel er hoort te openen. Geeft null voor elk gewoon tab-pad, zodat de bestaande
// afhandeling ongemoeid blijft. De spelersnaam valt niet uit de slug af te leiden (accenten en
// leestekens zijn eruit), dus die wordt hier enkel doorgegeven — de app zoekt hem op.
export function sheetFromPath(pathname) {
  const { path } = splitLanguageFromPath(pathname);
  const [, segment, param] = path.split('/');
  if (!param) return null;
  if (segment === SHEET_SEGMENTS.club) return { kind: 'club', code: param.toUpperCase() };
  if (segment === SHEET_SEGMENTS.player) return { kind: 'player', slug: param.toLowerCase() };
  return null;
}
