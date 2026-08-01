// Gedeelde tooltip-infrastructuur voor fixture-cellen: hover op desktop, tap-toggle + tap-buiten-sluit
// op mobiel. Gebruikt door zowel FDRTab (FixtureCell) als WatchlistTab (via MiniFixtureBadge) voor de
// grijze "/"-postponed-indicator en de "*"-mogelijk-uitgesteld-tooltip.

import { useState, useRef, useId, useCallback, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';

// Gedeelde interactielogica voor fixture-tooltips: hover op desktop, tap-toggle + tap-buiten-sluit op mobiel.
// Positie wordt in viewport-coördinaten bijgehouden zodat de bubble (via een portal) nooit wordt
// afgesneden door de horizontaal scrollende tabellen.
function useTooltipTrigger() {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [clickOpen, setClickOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const triggerRef = useRef(null);
  const bubbleRef = useRef(null);
  const tooltipId = useId();
  const visible = hoverOpen || clickOpen;

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const placeBelow = rect.top < 70;
    const left = Math.min(Math.max(rect.left + rect.width / 2, 100), window.innerWidth - 100);
    setCoords({
      left,
      y: placeBelow ? rect.bottom + 8 : rect.top - 8,
      placement: placeBelow ? 'bottom' : 'top',
    });
  }, []);

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    const handleReposition = () => updatePosition();
    const handlePointerDown = (e) => {
      if (triggerRef.current?.contains(e.target) || bubbleRef.current?.contains(e.target)) return;
      setClickOpen(false);
    };
    window.addEventListener('scroll', handleReposition, true);
    window.addEventListener('resize', handleReposition);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('scroll', handleReposition, true);
      window.removeEventListener('resize', handleReposition);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [visible, updatePosition]);

  const triggerProps = {
    ref: triggerRef,
    tabIndex: 0,
    'aria-describedby': visible ? tooltipId : undefined,
    onPointerEnter: (e) => { if (e.pointerType === 'mouse') { updatePosition(); setHoverOpen(true); } },
    onPointerLeave: (e) => { if (e.pointerType === 'mouse') setHoverOpen(false); },
    onFocus: (e) => { if (e.target.matches(':focus-visible')) { updatePosition(); setHoverOpen(true); } },
    onBlur: () => setHoverOpen(false),
    onClick: (e) => { e.stopPropagation(); updatePosition(); setClickOpen(o => !o); },
  };

  return { triggerProps, bubbleRef, tooltipId, visible, coords };
}

function TooltipBubble({ id, bubbleRef, coords, text }) {
  return createPortal(
    <div
      id={id}
      ref={bubbleRef}
      role="tooltip"
      className={`fdr-postponed-tooltip fdr-postponed-tooltip--${coords.placement}`}
      style={{
        top: coords.y,
        left: coords.left,
        transform: `translate(-50%, ${coords.placement === 'top' ? '-100%' : '0'})`,
      }}
    >
      {text}
    </div>,
    document.body
  );
}

// Maakt van "as" (td/span) een klikbare/hoverbare tooltip-trigger over zijn volledige oppervlak,
// zowel voor het grijze "/"-vakje (POSTPONED) als voor mogelijk uitgestelde cellen die hun eigen
// FDR-kleur behouden (POSSIBLY_POSTPONED) — de popup verschijnt bij een klik/tap/hover eender waar op de cel.
export const TooltipTrigger = memo(function TooltipTrigger({ as: Tag, text, style, className, children }) {
  const { triggerProps, bubbleRef, tooltipId, visible, coords } = useTooltipTrigger();
  return (
    <>
      <Tag {...triggerProps} className={className} style={style} aria-label={text}>
        {children}
      </Tag>
      {visible && coords && <TooltipBubble id={tooltipId} bubbleRef={bubbleRef} coords={coords} text={text} />}
    </>
  );
});

// Grijs "/"-vakje voor zeker uitgestelde wedstrijden (POSTPONED).
export const PostponedIndicator = memo(function PostponedIndicator({ as: Tag, text, style, className }) {
  return (
    <TooltipTrigger as={Tag} text={text} style={style} className={className}>
      /
    </TooltipTrigger>
  );
});
