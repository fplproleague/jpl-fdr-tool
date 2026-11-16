import { describe, it, expect } from 'vitest';
import { bonusForMatch, positionIdFrom } from './proleague';

// Een wedstrijd waarin alle vier de drempels gehaald worden.
const ALL_FOUR = { duelWon: 6, duelLost: 2, headClearance: 5, ballRecovery: 8, bigChanceCreated: 2 };

describe('bonusForMatch', () => {
  it('veldspeler: alle vier de categorieën tellen', () => {
    expect(bonusForMatch(ALL_FOUR, 2)).toEqual({ total: 4, duels: 1, headers: 1, recoveries: 1, bigChances: 1 });
    expect(bonusForMatch(ALL_FOUR)).toEqual({ total: 4, duels: 1, headers: 1, recoveries: 1, bigChances: 1 });
  });

  it('keeper: enkel het duelpunt telt', () => {
    expect(bonusForMatch(ALL_FOUR, 1)).toEqual({ total: 1, duels: 1, headers: 0, recoveries: 0, bigChances: 0 });
    expect(bonusForMatch({ ...ALL_FOUR, duelWon: 1, duelLost: 1 }, 1).total).toBe(0);
  });

  it('drempels zijn strikt groter dan', () => {
    expect(bonusForMatch({ duelWon: 2, duelLost: 2, headClearance: 3, ballRecovery: 5, bigChanceCreated: 1 }, 3).total).toBe(0);
  });
});

describe('positionIdFrom', () => {
  it('leest zowel codes als getallen', () => {
    expect(positionIdFrom('GK')).toBe(1);
    expect(positionIdFrom('gk')).toBe(1);
    expect(positionIdFrom('4')).toBe(4);
    expect(positionIdFrom('XX')).toBeNull();
    expect(positionIdFrom(undefined)).toBeNull();
  });
});
