// Pure rekenkern voor de wekelijkse Verwachte XI's (zie .claude/skills/verwachte-xi/SKILL.md).
//
// Invoer: een kort JSON-bestand met per club enkel de formatie en de 11 namen (zoals ze op de
// afbeeldingen van Siebe staan). Deze module maakt daar exact de records van die de publieke tab
// verwacht (dezelfde vorm als een export van de privé XI-builder, zie src/predicted-xi/storage.js):
// posities en veldcoördinaten uit formations.js, de officiële spelersnaam, positie en prijs uit
// /api/players, de tegenstander uit de kalender. Daarnaast een lijst problemen die een mens moet
// bekijken (onbekende naam, verkeerd aantal spelers, ontbrekende club, ...).
//
// Geen bestanden, geen netwerk: dat doet build-predicted-lineups.mjs. Zo is alles hier testbaar.
import { FORMATIONS, POSITION_PRESETS } from '../../src/predicted-xi/formations.js';
import { FIXTURES, POSTPONED, TEAMS, getFixtureLegs } from '../../src/constants.js';
import { NAME_ALIASES } from './nameAliases.js';

export const SAFETY_LEVELS = ['darkgreen', 'green', 'orange', 'red'];

export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Zoekt bij een gelezen naam de echte speler, eerst binnen de club. `how` zegt hoe zeker dat is:
// 'exact' (de korte naam van de site), 'full' (volledige naam), 'part' (één deel van de volledige
// naam, uniek binnen de club), 'alias' (vaste koppeling uit nameAliases.js), 'fuzzy' (bijna gelijk: tikfout of leesfout), 'other-club' (enkel bij
// een andere club gevonden, bv. een recente transfer) of null (niets gevonden).
export function buildNameMatcher(apiPlayers) {
  const players = (apiPlayers ?? [])
    .filter(p => p && (p.short || p.name) && p.club)
    .map(p => ({
      name: String(p.short || p.name).trim(),
      fullName: String(p.name || p.short).trim(),
      club: String(p.club).toUpperCase(),
      pos: String(p.pos ?? '').toUpperCase(),
      price: Number.isFinite(p.price) ? p.price : null,
    }));

  function matchIn(pool, raw) {
    const n = normalizeName(raw);
    if (!n) return null;
    const exact = pool.filter(p => normalizeName(p.name) === n);
    if (exact.length === 1) return { player: exact[0], how: 'exact' };
    const full = pool.filter(p => normalizeName(p.fullName) === n);
    if (full.length === 1) return { player: full[0], how: 'full' };
    const part = pool.filter(p => {
      const parts = normalizeName(p.fullName).split(' ');
      const shortN = normalizeName(p.name);
      return parts.includes(n) || shortN.split(' ').includes(n) || ` ${normalizeName(p.fullName)} `.includes(` ${n} `);
    });
    if (part.length === 1) return { player: part[0], how: 'part' };
    let best = null;
    for (const p of pool) {
      for (const cand of [normalizeName(p.name), normalizeName(p.fullName)]) {
        const d = levenshtein(n, cand);
        const limit = Math.max(1, Math.floor(cand.length / 4));
        if (d <= limit && (!best || d < best.d)) best = { player: p, d };
      }
    }
    if (best) return { player: best.player, how: 'fuzzy' };
    if (exact.length > 1 || part.length > 1) return { player: null, how: null, ambiguous: (exact.length > 1 ? exact : part).map(p => p.fullName) };
    return null;
  }

  return function match(rawName, club) {
    const aliasKey = Object.keys(NAME_ALIASES[club] ?? {}).find(k => normalizeName(k) === normalizeName(rawName));
    if (aliasKey) {
      const target = players.find(p => p.club === club && p.name === NAME_ALIASES[club][aliasKey]);
      if (target) return { player: target, how: 'alias' };
    }
    const own = matchIn(players.filter(p => p.club === club), rawName);
    if (own?.player) return own;
    const other = matchIn(players, rawName);
    if (other?.player && (other.how === 'exact' || other.how === 'full')) return { player: other.player, how: 'other-club' };
    return { player: null, how: null, ambiguous: own?.ambiguous ?? null };
  };
}

// Hoe Siebe (LINEUP11-afbeeldingen, "VS ...") de clubs noemt, voor zover dat afwijkt van TEAMS.
const CLUB_ALIASES = {
  CLU: ['Club Brugge', 'Club'], GNK: ['KRC Genk', 'Genk'], GNT: ['KAA Gent', 'Gent'], LLV: ['La Louviere', 'RAAL'],
  STV: ['STVV', 'Sint-Truiden'], USG: ['Union', 'Union SG', 'Union Saint-Gilloise'], ZWA: ['Zulte Waregem', 'Essevee'],
  OHL: ['OH Leuven', 'OHL'], KVM: ['KV Mechelen', 'Mechelen'], KOR: ['KV Kortrijk', 'Kortrijk'],
};

