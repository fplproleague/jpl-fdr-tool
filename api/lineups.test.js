import { describe, it, expect } from 'vitest';
import { convertLineup, gwSchedule } from './lineups.js';
import { buildPlayerMatcher } from './_lib/apifootball.js';
import { buildOfficialIndex, officialStatus, unexpectedStarters } from '../src/data/officialLineups.js';

describe('officiële opstellingen: server (spec F3)', () => {
  it('neemt de wedstrijden van één speeldag, met het venster rond de aftraptijden', () => {
    const fpl = [
      { weekId: 12, homeId: { short: 'CER' }, awayId: { short: 'WES' }, date: '2026-11-20T19:45:00.000Z' },
      { weekId: 12, homeId: { short: 'AND' }, awayId: { short: 'OHL' }, date: '2026-11-22T17:30:00.000Z' },
      { weekId: 11, homeId: { short: 'CLU' }, awayId: { short: 'AND' }, date: '2026-11-08T12:30:00.000Z' },
    ];
    const { matches, window } = gwSchedule(fpl, 12);
    expect(matches.map(m => `${m.home}-${m.away}`)).toEqual(['CER-WES', 'AND-OHL']);
    expect(window).toEqual({ start: '2026-11-20T18:15:00.000Z', end: '2026-11-22T20:00:00.000Z' });
    expect(gwSchedule(fpl, 30)).toEqual({ matches: [], window: null });
  });

  it('zet een API-opstelling om naar korte Fantasy Pro League-namen; onbekenden apart', () => {
    const fpl = [
      { id: 1, name: 'Hans Vanaken', short: 'Vanaken', club: 'CLU' },
      { id: 2, name: 'Simon Mignolet', short: 'Mignolet', club: 'CLU' },
      { id: 3, name: 'Joel Ordonez', short: 'Ordonez', club: 'CLU' },
    ];
    const shortOf = new Map(fpl.map(p => [p.id, p.short]));
    const lineup = convertLineup({
      formation: '4-3-3',
      startXI: [{ player: { name: 'H. Vanaken' } }, { player: { name: 'S. Mignolet' } }, { player: { name: 'J. Jeugdspeler' } }],
      substitutes: [{ player: { name: 'J. Ordonez' } }],
    }, 'CLU', buildPlayerMatcher(fpl), shortOf);
    expect(lineup).toEqual({ formation: '4-3-3', starters: ['Vanaken', 'Mignolet'], bench: ['Ordonez'], unmatched: ['J. Jeugdspeler'] });
  });
});

describe('officiële opstellingen: in de browser (spec F3)', () => {
  const keyOf = (name, club) => `${name.toLowerCase()}|${club}`;
  const data = {
    gw: 12,
    matches: [
      { home: 'CLU', away: 'AND', lineups: { CLU: { formation: '4-3-3', starters: ['Vanaken', 'Tzolis'], bench: ['Onyedika'] }, AND: { formation: '4-4-2', starters: ['Hazard'], bench: [] } } },
      { home: 'GNT', away: 'GNK', lineups: null },
    ],
  };

  it('basis = start, bank = bank, anders niet in selectie; geen opstelling = null', () => {
    const index = buildOfficialIndex(data, keyOf);
    expect(index.gw).toBe(12);
    expect([...index.matches]).toEqual(['CLU-AND']);
    expect(officialStatus(index, 'Vanaken', 'CLU', keyOf)).toBe('starts');
    expect(officialStatus(index, 'Onyedika', 'CLU', keyOf)).toBe('bench');
    expect(officialStatus(index, 'Mechele', 'CLU', keyOf)).toBe('out');
    expect(officialStatus(index, 'Watanabe', 'GNT', keyOf)).toBeNull();
  });

  it('"Ook in de basis": wie start maar niet verwacht was', () => {
    const index = buildOfficialIndex(data, keyOf);
    expect(unexpectedStarters(index, 'CLU', [{ name: 'Vanaken' }, { name: 'Mechele' }], keyOf)).toEqual(['Tzolis']);
    expect(unexpectedStarters(index, 'GNT', [{ name: 'Watanabe' }], keyOf)).toEqual([]);
  });

  it('zonder enige officiële opstelling: null (de site toont niets extra)', () => {
    expect(buildOfficialIndex({ gw: 12, matches: [{ home: 'CLU', away: 'AND', lineups: null }] }, keyOf)).toBeNull();
    expect(buildOfficialIndex(null, keyOf)).toBeNull();
  });
});
