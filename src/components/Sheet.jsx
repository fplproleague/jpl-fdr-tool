// Gedeeld frame voor de detailpanelen (speler en club). Zat eerst in PlayerSheet.jsx; toen de
// club-sheet erbij kwam is het hieruit gelicht, zodat er maar één plek is waar de dialoog-semantiek en
// het focusgedrag staan — twee half-gelijke kopieën lopen gegarandeerd uit elkaar.
//
// Op desktop een gecentreerde modal (zelfde patroon als de info-modal in FDRTool.jsx), op mobiel een
// bottom sheet — zie .fdr-sheet in het <style>-blok van FDRTool.jsx.
//
// Stapelen kan niet, en dat wordt hier niet afgedwongen maar in FDRTool.jsx: die houdt één sheet-state
// bij, dus een sheet die vanuit een sheet opent, vervangt de vorige. Op een telefoon zijn drie lagen
// diep onbruikbaar.
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export function SheetSection({ title, children }) {
  return (
    <section style={{ marginTop: '16px' }}>
      <h4 className="fdr-title" style={{
        color: '#8F79AD', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.06em',
        margin: '0 0 8px', fontWeight: 800,
      }}>
        {title}
      </h4>
      {children}
    </section>
  );
}

export const sheetEmptyTextStyle = { color: '#8F79AD', fontSize: '12px', margin: 0 };

export default function Sheet({ titleId, closeLabel, onClose, header, children }) {
  const dialogRef = useRef(null);

  // Focus naar de sheet bij openen en terug naar het element dat 'm opende bij sluiten. Zonder dit
  // staat de toetsenbordfocus na het openen nog achter de sheet, en na het sluiten bovenaan de pagina
  // i.p.v. bij de rij waar de gebruiker gebleven was.
  useEffect(() => {
    const opener = document.activeElement;
    dialogRef.current?.focus();
    return () => {
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fdr-sheet-overlay"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 70,
        display: 'flex', justifyContent: 'center',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fdr-sheet"
        onClick={e => e.stopPropagation()}
        style={{
          background: '#3D1E5C', border: '1px solid rgba(255,255,255,0.1)',
          width: '100%', maxWidth: '460px', maxHeight: '86vh', overflowY: 'auto',
          padding: '20px', outline: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          {header}
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="fdr-icon-btn"
            style={{
              background: 'none', border: 'none', color: '#C9B8E0', cursor: 'pointer',
              flexShrink: 0, padding: '4px', display: 'inline-flex',
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
