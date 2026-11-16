import { describe, it, expect } from 'vitest';
import { isAllowedOrigin, readSquadExtras } from './analyze-screenshot';

describe('readSquadExtras (budget en gratis transfers uit de screenshot)', () => {
  it('neemt geldige waarden over, afgerond', () => {
    expect(readSquadExtras({ bank: 2.54, freeTransfers: 2 })).toEqual({ bank: 2.5, freeTransfers: 2 });
    expect(readSquadExtras({ bank: 0, freeTransfers: 0 })).toEqual({ bank: 0, freeTransfers: 0 });
  });

  it('null of onzin wordt null, meer dan 3 gratis transfers wordt 3', () => {
    expect(readSquadExtras({ bank: null, freeTransfers: null })).toEqual({ bank: null, freeTransfers: null });
    expect(readSquadExtras({})).toEqual({ bank: null, freeTransfers: null });
    expect(readSquadExtras({ bank: -1, freeTransfers: 1.5 })).toEqual({ bank: null, freeTransfers: null });
    expect(readSquadExtras({ bank: 250, freeTransfers: 5 })).toEqual({ bank: null, freeTransfers: 3 });
  });
});

describe('isAllowedOrigin', () => {
  it('laat de eigen site en previews van dit project toe', () => {
    expect(isAllowedOrigin({ origin: 'https://fplproleague.vercel.app' })).toBe(true);
    expect(isAllowedOrigin({ origin: 'https://fdr-jpl-tool-git-functionaliteit-fase-a-bugs-fpl-proleague.vercel.app' })).toBe(true);
    expect(isAllowedOrigin({ referer: 'https://fplproleague.vercel.app/team-planner' })).toBe(true);
  });

  it('weigert andere sites en verzoeken zonder herkomst', () => {
    expect(isAllowedOrigin({ origin: 'https://evil.example.com' })).toBe(false);
    expect(isAllowedOrigin({ origin: 'https://other-project.vercel.app' })).toBe(false);
    expect(isAllowedOrigin({ origin: 'https://fplproleague.vercel.app.evil.com' })).toBe(false);
    expect(isAllowedOrigin({ origin: 'https://fdr-jpl-tool-x-fpl-proleagueXvercelXapp' })).toBe(false);
    expect(isAllowedOrigin({})).toBe(false);
  });

  it('localhost enkel buiten productie', () => {
    expect(isAllowedOrigin({ origin: 'http://localhost:3000' }, { VERCEL_ENV: 'development' })).toBe(true);
    expect(isAllowedOrigin({ origin: 'http://localhost:3000' }, { VERCEL_ENV: 'production' })).toBe(false);
  });
});
