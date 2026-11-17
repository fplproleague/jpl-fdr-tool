// Tests voor feedbackronde 2 van de eigenaar (16-11-2026).
import { describe, it, expect } from 'vitest';
import { TEAM_PLANNER_SLOT_POSITIONS } from './constants';
import { buildRow } from './spelers';
import { optimizedLineup } from './teamPlanner';
import { suspensionFromWeekly } from './kaarten';
import { trimToPlayed } from '../api/players.js';

describe('keepers: kopballen, recoveries en grote kansen standaard 0', () => {
  it('zet die waarden (en hun bonuspunten) op 0, enkel bij keepers', () => {
    const stats = { hc: 4, br: 30, bc: 2, bpHeaders: 1, bpRecoveries: 5, bpBigChances: 1, dw: 6 };
    const gk = buildRow({ name: 'K', pos: 'GK', price: 5, pts: 20, ...stats }, 'season', 10);
    expect([gk.hc, gk.br, gk.bc, gk.bpHeaders, gk.bpRecoveries, gk.bpBigChances]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(gk.dw).toBe(6);
    const def = buildRow({ name: 'D', pos: 'DEF', price: 5, pts: 20, ...stats }, 'season', 10);
    expect([def.hc, def.br, def.bc]).toEqual([4, 30, 2]);
  });
});

describe('schorsingen: lege speeldag van de bron telt niet als gespeeld', () => {
  it('kort de weekreeksen in tot de laatst gespeelde speeldag', () => {
    // De bron staat al op GW3, maar GW3 is nog niet gespeeld.
    const players = [
      { id: 1, w: { min: [90, 90, null], yc: [0, 1, null], rc: [0, 0, null] } },
      { id: 2, w: null },
    ];
    const { gw, players: trimmed } = trimToPlayed(players, 3);
    expect(gw).toBe(2);
    expect(trimmed[0].w.min).toEqual([90, 90]);
    expect(trimmed[1].w).toBeNull();
    expect(trimToPlayed(players.slice(0, 1), 2).gw).toBe(2);
  });

  it('daardoor wordt een 5e gele kaart in de laatste speeldag weer gezien', () => {
    const w = { min: [90, 90, 90, 90, 90, null], yc: [1, 1, 1, 1, 1, null], rc: [0, 0, 0, 0, 0, null] };
    expect(suspensionFromWeekly(w, 6)).toBeNull();
    const { gw, players } = trimToPlayed([{ w }], 6);
    expect(suspensionFromWeekly(players[0].w, gw)).toMatchObject({ gw: 6, cause: 'yellow' });
  });
});

describe('Optimaliseer opstelling: kapitein en vice blijven', () => {
  const slotsOf = (pos) => TEAM_PLANNER_SLOT_POSITIONS.map((p, i) => [p, i]).filter(([p]) => p === pos).map(([, i]) => i);
  const [gk1] = slotsOf('GK');
  const fwds = slotsOf('FWD');
  // Hoogste slot = beste speler; de laatste spits scoort het slechtst.
  const score = (slot) => (fwds.includes(slot) && slot === fwds[fwds.length - 1] ? -10 : slot);

  it('houdt de gekozen kapitein en vice, ook als die anders op de bank zouden belanden', () => {
    const weakFwd = fwds[fwds.length - 1];
    const result = optimizedLineup(score, { captain: weakFwd, vice: gk1 });
    expect(result.captain).toBe(weakFwd);
    expect(result.vice).toBe(gk1);
    expect(result.bench).not.toContain(weakFwd);
    expect(result.bench).not.toContain(gk1);
  });

  it('vult enkel een lege rol met een voorstel', () => {
    const result = optimizedLineup(score, { captain: 3, vice: null });
    expect(result.captain).toBe(3);
    expect(result.vice).not.toBe(3);
    expect(result.vice).not.toBeNull();
    expect(result.bench).not.toContain(result.vice);
  });
});

describe('Bonuspunten en Kaarten zijn kolomkeuzes in Spelers', () => {
  it('oude links sturen door naar Spelers met de juiste kolommen en sortering', async () => {
    const { legacyRedirectUrl, routeKeyFromPath } = await import('./routes');
    expect(legacyRedirectUrl('/bonuspunten')).toBe('/spelers?cols=bonus&sort=bp');
    expect(legacyRedirectUrl('/fr/kaarten')).toBe('/fr/spelers?cols=cards&sort=toSusp&dir=asc');
    // Wat al in de link stond, gaat voor.
    expect(legacyRedirectUrl('/en/bonuspunten', '?q=van&sort=bpDuels')).toBe('/en/spelers?q=van&sort=bpDuels&cols=bonus');
    expect(routeKeyFromPath('/kaarten')).toBe('spelers');
  });
});
