// Spelerskiezer (spec §7.3): een Sheet met zoekveld, vaste positie, maximumprijs en sortering, en een
// tabel met foto, naam, club, prijs, punten, vorm en de volgende drie wedstrijden.
//
// De bron blijft de spelersdatabank (Google Sheet): onSelect krijgt exact hetzelfde object als
// PlayerSearchInput vandaag doorgeeft ({ name, teamCode, teamName, position, price }). Punten, vorm,
// ownership en de foto komen uit usePlayerIndex zodra /api/players geladen is; tot dan staan die
// kolommen op "—".
//
// Vulmodus (added !== null): de Team Planner houdt de kiezer open na een keuze en schuift door naar het
// volgende lege slot. Bovenaan staat dan wie je net koos en hoeveel plaatsen er nog vrij zijn; onderaan
// een knop "Klaar". switchablePositions zet de andere posities met een vrij slot aan.
//
// blockedReason(player) -> tekst of null: spelers die al in de selectie zitten of de clublimiet
// zouden breken, blijven zichtbaar (opacity .4) met de reden eronder, maar zijn niet te kiezen.
//
// Beschikbaarheid (spec B3): naast de naam staat geschorst/twijfel/1 kaart, en de schakelaar "Enkel
// beschikbare spelers" verbergt wie geschorst is.
import { useMemo, useState } from 'react';
import Sheet from '../components/Sheet';
import { MiniFixtureBadge } from '../components/MiniFixtureBadge';
import StarButton from './StarButton';
import { FIXTURES, GW_COUNT } from '../constants';
import usePlayerIndex, { normalizePlayerName } from '../data/usePlayerIndex';
import { PlayerFaceByName } from './PlayerFace';
import SearchField from './SearchField';
import Segmented from './Segmented';
import Select from './Select';
import DataTable from './DataTable';
import Button from './Button';
import EmptyState from './EmptyState';
import Switch from './Switch';
import { AvailabilityBadge } from './AvailabilityMark';
import { useAvailabilityLookup } from '../availabilityContext';
import { isAvailable } from '../availability';
import './PlayerPicker.css';

const POSITIONS = ['GK', 'DEF', 'MID', 'FWD'];
const PAGE_SIZE = 60;
const FORM_GWS = 5; // zelfde venster als de vormkolom op de Spelers-tab (spelers.js)

function sumLast(arr, gw, n) {
  if (!Array.isArray(arr)) return null;
  let total = 0;
  for (let i = Math.max(0, gw - n); i < gw; i++) total += arr[i] ?? 0;
  return total;
}

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia?.('(min-width: 900px) and (pointer: fine)').matches;