// Klopt de tegenstander die op de afbeelding staat ("VS Anderlecht") met de clubcode?
export function sameClub(nameOnImage, code) {
  const n = normalizeName(nameOnImage);
  const names = [TEAMS.find(t => t.code === code)?.name, code, ...(CLUB_ALIASES[code] ?? [])].filter(Boolean).map(normalizeName);
  return names.some(x => x === n || x.includes(n) || n.includes(x));
}

// De tegenstander van een club in een speeldag ('' als er geen wedstrijd is of die uitgesteld is).
// Bij een dubbele speeldag de eerste wedstrijd, met een opmerking.
export function opponentFor(club, gw) {
  const entry = FIXTURES[club]?.[gw - 1];
  if (!entry) return { opponent: '', note: 'speelt niet deze speeldag' };
  if (POSTPONED.has(`${club}-${gw}`)) return { opponent: '', note: 'wedstrijd uitgesteld' };
  const legs = getFixtureLegs(entry);
  const opponent = String(legs[0]).split('-')[0];
  return { opponent, note: legs.length > 1 ? `dubbele speeldag (${legs.join(', ')}), eerste wedstrijd gebruikt` : null };
}

// Op Siebe's afbeeldingen staat onder een twijfelachtige basisspeler de kans dat een ander start
// ("Storm / 40% Congreve"). Die kans wordt de zekerheidskleur op de site. Schaal van de eigenaar, uitgedrukt
// in de kans dat de speler zelf start: 95-100% = zeker (darkgreen, geen percentage), 80% = basisspeler (green),
// 70% = twijfel (orange), 60% of minder = risico (red). In de invoer schrijf je de kans van de ANDERE speler:
// 20% = green, 30% = orange, 40% of meer = red.
export function safetyFromPercent(pct) {
  if (pct == null || !Number.isFinite(pct) || pct <= 0) return 'darkgreen';
  if (pct <= 20) return 'green';
  if (pct <= 35) return 'orange';
  return 'red';
}

// Een speler in de invoer: "Vanaken", "Storm 40%" (percentage van de alternatieve speler) of
// { name, pct } / { name, safety } (een expliciete safety wint).
function readPlayerEntry(entry) {
  if (typeof entry === 'string') {
    const m = entry.trim().match(/^(.*?)\s+(\d{1,3})\s*%$/);
    return m ? { name: m[1].trim(), safety: safetyFromPercent(Number(m[2])) } : { name: entry.trim(), safety: 'darkgreen' };
  }
  if (entry && typeof entry === 'object') {
    return { name: String(entry.name ?? '').trim(), safety: entry.safety ?? safetyFromPercent(Number(entry.pct)) };
  }
  return { name: '', safety: 'darkgreen' };
}

