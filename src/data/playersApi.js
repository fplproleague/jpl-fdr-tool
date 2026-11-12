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

// Resolvet altijd (nooit reject): { data, error, fromLocal }.
// force: opnieuw ophalen, ook als er al data is (de "Opnieuw proberen"-knop).
export function loadPlayers({ force = false } = {}) {
  if (sessionData && !force) return Promise.resolve({ data: sessionData, error: null, fromLocal: false });
  if (inflight && !force) return inflight;
  inflight = (async () => {
    try {
      const response = await fetch('/api/players');
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || !Array.isArray(body.players)) throw new Error(body?.error || `HTTP ${response.status}`);
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
