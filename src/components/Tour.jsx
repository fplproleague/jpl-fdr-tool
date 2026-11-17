// Rondleiding voor nieuwe bezoekers: het welkomstkader (met taalkeuze) en de stappen over de echte
// pagina. De lijst met stappen en het rekenwerk staan in src/tour.js, de teksten in src/i18n.js (tour.*).
//
// useTour houdt bij wat er open is en springt per stap naar de juiste tab; FDRTool.jsx toont
// <TourWelcome> en <TourOverlay> en geeft het "?"-knopje in de topbalk door aan useTour().start.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import Button from '../ui/Button';
import Segmented from '../ui/Segmented';
import {
  MOBILE_QUERY, hasSeenTour, installPlatform, markTourSeen, placeCard, tourSteps,
} from '../tour';
import './Tour.css';

// Na hoeveel tijd het welkomstkader verschijnt bij een eerste bezoek (de pagina staat dan al).
const WELCOME_DELAY_MS = 1000;
// Hoelang een stap wacht op zijn onderdeel (een tab die nog laadt) voor het kaartje in het midden komt.
const TARGET_WAIT_MS = 1500;

// Chrome en Edge (Android, Windows) melden met 'beforeinstallprompt' dat de site rechtstreeks als app
// kan worden geïnstalleerd. Dat bericht komt vroeg en maar één keer, dus het luisteren begint al bij het
// laden van dit bestand. Geen preventDefault: de eigen installatiemelding van de browser blijft zoals ze
// was. Safari (iPhone) kent dit niet: daar toont de stap de uitleg via de deelknop.
let installEvent = null;
const installListeners = new Set();
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    installEvent = e;
    installListeners.forEach(fn => fn());
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    installListeners.forEach(fn => fn());
  });
}

function useInstallPrompt() {
  const [available, setAvailable] = useState(() => Boolean(installEvent));
  useEffect(() => {
    const update = () => setAvailable(Boolean(installEvent));
    installListeners.add(update);
    return () => { installListeners.delete(update); };
  }, []);
  const install = useCallback(async () => {
    const event = installEvent;
    if (!event) return;
    installEvent = null;
    setAvailable(false);
    try { await event.prompt(); } catch { /* de browser weigerde: de uitleg blijft staan */ }
  }, []);
  return [available, install];
}

function getStorage() {
  try { return window.localStorage ?? null; } catch { return null; }
}

function isStandalone() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  } catch {
    return false;
  }
}

function isMobileView() {
  try { return window.matchMedia(MOBILE_QUERY).matches; } catch { return false; }
}

// --- Toestand ---------------------------------------------------------------------------------------
// blocked = er staat iets anders open (een spelers- of clubkaart): het welkomstkader wacht dan.
export function useTour({ activeTab, navigateToTab, blocked = false }) {
  const [mode, setMode] = useState(null); // null | 'welcome' | 'tour'
  const [index, setIndex] = useState(0);
  const [steps, setSteps] = useState([]);
  const startTabRef = useRef(null);

  // Eerste bezoek ooit: na een seconde het welkomstkader, één keer.
  useEffect(() => {
    if (mode !== null || blocked || typeof window === 'undefined') return undefined;
    if (hasSeenTour(getStorage())) return undefined;
    const timer = setTimeout(() => setMode('welcome'), WELCOME_DELAY_MS);
    return () => clearTimeout(timer);
  }, [mode, blocked]);

  const start = useCallback(() => {
    markTourSeen(getStorage());
    const platform = typeof navigator === 'undefined' ? 'desktop' : installPlatform(navigator.userAgent, navigator.maxTouchPoints);
    setSteps(tourSteps({ mobile: isMobileView(), standalone: isStandalone(), platform }));
    startTabRef.current = activeTab;
    setIndex(0);
    setMode('tour');
  }, [activeTab]);

  const dismiss = useCallback(() => {
    markTourSeen(getStorage());
    setMode(null);
  }, []);

  const close = useCallback(() => {
    setMode(null);
    const back = startTabRef.current;
    startTabRef.current = null;
    if (back && back !== activeTab) navigateToTab(back);
  }, [activeTab, navigateToTab]);

  const step = mode === 'tour' ? steps[index] ?? null : null;

  // Elke stap speelt op zijn eigen tab.
  useEffect(() => {
    if (step?.tab && step.tab !== activeTab) navigateToTab(step.tab);
  }, [step, activeTab, navigateToTab]);

  const next = useCallback(() => {
    if (index >= steps.length - 1) close();
    else setIndex(i => i + 1);
  }, [index, steps.length, close]);
  const prev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);

  return { mode, step, index, count: steps.length, start, dismiss, close, next, prev };
}

