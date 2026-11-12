// Spelers-popup van de Spelers-tab: kop (foto, club, positie, prijs, % geselecteerd), puntengrafiek
// per speeldag, de komende tegenstanders met FDR-kleuren, de wedstrijd-per-wedstrijd-tabel en de
// totalen van de vorige seizoenen. De wedstrijddetails komen uit /api/player/{id} en worden pas
// opgehaald wanneer de popup opent (en daarna per sessie onthouden).
import { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Star, GitCompare } from 'lucide-react';
import Sheet, { SheetSection, sheetEmptyTextStyle } from './Sheet';
import { PlayerPhoto, UpcomingFixtures, ClubLogo } from './SpelersParts';
import { TEAMS } from '../constants';

const detailCache = new Map();

async function loadDetail(id) {
  if (detailCache.has(id)) return detailCache.get(id);
  const response = await fetch(`/api/player/${id}`);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || !Array.isArray(body.matches)) throw new Error(body?.error || `HTTP ${response.status}`);
  detailCache.set(id, body);
  return body;
}

function PointsChart({ matches, gw, t }) {
  // Eén staaf per speeldag 1..gw; een dubbele speeldag telt als de som van beide wedstrijden.
  const perGw = Array.from({ length: gw }, (_, i) => ({ gw: i + 1, pts: null }));
  for (const m of matches) {
    if (m.gw >= 1 && m.gw <= gw) perGw[m.gw - 1].pts = (perGw[m.gw - 1].pts ?? 0) + m.pts;
  }
  const max = Math.max(10, ...perGw.map(p => p.pts ?? 0));
  const min = Math.min(0, ...perGw.map(p => p.pts ?? 0));
  const height = 90;
  const range = max - min;
  const zeroY = (max / range) * height;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: `${height + 30}px` }} role="img"
      aria-label={t('spelers.popup.chartAria', { list: perGw.map(p => `${t('fdr.gwLabel')}${p.gw}: ${p.pts ?? '—'}`).join(', ') })}>
      {perGw.map(p => {
        const h = p.pts == null ? 0 : Math.max(2, (Math.abs(p.pts) / range) * height);
        const negative = (p.pts ?? 0) < 0;
        return (
          <div key={p.gw} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ height: `${height}px`, width: '100%', position: 'relative' }}>
              <span style={{
                position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: '9px', fontWeight: 700,
                color: p.pts == null ? 'var(--text-4)' : 'var(--text-1)',
                top: p.pts == null ? `${zeroY - 12}px` : negative ? `${zeroY + h + 1}px` : `${zeroY - h - 12}px`,
              }}>
                {p.pts == null ? '–' : p.pts}
              </span>
              {p.pts != null && (
                <span style={{
                  position: 'absolute', left: '15%', right: '15%', borderRadius: '2px',
                  background: negative ? 'var(--danger)' : p.pts >= 8 ? 'var(--accent)' : 'var(--text-3)',
                  top: negative ? `${zeroY}px` : `${zeroY - h}px`, height: `${h}px`,
                }} />
              )}
            </div>
            <span style={{ fontSize: '9px', color: 'var(--text-3)', marginTop: '4px' }}>{p.gw}</span>
          </div>
        );
      })}
    </div>
  );
}

const thStyle = { color: 'var(--text-3)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', padding: '4px 3px', textAlign: 'center', whiteSpace: 'nowrap' };
const tdStyle = { color: 'var(--text-1)', fontSize: '12px', padding: '5px 3px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' };

