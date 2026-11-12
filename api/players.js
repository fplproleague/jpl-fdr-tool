// Serverfunctie achter de Spelers-tab: één compact overzicht van alle Fantasy Pro League-spelers met
// hun seizoenstotalen én hun punten/minuten/goals/assists/bonus per speeldag (voor de vormfilter en de
// sparkline). Bron: de publieke API van fantasy.proleague.be (zie api/_lib/proleague.js).
//
// Response:
//   { season: '2026-27', gw: 11, deadlineGw: 12, updatedAt, stale: false, players: [ ... ] }
//   gw = laatst gespeelde speeldag (deadlineInfo.displayWeek). Per speler:
//   - id, name, short, club (sitecode), pos (GK/DEF/MID/FWD), price, photo (of null)
//   - pts (officieel totaal), mp (wedstrijden), min, g, a, cs, yc, rc, sv (saves), ps (gestopte
//     penalty's), gc (tegengoals), og (eigen goals), pm (gemiste penalty's)
//   - bp (zelf berekende bonuspunten) + bpDuels/bpHeaders/bpRecoveries/bpBigChances (per voorwaarde)
//   - dw/dl (duels gewonnen/verloren), hc (verdedigende kopballen), br (recoveries),
//     bc (grote kansen gecreëerd), int (interceptions)
//   - sel (% managers), cap (% kapitein)
//   - w: { pts, min, g, a, bp } — arrays met één waarde per speeldag (index 0 = GW1), null = niet
//     gespeeld. Ontbreekt (null) voor spelers die nog geen minuut speelden.
//
// Caching: speeldagen die de bron als definitief bevestigt (points-confirmation) veranderen niet meer
// en blijven per serverinstantie in het geheugen. Het hele antwoord staat een uur vers op Vercels CDN
// en mag daarna nog een dag "stale" geserveerd worden terwijl op de achtergrond ververst wordt.
// Lukt het ophalen niet, dan krijgt de bezoeker het laatste geldige antwoord (stale: true) i.p.v. een fout.

import {
  POSITIONS, SEASON_ID, bonusForMatch, fetchAllStats, fetchClubs, fetchJson, list, num, photoUrl,
  seasonLabel, sendJson, siteClubCode,
} from './_lib/proleague.js';

const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_STALE = 'public, s-maxage=120, stale-while-revalidate=86400';
const CACHE_ERROR = 'public, s-maxage=60';

const confirmedWeeks = new Map(); // weekId -> rijen, enkel voor definitief bevestigde speeldagen
let lastGood = null;

async function fetchWeek(weekId, confirmed) {
  if (confirmed && confirmedWeeks.has(weekId)) return confirmedWeeks.get(weekId);
  const rows = await fetchAllStats({ weekId });
  if (confirmed) confirmedWeeks.set(weekId, rows);
  return rows;
}

// Max. 6 speeldagen tegelijk ophalen: snel genoeg, zonder de bron met 30 gelijktijdige requests te
// bestoken op het moment dat de cache leeg is.
async function fetchWeeks(weekIds, confirmedSet) {
  const result = new Map();
  for (let i = 0; i < weekIds.length; i += 6) {
    const batch = weekIds.slice(i, i + 6);
    const rows = await Promise.all(batch.map(w => fetchWeek(w, confirmedSet.has(w))));
    batch.forEach((w, idx) => result.set(w, rows[idx]));
  }
  return result;
}

function emptyWeekly(gw) {
  return { pts: Array(gw).fill(null), min: Array(gw).fill(null), g: Array(gw).fill(null), a: Array(gw).fill(null), bp: Array(gw).fill(null) };
}

const add = (arr, idx, value) => { arr[idx] = (arr[idx] ?? 0) + value; };

