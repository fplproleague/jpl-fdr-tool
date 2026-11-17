// Gedeelde toegang tot /api/players (spec §5.14). Eén fetch per sessie: de eerste aanroep start de
// request, elke volgende aanroep (vanuit eender welke tab) krijgt dezelfde promise. Daarnaast de
// bestaande reservekopie in localStorage (zelfde sleutel als voorheen), voor wanneer de bron even
// niet antwoordt.
//
// Stond eerst als useSpelersData() in SpelersTab.jsx; is hierheen verhuisd zodat spelersfoto's ook op
// andere tabs beschikbaar zijn (Team Planner, Bonuspunten, Kaarten, Set Pieces, Verwachte XI's).
// /api/players is ~47 kB gzip en staat 1u op Vercels CDN.

const LOCAL_CACHE_KEY = 'fpl_proleague_spelers_cache_v1';

let sessionData = null;
let inflight = null;

export function readLocalPlayersCache() {
  try {
    const raw = window.localStorage?.getItem(LOCAL_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.players) ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalCache(data) {
  try {
    window.localStorage?.setItem(LOCAL_CACHE_KEY, JSON.stringify(data));
  } catch {
    // vol of geblokkeerd: geen probleem, dan is er gewoon geen reservekopie in deze browser
  }
}

// De data die deze sessie al binnen is, of null.
export function getSessionPlayers() {
  return sessionData;
}

// Schoten, schoten op doel en key passes uit API-Football (spec F1, /api/shots) bij de spelers zetten:
// reeksen in w.sh/w.sot/w.kp (zelfde lengte als de andere reeksen) en seizoenstotalen sh/sot/kp. Een
// speler die niet gekoppeld is, krijgt null (de tabel toont "—"). data.shotsAvailable zegt of de
// kolommen getoond mogen worden; lukt /api/shots niet, dan blijft alles zoals voorheen.
export function mergeShots(data, shots) {
  if (!data || !Array.isArray(data.players) || !shots?.players) return data;
  const gw = data.gw ?? 0;
  const fit = (arr) => Array.from({ length: gw }, (_, i) => arr?.[i] ?? 0);
  const total = (arr) => arr.reduce((sum, v) => sum + (v ?? 0), 0);
  const players = data.players.map(p => {
    const s = shots.players[p.id];
    if (!s) return { ...p, sh: null, sot: null, kp: null };
    const sh = fit(s.sh); const sot = fit(s.sot); const kp = fit(s.kp);
    return { ...p, sh: total(sh), sot: total(sot), kp: total(kp), w: p.w ? { ...p.w, sh, sot, kp } : p.w };
  });
  return { ...data, players, shotsAvailable: true };
}

async function fetchShots() {
  try {
    const response = await fetch('/api/shots');
    if (!response.ok) return null;
    const body = await response.json();
    return body?.players ? body : null;
  } catch {
    return null;
  }
}

// Resolvet altijd (nooit reject): { data, error, fromLocal }.
// force: opnieuw ophalen, ook als er al data is (de "Opnieuw proberen"-knop).
export function loadPlayers({ force = false } = {}) {
  if (sessionData && !force) return Promise.resolve({ data: sessionData, error: null, fromLocal: false });
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      // Beide tegelijk; /api/shots is optioneel en mag nooit de spelers tegenhouden.
      const shotsPromise = fetchShots();
      const response = await fetch('/api/players');
      const raw = await response.json().catch(() => null);
      if (!response.ok || !raw || !Array.isArray(raw.players)) throw new Error(raw?.error || `HTTP ${response.status}`);
      const body = mergeShots(raw, await shotsPromise);
      sessionData = body;
      if (!body.stale) writeLocalCache(body);
      return { data: body, error: null, fromLocal: false };
    } catch (err) {
      const local = readLocalPlayersCache();
      return { data: local, error: String(err?.message ?? err), fromLocal: Boolean(local) };
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
