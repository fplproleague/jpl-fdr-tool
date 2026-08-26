// Gedeelde referentiedata en helper-functies voor de FDR-tool: teams, fixtures, uitgestelde
// wedstrijden, rating-kleuren, en de fixture-rekenlogica die zowel de hoofdtabel (FDRTab) als de
// mini-fixture-badges (MiniFixtureBadge, gebruikt door FDRTab én WatchlistTab) nodig hebben.
// Bevat bewust GEEN JSX (zie gwHeaderCells/gwOptionElements in FDRTool.jsx/FDRTab.jsx) — dit is een
// plain .js-bestand en Vite/esbuild parsen JSX-syntax enkel in .jsx-bestanden.

export const TEAMS = [
  { code: 'AND', name: 'Anderlecht' },
  { code: 'ANT', name: 'Antwerp' },
  { code: 'BEV', name: 'SK Beveren' },
  { code: 'CER', name: 'Cercle Brugge' },
  { code: 'CHA', name: 'Charleroi' },
  { code: 'CLU', name: 'Club Brugge' },
  { code: 'GNK', name: 'Genk' },
  { code: 'GNT', name: 'Gent' },
  { code: 'KOR', name: 'KV Kortrijk' },
  { code: 'KVM', name: 'KV Mechelen' },
  { code: 'LLV', name: 'RAAL La Louvière' },
  { code: 'LOM', name: 'Lommel SK' },
  { code: 'OHL', name: 'OH Leuven' },
  { code: 'STA', name: 'Standard' },
  { code: 'STV', name: 'Sint-Truiden' },
  { code: 'USG', name: 'Union SG' },
  { code: 'WES', name: 'Westerlo' },
  { code: 'ZWA', name: 'Zulte Waregem' },
];

export const FIXTURES = {
  // AND-KOR (GW3) is door de Europese voorrondes uitgesteld naar GW4, waar het een dubbele speeldag
  // (DGW) wordt naast de oorspronkelijke GW4-tegenstander. De GW3-cel zelf blijft hieronder ongewijzigd
  // staan (nog altijd 'KOR-H'/'AND-A') — die rendert als "/" doordat de key in POSTPONED zit, zie verderop.
  AND: ['LLV-H','BEV-A','KOR-H', ['USG-A','KOR-H'], 'GNK-H','KVM-A','ZWA-H','CER-A'],
  ANT: ['BEV-H','KOR-A','GNK-H','STV-H','STA-A','CLU-A','USG-H','WES-A'],
  CER: ['STA-A','STV-H','CLU-A','LOM-H','GNT-H','OHL-A','CHA-A','AND-H'],
  CHA: ['OHL-H','LOM-A','KVM-H','KOR-A','USG-H','ZWA-A','CER-H','STA-A'],
  CLU: ['KOR-H','OHL-A','CER-H','GNT-A','LOM-A','ANT-H','GNK-H','LLV-A'],
  GNK: ['ZWA-A','WES-H','ANT-A','BEV-H','AND-A','GNT-H','CLU-A','KOR-H'],
  // GNT-OHL (GW3) is definitief uitgesteld naar GW4 (3 september) — zelfde patroon als AND-KOR hierboven.
  GNT: ['KVM-H','LLV-A','OHL-H', ['CLU-H','OHL-H'], 'CER-A','GNK-A','STA-H','ZWA-A'],
  KOR: ['CLU-A','ANT-H','AND-A', ['CHA-H','AND-A'], 'ZWA-H','LLV-A','BEV-H','GNK-A'],
  KVM: ['GNT-A','STA-H','CHA-A','LLV-A','WES-H','AND-H','LOM-A','STV-H'],
  LOM: ['STV-A','CHA-H','WES-H','CER-A','CLU-H','USG-A','KVM-H','BEV-A'],
  OHL: ['CHA-A','CLU-H','GNT-A', ['STA-H','GNT-A'], 'BEV-A','CER-H','LLV-H','USG-A'],
  LLV: ['AND-A','GNT-H','STA-A','KVM-H','STV-A','KOR-H','OHL-A','CLU-H'],
  BEV: ['ANT-A','AND-H','ZWA-A','GNK-A','OHL-H','STV-H','KOR-A','LOM-H'],
  // GW4 (index 3) is voor STV en USG een dubbele speeldag (DGW): zie isDoubleGameweek() hieronder.
  STV: ['LOM-H','CER-A','USG-H', ['ANT-A','USG-H'], 'LLV-H','BEV-A','WES-H','KVM-A'],
  STA: ['CER-H','KVM-A','LLV-H','OHL-A','ANT-H','WES-A','GNT-A','CHA-H'],
  USG: ['WES-A','ZWA-H','STV-A', ['AND-H','STV-A'], 'CHA-A','LOM-H','ANT-A','OHL-H'],
  WES: ['USG-H','GNK-A','LOM-A','ZWA-H','KVM-A','STA-H','STV-A','ANT-H'],
  ZWA: ['GNK-H','USG-A','BEV-H','WES-A','KOR-A','CHA-H','AND-A','GNT-H'],
};

