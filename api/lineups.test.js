import { describe, it, expect } from 'vitest';
import { buildLastNumbers, convertLineup, gwSchedule, shirtNumber } from './lineups.js';
import { buildPlayerMatcher } from './_lib/apifootball.js';
import { buildNumberIndex, buildOfficialIndex, officialStatus, shirtNumberOf, unexpectedStarters } from '../src/data/officialLineups.js';

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
      startXI: [{ player: { name: 'H. Vanaken', number: 20 } }, { player: { name: 'S. Mignolet', number: null } }, { player: { name: 'J. Jeugdspeler', number: 70 } }],
      substitutes: [{ player: { name: 'J. Ordonez', number: 4 } }],
    }, 'CLU', buildPlayerMatcher(fpl), shortOf);
    expect(lineup).toEqual({
      formation: '4-3-3', starters: ['Vanaken', 'Mignolet'], bench: ['Ordonez'],
      numbers: { Vanaken: 20, Ordonez: 4 }, unmatched: ['J. Jeugdspeler'],
    });
  });
});

describe('rugnummers op de Verwachte XI\'s', () => {
  const fpl = [
    { id: 1, name: 'Hans Vanaken', short: 'Vanaken', club: 'CLU' },
    { id: 2, name: 'Tolu Arokodare', short: 'Arokodare', club: 'GNK' }, // speelde vorige week nog bij Anderlecht
    { id: 3, name: 'Brandon Mechele', short: 'Mechele', club: 'CLU' },
  ];
  const maps = {
    matchPlayer: buildPlayerMatcher(fpl),
    shortOf: new Map(fpl.map(p => [p.id, p.short])),
    clubOf: new Map(fpl.map(p => [p.id, p.club])),
  };
  const fixture = (date, team, startXI, substitutes = []) => ({ fixture: { date }, lineups: [{ team: { name: team }, startXI, substitutes }] });

  it('neemt het nummer uit de laatste wedstrijd waarin de speler op het wedstrijdblad stond', () => {
    const details = [
      fixture('2026-11-08T12:30:00Z', 'Club Brugge', [{ player: { name: 'H. Vanaken', number: 20 } }], [{ player: { name: 'B. Mechele', number: 44 } }]),
      // Een week later: Vanaken met een ander nummer, Mechele niet op het wedstrijdblad.
      fixture('2026-11-15T12:30:00Z', 'Club Brugge', [{ player: { name: 'H. Vanaken', number: 10 } }]),
      // Volgorde in de lijst doet er niet toe: de datum telt.
      fixture('2026-11-01T12:30:00Z', 'Club Brugge', [{ player: { name: 'H. Vanaken', number: 8 } }]),
      // Transfer binnen de competitie: nummer bij de vorige club, getoond bij de huidige club.
      fixture('2026-11-15T12:30:00Z', 'Anderlecht', [{ player: { name: 'Tolu Arokodare', number: 9 } }]),
    ];
    expect(buildLastNumbers(details, maps)).toEqual({ CLU: { Vanaken: 10, Mechele: 44 }, GNK: { Arokodare: 9 } });
  });

  it('negeert ongeldige nummers', () => {
    expect(shirtNumber(0)).toBeNull();
    expect(shirtNumber(100)).toBeNull();
    expect(shirtNumber('7')).toBe(7);
    expect(shirtNumber(null)).toBeNull();
  });

  it('in de browser: de officiële opstelling gaat voor, anders het laatst gekende nummer', () => {
    const keyOf = (name, club) => `${name.toLowerCase()}|${club}`;
    const official = buildOfficialIndex({ gw: 12, matches: [{ home: 'CLU', away: 'AND', lineups: { CLU: { starters: ['Vanaken'], bench: [], numbers: { Vanaken: 10 } } } }] }, keyOf);
    const lastNumbers = buildNumberIndex({ numbers: { CLU: { Vanaken: 20, Mechele: 44 } } }, keyOf);
    expect(shirtNumberOf({ official, lastNumbers }, 'Vanaken', 'CLU', keyOf)).toBe(10);
    expect(shirtNumberOf({ official, lastNumbers }, 'Mechele', 'CLU', keyOf)).toBe(44);
    expect(shirtNumberOf({ official: null, lastNumbers }, 'Vanaken', 'CLU', keyOf)).toBe(20);
    expect(shirtNumberOf({ official: null, lastNumbers: null }, 'Vanaken', 'CLU', keyOf)).toBeNull();
    expect(buildNumberIndex(null, keyOf)).toBeNull();
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
