// usePlayerIndex (spec §5.14): spelersfoto's en API-stats op elke tab, ook waar spelers enkel als
// (naam, clubcode) uit de Google Sheet bekend zijn.
//
//   const { ready, byId, find } = usePlayerIndex();
//   const apiPlayer = find('Hans Vanaken', 'CLU');   // -> { id, name, short, club, photo, ... } of null
//
// find() zoekt binnen dezelfde club: eerst de exacte volledige naam, dan `short`, dan de achternaam
// (als die uniek is in de club), en pas als laatste een fuzzy match (Levenshtein ≥ 0.85) via de
// bestaande matchPlayer-helper. Resultaten worden onthouden, dus een lijst van 500 rijen kost maar
// één zoektocht per speler.
//
// Laadt /api/players pas wanneer een component deze hook effectief gebruikt (dus niet op de FDR-tab).
import { useEffect, useMemo, useState } from 'react';
import { getSessionPlayers, loadPlayers } from './playersApi';
import { matchPlayer } from '../utils/playerFuzzyMatch';

export function normalizePlayerName(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lastToken(normalized) {
  const parts = normalized.split(' ').filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

function buildIndex(data) {
  const byId = new Map();
  const byClub = new Map();
  for (const p of data?.players ?? []) {
    byId.set(p.id, p);
    if (!byClub.has(p.club)) byClub.set(p.club, []);
    byClub.get(p.club).push(p);
  }
  const clubMaps = new Map();
  for (const [club, players] of byClub) {
    const full = new Map();
    const short = new Map();
    const last = new Map();
    for (const p of players) {
      const n = normalizePlayerName(p.name);
      if (n && !full.has(n)) full.set(n, p);
      const s = normalizePlayerName(p.short);
      if (s && !short.has(s)) short.set(s, p);
      for (const key of new Set([lastToken(n), lastToken(s)].filter(Boolean))) {
        last.set(key, last.has(key) && last.get(key) !== p ? null : p); // null = niet uniek
      }
    }
    clubMaps.set(club, { players, full, short, last });
  }
  const cache = new Map();
  const find = (name, clubCode) => {
    if (!name || !clubCode) return null;
    const key = `${name}|${clubCode}`;
    if (cache.has(key)) return cache.get(key);
    const club = clubMaps.get(String(clubCode).toUpperCase());
    let hit = null;
    if (club) {
      const n = normalizePlayerName(name);
      hit = club.full.get(n) ?? club.short.get(n) ?? club.last.get(lastToken(n)) ?? null;
      if (!hit) {
        const { matched, confidence } = matchPlayer({ name, position: null }, club.players.map(p => ({ ...p, name: p.name })));
        if (matched && confidence === 'hoog') hit = matched;
      }
    }
    cache.set(key, hit);
    return hit;
  };
  return { byId, find };
}

let sharedIndex = null;
let sharedIndexData = null;
function indexFor(data) {
  if (!data) return null;
  if (sharedIndexData !== data) { sharedIndex = buildIndex(data); sharedIndexData = data; }
  return sharedIndex;
}

const EMPTY = { byId: new Map(), find: () => null };

export default function usePlayerIndex(enabled = true) {
  const [data, setData] = useState(() => getSessionPlayers());
  useEffect(() => {
    if (!enabled || data) return undefined;
    let cancelled = false;
    loadPlayers().then(res => { if (!cancelled && res.data) setData(res.data); });
    return () => { cancelled = true; };
  }, [enabled, data]);
  return useMemo(() => {
    const idx = indexFor(data);
    return idx ? { ready: true, data, ...idx } : { ready: false, data: null, ...EMPTY };
  }, [data]);
}
