import { describe, it, expect } from 'vitest';
import { FORM_GWS, buildRow, formAverage, formatCell, formatForm, sortRows, stateFromSearch } from './spelers';

describe('vorm als gemiddelde (spec E4)', () => {
  it('is het gemiddelde per speeldag over de laatste 5 speeldagen', () => {
    // 10 speeldagen gespeeld; de laatste 5 = 6 + 2 + 0 + 12 + 10 = 30 → 6 per speeldag.
    const pts = [1, 1, 1, 1, 1, 6, 2, 0, 12, 10];
    expect(FORM_GWS).toBe(5);
    expect(formAverage(pts, 10)).toBe(6);
  });

  it('deelt vroeg in het seizoen door het aantal gespeelde speeldagen', () => {
    expect(formAverage([4, 8], 2)).toBe(6);
  });

  it('telt een speeldag zonder punten mee als 0', () => {
    expect(formAverage([0, 0, 0, 0, 5], 5)).toBe(1);
  });

  it('geeft null zonder weekreeks of zonder gespeelde speeldag', () => {
    expect(formAverage(undefined, 5)).toBeNull();
    expect(formAverage([3], 0)).toBeNull();
  });

  it('toont één decimaal', () => {
    expect(formatForm(6)).toBe('6.0');
    expect(formatForm(31 / 5)).toBe('6.2');
    expect(formatForm(null)).toBeNull();
    expect(formatCell(31 / 5, 'form')).toBe('6.2');
  });

  it('zit in elke tabelrij en sorteert van hoog naar laag', () => {
    const a = buildRow({ name: 'A', price: 6, pts: 30, w: { pts: [0, 0, 0, 0, 0, 6, 6, 6, 6, 6] } }, 'season', 10);
    const b = buildRow({ name: 'B', price: 6, pts: 30, w: { pts: [10, 10, 10, 0, 0, 0, 0, 0, 0, 0] } }, 'season', 10);
    expect(a.form).toBe(6);
    expect(b.form).toBe(0);
    expect(sortRows([b, a], 'form', 'desc', 'total').map(r => r.name)).toEqual(['A', 'B']);
  });

  it('oude links met sort=form blijven werken', () => {
    expect(stateFromSearch('?sort=form').sort).toBe('form');
  });
});
