import { describe, it, expect } from 'vitest';
import {
  quickPeriod, activeQuickPeriod, normalizePeriod, loadFdrPeriod, saveFdrPeriod,
  parseClubsParam, isClubFilterActive, FDR_PERIOD_STORAGE_KEY,
} from './fdrPeriod';
import { fixtureFactorFor, FIXTURE_FACTOR } from './lineupScore';
import { FIXTURES, GW_COUNT, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE, getFixtureLegs, getEffectiveRating, POSTPONED } from './constants';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    data,
  };
}

describe('FDR-periode (D2)', () => {
  it('"Volgende n" begint bij de huidige speeldag en stopt aan het seizoenseinde', () => {
    expect(quickPeriod(5, 12, 34)).toEqual({ start: 12, end: 16 });
    expect(quickPeriod(8, 30, 34)).toEqual({ start: 30, end: 34 });
  });

  it('de snelknop licht enkel op bij een exacte match', () => {
    expect(activeQuickPeriod({ start: 12, end: 19 }, 12, 34)).toBe(8);
    expect(activeQuickPeriod({ start: 12, end: 14 }, 12, 34)).toBe(3);
    expect(activeQuickPeriod({ start: 13, end: 15 }, 12, 34)).toBe(null);
    expect(activeQuickPeriod({ start: 12, end: 18 }, 12, 34)).toBe(null);
    // Op het einde vallen 5 en 8 samen: de kleinste wint.
    expect(activeQuickPeriod({ start: 31, end: 34 }, 31, 34)).toBe(5);
  });

  it('normaliseert een omgekeerde of te grote periode', () => {
    expect(normalizePeriod(20, 12, 34)).toEqual({ start: 12, end: 20 });
    expect(normalizePeriod(0, 99, 34)).toEqual({ start: 1, end: 34 });
  });

  it('onthoudt de periode per sessie en valt terug op de standaard', () => {
    const fallback = { start: 12, end: 19 };
    const storage = memoryStorage();
    expect(loadFdrPeriod(storage, fallback, 34)).toBe(fallback);
    saveFdrPeriod(storage, { start: 14, end: 18 });
    expect(loadFdrPeriod(storage, fallback, 34)).toEqual({ start: 14, end: 18 });
    expect(loadFdrPeriod(memoryStorage({ [FDR_PERIOD_STORAGE_KEY]: '{kapot' }), fallback, 34)).toBe(fallback);
    expect(loadFdrPeriod(null, fallback, 34)).toBe(fallback);
    const throwing = { getItem: () => { throw new Error('geblokkeerd'); } };
    expect(loadFdrPeriod(throwing, fallback, 34)).toBe(fallback);
  });
});

describe('clubfilter (D3)', () => {
  const codes = ['AND', 'CLU', 'GNK', 'STV'];
  it('leest ?clubs= en negeert onbekende of dubbele codes', () => {
    expect(parseClubsParam('clu,AND,XXX,clu', codes)).toEqual(['CLU', 'AND']);
    expect(parseClubsParam('', codes)).toEqual([]);
    expect(parseClubsParam(null, codes)).toEqual([]);
  });
  it('is enkel actief met een deel van de clubs', () => {
    expect(isClubFilterActive([], 4)).toBe(false);
    expect(isClubFilterActive(['AND'], 4)).toBe(true);
    expect(isClubFilterActive(codes, 4)).toBe(false);
  });
});

describe('dubbele speeldag in de spelersscore (D1)', () => {
  it('telt in de opstellingsscore als twee wedstrijden', () => {
    // Zoek een echte DGW in de kalender; zonder DGW is er niets om te controleren.
    let found = null;
    Object.entries(FIXTURES).forEach(([code, list]) => {
      list.forEach((f, i) => {
        if (!found && getFixtureLegs(f).length === 2 && !POSTPONED.has(`${code}-${i + 1}`)) found = { code, gw: i + 1, f };
      });
    });
    if (!found) return;
    const expected = getFixtureLegs(found.f).reduce((sum, leg) => {
      const [opp, venue] = String(leg).split('-');
      return sum + FIXTURE_FACTOR[getEffectiveRating(opp, venue, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE)];
    }, 0);
    expect(found.gw).toBeLessThanOrEqual(GW_COUNT);
    expect(fixtureFactorFor(found.code, found.gw, DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE)).toBeCloseTo(expected);
  });
});
