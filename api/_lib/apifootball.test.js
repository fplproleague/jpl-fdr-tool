import { describe, it, expect } from 'vitest';
import { buildPlayerMatcher, buildWeekResolver, clubCodeFromApiName, normalizeName } from './apifootball.js';
import { buildShots } from '../shots.js';
import { mergeShots } from '../../src/data/playersApi.js';
import { buildRow } from '../../src/spelers.js';

const FPL = [
  { id: 1, name: 'Hans Vanaken', short: 'Vanaken', club: 'CLU' },
  { id: 2, name: 'Siebe Van der Heyden', short: 'Van der Heyden', club: 'GNT' },
  { id: 3, name: 'Lukasz Lakomy', short: 'Lakomy', club: 'OHL' },
  { id: 4, name: 'Christiaan Ravych', short: 'Ravych', club: 'GNK' },
  { id: 5, name: 'Jan Peeters', short: 'Peeters', club: 'STA' },
  { id: 6, name: 'Tom Peeters', short: 'Peeters', club: 'STA' },
];

describe('API-Football: clubs en namen', () => {
  it('herkent clubs op sleutelwoord (Cercle niet als Club Brugge)', () => {
    expect(clubCodeFromApiName('Cercle Brugge')).toBe('CER');
    expect(clubCodeFromApiName('Club Brugge KV')).toBe('CLU');
    expect(clubCodeFromApiName('St. Truiden')).toBe('STV');
    expect(clubCodeFromApiName('Standard Liège')).toBe('STA');
    expect(clubCodeFromApiName('Onbekend FC')).toBeNull();
  });

  it('normaliseert ook letters die geen accent zijn (Ł)', () => {
    expect(normalizeName('Łukasz Łakomy')).toBe('lukasz lakomy');
  });

  it('koppelt spelers per club, op achternaam, en een transfer binnen de competitie', () => {
    const match = buildPlayerMatcher(FPL);
    expect(match('Hans Vanaken', 'CLU')).toBe(1);
    expect(match('H. Vanaken', 'CLU')).toBe(1);
    expect(match('Siebe Van Der Heyden', 'GNT')).toBe(2);
    expect(match('Łukasz Łakomy', 'OHL')).toBe(3);
    // Speelde eerst voor Cercle, staat nu bij Genk.
    expect(match('Christiaan Ravych', 'CER')).toBe(4);
    // Twee Peeters bij Standard: de voornaam beslist; zonder voornaam geen gok.
    expect(match('Tom Peeters', 'STA')).toBe(6);
    expect(match('Peeters', 'STA')).toBeNull();
    // Iemand die niet (meer) bij Fantasy Pro League staat.
    expect(match('Promise David', 'USG')).toBeNull();
  });

  it('een uitgestelde wedstrijd telt in de speeldag van Fantasy Pro League', () => {
    const weekOf = buildWeekResolver([
      { weekId: 3, home: 'CLU', away: 'AND', date: '2026-08-23T18:00:00Z' },
      { weekId: 30, home: 'CLU', away: 'AND', date: '2027-03-10T18:00:00Z' },
    ]);
    expect(weekOf('CLU', 'AND', '2026-08-24T18:00:00Z')).toBe(3);
    expect(weekOf('CLU', 'AND', '2027-03-11T18:00:00Z')).toBe(30);
    expect(weekOf('AND', 'CLU', '2026-08-24T18:00:00Z')).toBeNull();
  });
});

describe('schoten per speeldag (spec F1)', () => {
  const detail = (home, away, date, players) => ({
    fixture: { id: Math.random(), date }, teams: { home: { name: home }, away: { name: away } },
    players: [{ team: { name: home }, players }, { team: { name: away }, players: [] }],
  });
  const stat = (name, minutes, total, on, key) => ({
    player: { name }, statistics: [{ games: { minutes }, shots: { total, on }, passes: { key } }],
  });

  it('telt per speeldag, null = 0, invaller zonder minuten = 0, ongekoppeld in unmatched', () => {
    const weekOf = buildWeekResolver([
      { weekId: 1, home: 'CLU', away: 'AND', date: '2026-08-01T18:00:00Z' },
      { weekId: 2, home: 'CLU', away: 'GNT', date: '2026-08-08T18:00:00Z' },
    ]);
    const details = [
      detail('Club Brugge', 'Anderlecht', '2026-08-01T18:00:00Z', [stat('Hans Vanaken', 90, 3, 1, 2), stat('Onbekende Speler', 20, 1, 0, null)]),
      detail('Club Brugge', 'Gent', '2026-08-08T18:00:00Z', [stat('Hans Vanaken', 90, null, 0, null)]),
    ];
    const { gw, players, unmatched } = buildShots(details, { matchPlayer: buildPlayerMatcher(FPL), weekOf });
    expect(gw).toBe(2);
    expect(players[1]).toEqual({ sh: [3, 0], sot: [1, 0], kp: [2, 0] });
    expect(unmatched).toEqual([{ name: 'Onbekende Speler', club: 'CLU' }]);
  });

  it('wordt in de browser bij de spelers gezet; niet gekoppeld = "—" (null), ook in een periode', () => {
    const data = { gw: 3, players: [
      { id: 1, pts: 10, min: 270, w: { pts: [2, 4, 4], min: [90, 90, 90] } },
      { id: 9, pts: 1, min: 10, w: { pts: [0, 0, 1], min: [0, 0, 10] } },
    ] };
    const merged = mergeShots(data, { players: { 1: { sh: [3, 1], sot: [1, 1], kp: [2, 0] } } });
    expect(merged.shotsAvailable).toBe(true);
    expect(merged.players[0]).toMatchObject({ sh: 4, sot: 2, kp: 2 });
    expect(merged.players[0].w.sh).toEqual([3, 1, 0]);
    expect(merged.players[1].sh).toBeNull();
    expect(buildRow(merged.players[0], 3, 3).sh).toBe(4);
    expect(buildRow(merged.players[0], 3, 3).kp).toBe(2);
    expect(buildRow(merged.players[1], 3, 3).sh).toBeNull();
    // Zonder schotendata verandert er niets.
    expect(mergeShots(data, null)).toBe(data);
  });
});
