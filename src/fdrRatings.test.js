import { describe, it, expect } from 'vitest';
import {
  applyOverrides, diffFromDefaults, setOverride, migrateRatingsV1, migrateHomeV1, loadOverrides,
  decodeRatingsParam, encodeRatingsParam, decodeHomeParam,
  RATINGS_V1_KEY, HOME_V1_KEY, RATINGS_OVERRIDES_KEY, HOME_OVERRIDES_KEY,
} from './fdrRatings';
import { DEFAULT_RATINGS, PREVIOUS_DEFAULT_RATINGS, DEFAULT_HOME_ADVANTAGE, TEAMS } from './constants';

const CODES = TEAMS.map(t => t.code);

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
  };
}

// Een echte v1-waarde zoals de oude site die wegschreef: alle 18 clubs, met de toen geldende
// standaard (ZWA 3, CHA 3) en één eigen aanpassing (Club Brugge op 4).
const V1_EXAMPLE = { ...PREVIOUS_DEFAULT_RATINGS, CLU: 4 };

describe('migrateRatingsV1', () => {
  it('houdt enkel echte afwijkingen over', () => {
    expect(migrateRatingsV1(V1_EXAMPLE, DEFAULT_RATINGS, PREVIOUS_DEFAULT_RATINGS)).toEqual({ CLU: 4 });
  });

  it('een club op de oude standaard volgt de nieuwe standaard', () => {
    const migrated = migrateRatingsV1(V1_EXAMPLE, DEFAULT_RATINGS, PREVIOUS_DEFAULT_RATINGS);
    const effective = applyOverrides(DEFAULT_RATINGS, migrated);
    expect(effective.CHA).toBe(4);
    expect(effective.ZWA).toBe(2);
  });

  it('een bewuste afwijking van beide standaarden blijft staan', () => {
    const v1 = { ...PREVIOUS_DEFAULT_RATINGS, CHA: 5 };
    expect(migrateRatingsV1(v1, DEFAULT_RATINGS, PREVIOUS_DEFAULT_RATINGS)).toEqual({ CHA: 5 });
  });

  it('negeert rommel zonder te crashen', () => {
    expect(migrateRatingsV1(null, DEFAULT_RATINGS)).toEqual({});
    expect(migrateRatingsV1([1, 2], DEFAULT_RATINGS)).toEqual({});
    expect(migrateRatingsV1({ CLU: 9, AND: 'x', XXX: 2 }, DEFAULT_RATINGS)).toEqual({});
  });
});

describe('migrateHomeV1', () => {
  it('bewaart enkel clubs met thuisvoordeel aan', () => {
    const v1 = { ...DEFAULT_HOME_ADVANTAGE, CLU: true };
    expect(migrateHomeV1(v1, DEFAULT_HOME_ADVANTAGE)).toEqual({ CLU: true });
  });
});

describe('loadOverrides', () => {
  const opts = { defaultRatings: DEFAULT_RATINGS, defaultHome: DEFAULT_HOME_ADVANTAGE, previousDefaultRatings: PREVIOUS_DEFAULT_RATINGS };

  it('migreert één keer uit v1, schrijft v2 en laat v1 staan', () => {
    const v1Raw = JSON.stringify(V1_EXAMPLE);
    const storage = memoryStorage({
      [RATINGS_V1_KEY]: v1Raw,
      [HOME_V1_KEY]: JSON.stringify({ ...DEFAULT_HOME_ADVANTAGE, GNK: true }),
    });
    const result = loadOverrides(storage, opts);
    expect(result).toEqual({ ratings: { CLU: 4 }, home: { GNK: true } });
    expect(JSON.parse(storage.data[RATINGS_OVERRIDES_KEY])).toEqual({ CLU: 4 });
    expect(JSON.parse(storage.data[HOME_OVERRIDES_KEY])).toEqual({ GNK: true });
    expect(storage.data[RATINGS_V1_KEY]).toBe(v1Raw);
  });

  it('leest daarna enkel nog v2', () => {
    const storage = memoryStorage({
      [RATINGS_V1_KEY]: JSON.stringify({ ...DEFAULT_RATINGS, CLU: 1 }),
      [RATINGS_OVERRIDES_KEY]: JSON.stringify({}),
      [HOME_OVERRIDES_KEY]: JSON.stringify({}),
    });
    expect(loadOverrides(storage, opts)).toEqual({ ratings: {}, home: {} });
  });

  it('zonder opslag: geen afwijkingen', () => {
    expect(loadOverrides(memoryStorage(), opts)).toEqual({ ratings: {}, home: {} });
    expect(loadOverrides(null, opts)).toEqual({ ratings: {}, home: {} });
  });
});

describe('setOverride en diffFromDefaults', () => {
  it('terugzetten naar de standaard telt niet meer als aangepast', () => {
    let o = setOverride({}, DEFAULT_RATINGS, 'CLU', 3);
    expect(o).toEqual({ CLU: 3 });
    o = setOverride(o, DEFAULT_RATINGS, 'CLU', DEFAULT_RATINGS.CLU);
    expect(o).toEqual({});
  });

  it('een volledige gedeelde set wordt enkel afwijkingen', () => {
    expect(diffFromDefaults({ ...DEFAULT_RATINGS, AND: 2 }, DEFAULT_RATINGS)).toEqual({ AND: 2 });
  });
});

describe('deellinks', () => {
  it('codeert en decodeert een volledige set (oude links blijven werken)', () => {
    const encoded = encodeRatingsParam(CODES, DEFAULT_RATINGS);
    expect(decodeRatingsParam(encoded, CODES)).toEqual(DEFAULT_RATINGS);
  });

  it('een onvolledige link wordt genegeerd', () => {
    expect(decodeRatingsParam('CLU5-AND4', CODES)).toBeNull();
    expect(decodeHomeParam('0101', CODES)).toBeNull();
  });
});
