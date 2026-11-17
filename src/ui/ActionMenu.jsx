// Klein actiemenu (het "⋯"-menu, spec §7.3): opent onder (of boven) de knop die het aanroept, met
// rijen van 36px (touch 44px). Sluit bij Escape, een klik ernaast, scrollen of het formaat wijzigen.
// Pijltjestoetsen bewegen de focus. Het is een overlay, dus het mag de overlay-schaduw dragen.
//
// items: [{ key, label, onSelect, danger?, disabled? }]
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './ActionMenu.css';

const MENU_W = 232;

export default function ActionMenu({ anchor, items, onClose, label }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    if (!anchor || !menuRef.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const h = menuRef.current.offsetHeight;
    const left = Math.min(Math.max(8, anchor.right - MENU_W), vw - MENU_W - 8);
    const below = anchor.bottom + 4;
    const top = below + h > vh - 8 && anchor.top - h - 4 > 8 ? anchor.top - h - 4 : Math.min(below, vh - h - 8);
    setPos({ left, top });
  }, [anchor]);

  useEffect(() => {
    const first = menuRef.current?.querySelector('button:not([disabled])');
    first?.focus({ preventScroll: true });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const btns = [...(menuRef.current?.querySelectorAll('button:not([disabled])') ?? [])];
      if (btns.length === 0) return;
      const i = btns.indexOf(document.activeElement);
      let next = i;
      if (e.key === 'ArrowDown') next = (i + 1) % btns.length;
      if (e.key === 'ArrowUp') next = (i - 1 + btns.length) % btns.length;
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = btns.length - 1;
      btns[next].focus();
    };
    const onDown = (e) => { if (!menuRef.current?.contains(e.target)) onClose(); };
    const onScroll = (e) => { if (!menuRef.current?.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      aria-label={label}
      className="ui-menu"
      style={{ width: MENU_W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
    >
      {items.map(item => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          className={`ui-menu__item${item.danger ? ' is-danger' : ''}`}
          onClick={() => { onClose(); item.onSelect(); }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}