// Een fixture-entry in FIXTURES is normaal een string ("OPP-VENUE" — één wedstrijd). Voor een dubbele
// speeldag (DGW) is diezelfde positie in plaats daarvan een ARRAY van zulke strings, bv. ['ANT-A','USG-H'].
// Dit zijn de enige twee plekken die dat onderscheid maken — alle andere code roept isDoubleGameweek()/
// getFixtureLegs() aan i.p.v. zelf te controleren of iets een array is. Om een nieuwe DGW toe te voegen:
// vervang de betreffende FIXTURES-positie door een array van 2+ "OPP-VENUE"-strings, verder niets.
export function isDoubleGameweek(fixtureEntry) {
  return Array.isArray(fixtureEntry);
}

// Normaliseert een fixture-entry naar een array van "OPP-VENUE"-strings: [fixture] voor een enkele
// speeldag, of de array zelf voor een DGW. Zo kan alle downstream-code (getFixtureInfo, getFixtureScores)
// hetzelfde .map()-patroon gebruiken ongeacht of het om 1 of meerdere wedstrijden gaat.
export function getFixtureLegs(fixtureEntry) {
  return isDoubleGameweek(fixtureEntry) ? fixtureEntry : [fixtureEntry];
}

export const POSTPONED = new Set([
  'STV-3', // Sint-Truiden vs Union SG, GW3 — uitgesteld naar 2 september
  'USG-3', // Union SG vs Sint-Truiden, GW3 — uitgesteld naar 2 september
  'AND-3', // Anderlecht vs Kortrijk, GW3 — uitgesteld naar 3 september (Europese voorrondes)
  'KOR-3', // Kortrijk vs Anderlecht, GW3 — uitgesteld naar 3 september (Europese voorrondes)
  'GNT-3', // Gent vs OH Leuven, GW3 — uitgesteld naar 3 september (Europese voorrondes)
  'OHL-3', // OH Leuven vs Gent, GW3 — uitgesteld naar 3 september (Europese voorrondes)
]);
// Datum waarnaar uitgestelde wedstrijden verplaatst zijn, per teamcode-onafhankelijke (gesorteerde)
// paar-key — niet elke POSTPONED-wedstrijd valt op dezelfde datum.
export const POSTPONED_DATES = {
  'STV-USG': '2 september',
  'AND-KOR': '3 september',
  'GNT-OHL': '3 september',
};

// Nog niet zeker uitgesteld — kan verschuiven afhankelijk van Europese kwalificatie. Zelfde key-structuur als POSTPONED.
export const POSSIBLY_POSTPONED = new Set([
  'USG-6', // Union SG vs Lommel, GW6 — afhankelijk van Europees programma Union SG
  'LOM-6', // Lommel vs Union SG, GW6 — afhankelijk van Europees programma Union SG
]);

// Eén reden per wedstrijd, opgezocht via een teamcode-onafhankelijke (gesorteerde) paar-key.
export const POSSIBLY_POSTPONED_REASONS = {
  'LOM-USG': "mogelijk uitgesteld afhankelijk van Union SG's Europees programma",
};

export const DEFAULT_RATINGS = {
  LOM: 1, KOR: 1, BEV: 1,
  ZWA: 3, OHL: 2, CER: 2, LLV: 1,
  STA: 3, KVM: 3, WES: 3, CHA: 3, ANT: 3, STV: 3,
  GNK: 4, AND: 4, GNT: 4,
  USG: 5, CLU: 5,
};

// Thuisvoordeel staat standaard overal uit — per team aan/uit-schakelbaar, los van de sterkte-rating zelf.
export const DEFAULT_HOME_ADVANTAGE = Object.fromEntries(TEAMS.map(t => [t.code, false]));

export const RATING_STYLE = {
  1: { bg: '#1F7A4D', text: '#EAFBF1', label: 'Makkelijkst' },
  2: { bg: '#5BAE7A', text: '#0B2E1B', label: 'Makkelijk' },
  3: { bg: '#E8C547', text: '#3D2E00', label: 'Gemiddeld' },
  4: { bg: '#E08A3E', text: '#2E1500', label: 'Moeilijk' },
  // Wit i.p.v. het vroegere #FBEAE7: dat haalde maar 4.44:1 op deze rode achtergrond en zakte
  // daarmee net onder de WCAG AA-drempel (4.5:1) voor de kleine celtekst. #FFFFFF geeft 5.17:1.
  5: { bg: '#C2402C', text: '#FFFFFF', label: 'Moeilijkst' },
};

