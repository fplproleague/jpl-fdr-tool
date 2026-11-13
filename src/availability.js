// Eén beschikbaarheidsstatus per speler, berekend op één plek (spec B3). Volgorde (de eerste die past):
//   1. geschorst: rood of een 5e/10e/15e gele kaart in de laatst gespeelde speeldag (spec B2)
//   2. twijfel of risico: zo aangeduid in de Verwachte XI's van de komende speeldag (enkel als die
//      gepubliceerd zijn)
//   3. nog één gele kaart tot een schorsing
//   4. niets
// Blessures staan hier bewust niet in: de eigenaar wil die niet uit de Fantasy Pro League-data halen
// (beslissing 13 november 2026). Komt dat ooit terug, dan hoort het als eerste stap bovenaan.
//
// Het resultaat is data, geen tekst: { kind, tone, labelKey, titleKey, vars }. De schermen vertalen de
// sleutels met t(). tone 'danger' = rood (--danger), 'warning' = oranje (--warning).
import { cardsUntilSuspension } from './kaarten';
import { normalizePlayerName } from './data/usePlayerIndex';

export const AVAILABILITY_KINDS = ['suspended', 'doubt', 'risk', 'oneCard'];

// Startzekerheid uit de Verwachte XI's (zelfde sleutels als de builder): oranje = twijfel, rood = risico.
const SAFETY_TO_KIND = { orange: 'doubt', red: 'risk' };

export function availabilityFor({ suspension = null, yellowCards = 0, lineupSafety = null, lineupGw = null } = {}) {
  if (suspension) {
    return {
      kind: 'suspended',
      tone: 'danger',
      labelKey: 'availability.suspended',
      titleKey: suspension.cause === 'red' ? 'availability.suspendedRed' : 'availability.suspendedYellow',
      vars: { gw: suspension.gw, cardGw: suspension.cardGw, cards: suspension.cards },
    };
  }
  const lineupKind = SAFETY_TO_KIND[lineupSafety];
  if (lineupKind && lineupGw) {
    return {
      kind: lineupKind,
      tone: 'warning',
      labelKey: `availability.${lineupKind}`,
      titleKey: `availability.${lineupKind}Title`,
      vars: { gw: lineupGw },
    };
  }
  if (yellowCards > 0 && cardsUntilSuspension(yellowCards) === 1) {
    return {
      kind: 'oneCard',
      tone: 'warning',
      labelKey: 'availability.oneCard',
      titleKey: 'availability.oneCardTitle',
      vars: { cards: yellowCards, threshold: yellowCards + 1 },
    };
  }
  return null;
}

// "Enkel beschikbare spelers": wie geschorst is, valt weg. Twijfel, risico en één kaart van een
// schorsing blijven staan: die spelers mogen nog spelen, het is enkel een waarschuwing.
export function isAvailable(status) {
  return !status || status.kind !== 'suspended';
}

const keyFor = (name, club) => `${normalizePlayerName(name)}|${String(club ?? '').toUpperCase()}`;

// Bouwt een opzoekfunctie (naam, club) -> status voor alle spelers in de databank. Werkt met de korte
// naam (zoals in de sheet en de opslag) én met de volledige naam (zoals in de Spelers-tabel).
// lineups = PREDICTED_LINEUPS, enkel doorgeven als ze voor de komende speeldag gepubliceerd zijn.
// De stip (darkgreen/green/orange/red) van elke speler in de Verwachte XI's, als opzoekfunctie
// (naam, club) -> stip of null. Ook gebruikt door de opstellingsscore van de Team Planner (C6).
export function buildLineupSafetyLookup(lineups = null) {
  const safety = new Map();
  for (const lineup of lineups ?? []) {
    for (const slot of lineup.slots ?? []) {
      if (!slot?.playerName || slot.positionId === '_unassigned') continue;
      safety.set(keyFor(slot.playerName, slot.playerTeamCode ?? lineup.clubCode), slot.safety);
    }
  }
  return (name, club) => (name && club ? safety.get(keyFor(name, club)) ?? null : null);
}

export function buildAvailabilityLookup(playerDatabase = [], { lineups = null, lineupGw = null } = {}) {
  const safetyOf = buildLineupSafetyLookup(lineups);
  const byKey = new Map();
  for (const p of playerDatabase) {
    const status = availabilityFor({
      suspension: p.suspension ?? null,
      yellowCards: p.yellowCards ?? 0,
      lineupSafety: safetyOf(p.name, p.teamCode),
      lineupGw,
    });
    if (!status) continue;
    byKey.set(keyFor(p.name, p.teamCode), status);
    if (p.fullName) byKey.set(keyFor(p.fullName, p.teamCode), status);
  }
  return (name, club) => (name && club ? byKey.get(keyFor(name, club)) ?? null : null);
}
