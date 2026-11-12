// Gedeeld frame voor de detailpanelen (speler, club, ratings, filters, vergelijken, spelerskiezer).
// Eén plek voor de dialoog-semantiek en het focusgedrag.
//
// Sinds de rework (spec §5.10): op desktop een LADE RECHTS (480px, volle hoogte) zodat de tabel ernaast
// zichtbaar blijft; op gsm een BOTTOM SHEET (max 88vh) met een greep bovenaan, te sluiten door naar
// beneden te vegen, met Escape of met de terugknop (die laatste regelt FDRTool via de URL).
//
// Stapelen kan niet, en dat wordt hier niet afgedwongen maar in FDRTool.jsx: die houdt één sheet-state
// bij, dus een sheet die vanuit een sheet opent, vervangt de vorige.
import { useCallback, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import '../ui/Button.css';
import '../ui/Sheet.css';

export function SheetSection({ title, children, action }) {
  return (
    <section className="ui-sheet-section">
      {(title || action) && (
        <div className="ui-sheet-section__head">
          {title && <h3 className="label ui-sheet-section__title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export const sheetEmptyTextStyle = { color: 'var(--text-3)', fontSize: 'var(--fs-meta)', margin: 0 };

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Gedeeld gedrag voor elke overlay (Sheet en het "Meer"-menu): focus erin bij openen en terug naar de
// opener bij sluiten, focus-trap, Escape, scroll-lock op de pagina en vegen-om-te-sluiten op gsm.
export function useOverlayBehavior({ onClose, panelRef }) {
  useEffect(() => {
    const opener = document.activeElement;
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus({ preventScroll: true });
    };
  }, [panelRef]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
      if (items.length === 0) { e.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, panelRef]);

  // Scroll-lock: anders schuift de lijst áchter de sheet mee en ben je bij het sluiten je plek kwijt.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  // Vegen naar beneden om te sluiten (enkel op gsm, waar het paneel een bottom sheet is). Start enkel
  // wanneer de inhoud bovenaan staat, zodat gewoon scrollen in de sheet niet per ongeluk sluit.
  const drag = useRef(null);
  const onTouchStart = useCallback((e) => {
    const panel = panelRef.current;
    if (!panel || window.matchMedia('(min-width: 900px)').matches) return;
    const scroller = panel.querySelector('.ui-sheet__body') ?? panel;
    if (scroller.scrollTop > 0 && !e.target.closest('.ui-sheet__grip, .ui-sheet__head')) return;
    drag.current = { y: e.touches[0].clientY, dy: 0 };
  }, [panelRef]);
  const onTouchMove = useCallback((e) => {
    if (!drag.current || !panelRef.current) return;
    const dy = Math.max(0, e.touches[0].clientY - drag.current.y);
    drag.current.dy = dy;
    panelRef.current.style.transform = dy ? `translateY(${dy}px)` : '';
  }, [panelRef]);
  const onTouchEnd = useCallback(() => {
    if (!drag.current || !panelRef.current) return;
    const { dy } = drag.current;
    drag.current = null;
    if (dy > 90) { onClose(); return; }
    panelRef.current.style.transform = '';
  }, [onClose, panelRef]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}

// header: vrije inhoud links van de sluitknop (titel, foto, ...). title: eenvoudige titel als string.
// width: breedte van de lade op desktop (standaard 480px).
export default function Sheet({ titleId, title, closeLabel, onClose, header, children, footer, width, maxWidth }) {
  const panelRef = useRef(null);
  const touch = useOverlayBehavior({ onClose, panelRef });
  const drawerWidth = width ?? (maxWidth && parseInt(maxWidth, 10) > 480 ? maxWidth : undefined);

  return (
    <div className="ui-sheet-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ui-sheet"
        style={drawerWidth ? { '--sheet-w': drawerWidth } : undefined}
        onClick={e => e.stopPropagation()}
        {...touch}
      >
        <div className="ui-sheet__grip" aria-hidden="true" />
        <div className="ui-sheet__head">
          {header ?? <h2 id={titleId} className="ui-sheet__title">{title}</h2>}
          <button type="button" onClick={onClose} aria-label={closeLabel} className="ui-btn ui-btn--icon ui-btn--bare ui-sheet__close">
            <X aria-hidden="true" strokeWidth={1.75} />
          </button>
        </div>
        <div className="ui-sheet__body">{children}</div>
        {footer && <div className="ui-sheet__footer">{footer}</div>}
      </div>
    </div>
  );
}
