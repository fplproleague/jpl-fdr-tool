import { describe, it, expect } from 'vitest';
import { buildLineups, buildNameMatcher, opponentFor, safetyFromPercent, sameClub } from './lineupBuilder.js';
import { FIXTURES, TEAMS } from '../../src/constants.js';

const players = [
  { name: 'Simon Mignolet', short: 'Mignolet', club: 'CLU', pos: 'GK', price: 5.5 },
  { name: 'Joaquin Seys', short: 'Seys', club: 'CLU', pos: 'DEF', price: 7 },
  { name: 'Brandon Mechele', short: 'Mechele', club: 'CLU', pos: 'DEF', price: 8 },
  { name: 'Hans Vanaken', short: 'Vanaken', club: 'CLU', pos: 'MID', price: 11.5 },
  { name: 'Nicolo Tresoldi', short: 'Tresoldi', club: 'CLU', pos: 'FWD', price: 10.5 },
  { name: 'Kyriani Sabbe', short: 'Sabbe', club: 'CLU', pos: 'DEF', price: 6.5 },
  { name: 'Mamadou Diakhon', short: 'Diakhon', club: 'CLU', pos: 'MID', price: 6 },
  { name: 'Adem Zorgane', short: 'Zorgane', club: 'USG', pos: 'MID', price: 9.5 },
];

// Eerste speeldag waarop Club Brugge gewoon één wedstrijd speelt.
const gw = FIXTURES.CLU.findIndex(e => typeof e === 'string') + 1;

describe('buildNameMatcher', () => {
  const match = buildNameMatcher(players);
  it('vindt de korte naam, de volledige naam en een tikfout', () => {
    expect(match('Vanaken', 'CLU')).toMatchObject({ how: 'exact', player: { name: 'Vanaken' } });
    expect(match('Hans Vanaken', 'CLU')).toMatchObject({ how: 'full', player: { name: 'Vanaken' } });
    expect(match('Vanakem', 'CLU')).toMatchObject({ how: 'fuzzy', player: { name: 'Vanaken' } });
    expect(match('Nicolò', 'CLU')).toMatchObject({ how: 'part', player: { name: 'Tresoldi' } });
  });
  it('meldt een speler die bij een andere club staat, en geeft niets bij een onbekende naam', () => {
    expect(match('Zorgane', 'CLU')).toMatchObject({ how: 'other-club', player: { club: 'USG' } });
    expect(match('Messi', 'CLU').player).toBeNull();
  });
});

describe('safetyFromPercent', () => {
  it('zet het percentage van de alternatieve speler om naar een kleur', () => {
    expect([undefined, 0, 10, 20, 25, 30, 40, 50].map(safetyFromPercent))
      .toEqual(['darkgreen', 'darkgreen', 'green', 'green', 'orange', 'orange', 'red', 'red']);
  });
});

describe('opponentFor en sameClub', () => {
  it('leest de tegenstander uit de kalender', () => {
    expect(opponentFor('CLU', gw).opponent).toBe(FIXTURES.CLU[gw - 1].split('-')[0]);
  });
  it('herkent de clubnamen zoals ze op de afbeeldingen staan', () => {
    expect(sameClub('Union', 'USG')).toBe(true);
    expect(sameClub('STVV', 'STV')).toBe(true);
    expect(sameClub('La Louviere', 'LLV')).toBe(true);
    expect(sameClub('KRC Genk', 'GNK')).toBe(true);
    expect(sameClub('SK Brann', 'STV')).toBe(false);
  });
  it('geeft een fout als de afbeelding een andere tegenstander noemt', () => {
    const opp = opponentFor('CLU', gw).opponent;
    const wrong = TEAMS.find(t => t.code !== opp && t.code !== 'CLU').name;
    const res = buildLineups({ gw, lineups: { CLU: { vs: wrong, formation: '4-3-3', players: [] } } }, players);
    expect(res.problems.some(p => p.club === 'CLU' && p.msg.includes('kalender'))).toBe(true);
  });
});

describe('buildLineups', () => {
  const input = {
    gw,
    lineups: {
      CLU: {
        formation: '4-3-3',
        players: ['Mignolet', 'Seys 20%', 'Mechele', 'Messi', 'Sabbe', { name: 'Vanaken', safety: 'orange' }, 'Diakhon', 'Vanaken', { name: 'Tresoldi', pct: 40 }, 'X', 'Y'],
      },
    },
  };
  const { lineups, problems } = buildLineups(input, players, { now: 1, makeId: () => 'id' });
  const clu = lineups.find(l => l.clubCode === 'CLU');

  it('zet spelers op de posities van de formatie, met prijs en zekerheid', () => {
    expect(clu.slots).toHaveLength(11);
    expect(clu.slots[0]).toMatchObject({ positionId: 'GK', playerName: 'Mignolet', playerPrice: 5.5, playerPosition: 'GK', safety: 'darkgreen' });
    expect(clu.slots[1]).toMatchObject({ positionId: 'LB', playerName: 'Seys', safety: 'green' });
    expect(clu.slots[5]).toMatchObject({ positionId: 'LCM', playerName: 'Vanaken', safety: 'orange', xPercent: 33 });
    expect(clu.slots[8]).toMatchObject({ positionId: 'LW', playerName: 'Tresoldi', safety: 'red' });
    expect(clu.opponentCode).toBe(opponentFor('CLU', gw).opponent);
  });

  it('meldt onbekende namen, dubbele spelers en ontbrekende clubs als fout', () => {
    const errors = problems.filter(p => p.level === 'fout');
    expect(errors.some(p => p.club === 'CLU' && p.msg.includes('Messi'))).toBe(true);
    expect(errors.some(p => p.club === 'CLU' && p.msg.includes('twee keer'))).toBe(true);
    const playing = TEAMS.filter(t => t.code !== 'CLU' && opponentFor(t.code, gw).opponent);
    expect(errors.filter(p => p.msg === 'opstelling ontbreekt')).toHaveLength(playing.length);
  });

  it('weigert een onbekende formatie', () => {
    const res = buildLineups({ gw, lineups: { CLU: { formation: '4-6-0', players: [] } } }, players);
    expect(res.problems.some(p => p.club === 'CLU' && p.msg.includes('onbekende formatie'))).toBe(true);
    expect(res.lineups.find(l => l.clubCode === 'CLU')).toBeUndefined();
  });
});
