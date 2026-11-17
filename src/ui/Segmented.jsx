// Segmented control (spec §5.4). Vervangt alle pill- en chipgroepen met één keuze.
// options: [{ value, label, icon?, title?, disabled? }]. role="radiogroup", pijltjestoetsen werken.
// Op gsm scrollt de rij horizontaal binnen zichzelf (met een rand-fade), nooit naar 2 regels.
import { useCallback, useEffect, useRef, useState } from 'react';
import './Segmented.css';

export default function Segmented({ options, value, onChange, ariaLabel, size, className = '' }) {
  const wrapRef = useRef(null);
  const [overflow, setOverflow] = useState({ over: false, end: false });

  const measure = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const over = el.scrollWidth > el.clientWidth + 1;
    const end = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    setOverflow(prev => (prev.over === over && prev.end === end ? prev : { over, end }));
  }, []);

  useEffect(() => {
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [measure, options.length]);

  const enabled = options.filter(o => !o.disabled);
  const onKeyDown = (e) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const idx = enabled.findIndex(o => o.value === value);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % enabled.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + enabled.length) % enabled.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = enabled.length - 1;
    const target = enabled[next];
    if (!target) return;
    onChange(target.value);
    const btn = wrapRef.current?.querySelector(`[data-value="${CSS.escape(String(target.value))}"]`);
    btn?.focus();
  };

  return (
    <div
      ref={wrapRef}
      onScroll={measure}
      className={`ui-seg-wrap${overflow.over ? ' is-overflowing' : ''}${overflow.end ? ' is-end' : ''} ${className}`}
    >
      <div role="radiogroup" aria-label={ariaLabel} className={`ui-seg${size === 'sm' ? ' ui-seg--sm' : ''}`} onKeyDown={onKeyDown}>
        {options.map(o => {
          const checked = o.value === value;
          const Icon = o.icon;
          return (
            <button
              key={String(o.value)}
              type="button"
              role="radio"
              aria-checked={checked}
              data-value={String(o.value)}
              tabIndex={checked || (value == null && o === enabled[0]) ? 0 : -1}
              disabled={o.disabled}
              title={o.title}
              aria-label={o.ariaLabel}
              className="ui-seg__item"
              onClick={() => { if (!checked) onChange(o.value); }}
            >
              {Icon && <Icon aria-hidden="true" strokeWidth={1.75} />}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