export default function PlayerPicker({
  t, onClose, onSelect, players, loading = false, position, blockedReason, budgetMax, gw, ratings, homeAdvantage,
  isWatched, onToggleWatch, switchablePositions = null, onSwitchPosition, added = null, emptyLeft = 0,
}) {
  const index = usePlayerIndex();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('pts');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [availableOnly, setAvailableOnly] = useState(false);
  const availability = useAvailabilityLookup();

  // Prijsopties per halve miljoen, plus "wat het budget toelaat" als standaard.
  const { priceOptions, defaultPrice } = useMemo(() => {
    const prices = players.filter(p => p.position === position && Number.isFinite(p.price)).map(p => p.price);
    const lo = prices.length ? Math.floor(Math.min(...prices) * 2) / 2 : 4;
    const hi = prices.length ? Math.ceil(Math.max(...prices) * 2) / 2 : 15;
    const opts = [{ value: 'all', label: t('picker.allPrices') }];
    // Een budget onder de goedkoopste speler (bv. een team dat al te duur is) filtert alles weg:
    // dan standaard alle prijzen tonen.
    const raw = Number.isFinite(budgetMax) ? Math.round(budgetMax * 10) / 10 : null;
    const budget = raw !== null && raw >= lo && raw < hi ? raw : null;
    if (budget !== null) {
      opts.push({ value: budget.toFixed(1), label: t('picker.budgetOption', { value: budget.toFixed(1) }) });
    }
    for (let v = hi - 0.5; v >= lo; v -= 0.5) {
      const key = v.toFixed(1);
      if (!opts.some(o => o.value === key)) opts.push({ value: key, label: t('picker.priceOption', { value: key }) });
    }
    return { priceOptions: opts, defaultPrice: budget !== null ? budget.toFixed(1) : 'all' };
  }, [players, position, budgetMax, t]);
  // Zolang je zelf geen maximumprijs koos, volgt de filter het resterende budget (dat zakt na elke
  // keuze in vulmodus).
  const [maxPriceChoice, setMaxPrice] = useState(null);
  const maxPrice = maxPriceChoice !== null && priceOptions.some(o => o.value === maxPriceChoice) ? maxPriceChoice : defaultPrice;

  const apiGw = index.data?.gw ?? 0;
  const rows = useMemo(() => {
    const q = normalizePlayerName(query);
    const cap = maxPrice === 'all' ? Infinity : Number(maxPrice) + 1e-9;
    const list = players
      .filter(p => p.position === position)
      .filter(p => !q || normalizePlayerName(p.name).includes(q))
      .filter(p => !Number.isFinite(p.price) || p.price <= cap)
      .map(p => ({ p, status: availability(p.name, p.teamCode) }))
      .filter(({ status }) => !availableOnly || isAvailable(status))
      .map(({ p, status }) => {
        const api = index.find(p.name, p.teamCode);
        return {
          player: p,
          status,
          pts: api?.pts ?? null,
          form: api ? sumLast(api.w?.pts, apiGw, FORM_GWS) : null,
          sel: api?.sel ?? null,
          reason: blockedReason?.(p) ?? null,
        };
      });
    const key = sort === 'price' ? (r => r.player.price) : (r => r[sort]);
    return list.sort((a, b) => {
      const va = key(a);
      const vb = key(b);
      if (va == null && vb == null) return (b.player.price ?? 0) - (a.player.price ?? 0);
      if (va == null) return 1;
      if (vb == null) return -1;
      return vb - va || (b.player.price ?? 0) - (a.player.price ?? 0) || a.player.name.localeCompare(b.player.name);
    });
  }, [players, position, query, maxPrice, sort, index, apiGw, blockedReason, availability, availableOnly]);

  const nextGws = [gw, gw + 1, gw + 2].filter(g => g >= 1 && g <= GW_COUNT);

  const columns = [
    {
      key: 'player', label: t('picker.col.player'), rowHeader: true, sticky: true, stickyEdge: true,
      render: ({ player, reason, status }) => (
        <span className="ui-picker__player">
          {onToggleWatch && (
            <StarButton
              className="ui-picker__star"
              active={!!isWatched?.(player.name, player.teamCode)}
              onClick={() => onToggleWatch({ name: player.name, teamCode: player.teamCode })}
              addLabel={t('watchlist.addAria', { name: player.name })}
              removeLabel={t('watchlist.removeAria', { name: player.name })}
            />
          )}
          <PlayerFaceByName name={player.name} clubCode={player.teamCode} size={32} />
          <span className="ui-picker__text">
            <span className="ui-picker__nameline">
              <span className="ui-picker__name">{player.name}</span>
              <AvailabilityBadge status={status} />
            </span>
            <span className={`ui-picker__sub${reason ? ' is-reason' : ''}`}>
              {reason ?? (
                <>
                  <span className="ui-picker__club-sm">{player.teamCode} · </span>
                  <span className="num">{Number.isFinite(player.price) ? `€${player.price.toFixed(1)}` : '—'}</span>
                </>
              )}
            </span>
          </span>
        </span>
      ),
    },
    { key: 'club', label: t('picker.col.club'), className: 'ui-picker__col-club', render: ({ player }) => player.teamCode },
    { key: 'price', label: t('picker.col.price'), num: true, className: 'ui-picker__col-price', render: ({ player }) => (Number.isFinite(player.price) ? `€${player.price.toFixed(1)}` : null) },
    { key: 'pts', label: t('picker.col.pts'), title: t('picker.sort.pts'), num: true, render: r => r.pts },
    { key: 'form', label: t('picker.col.form'), title: t('picker.col.formTitle', { count: FORM_GWS }), num: true, render: r => r.form },
    {
      key: 'next', label: t('picker.col.next'), className: 'ui-picker__col-next',
      render: ({ player }) => (
        <span className="ui-picker__fixtures">
          {nextGws.map(g => (
            <MiniFixtureBadge key={g} teamCode={player.teamCode} fixture={FIXTURES[player.teamCode]?.[g - 1]} gwNumber={g} ratings={ratings} homeAdvantage={homeAdvantage} />
          ))}
        </span>
      ),
    },
  ];

  const shown = rows.slice(0, limit);
  const titleId = 'ui-picker-title';

  return (
    <Sheet
      titleId={titleId} title={t(`picker.title.${position}`)} closeLabel={t('picker.close')} onClose={onClose} width="680px"
      footer={added && added.length > 0 ? <Button variant="primary" onClick={onClose}>{t('picker.done')}</Button> : null}
    >
      {added && (
        <p className="ui-picker__progress" role="status">
          {added.length > 0 && (
            <span className="ui-picker__added">{t('picker.added', { name: added[added.length - 1] })} </span>
          )}
          {t(emptyLeft === 1 ? 'picker.leftOne' : 'picker.leftMany', { count: emptyLeft })}
        </p>
      )}
      <div className="ui-picker__filters">
        <SearchField
          value={query}
          onChange={(v) => { setQuery(v); setLimit(PAGE_SIZE); }}
          placeholder={t('picker.search')}
          clearLabel={t('picker.clear')}
          autoFocus={isDesktop()}
          className="ui-picker__search"
        />
        <Segmented
          size="sm"
          ariaLabel={t('picker.positionAria')}
          value={position}
          onChange={(p) => { if (p !== position) onSwitchPosition?.(p); }}
          options={POSITIONS.map(p => ({ value: p, label: p, disabled: p !== position && !switchablePositions?.includes(p) }))}
        />
        <label className="ui-picker__select">
          <span className="label">{t('picker.maxPrice')}</span>
          <Select size="sm" value={maxPrice} onChange={(v) => { setMaxPrice(v); setLimit(PAGE_SIZE); }} options={priceOptions} />
        </label>
        <label className="ui-picker__select">
          <span className="label">{t('picker.sort')}</span>
          <Select
            size="sm"
            value={sort}
            onChange={setSort}
            options={['pts', 'form', 'sel', 'price'].map(k => ({ value: k, label: t(`picker.sort.${k}`) }))}
          />
        </label>
        <Switch
          className="ui-picker__avail"
          checked={availableOnly}
          onChange={(v) => { setAvailableOnly(v); setLimit(PAGE_SIZE); }}
          label={t('availability.filter')}
        />
      </div>
      <DataTable
        className="ui-picker__table"
        ariaLabel={t(`picker.title.${position}`)}
        columns={columns}
        rows={shown}
        loading={loading}
        rowKey={r => `${r.player.teamCode}-${r.player.name}`}
        rowClassName={r => (r.reason ? 'is-dimmed is-blocked' : undefined)}
        onRowClick={r => { if (!r.reason) { onSelect(r.player); setQuery(''); setLimit(PAGE_SIZE); } }}
        rowLabel={r => (r.reason ? `${r.player.name}: ${r.reason}` : t('picker.chooseAria', { name: r.player.name }))}
        empty={<EmptyState>{t('picker.empty')}</EmptyState>}
        footer={rows.length > limit ? (
          <Button variant="secondary" onClick={() => setLimit(l => l + PAGE_SIZE)}>
            {t('picker.more', { count: Math.min(PAGE_SIZE, rows.length - limit) })}
          </Button>
        ) : null}
      />
    </Sheet>
  );
}
