// FDR-ratings als "afwijkingen van de standaard" (FUNCTIONALITEIT_SPEC A1/A2).
//
// Vroeger bewaarde de site bij de eerste aanpassing de volledige set van 18 clubs. Paste de eigenaar
// daarna DEFAULT_RATINGS aan (bv. Charleroi naar 4), dan zag wie ooit iets aanpaste dat nooit. Nu
// bewaren we enkel de clubs die de bezoeker zelf veranderde ({ CHA: 3 }); de rest volgt altijd de
// actuele standaard.
//
// Puur JavaScript zonder React, zodat de migratie apart te testen is (src/fdrRatings.test.js).

export const RATINGS_V1_KEY = 'fpl_proleague_fdr_ratings_v1';
export const HOME_V1_KEY = 'fpl_proleague_fdr_home_advantage_v1';
export const RATINGS_OVERRIDES_KEY = 'fpl_proleague_fdr_overrides_v2';
export const HOME_OVERRIDES_KEY = 'fpl_proleague_fdr_home_overrides_v2';

const isRating = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

// Effectieve waarde per club: eigen afwijking, anders de standaard.
export function applyOverrides(defaults, overrides) {
  const result = {};
  for (const code of Object.keys(defaults)) {
    result[code] = overrides && Object.prototype.hasOwnProperty.call(overrides, code) ? overrides[code] : defaults[code];
  }
  return result;
}

// Omgekeerd: welke clubs wijken af van de standaard? Wordt gebruikt bij "Overnemen" van een gedeelde
// link, zodat ook die enkel als afwijkingen bewaard wordt.
export function diffFromDefaults(values, defaults) {
  const result = {};
  for (const code of Object.keys(defaults)) {
    if (values && values[code] !== undefined && values[code] !== defaults[code]) result[code] = values[code];
  }
  return result;
}

// Zet één club op een waarde. Gelijk aan de standaard = de afwijking verdwijnt (dan staat de club
// weer op "niet aangepast", ook als je hem zelf terugzette).
export function setOverride(overrides, defaults, code, value) {
  const next = { ...overrides };
  if (value === defaults[code]) delete next[code];
  else next[code] = value;
  return next;
}

export function removeOverride(overrides, code) {
  const next = { ...overrides };
  delete next[code];
  return next;
}

// Migratie vanuit de oude, volledige set (v1). Een club telt als "niet aangepast" als de bewaarde
// waarde gelijk is aan de huidige standaard, of aan de standaard die gold toen de waarde bewaard werd
// (`previousDefaults`, de waarden die op dat moment live stonden). Zo krijgt wie Charleroi nooit
// aanraakte (bewaard als 3, de oude standaard) nu gewoon de nieuwe 4.
export function migrateRatingsV1(v1, defaults, previousDefaults = {}) {
  if (!v1 || typeof v1 !== 'object' || Array.isArray(v1)) return {};
  const result = {};
  for (const code of Object.keys(defaults)) {
    const value = v1[code];
    if (!isRating(value)) continue;
    if (value === defaults[code] || value === previousDefaults[code]) continue;
    result[code] = value;
  }
  return result;
}

// Thuisvoordeel: zelfde patroon, met booleans (standaard overal uit).
export function migrateHomeV1(v1, defaults) {
  if (!v1 || typeof v1 !== 'object' || Array.isArray(v1)) return {};
  const result = {};
  for (const code of Object.keys(defaults)) {
    const value = v1[code];
    if (typeof value !== 'boolean') continue;
    if (value !== defaults[code]) result[code] = value;
  }
  return result;
}

// Leest een v2-object en houdt enkel geldige clubs en waarden over (een oude of geknoeide waarde mag
// de tabel nooit breken).
export function sanitizeOverrides(raw, defaults, isValid) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const code of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(raw, code) && isValid(raw[code]) && raw[code] !== defaults[code]) {
      result[code] = raw[code];
    }
  }
  return result;
}

function readJson(storage, key) {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Laadt de afwijkingen. Bestaat de v2-sleutel nog niet, dan migreren we één keer uit v1 en schrijven
// we meteen v2 weg (ook als die leeg is). Dat laatste is belangrijk: anders zou een volgende wijziging
// van DEFAULT_RATINGS bij het volgende bezoek opnieuw tegen v1 vergeleken worden. De v1-sleutels
// blijven onaangeroerd staan als back-up.
export function loadOverrides(storage, { defaultRatings, defaultHome, previousDefaultRatings }) {
  const storedRatings = readJson(storage, RATINGS_OVERRIDES_KEY);
  const storedHome = readJson(storage, HOME_OVERRIDES_KEY);
  let ratings;
  let home;
  if (storedRatings !== null) {
    ratings = sanitizeOverrides(storedRatings, defaultRatings, isRating);
  } else {
    ratings = migrateRatingsV1(readJson(storage, RATINGS_V1_KEY), defaultRatings, previousDefaultRatings);
    try { storage?.setItem(RATINGS_OVERRIDES_KEY, JSON.stringify(ratings)); } catch { /* geen opslag */ }
  }
  if (storedHome !== null) {
    home = sanitizeOverrides(storedHome, defaultHome, v => typeof v === 'boolean');
  } else {
    home = migrateHomeV1(readJson(storage, HOME_V1_KEY), defaultHome);
    try { storage?.setItem(HOME_OVERRIDES_KEY, JSON.stringify(home)); } catch { /* geen opslag */ }
  }
  return { ratings, home };
}

export function saveOverrides(storage, ratings, home) {
  try {
    storage?.setItem(RATINGS_OVERRIDES_KEY, JSON.stringify(ratings));
    storage?.setItem(HOME_OVERRIDES_KEY, JSON.stringify(home));
  } catch {
    // opslag niet beschikbaar (privénavigatie e.d.): de ratings werken deze sessie gewoon door
  }
}

// --- Deellinks (?r= en ?ha=): blijven de volledige set bevatten, zodat oude links blijven werken ---

export function encodeRatingsParam(teamCodes, ratings) {
  return teamCodes.map(code => `${code}${ratings[code]}`).join('-');
}

export function decodeRatingsParam(raw, teamCodes) {
  if (!raw) return null;
  const result = {};
  for (const part of String(raw).split('-')) {
    const code = part.slice(0, 3);
    const value = Number(part.slice(3));
    if (teamCodes.includes(code) && isRating(value)) result[code] = value;
  }
  return teamCodes.every(code => result[code]) ? result : null;
}

// Eén '0'/'1' per club, in de vaste TEAMS-volgorde.
export function encodeHomeParam(teamCodes, home) {
  return teamCodes.map(code => (home[code] ? '1' : '0')).join('');
}

export function decodeHomeParam(raw, teamCodes) {
  if (!raw || raw.length !== teamCodes.length || !/^[01]+$/.test(raw)) return null;
  const result = {};
  teamCodes.forEach((code, i) => { result[code] = raw[i] === '1'; });
  return result;
}
