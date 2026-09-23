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
// niet uit: spaties, komma's of niets ("WGVWW") werken allemaal.
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

// Eén letter uit de sheet -> de interne W/G/V. Alles wat hier niet in staat (een streepje voor een
// nog niet gespeelde match, een spatie, een typfout) valt weg i.p.v. een verzonnen uitslag te worden.
const RESULT_LETTERS = {
  W: 'W',           // win
  G: 'G', D: 'G',   // gelijk / draw
  V: 'V', L: 'V',   // verlies / loss
};

export function parseFormLetters(raw) {
  return String(raw ?? '')
    .toUpperCase()
    .split('')
    .map(letter => RESULT_LETTERS[letter])
    .filter(Boolean)
    .slice(-TEAM_FORM_MAX);
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
  const formIndex = kolom(['form', 'vorm', 'forme', 'results', 'uitslagen'], 1);
  const heeftKop = headers.includes('team') || headers.includes('club') || headers.includes('form') || headers.includes('vorm');

  const result = {};
  for (const row of heeftKop ? rows.slice(1) : rows) {
    const code = resolveClubCode(row[clubIndex]);
    if (!code) continue;
    const letters = parseFormLetters(row[formIndex]);
    if (letters.length === 0) continue;
    result[code] = letters;
  }
  return result;
}

// Legt de sheet over de ingebouwde waarden heen: clubs die in de sheet staan komen daarvandaan, de rest
// houdt wat er in constants.js staat. Zo blijft een half ingevuld werkblad bruikbaar, en kan een lege
// of stukke sheet nooit de hele vormkolom leegmaken.
export function mergeTeamForm(builtIn, fromSheet) {
  return { ...builtIn, ...fromSheet };
}