export const GW_COUNT = 8;
// Standaard-eindpunt van de GW-horizon in de hoofdtabel: alle spelers krijgen na deze speeldag
// onbeperkte gratis transfers, waardoor latere GW's minder relevant zijn bij het opstellen van het
// eerste team. Gebruikers kunnen dit zelf nog verruimen tot GW_COUNT via de selector.
export const DEFAULT_GW_HORIZON_END = 7;
// Min-width van de hoofdtabel bij de volledige GW1-GW_COUNT-breedte — referentiewaarde waar
// mainTableMinWidth (zie FDRTool) evenredig van afschaalt bij een kleinere horizon.
export const MAIN_TABLE_MIN_WIDTH_FOR_ALL_GWS = 760;
export const MINILEAGUE_CODE = '19WN75';
export const LAST_UPDATED = '24 augustus 2026';

// Code voor de PERSOONLIJKE Fantasy Premier League-minileague (het echte, Engelse FPL-spel) — los van
// MINILEAGUE_CODE hierboven, dat is voor DEZE site (Fantasy Pro League, de Belgische competitie). Wordt
// getoond in de eenmalige PL-popup en tijdelijk op het startscherm (zie showPLMinileaguePopup in
// FDRTool.jsx) rond de start van het Premier League-seizoen. Tijdelijke content: mag weg na de hype.
export const PL_MINILEAGUE_CODE = 'slogga';

// --- Gameweek-deadlines (enige handmatig bij te werken bron van waarheid voor "waar staan we") ---
//
// ISO-8601 mét expliciete offset (+02:00 = CEST, geldig voor augustus/september 2026). Eén échte
// datum per GW i.p.v. een kant-en-klare tekst: daaruit leiden we nu zowel de weergavestring
// (formatGwDeadline) als de "huidige" gameweek (CURRENT_GW) én de aftelklok in de header af. Vroeger
// stonden CURRENT_GW en de deadline-teksten als aparte, handmatig te synchroniseren constanten —
// precies daardoor kon de site "GW3" tonen terwijl een ander onderdeel nog op GW2 stond. Werk enkel
// dit object bij; al de rest volgt vanzelf.
//
// GW8 heeft (nog) geen bekende deadline: null i.p.v. een lege string, zodat "onbekend" expliciet is.
export const GW_DEADLINE_ISO = {
  1: '2026-08-07T20:45:00+02:00',
  2: '2026-08-14T20:45:00+02:00',
  3: '2026-08-21T20:45:00+02:00',
  4: '2026-08-28T20:45:00+02:00',
  5: '2026-09-04T20:45:00+02:00',
  6: '2026-09-11T20:45:00+02:00',
  7: '2026-09-18T20:45:00+02:00',
  8: null,
};

// Deadlines worden ALTIJD in Belgische tijd getoond, ongeacht waar de bezoeker zit. Een Fantasy Pro
// League-deadline is nu eenmaal een Belgisch tijdstip; iemand die vanuit een andere tijdzone kijkt
// heeft niets aan een omgerekende klok en zou een afwijkende tijd als een fout lezen. De aftelklok
// zelf is een tijdsduur en dus sowieso tijdzone-onafhankelijk.
const BELGIAN_TIME_ZONE = 'Europe/Brussels';

const deadlineFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: BELGIAN_TIME_ZONE,
  weekday: 'long', day: '2-digit', month: 'long',
  hour: '2-digit', minute: '2-digit', hour12: false,
});