// --- Welkomstkader ----------------------------------------------------------------------------------
// Klein kader onderaan (rechts op desktop), zonder de pagina te verduisteren. Bovenaan de taalkeuze:
// een eerste bezoek staat standaard in het Nederlands, en een Franstalige of Engelstalige bezoeker
// moet de rondleiding meteen in zijn eigen taal kunnen volgen.
export function TourWelcome({ t, language, languages, onChangeLanguage, onStart, onDismiss }) {
  // Bewust geen focus naar het kader: het verschijnt na een seconde, en wie dan al in een zoekveld typt,
  // mag daar niet uit gehaald worden. Escape sluit het wel als de focus erin staat.
  const onKeyDown = (e) => { if (e.key === 'Escape') onDismiss(); };
  const languageOptions = languages.map(l => ({ value: l, label: t(`tour.language.${l}`) }));
  return (
    <div className="tour-welcome" role="dialog" aria-labelledby="tour-welcome-title" aria-describedby="tour-welcome-text" onKeyDown={onKeyDown}>
      <button type="button" className="tour-close" onClick={onDismiss} aria-label={t('tour.welcome.closeAria')}>
        <X aria-hidden="true" strokeWidth={1.75} />
      </button>
      <div className="tour-welcome__lang">
        <span className="tour-welcome__langlabel" id="tour-welcome-lang">{t('tour.welcome.language')}</span>
        <Segmented size="sm" options={languageOptions} value={language} onChange={onChangeLanguage} ariaLabel={t('tour.welcome.language')} />
      </div>
      <h2 id="tour-welcome-title" className="tour-card__title">{t('tour.welcome.title')}</h2>
      <p id="tour-welcome-text" className="tour-card__body">{t('tour.welcome.body')}</p>
      <div className="tour-card__actions">
        <Button variant="ghost" onClick={onDismiss}>{t('tour.welcome.no')}</Button>
        <Button variant="primary" onClick={onStart}>{t('tour.welcome.start')}</Button>
      </div>
      <p className="tour-welcome__hint">{t('tour.welcome.hint')}</p>
    </div>
  );
}

// --- De stappen -------------------------------------------------------------------------------------
// "@fpl_proleague" in een tekst wordt een link naar het X-account (feedback eigenaar). De teksten zelf
// blijven gewone tekst in src/i18n.js.
const X_HANDLE = '@fpl_proleague';
const X_URL = 'https://x.com/fpl_proleague';
function withXLink(text) {
  const parts = text.split(X_HANDLE);
  if (parts.length === 1) return text;
  return parts.flatMap((part, i) => (i === 0 ? [part] : [
    <a key={i} href={X_URL} target="_blank" rel="noopener noreferrer" className="tour-card__link">{X_HANDLE}</a>,
    part,
  ]));
}

function findTarget(selectors) {
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

// Haalt het onderdeel in beeld, tenzij het in de vaste topbalk of onderbalk zit (die staan er altijd).
function bringIntoView(el, maxHeight = null) {
  if (el.closest('.ui-topbar, .ui-bottomnav')) return;
  const r = el.getBoundingClientRect();
  const topbar = document.querySelector('.ui-topbar')?.getBoundingClientRect().height ?? 0;
  const roomTop = topbar + 16;
  // Bij een groot onderdeel (maxHeight) telt enkel het stuk dat oplicht: staat dat al in beeld, dan
  // blijft de pagina staan (zo blijven bv. de knoppen boven de FDR-tabel zichtbaar).
  const bottom = maxHeight ? Math.min(r.bottom, r.top + maxHeight) : r.bottom;
  if (r.top >= roomTop && bottom <= window.innerHeight - 16) return;
  window.scrollTo({ top: Math.max(0, window.scrollY + r.top - roomTop), behavior: 'auto' });
}

function rectOf(el, maxHeight = null) {
  const r = el.getBoundingClientRect();
  const pad = 6;
  const top = Math.max(0, r.top - pad);
  const left = Math.max(0, r.left - pad);
  const fullBottom = maxHeight ? Math.min(r.bottom, r.top + maxHeight) : r.bottom;
  const bottom = Math.min(window.innerHeight, fullBottom + pad);
  const right = Math.min(window.innerWidth, r.right + pad);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top), bottom, right };
}

