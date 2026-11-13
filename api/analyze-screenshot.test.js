import { describe, it, expect } from 'vitest';
import { isAllowedOrigin } from './analyze-screenshot';

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