export function buildPlayers({ players, clubs, seasonStats, weeks, gw }) {
  // Per speler: speeldag-reeksen + bonuspunten, opgeteld per wedstrijd (een dubbele speeldag telt dus
  // twee wedstrijden in dezelfde GW-cel).
  const weekly = new Map();
  for (const [weekId, rows] of weeks) {
    const idx = weekId - 1;
    if (idx < 0 || idx >= gw) continue;
    for (const row of rows) {
      const id = num(row?.playerId);
      if (!id) continue;
      let entry = weekly.get(id);
      if (!entry) {
        entry = { w: emptyWeekly(gw), bp: 0, bpDuels: 0, bpHeaders: 0, bpRecoveries: 0, bpBigChances: 0 };
        weekly.set(id, entry);
      }
      const bonus = bonusForMatch({
        duelWon: row.statDuelWon, duelLost: row.statDuelLost, headClearance: row.statHeadClearance,
        ballRecovery: row.statBallRecovery, bigChanceCreated: row.statBigChanceCreated,
      });
      add(entry.w.pts, idx, num(row.total));
      add(entry.w.min, idx, num(row.statTimePlayed));
      add(entry.w.g, idx, num(row.statGoals));
      add(entry.w.a, idx, num(row.statAssists));
      add(entry.w.bp, idx, bonus.total);
      entry.bp += bonus.total;
      entry.bpDuels += bonus.duels;
      entry.bpHeaders += bonus.headers;
      entry.bpRecoveries += bonus.recoveries;
      entry.bpBigChances += bonus.bigChances;
    }
  }

  const statsById = new Map();
  for (const row of seasonStats) {
    const id = num(row?.playerId);
    if (id) statsById.set(id, row);
  }

  return players
    .filter(p => p?.id != null && p?.name)
    .map(p => {
      const s = statsById.get(p.id) ?? {};
      const w = weekly.get(p.id);
      const club = clubs.get(p.clubId)?.code ?? siteClubCode(s.clubShort);
      return {
        id: p.id,
        name: String(p.name).trim(),
        short: String(p.short ?? '').trim(),
        club,
        pos: POSITIONS[p.positionId] ?? POSITIONS[s.positionId] ?? '',
        price: num(p.value ?? s.playerValue),
        photo: photoUrl(p.portraitUrl),
        pts: num(s.total),
        mp: num(s.statMatchPlayed),
        min: num(s.statTimePlayed),
        g: num(s.statGoals),
        a: num(s.statAssists),
        cs: num(s.statCleanSheet),
        yc: num(s.statYellow),
        rc: num(s.statRed),
        sv: num(s.statSaves),
        ps: num(s.statPenaltySave),
        pm: num(s.statPenaltyMiss),
        gc: num(s.statConceeded),
        og: num(s.statOwnGoal),
        bp: w?.bp ?? 0,
        bpDuels: w?.bpDuels ?? 0,
        bpHeaders: w?.bpHeaders ?? 0,
        bpRecoveries: w?.bpRecoveries ?? 0,
        bpBigChances: w?.bpBigChances ?? 0,
        dw: num(s.statDuelWon),
        dl: num(s.statDuelLost),
        hc: num(s.statHeadClearance),
        br: num(s.statBallRecovery),
        bc: num(s.statBigChanceCreated),
        int: num(s.statInterception),
        sel: num(s.statPicked),
        cap: num(s.statCapped),
        w: w?.w ?? null,
      };
    });
}

export default async function handler(req, res) {
  try {
    const [deadline, confirmations] = await Promise.all([
      fetchJson('matches/deadline-info'),
      fetchJson('points-confirmation').catch(() => []),
    ]);
    const gw = num(deadline?.deadlineInfo?.displayWeek);
    if (gw < 0 || gw > 40) throw new Error(`onverwachte speeldag in deadline-info: ${gw}`);
    const confirmedSet = new Set(list(confirmations).filter(c => num(c?.confirmed) === 1).map(c => num(c.weekId)));
    const weekIds = Array.from({ length: gw }, (_, i) => i + 1);

    const [playersBody, clubs, seasonStats, weeks] = await Promise.all([
      fetchJson('players'),
      fetchClubs(),
      fetchAllStats(),
      fetchWeeks(weekIds, confirmedSet),
    ]);
    const players = buildPlayers({ players: list(playersBody?.players), clubs, seasonStats, weeks, gw });
    if (players.length === 0) throw new Error('de bron gaf geen spelers terug');

    const body = {
      season: seasonLabel(SEASON_ID),
      gw,
      deadlineGw: num(deadline?.deadlineInfo?.deadlineWeek) || null,
      updatedAt: new Date().toISOString(),
      stale: false,
      players,
    };
    lastGood = body;
    return sendJson(res, 200, body, CACHE_OK);
  } catch (err) {
    const message = String(err?.message ?? err);
    if (lastGood) return sendJson(res, 200, { ...lastGood, stale: true, error: message }, CACHE_STALE);
    return sendJson(res, 502, { error: message }, CACHE_ERROR);
  }
}
