// Klassement-tab (fase 2 van de Spelers-opdracht): zoek een team op naam in het algemene of
// speeldagklassement, en bekijk het klassement van een minileague. Data via /api/rankings (zie
// api/rankings.js), dat de namen van de managers er bewust uithaalt: de site toont enkel teamnamen.
//
// Wat NIET kan (de bron vraagt daarvoor een login): de opstelling of kapitein van een team, en de lijst
// met minileagues van een team. Het league-ID haal je dus zelf uit de adresbalk van het spel.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, AlertCircle, Search, Trophy, Users } from 'lucide-react';
import { CURRENT_GW } from '../constants';

const LEAGUE_STORAGE_KEY = 'fpl_proleague_klassement_league_v1';
const GENERAL_START_GW = 8;
const lastPlayedGw = Math.max(1, CURRENT_GW - 1);
const weekOptions = Array.from({ length: lastPlayedGw }, (_, i) => lastPlayedGw - i);

const inputStyle = {
  width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.06)', color: '#FFFFFF',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px', padding: '10px 12px',
  fontSize: '14px', fontFamily: 'inherit',
};
const selectStyle = {
  background: '#3D1E5C', color: '#FFFFFF', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '10px',
  padding: '9px 10px', fontSize: '13px', fontFamily: 'inherit',
};
const primaryBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#4ECDC4', color: '#0B2E1B', border: 'none',
  borderRadius: '10px', padding: '9px 16px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit',
};
const ghostBtn = {
  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px',
  padding: '8px 14px', color: '#C9B8E0', fontWeight: 700, fontSize: '12px', cursor: 'pointer', fontFamily: 'inherit',
};
const cardStyle = {
  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px',
  padding: '16px', marginBottom: '18px',
};

// Een gedeelde link of een geplakte link uit het spel ("…/leagues/120000") -> het getal.
export function parseLeagueId(value) {
  const match = String(value ?? '').match(/(\d{3,9})(?!.*\d)/);
  return match ? Number(match[1]) : null;
}

function readParams() {
  const p = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const gw = Number(p.get('rgw'));
  const lgw = Number(p.get('lgw'));
  let league = parseLeagueId(p.get('league'));
  if (!league) {
    try { league = parseLeagueId(window.localStorage?.getItem(LEAGUE_STORAGE_KEY)); } catch { league = null; }
  }
  return {
    team: (p.get('team') ?? '').slice(0, 40),
    rgw: weekOptions.includes(gw) ? gw : 0, // 0 = algemeen klassement
    league,
    lgw: weekOptions.includes(lgw) ? lgw : 0, // 0 = totaal
  };
}

function writeParams(patch) {
  const p = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (value === '' || value == null || value === 0) p.delete(key);
    else p.set(key, String(value));
  }
  const s = p.toString();
  const url = `${window.location.pathname}${s ? `?${s}` : ''}`;
  if (url !== window.location.pathname + window.location.search) window.history.replaceState(window.history.state, '', url);
}

