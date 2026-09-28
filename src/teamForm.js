// Recente vorm per club, gelezen uit een werkblad in dezelfde Google Sheet als de spelersdatabank en
// de set pieces, zodat een uitslagenupdate geen code-aanpassing en geen deploy meer vraagt.
//
// Waarom: TEAM_FORM stond als een handgeschreven object in constants.js, en dat is precies het soort
// data dat wekelijks verandert. Elke speeldag betekende dat achttien regels aanpassen, committen en
// wachten op een deploy — terwijl de rest van de wekelijkse data (spelers, set pieces) al gewoon uit
// een sheet komt die je kan openen en typen.
//
// Het werkblad heeft twee kolommen:
//
//   Team   | Form
//   Genk   | W G V W W
//   Gent   | W,W,W,G,W
//
// De club mag zo geschreven worden als in de andere werkbladen ("Genk", "KV Mechelen", "STVV", ...) —
// resolveClubCode uit setPieces.js doet dezelfde herkenning, dus je hoeft geen interne codes te kennen.
// De uitslagen staan OUDSTE EERST, nieuwste laatst, net zoals in de tabel zelf. Scheidingsteken maakt
// niet uit: spaties, komma's of niets ("WGVWW") werken allemaal. Staan de vijf uitslagen elk in een
// eigen kolom (Genk | W | G | V | W | W), dan wordt dat ook gelezen — zie lettersUitLosseKolommen.
//
// De letters mogen Nederlands (W/G/V) of Engels (W/D/L) zijn. Frans (V/N/D) NIET, en dat is een
// bewuste beperking: de Franse V staat voor victoire, de Nederlandse voor verlies. Dezelfde letter zou
// dan een winst of een nederlaag kunnen betekenen, en dat raad je niet — een verkeerd geraden uitslag
// is erger dan geen uitslag. De site vertaalt de vormbalk zelf al per taal, dus de sheet hoeft maar
// één taal te spreken.
import { parseCsvRows } from './constants';
import { resolveClubCode } from './setPieces';

// Max. aantal getoonde resultaten, gelijk aan wat de vormbalk in de tabel aankan. Staat er in de sheet
// een langere reeks, dan houden we de LAATSTE vijf over — de nieuwste, want oudste eerst.
export const TEAM_FORM_MAX = 5;

// Eén letter uit de sheet -> de interne W/G/V.
const RESULT_LETTERS = {
  W: 'W',           // win
  G: 'G', D: 'G',   // gelijk / draw
  V: 'V', L: 'V',   // verlies / loss
};

// Tekens die tússen de uitslagen mogen staan zonder iets te betekenen: scheidingstekens, en een
// streepje of punt voor een match die nog niet gespeeld is.
const SCHEIDINGSTEKENS = /[\s,;./\-–—]/;

// Leest een cel uit als een reeks uitslagen — of helemaal niet.
//
// Een cel met ook maar één teken dat géén uitslag en géén scheidingsteken is, levert NIETS op. Dat is
// streng met opzet. Eerst vielen onbekende tekens gewoon weg, en dan leest deze functie in "GK" een
// gelijkspel (de G) en in "AND" ook (de D) — dus als er ooit naar het verkeerde werkblad gewezen wordt,
// of als iemand een kolom verschuift, zou de tabel vormbalken tonen die nergens op slaan. Een cel die
// niet als vorm te lezen is, hóórt geen vorm op te leveren; de club valt dan terug op de ingebouwde
// waarde, en dat is precies het gedrag dat we willen.
export function parseFormLetters(raw) {
  const tekst = String(raw ?? '').toUpperCase();
  const letters = [];
  for (const teken of tekst) {
    if (SCHEIDINGSTEKENS.test(teken)) continue;
    const uitslag = RESULT_LETTERS[teken];
    if (!uitslag) return [];
    letters.push(uitslag);
  }
  return letters.slice(-TEAM_FORM_MAX);
}