// input: { gw, lineups: { CLU: { vs, formation, players: [11 x naam, "naam 30%" of {name, pct}], notes? } } }
// `vs` is de tegenstander zoals op de afbeelding ("VS Anderlecht"); die wordt met de kalender vergeleken.
// De namen staan in de volgorde van FORMATIONS[formation].positionIds (keeper, verdediging van links
// naar rechts, middenveld van links naar rechts, aanval van links naar rechts).
export function buildLineups(input, apiPlayers, { now = Date.now(), makeId = () => crypto.randomUUID() } = {}) {
  const problems = [];
  const error = (club, msg) => problems.push({ club, level: 'fout', msg });
  const warn = (club, msg) => problems.push({ club, level: 'nakijken', msg });
  const info = (club, msg) => problems.push({ club, level: 'info', msg });

  const gw = Number(input?.gw);
  if (!Number.isInteger(gw) || gw < 1) {
    error('-', `"gw" ontbreekt of is geen geldige speeldag (${input?.gw})`);
    return { gw: null, lineups: [], problems };
  }

  const match = buildNameMatcher(apiPlayers);
  const given = input?.lineups && typeof input.lineups === 'object' ? input.lineups : {};
  const lineups = [];

  for (const team of TEAMS) {
    const club = team.code;
    const raw = given[club];
    const { opponent, note } = opponentFor(club, gw);
    if (!raw) {
      if (opponent) error(club, 'opstelling ontbreekt');
      else info(club, `geen opstelling (${note})`);
      continue;
    }
    if (!opponent) warn(club, `opstelling gegeven, maar ${note}`);
    if (note && opponent) info(club, note);
    if (typeof raw.vs === 'string' && opponent && !sameClub(raw.vs, opponent)) {
      error(club, `afbeelding zegt "VS ${raw.vs}", maar de kalender zegt ${opponent}: oude of Europese opstelling?`);
    }

    const formationKey = raw.formation;
    const formation = FORMATIONS[formationKey];
    if (!formation) {
      error(club, `onbekende formatie "${formationKey}" (kan: ${Object.keys(FORMATIONS).join(', ')})`);
      continue;
    }
    const entries = (Array.isArray(raw.players) ? raw.players : []).map(readPlayerEntry);
    if (entries.length !== 11) error(club, `${entries.length} spelers in plaats van 11`);

    const seen = new Set();
    const slots = formation.positionIds.map((positionId, i) => {
      const preset = POSITION_PRESETS[positionId];
      const base = {
        positionId, role: preset.label, broadPosition: preset.broadPosition,
        xPercent: preset.xPercent, yPercent: preset.yPercent,
      };
      const entry = entries[i];
      if (!entry?.name) return { ...base, playerName: '', playerTeamCode: '', playerPosition: '', playerPrice: null, safety: 'darkgreen' };

      let safety = entry.safety;
      if (!SAFETY_LEVELS.includes(safety)) {
        warn(club, `${entry.name}: onbekende zekerheid "${safety}", darkgreen gebruikt`);
        safety = 'darkgreen';
      }
      const m = match(entry.name, club);
      if (!m.player) {
        error(club, `"${entry.name}" niet gevonden in de spelerslijst${m.ambiguous ? ` (meerdere mogelijk: ${m.ambiguous.join(', ')})` : ''}`);
        return { ...base, playerName: entry.name, playerTeamCode: club, playerPosition: preset.broadPosition, playerPrice: null, safety };
      }
      const p = m.player;
      if (m.how === 'fuzzy' || m.how === 'part') warn(club, `"${entry.name}" gelezen als ${p.name} (${p.fullName}, ${p.pos}, ${p.price}M)`);
      if (m.how === 'other-club') warn(club, `"${entry.name}" staat bij ${p.club} in de spelerslijst, niet bij ${club}`);
      const key = `${p.name}|${p.club}`;
      if (seen.has(key)) error(club, `${p.name} staat twee keer in de opstelling`);
      seen.add(key);
      if (preset.broadPosition === 'GK' && p.pos !== 'GK') warn(club, `${p.name} (${p.pos}) staat in doel`);
      if (preset.broadPosition !== 'GK' && p.pos === 'GK') warn(club, `keeper ${p.name} staat op ${positionId}`);
      return { ...base, playerName: p.name, playerTeamCode: p.club, playerPosition: p.pos, playerPrice: p.price, safety };
    });

    lineups.push({
      id: makeId(),
      clubCode: club,
      opponentCode: opponent,
      formationKey,
      slots,
      notes: typeof raw.notes === 'string' ? raw.notes : '',
      label: '',
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const code of Object.keys(given)) {
    if (!TEAMS.some(t => t.code === code)) error(code, `onbekende clubcode "${code}"`);
  }

  return { gw, lineups, problems };
}

// Kandidaten voor de X-post bij de publicatie: wat veranderde t.o.v. de vorige verwachte XI's,
// beperkt tot spelers die managers kennen of hebben (eigendom `sel` >= minOwnership % of prijs >=
// minPrice). De reden (blessure, schorsing) staat niet in de data: die komt uit Siebe's berichten.
//   out:      stond vorige keer in de XI, nu niet
//   doubtful: staat nu in de XI met twijfel (orange) of risico (red)
//   back:     staat nu zeker/starter in de XI, en stond er vorige keer niet in of met twijfel/risico
export function postCandidates(oldLineups, newLineups, apiPlayers, { minOwnership = 5, minPrice = 8 } = {}) {
  const info = new Map((apiPlayers ?? []).map(p => [`${p.short || p.name}|${String(p.club).toUpperCase()}`, p]));
  const starters = (lineups) => {
    const map = new Map();
    for (const l of lineups ?? []) {
      for (const s of l.slots ?? []) {
        if (!s.playerName || s.positionId === '_unassigned') continue;
        map.set(`${s.playerName}|${s.playerTeamCode || l.clubCode}`, s.safety);
      }
    }
    return map;
  };
  const before = starters(oldLineups);
  const after = starters(newLineups);
  const clubsNow = new Set((newLineups ?? []).map(l => l.clubCode));
  const doubt = (s) => s === 'orange' || s === 'red';

  const describe = (key, extra) => {
    const [name, club] = key.split('|');
    const p = info.get(key);
    return { name, club, price: p?.price ?? null, sel: p?.sel ?? null, ...extra };
  };
  const relevant = (x) => (x.sel ?? 0) >= minOwnership || (x.price ?? 0) >= minPrice;
  const bySel = (a, b) => (b.sel ?? 0) - (a.sel ?? 0) || (b.price ?? 0) - (a.price ?? 0);

  const out = [...before.keys()]
    .filter(k => clubsNow.has(k.split('|')[1]) && !after.has(k))
    .map(k => describe(k, { before: before.get(k) }));
  const doubtful = [...after.entries()].filter(([, s]) => doubt(s)).map(([k, s]) => describe(k, { now: s, before: before.get(k) ?? null }));
  const back = [...after.entries()]
    .filter(([k, s]) => !doubt(s) && (!before.has(k) || doubt(before.get(k))))
    .map(([k, s]) => describe(k, { now: s, before: before.get(k) ?? null }));

  return {
    out: out.filter(relevant).sort(bySel),
    doubtful: doubtful.filter(relevant).sort(bySel),
    back: back.filter(relevant).sort(bySel),
  };
}
