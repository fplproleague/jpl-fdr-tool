import { describe, expect, it } from 'vitest';
import { contentHash, fitFontSize, formatOgPrice, ogImagePath, upcomingFixtures } from './ogCards.js';
import { DEFAULT_RATINGS, FIXTURES, GW_COUNT, POSTPONED } from './constants.js';
import { t } from './i18n.js';
import { ROUTES, SUPPORTED_LANGUAGES } from './routes.js';

describe('upcomingFixtures', () => {
  it('geeft vijf vakken vanaf de gevraagde speeldag, met de standaard-FDR', () => {
    const cells = upcomingFixtures('CLU', 12);
    expect(cells.map(c => c.gw)).toEqual([12, 13, 14, 15, 16]);
    const first = cells[0];
    const [opp, venue] = FIXTURES.CLU[11].split('-');
    expect(first).toMatchObject({ kind: 'single', opp, venue, rating: DEFAULT_RATINGS[opp] });
  });

  it('stopt na de laatste speeldag', () => {
    expect(upcomingFixtures('CLU', GW_COUNT - 1).map(c => c.gw)).toEqual([GW_COUNT - 1, GW_COUNT]);
  });

  it('toont een uitgestelde wedstrijd als uitgesteld', () => {
    const key = [...POSTPONED][0];
    const [code, gw] = key.split('-');
    expect(upcomingFixtures(code, Number(gw), 1)[0]).toEqual({ gw: Number(gw), kind: 'postponed' });
  });

  it('toont een dubbele speeldag met twee tegenstanders', () => {
    const [code, list] = Object.entries(FIXTURES).find(([c, l]) => l.some((f, i) => Array.isArray(f) && !POSTPONED.has(`${c}-${i + 1}`)));
    const gw = list.findIndex((f, i) => Array.isArray(f) && !POSTPONED.has(`${code}-${i + 1}`)) + 1;
    const cell = upcomingFixtures(code, gw, 1)[0];
    expect(cell.kind).toBe('double');
    expect(cell.legs).toHaveLength(2);
  });
});

describe('formatOgPrice', () => {
  it('toont een prijs met één cijfer na de komma', () => {
    expect(formatOgPrice(8)).toBe('€8.0M');
    expect(formatOgPrice('6.5')).toBe('€6.5M');
  });
  it('geeft niets voor een ontbrekende prijs', () => {
    expect(formatOgPrice(null)).toBeNull();
    expect(formatOgPrice('')).toBeNull();
    expect(formatOgPrice('abc')).toBeNull();
  });
});

describe('fitFontSize', () => {
  it('blijft binnen min en max', () => {
    expect(fitFontSize('FDR', { width: 1000, max: 168 })).toBe(168);
    expect(fitFontSize('X'.repeat(200), { width: 1000, max: 168, min: 72 })).toBe(72);
  });
  it('maakt een langere naam kleiner', () => {
    expect(fitFontSize('Van Den Kerkhof', { width: 800, max: 150 }))
      .toBeLessThan(fitFontSize('Vanaken', { width: 800, max: 150 }));
  });
});

describe('contentHash en ogImagePath', () => {
  it('verandert enkel als de inhoud verandert', () => {
    expect(contentHash({ a: 1 })).toBe(contentHash({ a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
  it('legt het pad van de afbeelding naast dat van de pagina', () => {
    expect(ogImagePath('/fr/speler/clu-vanaken')).toBe('/og/fr/speler/clu-vanaken.png');
  });
});

describe('teksten van de cards', () => {
  it('bestaan in elke taal', () => {
    const keys = ['og.home.tagline', 'og.club.tagline', 'og.nextFixtures', ...ROUTES.map(r => `og.${r.key}.tagline`)];
    for (const key of keys) expect(t('nl', key), key).not.toBe(key);
    // t() valt terug op het Nederlands: een vertaling die ontbreekt, is dus gelijk aan de Nederlandse tekst.
    for (const language of SUPPORTED_LANGUAGES.filter(l => l !== 'nl')) {
      for (const key of keys) expect(t(language, key), `${language} ${key}`).not.toBe(t('nl', key));
    }
  });
});
