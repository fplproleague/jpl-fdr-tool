import { describe, it, expect } from 'vitest';
import { suspensionFromWeekly } from './kaarten';
import { availabilityFor, buildAvailabilityLookup, isAvailable } from './availability';
import { playerDatabaseFromApi, findInDatabase } from './data/playerDatabase';

describe('suspensionFromWeekly', () => {
  it('5e gele kaart in de laatste speeldag = geschorst voor de volgende', () => {
    const w = { yc: [1, null, 1, 0, 1, 0, 0, 0, 1, 0, 1], rc: Array(11).fill(0) };
    expect(suspensionFromWeekly(w, 11)).toEqual({ gw: 12, cardGw: 11, cause: 'yellow', cards: 5 });
  });

  it('ook bij de 10e en 15e kaart, en bij twee kaarten over de drempel heen', () => {
    expect(suspensionFromWeekly({ yc: [5, 4, 1], rc: [0, 0, 0] }, 3)?.cards).toBe(10);
    expect(suspensionFromWeekly({ yc: [14, 1], rc: [0, 0] }, 2)?.cards).toBe(15);
    expect(suspensionFromWeekly({ yc: [4, 2], rc: [0, 0] }, 2)?.cause).toBe('yellow');
  });

  it('een schorsing uit een vroegere speeldag is uitgezeten', () => {
    expect(suspensionFromWeekly({ yc: [5, 0], rc: [0, 0] }, 2)).toBeNull();
    expect(suspensionFromWeekly({ yc: [3, 1], rc: [0, 0] }, 2)).toBeNull();
    expect(suspensionFromWeekly({ yc: [0, 0], rc: [1, 0] }, 2)).toBeNull();
  });

  it('rood in de laatste speeldag = geschorst (minstens 1 wedstrijd)', () => {
    expect(suspensionFromWeekly({ yc: [1, 0], rc: [null, 1] }, 2)).toEqual({ gw: 3, cardGw: 2, cause: 'red', cards: 1 });
  });

  it('zonder speeldagdata of met een ongeldige speeldag: niets', () => {
    expect(suspensionFromWeekly(null, 11)).toBeNull();
    expect(suspensionFromWeekly({ yc: [5], rc: [0] }, 0)).toBeNull();
  });
});

describe('availabilityFor', () => {
  const susp = { gw: 12, cardGw: 11, cause: 'yellow', cards: 5 };

  it('volgorde: geschorst > Verwachte XI > één kaart > niets', () => {
    expect(availabilityFor({ suspension: susp, yellowCards: 4, lineupSafety: 'red', lineupGw: 12 }).kind).toBe('suspended');
    expect(availabilityFor({ yellowCards: 4, lineupSafety: 'orange', lineupGw: 12 }).kind).toBe('doubt');
    expect(availabilityFor({ yellowCards: 4, lineupSafety: 'red', lineupGw: 12 }).kind).toBe('risk');
    expect(availabilityFor({ yellowCards: 4, lineupSafety: 'green', lineupGw: 12 }).kind).toBe('oneCard');
    expect(availabilityFor({ yellowCards: 9 }).kind).toBe('oneCard');
    expect(availabilityFor({ yellowCards: 3 })).toBeNull();
    expect(availabilityFor({ yellowCards: 5 })).toBeNull();
  });

  it('Verwachte XI telt enkel als ze gepubliceerd is (lineupGw)', () => {
    expect(availabilityFor({ lineupSafety: 'red', lineupGw: null })).toBeNull();
  });

  it('kleuren en teksten', () => {
    const s = availabilityFor({ suspension: { ...susp, cause: 'red' } });
    expect(s.tone).toBe('danger');
    expect(s.titleKey).toBe('availability.suspendedRed');
    expect(availabilityFor({ yellowCards: 4 }).tone).toBe('warning');
  });

  it('enkel geschorste spelers zijn "niet beschikbaar"', () => {
    expect(isAvailable(null)).toBe(true);
    expect(isAvailable(availabilityFor({ yellowCards: 4 }))).toBe(true);
    expect(isAvailable(availabilityFor({ suspension: susp }))).toBe(false);
  });
});

describe('spelersdatabank uit /api/players', () => {
  const body = {
    gw: 2,
    players: [
      { id: 1, name: 'Hans Vanaken', short: 'Vanaken', club: 'CLU', pos: 'MID', price: 11.5, yc: 5, rc: 0, dw: 10, dl: 4, hc: 2, br: 30, bc: 3, bp: 4, mp: 2, w: { yc: [4, 1], rc: [0, 0] } },
      { id: 2, name: 'Simon Mignolet', short: 'Mignolet', club: 'CLU', pos: 'GK', price: 6, yc: 0, rc: 0, dw: 1, dl: 0, hc: 0, br: 20, bc: 0, bp: 1, mp: 2, w: null },
      { id: 3, name: 'Zéno Debast', short: 'Debast', club: 'AND', pos: 'DEF', price: 6.5, yc: 4, rc: 0, mp: 2, w: { yc: [2, 2], rc: [0, 0] } },
    ],
  };
  const db = playerDatabaseFromApi(body);

  it('zelfde formaat als de sheet, met de korte naam als naam', () => {
    expect(db[0]).toMatchObject({
      id: 1, name: 'Vanaken', fullName: 'Hans Vanaken', teamCode: 'CLU', position: 'MID', price: 11.5,
      yellowCards: 5, duelsWon: 10, duelsLost: 4, headers: 2, recoveries: 30, bigChances: 3, bonusPoints: 4, games: 2,
    });
    expect(db[0].suspension).toEqual({ gw: 3, cardGw: 2, cause: 'yellow', cards: 5 });
  });

  it('recoveries van keepers tellen niet (zoals in de sheet)', () => {
    expect(db[1].recoveries).toBe(0);
  });

  it('opzoeken: exact, dan korte of volledige naam zonder accenten; anders null', () => {
    expect(findInDatabase(db, 'Vanaken', 'CLU')?.id).toBe(1);
    expect(findInDatabase(db, 'hans vanaken', 'clu')?.id).toBe(1);
    expect(findInDatabase(db, 'Zeno Debast', 'AND')?.id).toBe(3);
    expect(findInDatabase(db, 'Vanaken', 'AND')).toBeNull();
    expect(findInDatabase(db, 'Vanakn', 'CLU')).toBeNull();
  });

  it('beschikbaarheid op korte en volledige naam', () => {
    const lookup = buildAvailabilityLookup(db);
    expect(lookup('Vanaken', 'CLU')?.kind).toBe('suspended');
    expect(lookup('Hans Vanaken', 'CLU')?.kind).toBe('suspended');
    expect(lookup('Debast', 'AND')?.kind).toBe('oneCard');
    expect(lookup('Mignolet', 'CLU')).toBeNull();
  });

  it('twijfel uit gepubliceerde Verwachte XI', () => {
    const lineups = [{ clubCode: 'CLU', slots: [{ playerName: 'Mignolet', playerTeamCode: 'CLU', safety: 'orange', positionId: 'GK' }] }];
    expect(buildAvailabilityLookup(db, { lineups, lineupGw: 3 })('Mignolet', 'CLU')?.kind).toBe('doubt');
    expect(buildAvailabilityLookup(db, { lineups: null })('Mignolet', 'CLU')).toBeNull();
  });
});