// Leest het werkblad en geeft { CLUBCODE: ['W','G',...] } terug voor elke rij die een herkenbare club
// EN minstens één geldig resultaat oplevert. Een onherkenbare clubnaam of een lege vormkolom wordt
// stilzwijgend overgeslagen: de aanroeper valt dan voor die club terug op de ingebouwde waarde, wat
// altijd beter is dan een team zonder vormbalk omdat er een typfout in de sheet staat.
export function parseTeamFormCsv(text) {
  const rows = parseCsvRows(text).filter(row => row.some(cell => (cell ?? '').trim() !== ''));
  if (rows.length === 0) return {};

  const headers = rows[0].map(h => (h ?? '').trim().toLowerCase());
  const kolom = (namen, fallback) => {
    const gevonden = headers.findIndex(h => namen.includes(h));
    return gevonden === -1 ? fallback : gevonden;
  };
  // Kolomkoppen worden opgezocht, met de eerste twee kolommen als terugval — zo werkt het werkblad ook
  // zonder (of met een anders gespelde) kopregel.
  const clubIndex = kolom(['team', 'club', 'ploeg', 'équipe', 'equipe'], 0);
  const FORM_KOPPEN = ['form', 'vorm', 'forme', 'results', 'uitslagen'];
  const formIndex = kolom(FORM_KOPPEN, 1);
  // Of er écht een vormkolom bij naam genoemd is. Zonder kop valt formIndex terug op kolom 2, en dat
  // is bij een werkblad met een kolom per speeldag net de verkeerde keuze — zie hieronder.
  const heeftFormKop = FORM_KOPPEN.some(naam => headers.includes(naam));
  // Zonder genoemde vormkolom valt formIndex terug op kolom 2; staat de clubkolom daar toevallig ook,
  // dan zouden we dezelfde cel twee keer lezen. Schuif dan één op.
  const veiligeFormIndex = formIndex === clubIndex ? clubIndex + 1 : formIndex;
  const heeftKop = headers.includes('team') || headers.includes('club') || heeftFormKop;

  const result = {};
  for (const row of heeftKop ? rows.slice(1) : rows) {
    const code = resolveClubCode(row[clubIndex]);
    if (!code) continue;
    // Een bij naam genoemde vormkolom wint altijd — die heeft iemand bewust zo genoemd. Staat er geen,
    // dan nemen we de lezing die de meeste uitslagen oplevert: bij één cel met "WGVWW" is dat de cel
    // zelf, bij een kolom per speeldag de losse kolommen (waar de cel-lezing er maar één zou zien).
    const letters = parseFormLetters(row[veiligeFormIndex]);
    const losse = heeftFormKop && letters.length > 0 ? [] : lettersUitLosseKolommen(row, clubIndex);
    const uiteindelijk = losse.length > letters.length ? losse : letters;
    if (uiteindelijk.length === 0) continue;
    result[code] = uiteindelijk;
  }
  return result;
}

// Terugval voor een werkblad waarin de vijf uitslagen elk in een EIGEN kolom staan (Genk | W | G | V |
// W | W) i.p.v. samen in één cel. Dat is een even voor de hand liggende manier om zo'n tabel te typen,
// en het verschil is niet te zien aan de kopregel.
//
// Bewust streng: dit doet alleen iets als élke cel naast de clubkolom hoogstens één teken lang is.
// Zonder die voorwaarde zou een rij met bv. een clubnaam of een datum in een andere kolom letters
// opleveren die toevallig W, G of V zijn ("Genk" bevat een G) — en dan zou de vormbalk uitslagen tonen
// die nergens staan. Liever niets dan verzonnen.
function lettersUitLosseKolommen(row, clubIndex) {
  const cellen = row
    .map((cel, i) => (i === clubIndex ? '' : String(cel ?? '').trim()))
    .filter(cel => cel !== '');
  if (cellen.length === 0 || cellen.some(cel => cel.length > 1)) return [];
  return parseFormLetters(cellen.join(''));
}

// Legt de sheet over de ingebouwde waarden heen: clubs die in de sheet staan komen daarvandaan, de rest
// houdt wat er in constants.js staat. Zo blijft een half ingevuld werkblad bruikbaar, en kan een lege
// of stukke sheet nooit de hele vormkolom leegmaken.
export function mergeTeamForm(builtIn, fromSheet) {
  return { ...builtIn, ...fromSheet };
}