function MatchTable({ matches, t }) {
  const resultLetter = { W: t('spelers.popup.resultW'), D: t('spelers.popup.resultD'), L: t('spelers.popup.resultL') };
  const resultColor = { W: 'var(--accent)', D: 'var(--warning)', L: 'var(--danger)' };
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="spl-popup-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th scope="col" style={thStyle}>{t('fdr.gwLabel')}</th>
            <th scope="col" style={{ ...thStyle, textAlign: 'left' }}>{t('spelers.popup.opponent')}</th>
            <th scope="col" style={thStyle}>{t('spelers.popup.score')}</th>
            <th scope="col" style={thStyle} title={t('spelers.col.min')}>Min</th>
            <th scope="col" style={thStyle} title={t('spelers.col.g')}>G</th>
            <th scope="col" style={thStyle} title={t('spelers.col.a')}>A</th>
            <th scope="col" style={thStyle}>{t('spelers.popup.cards')}</th>
            <th scope="col" style={thStyle} title={t('spelers.col.bp')}>{t('spelers.popup.bonusShort')}</th>
            <th scope="col" style={thStyle}>{t('spelers.popup.pointsShort')}</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m, i) => (
            <tr key={`${m.gw}-${i}`}>
              <td style={tdStyle}>{m.gw}</td>
              <td style={{ ...tdStyle, textAlign: 'left' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span className="spl-popup-logo"><ClubLogo code={m.opp} size={14} /></span>
                  {m.opp ?? '?'} <span style={{ color: 'var(--text-3)', fontSize: '11px' }}>({m.home === false ? t('spelers.popup.away') : t('spelers.popup.home')})</span>
                </span>
              </td>
              <td style={tdStyle}>
                {m.score ?? '—'}{' '}
                {m.result && <span style={{ color: resultColor[m.result], fontWeight: 800 }}>{resultLetter[m.result]}</span>}
              </td>
              <td style={tdStyle}>{m.min}</td>
              <td style={tdStyle} title={m.goals.length ? m.goals.map(x => `${x}'`).join(', ') : undefined}>
                {m.goals.length || ''}
                {m.goals.length > 0 && <span className="spl-popup-minutes" style={{ color: 'var(--text-3)', fontSize: '10px' }}> ({m.goals.map(x => `${x}'`).join(', ')})</span>}
              </td>
              <td style={tdStyle} title={m.assists.length ? m.assists.map(x => `${x}'`).join(', ') : undefined}>{m.assists.length || ''}</td>
              <td style={tdStyle}>
                {m.yc > 0 && <span aria-label={t('spelers.col.yc')} style={{ display: 'inline-block', width: '8px', height: '11px', background: 'var(--warning)', borderRadius: '1px', marginRight: '2px' }} />}
                {m.rc > 0 && <span aria-label={t('spelers.col.rc')} style={{ display: 'inline-block', width: '8px', height: '11px', background: 'var(--danger)', borderRadius: '1px' }} />}
              </td>
              <td style={{ ...tdStyle, color: m.bonus > 0 ? 'var(--accent)' : 'var(--text-4)' }}>{m.bonus}</td>
              <td style={{ ...tdStyle, fontWeight: 800 }}>{m.pts}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function SpelerPopup({
  t, player, gw, fromGw, ratings, homeAdvantage, onClose, isWatched, onToggleWatch,
  inCompare, onToggleCompare, compareFull, onOpenClub,
}) {
  const [state, setState] = useState({ loading: true, error: null, detail: detailCache.get(player.id) ?? null });

  useEffect(() => {
    let cancelled = false;
    if (detailCache.has(player.id)) {
      setState({ loading: false, error: null, detail: detailCache.get(player.id) });
      return undefined;
    }
    setState({ loading: true, error: null, detail: null });
    loadDetail(player.id)
      .then(detail => { if (!cancelled) setState({ loading: false, error: null, detail }); })
      .catch(err => { if (!cancelled) setState({ loading: false, error: String(err?.message ?? err), detail: null }); });
    return () => { cancelled = true; };
  }, [player.id]);

  const clubName = TEAMS.find(c => c.code === player.club)?.name ?? player.club;
  const titleId = `speler-popup-${player.id}`;
  const { loading, error, detail } = state;

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
      <PlayerPhoto player={player} size={56} />
      <div style={{ minWidth: 0 }}>
        <h3 id={titleId} className="fdr-title" style={{ color: 'var(--text-1)', fontSize: '18px', margin: 0, lineHeight: 1.2 }}>
          {player.name}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '4px', color: 'var(--text-2)', fontSize: '12px' }}>
          <button type="button" onClick={() => onOpenClub?.(player.club)} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', padding: 0,
            color: 'var(--text-2)', fontSize: '12px', cursor: onOpenClub ? 'pointer' : 'default', fontFamily: 'inherit',
          }}>
            <ClubLogo code={player.club} size={16} /> {clubName}
          </button>
          <span>· {t(`spelers.pos.${player.pos}`)}</span>
          <span>· €{player.price.toFixed(1)}M</span>
          <span>· {t('spelers.popup.selected', { pct: player.sel })}</span>
        </div>
      </div>
    </div>
  );

  const actionBtn = (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px', borderRadius: '8px', padding: '7px 12px',
    fontSize: '12px', fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
    background: active ? 'rgba(51,237,213,0.12)' : 'transparent',
    border: `1px solid ${active ? 'var(--accent)' : 'rgba(255,255,255,0.2)'}`,
    color: active ? 'var(--accent)' : 'var(--text-2)',
  });

  const totals = [
    [t('spelers.col.pts'), player.pts],
    [t('spelers.col.mp'), player.mp],
    [t('spelers.col.min'), player.min],
    [t('spelers.col.g'), player.g],
    [t('spelers.col.a'), player.a],
    [t('spelers.col.bp'), player.bp],
  ];

  return (
    <Sheet titleId={titleId} closeLabel={t('bonuspunten.closeAria')} onClose={onClose} header={header} maxWidth="560px">
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
        {onToggleWatch && (
          <button type="button" onClick={onToggleWatch} aria-pressed={isWatched} style={actionBtn(isWatched)}>
            <Star size={14} fill={isWatched ? 'var(--accent)' : 'none'} aria-hidden="true" />
            {isWatched ? t('spelers.popup.watching') : t('spelers.popup.watch')}
          </button>
        )}
        <button type="button" onClick={onToggleCompare} aria-pressed={inCompare} disabled={!inCompare && compareFull}
          style={{ ...actionBtn(inCompare), opacity: !inCompare && compareFull ? 0.5 : 1 }}>
          <GitCompare size={14} aria-hidden="true" />
          {inCompare ? t('spelers.popup.inCompare') : t('spelers.popup.addCompare')}
        </button>
      </div>

      <style>{`
        .spl-popup-tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: 14px; }
        @media (max-width: 480px) {
          .spl-popup-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .spl-popup-minutes, .spl-popup-logo { display: none; }
          .spl-popup-table th, .spl-popup-table td { padding-left: 2px !important; padding-right: 2px !important; }
        }
      `}</style>
      <div className="spl-popup-tiles">
        {totals.map(([label, value]) => (
          <div key={label} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '6px 4px', textAlign: 'center' }}>
            <div style={{ color: 'var(--text-1)', fontWeight: 800, fontSize: '15px' }}>{value}</div>
            <div style={{ color: 'var(--text-3)', fontSize: '9px', textTransform: 'uppercase', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
          </div>
        ))}
      </div>

      <SheetSection title={t('spelers.popup.nextFixtures')}>
        <UpcomingFixtures club={player.club} fromGw={fromGw} count={5} ratings={ratings} homeAdvantage={homeAdvantage} />
      </SheetSection>

      {loading && (
        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-2)', fontSize: '13px', marginTop: '16px' }}>
          <Loader2 size={16} className="fdr-spin" aria-hidden="true" /> {t('spelers.popup.loading')}
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '16px', color: 'var(--text-1)', fontSize: '13px' }}>
          <AlertCircle size={16} color="var(--danger)" aria-hidden="true" /> {t('spelers.popup.error')}
        </div>
      )}

      {detail && (
        <>
          <SheetSection title={t('spelers.popup.pointsPerGw')}>
            {detail.matches.length > 0
              ? <PointsChart matches={detail.matches} gw={gw} t={t} />
              : <p style={sheetEmptyTextStyle}>{t('spelers.popup.noMatches')}</p>}
          </SheetSection>

          {detail.matches.length > 0 && (
            <SheetSection title={t('spelers.popup.matches')}>
              <MatchTable matches={[...detail.matches].reverse()} t={t} />
              <p style={{ ...sheetEmptyTextStyle, marginTop: '6px', fontSize: '11px' }}>{t('spelers.popup.bonusNote')}</p>
            </SheetSection>
          )}

          <SheetSection title={t('spelers.popup.previousSeasons')}>
            {detail.seasons.length === 0 ? (
              <p style={sheetEmptyTextStyle}>{t('spelers.popup.noPreviousSeasons')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ ...thStyle, textAlign: 'left' }}>{t('spelers.popup.season')}</th>
                      <th scope="col" style={thStyle}>{t('spelers.col.club')}</th>
                      <th scope="col" style={thStyle}>{t('spelers.popup.pointsShort')}</th>
                      <th scope="col" style={thStyle}>{t('spelers.col.mp')}</th>
                      <th scope="col" style={thStyle}>Min</th>
                      <th scope="col" style={thStyle}>G</th>
                      <th scope="col" style={thStyle}>A</th>
                      <th scope="col" style={thStyle}>CS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.seasons.map(s => (
                      <tr key={s.season}>
                        <td style={{ ...tdStyle, textAlign: 'left' }}>{s.season}</td>
                        <td style={tdStyle}>{s.club}</td>
                        <td style={{ ...tdStyle, fontWeight: 800 }}>{s.pts}</td>
                        <td style={tdStyle}>{s.mp}</td>
                        <td style={tdStyle}>{s.min}</td>
                        <td style={tdStyle}>{s.g}</td>
                        <td style={tdStyle}>{s.a}</td>
                        <td style={tdStyle}>{s.cs}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SheetSection>
        </>
      )}
    </Sheet>
  );
}
