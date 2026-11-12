// DataTable (spec §5.6). Echte <table> met <th scope="col">, aria-sort, sticky kop en sticky eerste
// kolom, cijfers rechts in monospace, volledige rij klikbaar.
//
// columns: [{ key, label, title?, num?, align?, sortable?, sticky?, stickyEdge?, className?, width?,
//             rowHeader?, render(row, index) -> node, cellClass?(row, index) -> string }]
// sort: { key, dir: 'asc'|'desc' }, onSort(key)
//
// Sticky kop: werkt t.o.v. de pagina zolang de tabel in de breedte past. Past hij niet, dan scrolt de
// tabel horizontaal binnen zijn eigen zone (met een rand-fade rechts) en plakt de kop binnen die zone.
// Een element met overflow-x: auto wordt namelijk zelf de sticky-container; daarom schakelen we het
// scrollen pas in wanneer het echt nodig is (gemeten met een ResizeObserver).
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import SkeletonRows from './Skeleton';
import './DataTable.css';

export function useOverflow(dep) {
  const ref = useRef(null);
  const [state, setState] = useState({ over: false, end: true, scrolled: false });
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const inner = el.firstElementChild;
    const over = (inner?.scrollWidth ?? el.scrollWidth) > el.clientWidth + 1;
    const end = !over || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    const scrolled = over && el.scrollLeft > 0;
    setState(prev => (prev.over === over && prev.end === end && prev.scrolled === scrolled ? prev : { over, end, scrolled }));
  }, []);
  useEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    if (ref.current) {
      ro.observe(ref.current);
      if (ref.current.firstElementChild) ro.observe(ref.current.firstElementChild);
    }
    return () => ro.disconnect();
  }, [measure, dep]);
  const className = `${state.over ? ' is-overflowing' : ''}${state.end ? ' is-end' : ''}${state.scrolled ? ' is-scrolled' : ''}`;
  return { ref, onScroll: measure, className };
}

function cellClasses(col, extra) {
  return [
    col.num && 'is-num', col.align === 'center' && 'is-center', col.sticky && 'is-sticky',
    col.stickyEdge && 'is-sticky-edge', col.className, extra,
  ].filter(Boolean).join(' ') || undefined;
}

export default function DataTable({
  columns, rows, rowKey, onRowClick, rowLabel, rowClassName, sort, onSort, loading, skeletonRows = 8,
  empty, caption, footer, bleed = false, groupBy, renderGroup, ariaLabel, className = '',
}) {
  const overflow = useOverflow(`${rows?.length ?? 0}-${columns.length}-${loading ? 1 : 0}`);

  if (loading) return <SkeletonRows rows={skeletonRows} />;

  const renderRow = (row, index) => {
    const clickable = Boolean(onRowClick);
    return (
      <tr
        key={rowKey(row, index)}
        className={[clickable && 'is-clickable', rowClassName?.(row, index)].filter(Boolean).join(' ') || undefined}
        onClick={clickable ? (e) => {
          // Klikken op een knop/link in de rij (ster, vinkje) opent de rij niet.
          if (e.target.closest('button, a, input, select, label')) return;
          onRowClick(row, index);
        } : undefined}
      >
        {columns.map((col, ci) => {
          const content = col.render ? col.render(row, index) : row[col.key];
          const missing = content == null || content === '' || content === false;
          const extra = [missing && 'is-missing', col.cellClass?.(row, index)].filter(Boolean).join(' ');
          const Tag = col.rowHeader ? 'th' : 'td';
          return (
            <Tag key={col.key} scope={col.rowHeader ? 'row' : undefined} className={cellClasses(col, extra)} style={col.style}>
              {missing ? (col.blankWhenEmpty ? null : '—') : content}
              {/* Toetsenbordtoegang tot de klikbare rij: een knop die pas zichtbaar wordt bij focus. */}
              {clickable && ci === (rowLabelColumnIndex(columns)) && rowLabel && (
                <button type="button" className="ui-sr-only-focusable" onClick={() => onRowClick(row, index)}>
                  {rowLabel(row)}
                </button>
              )}
            </Tag>
          );
        })}
      </tr>
    );
  };

  let body;
  if (groupBy) {
    const groups = [];
    rows.forEach((row, i) => {
      const g = groupBy(row);
      const last = groups[groups.length - 1];
      if (!last || last.key !== g) groups.push({ key: g, items: [{ row, i }] });
      else last.items.push({ row, i });
    });
    body = groups.map(g => (
      <Fragment key={`g-${g.key}`}>
        <tr className="is-group">
          <td colSpan={columns.length}>{renderGroup ? renderGroup(g.key, g.items.map(x => x.row)) : g.key}</td>
        </tr>
        {g.items.map(({ row, i }) => renderRow(row, i))}
      </Fragment>
    ));
  } else {
    body = rows.map(renderRow);
  }

  return (
    <>
      <div
        ref={overflow.ref}
        onScroll={overflow.onScroll}
        className={`ui-table-scroll${overflow.className}${bleed ? ' is-bleed' : ''} ${className}`}
      >
        <table className="ui-table" aria-label={ariaLabel}>
          {caption && <caption className="ui-sr-only">{caption}</caption>}
          <thead>
            <tr>
              {columns.map(col => {
                const sorted = sort?.key === col.key;
                const ariaSort = col.sortable ? (sorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none') : undefined;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={ariaSort}
                    title={col.title}
                    className={cellClasses(col, sorted ? 'is-sorted' : '')}
                    style={{ width: col.width, ...(col.headStyle || {}) }}
                  >
                    {col.sortable && onSort ? (
                      <button type="button" className="ui-th-sort" onClick={() => onSort(col.key)} title={col.title}>
                        {col.label}
                        <span className={`ui-th-sort__arrow${sorted ? '' : ' ui-th-sort__arrow--idle'}`} aria-hidden="true">
                          {sorted ? (sort.dir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    ) : col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>{body}</tbody>
        </table>
      </div>
      {rows.length === 0 && empty}
      {footer && <div className="ui-table-footer">{footer}</div>}
    </>
  );
}

// De verborgen "open"-knop komt in de kolom met de naam (rowHeader of de eerste sticky kolom).
function rowLabelColumnIndex(columns) {
  const i = columns.findIndex(c => c.rowHeader || c.sticky);
  return i === -1 ? 0 : i;
}
