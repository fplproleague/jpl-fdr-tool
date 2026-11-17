import { describe, it, expect } from 'vitest';
import { buildKickoffs, knownKickoff } from './kickoffs.js';
import { buildStandings } from './standings.js';
import { buildKickoffLookup, formatKickoff, kickoffTextFor, sortByKickoff } from '../src/data/kickoffs.js';
import { ordinal } from '../src/data/standings.js';

describe('aftraptijden (spec F4)', () => {
  it('middernacht UTC = uur nog niet bekend', () => {
    expect(knownKickoff('2026-11-21T17:15:00.000Z')).toBe('2026-11-21T17:15:00.000Z');
    expect(knownKickoff('2027-01-23T00:00:00.000Z')).toBeNull();
    expect(knownKickoff('geen datum')).toBeNull();
  });

  it('kalender -> opzoekfunctie per speeldag, thuis- en uitploeg', () => {
    const rows = buildKickoffs([
      { weekId: 12, homeId: { short: 'GNK' }, awayId: { short: 'LAL' }, date: '2026-11-21T17:15:00.000Z' },
      { weekId: 18, homeId: { short: 'CLU' }, awayId: { short: 'LAL' }, date: '2027-01-23T00:00:00.000Z' },
    ]);
    const lookup = buildKickoffLookup({ matches: rows });
    expect(lookup(12, rows[0][1], rows[0][2]).toISOString()).toBe('2026-11-21T17:15:00.000Z');
    expect(lookup(18, rows[1][1], rows[1][2])).toBeNull();
    // Vanuit de uitploeg bekeken (venue "A") is het dezelfde wedstrijd.
    expect(kickoffTextFor(lookup, 12, rows[0][2], 'GNK', 'A', 'nl')).toBe('za 21 nov 18:15');
    expect(buildKickoffLookup({ matches: [] })).toBeNull();
  });

  it('in Belgische tijd, in de drie talen (ook in de zomer)', () => {
    const winter = new Date('2026-11-21T17:15:00Z');
    expect(formatKickoff(winter, 'nl')).toBe('za 21 nov 18:15');
    expect(formatKickoff(winter, 'fr')).toBe('sam 21 nov 18:15');
    expect(formatKickoff(winter, 'en')).toBe('Sat 21 Nov 18:15');
    expect(formatKickoff(winter, 'nl', { withDate: false })).toBe('za 18:15');
    expect(formatKickoff(new Date('2027-04-10T18:45:00Z'), 'nl', { withDate: false })).toBe('za 20:45');
    expect(formatKickoff(null)).toBeNull();
  });

  it('wedstrijdstrip chronologisch, zonder uur achteraan', () => {
    const times = { A: new Date('2026-11-22T12:30:00Z'), B: new Date('2026-11-20T19:45:00Z'), C: null };
    expect(sortByKickoff([{ id: 'C' }, { id: 'A' }, { id: 'B' }], m => times[m.id]).map(m => m.id)).toEqual(['B', 'A', 'C']);
  });
});

describe('klassement (spec F4)', () => {
  it('plaats per club; bij play-offs telt de laatst bijgewerkte groep', () => {
    const row = (name, rank, points, group, update) => ({ rank, points, group, update, team: { name }, all: { played: 30 } });
    const regular = buildStandings([{ league: { standings: [[row('Club Brugge KV', 2, 60, 'Pro League', '2027-03-20'), row('Onbekend FC', 1, 70, 'Pro League', '2027-03-20')]] } }]);
    expect(regular.playoffs).toBe(false);
    expect(regular.clubs.CLU).toEqual({ rank: 2, points: 60, played: 30, group: 'Pro League' });
    expect(regular.unmatched).toEqual(['Onbekend FC']);
    const playoffs = buildStandings([{ league: { standings: [
      [row('Club Brugge KV', 2, 60, 'Pro League', '2027-03-20')],
      [row('Club Brugge KV', 1, 33, 'Champions Play-off', '2027-04-12')],
    ] } }]);
    expect(playoffs.playoffs).toBe(true);
    expect(playoffs.clubs.CLU).toMatchObject({ rank: 1, points: 33, group: 'Champions Play-off' });
  });

  it('rangtelwoord per taal', () => {
    expect([ordinal(1, 'nl'), ordinal(1, 'fr'), ordinal(2, 'fr'), ordinal(1, 'en'), ordinal(2, 'en'), ordinal(3, 'en'), ordinal(11, 'en'), ordinal(22, 'en')])
      .toEqual(['1e', '1er', '2e', '1st', '2nd', '3rd', '11th', '22nd']);
  });
});
