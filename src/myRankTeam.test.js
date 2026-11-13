import { describe, it, expect } from 'vitest';
import { MY_RANK_TEAM_STORAGE_KEY, findTeamRow, loadMyRankTeam, saveMyRankTeam } from './myRankTeam';

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: k => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: k => { delete data[k]; },
    data,
  };
}

describe('mijn team volgen (spec E5)', () => {
  it('bewaart enkel team-ID en teamnaam onder de v1-sleutel', () => {
    const storage = memoryStorage();
    saveMyRankTeam(storage, { teamId: 42, naam: '  De  Rode Duivels ', manager: 'Jan Janssens' });
    expect(JSON.parse(storage.data[MY_RANK_TEAM_STORAGE_KEY])).toEqual({ teamId: 42, naam: 'De Rode Duivels' });
    expect(loadMyRankTeam(storage)).toEqual({ teamId: 42, naam: 'De Rode Duivels' });
  });

  it('niet meer volgen wist de sleutel', () => {
    const storage = memoryStorage({ [MY_RANK_TEAM_STORAGE_KEY]: '{"teamId":1,"naam":"X"}' });
    saveMyRankTeam(storage, null);
    expect(storage.data[MY_RANK_TEAM_STORAGE_KEY]).toBeUndefined();
    expect(loadMyRankTeam(storage)).toBeNull();
  });

  it('negeert kapotte of onvolledige waarden', () => {
    expect(loadMyRankTeam(memoryStorage({ [MY_RANK_TEAM_STORAGE_KEY]: 'kapot' }))).toBeNull();
    expect(loadMyRankTeam(memoryStorage({ [MY_RANK_TEAM_STORAGE_KEY]: '{"teamId":0,"naam":"X"}' }))).toBeNull();
    expect(loadMyRankTeam(memoryStorage({ [MY_RANK_TEAM_STORAGE_KEY]: '{"teamId":5,"naam":" "}' }))).toBeNull();
    expect(loadMyRankTeam(null)).toBeNull();
  });

  it('kiest de rij met het juiste team-ID, ook op een volgende pagina', async () => {
    const pages = {
      1: { pageSize: 2, total: 3, rows: [{ teamId: 1, rank: 10 }, { teamId: 2, rank: 20 }] },
      2: { pageSize: 2, total: 3, rows: [{ teamId: 3, rank: 30 }] },
    };
    const asked = [];
    const fetchPage = async (page) => { asked.push(page); return pages[page]; };
    expect(await findTeamRow(fetchPage, 3)).toEqual({ teamId: 3, rank: 30 });
    expect(asked).toEqual([1, 2]);
  });

  it('stopt zodra alle resultaten bekeken zijn', async () => {
    const asked = [];
    const fetchPage = async (page) => { asked.push(page); return { pageSize: 25, total: 1, rows: [{ teamId: 9 }] }; };
    expect(await findTeamRow(fetchPage, 3)).toBeNull();
    expect(asked).toEqual([1]);
  });
});
