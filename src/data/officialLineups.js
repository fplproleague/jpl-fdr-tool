// Officiële opstellingen (spec F3), uit /api/lineups (API-Football, zie api/lineups.js).
//
// Welke speeldag? CURRENT_GW is de eerste speeldag waarvan de deadline nog niet voorbij is. Tijdens het
// weekend is dat al de vólgende speeldag; de wedstrijden die nu gespeeld worden, horen dus bij
// CURRENT_GW - 1. Vanaf de volgende deadline schuift alles één speeldag op en verdwijnt dit vanzelf.
//
// Lukt het ophalen niet, dan blijft alles null en tonen de Verwachte XI's en de planner niets extra.
import { useEffect, useState } from 'react';
import { CURRENT_GW } from '../constants';

export const LIVE_GW = CURRENT_GW > 1 ? CURRENT_GW - 1 : null;

const REFRESH_MS = 2 * 60 * 1000;
// Begint het venster binnen deze tijd, dan op dat moment opnieuw ophalen (anders bij de volgende keer laden).
const WAKE_UP_WITHIN_MS = 6 * 60 * 60 * 1000;

async function fetchLineups(gw) {
  try {
    const response = await fetch(`/api/lineups?gw=${gw}`);
    if (!response.ok) return null;
    const body = await response.json();
    return Array.isArray(body?.matches) ? body : null;
  } catch {
    return null;
  }
}

// Haalt de opstellingen op zolang `enabled` waar is; ververst elke 2 minuten tijdens het venster
// (90 minuten vóór de eerste aftrap tot na de laatste wedstrijd).
export function useOfficialLineups(gw = LIVE_GW, enabled = true) {
  const [data, setData] = useState(null);
  useEffect(() => {
    if (!enabled || !gw) return undefined;
    let alive = true;
    let timer = null;
    const load = async () => {
      const body = await fetchLineups(gw);
      if (!alive) return;
      if (body) setData(body);
      const start = Date.parse(body?.window?.start);
      const wait = body?.live ? REFRESH_MS
        : (start > Date.now() && start - Date.now() < WAKE_UP_WITHIN_MS ? start - Date.now() + 1000 : null);
      if (wait != null) timer = setTimeout(load, wait);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [gw, enabled]);
  return data;
}

// Antwoord van /api/lineups -> opzoekbare vorm. keyOf(naam, club) is dezelfde sleutel als die van de
// Verwachte XI's (FDRTool.jsx: lineupPlayerKey), zodat "Vanaken" in beide bronnen dezelfde speler is.
// Geeft null als er nog geen enkele officiële opstelling is.
export function buildOfficialIndex(data, keyOf) {
  if (!data?.matches || typeof keyOf !== 'function') return null;
  const byClub = {};
  const matches = new Set();
  for (const m of data.matches) {
    if (!m?.lineups) continue;
    let any = false;
    for (const [club, lineup] of Object.entries(m.lineups)) {
      if (!lineup || !Array.isArray(lineup.starters)) continue;
      any = true;
      byClub[club] = {
        formation: lineup.formation ?? null,
        starters: new Set(lineup.starters.map(n => keyOf(n, club))),
        bench: new Set((lineup.bench ?? []).map(n => keyOf(n, club))),
        starterNames: lineup.starters,
      };
    }
    if (any) matches.add(`${m.home}-${m.away}`);
  }
  if (matches.size === 0) return null;
  return { gw: data.gw, byClub, matches };
}

// 'starts' | 'bench' | 'out' (niet in de selectie) | null (nog geen officiële opstelling voor die club).
export function officialStatus(index, name, club, keyOf) {
  const lineup = index?.byClub?.[club];
  if (!lineup || !name) return null;
  const key = keyOf(name, club);
  if (lineup.starters.has(key)) return 'starts';
  if (lineup.bench.has(key)) return 'bench';
  return 'out';
}

// Officiële basisspelers die niet in de verwachte opstelling stonden ("Ook in de basis: X, Y").
// predicted: [{ name, club }] van de verwachte XI van die club.
export function unexpectedStarters(index, club, predicted, keyOf) {
  const lineup = index?.byClub?.[club];
  if (!lineup) return [];
  const expected = new Set(predicted.map(p => keyOf(p.name, p.club ?? club)));
  return lineup.starterNames.filter(n => !expected.has(keyOf(n, club)));
}