// Geeft de Date van een GW-deadline, of null als die niet gekend is (GW8).
export function getGwDeadlineDate(gw) {
  const iso = GW_DEADLINE_ISO[gw];
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Nederlandse weergavestring ("vrijdag 21 augustus 20:45"), afgeleid uit de echte datum i.p.v.
// handmatig getypt. formatToParts i.p.v. format(): de exacte volgorde en scheidingstekens van de
// nl-BE-locale liggen niet vast tussen browsers/versies, en we willen precies dezelfde tekst als
// vroeger — niet "vrijdag 21 augustus om 20:45" of een variant met komma's.
export function formatGwDeadline(gw) {
  const date = getGwDeadlineDate(gw);
  if (!date) return '';
  const parts = Object.fromEntries(
    deadlineFormatter.formatToParts(date)
      .filter(p => p.type !== 'literal')
      .map(p => [p.type, p.value])
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.hour}:${parts.minute}`;
}

// De eerste GW waarvan de deadline nog niet verstreken is — dát is de gameweek waar een bezoeker mee
// bezig is. Valt terug op GW_COUNT zodra alle gekende deadlines voorbij zijn. `now` is injecteerbaar
// zodat dit testbaar is en niet stiekem van de systeemklok afhangt.
export function resolveCurrentGw(now = new Date()) {
  for (let gw = 1; gw <= GW_COUNT; gw++) {
    const deadline = getGwDeadlineDate(gw);
    if (deadline && deadline.getTime() > now.getTime()) return gw;
  }
  return GW_COUNT;
}

// Afgeleid i.p.v. handmatig ingesteld (zie resolveCurrentGw hierboven). Wordt één keer bij het laden
// van de module berekend — ruim genoeg voor een sessie, en de aftelklok in de header hertelt sowieso
// elke seconde zelf.
export const CURRENT_GW = resolveCurrentGw();

// Behouden voor bestaande aanroepers (Team Planner toont dit onder de GW-navigator): nu volledig
// afgeleid uit GW_DEADLINE_ISO i.p.v. een tweede, apart bij te werken lijst.
export const GW_DEADLINES = Object.fromEntries(
  Array.from({ length: GW_COUNT }, (_, i) => [i + 1, formatGwDeadline(i + 1)])
);

// De gameweek waarvoor de voorspelde opstellingen in predictedLineupsData.js gelden. Handmatig bij te
// werken samen met die data. Zolang deze waarde ACHTERLOOPT op CURRENT_GW toont de Predicted
// Lineups-tab een expliciete waarschuwing dat de opstellingen van een vorige speeldag zijn — zo kan
// verouderde team-info nooit meer stilzwijgend als actueel gepresenteerd worden.
export const PREDICTED_LINEUPS_GW = 2;

// Recente vorm per team in de hoofdtabel van de FDR-tab: max. 5 laatste GESPEELDE wedstrijden, oudste
// eerst en nieuwste laatst ('W' winst, 'G' gelijkspel, 'V' verlies). Handmatig bij te werken na elke
// afgeronde speeldag (zelfde onderhoudspatroon als POSTPONED/PREDICTED_LINEUPS_GW hierboven): duw de
// nieuwste uitslag achteraan elke array en knip de oudste eraf zodra een team er meer dan 5 heeft. Een
// team zonder vermelde uitslagen (het huidige, lopende seizoenbegin) krijgt een lege array — dan toont
// de tabel simpelweg geen vormbalk voor dat team, nooit een verzonnen of geraden uitslag.
export const TEAM_FORM = {
  ...Object.fromEntries(TEAMS.map(t => [t.code, []])),
  CLU: ['W', 'W', 'W'],
  ANT: ['W', 'W', 'G'],
  GNT: ['W', 'W'],
  CHA: ['W', 'W', 'W'],
  STA: ['G', 'G', 'W'],
  USG: ['W', 'G'],
  ZWA: ['W', 'G', 'W'],
  GNK: ['V', 'W', 'G'],
  BEV: ['V', 'W', 'V'],
  AND: ['W', 'V'],
  CER: ['G', 'G', 'V'],
  STV: ['G', 'G'],
  LOM: ['G', 'V', 'W'],
  KVM: ['V', 'G', 'V'],
  LLV: ['V', 'V', 'V'],
  WES: ['V', 'V', 'V'],
  OHL: ['V', 'V'],
  KOR: ['V', 'V'],
};

// TEAMS is al alfabetisch op code — eenmalig gesorteerde kopie voor UI-lijsten die dat expliciet willen.
export const TEAMS_ALPHA = [...TEAMS].sort((a, b) => a.code.localeCompare(b.code));
export const GW_INDEXES = Array.from({ length: GW_COUNT }, (_, i) => i);

export function average(numbers) {
  return numbers.reduce((a, b) => a + b, 0) / numbers.length;
}

// Effectieve rating van een tegenstander voor één fixture: de basis-sterkte, eventueel verhoogd
// door Thuisvoordeel. Dit vervangt de vroegere simpele "ratings[opp] ?? 3"-lookup overal waar de
// moeilijkheidsgraad van een fixture bepaald wordt (celkleur, tooltip, gemiddelde-berekeningen).
export function getEffectiveRating(opp, venue, ratings, homeAdvantage) {
  const base = ratings[opp] ?? 3;
  // Thuisvoordeel telt alléén mee wanneer de tegenstander (opp) thuis speelt tegen de rij-team
  // (venue 'A'), én enkel als de tegenstander zélf de toggle heeft aangezet. Venue 'H' verandert nooit.
  if (venue === 'A' && homeAdvantage[opp]) {
    return Math.min(base + 1, 5);
  }
  return base;
}

export function getFixtureScores(teamCode, fixtures, ratings, homeAdvantage, startGW) {
  return fixtures.map((f, idx) => {
    const gwNumber = startGW + idx;
    if (POSTPONED.has(`${teamCode}-${gwNumber}`)) return 5; // gemiste speeldag = nadeel, telt als moeilijkst
    // DGW = altijd de gunstigste rating in gemiddelde-berekeningen: een extra speeldag levert altijd
    // extra puntenkansen op, ongeacht wie de tegenstanders zijn. Geldt voor elke plek die het gemiddelde
    // berekent (teamAvgDifficulty, bestRuns), want die lopen allebei via deze functie.
    if (isDoubleGameweek(f)) return 1;
    const [opp, venue] = f.split('-');
    return getEffectiveRating(opp, venue, ratings, homeAdvantage);
  });
}

export function splitHomeAway(teamCode, opp, venue) {
  const team = TEAMS.find(t => t.code === teamCode)?.name ?? teamCode;
  const oppTeam = TEAMS.find(t => t.code === opp)?.name ?? opp;
  return venue === 'H' ? [team, oppTeam] : [oppTeam, team];
}

export function buildPostponedTooltipText(teamCode, opp, venue) {
  const [home, away] = splitHomeAway(teamCode, opp, venue);
  const pairKey = [teamCode, opp].sort().join('-');
  const date = POSTPONED_DATES[pairKey];
  return `${home} - ${away} is uitgesteld naar ${date} wegens de Europese voorrondes.`;
}

export function buildPossiblyPostponedTooltipText(teamCode, opp, venue) {
  const [home, away] = splitHomeAway(teamCode, opp, venue);
  const pairKey = [teamCode, opp].sort().join('-');
  const reason = POSSIBLY_POSTPONED_REASONS[pairKey] ?? 'mogelijk uitgesteld door het Europese programma';
  return `${home} - ${away} wordt ${reason}.`;
}

export function getFixtureInfo(teamCode, fixture, gwNumber, ratings, homeAdvantage) {
  const key = `${teamCode}-${gwNumber}`;
  const isPostponed = POSTPONED.has(key);
  const isPossiblyPostponed = !isPostponed && POSSIBLY_POSTPONED.has(key);

  // DGW-tak: levert meerdere "legs" (elk hun eigen opp/venue/style) i.p.v. één opp/venue/style.
  // POSTPONED/POSSIBLY_POSTPONED werken op het niveau van de hele speeldag (key = teamCode-gwNumber),
  // niet per individuele wedstrijd binnen een DGW. Een POSTPONED DGW-speeldag valt daarom door naar het
  // enkele-GW-pad hieronder en gedraagt zich als een normale uitgestelde cel (legs worden genegeerd).
  // Tooltips voor mogelijk-uitgesteld tonen we bewust niet op DGW-cellen: 2 tegenstanders passen niet in
  // 1 reden-tekst, en de cel toont z'n eigen twee kleurvakjes al als visueel signaal.
  if (isDoubleGameweek(fixture) && !isPostponed) {
    const legs = getFixtureLegs(fixture).map(f => {
      const [opp, venue] = f.split('-');
      return { opp, venue, style: RATING_STYLE[getEffectiveRating(opp, venue, ratings, homeAdvantage)] };
    });
    return {
      isDoubleGameweek: true, legs,
      isPostponed: false, isPossiblyPostponed,
      postponedText: null, possiblyPostponedText: null,
    };
  }

  // Enkele-GW-pad (bestaand gedrag). getFixtureLegs(...)[0] pakt bij een (toevallig) POSTPONED DGW de
  // eerste wedstrijd, zodat de "was het tegen wie"-tooltiptekst nog altijd zinvol is.
  const [opp, venue] = getFixtureLegs(fixture)[0].split('-');
  const style = isPostponed ? null : RATING_STYLE[getEffectiveRating(opp, venue, ratings, homeAdvantage)];
  const postponedText = isPostponed ? buildPostponedTooltipText(teamCode, opp, venue) : null;
  const possiblyPostponedText = isPossiblyPostponed ? buildPossiblyPostponedTooltipText(teamCode, opp, venue) : null;
  return { isDoubleGameweek: false, opp, venue, isPostponed, isPossiblyPostponed, style, postponedText, possiblyPostponedText };
}

// Gedeeld tussen components/SectionHeader.jsx en tabs/WatchlistTab.jsx (dat laatste spreadt het
// rechtstreeks op zijn eigen h2's), vandaar hier i.p.v. lokaal bij SectionHeader.
// minWidth: 0 (i.p.v. het vroegere whiteSpace: 'nowrap' zonder shrink-mogelijkheid) laat de titel
// binnen een flex-rij naast een sibling-knop (bv. "Wis team"/"Wis alle transfers" in TeamPlannerTab.jsx)
// altijd echt krimpen i.p.v. eroverheen te overlappen op smalle schermen — de eigenlijke afkapping
// (ellipsis) gebeurt op de tekst zelf via sectionTitleTextStyle hieronder, niet op dit hele blok, zodat
// het icoon nooit mee afgekapt wordt.
export const sectionTitleStyle = {
  color: '#FFFFFF', fontSize: '16px', textTransform: 'uppercase', letterSpacing: '0.03em', margin: 0,
  display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0,
};

// Enkel voor de tekst ván de titel (niet het icoon ervoor) — one-line met ellipsis zodra de titel niet
// meer past, i.p.v. te overlappen met een eventuele sibling-knop of de pagina breder te maken.
export const sectionTitleTextStyle = {
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
};

// --- Team Planner: spelregels voor de 15-koppige selectie (Fase 1, handmatige invoer) ---

// Positie-volgorde (canoniek — TEAM_PLANNER_SLOT_POSITIONS hieronder en de veld-lay-out in
// TeamPlannerTab.jsx gebruiken deze volgorde; de veld-lay-out zelf gebruikt lokaal een omgekeerde
// volgorde daar).
export const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];

// Vereist aantal spelers per positie voor een geldige 15-koppige selectie.
export const POSITION_REQUIREMENTS = { GK: 2, DEF: 5, MID: 5, FWD: 3 };

// Vaste positie per slot-index (0-14): de eerste 2 slots zijn altijd GK, de volgende 5 altijd DEF,
// enzovoort — POSITION_REQUIREMENTS'  aantallen liggen toch al vast, dus de gebruiker hoeft de
// positie niet meer zelf te kiezen per speler (voorheen een dropdown in TeamPlannerTab.jsx).
export const TEAM_PLANNER_SLOT_POSITIONS = POSITIONS.flatMap(pos => Array(POSITION_REQUIREMENTS[pos]).fill(pos));

export const TEAM_PLANNER_SQUAD_SIZE = 15;
export const TEAM_PLANNER_BUDGET = 100; // in miljoenen, zelfde eenheid als de watchlist-prijzen
export const TEAM_PLANNER_MAX_PER_CLUB = 3;

// Aantal bankspelers per GW (15 - 11 basisspelers). Bank-samenstelling is per GW instelbaar.
export const TEAM_PLANNER_BENCH_SIZE = 4;

// Geldige formaties als [DEF, MID, FWD]-telling onder de basisploeg (GK is altijd 1, niet in de tripel).
export const VALID_FORMATIONS = [
  [3, 4, 3], [3, 5, 2], [4, 3, 3], [4, 4, 2], [4, 5, 1], [5, 3, 2], [5, 4, 1],
];

// --- Team Planner: transfer-budget (gratis transfers + puntenkost), FPL-stijl ---

// Max. aantal gratis transfers dat tegelijk kan opgestapeld staan.
export const TEAM_PLANNER_FREE_TRANSFER_CAP = 3;
// Puntenkost per transfer die BOVEN het gratis aantal in een GW gemaakt wordt.
export const TEAM_PLANNER_TRANSFER_PENALTY = 4;

// Is Recharge actief op GW `gw`? Dit is de ENIGE plek waar deze regel bepaald wordt — zowel de UI
// (bv. de Recharge-banner/het Recharge-icoontje in TeamPlannerTab.jsx) als de transfer-budget-
// berekening hieronder roepen dit aan, in plaats van de voorwaarde los te herhalen. Zo kan de "wat
// telt als een Recharge-GW"-regel nooit op twee plekken uit sync raken. GW_COUNT (de laatste GW)
// krijgt altijd automatisch een gratis Recharge voor iedereen, ongeacht teamPlannerBoosters.recharge.
export function isRechargeActiveForGw(boosters, gw) {
  return boosters.recharge === gw || gw === GW_COUNT;
}

// Berekent, voor elke GW2..GW_COUNT, hoeveel gratis transfers de gebruiker had opgebouwd VOOR die GW
// begon (freeAvailable), hoeveel transfers hij er effectief in gebruikte (used), en welke puntenkost
// dat opleverde (pointsCost). Puur afgeleid van reeds bestaande state (transferHistory + boosters,
// beide al elders de bron van waarheid) — geen eigen parallelle telling, dus dit kan nooit uit sync
// raken met wat de Transfers-sectie of de Recharge-status effectief tonen. Herberekent vanzelf zodra
// de aanroeper (useMemo in FDRTool.jsx) een gewijzigde transferHistory/boosters doorgeeft.
//
// Spelregels (FPL-stijl, bevestigd door de gebruiker — LET OP bij latere aanpassingen, dit is subtiel):
// - GW1 is de initiële teamopbouw, geen "echte" transfers in de zin van dit systeem — volledig
//   buiten dit budget gehouden (geen entry in de teruggegeven map, geen invloed op GW2's startsaldo).
// - Vanaf GW2: elke GW +1 nieuwe gratis transfer, opstapelend tot een plafond van
//   TEAM_PLANNER_FREE_TRANSFER_CAP. GW2 zelf start dus met exact 1 gratis transfer.
// - Elke transfer BOVEN het op dat moment gratis aantal in een GW kost TEAM_PLANNER_TRANSFER_PENALTY
//   punten per extra transfer.
// - Een Recharge-GW (zie isRechargeActiveForGw hierboven) maakt transfers die GW volledig gratis
//   (pointsCost altijd 0, ongeacht hoeveel transfers er gebeurden), MAAR "bespaar je geen transfer":
//   het gratis-saldo waarmee je de Recharge-GW inging blijft ONGEWIJZIGD staan voor de GW erna — die
//   Recharge-GW telt simpelweg niet mee in de opbouw-rekening, alsof hij was overgeslagen (net zoals
//   een wildcard/free hit-chip in echte FPL geen extra vrije transfer oplevert of kost).
export function computeTeamPlannerTransferBudget(transferHistory, boosters) {
  // Aantal effectief geplande transfers per GW — geteld uit de bestaande, platte transfer-tijdlijn
  // (teamPlannerTransferHistory in FDRTool.jsx, één entry per transfer met een .gw-veld), NIET los
  // herteld, om nooit uit sync te kunnen raken met wat de Transfers-sectie zelf toont.
  const transfersUsedByGw = {};
  transferHistory.forEach(entry => {
    transfersUsedByGw[entry.gw] = (transfersUsedByGw[entry.gw] ?? 0) + 1;
  });

  const budgetByGw = {};
  let freeAvailable = 1; // startsaldo waarmee GW2 begint
  for (let gw = 2; gw <= GW_COUNT; gw++) {
    const isRecharge = isRechargeActiveForGw(boosters, gw);
    const used = transfersUsedByGw[gw] ?? 0;
    const pointsCost = isRecharge ? 0 : Math.max(0, used - freeAvailable) * TEAM_PLANNER_TRANSFER_PENALTY;
    budgetByGw[gw] = { freeAvailable, used, pointsCost, isRecharge };

    // Opbouw voor de VOLGENDE GW: een Recharge-GW bevriest het saldo (zie uitleg hierboven — deze GW
    // telt niet mee). Anders normale FPL-opbouw: wat je effectief van je gratis transfers gebruikte
    // (nooit meer dan wat er was) gaat eraf, +1 nieuwe, geplafonneerd op TEAM_PLANNER_FREE_TRANSFER_CAP.
    if (!isRecharge) {
      const consumed = Math.min(used, freeAvailable);
      freeAvailable = Math.min(TEAM_PLANNER_FREE_TRANSFER_CAP, freeAvailable - consumed + 1);
    }
  }
  return budgetByGw;
}

// --- Team Planner: transfers zijn tijdgebonden ---
// Een transfer op een slot geldt vanaf zijn geplande GW en blijft van kracht voor alle latere GW's,
// tot een nieuwe transfer op datzelfde slot het opnieuw wijzigt. Het team is dus geen vaste lijst
// meer, maar per slot een tijdlijn van "wie zit hier vanaf welke GW". Deze ene functie is de enige
// plek waar die tijdlijn wordt opgelost naar "wie zit hier op GW X" — alle andere code (veld-weergave,
// transfer-UI, geschiedenis) bouwt hierop voort, zodat er maar één plek is om te controleren/aan te
// passen als deze regel ooit verandert.

// `transfersForSlot`: array van { gw, player }, één entry per geplande transfer op dit ene slot
// (player = de speler die vanaf die GW instroomt). Retourneert wie het slot bezet op GW `atGw`: de
// meest recente transfer met transfer.gw <= atGw, of `basePlayer` (de oorspronkelijke, in GW1
// ingevulde speler) als er nog geen enkele transfer op of vóór atGw gepland is.
export function resolveSlotPlayerAtGw(basePlayer, transfersForSlot, atGw) {
  let current = basePlayer;
  let currentGw = -Infinity; // basePlayer geldt "vanaf het prille begin", dus altijd eerst overschreven
  for (const transfer of transfersForSlot) {
    if (transfer.gw <= atGw && transfer.gw > currentGw) {
      current = transfer.player;
      currentGw = transfer.gw;
    }
  }
  return current;
}

// --- Spelersdatabank (Team Planner): CSV-parsing voor de publieke Google Sheet met alle spelers ---
// Herbruikbaar voor zowel de initiële 15-koppige teaminvoer (PlayerSearchInput in de spelerstabel)
// als de latere transfer-functie in Team Planner — vandaar hier i.p.v. lokaal in TeamPlannerTab.jsx.
// De fetch zelf gebeurt in FDRTool.jsx (state blijft daar, zie het architecturale patroon van de rest
// van de app); dit bestand bevat enkel de pure parsing-logica.

// Publiek gepubliceerde Google Sheet (CSV-export) met naam/team/positie/prijs van elke speler. De
// gebruiker werkt deze sheet regelmatig bij tijdens de zomermercato — elke fetch in FDRTool.jsx
// gebeurt daarom met cache: 'no-store', zodat nooit een verouderde, gecachete versie getoond wordt.
// Bevat sinds kort ook 7 statistiek-kolommen (Gele kaarten/Duels gewonnen/.../Bonuspunten, zie
// parsePlayerDatabaseCsv hieronder) — deze voeden nu ook de Kaarten- en Bonuspunten-tab (zie
// src/kaarten.js/src/bonuspunten.js), die voorheen elk hun eigen aparte werkblad-CSV nodig hadden.
export const PLAYER_DATABASE_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS_PSoy3cpm-nckncN8C8lmxg0PfxYpANthYfLFccxft2UuBbmCvOa8SXrlwyJkBWUu0ek3QMBsIknU/pub?gid=0&single=true&output=csv';

// Eenvoudige RFC4180-achtige CSV-tokenizer (i.p.v. text.split(',')): velden tussen aanhalingstekens
// kunnen komma's en regeleindes bevatten, en "" binnen zo'n veld is een ontsnapt aanhalingsteken.
// Geeft een array van rijen terug, elke rij een array van ruwe (nog niet-getrimde) celwaarden.
export function parseCsvRows(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field); field = '';
    } else if (char === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (char === '\r') {
      // negeren — \r\n regeleindes worden door de \n-tak hierboven afgehandeld
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Haalt uit een prijscel een plain getal, ongeacht of de sheet "8.5", "8.5M" of "€8.5m" bevat — alles
// behalve cijfers/punt/min wordt weggegooid vóór het parsen. Geeft null terug bij een lege of
// onbruikbare waarde, zodat de aanroeper zelf een fallback/weergave ("—") kan kiezen.
function parsePriceValue(raw) {
  const cleaned = (raw ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : null;
}

// Zet een statistiek-cel (Gele kaarten/Duels gewonnen/.../Bonuspunten) om naar een getal. Anders dan
// parsePriceValue hierboven (die null teruggeeft bij een lege/onbruikbare cel, zodat de UI zelf een
// "—"-weergave kan kiezen) valt dit terug op 0 — deze velden worden rechtstreeks in tellingen/sortering
// gebruikt (Kaarten-/Bonuspunten-tab), waar een NaN of null silent een hele rij/som zou laten verdwijnen.
// Een lege cel betekent hier gewoon "nog geen [statistiek] voor deze speler", niet "onbekend".
function parseStatValue(raw) {
  const cleaned = (raw ?? '').replace(/[^0-9.-]/g, '');
  if (!cleaned) return 0;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) ? value : 0;
}

// Zet de ruwe CSV-tekst van de spelersdatabank om naar een array van genormaliseerde speler-
// objecten ({ name, teamCode, teamName, position, price, yellowCards, duelsWon, duelsLost, headers,
// recoveries, bigChances, bonusPoints, games }). Kolommen worden op hun EXACTE headertekst opgezocht
// i.p.v. blind op vaste index, met een index-fallback voor het geval een header onverhoopt ontbreekt —
// zo blijft de parsing ook werken als de kolomvolgorde in de sheet ooit verandert, zolang de headers
// zelf niet hernoemd worden. De 8 statistiek-kolommen (Gele kaarten/Duels gewonnen/Duels verloren/
// Kopballen/Recoveries/Grote kansen/Bonuspunten/Games) staan in die exacte volgorde na de bestaande
// Name/Team/Position/Price-kolommen, vandaar hun fallback-index 4-11. Rijen zonder naam (lege of
// malformed rijen, of de header-rij zelf) worden stilzwijgend genegeerd i.p.v. te crashen.
export function parsePlayerDatabaseCsv(text) {
  const rows = parseCsvRows(text).filter(row => row.some(cell => (cell ?? '').trim() !== ''));
  if (rows.length === 0) return [];
  const [headerRow, ...dataRows] = rows;
  const trimmedHeaders = headerRow.map(h => (h ?? '').trim());
  const columnIndex = (headerName, fallbackIndex) => {
    const found = trimmedHeaders.indexOf(headerName);
    return found === -1 ? fallbackIndex : found;
  };
  const nameCol = columnIndex('Name', 0);
  const teamCol = columnIndex('Team', 1);
  const positionCol = columnIndex('Position', 2);
  const priceCol = columnIndex('Price', 3);
  const yellowCardsCol = columnIndex('Gele kaarten', 4);
  const duelsWonCol = columnIndex('Duels gewonnen', 5);
  const duelsLostCol = columnIndex('Duels verloren', 6);
  const headersCol = columnIndex('Kopballen', 7);
  const recoveriesCol = columnIndex('Recoveries', 8);
  const bigChancesCol = columnIndex('Grote kansen', 9);
  const bonusPointsCol = columnIndex('Bonuspunten', 10);
  const gamesCol = columnIndex('Games', 11);

  return dataRows
    .map(row => {
      const name = (row[nameCol] ?? '').trim();
      const teamCode = (row[teamCol] ?? '').trim().toUpperCase();
      const position = (row[positionCol] ?? '').trim().toUpperCase();
      const team = TEAMS.find(t => t.code === teamCode);
      return {
        name, teamCode, teamName: team?.name ?? teamCode, position, price: parsePriceValue(row[priceCol]),
        yellowCards: parseStatValue(row[yellowCardsCol]),
        duelsWon: parseStatValue(row[duelsWonCol]),
        duelsLost: parseStatValue(row[duelsLostCol]),
        headers: parseStatValue(row[headersCol]),
        recoveries: parseStatValue(row[recoveriesCol]),
        bigChances: parseStatValue(row[bigChancesCol]),
        bonusPoints: parseStatValue(row[bonusPointsCol]),
        games: parseStatValue(row[gamesCol]),
      };
    })
    .filter(p => p.name);
}
