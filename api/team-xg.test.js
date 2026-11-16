import { describe, it, expect } from 'vitest';
import { buildTeamXg } from './team-xg.js';
import { resultOf, summarizeXg } from '../src/data/teamXg.js';

const detail = (id, ts, home, away, gh, ga, xh, xa) => ({
  fixture: { id, timestamp: ts, date: new Date(ts * 1000).toISOString() },
  teams: { home: { id: 1, name: home }, away: { id: 2, name: away } },
  goals: { home: gh, away: ga },
  statistics: [
    { team: { id: 1 }, statistics: [{ type: 'Total Shots', value: 10 }, { type: 'expected_goals', value: xh }] },
    { team: { id: 2 }, statistics: [{ type: 'expected_goals', value: xa }] },
  ],
});

describe('xG per club (spec F2)', () => {
  it('geeft per club voor en tegen, vanuit het standpunt van die club, oudste eerst', () => {
    const { clubs, unmatched } = buildTeamXg([
      detail(2, 200, 'Gent', 'Club Brugge KV', 0, 2, '0.80', '1.95'),
      detail(1, 100, 'Club Brugge KV', 'Anderlecht', 1, 1, '2.10', null),
      detail(3, 300, 'Onbekend FC', 'Gent', 1, 0, '1.00', '1.00'),
    ]);
    expect(unmatched).toEqual(['Onbekend FC']);
    expect(clubs.CLU).toEqual([
      { date: expect.any(String), opp: 'AND', home: true, gf: 1, ga: 1, xg: 2.1, xga: null },
      { date: expect.any(String), opp: 'GNT', home: false, gf: 2, ga: 0, xg: 1.95, xga: 0.8 },
    ]);
    expect(clubs.GNT).toHaveLength(1);
  });

  it('gemiddelde van de laatste vijf, enkel over wedstrijden met xG; nieuwste eerst', () => {
    const m = (gf, ga, xg, xga) => ({ gf, ga, xg, xga });
    const matches = [m(9, 9, 9, 9), m(1, 0, 1.0, 0.5), m(2, 2, 2.0, 1.5), m(0, 1, null, null), m(3, 0, 3.0, 0.4), m(1, 1, 1.0, 1.0)];
    const s = summarizeXg(matches);
    expect(s.count).toBe(4);
    expect(s.xg).toBeCloseTo(1.75);
    expect(s.xga).toBeCloseTo(0.85);
    expect(s.gf).toBeCloseTo(1.75);
    expect(s.matches).toHaveLength(5);
    expect(s.matches[0]).toEqual(m(1, 1, 1.0, 1.0));
    expect(summarizeXg([m(1, 0, null, null)])).toBeNull();
    expect(summarizeXg(undefined)).toBeNull();
    expect([resultOf(m(2, 1)), resultOf(m(1, 1)), resultOf(m(0, 1)), resultOf(m(null, 1))]).toEqual(['W', 'D', 'L', null]);
  });
});