export function TourOverlay({ t, step, index, count, onNext, onPrev, onClose }) {
  const [rect, setRect] = useState(null);
  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState(null);
  const cardRef = useRef(null);
  const targetRef = useRef(null);
  const [installAvailable, install] = useInstallPrompt();

  // Zoek het onderdeel van deze stap. Een tab die net opent, heeft soms even nodig: tot anderhalve
  // seconde opnieuw kijken, daarna het kaartje in het midden.
  useEffect(() => {
    setReady(false);
    setRect(null);
    targetRef.current = null;
    if (!step) return undefined;
    let frame = 0;
    const startedAt = performance.now();
    const look = () => {
      const el = step.target.length ? findTarget(step.target) : null;
      if (el) {
        bringIntoView(el, step.maxHeight);
        targetRef.current = el;
        setRect(rectOf(el, step.maxHeight));
        setReady(true);
        return;
      }
      if (!step.target.length || performance.now() - startedAt > TARGET_WAIT_MS) {
        setReady(true);
        return;
      }
      frame = requestAnimationFrame(look);
    };
    // Eén frame wachten: de tabwissel van deze stap moet eerst getekend zijn.
    frame = requestAnimationFrame(look);
    return () => cancelAnimationFrame(frame);
  }, [step]);

  // Volg het onderdeel bij scrollen, draaien van de gsm of een tab die verder laadt.
  useEffect(() => {
    if (!ready) return undefined;
    const update = () => {
      const el = targetRef.current;
      if (el && document.contains(el)) setRect(rectOf(el, step?.maxHeight));
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, { passive: true });
    let ro = null;
    if (typeof ResizeObserver !== 'undefined' && targetRef.current) {
      ro = new ResizeObserver(update);
      ro.observe(targetRef.current);
    }
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update);
      ro?.disconnect();
    };
  }, [ready, step]);

  // Plaats het kaartje pas als het gemeten is (voor die tijd is het onzichtbaar).
  useLayoutEffect(() => {
    if (!ready || !cardRef.current) return;
    const card = cardRef.current.getBoundingClientRect();
    setPos(placeCard(rect, { width: card.width, height: card.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [ready, rect, installAvailable, step]);

  // Focus op het kaartje bij elke stap, zodat Enter/pijltjes/Escape meteen werken en een schermlezer
  // de nieuwe tekst voorleest.
  useEffect(() => {
    if (ready) cardRef.current?.focus({ preventScroll: true });
  }, [ready, step]);

  if (!step) return null;
  const last = index === count - 1;
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onNext(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); onPrev(); }
  };
  const paragraphs = t(step.bodyKey).split('\n').filter(Boolean);

  return (
    <div className="tour-layer">
      {/* Vangt klikken op de pagina tijdens de rondleiding, zodat er niets per ongeluk verandert. */}
      <div className={`tour-catcher${rect ? '' : ' is-dim'}`} aria-hidden="true" />
      {rect && (
        <div
          className="tour-spot"
          aria-hidden="true"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      )}
      <div
        ref={cardRef}
        className={`tour-card${pos ? '' : ' is-measuring'}`}
        style={pos ? { top: pos.top, left: pos.left } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-body"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <button type="button" className="tour-close" onClick={onClose} aria-label={t('tour.closeAria')}>
          <X aria-hidden="true" strokeWidth={1.75} />
        </button>
        <p className="tour-card__count num">{t('tour.count', { n: index + 1, total: count })}</p>
        <h2 id="tour-step-title" className="tour-card__title">{t(step.titleKey)}</h2>
        <div id="tour-step-body" className="tour-card__body" aria-live="polite">
          {paragraphs.map((text, i) => <p key={i}>{withXLink(text)}</p>)}
        </div>
        {step.install && installAvailable && (
          <Button variant="secondary" icon={Download} className="tour-card__install" onClick={install}>
            {t('tour.install')}
          </Button>
        )}
        <div className="tour-card__actions">
          {index > 0 && (
            <Button variant="ghost" icon={ChevronLeft} onClick={onPrev}>{t('tour.prev')}</Button>
          )}
          <Button variant="primary" onClick={onNext}>
            {last ? t('tour.finish') : t('tour.next')}
            {!last && <ChevronRight aria-hidden="true" strokeWidth={1.75} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