async function fetchRankings(params) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v != null && v !== 0).map(([k, v]) => [k, String(v)]));
  const response = await fetch(`/api/rankings?${query}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Array.isArray(body.rows)) {
    const err = new Error(body?.error || `HTTP ${response.status}`);
    err.status = response.status;
    throw err;
  }
  return body;
}

// Gedeelde lijst-logica voor beide secties: eerste pagina laden, "meer laden", fouten.
function usePagedRankings() {
  const [state, setState] = useState({ rows: [], total: 0, page: 0, loading: false, error: null, meta: null });
  const requestRef = useRef(0);
  const load = useCallback(async (params, page = 1) => {
    const requestId = ++requestRef.current;
    setState(s => ({ ...s, loading: true, error: null, ...(page === 1 ? { rows: [], total: 0, meta: null } : {}) }));
    try {
      const body = await fetchRankings({ ...params, page });
      if (requestId !== requestRef.current) return;
      setState(s => ({
        rows: page === 1 ? body.rows : [...s.rows, ...body.rows],
        total: body.total, page, loading: false, error: null, meta: body.league ?? null, params,
      }));
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setState(s => ({ ...s, loading: false, error: err }));
    }
  }, []);
  return [state, load];
}

function RankingTable({ t, rows, highlight }) {
  const th = { color: '#A794C2', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', padding: '6px 8px', textAlign: 'left' };
  const td = { color: '#EDE4F5', fontSize: '13px', padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...th, width: '70px' }}>{t('klassement.rank')}</th>
            <th scope="col" style={th}>{t('klassement.team')}</th>
            <th scope="col" style={{ ...th, textAlign: 'right' }}>{t('klassement.points')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMatch = highlight && r.team.toLowerCase().includes(highlight.toLowerCase());
            return (
              <tr key={`${r.teamId}-${i}`}>
                <td style={{ ...td, fontWeight: 800, color: r.rank && r.rank <= 3 ? '#E8C547' : td.color }}>
                  {r.rank ? r.rank.toLocaleString('nl-BE') : '—'}
                </td>
                <td style={{ ...td, fontWeight: isMatch ? 800 : 600, color: isMatch ? '#4ECDC4' : '#FFFFFF', wordBreak: 'break-word' }}>{r.team || '—'}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{r.points}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Status({ t, state, emptyText, notFoundText }) {
  if (state.loading && state.rows.length === 0) {
    return (
      <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#C9B8E0', fontSize: '13px', marginTop: '12px' }}>
        <Loader2 size={16} className="fdr-spin" aria-hidden="true" /> {t('klassement.loading')}
      </div>
    );
  }
  if (state.error) {
    const text = state.error.status === 404 && notFoundText ? notFoundText : t('klassement.error');
    return (
      <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#FBEAE7', fontSize: '13px', marginTop: '12px' }}>
        <AlertCircle size={16} color="#C2402C" aria-hidden="true" /> {text}
      </div>
    );
  }
  if (state.page > 0 && state.rows.length === 0) {
    return <p style={{ color: '#C9B8E0', fontSize: '13px', marginTop: '12px' }}>{emptyText}</p>;
  }
  return null;
}

function MoreButton({ t, state, onMore }) {
  if (state.rows.length === 0 || state.rows.length >= state.total) return null;
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
      <button type="button" onClick={onMore} disabled={state.loading} style={ghostBtn}>
        {state.loading ? <Loader2 size={13} className="fdr-spin" aria-hidden="true" /> : t('klassement.more')}
      </button>
    </div>
  );
}

export default function KlassementTab({ t }) {
  const initial = useRef(readParams()).current;

  // --- Team zoeken ---
  const [teamQuery, setTeamQuery] = useState(initial.team);
  const [rgw, setRgw] = useState(initial.rgw);
  const [teamState, loadTeams] = usePagedRankings();
  const [lastSearch, setLastSearch] = useState(initial.team);

  const runTeamSearch = useCallback((name, gw) => {
    const params = gw ? { type: 'week', weekId: gw, name } : { type: 'general', name };
    setLastSearch(name);
    writeParams({ team: name, rgw: gw });
    loadTeams(params, 1);
  }, [loadTeams]);

  // --- Minileague ---
  const [leagueInput, setLeagueInput] = useState(initial.league ? String(initial.league) : '');
  const [lgw, setLgw] = useState(initial.lgw);
  const [leagueState, loadLeague] = usePagedRankings();

  const runLeague = useCallback((id, gw) => {
    if (!id) return;
    writeParams({ league: id, lgw: gw });
    try { window.localStorage?.setItem(LEAGUE_STORAGE_KEY, String(id)); } catch { /* geen opslag: ook goed */ }
    loadLeague({ type: 'league', leagueId: id, weekId: gw }, 1);
  }, [loadLeague]);

  // Bij het openen: het algemene klassement (of de zoekopdracht uit de URL), en de bewaarde league.
  useEffect(() => {
    runTeamSearch(initial.team, initial.rgw);
    if (initial.league) runLeague(initial.league, initial.lgw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leagueId = parseLeagueId(leagueInput);
  const showGeneralNote = !rgw && CURRENT_GW <= GENERAL_START_GW + 1;

  return (
    <>
      <p style={{ color: '#A794C2', fontSize: '13px', marginBottom: '18px', lineHeight: 1.5 }}>{t('klassement.intro')}</p>

      <section style={cardStyle} aria-labelledby="klassement-team-title">
        <h2 id="klassement-team-title" className="fdr-title" style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 12px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Trophy size={17} color="#4ECDC4" aria-hidden="true" /> {t('klassement.teamTitle')}
        </h2>
        <form
          onSubmit={e => { e.preventDefault(); runTeamSearch(teamQuery.trim(), rgw); }}
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          <div style={{ position: 'relative', flex: '1 1 220px' }}>
            <Search size={16} color="#A794C2" aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="search" value={teamQuery} maxLength={40}
              onChange={e => setTeamQuery(e.target.value)}
              placeholder={t('klassement.teamPlaceholder')} aria-label={t('klassement.teamPlaceholder')}
              style={{ ...inputStyle, paddingLeft: '36px' }}
            />
          </div>
          <select value={rgw} onChange={e => { const v = Number(e.target.value); setRgw(v); runTeamSearch(teamQuery.trim(), v); }}
            aria-label={t('klassement.rankingType')} style={selectStyle}>
            <option value={0}>{t('klassement.general')}</option>
            {weekOptions.map(w => <option key={w} value={w}>{t('klassement.weekOption', { gw: w })}</option>)}
          </select>
          <button type="submit" style={primaryBtn}><Search size={14} aria-hidden="true" /> {t('klassement.search')}</button>
        </form>
        {showGeneralNote && <p style={{ color: '#A794C2', fontSize: '12px', margin: '8px 0 0' }}>{t('klassement.generalNote', { gw: GENERAL_START_GW })}</p>}

        {!teamState.loading && !teamState.error && teamState.page > 0 && teamState.rows.length > 0 && (
          <p style={{ color: '#C9B8E0', fontSize: '12px', margin: '12px 0 6px' }}>
            {lastSearch
              ? t('klassement.resultsFor', { n: teamState.total.toLocaleString('nl-BE'), q: lastSearch })
              : t(rgw ? 'klassement.topWeek' : 'klassement.topGeneral', { gw: rgw, n: teamState.total.toLocaleString('nl-BE') })}
          </p>
        )}
        {teamState.rows.length > 0 && <RankingTable t={t} rows={teamState.rows} highlight={lastSearch} />}
        <Status t={t} state={teamState} emptyText={t('klassement.noTeams', { q: lastSearch })} />
        <MoreButton t={t} state={teamState} onMore={() => loadTeams(teamState.params, teamState.page + 1)} />
      </section>

      <section style={cardStyle} aria-labelledby="klassement-league-title">
        <h2 id="klassement-league-title" className="fdr-title" style={{ color: '#FFFFFF', fontSize: '15px', margin: '0 0 6px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Users size={17} color="#4ECDC4" aria-hidden="true" /> {t('klassement.leagueTitle')}
        </h2>
        <p style={{ color: '#A794C2', fontSize: '12px', margin: '0 0 12px', lineHeight: 1.5 }}>{t('klassement.leagueHelp')}</p>
        <form
          onSubmit={e => { e.preventDefault(); runLeague(leagueId, lgw); }}
          style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
        >
          <input
            type="text" inputMode="numeric" value={leagueInput} maxLength={120}
            onChange={e => setLeagueInput(e.target.value)}
            placeholder={t('klassement.leaguePlaceholder')} aria-label={t('klassement.leaguePlaceholder')}
            style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }}
          />
          <select value={lgw} onChange={e => { const v = Number(e.target.value); setLgw(v); if (leagueId) runLeague(leagueId, v); }}
            aria-label={t('klassement.leaguePeriod')} style={selectStyle}>
            <option value={0}>{t('klassement.total')}</option>
            {weekOptions.map(w => <option key={w} value={w}>{t('klassement.weekOption', { gw: w })}</option>)}
          </select>
          <button type="submit" disabled={!leagueId} style={{ ...primaryBtn, opacity: leagueId ? 1 : 0.5 }}>{t('klassement.show')}</button>
        </form>

        {leagueState.meta && !leagueState.error && (
          <p style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: 800, margin: '14px 0 6px' }}>
            {leagueState.meta.name}{' '}
            <span style={{ color: '#A794C2', fontWeight: 600, fontSize: '12px' }}>
              · {t('klassement.teamsCount', { n: leagueState.total })} · {lgw ? t('klassement.weekOption', { gw: lgw }) : t('klassement.total')}
            </span>
          </p>
        )}
        {leagueState.rows.length > 0 && <RankingTable t={t} rows={leagueState.rows} />}
        <Status t={t} state={leagueState} emptyText={t('klassement.leagueEmpty')} notFoundText={t('klassement.leagueNotFound')} />
        <MoreButton t={t} state={leagueState} onMore={() => loadLeague(leagueState.params, leagueState.page + 1)} />
      </section>

      <p style={{ color: '#A794C2', fontSize: '11px', lineHeight: 1.5 }}>{t('klassement.privacy')}</p>
    </>
  );
}
