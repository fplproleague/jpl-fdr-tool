import { describe, it, expect } from 'vitest';
import { FORM_GWS, PAGE_DEFAULTS, buildRow, cellValue, formAverage, formatCell, formatForm, searchFromState, sortRows, stateFromSearch } from './spelers';
import { searchForTab } from './routes';

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

describe('Bonuspunten en Kaarten op de Spelers-tabel (spec E3)', () => {
  const row = (name, yc, pts = 0) => ({ name, yc, pts });

  it('Kaarten: dichtst bij schorsing eerst, bij gelijke afstand de meeste kaarten eerst', () => {
    const rows = [row('A', 0), row('B', 4), row('C', 9), row('D', 6), row('E', 3)];
    const sorted = sortRows(rows, 'toSusp', 'asc', 'total').map(r => r.name);
    // B en C: nog 1 kaart (C heeft er meer), E: 2, D: 4, A: 5.
    expect(sorted).toEqual(['C', 'B', 'E', 'D', 'A']);
    expect(cellValue(row('X', 5), 'toSusp', 'total')).toBe(5);
  });

  it('duelsaldo met teken', () => {
    expect(formatCell(cellValue({ dw: 12, dl: 9 }, 'dd', 'total'), 'dd', 'total')).toBe('+3');
    expect(formatCell(cellValue({ dw: 2, dl: 5 }, 'dd', 'total'), 'dd', 'total')).toBe('-3');
  });

  it('een pagina zonder parameters krijgt haar eigen standaard, en die komt niet in de URL', () => {
    const bonus = stateFromSearch('', PAGE_DEFAULTS.bonuspunten);
    expect(bonus).toMatchObject({ cols: 'bonus', sort: 'bp', dir: 'desc' });
    expect(searchFromState(bonus, '', PAGE_DEFAULTS.bonuspunten)).toBe('');
    const kaarten = stateFromSearch('', PAGE_DEFAULTS.kaarten);
    expect(kaarten).toMatchObject({ cols: 'cards', sort: 'toSusp', dir: 'asc' });
    expect(searchFromState(kaarten, '', PAGE_DEFAULTS.kaarten)).toBe('');
    // Spelers blijft zoals het was.
    expect(stateFromSearch('')).toMatchObject({ cols: 'overview', sort: 'pts', dir: 'desc' });
  });

  it('filters van Spelers gaan niet mee naar Bonuspunten of Kaarten', () => {
    expect(searchForTab('?cols=attack&q=van', 'bonuspunten', 'spelers')).toBe('');
    expect(searchForTab('?cols=attack&q=van', 'spelers', 'spelers')).toBe('?cols=attack&q=van');
    expect(searchForTab('?pos=MID&r=abc', 'fdr', 'spelers')).toBe('?r=abc');
  });
});
